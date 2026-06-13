# Changelog

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
