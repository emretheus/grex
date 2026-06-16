//! Plain as an [`IssueProvider`] (GraphQL).
//!
//! Plain is a B2B support tool; its "issues" are support **threads**. Auth is
//! `Authorization: Bearer <plainApiKey_…>` against the single GraphQL endpoint,
//! so the keychain secret is the raw API key. The dedupe key + display name
//! come from `myWorkspace`. Threads use Relay-style pagination (the opaque
//! cursor is `pageInfo.endCursor`); free-text search uses the separate
//! `searchThreads` query. Timestamps are wrapped in a `DateTime { iso8601 }`.

use anyhow::{anyhow, bail, Context, Result};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::issues::connection;
use crate::issues::credentials;
use crate::issues::provider::{
    is_invalid_auth, AuthError, Connection, IssueProvider, ProviderIdentity, ProviderKind,
    ProviderScope,
};
use crate::issues::types::{InboxItem, IssueDetail, ItemMeta, ItemState, PlainMeta};

const KIND: ProviderKind = ProviderKind::Plain;
const ENDPOINT: &str = "https://core-api.uk.plain.com/graphql/v1";
const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

const THREAD_FIELDS: &str = r#"
    id
    ref
    title
    status
    priority
    previewText
    customer { fullName email { email } }
    createdAt { iso8601 }
    updatedAt { iso8601 }
    statusChangedAt { iso8601 }
"#;

pub struct PlainProvider;

impl IssueProvider for PlainProvider {
    fn kind(&self) -> ProviderKind {
        KIND
    }

    fn connections(&self) -> Result<Vec<Connection>> {
        Ok(connection::load_records(KIND)?
            .into_iter()
            .map(|r| Connection {
                id: r.id,
                display_name: r.display_name,
                user_name: r.user_name,
                scope: r.scope,
            })
            .collect())
    }

    fn load_secret(&self, connection_id: &str) -> Result<Option<String>> {
        credentials::load(KIND, connection_id)
    }

    fn forget(&self, connection_id: &str) -> Result<()> {
        let _ = credentials::clear(KIND, connection_id);
        let mut records = connection::load_records(KIND)?;
        records.retain(|r| r.id != connection_id);
        connection::save_records(KIND, &records)
    }

    fn list_issues(
        &self,
        secret: &str,
        connection_id: &str,
        _scope: &ProviderScope,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<(Vec<InboxItem>, Option<String>)> {
        let query = format!(
            r#"query($first: Int!, $after: String) {{
                threads(
                    first: $first
                    after: $after
                    filters: {{ statuses: [TODO, SNOOZED] }}
                    sortBy: {{ field: STATUS_CHANGED_AT, direction: DESC }}
                ) {{
                    pageInfo {{ hasNextPage endCursor }}
                    edges {{ node {{ {THREAD_FIELDS} }} }}
                }}
            }}"#
        );
        let vars = json!({ "first": limit, "after": cursor });
        let data = post(secret, &query, vars)?;
        let conn = data.get("threads").cloned().unwrap_or(Value::Null);
        let (nodes, next) = parse_connection(&conn, "node");
        Ok((nodes_to_items(nodes, connection_id), next))
    }

    fn search_issues(
        &self,
        secret: &str,
        connection_id: &str,
        query: &str,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<(Vec<InboxItem>, Option<String>)> {
        if query.trim().is_empty() {
            return Ok((Vec::new(), None));
        }
        let gql = format!(
            r#"query($term: String!, $first: Int!, $after: String) {{
                searchThreads(searchQuery: {{ term: $term }}, first: $first, after: $after) {{
                    pageInfo {{ hasNextPage endCursor }}
                    edges {{ node {{ thread {{ {THREAD_FIELDS} }} }} }}
                }}
            }}"#
        );
        let vars = json!({ "term": query, "first": limit, "after": cursor });
        let data = post(secret, &gql, vars)?;
        let conn = data.get("searchThreads").cloned().unwrap_or(Value::Null);
        // searchThreads nests the thread one level deeper (`node.thread`).
        let (nodes, next) = parse_connection(&conn, "thread");
        Ok((nodes_to_items(nodes, connection_id), next))
    }

    fn get_issue(&self, secret: &str, issue_id: &str) -> Result<IssueDetail> {
        let query = format!(
            r#"query($id: ID!) {{
                myWorkspace {{ id }}
                thread(threadId: $id) {{ description {THREAD_FIELDS} }}
            }}"#
        );
        let data = post(secret, &query, json!({ "id": issue_id }))?;
        let workspace_id = data
            .pointer("/myWorkspace/id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let node = data
            .get("thread")
            .cloned()
            .filter(|v| !v.is_null())
            .ok_or_else(|| anyhow!("Plain thread {issue_id} not found"))?;
        let thread: PlainThread =
            serde_json::from_value(node.clone()).context("Couldn't parse Plain thread detail")?;
        let description = node
            .get("description")
            .and_then(Value::as_str)
            .map(str::to_string)
            .filter(|s| !s.trim().is_empty())
            .or_else(|| thread.preview_text.clone())
            .filter(|s| !s.trim().is_empty());
        let mut item = thread.into_item(workspace_id);
        item.connection_id = String::new();
        Ok(IssueDetail { item, description })
    }
}

