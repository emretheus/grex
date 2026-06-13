//! In-app feedback + "Quick fix" contribution flow.
//!
//! This module backs the Feedback button next to Settings:
//!   - `github_rest::fork_grex_upstream` — POST /repos/{owner}/{repo}/forks
//!   - `github_rest::create_grex_issue`  — POST /repos/{owner}/{repo}/issues
//!   - `find_existing_grex_repo`         — look for a local repository that
//!     already points at the grex source so the wizard can skip the fork +
//!     clone steps on repeat use.
//!
//! The upstream repo is hard-coded: users do not need to configure anything.

use std::path::Path;

use anyhow::{Context, Result};
use serde::Serialize;

use crate::{forge::remote::parse_remote, models::db};

pub mod github_rest;

/// GitHub login (owner) of the Grex upstream repository.
pub const GREX_UPSTREAM_OWNER: &str = "emretheus";
/// Repository name of the Grex upstream.
pub const GREX_UPSTREAM_REPO: &str = "grex";

/// A local repository already pointing at the grex source (upstream or a
/// user fork, OR a directory whose `package.json` claims `name === grex`).
///
/// Returned to the frontend so the feedback wizard can skip the fork + clone
/// steps: `repoId` is fed straight to `prepareWorkspaceFromRepo` to spin up a
/// fresh workspace on that repo.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExistingGrexRepo {
    pub repo_id: String,
    pub repo_name: String,
}

/// Returns `true` when a git remote URL points at the grex upstream, or at
/// a fork whose repo name matches grex (case-insensitive).
///
/// We match on the repo name rather than the owner so a user who has forked
/// `emretheus/grex` to `their-login/grex` is recognised as "already set up".
/// A renamed fork (`fork-user/grex-plus`) is deliberately NOT matched —
/// those users don't need this wizard.
pub(crate) fn matches_grex_remote(remote_url: &str) -> bool {
    let Some(remote) = parse_remote(remote_url) else {
        return false;
    };
    remote.host == "github.com" && remote.repo.eq_ignore_ascii_case(GREX_UPSTREAM_REPO)
}

/// Returns `true` when the directory contains a `package.json` whose `name`
/// field equals `grex` (case-insensitive). Catches users who imported the
/// grex source tree by local path (no github remote configured).
pub(crate) fn matches_grex_package_json(root_path: &str) -> bool {
    let content = match std::fs::read_to_string(Path::new(root_path).join("package.json")) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) else {
        return false;
    };
    parsed
        .get("name")
        .and_then(|v| v.as_str())
        .is_some_and(|n| n.eq_ignore_ascii_case(GREX_UPSTREAM_REPO))
}

/// Find a local Grex repository registered in Grex (regardless of whether
/// it currently has any workspaces). A repo qualifies if EITHER its git
/// remote points at `github.com/*/grex` OR its `package.json` `name` is
/// "grex".
pub fn find_existing_grex_repo() -> Result<Option<ExistingGrexRepo>> {
    let conn = db::read_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, root_path, remote_url
             FROM repos
             WHERE COALESCE(hidden, 0) = 0
             ORDER BY datetime(updated_at) DESC, id DESC",
        )
        .context("Failed to prepare grex repo lookup")?;
    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let root_path: Option<String> = row.get(2)?;
            let remote_url: Option<String> = row.get(3)?;
            Ok((id, name, root_path, remote_url))
        })
        .context("Failed to query repos for grex detection")?;
    for row in rows {
        let (id, name, root_path, remote_url) = row?;
        let remote_match = remote_url.as_deref().is_some_and(matches_grex_remote);
        // Short-circuit the package.json read — every repo would otherwise
        // pay a disk I/O even after the remote already matched.
        let pkg_match = !remote_match
            && root_path
                .as_deref()
                .is_some_and(matches_grex_package_json);
        if remote_match || pkg_match {
            return Ok(Some(ExistingGrexRepo {
                repo_id: id,
                repo_name: name,
            }));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_upstream_https() {
        assert!(matches_grex_remote(
            "https://github.com/emretheus/grex.git"
        ));
        assert!(matches_grex_remote("https://github.com/emretheus/grex"));
    }

    #[test]
    fn matches_upstream_ssh() {
        assert!(matches_grex_remote("git@github.com:emretheus/grex.git"));
    }

    #[test]
    fn matches_user_fork() {
        assert!(matches_grex_remote(
            "https://github.com/some-user/grex.git"
        ));
    }

    #[test]
    fn matches_case_insensitive_repo_name() {
        assert!(matches_grex_remote("https://github.com/Fork/Grex.git"));
        assert!(matches_grex_remote("https://github.com/Fork/GREX"));
    }

    #[test]
    fn rejects_renamed_fork() {
        assert!(!matches_grex_remote(
            "https://github.com/fork-user/grex-plus.git"
        ));
        assert!(!matches_grex_remote(
            "https://github.com/fork-user/my-grex.git"
        ));
    }

    #[test]
    fn rejects_non_github_remote() {
        assert!(!matches_grex_remote("https://gitlab.com/foo/grex.git"));
        assert!(!matches_grex_remote(""));
        assert!(!matches_grex_remote("not-a-url"));
    }

    fn write_pkg(dir: &std::path::Path, contents: &str) {
        std::fs::write(dir.join("package.json"), contents).unwrap();
    }

    #[test]
    fn package_json_name_matches_case_insensitively() {
        let dir = tempfile::tempdir().unwrap();
        write_pkg(dir.path(), r#"{"name": "grex"}"#);
        assert!(matches_grex_package_json(dir.path().to_str().unwrap()));

        let dir2 = tempfile::tempdir().unwrap();
        write_pkg(dir2.path(), r#"{"name": "Grex", "version": "1.0.0"}"#);
        assert!(matches_grex_package_json(dir2.path().to_str().unwrap()));
    }

    #[test]
    fn package_json_other_name_does_not_match() {
        let dir = tempfile::tempdir().unwrap();
        write_pkg(dir.path(), r#"{"name": "grex-plus"}"#);
        assert!(!matches_grex_package_json(dir.path().to_str().unwrap()));
    }

    #[test]
    fn package_json_missing_or_invalid_does_not_match() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!matches_grex_package_json(dir.path().to_str().unwrap()));

        write_pkg(dir.path(), "not valid json");
        assert!(!matches_grex_package_json(dir.path().to_str().unwrap()));

        write_pkg(dir.path(), r#"{"version": "1.0.0"}"#);
        assert!(!matches_grex_package_json(dir.path().to_str().unwrap()));
    }
}
