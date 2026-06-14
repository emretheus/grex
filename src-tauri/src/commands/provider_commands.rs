//! Tauri commands for custom Codex providers (OpenAI-compatible endpoints).

use super::common::{run_blocking, CmdResult};
use crate::agents::codex_custom_providers::{self, CodexCustomModel, CodexCustomProvider};

#[tauri::command]
pub async fn list_codex_custom_providers() -> CmdResult<Vec<CodexCustomProvider>> {
    run_blocking(|| Ok(codex_custom_providers::list())).await
}

#[tauri::command]
pub async fn upsert_codex_custom_provider(provider: CodexCustomProvider) -> CmdResult<()> {
    run_blocking(move || codex_custom_providers::upsert(provider)).await
}

#[tauri::command]
pub async fn delete_codex_custom_provider(id: String) -> CmdResult<()> {
    run_blocking(move || codex_custom_providers::remove(&id)).await
}

/// Fetch the model list from a custom Codex provider's OpenAI-compatible
/// `/v1/models` endpoint. Runs backend-side (the webview can't reach arbitrary
/// origins under CSP). Non-chat models (image/audio/embedding/…) are filtered.
#[tauri::command]
pub async fn fetch_codex_provider_models(
    base_url: String,
    api_key: String,
) -> CmdResult<Vec<CodexCustomModel>> {
    Ok(codex_custom_providers::fetch_models(&base_url, &api_key).await?)
}
