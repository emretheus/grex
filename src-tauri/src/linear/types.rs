//! Wire shapes shared across the Linear module.
//!
//! Everything that crosses the IPC boundary is
//! `#[serde(rename_all = "camelCase")]` so it matches the TypeScript
//! counterparts in `src/lib/api.ts` directly.

use serde::{Deserialize, Serialize};

/// Which slice of a workspace's issues the inbox feed pulls.
///
/// `Assigned` (default) keeps the original behaviour — only issues
/// assigned to the signed-in user. `All` widens to every issue the key can
/// see, narrowed by the connection's `team_ids` / `project_ids` filters.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LinearScope {
    #[default]
    Assigned,
    All,
}

/// One connected Linear workspace surfaced to the frontend. Presence in
/// the list returned by `linear_connections` is the source of truth the UI
/// branches on (a non-empty list = connected); the name fields drive the
/// "Connected to <org>" acknowledgement in Settings → Contexts, and the
/// scope/filter fields drive the per-workspace controls.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearConnection {
    /// Stable connection id (also the keychain account). Equals the Linear
    /// organization id for connections made after multi-workspace support;
    /// migrated single-connection installs keep the legacy `"api-key"` id.
    pub id: String,
    /// Linear organization (workspace) display name, when known.
    pub workspace_name: Option<String>,
    /// The authenticated user's display name, when known.
    pub user_name: Option<String>,
    /// Feed scope for this workspace.
    pub scope: LinearScope,
    /// When `scope == All`, the team ids to include (empty = every team).
    pub team_ids: Vec<String>,
    /// When `scope == All`, the project ids to include (empty = every
    /// project within the selected teams).
    pub project_ids: Vec<String>,
}

/// Persisted per-connection record stored as a JSON array in the `settings`
/// KV store under [`crate::linear::CONNECTIONS_KEY`]. The API key itself
/// lives in the keychain keyed by `id` (see `credentials.rs`); this is the
/// non-secret metadata + scope preferences the UI needs without a network
/// round-trip.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearConnectionRecord {
    /// Connection id == keychain account. Equals the org id for new
    /// connections; legacy migrated installs keep `"api-key"`.
    pub id: String,
    /// Linear organization id, used to dedupe re-connects of the same org.
    /// Empty for legacy migrated records whose org id wasn't captured.
    #[serde(default)]
    pub org_id: String,
    pub workspace_name: String,
    pub user_name: String,
    /// Unix seconds the connection was established.
    pub connected_at: i64,
    #[serde(default)]
    pub scope: LinearScope,
    #[serde(default)]
    pub team_ids: Vec<String>,
    #[serde(default)]
    pub project_ids: Vec<String>,
}

impl LinearConnectionRecord {
    /// Project the persisted record into the IPC connection shape.
    pub fn to_connection(&self) -> LinearConnection {
        LinearConnection {
            id: self.id.clone(),
            workspace_name: Some(self.workspace_name.clone()).filter(|s| !s.is_empty()),
            user_name: Some(self.user_name.clone()).filter(|s| !s.is_empty()),
            scope: self.scope,
            team_ids: self.team_ids.clone(),
            project_ids: self.project_ids.clone(),
        }
    }
}

/// Non-secret metadata persisted by pre-multi-workspace builds under
/// [`crate::linear::CONNECTION_META_KEY`]. Read only during the lazy
/// migration into [`LinearConnectionRecord`]; never written anymore.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearConnectionMeta {
    pub workspace_name: String,
    pub user_name: String,
    /// Unix seconds the connection was established.
    pub connected_at: i64,
}

/// A Linear team, for the settings team picker.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearTeam {
    pub id: String,
    pub name: String,
    pub key: String,
}

/// A Linear project, for the settings project picker.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearProject {
    pub id: String,
    pub name: String,
    pub color: String,
}

/// One Linear issue projected into a context-card-shaped row. Mirrors the
/// cross-provider inbox item contract (`id` / `title` / `state` /
/// `lastActivityAt`) plus the Linear-specific metadata the frontend's
/// `LinearIssueMeta` renders (identifier, priority, team, project,
/// labels).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearInboxItem {
    /// Stable React key — the issue's UUID.
    pub id: String,
    /// Which connected workspace this issue came from (the connection id).
    /// Needed so the detail fetch + workspace label use the right key.
    pub connection_id: String,
    /// Human identifier, e.g. `ENG-123`. Doubles as the card's
    /// `externalId`.
    pub identifier: String,
    pub title: String,
    /// Canonical Linear URL for the issue.
    pub url: String,
    /// Workflow-state display name, e.g. "In Progress".
    pub state_name: String,
    /// Workflow-state category: `triage | backlog | unstarted | started |
    /// completed | canceled`. Drives the frontend's state-tone mapping.
    pub state_type: String,
    /// Numeric priority (0 none, 1 urgent, 2 high, 3 medium, 4 low).
    pub priority: i64,
    /// Human priority label ("Urgent", "High", …; "No priority" for 0).
    pub priority_label: String,
    pub team_name: String,
    pub team_key: String,
    pub project: Option<LinearProjectRef>,
    pub labels: Vec<LinearLabelRef>,
    /// `updatedAt` converted to Unix milliseconds for the "Xh ago" label.
    pub last_activity_at: i64,
    pub assignee_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearProjectRef {
    pub name: String,
    /// Hex color (`#rrggbb`) Linear assigns the project.
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearLabelRef {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearInboxPage {
    pub items: Vec<LinearInboxItem>,
    /// Per-connection opaque cursor for the NEXT page, keyed by connection
    /// id. A connection absent from the map is exhausted; an empty map = end
    /// of the merged feed. The frontend passes this back verbatim to fetch
    /// the next page only from connections that still have one.
    pub cursors: std::collections::BTreeMap<String, String>,
}

/// Full issue projection for the detail view + "Start workspace" prompt.
/// Superset of [`LinearInboxItem`] adding the rendered description body.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssueDetail {
    pub id: String,
    pub identifier: String,
    pub title: String,
    /// Markdown body. `None` when the issue has no description.
    pub description: Option<String>,
    pub url: String,
    pub state_name: String,
    pub state_type: String,
    pub priority: i64,
    pub priority_label: String,
    pub team_name: String,
    pub team_key: String,
    pub project: Option<LinearProjectRef>,
    pub labels: Vec<LinearLabelRef>,
    pub assignee_name: Option<String>,
    /// `updatedAt` in Unix milliseconds.
    pub last_activity_at: i64,
}

/// Human label for a Linear numeric priority. Matches Linear's own UI
/// wording so cards read identically to the issue in Linear.
pub fn priority_label(priority: i64) -> &'static str {
    match priority {
        1 => "Urgent",
        2 => "High",
        3 => "Medium",
        4 => "Low",
        _ => "No priority",
    }
}

#[cfg(test)]
mod tests {
    use super::priority_label;

    #[test]
    fn priority_labels_match_linear_wording() {
        assert_eq!(priority_label(0), "No priority");
        assert_eq!(priority_label(1), "Urgent");
        assert_eq!(priority_label(2), "High");
        assert_eq!(priority_label(3), "Medium");
        assert_eq!(priority_label(4), "Low");
        // Out-of-range priorities fall back to the neutral label rather
        // than panicking.
        assert_eq!(priority_label(99), "No priority");
    }
}
