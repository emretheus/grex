//! Write-through projection of Library MCP servers into agents' native config
//! files.
//!
//! Grex's SQLite store is canonical. An explicit "Sync to agents" action calls
//! [`apply`]; the UI first shows a preview from [`plan`]. Each agent gets its
//! servers written in its own format, with all unrelated keys preserved:
//!
//! - **Claude** — `~/.claude.json`, top-level `mcpServers` (JSON passthrough).
//! - **Codex** — `~/.codex/config.toml`, `[mcp_servers]` (TOML; **stdio only** —
//!   HTTP servers are reported as unsupported and skipped).
//!
//! Reconciliation is name-keyed and per-server: a name that exists in the
//! Library "belongs" to Grex for each file — selected+enabled ⇒ written,
//! otherwise removed. Entries whose names Grex doesn't manage are left intact.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::Serialize;
use serde_json::{json, Map, Value};
use toml_edit::{value as toml_value, Array as TomlArray, DocumentMut, Item, Table};

use crate::models::library_mcp::McpServer;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpFormat {
    ClaudeJson,
    CodexToml,
}

/// One agent that can receive MCP servers, plus where + how to write them.
pub struct AgentMcpTarget {
    pub id: String,
    pub config_path: PathBuf,
    pub format: McpFormat,
    /// Whether the agent supports HTTP-transport servers.
    pub allow_http: bool,
}

/// What a sync will do to one agent's config file. Reported by both [`plan`]
/// (dry run) and [`apply`].
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSyncChange {
    pub agent: String,
    pub config_path: String,
    /// Server names that will be written (added or updated).
    pub written: Vec<String>,
    /// Server names that will be removed.
    pub removed: Vec<String>,
    /// Selected servers the agent can't accept (e.g. HTTP on Codex).
    pub unsupported: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPlan {
    pub changes: Vec<AgentSyncChange>,
}

/// The agents Grex can sync MCP servers to, with their real config paths.
pub fn production_targets() -> Vec<AgentMcpTarget> {
    vec![
        AgentMcpTarget {
            id: "claude".to_string(),
            config_path: claude_config_path(),
            format: McpFormat::ClaudeJson,
            allow_http: true,
        },
        AgentMcpTarget {
            id: "codex".to_string(),
            config_path: crate::codex_config::config_path(),
            format: McpFormat::CodexToml,
            allow_http: false,
        },
    ]
}

/// Resolve `~/.claude.json`, honoring `$CLAUDE_CONFIG_DIR` (mirrors the SDK and
/// the sidecar reader).
fn claude_config_path() -> PathBuf {
    let dir = std::env::var_os("CLAUDE_CONFIG_DIR")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(crate::platform::paths::home_dir_or_root);
    dir.join(".claude.json")
}

/// Dry-run: compute what a sync would change, writing nothing.
pub fn plan(servers: &[McpServer]) -> Result<SyncPlan> {
    reconcile_all(&production_targets(), servers, false)
}

/// Apply the sync to every agent's native config file.
pub fn apply(servers: &[McpServer]) -> Result<SyncPlan> {
    reconcile_all(&production_targets(), servers, true)
}

/// Remove a server (by name) from every agent's native config — used when a
/// Library server is deleted, so no orphaned entry lingers. Best-effort per
/// agent; unrelated entries are untouched.
pub fn remove_server_everywhere(name: &str) -> Result<()> {
    for target in production_targets() {
        remove_named(&target, name)?;
    }
    Ok(())
}

fn remove_named(target: &AgentMcpTarget, name: &str) -> Result<()> {
    let content = match std::fs::read_to_string(&target.config_path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e).context("read agent config"),
    };
    if content.trim().is_empty() {
        return Ok(());
    }
    match target.format {
        McpFormat::ClaudeJson => {
            let mut root: Value = serde_json::from_str(&content).context("parse ~/.claude.json")?;
            let Some(servers) = root.get_mut("mcpServers").and_then(|v| v.as_object_mut()) else {
                return Ok(());
            };
            if servers.remove(name).is_some() {
                let serialized = format!("{}\n", serde_json::to_string_pretty(&root)?);
                std::fs::write(&target.config_path, serialized).context("write ~/.claude.json")?;
            }
        }
        McpFormat::CodexToml => {
            let mut doc: DocumentMut = content.parse().context("parse ~/.codex/config.toml")?;
            let removed = doc
                .get_mut("mcp_servers")
                .and_then(|i| i.as_table_mut())
                .map(|t| t.remove(name).is_some())
                .unwrap_or(false);
            if removed {
                std::fs::write(&target.config_path, doc.to_string())
                    .context("write ~/.codex/config.toml")?;
            }
        }
    }
    Ok(())
}

