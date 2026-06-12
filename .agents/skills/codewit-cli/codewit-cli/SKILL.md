---
name: codewit-cli
description: Use the Codewit CLI to remote-control Codewit from the terminal. Use when the user asks to inspect Codewit data/settings, manage repositories/workspaces/sessions/files, send prompts to agents, list models, use GitHub integration, inspect scripts, migrate from Conductor, run Codewit as an MCP server, generate shell completions, quit a running app, check/install/update the Codewit CLI beta, install/update Codewit skills through the beta app flow, or needs the Codewit command reference. Also plan and build a large change as a stack of dependent PRs (`/codewit-cli stack`), split a change you've already written into a stack (`/codewit-cli break`), and re-sync a stack after lower layers change or merge (`/codewit-cli restack`).
---

# Codewit CLI

Use this skill to guide simple terminal-first Codewit workflows. Keep the answer practical: prefer one or two concrete commands over a long CLI tutorial.

## Command Routing

Route by the first word after `/codewit-cli`:

- `restack` — re-sync a PR stack after a lower layer changed or merged. Follow `references/restack.md`. (This is what the composer's **Restack** button sends.)
- `stack` — plan and build a large change as a stack of dependent PRs. Follow `references/stacked-pr.md`.
- `break` — split the change you've ALREADY written in the current workspace into a stack of smaller dependent PRs, confirming the slicing granularity with the user first. Follow `references/break.md`.
- Anything else (or no argument) — an ordinary Codewit CLI task; use the binary-name guidance and command reference below.

## Binary Name (Release vs Dev)

Examples below use the literal name `codewit` — the binary a release user has on their PATH.

- **Release builds**: invoke commands as `codewit <subcommand>`.
- **Dev builds**: do NOT assume `codewit-dev` is on PATH. Under Codewit's worktree-based dev workflow every worktree has its own `target/debug/codewit-cli`, and a shared `/usr/local/bin/codewit-dev` symlink (if it exists) can only point at one of them. Instead:
  - If you're an **agent running inside Codewit**, the system prompt has already handed you the exact CLI invocation to use (typically an absolute path like `<worktree>/src-tauri/target/debug/codewit-cli`). Call it verbatim — don't re-verify with `which` / `file` / `--version`.
  - If you're a **human at a terminal**, run `<your-worktree>/src-tauri/target/debug/codewit-cli <subcommand>` (or whatever path your active Codewit build uses).

The rest of every command shape is identical regardless of build.

## First Checks

1. Check whether the CLI is installed and which data mode it targets:

```bash
codewit cli-status
```

2. Check the active data directory and database:

```bash
codewit data
```

Use `--json` when the output will be parsed by scripts or another tool.

## CLI Install And Update

Treat Codewit CLI install/update as beta.

- Prefer the Codewit desktop onboarding/settings Components panel for installing or repairing the managed CLI entrypoint.
- Use `codewit cli-status` to verify whether the PATH entry points at the current app-managed CLI.
- Do not invent a stable standalone install/update command unless it exists in `codewit --help` or a subcommand help page.
- If the user is blocked, ask them to run `codewit cli-status` and share the output, or inspect the app's Components panel if working inside the Codewit repo.

## Codewit Skills Install And Update

Treat Codewit skills install/update as a beta app-managed flow.

- Prefer the Codewit desktop onboarding/settings Components panel for installing or updating bundled Codewit skills.
- Do not invent a `codewit skills` command; the top-level CLI help does not currently expose one.
- If the user asks to update a bundled Codewit skill inside the repo, edit the skill files directly and validate them with the skill validation tooling.
- Keep user-facing skill content concise and English-first unless the user explicitly asks for another language.

## Common Tasks

### Manage Repositories And Workspaces

Use these command groups for local-first project setup and workspace orchestration:

```bash
codewit repo --help
codewit workspace --help
```

When creating workspaces, prefer explicit repo names and concise purpose labels:

```bash
codewit workspace new --repo codewit
```

### Inspect Sessions And Files

Use sessions for conversation history and files for editor-surface operations:

```bash
codewit session --help
codewit files --help
```

### Send A Prompt To An Agent

Use `send` when the user wants to dispatch work from the terminal:

```bash
codewit send --help
```

Favor JSON output for automation:

```bash
codewit --json send --help
```

### Integrations And Local Tooling

Use the relevant command group:

```bash
codewit github --help
codewit scripts --help
codewit models --help
```

### MCP Server

Run Codewit as an MCP server over stdio:

```bash
codewit mcp
```

Use this when another agent/runtime needs to call Codewit through Model Context Protocol.

## Command Reference

Read `references/codewit-help.md` when you need the full top-level `codewit --help` command list.

For exact flags on a command group, run the group's help instead of guessing:

```bash
codewit <command> --help
```
