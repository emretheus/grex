//! The provider-agnostic seam for issue/task Context sources.
//!
//! Each integration (Linear, Jira, Trello) implements [`IssueProvider`]. The
//! trait is deliberately small: it covers the read feed (list / search /
//! detail) plus the connection bookkeeping the merged feed needs (enumerate
//! connections, load a connection's secret, forget a connection whose
//! credentials stopped authenticating). Per-provider *connect* flows stay out
//! of the trait because their inputs differ (Linear takes one API key; Jira
//! takes site, email, and token; Trello takes key and token) — those live in
//! each provider's thin command file.

use serde::{Deserialize, Serialize};

use super::types::{InboxItem, IssueDetail};

/// Stable provider discriminator. Serializes snake_case (`"linear"`,
/// `"jira"`, `"trello"`) to match the frontend `meta.type` family and to
/// namespace persistence (keychain service + settings KV key).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    Linear,
    Jira,
    Trello,
}

impl ProviderKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ProviderKind::Linear => "linear",
            ProviderKind::Jira => "jira",
            ProviderKind::Trello => "trello",
        }
    }

    /// macOS keychain service name. Linear's is UNCHANGED from before this
    /// abstraction existed so already-stored keys keep resolving.
    pub fn keychain_service(self) -> &'static str {
        match self {
            ProviderKind::Linear => "io.grex.linear",
            ProviderKind::Jira => "io.grex.jira",
            ProviderKind::Trello => "io.grex.trello",
        }
    }

    /// `settings` KV key holding the JSON array of connection records.
    /// Linear's is UNCHANGED for the same migration-safety reason.
    pub fn connections_key(self) -> &'static str {
        match self {
            ProviderKind::Linear => "linear.connections",
            ProviderKind::Jira => "jira.connections",
            ProviderKind::Trello => "trello.connections",
        }
    }
}

/// Identity resolved when validating a freshly-entered credential bundle.
/// `account_key` is the provider's natural dedupe key (Linear org id, Jira
/// `"<site>|<accountId>"`, Trello member id).
pub struct ProviderIdentity {
    pub account_key: String,
    pub display_name: String,
    pub user_name: String,
}

/// Provider-agnostic feed scope persisted per connection. The universal axis
/// is mine-vs-all; everything else is provider-specific filter state kept as
/// opaque JSON so the trait doesn't grow a union of every provider's filter
/// model. Each provider parses `filter` into its own typed shape; a malformed
/// blob degrades to "no narrowing" rather than erroring the feed.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderScope {
    #[serde(default)]
    pub assigned_only: bool,
    #[serde(default)]
    pub filter: serde_json::Value,
}

/// One connected account, as the merged feed + IPC list need it.
pub struct Connection {
    pub id: String,
    pub display_name: String,
    pub user_name: String,
    pub scope: ProviderScope,
}

/// Typed marker for "the stored credentials no longer authenticate" (revoked,
/// rotated, or wrong). The feed layer downcasts to this to decide whether to
/// evict the connection and surface a reconnect affordance — the shared
/// successor to the old per-provider `LinearAuthError`.
#[derive(Debug)]
pub struct AuthError;

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "issue provider authentication failed")
    }
}

impl std::error::Error for AuthError {}

/// True when `err` (or anything in its chain) is an [`AuthError`].
pub fn is_invalid_auth(err: &anyhow::Error) -> bool {
    err.chain().any(|cause| cause.is::<AuthError>())
}

/// A read-only issue source for the Contexts inbox. One impl per provider,
/// registered in [`super::registry`]. All methods run inside `spawn_blocking`
/// (callers use `run_blocking`), so blocking HTTP is fine.
pub trait IssueProvider: Send + Sync {
    fn kind(&self) -> ProviderKind;

    /// Every connected account for this provider, with its persisted scope.
    fn connections(&self) -> anyhow::Result<Vec<Connection>>;

    /// The stored secret bundle for `connection_id` (raw key for Linear;
    /// JSON bundle for Jira/Trello), or `None` when nothing is stored.
    fn load_secret(&self, connection_id: &str) -> anyhow::Result<Option<String>>;

    /// Drop a connection's secret + record. Used by disconnect and by the
    /// feed's auth-failure eviction.
    fn forget(&self, connection_id: &str) -> anyhow::Result<()>;

    /// One page of the connection's inbox feed, with the next opaque cursor.
    fn list_issues(
        &self,
        secret: &str,
        connection_id: &str,
        scope: &ProviderScope,
        cursor: Option<&str>,
        limit: u32,
    ) -> anyhow::Result<(Vec<InboxItem>, Option<String>)>;

    /// Free-text search; empty query short-circuits to empty.
    fn search_issues(
        &self,
        secret: &str,
        connection_id: &str,
        query: &str,
        cursor: Option<&str>,
        limit: u32,
    ) -> anyhow::Result<(Vec<InboxItem>, Option<String>)>;

    /// Full detail for one issue id (adds the rendered description body).
    fn get_issue(&self, secret: &str, issue_id: &str) -> anyhow::Result<IssueDetail>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::anyhow;

    #[test]
    fn auth_error_is_detected_through_the_chain() {
        let err = anyhow!(AuthError);
        assert!(is_invalid_auth(&err));
        assert!(is_invalid_auth(&err.context("while listing issues")));
        assert!(!is_invalid_auth(&anyhow!("network down")));
    }

    #[test]
    fn provider_kind_serializes_snake_case() {
        assert_eq!(
            serde_json::to_string(&ProviderKind::Linear).unwrap(),
            "\"linear\""
        );
        assert_eq!(
            serde_json::to_string(&ProviderKind::Jira).unwrap(),
            "\"jira\""
        );
        assert_eq!(ProviderKind::Trello.keychain_service(), "io.grex.trello");
        assert_eq!(ProviderKind::Linear.connections_key(), "linear.connections");
    }
}