fn reconcile_all(
    targets: &[AgentMcpTarget],
    servers: &[McpServer],
    write: bool,
) -> Result<SyncPlan> {
    let mut changes = Vec::new();
    for target in targets {
        changes.push(reconcile_target(target, servers, write)?);
    }
    Ok(SyncPlan { changes })
}

/// The native JSON/TOML value Grex writes for a server (shared by both formats;
/// Codex never carries the `type` field because it only takes stdio).
fn desired_value(server: &McpServer) -> Value {
    let mut m = Map::new();
    if server.transport == "http" {
        m.insert("type".into(), json!("http"));
        if let Some(url) = &server.url {
            m.insert("url".into(), json!(url));
        }
        if !server.headers.is_empty() {
            m.insert("headers".into(), json!(server.headers));
        }
    } else {
        if let Some(command) = &server.command {
            m.insert("command".into(), json!(command));
        }
        m.insert("args".into(), json!(server.args));
        if !server.env.is_empty() {
            m.insert("env".into(), json!(server.env));
        }
    }
    Value::Object(m)
}

struct TargetReconcile {
    /// Names → desired native value for servers this agent should carry.
    desired: BTreeMap<String, Value>,
    /// Selected servers the agent can't accept.
    unsupported: Vec<String>,
    /// Every Library server name (the set Grex "manages" in this file).
    managed: Vec<String>,
}

fn compute_reconcile(target: &AgentMcpTarget, servers: &[McpServer]) -> TargetReconcile {
    let mut desired = BTreeMap::new();
    let mut unsupported = Vec::new();
    let mut managed = Vec::new();
    for server in servers {
        managed.push(server.name.clone());
        let selected = server.enabled && server.providers.iter().any(|p| p == &target.id);
        if !selected {
            continue;
        }
        if server.transport == "http" && !target.allow_http {
            unsupported.push(server.name.clone());
            continue;
        }
        desired.insert(server.name.clone(), desired_value(server));
    }
    TargetReconcile {
        desired,
        unsupported,
        managed,
    }
}

fn reconcile_target(
    target: &AgentMcpTarget,
    servers: &[McpServer],
    write: bool,
) -> Result<AgentSyncChange> {
    let plan = compute_reconcile(target, servers);
    let existing = read_existing(target)?;

    let mut written = Vec::new();
    for (name, desired) in &plan.desired {
        if existing.get(name) != Some(desired) {
            written.push(name.clone());
        }
    }
    let mut removed = Vec::new();
    for name in &plan.managed {
        if !plan.desired.contains_key(name) && existing.contains_key(name) {
            removed.push(name.clone());
        }
    }
    written.sort();
    removed.sort();

    if write && (!written.is_empty() || !removed.is_empty()) {
        match target.format {
            McpFormat::ClaudeJson => write_claude(target, &plan)?,
            McpFormat::CodexToml => write_codex(target, &plan)?,
        }
    }

    Ok(AgentSyncChange {
        agent: target.id.clone(),
        config_path: target.config_path.display().to_string(),
        written,
        removed,
        unsupported: plan.unsupported,
    })
}

/// Read the agent's currently-stored servers as a normalized `name → value`
/// map, so it can be diffed against the desired set.
fn read_existing(target: &AgentMcpTarget) -> Result<BTreeMap<String, Value>> {
    let content = match std::fs::read_to_string(&target.config_path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(BTreeMap::new()),
        Err(e) => return Err(e).context("read agent config"),
    };
    if content.trim().is_empty() {
        return Ok(BTreeMap::new());
    }
    let root: Value = match target.format {
        McpFormat::ClaudeJson => serde_json::from_str(&content)
            .with_context(|| format!("parse {}", target.config_path.display()))?,
        McpFormat::CodexToml => toml::from_str(&content)
            .with_context(|| format!("parse {}", target.config_path.display()))?,
    };
    let key = servers_key(target.format);
    let map = root
        .get(key)
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    Ok(map.into_iter().collect())
}

