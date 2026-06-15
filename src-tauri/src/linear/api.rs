//! Linear GraphQL client for the Contexts inbox.
//!
//! Read-only in Phase 1: we list the signed-in user's assigned issues and
//! run free-text issue search. Auth is the stored personal API key, sent
//! verbatim in the `Authorization` header (no `Bearer` prefix, no token
//! refresh — personal keys don't expire until the user revokes them).
//!
//! Stock `reqwest::blocking` is fine here — unlike Slack, Linear's API
//! doesn't fingerprint the TLS ClientHello, so no browser-emulation fork
//! is needed. All callers run inside `spawn_blocking`, where the blocking
//! client's internal runtime is safe to use.

use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use serde::Deserialize;
use serde_json::{json, Value};

use super::credentials;
use super::types::{
    priority_label, LinearInboxItem, LinearInboxPage, LinearIssueDetail, LinearLabelRef,
    LinearProjectRef,
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

/// The stored personal API key, or [`LinearAuthError`] when none is saved.
fn stored_api_key() -> Result<String> {
    credentials::load_api_key()?.ok_or_else(|| anyhow!(LinearAuthError))
}

/// Run a GraphQL operation with the stored API key.
fn graphql(query: &str, variables: Value) -> Result<Value> {
    graphql_with_key(&stored_api_key()?, query, variables)
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
    name: String,
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

const VIEWER_QUERY: &str = "query Viewer { viewer { name organization { name } } }";

/// Identity of the signed-in user + their organization. Drives the
/// connection-status display. `(user_name, organization_name)`.
pub fn viewer() -> Result<(String, String)> {
    parse_viewer(graphql(VIEWER_QUERY, json!({}))?)
}

/// Validate a freshly-pasted API key by resolving its viewer. Used by the
/// connect command so an invalid key never gets persisted.
pub fn viewer_with_key(api_key: &str) -> Result<(String, String)> {
    parse_viewer(graphql_with_key(api_key, VIEWER_QUERY, json!({}))?)
}

fn parse_viewer(data: Value) -> Result<(String, String)> {
    let viewer: ViewerData =
        serde_json::from_value(data).context("Couldn't parse Linear viewer response")?;
    Ok((viewer.viewer.name, viewer.viewer.organization.name))
}

/// List the signed-in user's assigned issues, most-recently-updated
/// first. `cursor` is the opaque `endCursor` from the previous page.
pub fn list_assigned_issues(cursor: Option<&str>, limit: u32) -> Result<LinearInboxPage> {
    let query = format!(
        r#"query AssignedIssues($first: Int!, $after: String) {{
          viewer {{
            assignedIssues(first: $first, after: $after, orderBy: updatedAt) {{
              pageInfo {{ hasNextPage endCursor }}
              nodes {{ {ISSUE_FIELDS} }}
            }}
          }}
        }}"#
    );
    let data = graphql(&query, json!({ "first": limit, "after": cursor }))?;
    let connection = data
        .get("viewer")
        .and_then(|v| v.get("assignedIssues"))
        .cloned()
        .ok_or_else(|| anyhow!("Linear assignedIssues response was missing"))?;
    connection_to_page(connection)
}

/// Fetch one issue by id, including its markdown `description`. Powers
/// the detail preview + the "Start workspace" prompt seed.
pub fn get_issue(issue_id: &str) -> Result<LinearIssueDetail> {
    let query = format!(
        r#"query Issue($id: String!) {{
          issue(id: $id) {{
            {ISSUE_FIELDS}
            description
          }}
        }}"#
    );
    let data = graphql(&query, json!({ "id": issue_id }))?;
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
/// short-circuit to an empty page (no point burning a request).
pub fn search_issues(
    query_text: &str,
    cursor: Option<&str>,
    limit: u32,
) -> Result<LinearInboxPage> {
    let trimmed = query_text.trim();
    if trimmed.is_empty() {
        return Ok(LinearInboxPage {
            items: Vec::new(),
            next_cursor: None,
        });
    }
    let query = format!(
        r#"query SearchIssues($first: Int!, $after: String, $term: String!) {{
          searchIssues(first: $first, after: $after, term: $term) {{
            pageInfo {{ hasNextPage endCursor }}
            nodes {{ {ISSUE_FIELDS} }}
          }}
        }}"#
    );
    let data = graphql(
        &query,
        json!({ "first": limit, "after": cursor, "term": trimmed }),
    )?;
    let connection = data
        .get("searchIssues")
        .cloned()
        .ok_or_else(|| anyhow!("Linear searchIssues response was missing"))?;
    connection_to_page(connection)
}

/// Turn a GraphQL issue connection (`{ pageInfo, nodes }`) into the
/// frontend-facing inbox page.
fn connection_to_page(connection: Value) -> Result<LinearInboxPage> {
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

    let items = nodes.into_iter().map(issue_to_item).collect();
    let next_cursor = if page_info.has_next_page {
        page_info.end_cursor
    } else {
        None
    };
    Ok(LinearInboxPage { items, next_cursor })
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

fn issue_to_item(node: IssueNode) -> LinearInboxItem {
    let parts = issue_parts(&node);
    LinearInboxItem {
        id: node.id,
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
        let item = issue_to_item(node);
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
    fn connection_to_page_drops_cursor_when_no_next_page() {
        let connection = json!({
            "pageInfo": { "hasNextPage": false, "endCursor": "abc" },
            "nodes": []
        });
        let page = connection_to_page(connection).unwrap();
        assert!(page.next_cursor.is_none());
        assert!(page.items.is_empty());
    }

    #[test]
    fn connection_to_page_keeps_cursor_when_more_pages() {
        let connection = json!({
            "pageInfo": { "hasNextPage": true, "endCursor": "next-123" },
            "nodes": []
        });
        let page = connection_to_page(connection).unwrap();
        assert_eq!(page.next_cursor.as_deref(), Some("next-123"));
    }
}
