# Changelog

## 0.3.0 - 2026-06-12

### Added

- Added a full-screen editor workspace (`EditorWorkspaceView`) reachable via a `view=editor` route param and a `ChatHeader` toggle: a three-pane shell (activity bar, file/diff sidebar, an editable Monaco center reusing `DockEditorPane`, and a resizable/collapsible chat pane). Sidebar files can be dragged or right-clicked into the chat composer, and per-thread shell preferences persist via `editorWorkspaceViewState`.
- Added cross-panel chat-reference plumbing so the file explorer, editor, and diff headers can push references into the active thread's composer — `chatReferences` (`@path` mentions, line/column labels, fenced snippets, "why changed" prompts), a `composerFocusRequestStore` focus nonce that `ChatView` subscribes to, and a floating "Add to chat" action (`useCodeSelectionAction`) over code surfaces.
- Added live provider usage tracking: a server `providerUsage/` pipeline with per-provider fetchers (Codex via `~/.codex/auth.json` → ChatGPT `backend-api/wham/usage`, plus Claude, Cursor, and Gemini) reporting rolling 5h and weekly windows, a `ProviderHealth` layer, SQLite-backed snapshot storage, a `ProviderUsageSettingsPanel`, and a `ProviderUsageMenuControl` chip in the chat header and Environment panel.
- Added per-thread transcript markers (highlight/underline) with full server-side projection and sync — new `thread.marker.*` decider cases, the `044_ProjectionThreadsMarkers` migration, shared `threadMarkers` logic, and an `EnvironmentMarkersSection`.
- Added inline link chips and site favicons in chat markdown (`InlineLinkChip`, `LinkChipIcon`, `SiteFavicon`) backed by a server-side `siteFaviconCache` (500-entry LRU, 24h success TTL) that gives every domain one outbound fetch and one cached blob.
- Added three new coding-agent providers — `qwenCode`, `auggie`, and `goose` — wired through `ProviderKind`, model-options contracts, orchestration start-options, provider ordering, and the composer provider registry, raising the supported-provider count from eight to eleven.
- Added a commit history panel (`GitHistoryPanel`) reachable via a Changes / History switcher in the Git dock pane: a `git.log` RPC (`GitCore.readLog`) feeding a pure-JS topology layout rendered as an inline SVG branch graph with ref-decoration chips and relative timestamps, plus a `git.show` commit-detail RPC and an in-panel Commit & Push UI.
- Added a live file-watch channel: a ref-counted, 200ms-debounced `WorkspaceFileWatcher` (`fs.watch` per cwd) broadcasting `WorkspaceFileChangeEvent` over a subscribe/unsubscribe stream RPC, with a `useWorkspaceFileWatch` hook that reloads changed directories and auto-invalidates git React Query state — no polling.
- Added a split editor to the Editor dock pane: a "Split editor" button opens the active file in a second side-by-side panel with a drag divider (clamped 20–80%), per-thread persisted split width, and Cmd+S saving the last-focused surface.
- Added hunk-level git staging: a `git.applyPatch` RPC (`git apply --cached`/`--reverse` over stdin), client-side `patchManipulation` that reconstructs valid unified diffs from `@pierre/diffs` metadata, and a `HunkActionsPanel` in `GitPanel` exposing per-hunk Stage/Discard (unstaged) and Unstage (staged) actions.
- Added pull-request creation from the source-control panel — a `CreatePullRequestDialog` with base-branch selector, optional title/body, and a draft toggle that reuses the `create_pr` stacked action (now accepting `prTitle`/`prBody`/`prBaseBranch`/`prDraft` overrides; `gh pr create` gained `--draft`), plus a "View PR" row when an open PR already tracks the branch.
- Added editable diff tabs: a changed file opens as a Monaco diff editor with the committed (HEAD) version on the left and the editable working-tree file on the right (saved with Cmd/Ctrl+S), backed by a new `git.readFileAtRef` RPC and an `openDiff` editor-store action, reachable from the git panel and the file-tree context menu.
- Added git-status colors and badges (added/modified/deleted/renamed) to file-tree rows, derived from the working-tree patch the diff panel already fetches (no new RPC), plus a right-click context menu (Open, Copy path, Copy relative path, Reveal in file manager).
- Added discard actions to the source-control panel — a per-file trash button and a "Discard all" header action behind confirm dialogs — backed by a `git.discardFiles` RPC that reverts tracked files to HEAD and removes untracked files, splitting the two server-side so git never aborts on an unmatched pathspec.
- Added a separate optional commit-description field to the commit dialog, combined with the summary the git-convention way (summary, blank line, description) via `combineCommitMessage`.
- Added a branded bottom-left "update available" popout card (`DesktopUpdatePopoutCard` / `useDesktopUpdatePopout`) with Download → Restart & install actions and per-version dismissal, matching the post-update What's New card, plus a `VITE_PREVIEW_UPDATE_CARD` dev-only preview flag.

