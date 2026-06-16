//! Forgejo / Gitea as an [`IssueProvider`] (REST v1).
//!
//! Forgejo instances are self-hosted, so the credential bundle stored in the
//! keychain is JSON `{host,token}` where `host` is the user's instance base
//! URL (e.g. `https://codeberg.org`). Auth = `Authorization: token <token>`.
//! The cross-repo `/repos/issues/search` endpoint is page-paginated, so the
//! opaque cursor is the next 1-based page number. Issue bodies are markdown.

use anyhow::{anyhow, bail, Context, Result};
use serde::Deserialize;

use crate::issues::connection;
use crate::issues::credentials;
use crate::issues::provider::{
    is_invalid_auth, AuthError, Connection, IssueProvider, ProviderIdentity, ProviderKind,
    ProviderScope,
};
use crate::issues::types::{ForgejoMeta, InboxItem, IssueDetail, ItemMeta, ItemState, NamedColor};

const KIND: ProviderKind = ProviderKind::Forgejo;
const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

pub struct ForgejoProvider;

#[derive(Debug, Deserialize)]
pub struct ForgejoSecret {
    /// Instance base URL, e.g. `https://codeberg.org` (no trailing slash).
    pub host: String,
    pub token: String,
}

impl ForgejoSecret {
    fn parse(secret: &str) -> Result<Self> {
        serde_json::from_str(secret).context("Stored Forgejo credentials weren't valid JSON")
    }
    fn base(&self) -> &str {
        self.host.trim_end_matches('/')
    }
}

impl IssueProvider for ForgejoProvider {
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
        let creds = ForgejoSecret::parse(secret)?;
        let page = cursor
            .and_then(|c| c.parse::<u32>().ok())
            .unwrap_or(1)
            .max(1);
        let limit_s = limit.to_string();
        let page_s = page.to_string();
        let mut params: Vec<(&str, &str)> = vec![
            ("type", "issues"),
            ("state", "all"),
            ("sort", "recentupdate"),
            ("limit", &limit_s),
            ("page", &page_s),
        ];
        // "Assigned to me" is the only narrow view; "All" drops the filter and
        // returns every issue across repos the token can read.
        if scope.assigned_only {
            params.push(("assigned", "true"));
        }
        fetch_page(&creds, connection_id, &params, page, limit)
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
        let creds = ForgejoSecret::parse(secret)?;
        let page = cursor
            .and_then(|c| c.parse::<u32>().ok())
            .unwrap_or(1)
            .max(1);
        let limit_s = limit.to_string();
        let page_s = page.to_string();
        let params: Vec<(&str, &str)> = vec![
            ("type", "issues"),
            ("state", "all"),
            ("sort", "recentupdate"),
            ("q", query),
            ("limit", &limit_s),
            ("page", &page_s),
        ];
        fetch_page(&creds, connection_id, &params, page, limit)
    }

    fn get_issue(&self, secret: &str, issue_id: &str) -> Result<IssueDetail> {
        let creds = ForgejoSecret::parse(secret)?;
        let (repo, number) = split_issue_id(issue_id)?;
        let url = format!("{}/api/v1/repos/{repo}/issues/{number}", creds.base());
        let value = get(&creds, &url, &[])?;
        let issue: ForgejoIssue =
            serde_json::from_value(value).context("Couldn't parse Forgejo issue detail")?;
        let description = issue.body.clone().filter(|s| !s.trim().is_empty());
        let mut item = issue.into_item();
        item.connection_id = String::new();
        Ok(IssueDetail { item, description })
    }
}

