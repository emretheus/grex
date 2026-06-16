//! The merged read feed shared by every issue provider.
//!
//! Lifted from the old `linear_commands::merge_feed`: iterate a provider's
//! connections, fetch each one's page, merge into a single recency-sorted
//! feed, and — when a connection's credentials stop authenticating — evict
//! just that connection (drop its secret + record) and broadcast
//! [`UiMutationEvent::IssueConnectionChanged`] so the UI reconciles, rather
//! than failing the whole feed.

use std::cmp::Reverse;
use std::collections::{BTreeMap, HashMap};

use anyhow::{anyhow, Result};
use tauri::AppHandle;

use super::provider::{is_invalid_auth, AuthError, Connection, IssueProvider, ProviderKind};
use super::registry::provider;
use super::types::{InboxItem, InboxPage, IssueDetail};
use crate::ui_sync::{self, UiMutationEvent};

/// The merged inbox feed across every connected account for `kind`.
pub fn list_inbox(
    app: &AppHandle,
    kind: ProviderKind,
    cursors: Option<HashMap<String, String>>,
    limit: u32,
) -> Result<InboxPage> {
    run_feed(app, kind, cursors, |p, secret, conn, cursor| {
        p.list_issues(secret, &conn.id, &conn.scope, cursor, limit)
    })
}

/// Free-text search merged across every connected account for `kind`.
pub fn search(
    app: &AppHandle,
    kind: ProviderKind,
    query: &str,
    cursors: Option<HashMap<String, String>>,
    limit: u32,
) -> Result<InboxPage> {
    run_feed(app, kind, cursors, |p, secret, conn, cursor| {
        p.search_issues(secret, &conn.id, query, cursor, limit)
    })
}

/// Fetch one issue's full detail from a specific connection, evicting the
/// connection on auth failure (mirrors the feed's eviction).
pub fn get_one(
    app: &AppHandle,
    kind: ProviderKind,
    connection_id: &str,
    issue_id: &str,
) -> Result<IssueDetail> {
    let p = provider(kind);
    let secret = connection_secret(kind, connection_id)?;
    match p.get_issue(&secret, issue_id) {
        Ok(detail) => Ok(detail),
        Err(error) => {
            if is_invalid_auth(&error) {
                let _ = p.forget(connection_id);
                ui_sync::publish(
                    app,
                    UiMutationEvent::IssueConnectionChanged { provider: kind },
                );
            }
            Err(error)
        }
    }
}

/// The stored secret for `connection_id`, or [`AuthError`] when none is saved
/// (so the caller reconciles the UI like any other auth failure).
pub fn connection_secret(kind: ProviderKind, connection_id: &str) -> Result<String> {
    provider(kind)
        .load_secret(connection_id)?
        .ok_or_else(|| anyhow!(AuthError))
}

/// Run `fetch` for every connection the page params select, merging results
/// into one recency-sorted feed. A connection whose credentials 401 is evicted
/// and skipped rather than failing the whole feed.
fn run_feed<F>(
    app: &AppHandle,
    kind: ProviderKind,
    cursors: Option<HashMap<String, String>>,
    fetch: F,
) -> Result<InboxPage>
where
    F: Fn(
        &dyn IssueProvider,
        &str,
        &Connection,
        Option<&str>,
    ) -> Result<(Vec<InboxItem>, Option<String>)>,
{
    let p = provider(kind);
    let connections = p.connections()?;
    let mut items: Vec<InboxItem> = Vec::new();
    let mut next: BTreeMap<String, String> = BTreeMap::new();
    let mut auth_failed: Vec<String> = Vec::new();

    for conn in &connections {
        // First page (`cursors == None`): fetch every connection. Subsequent
        // pages: only connections still listed in the cursor map.
        let cursor = match &cursors {
            None => None,
            Some(map) => match map.get(&conn.id) {
                Some(c) => Some(c.clone()),
                None => continue,
            },
        };
        let secret = match p.load_secret(&conn.id)? {
            Some(s) => s,
            None => continue,
        };
        match fetch(p, &secret, conn, cursor.as_deref()) {
            Ok((page_items, next_cursor)) => {
                items.extend(page_items);
                if let Some(c) = next_cursor {
                    next.insert(conn.id.clone(), c);
                }
            }
            Err(error) => {
                if is_invalid_auth(&error) {
                    auth_failed.push(conn.id.clone());
                } else {
                    return Err(error);
                }
            }
        }
    }

    if !auth_failed.is_empty() {
        for id in &auth_failed {
            let _ = p.forget(id);
        }
        ui_sync::publish(
            app,
            UiMutationEvent::IssueConnectionChanged { provider: kind },
        );
    }

    // Exact ordering within each page, approximate across accounts — standard
    // for a merged multi-source feed.
    items.sort_by_key(|item| Reverse(item.last_activity_at));
    Ok(InboxPage {
        items,
        cursors: next,
    })
}