### Changed

- Replaced the colored letter-monogram provider marks in Settings → Integrations with each tracker's official inline-SVG brand logo (theme-aware for monochrome marks) and relaid the section from a single-column list into a responsive two-column card grid showing logo, name, description, and a compact connect/disconnect action.
- Extracted the file tree into a shared `WorkspaceFileTree` component (lazy directory listing, git-status colors, live file-watch) now used by both `DockFilesPane` and the new workspace sidebar.
- Reworked the Environment panel to add Usage and Markers sections and removed the legacy "Editor / Open in Finder" row.
- Hardened workspace file reads/writes with a `realPathContainment` guard that resolves paths through `fs.realpath` after the existing string-level check — handling not-yet-existing targets via the nearest existing ancestor and canonicalizing symlinked roots — so an in-root symlink cannot escape the workspace.

### Fixed

- Fixed an infinite render loop ("Maximum update depth exceeded") that crashed the Files/Editor dock pane when opened on a thread with no editor state yet: `selectThreadEditorState` now returns a single stable empty value instead of a freshly built object on every call.

### Verification

- `bun run fmt:check`
- `bun run lint` (passes with existing warnings, 0 errors)
- `bun run typecheck` (8/8 packages)
- `bun run test`
- Web production build (`@t3tools/web`)

## 0.2.0 - 2026-06-08

### Added

- Added an issue/task-tracker integrations subsystem spanning ten providers — Linear, GitHub, Jira, GitLab, Forgejo, Asana, Monday.com, Trello, Featurebase, and Plain — built on a single stateless `ProviderAdapter` contract and a runtime registry so a new provider is one adapter plus a shared metadata entry.
- Added a server `IntegrationsService` that validates credentials against each provider's live API and persists them through the existing encrypted secret store, exposed over `integrations.*` WebSocket RPCs (connection status, connect/disconnect, list/search/issue-context).
- Added a Settings → Integrations section that lists every provider with connect/disconnect controls and live connection status, plus a data-driven connect dialog rendered from each provider's shared auth-spec.
- Added the ability to link an external issue to a thread: an issue selector with provider switching and debounced search, a compact "Link issue" control in the branch toolbar, and a `linkedIssue` snapshot persisted with the thread end to end.
- Added fetch-mocked unit tests for all ten adapters and a migration test for the new `projection_threads.linked_issue_json` column.

### Changed

- Threaded a `linkedIssue` snapshot through the orchestration read model (thread create/meta-update commands and events, the thread and shell read models) mirroring the existing `lastKnownPr` field, including projection-repository and snapshot-query read/write wiring.

### Fixed

- Fixed CI so the quality job (format, lint, typecheck, test, build) runs on a hosted runner instead of an inaccessible managed runner, and added a concurrency group so superseded runs cancel cleanly.

### Verification

- `bun run fmt:check`
- `bun run lint` (passes with existing warnings, 0 errors)
- `bun run typecheck` (8/8 packages)
- `bun run test` (server suite green, including the ten adapter test files and the new migration test)

## 0.1.4 - 2026-06-07

### Added

- Added project, thread, and message pinning across the orchestration projection, persistence layer, shared pin helpers, sidebar state, environment panel, and focused web stores.
- Added environment-panel pinned-message management and autosaved thread notes so durable context can live beside the transcript without being mixed into the chat stream.
- Added a recent-view switcher with keyboard navigation, keycap hints, route activation logic, persistent recent-view tracking, and browser/unit coverage.
- Added resumable desktop update download infrastructure with dedicated tests for partial files, persisted metadata, retry behavior, and interrupted download recovery.
- Added pull-availability data to the Git contract/server/web path so Git action controls can reflect whether pull is actually safe and useful for the current branch.
- Added broader tests for keybindings, composer mentions, composer drafts, pinned projects/threads/messages, thread detail prewarming, recent views, migrations, and release browser flows.

