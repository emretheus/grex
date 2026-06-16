//! Trello as an [`IssueProvider`] (REST API).
//!
//! Auth = `key` + `token` query params (the credential bundle stored in the
//! keychain is JSON `{key,token}`). Trello's card endpoints aren't
//! cursor-paginated, so the feed fetches the relevant cards, sorts by last
//! activity, and paginates client-side with an integer offset as the opaque
//! cursor. Card descriptions are already markdown.

use anyhow::{anyhow, bail, Context, Result};
use serde::Deserialize;
use serde_json::Value;

use crate::issues::connection;
use crate::issues::credentials;
use crate::issues::provider::{
    is_invalid_auth, AuthError, Connection, IssueProvider, ProviderIdentity, ProviderKind,
    ProviderScope,
};
use crate::issues::types::{InboxItem, IssueDetail, ItemMeta, ItemState, NamedColor, TrelloMeta};

const KIND: ProviderKind = ProviderKind::Trello;
const API: &str = "https://api.trello.com/1";
const CARD_FIELDS: &str =
    "name,shortUrl,shortLink,dateLastActivity,idBoard,idList,labels,closed,desc";
const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

pub struct TrelloProvider;

#[derive(Debug, Deserialize)]
pub struct TrelloSecret {
    pub key: String,
    pub token: String,
}

impl TrelloSecret {
    fn parse(secret: &str) -> Result<Self> {
        serde_json::from_str(secret).context("Stored Trello credentials weren't valid JSON")
    }
}

impl IssueProvider for TrelloProvider {
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
        let creds = TrelloSecret::parse(secret)?;
        let board_ids = string_vec(&scope.filter, "boardIds");
        let list_ids = string_vec(&scope.filter, "listIds");

        // "All" scope with explicit boards → that board's cards; otherwise the
        // member's own cards (the only cheap "assigned to me" view Trello has).
        let mut cards: Vec<TrelloCard> = if !scope.assigned_only && !board_ids.is_empty() {
            let mut acc = Vec::new();
            for board in &board_ids {
                acc.extend(get_cards(&creds, &format!("{API}/boards/{board}/cards"))?);
            }
            acc
        } else {
            get_cards(&creds, &format!("{API}/members/me/cards"))?
        };
        if !list_ids.is_empty() {
            cards.retain(|c| list_ids.contains(&c.id_list));
        }
        cards.sort_by_key(|c| std::cmp::Reverse(iso_to_millis(&c.date_last_activity)));
        Ok(paginate(cards, connection_id, cursor, limit))
    }

    fn search_issues(
        &self,
        secret: &str,
        connection_id: &str,
        query: &str,
        _cursor: Option<&str>,
        limit: u32,
    ) -> Result<(Vec<InboxItem>, Option<String>)> {
        if query.trim().is_empty() {
            return Ok((Vec::new(), None));
        }
        let creds = TrelloSecret::parse(secret)?;
        let limit_s = limit.to_string();
        let value = get(
            &creds,
            &format!("{API}/search"),
            &[
                ("query", query),
                ("modelTypes", "cards"),
                ("cards_limit", &limit_s),
                ("card_fields", CARD_FIELDS),
                ("card_board", "true"),
                ("card_list", "true"),
            ],
        )?;
        let cards: Vec<TrelloCard> = value
            .get("cards")
            .cloned()
            .map(serde_json::from_value)
            .transpose()
            .context("Couldn't parse Trello search cards")?
            .unwrap_or_default();
        // Search returns a single capped page — no cursor.
        let (items, _) = paginate(cards, connection_id, None, limit);
        Ok((items, None))
    }

    fn get_issue(&self, secret: &str, issue_id: &str) -> Result<IssueDetail> {
        let creds = TrelloSecret::parse(secret)?;
        let value = get(
            &creds,
            &format!("{API}/cards/{issue_id}"),
            &[
                ("fields", CARD_FIELDS),
                ("board", "true"),
                ("board_fields", "name"),
                ("list", "true"),
                ("list_fields", "name"),
            ],
        )?;
        let card: TrelloCard =
            serde_json::from_value(value).context("Couldn't parse Trello card detail")?;
        let description = card.desc.clone().filter(|s| !s.trim().is_empty());
        let mut item = card.into_item();
        item.connection_id = String::new();
        Ok(IssueDetail { item, description })
    }
}