fn servers_key(format: McpFormat) -> &'static str {
    match format {
        McpFormat::ClaudeJson => "mcpServers",
        McpFormat::CodexToml => "mcp_servers",
    }
}

fn ensure_parent_dir(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).context("create config dir")?;
    }
    Ok(())
}

fn write_claude(target: &AgentMcpTarget, plan: &TargetReconcile) -> Result<()> {
    let content = std::fs::read_to_string(&target.config_path).unwrap_or_default();
    let mut root: Value = if content.trim().is_empty() {
        Value::Object(Map::new())
    } else {
        serde_json::from_str(&content).context("parse ~/.claude.json")?
    };
    let obj = root
        .as_object_mut()
        .context("~/.claude.json is not a JSON object")?;
    let servers = obj
        .entry("mcpServers")
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .context("mcpServers is not an object")?;

    for (name, value) in &plan.desired {
        servers.insert(name.clone(), value.clone());
    }
    for name in &plan.managed {
        if !plan.desired.contains_key(name) {
            servers.remove(name);
        }
    }

    ensure_parent_dir(&target.config_path)?;
    let serialized = format!("{}\n", serde_json::to_string_pretty(&root)?);
    std::fs::write(&target.config_path, serialized).context("write ~/.claude.json")?;
    Ok(())
}

fn write_codex(target: &AgentMcpTarget, plan: &TargetReconcile) -> Result<()> {
    let content = std::fs::read_to_string(&target.config_path).unwrap_or_default();
    let mut doc: DocumentMut = if content.trim().is_empty() {
        DocumentMut::new()
    } else {
        content.parse().context("parse ~/.codex/config.toml")?
    };

    if doc.get("mcp_servers").and_then(|i| i.as_table()).is_none() {
        let mut table = Table::new();
        table.set_implicit(true);
        doc["mcp_servers"] = Item::Table(table);
    }
    let servers = doc["mcp_servers"]
        .as_table_mut()
        .context("mcp_servers is not a TOML table")?;

    for (name, val) in &plan.desired {
        servers.insert(name, Item::Table(json_to_toml_table(val)));
    }
    for name in &plan.managed {
        if !plan.desired.contains_key(name) {
            servers.remove(name);
        }
    }

    ensure_parent_dir(&target.config_path)?;
    std::fs::write(&target.config_path, doc.to_string()).context("write ~/.codex/config.toml")?;
    Ok(())
}

/// Convert a server's JSON value into a TOML table (`command`/`args`/`env`).
fn json_to_toml_table(val: &Value) -> Table {
    let mut table = Table::new();
    let Some(obj) = val.as_object() else {
        return table;
    };
    for (k, v) in obj {
        match v {
            Value::String(s) => {
                table[k] = toml_value(s.clone());
            }
            Value::Array(items) => {
                let mut arr = TomlArray::new();
                for item in items {
                    if let Value::String(s) = item {
                        arr.push(s.clone());
                    }
                }
                table[k] = toml_value(arr);
            }
            Value::Object(map) => {
                let mut sub = Table::new();
                for (sk, sv) in map {
                    if let Value::String(s) = sv {
                        sub[sk] = toml_value(s.clone());
                    }
                }
                table[k] = Item::Table(sub);
            }
            _ => {}
        }
    }
    table
}

#[cfg(test)]
mod tests {
    use super::*;

    fn server(name: &str, transport: &str, providers: &[&str], enabled: bool) -> McpServer {
        McpServer {
            id: format!("id-{name}"),
            name: name.to_string(),
            transport: transport.to_string(),
            command: if transport == "stdio" {
                Some("npx".to_string())
            } else {
                None
            },
            args: if transport == "stdio" {
                vec!["-y".into(), format!("@scope/{name}")]
            } else {
                vec![]
            },
            url: if transport == "http" {
                Some(format!("https://{name}.example/mcp"))
            } else {
                None
            },
            headers: BTreeMap::new(),
            env: BTreeMap::from([("TOKEN".to_string(), "secret".to_string())]),
            providers: providers.iter().map(|p| p.to_string()).collect(),
            enabled,
            created_at: "now".to_string(),
            updated_at: "now".to_string(),
        }
    }

