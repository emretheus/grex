//! IPC commands for the Linear Context source.
//!
//! The read feed (`linear_list_inbox_items` / `linear_search_issues` /
//! `linear_get_issue`) is delegated to the provider-agnostic `issues::feed`
//! helpers, which merge across connected workspaces and evict any connection
//! whose key stops authenticating. The Linear-specific connect / disconnect /
//! scope / team / project commands stay here because their inputs and the
//! settings pickers are Linear-shaped; they operate on the pre-existing
//! `crate::linear` store and keychain.

use std::collections::HashMap;

use anyhow::{anyhow, bail};
use chrono::Utc;
use tauri::AppHandle;

use crate::issues::feed;
use crate::issues::provider::ProviderKind;
use crate::issues::types::{InboxPage, IssueDetail};
use crate::linear::api::{self as linear_api, LinearAuthError};
use crate::linear::types::{LinearConnection, LinearProject, LinearScope, LinearTeam};
use crate::linear::{connection, credentials};
use crate::ui_sync::{self, UiMutationEvent};

use super::common::{run_blocking, CmdResult};

const LINEAR: ProviderKind = ProviderKind::Linear;

fn publish_changed(app: &AppHandle) {
    ui_sync::publish(
        app,
        UiMutationEvent::IssueConnectionChanged { provider: LINEAR },
    );
}

/// Every connected Linear workspace, with its scope + filter preferences.
/// A non-empty list is the "connected" signal the UI branches on.
#[tauri::command]
pub async fn linear_connections() -> CmdResult<Vec<LinearConnection>> {
    run_blocking(|| {
        let records = connection::load_records()?;
        Ok(records.iter().map(|r| r.to_connection()).collect())
    })
    .await
}

/// Validate a pasted personal API key (by resolving its viewer), then persist
/// it + an upserted connection record. Reconnecting the same org refreshes its
/// names and keeps its scope; a new org is appended with the default
/// `Assigned` scope. An invalid key is never stored.
#[tauri::command]
pub async fn linear_connect(app: AppHandle, api_key: String) -> CmdResult<LinearConnection> {
    run_blocking(move || {
        let key = api_key.trim().to_string();
        if key.is_empty() {
            bail!("Paste your Linear personal API key to connect.");
        }
        let viewer = linear_api::viewer_with_key(&key).map_err(|error| {
            if linear_api::is_invalid_auth(&error) {
                anyhow!("That Linear API key was rejected. Double-check you copied it from linear.app/settings/api.")
            } else {
                error.context("Couldn't reach Linear to validate the key")
            }
        })?;

        let records = connection::load_records()?;
        let upsert = connection::upsert_connected(
            records,
            &viewer.org_id,
            &viewer.org_name,
            &viewer.user_name,
            Utc::now().timestamp(),
        );
        credentials::store_api_key(&upsert.id, &key)?;
        connection::save_records(&upsert.records)?;

        let connection = upsert
            .records
            .iter()
            .find(|r| r.id == upsert.id)
            .map(|r| r.to_connection())
            .ok_or_else(|| anyhow!("Connection record vanished after connect"))?;

        publish_changed(&app);
        Ok(connection)
    })
    .await
}

/// Disconnect one workspace: wipe its stored key + record and notify the UI.
#[tauri::command]
pub async fn linear_disconnect(app: AppHandle, connection_id: String) -> CmdResult<()> {
    run_blocking(move || {
        let _ = credentials::clear_api_key(&connection_id);
        let mut records = connection::load_records()?;
        records.retain(|r| r.id != connection_id);
        connection::save_records(&records)?;
        publish_changed(&app);
        Ok(())
    })
    .await
}

