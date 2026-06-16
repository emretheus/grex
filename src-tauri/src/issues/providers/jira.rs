//! Jira Cloud as an [`IssueProvider`] (REST v3).
//!
//! Auth = Basic (`email:apiToken`) against a per-connection site base URL.
//! The credential bundle stored in the keychain is JSON `{site,email,token}`.
//! Reads use the cursor-based `/rest/api/3/search/jql` endpoint; the opaque
//! `nextPageToken` is our feed cursor. Descriptions arrive as ADF (Atlassian
//! Document Format) JSON and are flattened to plain text for the preview.

use anyhow::{anyhow, bail, Context, Result};
use serde::Deserialize;
use serde_json::Value;

use crate::issues::connection;
use crate::issues::credentials;
use crate::issues::provider::{
    is_invalid_auth, AuthError, Connection, IssueProvider, ProviderIdentity, ProviderKind,
    ProviderScope,
};
use crate::issues::types::{InboxItem, IssueDetail, ItemMeta, ItemState, JiraMeta};

const KIND: ProviderKind = ProviderKind::Jira;
const FIELDS: &str = "summary,status,issuetype,priority,labels,assignee,project,updated";
const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

pub struct JiraProvider;

/// The decoded keychain secret bundle.
#[derive(Debug, Deserialize)]
pub struct JiraSecret {
    /// Site base URL, e.g. `https://acme.atlassian.net` (no trailing slash).
    pub site: String,
    pub email: String,
    pub token: String,
}

impl JiraSecret {
    fn parse(secret: &str) -> Result<Self> {
        serde_json::from_str(secret).context("Stored Jira credentials weren't valid JSON")
    }
    fn base(&self) -> &str {
        self.site.trim_end_matches('/')
    }
}

impl IssueProvider for JiraProvider {
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
        scope: &ProviderScope,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<(Vec<InboxItem>, Option<String>)> {
        let creds = JiraSecret::parse(secret)?;
        search_jql(
            &creds,
            connection_id,
            &build_jql(scope, None),
            cursor,
            limit,
        )
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
        let creds = JiraSecret::parse(secret)?;
        let scope = ProviderScope::default();
        search_jql(
            &creds,
            connection_id,
            &build_jql(&scope, Some(query)),
            cursor,
            limit,
        )
    }

    fn get_issue(&self, secret: &str, issue_id: &str) -> Result<IssueDetail> {
        let creds = JiraSecret::parse(secret)?;
        let url = format!("{}/rest/api/3/issue/{}", creds.base(), issue_id);
        let value = get(
            &creds,
            &url,
            &[("fields", &format!("{FIELDS},description"))],
        )?;
        let issue: JiraIssue =
            serde_json::from_value(value).context("Couldn't parse Jira issue detail")?;
        let description = issue
            .fields
            .description
            .as_ref()
            .map(adf_to_text)
            .filter(|s| !s.trim().is_empty());
        let mut item = issue.into_item(creds.base());
        item.connection_id = String::new();
        Ok(IssueDetail { item, description })
    }
}