    fn claude_target(path: &Path) -> AgentMcpTarget {
        AgentMcpTarget {
            id: "claude".to_string(),
            config_path: path.to_path_buf(),
            format: McpFormat::ClaudeJson,
            allow_http: true,
        }
    }

    fn codex_target(path: &Path) -> AgentMcpTarget {
        AgentMcpTarget {
            id: "codex".to_string(),
            config_path: path.to_path_buf(),
            format: McpFormat::CodexToml,
            allow_http: false,
        }
    }

    #[test]
    fn claude_write_preserves_unrelated_keys() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".claude.json");
        // Pre-existing config with unrelated keys + a foreign MCP server.
        std::fs::write(
            &path,
            r#"{"theme":"dark","mcpServers":{"manual":{"command":"x"}},"numStartups":7}"#,
        )
        .unwrap();

        let target = claude_target(&path);
        let servers = vec![server("playwright", "stdio", &["claude"], true)];
        let change = reconcile_target(&target, &servers, true).unwrap();
        assert_eq!(change.written, vec!["playwright"]);

        let root: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        // Unrelated keys preserved.
        assert_eq!(root["theme"], json!("dark"));
        assert_eq!(root["numStartups"], json!(7));
        // Foreign server (not Library-managed) preserved.
        assert_eq!(root["mcpServers"]["manual"]["command"], json!("x"));
        // Ours written.
        assert_eq!(root["mcpServers"]["playwright"]["command"], json!("npx"));
        assert_eq!(
            root["mcpServers"]["playwright"]["env"]["TOKEN"],
            json!("secret")
        );
    }

    #[test]
    fn deselecting_removes_only_managed_entry() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".claude.json");
        let target = claude_target(&path);

        // Sync once with the server selected.
        let selected = vec![server("ph", "stdio", &["claude"], true)];
        apply_to(&target, &selected);
        let root: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert!(root["mcpServers"].get("ph").is_some());

        // Now deselect it (providers no longer include claude) and re-sync.
        let deselected = vec![server("ph", "stdio", &[], true)];
        let change = reconcile_target(&target, &deselected, true).unwrap();
        assert_eq!(change.removed, vec!["ph"]);
        let root: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert!(root["mcpServers"].get("ph").is_none());
    }

    #[test]
    fn codex_writes_toml_and_skips_http() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        std::fs::write(&path, "model = \"gpt-5\"\n[features]\ngoals = true\n").unwrap();

        let target = codex_target(&path);
        let servers = vec![
            server("fs", "stdio", &["codex"], true),
            server("remote", "http", &["codex"], true),
        ];
        let change = reconcile_target(&target, &servers, true).unwrap();
        assert_eq!(change.written, vec!["fs"]);
        assert_eq!(change.unsupported, vec!["remote"]);

        let written = std::fs::read_to_string(&path).unwrap();
        // Unrelated keys preserved.
        assert!(written.contains("model = \"gpt-5\""));
        assert!(written.contains("goals = true"));
        // stdio server written as a TOML table.
        let parsed: Value = toml::from_str(&written).unwrap();
        assert_eq!(parsed["mcp_servers"]["fs"]["command"], json!("npx"));
        assert_eq!(parsed["mcp_servers"]["fs"]["env"]["TOKEN"], json!("secret"));
        // HTTP server NOT written.
        assert!(parsed["mcp_servers"].get("remote").is_none());
    }

    #[test]
    fn plan_is_idempotent_after_apply() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".claude.json");
        let target = claude_target(&path);
        let servers = vec![server("ph", "stdio", &["claude"], true)];

        reconcile_target(&target, &servers, true).unwrap();
        // Second reconcile sees no changes.
        let change = reconcile_target(&target, &servers, false).unwrap();
        assert!(change.written.is_empty(), "no rewrite when unchanged");
        assert!(change.removed.is_empty());
    }

    fn apply_to(target: &AgentMcpTarget, servers: &[McpServer]) {
        reconcile_target(target, servers, true).unwrap();
    }
}
