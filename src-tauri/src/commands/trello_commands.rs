//! IPC commands for the Trello Context source.
//!
//! The read feed delegates to the provider-agnostic `issues::feed` helpers;
//! connect / disconnect / scope / board-picker commands are Trello-shaped
//! (key + token credentials, board/list filters) and operate on the generic
//! `issues::{connection,credentials}` store keyed by `ProviderKind::Trello`.

use std::collections::HashMap;

use anyhow::{anyhow, bail};
use chrono::Utc;
use serde::Serialize;
use serde_json::json;
use tauri::AppHandle;

use crate::issues::connection::{self, ConnectionRecord};
use crate::issues::provider::{ProviderKind, ProviderScope};
use crate::issues::providers::trello::{self, TrelloBoard};
use crate::issues::types::{InboxPage, IssueDetail};
use crate::issues::{credentials, feed};
use crate::ui_sync::{self, UiMutationEvent};

use super::common::{run_blocking, CmdResult};

const TRELLO: ProviderKind = ProviderKind::Trello;

/// One connected Trello account surfaced to the frontend settings + inbox.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrelloConnection {
    pub id: String,
    pub member_name: String,
    pub assigned_only: bool,
    pub board_ids: Vec<String>,
}

fn string_vec(record: &ConnectionRecord, key: &str) -> Vec<String> {
    record
        .scope
        .filter
        .get(key)
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|e| e.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

fn to_connection(record: &ConnectionRecord) -> TrelloConnection {
    TrelloConnection {
        id: record.id.clone(),
        member_name: record.display_name.clone(),
        assigned_only: record.scope.assigned_only,
        board_ids: string_vec(record, "boardIds"),
    }
}

fn publish_changed(app: &AppHandle) {
    ui_sync::publish(
        app,
        UiMutationEvent::IssueConnectionChanged { provider: TRELLO },
    );
}

#[tauri::command]
pub async fn trello_connections() -> CmdResult<Vec<TrelloConnection>> {
    run_blocking(|| {
        Ok(connection::load_records(TRELLO)?
            .iter()
            .map(to_connection)
            .collect())
    })
    .await
}

/// Validate `{key,token}` against Trello, then persist the credentials + an
/// upserted connection record. An invalid bundle is never stored.
#[tauri::command]
pub async fn trello_connect(
    app: AppHandle,
    api_key: String,
    token: String,
) -> CmdResult<TrelloConnection> {
    run_blocking(move || {
        let key = api_key.trim().to_string();
        let token = token.trim().to_string();
        if key.is_empty() || token.is_empty() {
            bail!("Enter your Trello API key and token to connect.");
        }
        let secret = json!({ "key": key, "token": token }).to_string();
        let identity = trello::validate(&secret)?;

        let records = connection::load_records(TRELLO)?;
        let upsert = connection::upsert_connected(
            records,
            &identity.account_key,
            &identity.display_name,
            &identity.user_name,
            Utc::now().timestamp(),
        );
        credentials::store(TRELLO, &upsert.id, &secret)?;
        connection::save_records(TRELLO, &upsert.records)?;

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
pub async fn trello_disconnect(app: AppHandle, connection_id: String) -> CmdResult<()> {
    run_blocking(move || {
        let _ = credentials::clear(TRELLO, &connection_id);
        let mut records = connection::load_records(TRELLO)?;
        records.retain(|r| r.id != connection_id);
        connection::save_records(TRELLO, &records)?;
        publish_changed(&app);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn trello_update_scope(
    app: AppHandle,
    connection_id: String,
    assigned_only: bool,
    board_ids: Vec<String>,
) -> CmdResult<TrelloConnection> {
    run_blocking(move || {
        let mut records = connection::load_records(TRELLO)?;
        let record = records
            .iter_mut()
            .find(|r| r.id == connection_id)
            .ok_or_else(|| anyhow!("No Trello connection matches {connection_id}"))?;
        record.scope = ProviderScope {
            assigned_only,
            filter: json!({ "boardIds": board_ids }),
        };
        let connection = to_connection(record);
        connection::save_records(TRELLO, &records)?;
        publish_changed(&app);
        Ok(connection)
    })
    .await
}

#[tauri::command]
pub async fn trello_list_inbox_items(
    app: AppHandle,
    cursors: Option<HashMap<String, String>>,
    limit: Option<u32>,
) -> CmdResult<InboxPage> {
    let limit = limit.unwrap_or(30).clamp(1, 100);
    run_blocking(move || feed::list_inbox(&app, TRELLO, cursors, limit)).await
}

#[tauri::command]
pub async fn trello_search_issues(
    app: AppHandle,
    query: String,
    cursors: Option<HashMap<String, String>>,
    limit: Option<u32>,
) -> CmdResult<InboxPage> {
    let limit = limit.unwrap_or(30).clamp(1, 100);
    run_blocking(move || feed::search(&app, TRELLO, &query, cursors, limit)).await
}

#[tauri::command]
pub async fn trello_get_issue(
    app: AppHandle,
    connection_id: String,
    issue_id: String,
) -> CmdResult<IssueDetail> {
    run_blocking(move || feed::get_one(&app, TRELLO, &connection_id, &issue_id)).await
}

/// The member's boards, for the settings board picker.
#[tauri::command]
pub async fn trello_list_boards(connection_id: String) -> CmdResult<Vec<TrelloBoard>> {
    run_blocking(move || {
        let secret = feed::connection_secret(TRELLO, &connection_id)?;
        trello::list_boards(&secret)
    })
    .await
}
