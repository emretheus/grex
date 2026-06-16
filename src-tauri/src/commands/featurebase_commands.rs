//! IPC commands for the Featurebase Context source.
//!
//! The read feed delegates to the provider-agnostic `issues::feed` helpers;
//! connect / disconnect are Featurebase-shaped (API key + public feedback URL)
//! and operate on the generic `issues::{connection,credentials}` store keyed by
//! `ProviderKind::Featurebase`. Featurebase posts aren't assignable, so there's
//! no scope toggle.

use std::collections::HashMap;

use anyhow::{anyhow, bail};
use chrono::Utc;
use serde::Serialize;
use serde_json::json;
use tauri::AppHandle;

use crate::issues::connection::{self, ConnectionRecord};
use crate::issues::provider::ProviderKind;
use crate::issues::providers::featurebase;
use crate::issues::types::{InboxPage, IssueDetail};
use crate::issues::{credentials, feed};
use crate::ui_sync::{self, UiMutationEvent};

use super::common::{run_blocking, CmdResult};

const FEATUREBASE: ProviderKind = ProviderKind::Featurebase;

/// One connected Featurebase org surfaced to the frontend settings + inbox.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeaturebaseConnection {
    pub id: String,
    pub org_name: String,
}

fn to_connection(record: &ConnectionRecord) -> FeaturebaseConnection {
    FeaturebaseConnection {
        id: record.id.clone(),
        org_name: record.display_name.clone(),
    }
}

fn publish_changed(app: &AppHandle) {
    ui_sync::publish(
        app,
        UiMutationEvent::IssueConnectionChanged {
            provider: FEATUREBASE,
        },
    );
}

#[tauri::command]
pub async fn featurebase_connections() -> CmdResult<Vec<FeaturebaseConnection>> {
    run_blocking(|| {
        Ok(connection::load_records(FEATUREBASE)?
            .iter()
            .map(to_connection)
            .collect())
    })
    .await
}

/// Validate `{apiKey,orgUrl}` against Featurebase, then persist the credentials
/// + an upserted connection record. An invalid bundle is never stored.
#[tauri::command]
pub async fn featurebase_connect(
    app: AppHandle,
    api_key: String,
    org_url: String,
) -> CmdResult<FeaturebaseConnection> {
    run_blocking(move || {
        let api_key = api_key.trim().to_string();
        let org_url = normalize_org_url(&org_url)?;
        if api_key.is_empty() {
            bail!("Paste your Featurebase API key to connect.");
        }
        let secret = json!({ "apiKey": api_key, "orgUrl": org_url }).to_string();
        let identity = featurebase::validate(&secret)?;

        let records = connection::load_records(FEATUREBASE)?;
        let upsert = connection::upsert_connected(
            records,
            &identity.account_key,
            &identity.display_name,
            &identity.user_name,
            Utc::now().timestamp(),
        );
        credentials::store(FEATUREBASE, &upsert.id, &secret)?;
        connection::save_records(FEATUREBASE, &upsert.records)?;

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
pub async fn featurebase_disconnect(app: AppHandle, connection_id: String) -> CmdResult<()> {
    run_blocking(move || {
        let _ = credentials::clear(FEATUREBASE, &connection_id);
        let mut records = connection::load_records(FEATUREBASE)?;
        records.retain(|r| r.id != connection_id);
        connection::save_records(FEATUREBASE, &records)?;
        publish_changed(&app);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn featurebase_list_inbox_items(
    app: AppHandle,
    cursors: Option<HashMap<String, String>>,
    limit: Option<u32>,
) -> CmdResult<InboxPage> {
    let limit = limit.unwrap_or(30).clamp(1, 100);
    run_blocking(move || feed::list_inbox(&app, FEATUREBASE, cursors, limit)).await
}

#[tauri::command]
pub async fn featurebase_search_issues(
    app: AppHandle,
    query: String,
    cursors: Option<HashMap<String, String>>,
    limit: Option<u32>,
) -> CmdResult<InboxPage> {
    let limit = limit.unwrap_or(30).clamp(1, 100);
    run_blocking(move || feed::search(&app, FEATUREBASE, &query, cursors, limit)).await
}

#[tauri::command]
pub async fn featurebase_get_issue(
    app: AppHandle,
    connection_id: String,
    issue_id: String,
) -> CmdResult<IssueDetail> {
    run_blocking(move || feed::get_one(&app, FEATUREBASE, &connection_id, &issue_id)).await
}

/// Normalize the org's public feedback URL: trim, default to `https://`, drop
/// any trailing slash. Stored both as the dedupe key and the link base.
fn normalize_org_url(org_url: &str) -> anyhow::Result<String> {
    let trimmed = org_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        bail!("Enter your Featurebase feedback URL (e.g. https://acme.featurebase.app).");
    }
    let with_scheme = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    Ok(with_scheme)
}
