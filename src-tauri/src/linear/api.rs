//! Linear GraphQL client for the Contexts inbox.
//!
//! Read-only: we list issues for the configured scope (assigned-to-me or
//! all, optionally narrowed by team/project), run free-text issue search,
//! and read teams/projects for the settings pickers. Auth is a per-workspace
//! personal API key, passed in explicitly by the caller and sent verbatim in
//! the `Authorization` header (no `Bearer` prefix, no token refresh —
//! personal keys don't expire until the user revokes them).
//!
//! Stock `reqwest::blocking` is fine here — unlike Slack, Linear's API
//! doesn't fingerprint the TLS ClientHello, so no browser-emulation fork
//! is needed. All callers run inside `spawn_blocking`, where the blocking
//! client's internal runtime is safe to use.

use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use serde::Deserialize;
use serde_json::{json, Value};

use super::types::{
    priority_label, LinearInboxItem, LinearIssueDetail, LinearLabelRef, LinearProject,
    LinearProjectRef, LinearScope, LinearTeam,
};

const GRAPHQL_URL: &str = "https://api.linear.app/graphql";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

/// Typed marker for "the stored API key no longer authenticates" (revoked
/// or wrong). The IPC layer downcasts to this to decide whether to wipe
/// the stored key and surface the reconnect affordance — same contract as
/// Slack's `is_invalid_auth`.
#[derive(Debug)]
pub struct LinearAuthError;

impl std::fmt::Display for LinearAuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Linear authentication failed")
    }
}

impl std::error::Error for LinearAuthError {}

/// True when `err` (or anything in its chain) is a [`LinearAuthError`].
pub fn is_invalid_auth(err: &anyhow::Error) -> bool {
    err.chain().any(|cause| cause.is::<LinearAuthError>())
}

fn http_client() -> Result<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .context("Failed to build HTTP client for Linear API")
}

/// Execute a GraphQL operation with an explicit API key, mapping auth
/// failures to [`LinearAuthError`] and surfacing GraphQL `errors` as a
/// readable message. Personal API keys go in the `Authorization` header
/// verbatim (no `Bearer` prefix).
fn graphql_with_key(api_key: &str, query: &str, variables: Value) -> Result<Value> {
    let client = http_client()?;
    let response = client
        .post(GRAPHQL_URL)
        .header(reqwest::header::AUTHORIZATION, api_key)
        .json(&json!({ "query": query, "variables": variables }))
        .send()
        .context("Linear GraphQL request failed")?;

    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(anyhow!(LinearAuthError));
    }
    let body = response
        .text()
        .context("Couldn't read Linear GraphQL response body")?;
    if !status.is_success() {
        bail!("Linear GraphQL returned {status}: {}", body.trim());
    }
    let value: Value =
        serde_json::from_str(&body).context("Linear GraphQL response wasn't valid JSON")?;

    if let Some(errors) = value.get("errors").and_then(Value::as_array) {
        if !errors.is_empty() {
            let authentication = errors.iter().any(|e| {
                e.get("extensions")
                    .and_then(|x| x.get("type"))
                    .and_then(Value::as_str)
                    .map(|t| t.eq_ignore_ascii_case("authentication"))
                    .unwrap_or(false)
            });
            if authentication {
                return Err(anyhow!(LinearAuthError));
            }
            let message = errors
                .iter()
                .filter_map(|e| e.get("message").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("; ");
            bail!("Linear GraphQL error: {message}");
        }
    }

    value
        .get("data")
        .cloned()
        .ok_or_else(|| anyhow!("Linear GraphQL response had no data"))
}

// ---- GraphQL projections -------------------------------------------------

#[derive(Debug, Deserialize)]
struct ViewerData {
    viewer: Viewer,
}

#[derive(Debug, Deserialize)]
struct Viewer {
    name: String,
    organization: Organization,
}

#[derive(Debug, Deserialize)]
struct Organization {
    id: String,
    name: String,
}

/// Identity of the signed-in user + their organization.
pub struct LinearViewer {
    pub user_name: String,
    pub org_name: String,
    pub org_id: String,
}

#[derive(Debug, Deserialize)]
struct TeamListNode {
    id: String,
    name: String,
    key: String,
}

