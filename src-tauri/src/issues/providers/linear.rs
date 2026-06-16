//! Linear as an [`IssueProvider`]. Adapts the pre-existing `crate::linear`
//! GraphQL module (kept verbatim, including its keychain service and legacy
//! connection migration) to the generic issue-provider seam.

use anyhow::Result;
use serde_json::{json, Value};

use crate::issues::provider::{
    Connection, IssueProvider, ProviderIdentity, ProviderKind, ProviderScope,
};
use crate::issues::types::{
    InboxItem, IssueDetail, ItemMeta, ItemState, LinearMeta, NamedColor, TeamRef,
};
use crate::linear::types::{LinearInboxItem, LinearIssueDetail, LinearScope};
use crate::linear::{api as linear_api, connection, credentials};

pub struct LinearProvider;

impl IssueProvider for LinearProvider {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Linear
    }

    fn connections(&self) -> Result<Vec<Connection>> {
        let records = connection::load_records()?;
        Ok(records
            .iter()
            .map(|r| Connection {
                id: r.id.clone(),
                display_name: r.workspace_name.clone(),
                user_name: r.user_name.clone(),
                scope: ProviderScope {
                    assigned_only: r.scope == LinearScope::Assigned,
                    filter: json!({ "teamIds": r.team_ids, "projectIds": r.project_ids }),
                },
            })
            .collect())
    }

    fn load_secret(&self, connection_id: &str) -> Result<Option<String>> {
        credentials::load_api_key(connection_id)
    }

    fn forget(&self, connection_id: &str) -> Result<()> {
        let _ = credentials::clear_api_key(connection_id);
        let mut records = connection::load_records()?;
        records.retain(|r| r.id != connection_id);
        connection::save_records(&records)
    }

    fn list_issues(
        &self,
        secret: &str,
        connection_id: &str,
        scope: &ProviderScope,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<(Vec<InboxItem>, Option<String>)> {
        let (linear_scope, team_ids, project_ids) = decode_scope(scope);
        let (items, next) = linear_api::list_issues(
            secret,
            connection_id,
            linear_scope,
            &team_ids,
            &project_ids,
            cursor,
            limit,
        )?;
        Ok((items.into_iter().map(item_to_generic).collect(), next))
    }

    fn search_issues(
        &self,
        secret: &str,
        connection_id: &str,
        query: &str,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<(Vec<InboxItem>, Option<String>)> {
        let (items, next) = linear_api::search_issues(secret, connection_id, query, cursor, limit)?;
        Ok((items.into_iter().map(item_to_generic).collect(), next))
    }

    fn get_issue(&self, secret: &str, issue_id: &str) -> Result<IssueDetail> {
        Ok(detail_to_generic(linear_api::get_issue(secret, issue_id)?))
    }
}

/// Validate a pasted Linear API key by resolving its viewer. Used by the
/// connect command (not on the trait — connect inputs differ per provider).
pub fn validate(api_key: &str) -> Result<ProviderIdentity> {
    let viewer = linear_api::viewer_with_key(api_key)?;
    Ok(ProviderIdentity {
        account_key: viewer.org_id,
        display_name: viewer.org_name,
        user_name: viewer.user_name,
    })
}

/// Map a persisted [`ProviderScope`] back onto Linear's native scope + filter
/// shape. A malformed/absent filter degrades to "no narrowing".
fn decode_scope(scope: &ProviderScope) -> (LinearScope, Vec<String>, Vec<String>) {
    let linear_scope = if scope.assigned_only {
        LinearScope::Assigned
    } else {
        LinearScope::All
    };
    (
        linear_scope,
        string_vec(&scope.filter, "teamIds"),
        string_vec(&scope.filter, "projectIds"),
    )
}

fn string_vec(value: &Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|e| e.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

/// Linear workflow-state category → shared card tone. Mirrors what the
/// frontend used to compute (`started`→open, `completed`→merged,
/// `canceled`→closed, else neutral).
fn tone(state_type: &str) -> &'static str {
    match state_type {
        "started" => "open",
        "completed" => "merged",
        "canceled" => "closed",
        _ => "neutral",
    }
}

fn item_to_generic(item: LinearInboxItem) -> InboxItem {
    InboxItem {
        id: item.id,
        connection_id: item.connection_id,
        provider: ProviderKind::Linear,
        title: item.title,
        external_id: item.identifier.clone(),
        url: item.url,
        state: ItemState {
            label: item.state_name,
            tone: tone(&item.state_type).to_string(),
        },
        last_activity_at: item.last_activity_at,
        assignee_name: item.assignee_name,
        meta: ItemMeta::Linear(LinearMeta {
            identifier: item.identifier,
            priority_label: item.priority_label,
            team: TeamRef {
                name: item.team_name,
                key: item.team_key,
            },
            project: item.project.map(|p| NamedColor {
                name: p.name,
                color: p.color,
            }),
            labels: item
                .labels
                .into_iter()
                .map(|l| NamedColor {
                    name: l.name,
                    color: l.color,
                })
                .collect(),
        }),
    }
}

fn detail_to_generic(detail: LinearIssueDetail) -> IssueDetail {
    let description = detail.description.clone();
    IssueDetail {
        item: InboxItem {
            id: detail.id,
            // The detail fetch is routed by the card's connectionId, so the
            // detail envelope itself doesn't carry one.
            connection_id: String::new(),
            provider: ProviderKind::Linear,
            title: detail.title,
            external_id: detail.identifier.clone(),
            url: detail.url,
            state: ItemState {
                label: detail.state_name,
                tone: tone(&detail.state_type).to_string(),
            },
            last_activity_at: detail.last_activity_at,
            assignee_name: detail.assignee_name,
            meta: ItemMeta::Linear(LinearMeta {
                identifier: detail.identifier,
                priority_label: detail.priority_label,
                team: TeamRef {
                    name: detail.team_name,
                    key: detail.team_key,
                },
                project: detail.project.map(|p| NamedColor {
                    name: p.name,
                    color: p.color,
                }),
                labels: detail
                    .labels
                    .into_iter()
                    .map(|l| NamedColor {
                        name: l.name,
                        color: l.color,
                    })
                    .collect(),
            }),
        },
        description,
    }
}