/// Validate a credential bundle by resolving `/api/v1/user`. The dedupe key is
/// `"<base>|<login>"`; the display name is the bare host.
pub fn validate(secret: &str) -> Result<ProviderIdentity> {
    let creds = ForgejoSecret::parse(secret)?;
    let url = format!("{}/api/v1/user", creds.base());
    let me = get(&creds, &url, &[]).map_err(|e| {
        if is_invalid_auth(&e) {
            anyhow!("Forgejo rejected those credentials. Check the instance URL and access token.")
        } else {
            e.context("Couldn't reach Forgejo to validate the credentials")
        }
    })?;
    let user: ForgejoUser =
        serde_json::from_value(me).context("Couldn't parse Forgejo user response")?;
    let host = creds
        .base()
        .strip_prefix("https://")
        .or_else(|| creds.base().strip_prefix("http://"))
        .unwrap_or(creds.base())
        .to_string();
    let user_name = if user.full_name.trim().is_empty() {
        user.login.clone()
    } else {
        user.full_name.clone()
    };
    Ok(ProviderIdentity {
        account_key: format!("{}|{}", creds.base(), user.login),
        display_name: host,
        user_name,
    })
}

fn fetch_page(
    creds: &ForgejoSecret,
    connection_id: &str,
    params: &[(&str, &str)],
    page: u32,
    limit: u32,
) -> Result<(Vec<InboxItem>, Option<String>)> {
    let url = format!("{}/api/v1/repos/issues/search", creds.base());
    let value = get(creds, &url, params)?;
    let issues: Vec<ForgejoIssue> =
        serde_json::from_value(value).context("Couldn't parse Forgejo issues")?;
    let full_page = issues.len() as u32 >= limit && limit > 0;
    let items: Vec<InboxItem> = issues
        .into_iter()
        // Guard against PRs slipping through (the endpoint also returns PRs
        // unless `type=issues` is honored).
        .filter(|i| i.pull_request.is_none())
        .map(|i| {
            let mut item = i.into_item();
            item.connection_id = connection_id.to_string();
            item
        })
        .collect();
    let next = if full_page {
        Some((page + 1).to_string())
    } else {
        None
    };
    Ok((items, next))
}

/// `"owner/repo#123"` → (`"owner/repo"`, `123`).
fn split_issue_id(id: &str) -> Result<(String, i64)> {
    let (repo, number) = id
        .rsplit_once('#')
        .ok_or_else(|| anyhow!("Malformed Forgejo issue id: {id}"))?;
    let number: i64 = number
        .parse()
        .with_context(|| format!("Malformed Forgejo issue number in id: {id}"))?;
    Ok((repo.to_string(), number))
}

#[derive(Debug, Deserialize)]
struct ForgejoUser {
    #[serde(default)]
    login: String,
    #[serde(default)]
    full_name: String,
}

