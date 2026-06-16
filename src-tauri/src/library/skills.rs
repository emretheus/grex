//! Library **Skills** — reusable agent skill modules.
//!
//! Skills are plain `SKILL.md` files (YAML frontmatter + markdown), so the
//! filesystem is the canonical store — no database. The real content lives in
//! `~/.agentskills/<name>/SKILL.md`; creating a skill symlinks that directory
//! into each agent's skills dir (`~/.claude/skills`, `~/.codex/skills`,
//! `~/.cursor/skills`, `~/.agents/skills`). That makes the skill (a) discoverable
//! by Grex's existing skill scanner, (b) loaded by the agents themselves, and
//! (c) available when an agent is launched from a terminal. Editing the canonical
//! file propagates everywhere through the symlinks; deleting removes them all.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::Serialize;

/// Where skills are stored and which agent dirs they're linked into. Abstracted
/// so the logic is unit-testable against temp dirs.
pub struct SkillRoots {
    /// Canonical store, e.g. `~/.agentskills`.
    pub store: PathBuf,
    /// Agent skills dirs to symlink each skill into.
    pub agent_dirs: Vec<PathBuf>,
}

/// The agent skills dirs Grex's scanner reads at user scope.
const AGENT_SKILL_SUBDIRS: &[&str] = &[
    ".agents/skills",
    ".cursor/skills",
    ".claude/skills",
    ".codex/skills",
];

