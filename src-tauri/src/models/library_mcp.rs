//! Persistence for the Library's **MCP servers**.
//!
//! SQLite is the canonical store. A separate write-through layer
//! (`crate::library::agent_mcp`) projects each server into the selected agents'
//! native config files; this module only owns the database rows.
//!
//! The canonical shape mirrors emdash's normalized `McpServer`
//! (`{ name, transport, command?, args?, url?, headers?, env?, providers[] }`)
//! plus an `enabled` flag and timestamps. List/object fields are stored as JSON
//! TEXT columns.

use std::collections::BTreeMap;

use anyhow::{Context, Result};
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::models::db;

/// Canonical MCP server — the normalized shape Grex uses internally and hands
/// to the write-through adapters.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    pub id: String,
    pub name: String,
    /// `"stdio"` or `"http"`.
    pub transport: String,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    /// Agent ids this server is synced to (e.g. `["claude", "codex"]`).
    #[serde(default)]
    pub providers: Vec<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Create/update payload from the frontend. `id` absent ⇒ insert.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerInput {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    pub transport: String,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub providers: Vec<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

/// Server names must be a single safe token (matches emdash's `[\w\-._]+`), so
/// they are valid TOML/JSON keys and shell-safe.
pub fn is_valid_server_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
}

fn row_to_server(row: &rusqlite::Row<'_>) -> rusqlite::Result<McpServer> {
    let args: String = row.get(4)?;
    let headers: String = row.get(6)?;
    let env: String = row.get(7)?;
    let providers: String = row.get(8)?;
    Ok(McpServer {
        id: row.get(0)?,
        name: row.get(1)?,
        transport: row.get(2)?,
        command: row.get(3)?,
        args: serde_json::from_str(&args).unwrap_or_default(),
        url: row.get(5)?,
        headers: serde_json::from_str(&headers).unwrap_or_default(),
        env: serde_json::from_str(&env).unwrap_or_default(),
        providers: serde_json::from_str(&providers).unwrap_or_default(),
        enabled: row.get::<_, i64>(9)? != 0,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

const SELECT_COLUMNS: &str = "id, name, transport, command, args, url, headers, env, providers, enabled, created_at, updated_at";

/// List all servers, newest first.
pub fn list_servers() -> Result<Vec<McpServer>> {
    let conn = db::read_conn()?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLUMNS} FROM mcp_servers ORDER BY created_at DESC"
    ))?;
    let rows = stmt
        .query_map([], row_to_server)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Fetch a single server by id.
pub fn get_server(id: &str) -> Result<Option<McpServer>> {
    let conn = db::read_conn()?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLUMNS} FROM mcp_servers WHERE id = ?1"
    ))?;
    let mut rows = stmt.query_map(params![id], row_to_server)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

/// Insert (no `id`) or update a server. Returns the stored row. Enforces a
/// valid, unique `name`.
pub fn upsert_server(input: McpServerInput) -> Result<McpServer> {
    let name = input.name.trim();
    if !is_valid_server_name(name) {
        anyhow::bail!("invalid server name \"{name}\" (use letters, numbers, '.', '_', '-')");
    }
    if input.transport != "stdio" && input.transport != "http" {
        anyhow::bail!("transport must be \"stdio\" or \"http\"");
    }
    let args = serde_json::to_string(&input.args).context("serialize args")?;
    let headers = serde_json::to_string(&input.headers).context("serialize headers")?;
    let env = serde_json::to_string(&input.env).context("serialize env")?;
    let providers = serde_json::to_string(&input.providers).context("serialize providers")?;
    let now = db::current_timestamp()?;
    let conn = db::write_conn()?;

    let id = match &input.id {
        Some(id) => {
            let updated = conn.execute(
                "UPDATE mcp_servers SET name = ?1, transport = ?2, command = ?3, args = ?4, \
                 url = ?5, headers = ?6, env = ?7, providers = ?8, enabled = ?9, updated_at = ?10 \
                 WHERE id = ?11",
                params![
                    name,
                    input.transport,
                    input.command,
                    args,
                    input.url,
                    headers,
                    env,
                    providers,
                    input.enabled as i64,
                    now,
                    id,
                ],
            )?;
            if updated == 0 {
                anyhow::bail!("mcp server {id} not found");
            }
            id.clone()
        }
        None => {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO mcp_servers (id, name, transport, command, args, url, headers, env, \
                 providers, enabled, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
                params![
                    id,
                    name,
                    input.transport,
                    input.command,
                    args,
                    input.url,
                    headers,
                    env,
                    providers,
                    input.enabled as i64,
                    now,
                ],
            )?;
            id
        }
    };
    drop(conn);
    get_server(&id)?.ok_or_else(|| anyhow::anyhow!("mcp server {id} vanished after upsert"))
}

/// Delete a server. Returns the deleted row (so the caller can un-sync it from
/// the agents' native files), or `None` when the id didn't exist.
pub fn delete_server(id: &str) -> Result<Option<McpServer>> {
    let existing = get_server(id)?;
    if existing.is_some() {
        let conn = db::write_conn()?;
        conn.execute("DELETE FROM mcp_servers WHERE id = ?1", params![id])?;
    }
    Ok(existing)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(name: &str, providers: &[&str]) -> McpServerInput {
        McpServerInput {
            id: None,
            name: name.to_string(),
            transport: "stdio".to_string(),
            command: Some("npx".to_string()),
            args: vec!["-y".into(), "server".into()],
            url: None,
            headers: BTreeMap::new(),
            env: BTreeMap::from([("TOKEN".to_string(), "abc".to_string())]),
            providers: providers.iter().map(|p| p.to_string()).collect(),
            enabled: true,
        }
    }

    #[test]
    fn upsert_list_update_delete_roundtrip() {
        let _env = crate::testkit::TestEnv::new("library-mcp");

        let created = upsert_server(input("playwright", &["claude"])).unwrap();
        assert_eq!(created.name, "playwright");
        assert_eq!(created.args, vec!["-y", "server"]);
        assert_eq!(created.env.get("TOKEN").unwrap(), "abc");
        assert_eq!(created.providers, vec!["claude"]);

        // Update toggles providers + enabled while keeping the id.
        let mut update = input("playwright", &["claude", "codex"]);
        update.id = Some(created.id.clone());
        update.enabled = false;
        let updated = upsert_server(update).unwrap();
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.providers, vec!["claude", "codex"]);
        assert!(!updated.enabled);

        // Listed once.
        assert_eq!(list_servers().unwrap().len(), 1);

        // Delete returns the row.
        let removed = delete_server(&created.id).unwrap();
        assert!(removed.is_some());
        assert!(list_servers().unwrap().is_empty());
    }

    #[test]
    fn invalid_name_is_rejected() {
        let _env = crate::testkit::TestEnv::new("library-mcp-name");
        assert!(upsert_server(input("bad name!", &[])).is_err());
    }

    #[test]
    fn duplicate_name_is_rejected() {
        let _env = crate::testkit::TestEnv::new("library-mcp-dupe");
        upsert_server(input("dupe", &[])).unwrap();
        assert!(upsert_server(input("dupe", &[])).is_err());
    }
}
