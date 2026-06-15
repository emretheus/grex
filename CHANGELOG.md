# Changelog

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
