# IDE Experience Gap Analysis: Codewit vs. emdash

Deep comparison of the editor / file-explorer / diff / git experience. emdash
source analyzed at `/tmp/emdash-research`; Codewit at this repo. Goal: find what
emdash does that we don't, ranked by impact.

## TL;DR — where we stand

Codewit already has a **solid foundation**: Monaco editor with tabs + save +
syntax highlighting, a lazy file tree, side-by-side **and** inline diffs (working
tree / staged / unstaged / turn), stage/unstage/commit/push, branch switcher +
create, worktrees. The git _plumbing_ is strong.

emdash is ahead mostly on **IDE-grade polish and a more complete git/PR panel**.
The gaps cluster into five themes below.

---

## Gap themes (ranked by impact)

### 1. Split / multi-pane editor — the headline feature in the screenshot

**emdash:** Freeform N-column editor split (`react-resizable-panels`), drag a tab
to the edge to split, per-pane tab groups, a bottom terminal drawer, all
resizable and persisted. One tab strip can hold **mixed content** (agent chat +
file + diff) side by side.

**Codewit:** The editor is a _single_ Monaco instance in one dock pane. Our split
view (`splitViewStore`) splits **chat threads**, not the editor/dock. You cannot
put a file diff next to an editor next to a terminal in one resizable workspace.

**Gap:** No editor/dock split. This is the single biggest visual/UX difference.

### 2. Git panel completeness — the right-hand commit panel

**emdash:** A dedicated, always-visible git panel with:

- `Commit message` **+ separate `Description`** field → combined into the commit body.
- A **`Commit & Push` split-button** with variants: _Commit_, _Commit & Push_,
  _Commit & Create PR_.
- **Discard / Discard-all** with confirmation (per file + global).
- **Create PR / Create draft PR** directly from the panel (split button) + a
  create-PR modal (title auto-filled, description, **base-branch selector**,
  fork/remote target), with auto-push-before-create. Lists existing PRs, refresh.
- **Branch sync bar**: Fetch / Pull / Push buttons, ahead/behind counts,
  Publish for unpublished branches.
- **List + Tree view toggle** for the changed-files list, multi-select.

**Codewit:** We have stage/unstage/commit/push (via the stacked-action RPC) and a
branch switcher, but:

- Commit is a single message field (no separate description). — _minor_
- **Discard / discard-all is NOT exposed in the UI** (RPC may exist; no button).
- **Full PR creation is MISSING** — we only _open an existing PR_ by reference
  via `PullRequestThreadDialog`. No "create PR from this branch", no draft PR, no
  base-branch picker, no PR list.
- No explicit Fetch/Pull/Push buttons with ahead/behind in a panel (we have
  status in a toolbar + stacked actions, but not the emdash-style sync bar).
- Changed-files list has no list/tree toggle, no multi-select.

**Gap:** PR creation, discard, the commit description field, and a cohesive
sync/commit panel layout.

### 3. Diff tabs as first-class, openable + transitioning

**emdash:** A changed file opens as a **diff tab** in the editor tab strip,
labeled by source: `(Working Tree)`, `(Index)`, `(Git)`, `(PR)`. The tab
**transitions in place** when a file moves unstaged→staged (label flips
Working Tree → Index) without losing tab identity. The modified side is
**editable** for working-tree diffs (edit-in-diff + Cmd+S). Diff opens from the
file tree, the git panel, single-click = preview tab, double-click = pinned.

**Codewit:** Diffs render in a dedicated **DiffPanel** (one dock pane), selected
from the GitPanel list — not as independent, reorderable tabs alongside files.
No edit-in-diff. No working-tree/index labeled tab transitions. We do have the
four scopes (working tree / staged / unstaged / turn) which is good.

**Gap:** Diff-as-tab (heterogeneous tab strip), edit-in-diff, preview/pinned tabs,
in-place staged↔unstaged transitions.

### 4. File explorer richness

**emdash:** Git-status colors per file, file-type icons (devicon), context menu
(copy path/relative/content), **virtualized** tree, file watcher → live tree,
drag-drop import, reveal-in-tree after commit, optimistic insert.

**Codewit:** Lazy tree + expand/collapse + open-into-editor + sort. **Missing:**
git-status colors, context menu (create/rename/delete or copy-path), search/filter,
virtualization, live file-watcher updates.

**Gap:** Git-status colors (cheap, high value), context menu, search, live watch.

### 5. Live updates via a real file watcher

**emdash:** A `@parcel/watcher` on the worktree + `.git` dir drives **live**
updates: the tree, the open diffs, and the git status all refresh on disk/index
changes (debounced 100–500ms), with Monaco disk-model invalidation.

**Codewit:** Mostly **polled** (git status 30s stale + 4s live during active turns;
diff 5s). The IDE Files/Editor plan (`docs/plans/...`) lists a file-change channel
as a deferred MVP follow-up; it isn't wired yet.

**Gap:** A real worktree file-watch channel → live tree/diff/status without polling.

---

## What we already match or lead on (don't rebuild)

- Side-by-side **and** inline diff with a toggle — ✅ (both have it).
- Working-tree / staged / unstaged / **turn (checkpoint)** diffs — ✅ (turn diffs
  are a Codewit strength emdash lacks).
- Monaco editor: tabs, save, dirty dot, syntax highlighting, file reorder — ✅.
- Branch switcher + create + **worktrees** + stash-on-switch — ✅ (solid).
- Diff theming (GitHub light/dark) — ✅.
- Neither app has: **commit history / log viewer, blame, hunk/partial staging,
  rebase/merge UI** — so these are greenfield for both (potential differentiators).

---

## Recommended roadmap (impact × effort)

### Quick wins (high value, low effort)

1. **Git-status colors in the file tree** — reuse the changed-file list we already
   fetch; tint tree rows M/A/D. (1 file, big perceived-quality jump.)
2. **Discard / discard-all buttons** in the git panel — the RPC story likely
   exists; surface it with a confirm. Closes an obvious gap.
3. **Commit description field** — split the commit input into message + body.
4. **File-tree context menu** — copy path / copy relative path / reveal. Cheap.

### Medium (high value, medium effort)

5. **Full PR creation from the panel** — "Create PR / Create draft PR" + a modal
   (title, body, base-branch selector) using the GitHub plumbing we already have
   (`resolveGitHubRepository`, the new integrations GitHub adapter). Closes the
   biggest _functional_ git gap.
6. **Diff-as-tab + edit-in-diff** — let a changed file open as a diff tab in the
   editor strip with an editable modified side (Monaco diff editor), Cmd+S to save.
7. **Live file-watch channel** — wire the deferred file-change channel so tree +
   diff + status update without polling. Foundational for everything above.

### Larger (headline, higher effort)

8. **Split / multi-pane editor workspace** — `react-resizable-panels`-style
   resizable regions so editor + diff + terminal live side by side, drag-to-split,
   per-pane tab groups, mixed content tabs. This is the marquee emdash feature.

### Potential differentiators (neither app has — we could lead)

9. **Commit history / log viewer** + **blame** — greenfield; pairs naturally with
   our checkpoint/turn-diff timeline (a Codewit strength).
10. **Hunk / line staging** (`git add -p`-style) — neither app has it; a real
    power-user win in the diff view.