/// Validate a credential bundle by resolving `members/me`. The dedupe key is
/// the Trello member id.
pub fn validate(secret: &str) -> Result<ProviderIdentity> {
    let creds = TrelloSecret::parse(secret)?;
    let me = get(
        &creds,
        &format!("{API}/members/me"),
        &[("fields", "id,fullName,username")],
    )
    .map_err(|e| {
        if is_invalid_auth(&e) {
            anyhow!("Trello rejected those credentials. Check the API key and token.")
        } else {
            e.context("Couldn't reach Trello to validate the credentials")
        }
    })?;
    let id = me.get("id").and_then(Value::as_str).unwrap_or_default();
    let name = me
        .get("fullName")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .or_else(|| me.get("username").and_then(Value::as_str))
        .unwrap_or_default();
    Ok(ProviderIdentity {
        account_key: id.to_string(),
        display_name: name.to_string(),
        user_name: name.to_string(),
    })
}

/// The member's boards, for the settings board picker.
pub fn list_boards(secret: &str) -> Result<Vec<TrelloBoard>> {
    let creds = TrelloSecret::parse(secret)?;
    let value = get(
        &creds,
        &format!("{API}/members/me/boards"),
        &[("fields", "id,name"), ("filter", "open")],
    )?;
    let boards: Vec<TrelloBoardNode> = serde_json::from_value(value).unwrap_or_default();
    Ok(boards
        .into_iter()
        .map(|b| TrelloBoard {
            id: b.id,
            name: b.name,
        })
        .collect())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrelloBoard {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
struct TrelloBoardNode {
    id: String,
    #[serde(default)]
    name: String,
}

fn get_cards(creds: &TrelloSecret, url: &str) -> Result<Vec<TrelloCard>> {
    let value = get(
        creds,
        url,
        &[
            ("fields", CARD_FIELDS),
            ("board", "true"),
            ("board_fields", "name"),
            ("list", "true"),
            ("list_fields", "name"),
        ],
    )?;
    serde_json::from_value(value).context("Couldn't parse Trello cards")
}

/// Slice a sorted card list by the integer-offset cursor, mapping the page to
/// inbox items. The next cursor is the new offset when more remain.
fn paginate(
    cards: Vec<TrelloCard>,
    connection_id: &str,
    cursor: Option<&str>,
    limit: u32,
) -> (Vec<InboxItem>, Option<String>) {
    let offset: usize = cursor.and_then(|c| c.parse().ok()).unwrap_or(0);
    let limit = limit.max(1) as usize;
    let total = cards.len();
    let end = (offset + limit).min(total);
    let page: Vec<InboxItem> = cards
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|c| {
            let mut item = c.into_item();
            item.connection_id = connection_id.to_string();
            item
        })
        .collect();
    let next = if end < total {
        Some(end.to_string())
    } else {
        None
    };
    (page, next)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrelloCard {
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    short_url: String,
    #[serde(default)]
    short_link: String,
    #[serde(default)]
    date_last_activity: String,
    #[serde(default)]
    id_list: String,
    #[serde(default)]
    closed: bool,
    #[serde(default)]
    labels: Vec<TrelloLabel>,
    #[serde(default)]
    desc: Option<String>,
    #[serde(default)]
    board: Option<TrelloNamed>,
    #[serde(default)]
    list: Option<TrelloNamed>,
}

#[derive(Debug, Deserialize)]
struct TrelloNamed {
    #[serde(default)]
    name: String,
}

#[derive(Debug, Deserialize)]
struct TrelloLabel {
    #[serde(default)]
    name: String,
    #[serde(default)]
    color: String,
}

impl TrelloCard {
    fn into_item(self) -> InboxItem {
        let list_name = self.list.map(|l| l.name).unwrap_or_default();
        let board_name = self.board.map(|b| b.name).unwrap_or_default();
        let labels = self
            .labels
            .into_iter()
            .filter(|l| !l.name.is_empty())
            .map(|l| NamedColor {
                name: l.name,
                color: trello_color(&l.color).to_string(),
            })
            .collect();
        InboxItem {
            id: self.id,
            connection_id: String::new(),
            provider: KIND,
            title: self.name,
            external_id: self.short_link,
            url: self.short_url,
            state: ItemState {
                label: if list_name.is_empty() {
                    "Card".to_string()
                } else {
                    list_name.clone()
                },
                tone: if self.closed { "closed" } else { "neutral" }.to_string(),
            },
            last_activity_at: iso_to_millis(&self.date_last_activity),
            assignee_name: None,
            meta: ItemMeta::Trello(TrelloMeta {
                board_name,
                list_name,
                labels,
            }),
        }
    }
}

/// Trello label color name → hex, so the card's color dot renders. Unknown /
/// empty colors fall back to a neutral gray.
fn trello_color(name: &str) -> &'static str {
    match name {
        "green" => "#61bd4f",
        "yellow" => "#f2d600",
        "orange" => "#ff9f1a",
        "red" => "#eb5a46",
        "purple" => "#c377e0",
        "blue" => "#0079bf",
        "sky" => "#00c2e0",
        "lime" => "#51e898",
        "pink" => "#ff78cb",
        "black" => "#344563",
        _ => "#6b778c",
    }
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

fn iso_to_millis(iso: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(iso)
        .map(|dt| dt.timestamp_millis())
        .unwrap_or(0)
}

fn client() -> Result<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .context("Failed to build HTTP client for Trello API")
}

/// GET `url` with the key+token query params appended, mapping 401/invalid
/// token to [`AuthError`].
fn get(creds: &TrelloSecret, url: &str, query: &[(&str, &str)]) -> Result<Value> {
    let mut params: Vec<(&str, &str)> = query.to_vec();
    params.push(("key", &creds.key));
    params.push(("token", &creds.token));
    let response = client()?
        .get(url)
        .query(&params)
        .send()
        .context("Trello request failed")?;
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err(anyhow!(AuthError));
    }
    let body = response
        .text()
        .context("Couldn't read Trello response body")?;
    // Trello answers an invalid key/token with 401 or a 400 + "invalid token".
    if status == reqwest::StatusCode::BAD_REQUEST && body.to_lowercase().contains("token") {
        return Err(anyhow!(AuthError));
    }
    if !status.is_success() {
        bail!("Trello returned {status}: {}", body.trim());
    }
    if body.trim().is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(&body).context("Trello response wasn't valid JSON")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn card_maps_into_item() {
        let card: TrelloCard = serde_json::from_value(json!({
            "id": "card1",
            "name": "Do work",
            "shortUrl": "https://trello.com/c/abc",
            "shortLink": "abc",
            "dateLastActivity": "2024-01-01T00:00:00.000Z",
            "idList": "list1",
            "closed": false,
            "labels": [{ "name": "urgent", "color": "red" }, { "name": "", "color": "blue" }],
            "board": { "name": "Roadmap" },
            "list": { "name": "Doing" }
        }))
        .unwrap();
        let item = card.into_item();
        assert_eq!(item.external_id, "abc");
        assert_eq!(item.state.label, "Doing");
        assert_eq!(item.last_activity_at, 1_704_067_200_000);
        match item.meta {
            ItemMeta::Trello(m) => {
                assert_eq!(m.board_name, "Roadmap");
                // The blank-name label is dropped.
                assert_eq!(m.labels.len(), 1);
                assert_eq!(m.labels[0].color, "#eb5a46");
            }
            _ => panic!("expected trello meta"),
        }
    }

    #[test]
    fn paginate_offsets_and_reports_next() {
        let cards: Vec<TrelloCard> = (0..5)
            .map(|i| {
                serde_json::from_value(json!({
                    "id": format!("c{i}"),
                    "name": format!("Card {i}"),
                    "dateLastActivity": "2024-01-01T00:00:00.000Z"
                }))
                .unwrap()
            })
            .collect();
        let (page, next) = paginate(cards, "conn", None, 2);
        assert_eq!(page.len(), 2);
        assert_eq!(next.as_deref(), Some("2"));
    }

    #[test]
    fn paginate_last_page_has_no_cursor() {
        let cards: Vec<TrelloCard> = (0..3)
            .map(|i| {
                serde_json::from_value(json!({
                    "id": format!("c{i}"),
                    "name": "x",
                    "dateLastActivity": "2024-01-01T00:00:00.000Z"
                }))
                .unwrap()
            })
            .collect();
        let (_page, next) = paginate(cards, "conn", Some("2"), 2);
        assert!(next.is_none());
    }
}
