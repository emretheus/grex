//! IPC commands for the Forgejo Context source.
//!
//! The read feed delegates to the provider-agnostic `issues::feed` helpers;
//! connect / disconnect / scope commands are Forgejo-shaped (host + token
//! credentials, a My issues/All scope toggle) and operate on the generic
//! `issues::{connection,credentials}` store keyed by `ProviderKind::Forgejo`.

use std::collections::HashMap;

use anyhow::{anyhow, bail};
use chrono::Utc;
use serde::Serialize;
use serde_json::json;
use tauri::AppHandle;

use crate::issues::connection::{self, ConnectionRecord};
use crate::issues::provider::{ProviderKind, ProviderScope};
use crate::issues::providers::forgejo;
use crate::issues::types::{InboxPage, IssueDetail};
use crate::issues::{credentials, feed};
use crate::ui_sync::{self, UiMutationEvent};

use super::common::{run_blocking, CmdResult};

const FORGEJO: ProviderKind = ProviderKind::Forgejo;

/// One connected Forgejo instance surfaced to the frontend settings + inbox.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgejoConnection {
    pub id: String,
    pub host_name: String,
    pub user_name: String,
    pub assigned_only: bool,
}

fn to_connection(record: &ConnectionRecord) -> ForgejoConnection {
    ForgejoConnection {
        id: record.id.clone(),
        host_name: record.display_name.clone(),
        user_name: record.user_name.clone(),
        assigned_only: record.scope.assigned_only,
    }
}

fn publish_changed(app: &AppHandle) {
    ui_sync::publish(
        app,
        UiMutationEvent::IssueConnectionChanged { provider: FORGEJO },
    );
}

#[tauri::command]
pub async fn forgejo_connections() -> CmdResult<Vec<ForgejoConnection>> {
    run_blocking(|| {
        Ok(connection::load_records(FORGEJO)?
            .iter()
            .map(to_connection)
            .collect())
    })
    .await
}

/// Validate `{host,token}` against Forgejo, then persist the credentials + an
/// upserted connection record. An invalid bundle is never stored.
#[tauri::command]
pub async fn forgejo_connect(
    app: AppHandle,
    host: String,
    token: String,
) -> CmdResult<ForgejoConnection> {
    run_blocking(move || {
        let host = normalize_host(&host)?;
        let token = token.trim().to_string();
        if token.is_empty() {
            bail!("Enter your Forgejo access token to connect.");
        }
        let secret = json!({ "host": host, "token": token }).to_string();
        let identity = forgejo::validate(&secret)?;

        let records = connection::load_records(FORGEJO)?;
        let upsert = connection::upsert_connected(
            records,
            &identity.account_key,
            &identity.display_name,
            &identity.user_name,
            Utc::now().timestamp(),
        );
        credentials::store(FORGEJO, &upsert.id, &secret)?;
        connection::save_records(FORGEJO, &upsert.records)?;

        let connection = upsert
            .records
            .iter()
            .find(|r| r.id == upsert.id)
            .map(to_connection)
            .ok_or_else(|| anyhow!("Connection record vanished after connect"))?;
        publish_changed(&app);
        Ok(connection)
    })
    .await
}

#[tauri::command]
pub async fn forgejo_disconnect(app: AppHandle, connection_id: String) -> CmdResult<()> {
    run_blocking(move || {
        let _ = credentials::clear(FORGEJO, &connection_id);
        let mut records = connection::load_records(FORGEJO)?;
        records.retain(|r| r.id != connection_id);
        connection::save_records(FORGEJO, &records)?;
        publish_changed(&app);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn forgejo_update_scope(
    app: AppHandle,
    connection_id: String,
    assigned_only: bool,
) -> CmdResult<ForgejoConnection> {
    run_blocking(move || {
        let mut records = connection::load_records(FORGEJO)?;
        let record = records
            .iter_mut()
            .find(|r| r.id == connection_id)
            .ok_or_else(|| anyhow!("No Forgejo connection matches {connection_id}"))?;
        record.scope = ProviderScope {
            assigned_only,
            filter: json!({}),
        };
        let connection = to_connection(record);
        connection::save_records(FORGEJO, &records)?;
        publish_changed(&app);
        Ok(connection)
    })
    .await
}

#[tauri::command]
pub async fn forgejo_list_inbox_items(
    app: AppHandle,
    cursors: Option<HashMap<String, String>>,
    limit: Option<u32>,
) -> CmdResult<InboxPage> {
    let limit = limit.unwrap_or(30).clamp(1, 100);
    run_blocking(move || feed::list_inbox(&app, FORGEJO, cursors, limit)).await
}

#[tauri::command]
pub async fn forgejo_search_issues(
    app: AppHandle,
    query: String,
    cursors: Option<HashMap<String, String>>,
    limit: Option<u32>,
) -> CmdResult<InboxPage> {
    let limit = limit.unwrap_or(30).clamp(1, 100);
    run_blocking(move || feed::search(&app, FORGEJO, &query, cursors, limit)).await
}

#[tauri::command]
pub async fn forgejo_get_issue(
    app: AppHandle,
    connection_id: String,
    issue_id: String,
) -> CmdResult<IssueDetail> {
    run_blocking(move || feed::get_one(&app, FORGEJO, &connection_id, &issue_id)).await
}

/// Normalize a user-entered instance URL: trim, default to `https://`, and
/// drop any trailing slash so the stored base is clean.
fn normalize_host(host: &str) -> anyhow::Result<String> {
    let trimmed = host.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        bail!("Enter your Forgejo instance URL (e.g. https://codeberg.org).");
    }
    let with_scheme = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    Ok(with_scheme)
}
