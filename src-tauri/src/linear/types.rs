//! Wire shapes shared across the Linear module.
//!
//! Everything that crosses the IPC boundary is
//! `#[serde(rename_all = "camelCase")]` so it matches the TypeScript
//! counterparts in `src/lib/api.ts` directly.

use serde::{Deserialize, Serialize};

/// Connection state surfaced to the frontend. `connected` is the single
/// source of truth the UI branches on; the name fields drive the
/// "Connected to <org>" acknowledgement in Settings → Contexts.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearConnection {
    pub connected: bool,
    /// Linear organization (workspace) display name, when known.
    pub workspace_name: Option<String>,
    /// The authenticated user's display name, when known.
    pub user_name: Option<String>,
}

/// Non-secret metadata persisted in the `settings` KV store under
/// [`crate::linear::CONNECTION_META_KEY`]. The token bundle itself lives
/// in the keychain (see `credentials.rs`); this is only the bits the UI
/// needs to render the connected state without a network round-trip.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearConnectionMeta {
    pub workspace_name: String,
    pub user_name: String,
    /// Unix seconds the connection was established.
    pub connected_at: i64,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearInboxPage {
    pub items: Vec<LinearInboxItem>,
    /// Opaque cursor for the NEXT page. `None` = end of feed.
    pub next_cursor: Option<String>,
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
