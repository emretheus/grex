//! Tauri commands for the Kimi custom-providers form and the composer's Kimi
//! "Models" picker. Kimi is a file-backed provider (`~/.kimi-code/config.toml`),
//! like OpenCode.

use super::common::{run_blocking, CmdResult};
use crate::agents::kimi_config::{self, KimiCustomProvider, KimiProviderConfig};

/// `{providers, models}` view for the Settings "Models" row + composer grouping.
#[tauri::command]
pub async fn get_kimi_provider_config() -> CmdResult<KimiProviderConfig> {
    run_blocking(kimi_config::read_provider_config).await
}

#[tauri::command]
pub async fn get_kimi_custom_providers() -> CmdResult<Vec<KimiCustomProvider>> {
    run_blocking(kimi_config::read_custom_providers).await
}

#[tauri::command]
pub async fn upsert_kimi_custom_provider(provider: KimiCustomProvider) -> CmdResult<()> {
    run_blocking(move || kimi_config::upsert_custom_provider(&provider)).await
}

#[tauri::command]
pub async fn delete_kimi_custom_provider(id: String) -> CmdResult<()> {
    run_blocking(move || kimi_config::delete_custom_provider(&id)).await
}
