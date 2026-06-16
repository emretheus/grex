//! Generic persistence for connected accounts (Jira / Trello).
//!
//! The list of [`ConnectionRecord`] lives as a JSON array in the `settings`
//! KV store under `ProviderKind::connections_key()`; each record's secret
//! bundle lives in the keychain keyed by the record id (see `credentials.rs`).
//!
//! Linear deliberately does NOT use this module — it keeps its pre-existing
//! `linear::connection` store (and its legacy single-connection migration)
//! verbatim, so already-installed Linear connections keep working untouched.
//! `LinearProvider` adapts those records to the generic [`Connection`] shape
//! in memory.

use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::provider::{ProviderKind, ProviderScope};
use crate::models::settings;

/// Persisted per-connection record. The secret lives in the keychain keyed by
/// `id`; this is the non-secret metadata + scope the UI needs without a
/// network round-trip.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionRecord {
    /// Connection id == keychain account.
    pub id: String,
    /// Natural dedupe key (Jira `"<site>|<accountId>"`, Trello member id).
    #[serde(default)]
    pub account_key: String,
    /// Workspace / site display name.
    pub display_name: String,
    pub user_name: String,
    /// Unix seconds the connection was established.
    pub connected_at: i64,
    #[serde(default)]
    pub scope: ProviderScope,
}

pub fn load_records(kind: ProviderKind) -> Result<Vec<ConnectionRecord>> {
    Ok(
        settings::load_setting_json::<Vec<ConnectionRecord>>(kind.connections_key())?
            .unwrap_or_default(),
    )
}

pub fn save_records(kind: ProviderKind, records: &[ConnectionRecord]) -> Result<()> {
    settings::upsert_setting_json(kind.connections_key(), &records.to_vec())
}

/// Result of [`upsert_connected`]: the connection id the secret should be
/// stored under, plus the full updated record list to persist.
pub struct UpsertResult {
    pub id: String,
    pub records: Vec<ConnectionRecord>,
}

/// Merge a freshly-validated connection into `records`, deduping by
/// `account_key`. An existing record for the same account refreshes its
/// names + timestamp and keeps its scope; otherwise a new record is appended
/// with `id == account_key` and the default scope.
pub fn upsert_connected(
    mut records: Vec<ConnectionRecord>,
    account_key: &str,
    display_name: &str,
    user_name: &str,
    connected_at: i64,
) -> UpsertResult {
    if let Some(existing) = records
        .iter_mut()
        .find(|r| !account_key.is_empty() && r.account_key == account_key)
    {
        existing.display_name = display_name.to_string();
        existing.user_name = user_name.to_string();
        existing.connected_at = connected_at;
        let id = existing.id.clone();
        return UpsertResult { id, records };
    }

    let id = account_key.to_string();
    records.push(ConnectionRecord {
        id: id.clone(),
        account_key: account_key.to_string(),
        display_name: display_name.to_string(),
        user_name: user_name.to_string(),
        connected_at,
        scope: ProviderScope::default(),
    });
    UpsertResult { id, records }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec(id: &str, key: &str) -> ConnectionRecord {
        ConnectionRecord {
            id: id.into(),
            account_key: key.into(),
            display_name: "Acme".into(),
            user_name: "Ada".into(),
            connected_at: 1,
            scope: ProviderScope {
                assigned_only: true,
                filter: serde_json::json!({"projectKeys": ["X"]}),
            },
        }
    }

    #[test]
    fn upsert_appends_new_account() {
        let result = upsert_connected(Vec::new(), "site|acc", "Acme", "Ada", 7);
        assert_eq!(result.id, "site|acc");
        assert_eq!(result.records.len(), 1);
        assert_eq!(result.records[0].account_key, "site|acc");
    }

    #[test]
    fn upsert_refreshes_existing_account_and_preserves_scope() {
        let result = upsert_connected(
            vec![rec("site|acc", "site|acc")],
            "site|acc",
            "New",
            "Ada B",
            9,
        );
        assert_eq!(result.records.len(), 1);
        assert!(result.records[0].scope.assigned_only);
        assert_eq!(result.records[0].display_name, "New");
        assert_eq!(result.records[0].connected_at, 9);
    }

    #[test]
    fn upsert_appends_distinct_accounts() {
        let result = upsert_connected(vec![rec("a", "a")], "b", "Beta", "Bob", 3);
        assert_eq!(result.records.len(), 2);
        assert_eq!(result.id, "b");
    }
}