#[derive(Debug, Deserialize)]
struct ProjectListNode {
    id: String,
    name: String,
    #[serde(default)]
    color: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueNode {
    id: String,
    identifier: String,
    title: String,
    url: String,
    /// Only requested by the detail query; list queries leave it `None`.
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    priority: f64,
    updated_at: String,
    #[serde(default)]
    state: Option<StateNode>,
    #[serde(default)]
    team: Option<TeamNode>,
    #[serde(default)]
    project: Option<ProjectNode>,
    #[serde(default)]
    labels: Option<LabelConnection>,
    #[serde(default)]
    assignee: Option<AssigneeNode>,
}

#[derive(Debug, Deserialize)]
struct StateNode {
    name: String,
    #[serde(rename = "type")]
    type_: String,
}

#[derive(Debug, Deserialize)]
struct TeamNode {
    name: String,
    key: String,
}

#[derive(Debug, Deserialize)]
struct ProjectNode {
    name: String,
    color: String,
}

#[derive(Debug, Deserialize)]
struct LabelConnection {
    #[serde(default)]
    nodes: Vec<LabelNode>,
}

#[derive(Debug, Deserialize)]
struct LabelNode {
    name: String,
    color: String,
}

#[derive(Debug, Deserialize)]
struct AssigneeNode {
    name: String,
}

#[derive(Debug, Deserialize)]
struct PageInfo {
    #[serde(rename = "hasNextPage", default)]
    has_next_page: bool,
    #[serde(rename = "endCursor", default)]
    end_cursor: Option<String>,
}

/// The shared field selection for an issue. Kept in one place so the
/// assigned-feed and search queries stay structurally identical and map
/// through the same converter.
const ISSUE_FIELDS: &str = r#"
  id
  identifier
  title
  url
  priority
  updatedAt
  state { name type }
  team { name key }
  project { name color }
  labels(first: 10) { nodes { name color } }
  assignee { name }
"#;

const VIEWER_QUERY: &str = "query Viewer { viewer { name organization { id name } } }";

/// Validate a freshly-pasted API key by resolving its viewer. Used by the
/// connect command so an invalid key never gets persisted, and to capture
/// the org id used to dedupe re-connects.
pub fn viewer_with_key(api_key: &str) -> Result<LinearViewer> {
    parse_viewer(graphql_with_key(api_key, VIEWER_QUERY, json!({}))?)
}

fn parse_viewer(data: Value) -> Result<LinearViewer> {
    let viewer: ViewerData =
        serde_json::from_value(data).context("Couldn't parse Linear viewer response")?;
    Ok(LinearViewer {
        user_name: viewer.viewer.name,
        org_name: viewer.viewer.organization.name,
        org_id: viewer.viewer.organization.id,
    })
}

/// Build the `IssueFilter` for a scoped issue feed. `Assigned` restricts to
/// the signed-in user; team/project ids narrow further (empty = no narrow).
fn issue_filter(scope: LinearScope, team_ids: &[String], project_ids: &[String]) -> Value {
    let mut filter = serde_json::Map::new();
    if scope == LinearScope::Assigned {
        filter.insert("assignee".to_string(), json!({ "isMe": { "eq": true } }));
    }
    if !team_ids.is_empty() {
        filter.insert("team".to_string(), json!({ "id": { "in": team_ids } }));
    }
    if !project_ids.is_empty() {
        filter.insert(
            "project".to_string(),
            json!({ "id": { "in": project_ids } }),
        );
    }
    Value::Object(filter)
}

/// List a workspace's issues for the inbox feed, most-recently-updated
/// first. `scope` toggles assigned-to-me vs. all; `team_ids`/`project_ids`
/// narrow the "all" view. Items are tagged with `connection_id` so the
/// merged feed + detail fetch know which key produced them. `cursor` is the
/// opaque `endCursor` from the previous page. Returns `(items, next_cursor)`.
pub fn list_issues(
    api_key: &str,
    connection_id: &str,
    scope: LinearScope,
    team_ids: &[String],
    project_ids: &[String],
    cursor: Option<&str>,
    limit: u32,
) -> Result<(Vec<LinearInboxItem>, Option<String>)> {
    let query = format!(
        r#"query Issues($first: Int!, $after: String, $filter: IssueFilter) {{
          issues(first: $first, after: $after, filter: $filter, orderBy: updatedAt) {{
            pageInfo {{ hasNextPage endCursor }}
            nodes {{ {ISSUE_FIELDS} }}
          }}
        }}"#
    );
    let data = graphql_with_key(
        api_key,
        &query,
        json!({
            "first": limit,
            "after": cursor,
            "filter": issue_filter(scope, team_ids, project_ids),
        }),
    )?;
    let connection = data
        .get("issues")
        .cloned()
        .ok_or_else(|| anyhow!("Linear issues response was missing"))?;
    connection_to_items(connection, connection_id)
}

