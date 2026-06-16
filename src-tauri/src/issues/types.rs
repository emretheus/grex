//! Provider-agnostic wire shapes for the Contexts inbox.
//!
//! Everything here crosses the IPC boundary as `camelCase` to match the
//! TypeScript types in `src/lib/api.ts`. The merged feed returns
//! [`InboxItem`]s whose `meta` is an internally-tagged enum mirroring the
//! frontend `ContextCardMeta` discriminated union — so a new provider is one
//! variant here plus one matching union member on the frontend.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::provider::ProviderKind;

/// A `{ name, color }` pair (Linear label/project, Trello label).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedColor {
    pub name: String,
    pub color: String,
}

/// A Linear team reference (`{ name, key }`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamRef {
    pub name: String,
    pub key: String,
}

/// Universal card state: a display `label` plus a normalized `tone` drawn
/// from the frontend `ContextCardStateTone` palette (open | closed | merged |
/// draft | answered | unanswered | urgent | neutral).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemState {
    pub label: String,
    pub tone: String,
}

/// One row in the merged Contexts inbox: a provider-agnostic envelope plus a
/// discriminated provider `meta` payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxItem {
    /// Provider issue id — React key + the id the detail fetch routes on.
    pub id: String,
    /// Which connection produced this item (for detail routing + labels).
    pub connection_id: String,
    pub provider: ProviderKind,
    pub title: String,
    /// Human identifier: Linear `ENG-123`, Jira `PROJ-45`, Trello short link.
    pub external_id: String,
    pub url: String,
    pub state: ItemState,
    /// `updatedAt` in Unix milliseconds — drives sort + the "Xh ago" label.
    pub last_activity_at: i64,
    pub assignee_name: Option<String>,
    pub meta: ItemMeta,
}

/// Provider-specific render payload. Internally tagged by `type` to mirror the
/// frontend `ContextCardMeta` union (`"linear"` / `"jira"` / `"trello"` /
/// `"forgejo"` / `"featurebase"` / `"plain"`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ItemMeta {
    Linear(LinearMeta),
    Jira(JiraMeta),
    Trello(TrelloMeta),
    Forgejo(ForgejoMeta),
    Featurebase(FeaturebaseMeta),
    Plain(PlainMeta),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearMeta {
    pub identifier: String,
    pub priority_label: String,
    pub team: TeamRef,
    pub project: Option<NamedColor>,
    pub labels: Vec<NamedColor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraMeta {
    /// Jira site display name (host), shown as a badge when >1 site connected.
    pub site_name: Option<String>,
    pub issue_type: String,
    pub priority: Option<String>,
    pub project_name: String,
    pub labels: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrelloMeta {
    pub board_name: String,
    pub list_name: String,
    pub labels: Vec<NamedColor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgejoMeta {
    /// Host display name (e.g. `codeberg.org`), shown when >1 host connected.
    pub host_name: Option<String>,
    /// Repository `owner/name`.
    pub repo: String,
    pub number: i64,
    pub labels: Vec<NamedColor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeaturebaseMeta {
    /// Org display name (the feedback host), shown when >1 org connected.
    pub org_name: Option<String>,
    /// Board / category name the post lives in.
    pub board: String,
    pub upvotes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlainMeta {
    /// Workspace display name, shown when >1 workspace connected.
    pub workspace_name: Option<String>,
    pub customer_name: String,
    pub priority: Option<String>,
}

/// Full issue projection for the detail view: an [`InboxItem`] superset adding
/// the rendered markdown `description`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueDetail {
    #[serde(flatten)]
    pub item: InboxItem,
    pub description: Option<String>,
}

/// A page of the merged feed plus the per-connection cursor map for the NEXT
/// page (a connection absent from the map is exhausted; an empty map = end).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxPage {
    pub items: Vec<InboxItem>,
    pub cursors: BTreeMap<String, String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn item_meta_is_internally_tagged() {
        let meta = ItemMeta::Linear(LinearMeta {
            identifier: "ENG-1".into(),
            priority_label: "Urgent".into(),
            team: TeamRef {
                name: "Eng".into(),
                key: "ENG".into(),
            },
            project: None,
            labels: vec![],
        });
        let json = serde_json::to_value(&meta).unwrap();
        assert_eq!(json["type"], "linear");
        assert_eq!(json["identifier"], "ENG-1");
    }

    #[test]
    fn issue_detail_flattens_item_fields() {
        let detail = IssueDetail {
            item: InboxItem {
                id: "id-1".into(),
                connection_id: "c1".into(),
                provider: ProviderKind::Jira,
                title: "T".into(),
                external_id: "PROJ-1".into(),
                url: "https://x".into(),
                state: ItemState {
                    label: "Done".into(),
                    tone: "merged".into(),
                },
                last_activity_at: 1,
                assignee_name: None,
                meta: ItemMeta::Jira(JiraMeta {
                    site_name: None,
                    issue_type: "Bug".into(),
                    priority: None,
                    project_name: "Proj".into(),
                    labels: vec![],
                }),
            },
            description: Some("body".into()),
        };
        let json = serde_json::to_value(&detail).unwrap();
        // Flatten lifts the envelope fields to the top level alongside
        // `description`, so the frontend reads one flat object.
        assert_eq!(json["externalId"], "PROJ-1");
        assert_eq!(json["description"], "body");
        assert_eq!(json["meta"]["type"], "jira");
    }
}
