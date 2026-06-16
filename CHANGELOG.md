# Changelog

## 0.9.0

### Minor Changes

- [#44](https://github.com/emretheus/grex/pull/44) [`91118ca`](https://github.com/emretheus/grex/commit/91118caed94a872a6c6edbb2a77014cccd2479b2) Thanks [@emretheus](https://github.com/emretheus)! - Add a file-explorer sidebar to the editor for browsing the whole codebase.

  - Toggle a left-hand file tree from the editor header to browse the workspace's folder structure and click any file open in the Monaco editor.
  - A "Browse files" button in the Changes panel opens the explorer directly — so you can browse and open files even on a branch with no changes yet, without needing a file to click first.
  - The tree loads one folder level at a time (lazily, cached per folder) and hides noise like `.git`, `node_modules`, and build output, so it stays fast on large repos.
  - IDE-grade touches: per-extension file icons, git-status badges (M/A/D) on changed files with a dot on folders that contain changes, and the tree auto-reveals + scrolls to the file you open.
  - Right-click any file or folder to copy its path, reveal it in Finder, open it in an external editor, or add a file to the chat composer as agent context.
  - The sidebar is drag-resizable and toggles with `Cmd/Ctrl+Shift+E`; its width, open state, and expanded folders persist across sessions.
  - Editor quick wins: right-click tabs (close / close others / close all, copy path, reveal in Finder, open externally, add to chat), an "Add file to chat" button, and a View menu to toggle word wrap, minimap, sticky scroll, render-whitespace, and side-by-side diff (persisted). Plus go-to-line and clickable breadcrumb segments that reveal the file in the explorer.

## 0.8.0

### Minor Changes

- [#42](https://github.com/emretheus/grex/pull/42) [`1d52589`](https://github.com/emretheus/grex/commit/1d5258968b86499890e5a0e637820b6c32372dcd) Thanks [@emretheus](https://github.com/emretheus)! - Add Forgejo, Featurebase, and Plain as Contexts sources alongside Linear, Jira, and Trello.

  - Connect Forgejo (or any Gitea-compatible instance) with an instance URL and access token to browse, search, and open issues, scope the feed to issues assigned to you or every accessible repo, and append them to the composer.
  - Connect Featurebase with an API key and your public feedback URL to browse, search, and open feedback posts with their board and upvote counts.
  - Connect Plain with an API key to browse, search, and open open support threads with their customer and priority.

## 0.7.0

### Minor Changes

- [#40](https://github.com/emretheus/grex/pull/40) [`90462eb`](https://github.com/emretheus/grex/commit/90462eb4bc6d7890bfd1abf43a8606931b072aa3) Thanks [@emretheus](https://github.com/emretheus)! - Add Jira and Trello as Contexts sources alongside Linear.

  - Connect Jira with a site URL, email, and API token to browse, search, and open issues, scope the feed to assigned issues or chosen projects, and append them to the composer.
  - Connect Trello with an API key and token to browse, search, and open cards, scoped to your cards or chosen boards.

## 0.6.0

### Minor Changes

- [#38](https://github.com/emretheus/grex/pull/38) [`87b5c65`](https://github.com/emretheus/grex/commit/87b5c65a85c5dadd46277943d0ba795c8c71e78b) Thanks [@emretheus](https://github.com/emretheus)! - Add a Library for managing reusable Prompts, Skills, and MCP servers across agents from one place.

  - Prompts: save reusable instructions and insert them into any conversation with `/prompt`.
  - MCP Servers: configure a server once — custom or from a recommended catalog — test its connection in place, and sync it to Claude Code and Codex's native configs with a preview of exactly what changes.
  - Skills: see installed skills and browse a recommended catalog to install (fetches the real upstream `SKILL.md` and links it into your agents), or author your own.

## 0.5.1

### Patch Changes

- [#35](https://github.com/emretheus/grex/pull/35) [`469689a`](https://github.com/emretheus/grex/commit/469689a558d365b34377300aae13139ff8a8a64b) Thanks [@emretheus](https://github.com/emretheus)! - Linear context source now supports per-workspace feed scope and multiple connected workspaces.

  - Each connected Linear workspace can show **Assigned to me** (default) or **All issues**, with optional team and project filters when showing all, configurable in Settings → Contexts → Linear.
  - Connect more than one Linear workspace (org); the inbox feed merges issues across every connection and labels them by workspace when more than one is connected.

## 0.5.0

### Minor Changes

- [#30](https://github.com/emretheus/grex/pull/30) [`0d24750`](https://github.com/emretheus/grex/commit/0d247506fa53b89856626fd28b2d8a532ea5bcd9) Thanks [@emretheus](https://github.com/emretheus)! - Add Kimi Code as a new agent provider.

  - Run Kimi models over the Agent Client Protocol with streaming responses, tool calls, file diffs, plans, permission prompts, and slash commands
  - Sign in with `kimi login` from Settings → Providers
  - Manage Kimi's third-party model providers via `~/.kimi-code` config and choose which models appear in the composer's picker

### Patch Changes

- [#30](https://github.com/emretheus/grex/pull/30) [`0d24750`](https://github.com/emretheus/grex/commit/0d247506fa53b89856626fd28b2d8a532ea5bcd9) Thanks [@emretheus](https://github.com/emretheus)! - Fix Cursor responses briefly rendering their text twice while a turn is still streaming; the duplicate text now collapses to a single copy as it streams.

- [#29](https://github.com/emretheus/grex/pull/29) [`f6967c5`](https://github.com/emretheus/grex/commit/f6967c5233b9111fe78057086883d2d2539bd930) Thanks [@emretheus](https://github.com/emretheus)! - Fix agent questions getting permanently stuck on "Awaiting answer" with no way to respond.

  - Rebuild the interactive answer panel from the persisted thread after a window reload or re-attach, so a parked question stays answerable instead of leaving only a read-only "Awaiting answer" card.
  - Surface an error and re-show the question when an answer can't reach the agent (e.g. the app was restarted and the turn is gone), instead of silently dropping it.

- [#30](https://github.com/emretheus/grex/pull/30) [`0d24750`](https://github.com/emretheus/grex/commit/0d247506fa53b89856626fd28b2d8a532ea5bcd9) Thanks [@emretheus](https://github.com/emretheus)! - OpenCode now shows "Ready" only after an actual sign-in, so the Login action stays available when only environment variables or custom providers are configured.

## 0.4.0

### Minor Changes

- [#25](https://github.com/emretheus/grex/pull/25) [`9dc8b5f`](https://github.com/emretheus/grex/commit/9dc8b5f1c08f686d7d6f692d6f7621de193fc3ff) Thanks [@emretheus](https://github.com/emretheus)! - Add Linear as a Context source so you can pull issues into Grex:

  - Connect Linear with a personal API key (Settings → Contexts → Linear), then browse and search your assigned issues in the context panel and append any of them to a prompt.
  - Open an issue to preview its full description, priority, team, and labels inline.
  - Start a new workspace straight from an issue — the branch is named after the issue and the composer is pre-seeded with its title and description.

## 0.3.1

### Patch Changes

- [#23](https://github.com/emretheus/grex/pull/23) [`dc1203d`](https://github.com/emretheus/grex/commit/dc1203d65783084addc28a616d02565c7f5ac1a1) Thanks [@emretheus](https://github.com/emretheus)! - Replace the leftover legacy app icon and browser favicon with the current Grex hexagon mark, and rebuild the macOS icon set with the standard icon-grid padding so the Dock icon no longer renders oversized next to other apps.

## 0.3.0

### Minor Changes

- [#20](https://github.com/emretheus/grex/pull/20) [`c833913`](https://github.com/emretheus/grex/commit/c833913070d8b8f5ddfec4bf3a498d030a53d3b6) Thanks [@emretheus](https://github.com/emretheus)! - Custom AI provider improvements:

  - Codex now supports custom providers — point it at any OpenAI-compatible (Responses API) endpoint in Settings, fetch its models, and pick which ones show up in the composer. The provider definition is injected per-thread (never writes `~/.codex/config.toml`).
  - Pick which official Claude and Codex models appear in the composer's model picker; deselecting all of a provider hides its section.

- [#19](https://github.com/emretheus/grex/pull/19) [`c52e738`](https://github.com/emretheus/grex/commit/c52e738386f183dfe22983e21ab5c92835d32f17) Thanks [@emretheus](https://github.com/emretheus)! - Promote Gemini (Gemini CLI) from experimental to a fully supported provider, and polish the workspace UI:

  - Gemini turns now render in full — assistant text, reasoning, tool cards, and plans — with plan mode, mid-turn steer, slash commands, session-title generation, and resume across restarts. Gemini also appears in Settings → Providers with a sign-in flow.
  - The "agent working" indicator is now an animated Grex "G" mark.
  - The composer's permission toggle shows an explicit "Auto" / "Plan" text label.
  - The workspaces sidebar now groups by repository by default.

### Patch Changes

- [#20](https://github.com/emretheus/grex/pull/20) [`c833913`](https://github.com/emretheus/grex/commit/c833913070d8b8f5ddfec4bf3a498d030a53d3b6) Thanks [@emretheus](https://github.com/emretheus)! - Improve Claude model handling:

  - The default Claude model is pinned to Opus 4.8 (1M context) so it can't silently switch to a different model when the bundled Claude CLI updates; existing sessions and settings keep the same model.
  - Terminal mode is now limited to official Claude models — custom (BYOK) Claude models run in GUI mode instead, since the terminal can't carry their custom provider settings.

- [`76a3213`](https://github.com/emretheus/grex/commit/76a3213e7e66e7c69d3dafe74532326ac912dd78) Thanks [@emretheus](https://github.com/emretheus)! - The macOS, Windows, and mobile app icons now use the standard ~80% inset so the dock icon no longer appears oversized next to other apps.

- [#19](https://github.com/emretheus/grex/pull/19) [`c52e738`](https://github.com/emretheus/grex/commit/c52e738386f183dfe22983e21ab5c92835d32f17) Thanks [@emretheus](https://github.com/emretheus)! - The app splash / reload screen now shows the static Grex logo with a gentle pulse instead of the tile-flip mark; in-app loaders keep the existing animation.

- [#20](https://github.com/emretheus/grex/pull/20) [`c833913`](https://github.com/emretheus/grex/commit/c833913070d8b8f5ddfec4bf3a498d030a53d3b6) Thanks [@emretheus](https://github.com/emretheus)! - Fix Intel (x86_64) builds shipping an arm64 `grex-sidecar`, which made the app fail to launch its sidecar with "Failed to start sidecar binary" / "bad CPU type in executable" on Intel Macs. The sidecar is now cross-compiled to the release target triple, and the bundle arch check covers it so the mismatch can't ship again.

## 0.2.0

### Minor Changes

- [#17](https://github.com/emretheus/grex/pull/17) [`5375b42`](https://github.com/emretheus/grex/commit/5375b42a96806fe3c6e8c113d2c10ffcc792325d) Thanks [@emretheus](https://github.com/emretheus)! - Queue follow-up prompts by default while an agent is working, surface an explicit Auto mode in the composer, and add an experimental Gemini provider.

  - Follow-ups now queue above the composer by default while the agent runs — line up your next tasks and Steer, Edit, or Delete each queued item. Switch back to inline steering in Settings → Follow-up behavior.
  - The composer permission toggle now shows an explicit Plan vs Auto state, so it's clear when the agent is running with full access.
  - Fixed the Contexts panel in the right sidebar so you can get back to the git inspector.
  - Added Gemini (Gemini CLI) as an experimental provider.

### Patch Changes

- [#17](https://github.com/emretheus/grex/pull/17) [`bbcc8c1`](https://github.com/emretheus/grex/commit/bbcc8c1b0293c1c40b40c77a995cf03277ffca2e) Thanks [@emretheus](https://github.com/emretheus)! - Preview image files (PNG, SVG, JPG, GIF, WebP) inline when opened from the Changes panel instead of showing raw binary in the code editor.

## 0.1.0

### Initial Release

Forked from [Helmor](https://github.com/dohooo/helmor) (v0.37.0) and rebranded as Grex — a local-first desktop IDE for coding agent orchestration.

- **Multi-agent support**: Claude Code, Codex, Cursor, Gemini, Grok, Kilo Code, OpenCode, and Pi from a single interface
- **Tauri desktop shell**: Native macOS (aarch64 + x86_64) and Windows (x64) builds
- **Workspace management**: Worktrees, local workspaces, and Just Chat sessions
- **Built-in terminal**: Full PTY support for agent TUIs and run/setup scripts
- **Git forge integration**: GitHub and GitLab PR/MR creation, CI checks, and code review
- **Slack context**: Import from Slack desktop, browse threads, add to agent context
- **Smart triage**: Opt-in background scanning for actionable items across platforms
- **Mobile companion**: Remote browser access to desktop workspaces
- **Stacked PRs**: Plan and build large changes as dependent PR chains