/// The teams the key can see, for the settings team picker.
pub fn list_teams(api_key: &str) -> Result<Vec<LinearTeam>> {
    let query = "query Teams { teams(first: 250) { nodes { id name key } } }";
    let data = graphql_with_key(api_key, query, json!({}))?;
    let nodes: Vec<TeamListNode> = data
        .get("teams")
        .and_then(|t| t.get("nodes"))
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .context("Couldn't parse Linear teams")?
        .unwrap_or_default();
    Ok(nodes
        .into_iter()
        .map(|n| LinearTeam {
            id: n.id,
            name: n.name,
            key: n.key,
        })
        .collect())
}

/// The projects the key can see, optionally scoped to a single team, for
/// the settings project picker.
pub fn list_projects(api_key: &str, team_id: Option<&str>) -> Result<Vec<LinearProject>> {
    let (query, variables) = match team_id {
        Some(id) => (
            r#"query TeamProjects($id: String!) {
              team(id: $id) { projects(first: 250) { nodes { id name color } } }
            }"#
            .to_string(),
            json!({ "id": id }),
        ),
        None => (
            "query Projects { projects(first: 250) { nodes { id name color } } }".to_string(),
            json!({}),
        ),
    };
    let data = graphql_with_key(api_key, &query, variables)?;
    let nodes_value = match team_id {
        Some(_) => data
            .get("team")
            .and_then(|t| t.get("projects"))
            .and_then(|p| p.get("nodes"))
            .cloned(),
        None => data.get("projects").and_then(|p| p.get("nodes")).cloned(),
    };
    let nodes: Vec<ProjectListNode> = nodes_value
        .map(serde_json::from_value)
        .transpose()
        .context("Couldn't parse Linear projects")?
        .unwrap_or_default();
    Ok(nodes
        .into_iter()
        .map(|n| LinearProject {
            id: n.id,
            name: n.name,
            color: n.color,
        })
        .collect())
}

/// Fetch one issue by id, including its markdown `description`. Powers
/// the detail preview + the "Start workspace" prompt seed.
pub fn get_issue(api_key: &str, issue_id: &str) -> Result<LinearIssueDetail> {
    let query = format!(
        r#"query Issue($id: String!) {{
          issue(id: $id) {{
            {ISSUE_FIELDS}
            description
          }}
        }}"#
    );
    let data = graphql_with_key(api_key, &query, json!({ "id": issue_id }))?;
    let node: IssueNode = data
        .get("issue")
        .cloned()
        .filter(|v| !v.is_null())
        .map(serde_json::from_value)
        .transpose()
        .context("Couldn't parse Linear issue detail")?
        .ok_or_else(|| anyhow!("Linear issue {issue_id} was not found"))?;
    Ok(issue_to_detail(node))
}

/// Free-text issue search via Linear's `searchIssues`. Empty queries
/// short-circuit to an empty result (no point burning a request). Items are
/// tagged with `connection_id`. Returns `(items, next_cursor)`.
pub fn search_issues(
    api_key: &str,
    connection_id: &str,
    query_text: &str,
    cursor: Option<&str>,
    limit: u32,
) -> Result<(Vec<LinearInboxItem>, Option<String>)> {
    let trimmed = query_text.trim();
    if trimmed.is_empty() {
        return Ok((Vec::new(), None));
    }
    let query = format!(
        r#"query SearchIssues($first: Int!, $after: String, $term: String!) {{
          searchIssues(first: $first, after: $after, term: $term) {{
            pageInfo {{ hasNextPage endCursor }}
            nodes {{ {ISSUE_FIELDS} }}
          }}
        }}"#
    );
    let data = graphql_with_key(
        api_key,
        &query,
        json!({ "first": limit, "after": cursor, "term": trimmed }),
    )?;
    let connection = data
        .get("searchIssues")
        .cloned()
        .ok_or_else(|| anyhow!("Linear searchIssues response was missing"))?;
    connection_to_items(connection, connection_id)
}

