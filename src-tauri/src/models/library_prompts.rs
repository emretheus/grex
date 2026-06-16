//! Persistence for the Library's reusable **Prompts**.
//!
//! A prompt is a named, reusable instruction the user inserts into a composer
//! (new or existing task). This is a purely local, Grex-internal store — prompts
//! never touch any agent's native config; they're inserted as plain composer
//! text. Storage is the canonical source of truth (SQLite `prompt_templates`),
//! mirroring the Library's "DB-canonical" design.
//!
//! Shape matches emdash's prompt library (`{ id, title, prompt }`) so users
//! migrating between the two have a familiar mental model, plus a `sort_index`
//! for stable ordering in the UI.

use anyhow::Result;
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::models::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTemplate {
    pub id: String,
    pub title: String,
    pub prompt: String,
    pub sort_index: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// List prompts in display order (explicit `sort_index`, then creation time).
pub fn list_prompts() -> Result<Vec<PromptTemplate>> {
    let conn = db::read_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, title, prompt, sort_index, created_at, updated_at \
         FROM prompt_templates ORDER BY sort_index ASC, created_at ASC",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok(PromptTemplate {
                id: row.get(0)?,
                title: row.get(1)?,
                prompt: row.get(2)?,
                sort_index: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Fetch a single prompt by id.
pub fn get_prompt(id: &str) -> Result<Option<PromptTemplate>> {
    let conn = db::read_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, title, prompt, sort_index, created_at, updated_at \
         FROM prompt_templates WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(PromptTemplate {
            id: row.get(0)?,
            title: row.get(1)?,
            prompt: row.get(2)?,
            sort_index: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

/// Insert (when `id` is `None`) or update an existing prompt. New prompts are
/// appended after the current maximum `sort_index`. Returns the stored row.
pub fn upsert_prompt(id: Option<String>, title: &str, prompt: &str) -> Result<PromptTemplate> {
    let title = title.trim();
    if title.is_empty() {
        anyhow::bail!("prompt title cannot be empty");
    }
    let now = db::current_timestamp()?;
    let conn = db::write_conn()?;

    match id {
        Some(id) => {
            let updated = conn.execute(
                "UPDATE prompt_templates SET title = ?1, prompt = ?2, updated_at = ?3 \
                 WHERE id = ?4",
                params![title, prompt, now, id],
            )?;
            if updated == 0 {
                anyhow::bail!("prompt {id} not found");
            }
            drop(conn);
            get_prompt(&id)?.ok_or_else(|| anyhow::anyhow!("prompt {id} vanished after update"))
        }
        None => {
            let id = uuid::Uuid::new_v4().to_string();
            let next_index: i64 = conn.query_row(
                "SELECT COALESCE(MAX(sort_index), -1) + 1 FROM prompt_templates",
                [],
                |row| row.get(0),
            )?;
            conn.execute(
                "INSERT INTO prompt_templates (id, title, prompt, sort_index, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                params![id, title, prompt, next_index, now],
            )?;
            Ok(PromptTemplate {
                id,
                title: title.to_string(),
                prompt: prompt.to_string(),
                sort_index: next_index,
                created_at: now.clone(),
                updated_at: now,
            })
        }
    }
}

/// Delete a prompt. No-op when the id does not exist.
pub fn delete_prompt(id: &str) -> Result<()> {
    let conn = db::write_conn()?;
    conn.execute("DELETE FROM prompt_templates WHERE id = ?1", params![id])?;
    Ok(())
}

/// Persist a new ordering. `ordered_ids` is the full list of prompt ids in the
/// desired display order; each row's `sort_index` is set to its position.
pub fn reorder_prompts(ordered_ids: &[String]) -> Result<()> {
    let mut conn = db::write_conn()?;
    let now = db::current_timestamp()?;
    let tx = conn.transaction()?;
    for (index, id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE prompt_templates SET sort_index = ?1, updated_at = ?2 WHERE id = ?3",
            params![index as i64, now, id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Clear any seeded rows (e.g. the default "Review prompt") so a test can
    /// assert against a known-empty table.
    fn clear_all() {
        for p in list_prompts().unwrap() {
            delete_prompt(&p.id).unwrap();
        }
    }

    #[test]
    fn upsert_list_update_delete_roundtrip() {
        let _env = crate::testkit::TestEnv::new("library-prompts");
        clear_all();

        // Insert two prompts.
        let a = upsert_prompt(None, "Review", "Please review this diff.").unwrap();
        let b = upsert_prompt(None, "Tests", "Write tests for this change.").unwrap();
        assert_ne!(a.id, b.id);
        assert!(
            b.sort_index > a.sort_index,
            "new prompts append after existing"
        );

        // Listed in sort order.
        let list = list_prompts().unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, a.id);
        assert_eq!(list[1].id, b.id);

        // Update keeps id + sort_index, changes content.
        let updated = upsert_prompt(Some(a.id.clone()), "Review PR", "Review carefully.").unwrap();
        assert_eq!(updated.id, a.id);
        assert_eq!(updated.title, "Review PR");
        assert_eq!(updated.sort_index, a.sort_index);

        // Reorder swaps positions.
        reorder_prompts(&[b.id.clone(), a.id.clone()]).unwrap();
        let reordered = list_prompts().unwrap();
        assert_eq!(reordered[0].id, b.id);
        assert_eq!(reordered[1].id, a.id);

        // Delete removes one.
        delete_prompt(&a.id).unwrap();
        let remaining = list_prompts().unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, b.id);
    }

    #[test]
    fn default_review_prompt_is_seeded() {
        let _env = crate::testkit::TestEnv::new("library-prompts-seed");
        let seeded = get_prompt("review-prompt").unwrap();
        assert!(seeded.is_some(), "default Review prompt should be seeded");
        assert_eq!(seeded.unwrap().title, "Review prompt");
    }

    #[test]
    fn empty_title_is_rejected() {
        let _env = crate::testkit::TestEnv::new("library-prompts-empty");
        assert!(upsert_prompt(None, "   ", "body").is_err());
    }

    #[test]
    fn updating_missing_prompt_errors() {
        let _env = crate::testkit::TestEnv::new("library-prompts-missing");
        assert!(upsert_prompt(Some("nope".into()), "Title", "body").is_err());
    }
}
