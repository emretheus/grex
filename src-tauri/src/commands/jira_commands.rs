//! IPC commands for the Jira Context source.
//!
//! The read feed delegates to the provider-agnostic `issues::feed` helpers;
//! connect / disconnect / scope / project-picker commands are Jira-shaped
//! (site + email + token credentials, project-key filters) and operate on the
//! generic `issues::{connection,credentials}` store keyed by
//! `ProviderKind::Jira`.

use std::collections::HashMap;

use anyhow::{anyhow, bail};
use chrono::Utc;
use serde::Serialize;
use serde_json::json;
use tauri::AppHandle;

use crate::issues::connection::{self, ConnectionRecord};
use crate::issues::provider::{ProviderKind, ProviderScope};
use crate::issues::providers::jira::{self, JiraProject};
use crate::issues::types::{InboxPage, IssueDetail};
use crate::issues::{credentials, feed};
use crate::ui_sync::{self, UiMutationEvent};

use super::common::{run_blocking, CmdResult};

const JIRA: ProviderKind = ProviderKind::Jira;

/// One connected Jira site surfaced to the frontend settings + inbox.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraConnection {
    pub id: String,
    pub site_name: String,
    pub user_name: String,
    pub assigned_only: bool,
    pub project_keys: Vec<String>,
}

fn to_connection(record: &ConnectionRecord) -> JiraConnection {
    JiraConnection {
        id: record.id.clone(),
        site_name: record.display_name.clone(),
        user_name: record.user_name.clone(),
        assigned_only: record.scope.assigned_only,
        project_keys: record
            .scope
            .filter
            .get("projectKeys")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|e| e.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
    }
}

fn publish_changed(app: &AppHandle) {
    ui_sync::publish(
        app,
        UiMutationEvent::IssueConnectionChanged { provider: JIRA },
    );
}

#[tauri::command]
pub async fn jira_connections() -> CmdResult<Vec<JiraConnection>> {
    run_blocking(|| {
        Ok(connection::load_records(JIRA)?
            .iter()
            .map(to_connection)
            .collect())
    })
    .await
}

/// Validate `{site,email,token}` against Jira, then persist the credentials +
/// an upserted connection record. An invalid bundle is never stored.
#[tauri::command]
pub async fn jira_connect(
    app: AppHandle,
    site: String,
    email: String,
    token: String,
) -> CmdResult<JiraConnection> {
    run_blocking(move || {
        let site = site.trim().trim_end_matches('/').to_string();
        let email = email.trim().to_string();
        let token = token.trim().to_string();
        if site.is_empty() || email.is_empty() || token.is_empty() {
            bail!("Enter your Jira site URL, email, and API token to connect.");
        }
        let secret = json!({ "site": site, "email": email, "token": token }).to_string();
        let identity = jira::validate(&secret)?;

        let records = connection::load_records(JIRA)?;
        let upsert = connection::upsert_connected(
            records,
            &identity.account_key,
            &identity.display_name,
            &identity.user_name,
            Utc::now().timestamp(),
        );
        credentials::store(JIRA, &upsert.id, &secret)?;
        connection::save_records(JIRA, &upsert.records)?;

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
pub async fn jira_disconnect(app: AppHandle, connection_id: String) -> CmdResult<()> {
    run_blocking(move || {
        let _ = credentials::clear(JIRA, &connection_id);
        let mut records = connection::load_records(JIRA)?;
        records.retain(|r| r.id != connection_id);
        connection::save_records(JIRA, &records)?;
        publish_changed(&app);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn jira_update_scope(
    app: AppHandle,
    connection_id: String,
    assigned_only: bool,
    project_keys: Vec<String>,
) -> CmdResult<JiraConnection> {
    run_blocking(move || {
        let mut records = connection::load_records(JIRA)?;
        let record = records
            .iter_mut()
            .find(|r| r.id == connection_id)
            .ok_or_else(|| anyhow!("No Jira connection matches {connection_id}"))?;
        record.scope = ProviderScope {
            assigned_only,
            filter: json!({ "projectKeys": project_keys }),
        };
        let connection = to_connection(record);
        connection::save_records(JIRA, &records)?;
        publish_changed(&app);
        Ok(connection)
    })
    .await
}

#[tauri::command]
pub async fn jira_list_inbox_items(
    app: AppHandle,
    cursors: Option<HashMap<String, String>>,
    limit: Option<u32>,
) -> CmdResult<InboxPage> {
    let limit = limit.unwrap_or(30).clamp(1, 100);
    run_blocking(move || feed::list_inbox(&app, JIRA, cursors, limit)).await
}

#[tauri::command]
pub async fn jira_search_issues(
    app: AppHandle,
    query: String,
    cursors: Option<HashMap<String, String>>,
    limit: Option<u32>,
) -> CmdResult<InboxPage> {
    let limit = limit.unwrap_or(30).clamp(1, 100);
    run_blocking(move || feed::search(&app, JIRA, &query, cursors, limit)).await
}

#[tauri::command]
pub async fn jira_get_issue(
    app: AppHandle,
    connection_id: String,
    issue_id: String,
) -> CmdResult<IssueDetail> {
    run_blocking(move || feed::get_one(&app, JIRA, &connection_id, &issue_id)).await
}

/// Projects a connection's credentials can see, for the settings picker.
#[tauri::command]
pub async fn jira_list_projects(connection_id: String) -> CmdResult<Vec<JiraProject>> {
    run_blocking(move || {
        let secret = feed::connection_secret(JIRA, &connection_id)?;
        jira::list_projects(&secret)
    })
    .await
}
