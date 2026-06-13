<div align="center">

# Grex

**One minimal desktop app for every AI coding agent.**

Grex is an open, multi-provider GUI for coding agents — run Claude Code, Codex, and
OpenCode from a single clean, local-first interface, with built-in chat, diff review,
a file explorer + editor, and terminals.

[![Latest release](https://img.shields.io/github/v/release/emretheus/grex?label=release&labelColor=1c2933&color=0158fd)](https://github.com/emretheus/grex/releases)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-1c2933.svg?labelColor=1c2933&color=666)](./LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/emretheus/grex/ci.yml?branch=main&labelColor=1c2933)](https://github.com/emretheus/grex/actions)

[Download](https://github.com/emretheus/grex/releases) ·
[Contributing](./CONTRIBUTING.md)

</div>

## Why Grex

Most coding-agent tools lock you into a single model. Grex is **multi-provider by
design** — pick the agent that fits the task, switch between them without losing your
conversation, and keep everything in one fast, local-first desktop app.

- **One app, many agents** — no juggling separate terminals or apps per provider.
- **See and edit code in-app** — a real file explorer and editable editor.
- **Review before you ship** — inline diffs, working-tree changes, and git actions in one place.
- **Local-first** — state lives in a local SQLite database on your machine.

## Supported agents

Grex auto-detects the provider CLIs you already have installed:

| Agent | Provider |
| --- | --- |
| **Claude Code** | Anthropic |
| **Codex** | OpenAI |
| **OpenCode** | OpenCode |

> More providers are on the way.

## Install

| Platform | Download |
| --- | --- |
| **macOS** (Apple Silicon / Intel) | [Releases page](https://github.com/emretheus/grex/releases/latest) |
| **Windows** | [Releases page](https://github.com/emretheus/grex/releases/latest) |

## Features

- 🔀 **Multi-provider chat** — multiple coding agents, one interface.
- 📂 **File explorer + editor** — browse and edit files in-app (Monaco).
- 🔍 **Diff review** — per-turn diffs and working-tree changes.
- 🌿 **Git + worktrees** — commit, branch, and open PRs; isolate work in git worktrees.
- 🖥️ **Integrated terminals** — run commands alongside the agent.
- 🕰️ **Checkpointing** — every turn is snapshotted for safe review.

## Tech stack

Tauri · React · TypeScript · Vite · Tailwind · Monaco · SQLite · Bun.

## Lineage

Grex is a fork of [Helmor](https://github.com/dohooo/helmor), an open-source local
workbench for multi-agent software development created by Caspian Zhao and Nathan Lian.
We're grateful to the Helmor project, whose Apache 2.0-licensed work made this possible.

## License

[Apache 2.0](./LICENSE)