/// Validate a credential bundle by resolving `myself`. Returns the dedupe key
/// `"<site>|<accountId>"` plus display/user names.
pub fn validate(secret: &str) -> Result<ProviderIdentity> {
    let creds = JiraSecret::parse(secret)?;
    let url = format!("{}/rest/api/3/myself", creds.base());
    let me = get(&creds, &url, &[]).map_err(|e| {
        if is_invalid_auth(&e) {
            anyhow!("Jira rejected those credentials. Check the site URL, email, and API token.")
        } else {
            e.context("Couldn't reach Jira to validate the credentials")
        }
    })?;
    let account_id = me
        .get("accountId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let user_name = me
        .get("displayName")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let host = creds
        .base()
        .strip_prefix("https://")
        .or_else(|| creds.base().strip_prefix("http://"))
        .unwrap_or(creds.base())
        .to_string();
    Ok(ProviderIdentity {
        account_key: format!("{}|{account_id}", creds.base()),
        display_name: host,
        user_name,
    })
}

/// Projects the credential can see, for the settings project picker.
pub fn list_projects(secret: &str) -> Result<Vec<JiraProject>> {
    let creds = JiraSecret::parse(secret)?;
    let url = format!("{}/rest/api/3/project/search", creds.base());
    let value = get(&creds, &url, &[("maxResults", "250")])?;
    let values = value.get("values").cloned().unwrap_or(Value::Null);
    let projects: Vec<JiraProjectNode> = serde_json::from_value(values).unwrap_or_default();
    Ok(projects
        .into_iter()
        .map(|p| JiraProject {
            id: p.id,
            key: p.key,
            name: p.name,
        })
        .collect())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraProject {
    pub id: String,
    pub key: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
struct JiraProjectNode {
    id: String,
    key: String,
    name: String,
}

fn build_jql(scope: &ProviderScope, query: Option<&str>) -> String {
    let mut clauses: Vec<String> = Vec::new();
    let custom = scope
        .filter
        .get("jql")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(jql) = custom {
        clauses.push(format!("({jql})"));
    } else {
        if scope.assigned_only {
            clauses.push("assignee = currentUser()".to_string());
        }
        let keys: Vec<String> = scope
            .filter
            .get("projectKeys")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(|e| e.as_str())
                    .map(|k| format!("\"{}\"", k.replace('"', "")))
                    .collect()
            })
            .unwrap_or_default();
        if !keys.is_empty() {
            clauses.push(format!("project in ({})", keys.join(",")));
        }
    }
    if let Some(q) = query {
        let escaped = q.replace('\\', "\\\\").replace('"', "\\\"");
        clauses.push(format!("text ~ \"{escaped}\""));
    }
    if clauses.is_empty() {
        "order by updated DESC".to_string()
    } else {
        format!("{} ORDER BY updated DESC", clauses.join(" AND "))
    }
}

fn search_jql(
    creds: &JiraSecret,
    connection_id: &str,
    jql: &str,
    cursor: Option<&str>,
    limit: u32,
) -> Result<(Vec<InboxItem>, Option<String>)> {
    let url = format!("{}/rest/api/3/search/jql", creds.base());
    let limit_s = limit.to_string();
    let mut params: Vec<(&str, &str)> =
        vec![("jql", jql), ("maxResults", &limit_s), ("fields", FIELDS)];
    if let Some(c) = cursor {
        params.push(("nextPageToken", c));
    }
    let value = get(creds, &url, &params)?;
    let page: JiraSearchPage =
        serde_json::from_value(value).context("Couldn't parse Jira search response")?;
    let base = creds.base();
    let items = page
        .issues
        .into_iter()
        .map(|issue| {
            let mut item = issue.into_item(base);
            item.connection_id = connection_id.to_string();
            item
        })
        .collect();
    Ok((items, page.next_page_token))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JiraSearchPage {
    #[serde(default)]
    issues: Vec<JiraIssue>,
    #[serde(default)]
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct JiraIssue {
    key: String,
    #[serde(default)]
    fields: JiraFields,
}

#[derive(Debug, Default, Deserialize)]
struct JiraFields {
    #[serde(default)]
    summary: String,
    #[serde(default)]
    status: Option<JiraStatus>,
    #[serde(default)]
    issuetype: Option<JiraNamed>,
    #[serde(default)]
    priority: Option<JiraNamed>,
    #[serde(default)]
    labels: Vec<String>,
    #[serde(default)]
    assignee: Option<JiraAssignee>,
    #[serde(default)]
    project: Option<JiraNamed>,
    #[serde(default)]
    updated: Option<String>,
    #[serde(default)]
    description: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct JiraStatus {
    #[serde(default)]
    name: String,
    #[serde(default, rename = "statusCategory")]
    status_category: Option<JiraStatusCategory>,
}

#[derive(Debug, Deserialize)]
struct JiraStatusCategory {
    #[serde(default)]
    key: String,
}

#[derive(Debug, Deserialize)]
struct JiraNamed {
    #[serde(default)]
    name: String,
}

#[derive(Debug, Deserialize)]
struct JiraAssignee {
    #[serde(default, rename = "displayName")]
    display_name: String,
}

impl JiraIssue {
    fn into_item(self, base: &str) -> InboxItem {
        let f = self.fields;
        let (state_label, tone) = f
            .status
            .as_ref()
            .map(|s| {
                let cat = s
                    .status_category
                    .as_ref()
                    .map(|c| c.key.as_str())
                    .unwrap_or("");
                (s.name.clone(), status_tone(cat).to_string())
            })
            .unwrap_or_else(|| ("Unknown".to_string(), "neutral".to_string()));
        let assignee = f
            .assignee
            .as_ref()
            .map(|a| a.display_name.clone())
            .filter(|s| !s.is_empty());
        InboxItem {
            id: self.key.clone(),
            connection_id: String::new(),
            provider: KIND,
            title: f.summary,
            external_id: self.key.clone(),
            url: format!("{base}/browse/{}", self.key),
            state: ItemState {
                label: state_label,
                tone,
            },
            last_activity_at: f.updated.as_deref().map(iso_to_millis).unwrap_or(0),
            assignee_name: assignee,
            meta: ItemMeta::Jira(JiraMeta {
                site_name: None,
                issue_type: f.issuetype.map(|t| t.name).unwrap_or_default(),
                priority: f.priority.map(|p| p.name).filter(|s| !s.is_empty()),
                project_name: f.project.map(|p| p.name).unwrap_or_default(),
                labels: f.labels,
            }),
        }
    }
}

/// Jira status-category key → shared card tone.
fn status_tone(category_key: &str) -> &'static str {
    match category_key {
        "done" => "merged",
        "indeterminate" => "open",
        _ => "neutral",
    }
}

/// Best-effort ADF → plain text: concatenate every `text` node, inserting a
/// blank line after block nodes so paragraphs stay readable in the preview.
fn adf_to_text(node: &Value) -> String {
    let mut out = String::new();
    walk_adf(node, &mut out);
    out.trim().to_string()
}

fn walk_adf(node: &Value, out: &mut String) {
    if let Some(text) = node.get("text").and_then(Value::as_str) {
        out.push_str(text);
    }
    if let Some(content) = node.get("content").and_then(Value::as_array) {
        for child in content {
            walk_adf(child, out);
        }
    }
    let block = node
        .get("type")
        .and_then(Value::as_str)
        .map(|t| matches!(t, "paragraph" | "heading" | "listItem" | "blockquote"))
        .unwrap_or(false);
    if block {
        out.push('\n');
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
        .context("Failed to build HTTP client for Jira API")
}

/// GET `url` with Basic auth, mapping 401/403 to [`AuthError`].
fn get(creds: &JiraSecret, url: &str, query: &[(&str, &str)]) -> Result<Value> {
    let response = client()?
        .get(url)
        .basic_auth(&creds.email, Some(&creds.token))
        .header(reqwest::header::ACCEPT, "application/json")
        .query(query)
        .send()
        .context("Jira request failed")?;
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(anyhow!(AuthError));
    }
    let body = response
        .text()
        .context("Couldn't read Jira response body")?;
    if !status.is_success() {
        bail!("Jira returned {status}: {}", body.trim());
    }
    serde_json::from_str(&body).context("Jira response wasn't valid JSON")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn build_jql_assigned_with_projects() {
        let scope = ProviderScope {
            assigned_only: true,
            filter: json!({ "projectKeys": ["ENG", "OPS"] }),
        };
        let jql = build_jql(&scope, None);
        assert!(jql.contains("assignee = currentUser()"));
        assert!(jql.contains("project in (\"ENG\",\"OPS\")"));
        assert!(jql.ends_with("ORDER BY updated DESC"));
    }

    #[test]
    fn build_jql_search_adds_text_clause() {
        let jql = build_jql(&ProviderScope::default(), Some("login bug"));
        assert!(jql.contains("text ~ \"login bug\""));
    }

    #[test]
    fn build_jql_custom_jql_wins() {
        let scope = ProviderScope {
            assigned_only: true,
            filter: json!({ "jql": "labels = urgent" }),
        };
        let jql = build_jql(&scope, None);
        assert!(jql.contains("(labels = urgent)"));
        assert!(!jql.contains("currentUser"));
    }

    #[test]
    fn adf_flattens_paragraphs() {
        let doc = json!({
            "type": "doc",
            "content": [
                { "type": "paragraph", "content": [{ "type": "text", "text": "Hello" }] },
                { "type": "paragraph", "content": [{ "type": "text", "text": "World" }] }
            ]
        });
        assert_eq!(adf_to_text(&doc), "Hello\nWorld");
    }

    #[test]
    fn issue_maps_into_item() {
        let issue: JiraIssue = serde_json::from_value(json!({
            "key": "ENG-7",
            "fields": {
                "summary": "Fix it",
                "status": { "name": "In Progress", "statusCategory": { "key": "indeterminate" } },
                "issuetype": { "name": "Bug" },
                "priority": { "name": "High" },
                "labels": ["backend"],
                "assignee": { "displayName": "Ada" },
                "project": { "name": "Engineering" },
                "updated": "2024-01-01T00:00:00.000+0000"
            }
        }))
        .unwrap();
        let item = issue.into_item("https://acme.atlassian.net");
        assert_eq!(item.id, "ENG-7");
        assert_eq!(item.url, "https://acme.atlassian.net/browse/ENG-7");
        assert_eq!(item.state.tone, "open");
        assert_eq!(item.assignee_name.as_deref(), Some("Ada"));
        match item.meta {
            ItemMeta::Jira(m) => {
                assert_eq!(m.issue_type, "Bug");
                assert_eq!(m.project_name, "Engineering");
                assert_eq!(m.labels, vec!["backend".to_string()]);
            }
            _ => panic!("expected jira meta"),
        }
    }
}