/// Production roots: `~/.agentskills` + the four scanned agent dirs under `~`.
pub fn production_roots() -> SkillRoots {
    let home = crate::platform::paths::home_dir_or_root();
    SkillRoots {
        store: home.join(".agentskills"),
        agent_dirs: AGENT_SKILL_SUBDIRS
            .iter()
            .map(|sub| home.join(sub))
            .collect(),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSummary {
    pub name: String,
    pub description: String,
    /// True when the skill lives in Grex's store (`~/.agentskills`) — i.e. Grex
    /// can edit/delete it. False for skills installed outside Grex (shown read-
    /// only).
    pub managed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDetail {
    pub name: String,
    pub description: String,
    /// Full `SKILL.md` content.
    pub content: String,
    pub managed: bool,
}

/// Skill names: lowercase, start alphanumeric, then alphanumeric or hyphen,
/// 1–64 chars (matches the scanner + emdash).
pub fn is_valid_skill_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    if bytes.is_empty() || bytes.len() > 64 {
        return false;
    }
    let first = bytes[0];
    if !first.is_ascii_lowercase() && !first.is_ascii_digit() {
        return false;
    }
    name.chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// List every installed skill the agents can see — Grex's own store
/// (`~/.agentskills`) plus the agent skill dirs Grex scans (`.claude/skills`,
/// `.codex/skills`, …). Deduplicated by name; the store wins (so Grex-managed
/// skills are marked editable). Mirrors emdash's "Installed" section.
pub fn list_skills(roots: &SkillRoots) -> Result<Vec<SkillSummary>> {
    let mut seen: std::collections::BTreeMap<String, SkillSummary> =
        std::collections::BTreeMap::new();
    // Store first so its `managed = true` wins over an agent-dir symlink.
    let mut scan_dirs = vec![roots.store.clone()];
    scan_dirs.extend(roots.agent_dirs.iter().cloned());

    for (idx, dir) in scan_dirs.iter().enumerate() {
        let is_store = idx == 0;
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => continue, // missing dir / no permission — best-effort
        };
        for entry in entries.flatten() {
            let md = entry.path().join("SKILL.md");
            if !md.is_file() {
                continue;
            }
            let dir_name = entry.file_name().to_string_lossy().to_string();
            let content = std::fs::read_to_string(&md).unwrap_or_default();
            let (fm_name, description) = parse_frontmatter(&content);
            let name = fm_name.unwrap_or(dir_name);
            seen.entry(name.clone()).or_insert(SkillSummary {
                name,
                description,
                managed: is_store,
            });
        }
    }
    Ok(seen.into_values().collect())
}

/// Locate a skill's `SKILL.md`, preferring Grex's store. Returns the path and
/// whether it's store-managed.
fn find_skill_md(roots: &SkillRoots, name: &str) -> Option<(PathBuf, bool)> {
    let store_md = roots.store.join(name).join("SKILL.md");
    if store_md.is_file() {
        return Some((store_md, true));
    }
    for dir in &roots.agent_dirs {
        let md = dir.join(name).join("SKILL.md");
        if md.is_file() {
            return Some((md, false));
        }
    }
    None
}

/// Read a single skill's full `SKILL.md` (store or any agent dir).
pub fn read_skill(roots: &SkillRoots, name: &str) -> Result<Option<SkillDetail>> {
    if !is_valid_skill_name(name) {
        anyhow::bail!("invalid skill name");
    }
    let Some((md, managed)) = find_skill_md(roots, name) else {
        return Ok(None);
    };
    let content = std::fs::read_to_string(&md).context("read SKILL.md")?;
    let (fm_name, description) = parse_frontmatter(&content);
    Ok(Some(SkillDetail {
        name: fm_name.unwrap_or_else(|| name.to_string()),
        description,
        content,
        managed,
    }))
}

/// Create a skill: write `~/.agentskills/<name>/SKILL.md`, then symlink the
/// skill dir into every agent dir. Errors if the name already exists.
pub fn create_skill(
    roots: &SkillRoots,
    name: &str,
    description: &str,
    content: Option<&str>,
) -> Result<SkillSummary> {
    if !is_valid_skill_name(name) {
        anyhow::bail!("invalid skill name (use lowercase letters, numbers, hyphens; 1–64 chars)");
    }
    let skill_dir = roots.store.join(name);
    if skill_dir.exists() {
        anyhow::bail!("skill \"{name}\" already exists");
    }
    let body = content
        .map(str::to_string)
        .unwrap_or_else(|| generate_skill_md(name, description));
    std::fs::create_dir_all(&skill_dir).context("create skill dir")?;
    std::fs::write(skill_dir.join("SKILL.md"), &body).context("write SKILL.md")?;

    link_into_agents(roots, name, &skill_dir)?;

    let (fm_name, parsed_desc) = parse_frontmatter(&body);
    Ok(SkillSummary {
        name: fm_name.unwrap_or_else(|| name.to_string()),
        description: if parsed_desc.is_empty() {
            description.to_string()
        } else {
            parsed_desc
        },
        managed: true,
    })
}

/// Overwrite a skill's `SKILL.md`. Symlinks point at it, so no re-sync needed.
pub fn update_skill(roots: &SkillRoots, name: &str, content: &str) -> Result<()> {
    if !is_valid_skill_name(name) {
        anyhow::bail!("invalid skill name");
    }
    let md = roots.store.join(name).join("SKILL.md");
    if !md.is_file() {
        anyhow::bail!("skill \"{name}\" not found");
    }
    std::fs::write(&md, content).context("write SKILL.md")?;
    Ok(())
}

/// Delete a skill: remove its symlinks from every agent dir, then the canonical
/// directory.
pub fn delete_skill(roots: &SkillRoots, name: &str) -> Result<()> {
    if !is_valid_skill_name(name) {
        anyhow::bail!("invalid skill name");
    }
    for dir in &roots.agent_dirs {
        let link = dir.join(name);
        // Only remove symlinks (never a user's real directory of the same name).
        if let Ok(meta) = std::fs::symlink_metadata(&link) {
            if meta.file_type().is_symlink() {
                let _ = std::fs::remove_file(&link);
            }
        }
    }
    let skill_dir = roots.store.join(name);
    if skill_dir.exists() {
        std::fs::remove_dir_all(&skill_dir).context("remove skill dir")?;
    }
    Ok(())
}

/// Symlink the skill dir into each agent dir (best-effort per agent; an existing
/// non-symlink entry is left untouched so we never clobber a user's own skill).
fn link_into_agents(roots: &SkillRoots, name: &str, skill_dir: &Path) -> Result<()> {
    for dir in &roots.agent_dirs {
        std::fs::create_dir_all(dir).context("create agent skills dir")?;
        let link = dir.join(name);
        match std::fs::symlink_metadata(&link) {
            Ok(meta) if meta.file_type().is_symlink() => {
                let _ = std::fs::remove_file(&link); // refresh a stale link
            }
            Ok(_) => continue, // real file/dir already there — don't touch it
            Err(_) => {}
        }
        symlink_dir(skill_dir, &link)?;
    }
    Ok(())
}

#[cfg(unix)]
fn symlink_dir(src: &Path, dst: &Path) -> Result<()> {
    std::os::unix::fs::symlink(src, dst).context("symlink skill")
}

#[cfg(windows)]
fn symlink_dir(src: &Path, dst: &Path) -> Result<()> {
    std::os::windows::fs::symlink_dir(src, dst).context("symlink skill")
}

/// Generate a default `SKILL.md` with YAML frontmatter (matches the scanner's
/// expected `name` / `description` keys).
pub fn generate_skill_md(name: &str, description: &str) -> String {
    format!(
        "---\nname: {name}\ndescription: {desc}\n---\n\n# {name}\n\n{desc}\n",
        desc = description.trim()
    )
}

/// Minimal frontmatter reader: pulls `name` and `description` scalar keys from a
/// leading `---` … `---` block. Good enough for summaries; the agents do full
/// parsing themselves.
fn parse_frontmatter(content: &str) -> (Option<String>, String) {
    let trimmed = content.trim_start();
    let Some(rest) = trimmed.strip_prefix("---") else {
        return (None, String::new());
    };
    let Some(end) = rest.find("\n---") else {
        return (None, String::new());
    };
    let block = &rest[..end];
    let mut name = None;
    let mut description = String::new();
    for line in block.lines() {
        if let Some(v) = line.strip_prefix("name:") {
            name = Some(v.trim().to_string());
        } else if let Some(v) = line.strip_prefix("description:") {
            description = v.trim().to_string();
        }
    }
    (name.filter(|s| !s.is_empty()), description)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roots(base: &Path) -> SkillRoots {
        SkillRoots {
            store: base.join("agentskills"),
            agent_dirs: vec![base.join(".claude/skills"), base.join(".codex/skills")],
        }
    }

    #[test]
    fn lists_external_skills_as_unmanaged() {
        let tmp = tempfile::tempdir().unwrap();
        let r = roots(tmp.path());

        // A skill installed outside Grex (real dir in an agent skills dir).
        let ext = r.agent_dirs[0].join("grex-cli");
        std::fs::create_dir_all(&ext).unwrap();
        std::fs::write(
            ext.join("SKILL.md"),
            "---\nname: grex-cli\ndescription: Use the Grex CLI\n---\n\nbody\n",
        )
        .unwrap();

        // A Grex-managed skill.
        create_skill(&r, "mine", "Mine", None).unwrap();

        let list = list_skills(&r).unwrap();
        let external = list.iter().find(|s| s.name == "grex-cli").unwrap();
        assert!(!external.managed, "external skill is read-only");
        assert_eq!(external.description, "Use the Grex CLI");
        let mine = list.iter().find(|s| s.name == "mine").unwrap();
        assert!(mine.managed, "store skill is editable");

        // read_skill resolves the external one too.
        let detail = read_skill(&r, "grex-cli").unwrap().unwrap();
        assert!(!detail.managed);
        assert!(detail.content.contains("body"));
    }

    #[test]
    fn create_links_into_agents_and_lists() {
        let tmp = tempfile::tempdir().unwrap();
        let r = roots(tmp.path());

        let created = create_skill(&r, "deploy-helper", "Helps deploy", None).unwrap();
        assert_eq!(created.name, "deploy-helper");
        assert_eq!(created.description, "Helps deploy");

        // Canonical SKILL.md exists.
        assert!(r.store.join("deploy-helper/SKILL.md").is_file());
        // Symlinked into each agent dir and resolves to the real file.
        for dir in &r.agent_dirs {
            let link = dir.join("deploy-helper");
            assert!(std::fs::symlink_metadata(&link)
                .unwrap()
                .file_type()
                .is_symlink());
            assert!(link.join("SKILL.md").is_file());
        }

        let list = list_skills(&r).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "deploy-helper");
    }

    #[test]
    fn update_then_delete_cleans_everything() {
        let tmp = tempfile::tempdir().unwrap();
        let r = roots(tmp.path());
        create_skill(&r, "thing", "desc", None).unwrap();

        update_skill(
            &r,
            "thing",
            "---\nname: thing\ndescription: new desc\n---\n\nbody\n",
        )
        .unwrap();
        let detail = read_skill(&r, "thing").unwrap().unwrap();
        assert_eq!(detail.description, "new desc");
        assert!(detail.content.contains("body"));

        delete_skill(&r, "thing").unwrap();
        assert!(read_skill(&r, "thing").unwrap().is_none());
        for dir in &r.agent_dirs {
            assert!(std::fs::symlink_metadata(dir.join("thing")).is_err());
        }
    }

    #[test]
    fn rejects_bad_names_and_duplicates() {
        let tmp = tempfile::tempdir().unwrap();
        let r = roots(tmp.path());
        assert!(create_skill(&r, "Bad Name", "d", None).is_err());
        assert!(create_skill(&r, "-leading", "d", None).is_err());
        create_skill(&r, "ok", "d", None).unwrap();
        assert!(create_skill(&r, "ok", "d", None).is_err());
    }

    #[test]
    fn delete_preserves_a_real_dir_in_agent_path() {
        let tmp = tempfile::tempdir().unwrap();
        let r = roots(tmp.path());
        // A user's own (non-symlink) skill with the same name in an agent dir.
        let real = r.agent_dirs[0].join("ok");
        std::fs::create_dir_all(&real).unwrap();
        std::fs::write(real.join("SKILL.md"), "real").unwrap();

        create_skill(&r, "ok", "d", None).unwrap(); // skips the occupied dir
        delete_skill(&r, "ok").unwrap();
        // The user's real dir is untouched.
        assert!(real.join("SKILL.md").is_file());
    }
}