/// Turn a GraphQL issue connection (`{ pageInfo, nodes }`) into tagged
/// inbox items + the next cursor. `connection_id` stamps each item so the
/// merged feed and detail fetch can route back to the right key.
fn connection_to_items(
    connection: Value,
    connection_id: &str,
) -> Result<(Vec<LinearInboxItem>, Option<String>)> {
    let page_info: PageInfo = connection
        .get("pageInfo")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .context("Couldn't parse Linear pageInfo")?
        .unwrap_or(PageInfo {
            has_next_page: false,
            end_cursor: None,
        });
    let nodes: Vec<IssueNode> = connection
        .get("nodes")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .context("Couldn't parse Linear issue nodes")?
        .unwrap_or_default();

    let items = nodes
        .into_iter()
        .map(|node| issue_to_item(node, connection_id))
        .collect();
    let next_cursor = if page_info.has_next_page {
        page_info.end_cursor
    } else {
        None
    };
    Ok((items, next_cursor))
}

/// Shared scalar extraction for both the list item and the detail
/// projection — keeps the two converters from drifting on state/team/
/// project/label handling.
struct IssueParts {
    priority: i64,
    state_name: String,
    state_type: String,
    team_name: String,
    team_key: String,
    project: Option<LinearProjectRef>,
    labels: Vec<LinearLabelRef>,
    last_activity_at: i64,
    assignee_name: Option<String>,
}

fn issue_parts(node: &IssueNode) -> IssueParts {
    let (state_name, state_type) = node
        .state
        .as_ref()
        .map(|s| (s.name.clone(), s.type_.clone()))
        .unwrap_or_else(|| ("Unknown".to_string(), "backlog".to_string()));
    let (team_name, team_key) = node
        .team
        .as_ref()
        .map(|t| (t.name.clone(), t.key.clone()))
        .unwrap_or_else(|| (String::new(), String::new()));
    IssueParts {
        priority: node.priority as i64,
        state_name,
        state_type,
        team_name,
        team_key,
        project: node.project.as_ref().map(|p| LinearProjectRef {
            name: p.name.clone(),
            color: p.color.clone(),
        }),
        labels: node
            .labels
            .as_ref()
            .map(|c| {
                c.nodes
                    .iter()
                    .map(|l| LinearLabelRef {
                        name: l.name.clone(),
                        color: l.color.clone(),
                    })
                    .collect()
            })
            .unwrap_or_default(),
        last_activity_at: iso_to_millis(&node.updated_at),
        assignee_name: node.assignee.as_ref().map(|a| a.name.clone()),
    }
}

fn issue_to_item(node: IssueNode, connection_id: &str) -> LinearInboxItem {
    let parts = issue_parts(&node);
    LinearInboxItem {
        id: node.id,
        connection_id: connection_id.to_string(),
        identifier: node.identifier,
        title: node.title,
        url: node.url,
        state_name: parts.state_name,
        state_type: parts.state_type,
        priority: parts.priority,
        priority_label: priority_label(parts.priority).to_string(),
        team_name: parts.team_name,
        team_key: parts.team_key,
        project: parts.project,
        labels: parts.labels,
        last_activity_at: parts.last_activity_at,
        assignee_name: parts.assignee_name,
    }
}

fn issue_to_detail(node: IssueNode) -> LinearIssueDetail {
    let parts = issue_parts(&node);
    LinearIssueDetail {
        id: node.id,
        identifier: node.identifier,
        title: node.title,
        description: node.description.filter(|d| !d.trim().is_empty()),
        url: node.url,
        state_name: parts.state_name,
        state_type: parts.state_type,
        priority: parts.priority,
        priority_label: priority_label(parts.priority).to_string(),
        team_name: parts.team_name,
        team_key: parts.team_key,
        project: parts.project,
        labels: parts.labels,
        assignee_name: parts.assignee_name,
        last_activity_at: parts.last_activity_at,
    }
}

