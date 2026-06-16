//! Tauri commands backing the Library panels.
//!
//! Prompts are purely Grex-internal. MCP servers are stored canonically in
//! SQLite; the `library_mcp_sync*` commands project them into agents' native
//! config files (see `crate::library::agent_mcp`). All mutating commands
//! broadcast a `Library*Changed` event so the UI invalidates its queries.

use tauri::AppHandle;

use crate::library::agent_mcp::{self, SyncPlan};
use crate::library::mcp_test::{self, McpTestResult};
use crate::library::skills::{self, SkillDetail, SkillSummary};
use crate::models::library_mcp::{self, McpServer, McpServerInput};
use crate::models::library_prompts::{self, PromptTemplate};
use crate::ui_sync::{self, UiMutationEvent};

use super::common::{run_blocking, CmdResult};

/// List all Library prompts in display order.
#[tauri::command]
pub async fn library_prompts_list() -> CmdResult<Vec<PromptTemplate>> {
    run_blocking(library_prompts::list_prompts).await
}

/// Create (when `id` is omitted) or update a prompt. Returns the stored row.
#[tauri::command]
pub async fn library_prompts_upsert(
    app: AppHandle,
    id: Option<String>,
    title: String,
    prompt: String,
) -> CmdResult<PromptTemplate> {
    let stored = run_blocking(move || library_prompts::upsert_prompt(id, &title, &prompt)).await?;
    ui_sync::publish(&app, UiMutationEvent::LibraryPromptsChanged);
    Ok(stored)
}

/// Delete a prompt by id.
#[tauri::command]
pub async fn library_prompts_delete(app: AppHandle, id: String) -> CmdResult<()> {
    run_blocking(move || library_prompts::delete_prompt(&id)).await?;
    ui_sync::publish(&app, UiMutationEvent::LibraryPromptsChanged);
    Ok(())
}

/// Persist a new display order from the full list of ids.
#[tauri::command]
pub async fn library_prompts_reorder(app: AppHandle, ordered_ids: Vec<String>) -> CmdResult<()> {
    run_blocking(move || library_prompts::reorder_prompts(&ordered_ids)).await?;
    ui_sync::publish(&app, UiMutationEvent::LibraryPromptsChanged);
    Ok(())
}

// ── MCP servers ─────────────────────────────────────────────────────────────

/// List all Library MCP servers.
#[tauri::command]
pub async fn library_mcp_list() -> CmdResult<Vec<McpServer>> {
    run_blocking(library_mcp::list_servers).await
}

/// Create (omit `id`) or update an MCP server. Does NOT write native config —
/// the user syncs explicitly. Returns the stored row.
#[tauri::command]
pub async fn library_mcp_upsert(app: AppHandle, server: McpServerInput) -> CmdResult<McpServer> {
    let stored = run_blocking(move || library_mcp::upsert_server(server)).await?;
    ui_sync::publish(&app, UiMutationEvent::LibraryMcpServersChanged);
    Ok(stored)
}

/// Delete an MCP server, removing any synced copy from every agent's native
/// config so nothing is orphaned.
#[tauri::command]
pub async fn library_mcp_delete(app: AppHandle, id: String) -> CmdResult<()> {
    run_blocking(move || {
        if let Some(server) = library_mcp::delete_server(&id)? {
            agent_mcp::remove_server_everywhere(&server.name)?;
        }
        Ok(())
    })
    .await?;
    ui_sync::publish(&app, UiMutationEvent::LibraryMcpServersChanged);
    Ok(())
}

/// Preview what "Sync to agents" would change, writing nothing.
#[tauri::command]
pub async fn library_mcp_sync_preview() -> CmdResult<SyncPlan> {
    run_blocking(|| {
        let servers = library_mcp::list_servers()?;
        agent_mcp::plan(&servers)
    })
    .await
}

/// Write every Library MCP server into the selected agents' native config
/// files. Returns what was changed.
#[tauri::command]
pub async fn library_mcp_sync() -> CmdResult<SyncPlan> {
    run_blocking(|| {
        let servers = library_mcp::list_servers()?;
        agent_mcp::apply(&servers)
    })
    .await
}

/// Test-connect to a server config (unsaved): runs an MCP handshake and reports
/// whether it connected and how many tools it exposes.
#[tauri::command]
pub async fn library_mcp_test(server: McpServerInput) -> CmdResult<McpTestResult> {
    run_blocking(move || Ok(mcp_test::test_server(&server))).await
}

// ── Skills ──────────────────────────────────────────────────────────────────

/// List installed Library skills.
#[tauri::command]
pub async fn library_skills_list() -> CmdResult<Vec<SkillSummary>> {
    run_blocking(|| skills::list_skills(&skills::production_roots())).await
}

/// Read a single skill's `SKILL.md`.
#[tauri::command]
pub async fn library_skills_read(name: String) -> CmdResult<Option<SkillDetail>> {
    run_blocking(move || skills::read_skill(&skills::production_roots(), &name)).await
}

/// Create a skill and link it into every agent's skills dir.
#[tauri::command]
pub async fn library_skills_create(
    app: AppHandle,
    name: String,
    description: String,
    content: Option<String>,
) -> CmdResult<SkillSummary> {
    let created = run_blocking(move || {
        skills::create_skill(
            &skills::production_roots(),
            &name,
            &description,
            content.as_deref(),
        )
    })
    .await?;
    ui_sync::publish(&app, UiMutationEvent::LibrarySkillsChanged);
    Ok(created)
}

/// Install a recommended skill. When `source_url` is set, fetch the real
/// upstream `SKILL.md` (best-effort, ~12s) and fall back to `content` on any
/// failure — so installing always succeeds, just with a generated starter when
/// the network/source is unavailable.
#[tauri::command]
pub async fn library_skills_install(
    app: AppHandle,
    name: String,
    description: String,
    content: String,
    source_url: Option<String>,
) -> CmdResult<SkillSummary> {
    let created = run_blocking(move || {
        let resolved = source_url
            .as_deref()
            .and_then(fetch_remote_skill_md)
            .unwrap_or(content);
        skills::create_skill(
            &skills::production_roots(),
            &name,
            &description,
            Some(&resolved),
        )
    })
    .await?;
    ui_sync::publish(&app, UiMutationEvent::LibrarySkillsChanged);
    Ok(created)
}

/// Best-effort fetch of a remote `SKILL.md`. Returns `None` on any error (the
/// caller falls back to a generated starter). Only `https://` is honored.
fn fetch_remote_skill_md(url: &str) -> Option<String> {
    if !url.starts_with("https://") {
        return None;
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .user_agent("grex")
        .build()
        .ok()?;
    let resp = client.get(url).send().ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let text = resp.text().ok()?;
    if text.trim().is_empty() {
        None
    } else {
        Some(text)
    }
}

/// Overwrite a skill's `SKILL.md`.
#[tauri::command]
pub async fn library_skills_update(app: AppHandle, name: String, content: String) -> CmdResult<()> {
    run_blocking(move || skills::update_skill(&skills::production_roots(), &name, &content))
        .await?;
    ui_sync::publish(&app, UiMutationEvent::LibrarySkillsChanged);
    Ok(())
}

/// Delete a skill and remove its links from every agent's skills dir.
#[tauri::command]
pub async fn library_skills_delete(app: AppHandle, name: String) -> CmdResult<()> {
    run_blocking(move || skills::delete_skill(&skills::production_roots(), &name)).await?;
    ui_sync::publish(&app, UiMutationEvent::LibrarySkillsChanged);
    Ok(())
}
