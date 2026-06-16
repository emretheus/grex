//! Featurebase as an [`IssueProvider`] (REST `/v2`).
//!
//! Featurebase surfaces customer feedback "posts" (feature requests). Auth is
//! the `X-API-Key` header; there is no identity endpoint, so the credential
//! bundle stored in the keychain is JSON `{apiKey,orgUrl}` where `orgUrl` is
//! the org's public feedback base (e.g. `https://acme.featurebase.app`). It
//! both identifies the connection (dedupe key + display name) and builds each
//! post's public URL (`<orgUrl>/p/<slug>`), since the API never returns one.
//! Posts are page-paginated; `content` arrives as HTML and is flattened to
//! text for the preview.

use anyhow::{anyhow, bail, Context, Result};
use serde::Deserialize;

use crate::issues::connection;
use crate::issues::credentials;
use crate::issues::provider::{
    is_invalid_auth, AuthError, Connection, IssueProvider, ProviderIdentity, ProviderKind,
    ProviderScope,
};
use crate::issues::types::{FeaturebaseMeta, InboxItem, IssueDetail, ItemMeta, ItemState};

const KIND: ProviderKind = ProviderKind::Featurebase;
const API: &str = "https://do.featurebase.app/v2";
const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

pub struct FeaturebaseProvider;

#[derive(Debug, Deserialize)]
pub struct FeaturebaseSecret {
    pub api_key: String,
    /// Public feedback base URL, e.g. `https://acme.featurebase.app`.
    pub org_url: String,
}

impl FeaturebaseSecret {
    fn parse(secret: &str) -> Result<Self> {
        serde_json::from_str(secret).context("Stored Featurebase credentials weren't valid JSON")
    }
    fn org_base(&self) -> &str {
        self.org_url.trim_end_matches('/')
    }
}

impl IssueProvider for FeaturebaseProvider {
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
        let creds = FeaturebaseSecret::parse(secret)?;
        let page = cursor
            .and_then(|c| c.parse::<u32>().ok())
            .unwrap_or(1)
            .max(1);
        let limit_s = limit.to_string();
        let page_s = page.to_string();
        let params: Vec<(&str, &str)> = vec![
            ("limit", &limit_s),
            ("page", &page_s),
            ("sortBy", "date:desc"),
        ];
        fetch_page(&creds, connection_id, &params)
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
        let creds = FeaturebaseSecret::parse(secret)?;
        let page = cursor
            .and_then(|c| c.parse::<u32>().ok())
            .unwrap_or(1)
            .max(1);
        let limit_s = limit.to_string();
        let page_s = page.to_string();
        let params: Vec<(&str, &str)> = vec![
            ("q", query),
            ("limit", &limit_s),
            ("page", &page_s),
            ("sortBy", "date:desc"),
        ];
        fetch_page(&creds, connection_id, &params)
    }

    fn get_issue(&self, secret: &str, issue_id: &str) -> Result<IssueDetail> {
        let creds = FeaturebaseSecret::parse(secret)?;
        let value = get(&creds, &format!("{API}/posts"), &[("id", issue_id)])?;
        let page: FeaturebasePage =
            serde_json::from_value(value).context("Couldn't parse Featurebase post detail")?;
        let post = page
            .results
            .into_iter()
            .next()
            .ok_or_else(|| anyhow!("Featurebase post {issue_id} not found"))?;
        let description = html_to_text(post.content.as_deref().unwrap_or_default());
        let description = if description.trim().is_empty() {
            None
        } else {
            Some(description)
        };
        let mut item = post.into_item(creds.org_base());
        item.connection_id = String::new();
        Ok(IssueDetail { item, description })
    }
}

/// Validate by listing one post (Featurebase has no identity endpoint). The
/// dedupe key + display name come from the user-supplied org URL.
pub fn validate(secret: &str) -> Result<ProviderIdentity> {
    let creds = FeaturebaseSecret::parse(secret)?;
    if creds.org_base().is_empty() {
        bail!("Enter your Featurebase feedback URL (e.g. https://acme.featurebase.app).");
    }
    get(&creds, &format!("{API}/posts"), &[("limit", "1")]).map_err(|e| {
        if is_invalid_auth(&e) {
            anyhow!("Featurebase rejected that API key. Check it in Settings → Integrations → API.")
        } else {
            e.context("Couldn't reach Featurebase to validate the API key")
        }
    })?;
    let host = creds
        .org_base()
        .strip_prefix("https://")
        .or_else(|| creds.org_base().strip_prefix("http://"))
        .unwrap_or(creds.org_base())
        .to_string();
    Ok(ProviderIdentity {
        account_key: creds.org_base().to_string(),
        display_name: host,
        user_name: String::new(),
    })
}

fn fetch_page(
    creds: &FeaturebaseSecret,
    connection_id: &str,
    params: &[(&str, &str)],
) -> Result<(Vec<InboxItem>, Option<String>)> {
    let value = get(creds, &format!("{API}/posts"), params)?;
    let page: FeaturebasePage =
        serde_json::from_value(value).context("Couldn't parse Featurebase posts")?;
    let next = if page.page < page.total_pages {
        Some((page.page + 1).to_string())
    } else {
        None
    };
    let org = creds.org_base();
    let items = page
        .results
        .into_iter()
        .map(|p| {
            let mut item = p.into_item(org);
            item.connection_id = connection_id.to_string();
            item
        })
        .collect();
    Ok((items, next))
}