#[derive(Debug, Deserialize)]
struct ForgejoIssue {
    #[serde(default)]
    number: i64,
    #[serde(default)]
    title: String,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    state: String,
    #[serde(default)]
    html_url: String,
    #[serde(default)]
    updated_at: Option<String>,
    #[serde(default)]
    labels: Vec<ForgejoLabel>,
    #[serde(default)]
    assignees: Option<Vec<ForgejoUser>>,
    #[serde(default)]
    repository: Option<ForgejoRepo>,
    #[serde(default)]
    pull_request: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct ForgejoLabel {
    #[serde(default)]
    name: String,
    #[serde(default)]
    color: String,
}

#[derive(Debug, Deserialize)]
struct ForgejoRepo {
    #[serde(default)]
    full_name: String,
}

impl ForgejoIssue {
    fn into_item(self) -> InboxItem {
        let repo = self
            .repository
            .as_ref()
            .map(|r| r.full_name.clone())
            .unwrap_or_default();
        let labels = self
            .labels
            .into_iter()
            .filter(|l| !l.name.is_empty())
            .map(|l| NamedColor {
                name: l.name,
                color: normalize_color(&l.color),
            })
            .collect();
        let assignee = self
            .assignees
            .and_then(|a| a.into_iter().next())
            .map(|u| {
                if u.full_name.trim().is_empty() {
                    u.login
                } else {
                    u.full_name
                }
            })
            .filter(|s| !s.is_empty());
        let closed = self.state == "closed";
        let external_id = if repo.is_empty() {
            format!("#{}", self.number)
        } else {
            format!("{repo}#{}", self.number)
        };
        InboxItem {
            id: format!("{repo}#{}", self.number),
            connection_id: String::new(),
            provider: KIND,
            title: self.title,
            external_id,
            url: self.html_url,
            state: ItemState {
                label: if closed { "Closed" } else { "Open" }.to_string(),
                tone: if closed { "closed" } else { "open" }.to_string(),
            },
            last_activity_at: self.updated_at.as_deref().map(iso_to_millis).unwrap_or(0),
            assignee_name: assignee,
            meta: ItemMeta::Forgejo(ForgejoMeta {
                host_name: None,
                repo,
                number: self.number,
                labels,
            }),
        }
    }
}

/// Forgejo label colors are hex without a leading `#`; normalize so the
/// frontend color dot renders. Empty / already-prefixed values pass through.
fn normalize_color(color: &str) -> String {
    let c = color.trim();
    if c.is_empty() {
        return "#6b778c".to_string();
    }
    if c.starts_with('#') {
        c.to_string()
    } else {
        format!("#{c}")
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
        .context("Failed to build HTTP client for Forgejo API")
}

/// GET `url` with `Authorization: token`, mapping 401/403 to [`AuthError`].
fn get(creds: &ForgejoSecret, url: &str, query: &[(&str, &str)]) -> Result<serde_json::Value> {
    let response = client()?
        .get(url)
        .header(
            reqwest::header::AUTHORIZATION,
            format!("token {}", creds.token),
        )
        .header(reqwest::header::ACCEPT, "application/json")
        .query(query)
        .send()
        .context("Forgejo request failed")?;
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(anyhow!(AuthError));
    }
    let body = response
        .text()
        .context("Couldn't read Forgejo response body")?;
    if !status.is_success() {
        bail!("Forgejo returned {status}: {}", body.trim());
    }
    if body.trim().is_empty() {
        return Ok(serde_json::Value::Null);
    }
    serde_json::from_str(&body).context("Forgejo response wasn't valid JSON")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn issue_maps_into_item() {
        let issue: ForgejoIssue = serde_json::from_value(json!({
            "number": 42,
            "title": "Fix the bug",
            "body": "details",
            "state": "open",
            "html_url": "https://codeberg.org/acme/app/issues/42",
            "updated_at": "2024-01-01T00:00:00Z",
            "labels": [{ "name": "bug", "color": "ee0701" }, { "name": "", "color": "fff" }],
            "assignees": [{ "login": "ada", "full_name": "Ada L" }],
            "repository": { "full_name": "acme/app" },
            "pull_request": null
        }))
        .unwrap();
        let item = issue.into_item();
        assert_eq!(item.id, "acme/app#42");
        assert_eq!(item.external_id, "acme/app#42");
        assert_eq!(item.state.tone, "open");
        assert_eq!(item.assignee_name.as_deref(), Some("Ada L"));
        assert_eq!(item.last_activity_at, 1_704_067_200_000);
        match item.meta {
            ItemMeta::Forgejo(m) => {
                assert_eq!(m.repo, "acme/app");
                assert_eq!(m.number, 42);
                assert_eq!(m.labels.len(), 1);
                assert_eq!(m.labels[0].color, "#ee0701");
            }
            _ => panic!("expected forgejo meta"),
        }
    }

    #[test]
    fn split_issue_id_parses_repo_and_number() {
        let (repo, number) = split_issue_id("acme/app#7").unwrap();
        assert_eq!(repo, "acme/app");
        assert_eq!(number, 7);
        assert!(split_issue_id("nope").is_err());
    }

    #[test]
    fn normalize_color_adds_hash() {
        assert_eq!(normalize_color("ee0701"), "#ee0701");
        assert_eq!(normalize_color("#abc"), "#abc");
        assert_eq!(normalize_color(""), "#6b778c");
    }
}
