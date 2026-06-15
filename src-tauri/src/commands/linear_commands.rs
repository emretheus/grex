//! IPC commands for the Linear Context source.
//!
//! `linear_connect` validates + stores a pasted personal API key (one per
//! workspace; multiple orgs can be connected at once); `linear_connections`
//! lists them; `linear_update_scope` sets a workspace's feed scope + team /
//! project filters. `linear_list_inbox_items` / `linear_search_issues` read
//! issues across every connected workspace and merge them into one feed;
//! `linear_get_issue` / `linear_list_teams` / `linear_list_projects` read a
//! single workspace by connection id. Read paths funnel auth failures
//! through `handle_conn_result`, which wipes only the failing connection and
//! broadcasts `LinearConnectionChanged` so the UI reconciles.

use std::collections::{BTreeMap, HashMap};

use anyhow::{anyhow, bail};
use chrono::Utc;
use tauri::AppHandle;

use crate::linear::api::LinearAuthError;
use crate::linear::types::{
    LinearConnection, LinearInboxItem, LinearInboxPage, LinearIssueDetail, LinearProject,
    LinearScope, LinearTeam,
};
use crate::linear::{api as linear_api, connection, credentials};
use crate::ui_sync::{self, UiMutationEvent};

use super::common::{run_blocking, CmdResult};

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

/// Validate a pasted personal API key (by resolving its viewer), then
/// persist it + an upserted connection record. Reconnecting the same org
/// refreshes its names and keeps its scope; a new org is appended with the
/// default `Assigned` scope. An invalid key is never stored.
#[tauri::command]
pub async fn linear_connect(app: AppHandle, api_key: String) -> CmdResult<LinearConnection> {
    run_blocking(move || {
        let key = api_key.trim().to_string();
        if key.is_empty() {
            bail!("Paste your Linear personal API key to connect.");
        }
        // Validate before persisting — a typo'd key must not look connected.
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

        ui_sync::publish(&app, UiMutationEvent::LinearConnectionChanged);
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
        ui_sync::publish(&app, UiMutationEvent::LinearConnectionChanged);
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
        ui_sync::publish(&app, UiMutationEvent::LinearConnectionChanged);
        Ok(connection)
    })
    .await
}

/// The merged assigned/all feed across every connected workspace, most
/// recently updated first. `cursors` is `None` on the first page (fetch
/// every connection) and the map returned by the previous page afterwards
/// (fetch only connections that still have more).
#[tauri::command]
pub async fn linear_list_inbox_items(
    app: AppHandle,
    cursors: Option<HashMap<String, String>>,
    limit: Option<u32>,
) -> CmdResult<LinearInboxPage> {
    let limit = limit.unwrap_or(30).clamp(1, 100);
    run_blocking(move || {
        merge_feed(&app, cursors, |key, record, cursor| {
            linear_api::list_issues(
                key,
                &record.id,
                record.scope,
                &record.team_ids,
                &record.project_ids,
                cursor,
                limit,
            )
        })
    })
    .await
}

/// Free-text issue search merged across every connected workspace.
#[tauri::command]
pub async fn linear_search_issues(
    app: AppHandle,
    query: String,
    cursors: Option<HashMap<String, String>>,
    limit: Option<u32>,
) -> CmdResult<LinearInboxPage> {
    let limit = limit.unwrap_or(30).clamp(1, 100);
    run_blocking(move || {
        merge_feed(&app, cursors, |key, record, cursor| {
            linear_api::search_issues(key, &record.id, &query, cursor, limit)
        })
    })
    .await
}

/// Fetch one issue's full detail from a specific workspace.
#[tauri::command]
pub async fn linear_get_issue(
    app: AppHandle,
    connection_id: String,
    issue_id: String,
) -> CmdResult<LinearIssueDetail> {
    run_blocking(move || {
        let key = connection_key(&connection_id)?;
        handle_conn_result(&app, &connection_id, linear_api::get_issue(&key, &issue_id))
    })
    .await
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

/// Run `fetch` for every connection the page params select, merging the
/// results into one feed sorted by recency. A connection whose key 401s is
/// wiped (key + record) and skipped rather than failing the whole feed.
fn merge_feed<F>(
    app: &AppHandle,
    cursors: Option<HashMap<String, String>>,
    fetch: F,
) -> anyhow::Result<LinearInboxPage>
where
    F: Fn(
        &str,
        &crate::linear::types::LinearConnectionRecord,
        Option<&str>,
    ) -> anyhow::Result<(Vec<LinearInboxItem>, Option<String>)>,
{
    let records = connection::load_records()?;
    let mut items: Vec<LinearInboxItem> = Vec::new();
    let mut next: BTreeMap<String, String> = BTreeMap::new();
    let mut auth_failed: Vec<String> = Vec::new();

    for record in &records {
        // First page (`cursors == None`): fetch every connection. Subsequent
        // pages: only connections still listed in the cursor map.
        let cursor = match &cursors {
            None => None,
            Some(map) => match map.get(&record.id) {
                Some(c) => Some(c.clone()),
                None => continue,
            },
        };
        let key = match credentials::load_api_key(&record.id)? {
            Some(k) => k,
            None => continue,
        };
        match fetch(&key, record, cursor.as_deref()) {
            Ok((page_items, next_cursor)) => {
                items.extend(page_items);
                if let Some(c) = next_cursor {
                    next.insert(record.id.clone(), c);
                }
            }
            Err(error) => {
                if linear_api::is_invalid_auth(&error) {
                    auth_failed.push(record.id.clone());
                } else {
                    return Err(error);
                }
            }
        }
    }

    if !auth_failed.is_empty() {
        for id in &auth_failed {
            let _ = credentials::clear_api_key(id);
        }
        let mut records = records;
        records.retain(|r| !auth_failed.contains(&r.id));
        connection::save_records(&records)?;
        ui_sync::publish(app, UiMutationEvent::LinearConnectionChanged);
    }

    // Merge ordering is exact within each fetched page and approximate
    // across workspaces — standard for a merged multi-source feed.
    items.sort_by_key(|item| std::cmp::Reverse(item.last_activity_at));
    Ok(LinearInboxPage {
        items,
        cursors: next,
    })
}

/// The stored API key for `connection_id`, or [`LinearAuthError`] when none
/// is saved (so the caller's `handle_conn_result` reconciles the UI).
fn connection_key(connection_id: &str) -> anyhow::Result<String> {
    credentials::load_api_key(connection_id)?.ok_or_else(|| anyhow!(LinearAuthError))
}

/// On auth failure for a single connection, wipe just that connection's key
/// + record and broadcast `LinearConnectionChanged`. Other errors propagate.
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
                ui_sync::publish(app, UiMutationEvent::LinearConnectionChanged);
            }
            Err(error)
        }
    }
}