/// Update a workspace's feed scope + team/project filters.
#[tauri::command]
pub async fn linear_update_scope(
    app: AppHandle,
    connection_id: String,
    scope: LinearScope,
    team_ids: Vec<String>,
    project_ids: Vec<String>,
) -> CmdResult<LinearConnection> {
    run_blocking(move || {
        let mut records = connection::load_records()?;
        let record = records
            .iter_mut()
            .find(|r| r.id == connection_id)
            .ok_or_else(|| anyhow!("No Linear connection matches {connection_id}"))?;
        record.scope = scope;
        // When narrowing back to "assigned", drop the team/project filters so
        // a later switch to "all" starts clean rather than silently scoped.
        record.team_ids = if scope == LinearScope::Assigned {
            Vec::new()
        } else {
            team_ids
        };
        record.project_ids = if scope == LinearScope::Assigned {
            Vec::new()
        } else {
            project_ids
        };
        let connection = record.to_connection();
        connection::save_records(&records)?;
        publish_changed(&app);
        Ok(connection)
    })
    .await
}

/// The merged assigned/all feed across every connected workspace, most
/// recently updated first.
#[tauri::command]
pub async fn linear_list_inbox_items(
    app: AppHandle,
    cursors: Option<HashMap<String, String>>,
    limit: Option<u32>,
) -> CmdResult<InboxPage> {
    let limit = limit.unwrap_or(30).clamp(1, 100);
    run_blocking(move || feed::list_inbox(&app, LINEAR, cursors, limit)).await
}

/// Free-text issue search merged across every connected workspace.
#[tauri::command]
pub async fn linear_search_issues(
    app: AppHandle,
    query: String,
    cursors: Option<HashMap<String, String>>,
    limit: Option<u32>,
) -> CmdResult<InboxPage> {
    let limit = limit.unwrap_or(30).clamp(1, 100);
    run_blocking(move || feed::search(&app, LINEAR, &query, cursors, limit)).await
}

/// Fetch one issue's full detail from a specific workspace.
#[tauri::command]
pub async fn linear_get_issue(
    app: AppHandle,
    connection_id: String,
    issue_id: String,
) -> CmdResult<IssueDetail> {
    run_blocking(move || feed::get_one(&app, LINEAR, &connection_id, &issue_id)).await
}

/// The teams a workspace's key can see, for the settings team picker.
#[tauri::command]
pub async fn linear_list_teams(
    app: AppHandle,
    connection_id: String,
) -> CmdResult<Vec<LinearTeam>> {
    run_blocking(move || {
        let key = connection_key(&connection_id)?;
        handle_conn_result(&app, &connection_id, linear_api::list_teams(&key))
    })
    .await
}

/// The projects a workspace's key can see, optionally scoped to one team.
#[tauri::command]
pub async fn linear_list_projects(
    app: AppHandle,
    connection_id: String,
    team_id: Option<String>,
) -> CmdResult<Vec<LinearProject>> {
    run_blocking(move || {
        let key = connection_key(&connection_id)?;
        handle_conn_result(
            &app,
            &connection_id,
            linear_api::list_projects(&key, team_id.as_deref()),
        )
    })
    .await
}

/// The stored API key for `connection_id`, or [`LinearAuthError`] when none is
/// saved (so the caller's `handle_conn_result` reconciles the UI).
fn connection_key(connection_id: &str) -> anyhow::Result<String> {
    credentials::load_api_key(connection_id)?.ok_or_else(|| anyhow!(LinearAuthError))
}

/// On auth failure for a single connection, wipe just that connection's key +
/// record and broadcast the change. Other errors propagate. Used by the
/// Linear-specific team/project pickers; the read feed handles eviction itself.
fn handle_conn_result<T>(
    app: &AppHandle,
    connection_id: &str,
    result: anyhow::Result<T>,
) -> anyhow::Result<T> {
    match result {
        Ok(value) => Ok(value),
        Err(error) => {
            if linear_api::is_invalid_auth(&error) {
                let _ = credentials::clear_api_key(connection_id);
                if let Ok(mut records) = connection::load_records() {
                    records.retain(|r| r.id != connection_id);
                    let _ = connection::save_records(&records);
                }
                publish_changed(app);
            }
            Err(error)
        }
    }
}