#[derive(Debug, Default, Deserialize)]
struct FeaturebasePage {
    #[serde(default)]
    results: Vec<FeaturebasePost>,
    #[serde(default = "one")]
    page: u32,
    #[serde(default = "one", rename = "totalPages")]
    total_pages: u32,
}

fn one() -> u32 {
    1
}

#[derive(Debug, Deserialize)]
struct FeaturebasePost {
    #[serde(default)]
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    slug: String,
    #[serde(default)]
    upvotes: i64,
    #[serde(default)]
    date: Option<String>,
    #[serde(default, rename = "lastModified")]
    last_modified: Option<String>,
    #[serde(default, rename = "postStatus")]
    post_status: Option<FeaturebaseStatus>,
    #[serde(default, rename = "postCategory")]
    post_category: Option<FeaturebaseCategory>,
}

#[derive(Debug, Deserialize)]
struct FeaturebaseStatus {
    #[serde(default)]
    name: String,
}

#[derive(Debug, Deserialize)]
struct FeaturebaseCategory {
    #[serde(default)]
    category: String,
}

impl FeaturebasePost {
    fn into_item(self, org_base: &str) -> InboxItem {
        let board = self.post_category.map(|c| c.category).unwrap_or_default();
        let status_label = self
            .post_status
            .map(|s| s.name)
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Open".to_string());
        let url = if self.slug.is_empty() {
            org_base.to_string()
        } else {
            format!("{org_base}/p/{}", self.slug)
        };
        let activity = self
            .last_modified
            .as_deref()
            .or(self.date.as_deref())
            .map(iso_to_millis)
            .unwrap_or(0);
        InboxItem {
            id: self.id,
            connection_id: String::new(),
            provider: KIND,
            title: self.title,
            external_id: format!("▲ {}", self.upvotes),
            url,
            state: ItemState {
                tone: status_tone(&status_label).to_string(),
                label: status_label,
            },
            last_activity_at: activity,
            assignee_name: None,
            meta: ItemMeta::Featurebase(FeaturebaseMeta {
                org_name: None,
                board,
                upvotes: self.upvotes,
            }),
        }
    }
}

/// Featurebase statuses are org-defined free text; map by common name so the
/// card's color dot is meaningful, defaulting to neutral.
fn status_tone(name: &str) -> &'static str {
    let n = name.to_lowercase();
    if n.contains("complete")
        || n.contains("done")
        || n.contains("shipped")
        || n.contains("live")
        || n.contains("closed")
    {
        "merged"
    } else if n.contains("progress")
        || n.contains("planned")
        || n.contains("review")
        || n.contains("considering")
    {
        "open"
    } else {
        "neutral"
    }
}

/// Best-effort HTML → text: drop tags, decode a handful of common entities,
/// and collapse runs of blank lines. Good enough for a preview body.
fn html_to_text(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    let decoded = out
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'");
    // Collapse 3+ newlines down to a blank line.
    let mut result = String::with_capacity(decoded.len());
    let mut newlines = 0;
    for ch in decoded.chars() {
        if ch == '\n' {
            newlines += 1;
            if newlines <= 2 {
                result.push(ch);
            }
        } else {
            newlines = 0;
            result.push(ch);
        }
    }
    result.trim().to_string()
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
        .context("Failed to build HTTP client for Featurebase API")
}

/// GET `url` with the `X-API-Key` header, mapping 401/403 to [`AuthError`].
fn get(creds: &FeaturebaseSecret, url: &str, query: &[(&str, &str)]) -> Result<serde_json::Value> {
    let response = client()?
        .get(url)
        .header("X-API-Key", &creds.api_key)
        .header(reqwest::header::ACCEPT, "application/json")
        .query(query)
        .send()
        .context("Featurebase request failed")?;
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(anyhow!(AuthError));
    }
    let body = response
        .text()
        .context("Couldn't read Featurebase response body")?;
    if !status.is_success() {
        bail!("Featurebase returned {status}: {}", body.trim());
    }
    serde_json::from_str(&body).context("Featurebase response wasn't valid JSON")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn post_maps_into_item() {
        let page: FeaturebasePage = serde_json::from_value(json!({
            "results": [{
                "id": "p1",
                "title": "Dark mode",
                "content": "<p>Please add <b>dark mode</b></p>",
                "slug": "dark-mode",
                "upvotes": 12,
                "lastModified": "2024-01-01T00:00:00.000Z",
                "postStatus": { "name": "In Progress" },
                "postCategory": { "category": "Feature Requests" }
            }],
            "page": 1,
            "totalPages": 3
        }))
        .unwrap();
        let post = page.results.into_iter().next().unwrap();
        let item = post.into_item("https://acme.featurebase.app");
        assert_eq!(item.id, "p1");
        assert_eq!(item.url, "https://acme.featurebase.app/p/dark-mode");
        assert_eq!(item.external_id, "▲ 12");
        assert_eq!(item.state.tone, "open");
        match item.meta {
            ItemMeta::Featurebase(m) => {
                assert_eq!(m.board, "Feature Requests");
                assert_eq!(m.upvotes, 12);
            }
            _ => panic!("expected featurebase meta"),
        }
    }

    #[test]
    fn html_to_text_strips_tags_and_entities() {
        assert_eq!(
            html_to_text("<p>Add <b>dark</b> &amp; light</p>"),
            "Add dark & light"
        );
    }

    #[test]
    fn next_cursor_stops_at_last_page() {
        let creds = FeaturebaseSecret {
            api_key: "k".into(),
            org_url: "https://acme.featurebase.app".into(),
        };
        assert_eq!(creds.org_base(), "https://acme.featurebase.app");
    }
}