/// ISO 8601 (`2024-01-02T03:04:05.678Z`) → Unix milliseconds. Falls back
/// to 0 on unparseable input so a single odd timestamp can't drop a card.
fn iso_to_millis(iso: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(iso)
        .map(|dt| dt.timestamp_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_error_is_detected_through_the_chain() {
        let err = anyhow!(LinearAuthError);
        assert!(is_invalid_auth(&err));
        let wrapped = err.context("while listing issues");
        assert!(is_invalid_auth(&wrapped));
        let other = anyhow!("network down");
        assert!(!is_invalid_auth(&other));
    }

    #[test]
    fn iso_to_millis_parses_rfc3339() {
        // 2024-01-01T00:00:00Z = 1_704_067_200_000 ms.
        assert_eq!(iso_to_millis("2024-01-01T00:00:00.000Z"), 1_704_067_200_000);
        assert_eq!(iso_to_millis("not-a-date"), 0);
    }

    #[test]
    fn issue_node_maps_into_inbox_item() {
        let node: IssueNode = serde_json::from_value(json!({
            "id": "uuid-1",
            "identifier": "ENG-42",
            "title": "Fix the thing",
            "url": "https://linear.app/acme/issue/ENG-42",
            "priority": 1.0,
            "updatedAt": "2024-01-01T00:00:00.000Z",
            "state": { "name": "In Progress", "type": "started" },
            "team": { "name": "Engineering", "key": "ENG" },
            "project": { "name": "Q1", "color": "#abcdef" },
            "labels": { "nodes": [{ "name": "bug", "color": "#ff0000" }] },
            "assignee": { "name": "Ada" }
        }))
        .unwrap();
        let item = issue_to_item(node, "conn-1");
        assert_eq!(item.connection_id, "conn-1");
        assert_eq!(item.identifier, "ENG-42");
        assert_eq!(item.priority, 1);
        assert_eq!(item.priority_label, "Urgent");
        assert_eq!(item.state_type, "started");
        assert_eq!(item.team_key, "ENG");
        assert_eq!(item.project.as_ref().unwrap().name, "Q1");
        assert_eq!(item.labels.len(), 1);
        assert_eq!(item.assignee_name.as_deref(), Some("Ada"));
        assert_eq!(item.last_activity_at, 1_704_067_200_000);
    }

    #[test]
    fn issue_node_maps_into_detail_with_description() {
        let node: IssueNode = serde_json::from_value(json!({
            "id": "uuid-9",
            "identifier": "ENG-9",
            "title": "Ship it",
            "url": "https://linear.app/acme/issue/ENG-9",
            "description": "Do the thing.\n\nThen the other thing.",
            "priority": 2.0,
            "updatedAt": "2024-01-01T00:00:00.000Z",
            "state": { "name": "Todo", "type": "unstarted" },
            "team": { "name": "Eng", "key": "ENG" },
            "labels": { "nodes": [] }
        }))
        .unwrap();
        let detail = issue_to_detail(node);
        assert_eq!(detail.identifier, "ENG-9");
        assert_eq!(detail.priority_label, "High");
        assert_eq!(detail.state_type, "unstarted");
        assert_eq!(
            detail.description.as_deref(),
            Some("Do the thing.\n\nThen the other thing.")
        );
        assert!(detail.project.is_none());
        assert!(detail.assignee_name.is_none());
    }

    #[test]
    fn issue_detail_blanks_empty_description() {
        let node: IssueNode = serde_json::from_value(json!({
            "id": "uuid-10",
            "identifier": "ENG-10",
            "title": "No body",
            "url": "https://linear.app/acme/issue/ENG-10",
            "description": "   ",
            "priority": 0.0,
            "updatedAt": "2024-01-01T00:00:00.000Z"
        }))
        .unwrap();
        let detail = issue_to_detail(node);
        // Whitespace-only descriptions collapse to None so the UI shows
        // the "no description" placeholder instead of a blank body.
        assert!(detail.description.is_none());
        assert_eq!(detail.priority_label, "No priority");
    }

    #[test]
    fn connection_to_items_drops_cursor_when_no_next_page() {
        let connection = json!({
            "pageInfo": { "hasNextPage": false, "endCursor": "abc" },
            "nodes": []
        });
        let (items, next_cursor) = connection_to_items(connection, "conn-1").unwrap();
        assert!(next_cursor.is_none());
        assert!(items.is_empty());
    }

    #[test]
    fn connection_to_items_keeps_cursor_when_more_pages() {
        let connection = json!({
            "pageInfo": { "hasNextPage": true, "endCursor": "next-123" },
            "nodes": []
        });
        let (_items, next_cursor) = connection_to_items(connection, "conn-1").unwrap();
        assert_eq!(next_cursor.as_deref(), Some("next-123"));
    }

    #[test]
    fn issue_filter_assigned_includes_is_me() {
        let filter = issue_filter(LinearScope::Assigned, &[], &[]);
        assert_eq!(filter["assignee"]["isMe"]["eq"], json!(true));
        assert!(filter.get("team").is_none());
    }

    #[test]
    fn issue_filter_all_omits_assignee_and_adds_team_project() {
        let filter = issue_filter(
            LinearScope::All,
            &["t1".to_string(), "t2".to_string()],
            &["p1".to_string()],
        );
        assert!(filter.get("assignee").is_none());
        assert_eq!(filter["team"]["id"]["in"], json!(["t1", "t2"]));
        assert_eq!(filter["project"]["id"]["in"], json!(["p1"]));
    }
}
