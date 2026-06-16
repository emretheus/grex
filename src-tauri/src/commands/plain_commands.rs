//! IPC commands for the Plain Context source.
//!
//! The read feed delegates to the provider-agnostic `issues::feed` helpers;
//! connect / disconnect are Plain-shaped (a single Bearer API key) and operate
//! on the generic `issues::{connection,credentials}` store keyed by
//! `ProviderKind::Plain`. Plain threads aren't assignable to us, so there's no
//! scope toggle.

use std::collections::HashMap;

use anyhow::{anyhow, bail};
use chrono::Utc;
use serde::Serialize;
use tauri::AppHandle;

use crate::issues::connection::{self, ConnectionRecord};
use crate::issues::provider::ProviderKind;
use crate::issues::providers::plain;
use crate::issues::types::{InboxPage, IssueDetail};
use crate::issues::{credentials, feed};
use crate::ui_sync::{self, UiMutationEvent};

use super::common::{run_blocking, CmdResult};

const PLAIN: ProviderKind = ProviderKind::Plain;

/// One connected Plain workspace surfaced to the frontend settings + inbox.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlainConnection {
    pub id: String,
    pub workspace_name: String,
}

fn to_connection(record: &ConnectionRecord) -> PlainConnection {
    PlainConnection {
        id: record.id.clone(),
        workspace_name: record.display_name.clone(),
    }
}

fn publish_changed(app: &AppHandle) {
    ui_sync::publish(
        app,
        UiMutationEvent::IssueConnectionChanged { provider: PLAIN },
    );
}

#[tauri::command]
pub async fn plain_connections() -> CmdResult<Vec<PlainConnection>> {
    run_blocking(|| {
        Ok(connection::load_records(PLAIN)?
            .iter()
            .map(to_connection)
            .collect())
    })
    .await
}

/// Validate the API key against Plain, then persist the key + an upserted
/// connection record. An invalid key is never stored.
#[tauri::command]
pub async fn plain_connect(app: AppHandle, api_key: String) -> CmdResult<PlainConnection> {
    run_blocking(move || {
        let key = api_key.trim().to_string();
        if key.is_empty() {
            bail!("Paste your Plain API key to connect.");
        }
        let identity = plain::validate(&key)?;

        let records = connection::load_records(PLAIN)?;
        let upsert = connection::upsert_connected(
            records,
            &identity.account_key,
            &identity.display_name,
            &identity.user_name,
            Utc::now().timestamp(),
        );
        credentials::store(PLAIN, &upsert.id, &key)?;
        connection::save_records(PLAIN, &upsert.records)?;

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
pub async fn plain_disconnect(app: AppHandle, connection_id: String) -> CmdResult<()> {
    run_blocking(move || {
        let _ = credentials::clear(PLAIN, &connection_id);
        let mut records = connection::load_records(PLAIN)?;
        records.retain(|r| r.id != connection_id);
        connection::save_records(PLAIN, &records)?;
        publish_changed(&app);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn plain_list_inbox_items(
    app: AppHandle,
    cursors: Option<HashMap<String, String>>,
    limit: Option<u32>,
) -> CmdResult<InboxPage> {
    let limit = limit.unwrap_or(30).clamp(1, 100);
    run_blocking(move || feed::list_inbox(&app, PLAIN, cursors, limit)).await
}

#[tauri::command]
pub async fn plain_search_issues(
    app: AppHandle,
    query: String,
    cursors: Option<HashMap<String, String>>,
    limit: Option<u32>,
) -> CmdResult<InboxPage> {
    let limit = limit.unwrap_or(30).clamp(1, 100);
    run_blocking(move || feed::search(&app, PLAIN, &query, cursors, limit)).await
}

#[tauri::command]
pub async fn plain_get_issue(
    app: AppHandle,
    connection_id: String,
    issue_id: String,
) -> CmdResult<IssueDetail> {
    run_blocking(move || feed::get_one(&app, PLAIN, &connection_id, &issue_id)).await
}