/// Validate the API key and resolve workspace identity via `myWorkspace`.
pub fn validate(secret: &str) -> Result<ProviderIdentity> {
    let query = "query { myWorkspace { id name publicName } }";
    let data = post(secret, query, Value::Null).map_err(|e| {
        if is_invalid_auth(&e) {
            anyhow!("Plain rejected that API key. Create one in Settings → API Keys with the thread:read permission.")
        } else {
            e.context("Couldn't reach Plain to validate the API key")
        }
    })?;
    let ws = data
        .get("myWorkspace")
        .cloned()
        .filter(|v| !v.is_null())
        .ok_or_else(|| anyhow!(AuthError))?;
    let id = ws.get("id").and_then(Value::as_str).unwrap_or_default();
    let name = ws
        .get("publicName")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .or_else(|| ws.get("name").and_then(Value::as_str))
        .unwrap_or_default();
    if id.is_empty() {
        bail!("Plain didn't return a workspace for that API key.");
    }
    Ok(ProviderIdentity {
        account_key: id.to_string(),
        display_name: name.to_string(),
        user_name: name.to_string(),
    })
}

/// Pull `{ pageInfo, edges[].node[.<inner>] }` out of a Relay connection,
/// returning the node values plus the next cursor when more pages remain.
fn parse_connection(conn: &Value, inner: &str) -> (Vec<Value>, Option<String>) {
    let has_next = conn
        .pointer("/pageInfo/hasNextPage")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let end_cursor = conn
        .pointer("/pageInfo/endCursor")
        .and_then(Value::as_str)
        .map(str::to_string);
    let nodes = conn
        .get("edges")
        .and_then(Value::as_array)
        .map(|edges| {
            edges
                .iter()
                .filter_map(|e| {
                    let node = e.get("node")?;
                    if inner == "node" {
                        Some(node.clone())
                    } else {
                        node.get(inner).cloned()
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    let next = if has_next { end_cursor } else { None };
    (nodes, next)
}

fn nodes_to_items(nodes: Vec<Value>, connection_id: &str) -> Vec<InboxItem> {
    nodes
        .into_iter()
        .filter_map(|n| serde_json::from_value::<PlainThread>(n).ok())
        .map(|t| {
            let mut item = t.into_item(connection_id);
            item.connection_id = connection_id.to_string();
            item
        })
        .collect()
}

#[derive(Debug, Deserialize)]
struct DateWrap {
    #[serde(default)]
    iso8601: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PlainEmail {
    #[serde(default)]
    email: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlainCustomer {
    #[serde(default)]
    full_name: Option<String>,
    #[serde(default)]
    email: Option<PlainEmail>,
}

#[derive(Debug, Deserialize)]
struct PlainThread {
    #[serde(default)]
    id: String,
    #[serde(default, rename = "ref")]
    reference: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    priority: Option<i64>,
    #[serde(default, rename = "previewText")]
    preview_text: Option<String>,
    #[serde(default)]
    customer: Option<PlainCustomer>,
    #[serde(default, rename = "updatedAt")]
    updated_at: Option<DateWrap>,
    #[serde(default, rename = "statusChangedAt")]
    status_changed_at: Option<DateWrap>,
    #[serde(default, rename = "createdAt")]
    created_at: Option<DateWrap>,
}

impl PlainThread {
    fn into_item(self, workspace_id: &str) -> InboxItem {
        let customer_name = self
            .customer
            .as_ref()
            .and_then(|c| {
                c.full_name
                    .clone()
                    .filter(|s| !s.is_empty())
                    .or_else(|| c.email.as_ref().and_then(|e| e.email.clone()))
            })
            .unwrap_or_default();
        let title = self
            .title
            .clone()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| self.preview_text.clone())
            .filter(|s| !s.trim().is_empty())
            .or_else(|| {
                if customer_name.is_empty() {
                    None
                } else {
                    Some(format!("Thread with {customer_name}"))
                }
            })
            .unwrap_or_else(|| "Support thread".to_string());
        let reference = self.reference.clone().unwrap_or_default();
        let (state_label, tone) = status_state(self.status.as_deref());
        let activity = self
            .updated_at
            .as_ref()
            .or(self.status_changed_at.as_ref())
            .or(self.created_at.as_ref())
            .and_then(|d| d.iso8601.as_deref())
            .map(iso_to_millis)
            .unwrap_or(0);
        let url = if workspace_id.is_empty() {
            "https://app.plain.com".to_string()
        } else {
            format!(
                "https://app.plain.com/workspace/{workspace_id}/thread/{}",
                self.id
            )
        };
        InboxItem {
            id: self.id,
            connection_id: String::new(),
            provider: KIND,
            title,
            external_id: reference,
            url,
            state: ItemState {
                label: state_label.to_string(),
                tone: tone.to_string(),
            },
            last_activity_at: activity,
            assignee_name: None,
            meta: ItemMeta::Plain(PlainMeta {
                workspace_name: None,
                customer_name,
                priority: priority_label(self.priority).map(str::to_string),
            }),
        }
    }
}

/// Plain `ThreadStatus` → display label + shared card tone.
fn status_state(status: Option<&str>) -> (&'static str, &'static str) {
    match status {
        Some("TODO") => ("Todo", "open"),
        Some("SNOOZED") => ("Snoozed", "neutral"),
        Some("DONE") => ("Done", "merged"),
        _ => ("Open", "neutral"),
    }
}

/// Plain priority is an int (0 = urgent … 3 = low).
fn priority_label(priority: Option<i64>) -> Option<&'static str> {
    match priority {
        Some(0) => Some("Urgent"),
        Some(1) => Some("High"),
        Some(2) => Some("Normal"),
        Some(3) => Some("Low"),
        _ => None,
    }
}

fn iso_to_millis(iso: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(iso)
        .map(|dt| dt.timestamp_millis())
        .unwrap_or(0)
}

fn client() -> Result<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .context("Failed to build HTTP client for Plain API")
}

/// POST a GraphQL operation, returning the `data` object. Maps HTTP 401/403
/// and GraphQL auth errors to [`AuthError`]; other GraphQL errors bubble up.
fn post(secret: &str, query: &str, variables: Value) -> Result<Value> {
    let token = secret.trim();
    let mut body = serde_json::Map::new();
    body.insert("query".to_string(), Value::String(query.to_string()));
    if !variables.is_null() {
        body.insert("variables".to_string(), variables);
    }
    let response = client()?
        .post(ENDPOINT)
        .bearer_auth(token)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(reqwest::header::ACCEPT, "application/json")
        .json(&Value::Object(body))
        .send()
        .context("Plain request failed")?;
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(anyhow!(AuthError));
    }
    let text = response
        .text()
        .context("Couldn't read Plain response body")?;
    if !status.is_success() {
        bail!("Plain returned {status}: {}", text.trim());
    }
    let value: Value = serde_json::from_str(&text).context("Plain response wasn't valid JSON")?;
    if let Some(errors) = value.get("errors").and_then(Value::as_array) {
        if !errors.is_empty() {
            let joined = errors
                .iter()
                .filter_map(|e| e.get("message").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("; ");
            let lowered = joined.to_lowercase();
            if lowered.contains("auth")
                || lowered.contains("permission")
                || lowered.contains("forbidden")
            {
                return Err(anyhow!(AuthError));
            }
            bail!("Plain GraphQL error: {joined}");
        }
    }
    Ok(value.get("data").cloned().unwrap_or(Value::Null))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thread_maps_into_item() {
        let node = json!({
            "id": "th_123",
            "ref": "T-42",
            "title": "Login broken",
            "status": "TODO",
            "priority": 1,
            "previewText": "Customer can't log in",
            "customer": { "fullName": "Ada Lovelace", "email": { "email": "ada@x.com" } },
            "updatedAt": { "iso8601": "2024-01-01T00:00:00.000Z" }
        });
        let thread: PlainThread = serde_json::from_value(node).unwrap();
        let item = thread.into_item("w_99");
        assert_eq!(item.id, "th_123");
        assert_eq!(item.external_id, "T-42");
        assert_eq!(item.title, "Login broken");
        assert_eq!(item.state.tone, "open");
        assert_eq!(
            item.url,
            "https://app.plain.com/workspace/w_99/thread/th_123"
        );
        assert_eq!(item.last_activity_at, 1_704_067_200_000);
        match item.meta {
            ItemMeta::Plain(m) => {
                assert_eq!(m.customer_name, "Ada Lovelace");
                assert_eq!(m.priority.as_deref(), Some("High"));
            }
            _ => panic!("expected plain meta"),
        }
    }

    #[test]
    fn title_falls_back_to_preview_then_customer() {
        let node = json!({
            "id": "t1",
            "status": "SNOOZED",
            "customer": { "fullName": "Bob" }
        });
        let thread: PlainThread = serde_json::from_value(node).unwrap();
        let item = thread.into_item("w1");
        assert_eq!(item.title, "Thread with Bob");
        assert_eq!(item.state.label, "Snoozed");
    }

    #[test]
    fn parse_connection_extracts_nodes_and_cursor() {
        let conn = json!({
            "pageInfo": { "hasNextPage": true, "endCursor": "cur1" },
            "edges": [ { "node": { "id": "a" } }, { "node": { "id": "b" } } ]
        });
        let (nodes, next) = parse_connection(&conn, "node");
        assert_eq!(nodes.len(), 2);
        assert_eq!(next.as_deref(), Some("cur1"));
    }

    #[test]
    fn parse_connection_search_unwraps_thread() {
        let conn = json!({
            "pageInfo": { "hasNextPage": false, "endCursor": "x" },
            "edges": [ { "node": { "thread": { "id": "a" } } } ]
        });
        let (nodes, next) = parse_connection(&conn, "thread");
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0]["id"], "a");
        assert!(next.is_none());
    }
}
