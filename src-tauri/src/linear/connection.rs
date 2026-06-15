//! Persistence + lookup for the set of connected Linear workspaces.
//!
//! The list of [`LinearConnectionRecord`] lives as a JSON array in the
//! `settings` KV store under [`CONNECTIONS_KEY`]; each record's API key
//! lives in the keychain keyed by the record id (see `credentials.rs`).
//!
//! Pre-multi-workspace builds stored a single connection as a
//! [`LinearConnectionMeta`] under [`CONNECTION_META_KEY`] plus one keychain
//! entry under [`credentials::LEGACY_ACCOUNT`]. [`load_records`] migrates
//! that shape into the new array on first read — non-destructively and
//! lazily, so existing single-connection installs keep working untouched.

use anyhow::Result;

use super::types::{LinearConnectionMeta, LinearConnectionRecord, LinearScope};
use super::{credentials, CONNECTIONS_KEY, CONNECTION_META_KEY};
use crate::models::settings;

/// Load the persisted connection records, migrating the legacy
/// single-connection shape on first read.
pub fn load_records() -> Result<Vec<LinearConnectionRecord>> {
    if let Some(records) =
        settings::load_setting_json::<Vec<LinearConnectionRecord>>(CONNECTIONS_KEY)?
    {
        return Ok(records);
    }
    let migrated = migrate_legacy()?;
    if !migrated.is_empty() {
        settings::upsert_setting_json(CONNECTIONS_KEY, &migrated)?;
    }
    Ok(migrated)
}

/// Persist the full record list, replacing whatever was there.
pub fn save_records(records: &[LinearConnectionRecord]) -> Result<()> {
    settings::upsert_setting_json(CONNECTIONS_KEY, &records.to_vec())
}

/// Synthesize a single record from the legacy keychain entry + metadata, if
/// present. Returns an empty vec when no legacy connection exists.
fn migrate_legacy() -> Result<Vec<LinearConnectionRecord>> {
    if credentials::load_api_key(credentials::LEGACY_ACCOUNT)?.is_none() {
        return Ok(Vec::new());
    }
    let meta: Option<LinearConnectionMeta> = settings::load_setting_json(CONNECTION_META_KEY)?;
    Ok(vec![record_from_legacy(meta)])
}

/// Build the migrated record from optional legacy metadata. Split out so it
/// can be unit-tested without touching the keychain/settings store.
fn record_from_legacy(meta: Option<LinearConnectionMeta>) -> LinearConnectionRecord {
    LinearConnectionRecord {
        id: credentials::LEGACY_ACCOUNT.to_string(),
        // The legacy shape never captured the org id; left empty. A later
        // reconnect of the same org backfills it via `upsert_connected`.
        org_id: String::new(),
        workspace_name: meta
            .as_ref()
            .map(|m| m.workspace_name.clone())
            .unwrap_or_default(),
        user_name: meta
            .as_ref()
            .map(|m| m.user_name.clone())
            .unwrap_or_default(),
        connected_at: meta.as_ref().map(|m| m.connected_at).unwrap_or(0),
        scope: LinearScope::Assigned,
        team_ids: Vec::new(),
        project_ids: Vec::new(),
    }
}

/// Result of [`upsert_connected`]: the connection id the key should be
/// stored under, plus the full updated record list to persist.
pub struct UpsertResult {
    pub id: String,
    pub records: Vec<LinearConnectionRecord>,
}

/// Merge a freshly-validated connection into `records`, deduping by org id.
///
/// If a record already exists for `org_id` (or a legacy record is being
/// reconnected to the same org), its names + connected-at are refreshed and
/// its existing scope/filters are preserved; otherwise a new record is
/// appended with id == `org_id` and the default `Assigned` scope. Returns
/// the id the API key must be stored under.
pub fn upsert_connected(
    mut records: Vec<LinearConnectionRecord>,
    org_id: &str,
    workspace_name: &str,
    user_name: &str,
    connected_at: i64,
) -> UpsertResult {
    if let Some(existing) = records
        .iter_mut()
        .find(|r| !org_id.is_empty() && r.org_id == org_id)
    {
        existing.workspace_name = workspace_name.to_string();
        existing.user_name = user_name.to_string();
        existing.connected_at = connected_at;
        let id = existing.id.clone();
        return UpsertResult { id, records };
    }

    let id = org_id.to_string();
    records.push(LinearConnectionRecord {
        id: id.clone(),
        org_id: org_id.to_string(),
        workspace_name: workspace_name.to_string(),
        user_name: user_name.to_string(),
        connected_at,
        scope: LinearScope::Assigned,
        team_ids: Vec::new(),
        project_ids: Vec::new(),
    });
    UpsertResult { id, records }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec(id: &str, org: &str, scope: LinearScope) -> LinearConnectionRecord {
        LinearConnectionRecord {
            id: id.to_string(),
            org_id: org.to_string(),
            workspace_name: "Acme".to_string(),
            user_name: "Ada".to_string(),
            connected_at: 1,
            scope,
            team_ids: vec!["t1".to_string()],
            project_ids: Vec::new(),
        }
    }

    #[test]
    fn legacy_record_reuses_account_id_and_defaults_to_assigned() {
        let meta = Some(LinearConnectionMeta {
            workspace_name: "Acme".to_string(),
            user_name: "Ada".to_string(),
            connected_at: 42,
        });
        let record = record_from_legacy(meta);
        assert_eq!(record.id, credentials::LEGACY_ACCOUNT);
        assert!(record.org_id.is_empty());
        assert_eq!(record.workspace_name, "Acme");
        assert_eq!(record.connected_at, 42);
        assert_eq!(record.scope, LinearScope::Assigned);
    }

    #[test]
    fn legacy_record_tolerates_missing_metadata() {
        let record = record_from_legacy(None);
        assert_eq!(record.id, credentials::LEGACY_ACCOUNT);
        assert!(record.workspace_name.is_empty());
        assert_eq!(record.connected_at, 0);
    }

    #[test]
    fn upsert_adds_new_connection_keyed_by_org() {
        let result = upsert_connected(Vec::new(), "org-1", "Acme", "Ada", 7);
        assert_eq!(result.id, "org-1");
        assert_eq!(result.records.len(), 1);
        assert_eq!(result.records[0].org_id, "org-1");
        assert_eq!(result.records[0].scope, LinearScope::Assigned);
    }

    #[test]
    fn upsert_refreshes_existing_org_and_preserves_scope() {
        let existing = vec![rec("org-1", "org-1", LinearScope::All)];
        let result = upsert_connected(existing, "org-1", "Acme Renamed", "Ada B", 9);
        assert_eq!(result.id, "org-1");
        assert_eq!(result.records.len(), 1);
        // Scope + filters survive a reconnect.
        assert_eq!(result.records[0].scope, LinearScope::All);
        assert_eq!(result.records[0].team_ids, vec!["t1".to_string()]);
        // Names + timestamp refresh.
        assert_eq!(result.records[0].workspace_name, "Acme Renamed");
        assert_eq!(result.records[0].connected_at, 9);
    }

    #[test]
    fn upsert_appends_distinct_orgs() {
        let existing = vec![rec("org-1", "org-1", LinearScope::Assigned)];
        let result = upsert_connected(existing, "org-2", "Beta", "Bob", 3);
        assert_eq!(result.records.len(), 2);
        assert_eq!(result.id, "org-2");
    }
}