### Changed

- Reworked the sidebar/project/thread pinning model around shared logic so pinned state is projected consistently after reloads, legacy migration reconciliation, and snapshot refreshes.
- Expanded the chat environment surface with dedicated pinned and notes sections, tighter environment row styling, and shared action hooks for pin/unpin flows.
- Tightened composer behavior around mention icons, draft references, queued headers, picker styling, compact controls, and empty-chat controls.
- Improved runtime resilience around external Claude shutdowns, terminal manager cleanup, websocket RPC error flow, and provider session recovery.
- Refined projection snapshot queries and pipeline behavior so pinned messages, notes, and project pins are present in thread detail and orchestration snapshots.
- Updated release/browser tests and mocks around the recent switcher, keybindings, and app release surfaces.

### Fixed

- Fixed pinned-state migrations and legacy reconciliation so older projected thread data can upgrade cleanly.
- Fixed composer mention icon rendering and draft reference handling.
- Fixed release browser tests by adding switcher keycap coverage and the needed test mock.
- Fixed Git action availability checks that previously had to infer pull state too late in the UI.
- Fixed external Claude SIGTERM handling so an outside shutdown is treated as a benign suspended session instead of a failed turn.

### Verification

- `bun run fmt:check`
- `bun run lint` (passes with 138 warnings, 0 errors)
- `bun run typecheck` (passes with TS44 informational messages about JSON usage in tests/protocol files)
- `bun run release:smoke`
- `bun run build` (passes; Vite still warns about large web chunks and plugin timings)
- `bun run test` (109 test files passed, 1 skipped; 1068 tests passed, 6 skipped; 6m13s)
- `bun install` after version bump to update `bun.lock`
- `bun run test src/whatsNew/logic.test.ts` from `apps/web` after release-note edits (12 tests passed)
- `npm run build` in `the marketing website`

## 0.1.3 - 2026-06-05

### Added

- Added in-app thread recap support with provider-backed generation, cached recap state, current-state context, and tests around recap assembly.
- Added richer agent activity detail surfaces so subagent/task rows can be opened and inspected from the transcript flow.
- Added release notes for `0.1.3` to the built-in What's New / Release History data.

### Changed

- Reworked transcript, chat header, environment panel, Git action, branch toolbar, and queued composer rendering so busy sessions remain easier to scan.
- Computed repo diff totals once in `ChatView` and reused them across the header and environment panel, avoiding duplicate large-patch parsing during live updates.
- Streamlined archived-thread deletion through shared client helpers, including optimistic local removal, batched worktree-linked cleanup, and a single shell snapshot reconciliation.
- Made desktop update UI quieter during background polling and kept production web/server/desktop sourcemaps disabled by default unless explicitly enabled for diagnostics.
- Tightened terminal runtime cleanup, shell summary handling, provider activity ingestion, and session handoff safeguards.
- Refined composer attachment, reference chip, queued row, and compact control spacing for a cleaner release build.

### Fixed

- Fixed TypeScript exact-optional-property failures in optional callback pass-throughs.
- Fixed recap generation test doubles to use the shared `ThreadRecapGenerationInput` contract.
- Updated image attachment chip tests to match the current compact thumbnail UI.
- Preserved the final archived-thread and diff-total behavior with focused tests.

### Verification

- `bun run fmt:check`
- `bun run lint` (passes with existing warnings)
- `bun run typecheck`
- `bun run release:smoke`
- `bun run build`
- `bun run test`
- `bun run test integration/orchestrationEngine.integration.test.ts -t "reverts to an earlier checkpoint and trims checkpoint projections"`
- `bun run test integration/orchestrationEngine.integration.test.ts -t "forwards thread.turn.interrupt to claudeAgent provider sessions"`
- `bun run test -- src/lib/archivedThreadDelete.test.ts src/components/chat/ComposerImageAttachmentChip.test.tsx src/whatsNew/logic.test.ts`
- `bun run test -- src/git/Layers/GitManager.test.ts -t "thread recap|commit message|status"`
