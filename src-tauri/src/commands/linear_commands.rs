//! IPC commands for the Linear Context source.
//!
//! `linear_connect` validates + stores a pasted personal API key;
//! `linear_list_inbox_items` / `linear_search_issues` / `linear_get_issue`
//! read the user's issues with it. All read paths funnel auth failures
//! through `handle_api_result`, which wipes the stored key and broadcasts
//! `LinearConnectionChanged` so the UI flips back to the connect state.

use anyhow::bail;
use chrono::Utc;
use tauri::AppHandle;

use crate::linear::types::{
    LinearConnection, LinearConnectionMeta, LinearInboxPage, LinearIssueDetail,
};
use crate::linear::{self, api as linear_api, credentials};
use crate::models::settings;
use crate::ui_sync::{self, UiMutationEvent};

use super::common::{run_blocking, CmdResult};

/// Current connection state — drives the connect/connected branch in both
/// the inbox sidebar and Settings → Contexts. "Connected" is keyed on the
/// presence of a stored key; names come from the cached metadata.
#[tauri::command]
pub async fn linear_connection_status() -> CmdResult<LinearConnection> {
    run_blocking(|| {
        let connected = credentials::load_api_key()?.is_some();
        if !connected {
            return Ok(LinearConnection::default());
        }
        let meta: Option<LinearConnectionMeta> =
            settings::load_setting_json(linear::CONNECTION_META_KEY)?;
        Ok(LinearConnection {
            connected: true,
            workspace_name: meta.as_ref().map(|m| m.workspace_name.clone()),
            user_name: meta.as_ref().map(|m| m.user_name.clone()),
        })
    })
    .await
}

/// Validate a pasted personal API key (by resolving its viewer), then
/// persist it + the connection metadata. An invalid key is never stored.
#[tauri::command]
pub async fn linear_connect(app: AppHandle, api_key: String) -> CmdResult<LinearConnection> {
    run_blocking(move || {
        let key = api_key.trim().to_string();
        if key.is_empty() {
            bail!("Paste your Linear personal API key to connect.");
        }
        // Validate before persisting — a typo'd key must not look connected.
        let (user_name, workspace_name) = linear_api::viewer_with_key(&key).map_err(|error| {
            if linear_api::is_invalid_auth(&error) {
                anyhow::anyhow!("That Linear API key was rejected. Double-check you copied it from linear.app/settings/api.")
            } else {
                error.context("Couldn't reach Linear to validate the key")
            }
        })?;

        credentials::store_api_key(&key)?;
        let meta = LinearConnectionMeta {
            workspace_name: workspace_name.clone(),
            user_name: user_name.clone(),
            connected_at: Utc::now().timestamp(),
        };
        settings::upsert_setting_json(linear::CONNECTION_META_KEY, &meta)?;

        ui_sync::publish(&app, UiMutationEvent::LinearConnectionChanged);
        Ok(LinearConnection {
            connected: true,
            workspace_name: Some(workspace_name).filter(|s| !s.is_empty()),
            user_name: Some(user_name).filter(|s| !s.is_empty()),
        })
    })
    .await
}

/// Disconnect: wipe the stored key + cached metadata and notify the UI.
/// (Personal keys are revoked by the user in Linear settings; there's no
/// server-side revoke endpoint to call.)
#[tauri::command]
pub async fn linear_disconnect(app: AppHandle) -> CmdResult<()> {
    let app_handle = app.clone();
    run_blocking(move || {
        let _ = credentials::clear_api_key();
        let _ = settings::delete_setting_value(linear::CONNECTION_META_KEY);
        ui_sync::publish(&app_handle, UiMutationEvent::LinearConnectionChanged);
        Ok(())
    })
    .await
}

/// The signed-in user's assigned issues, most-recently-updated first.
#[tauri::command]
pub async fn linear_list_inbox_items(
    app: AppHandle,
    cursor: Option<String>,
    limit: Option<u32>,
) -> CmdResult<LinearInboxPage> {
    let limit = limit.unwrap_or(30).clamp(1, 100);
    let app_handle = app.clone();
    run_blocking(move || {
        handle_api_result(
            &app_handle,
            linear_api::list_assigned_issues(cursor.as_deref(), limit),
        )
    })
    .await
}

/// Free-text issue search across the user's accessible Linear workspaces.
#[tauri::command]
pub async fn linear_search_issues(
    app: AppHandle,
    query: String,
    cursor: Option<String>,
    limit: Option<u32>,
) -> CmdResult<LinearInboxPage> {
    let limit = limit.unwrap_or(30).clamp(1, 100);
    let app_handle = app.clone();
    run_blocking(move || {
        handle_api_result(
            &app_handle,
            linear_api::search_issues(&query, cursor.as_deref(), limit),
        )
    })
    .await
}

/// Fetch one issue's full detail (description body, meta) for the preview
/// panel and the "Start workspace" prompt seed.
#[tauri::command]
pub async fn linear_get_issue(app: AppHandle, issue_id: String) -> CmdResult<LinearIssueDetail> {
    let app_handle = app.clone();
    run_blocking(move || handle_api_result(&app_handle, linear_api::get_issue(&issue_id))).await
}

/// On auth failure, wipe the stored credential + metadata and broadcast
/// `LinearConnectionChanged` so the UI drops back to the connect state.
/// Other errors propagate untouched.
fn handle_api_result<T>(app: &AppHandle, result: anyhow::Result<T>) -> anyhow::Result<T> {
    match result {
        Ok(page) => Ok(page),
        Err(error) => {
            if linear_api::is_invalid_auth(&error) {
                let _ = credentials::clear_api_key();
                let _ = settings::delete_setting_value(linear::CONNECTION_META_KEY);
                ui_sync::publish(app, UiMutationEvent::LinearConnectionChanged);
            }
            Err(error)
        }
    }
}
