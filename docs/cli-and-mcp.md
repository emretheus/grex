# Codewit CLI & MCP Server

Codewit ships a companion CLI inside the desktop app bundle. Release builds
install `codewit`; debug builds install `codewit-dev`. The terminal entrypoint
always points at the currently installed desktop app so CLI and desktop
versions stay aligned.

## Install

### Settings UI

Open the desktop app → Settings → Experimental → **Command Line Tool** → Install.
This installs a managed launcher to the app bundle's `codewit-cli`:

- macOS release: `/usr/local/bin/codewit`
- macOS debug: `/usr/local/bin/codewit-dev`
- Windows release: `%LOCALAPPDATA%\Codewit\bin\codewit.cmd`
- Windows debug: `%LOCALAPPDATA%\Codewit\bin\codewit-dev.cmd`

On Windows, open a new terminal after installing so the updated user `PATH` is visible.

### Development

```bash
bun run dev:cli:build
./src-tauri/target/debug/codewit-cli cli-status
bun run dev:cli:install
codewit-dev cli-status
```

The debug build reads `~/codewit-dev/` — same database as `bun run dev`.

## CLI Usage

```bash
codewit data info
codewit repo list
codewit repo add /path/to/repo
codewit workspace list
codewit workspace show codewit/earth            # human-readable ref
codewit workspace new --repo codewit
codewit workspace stack codewit/earth           # show PR stack for a workspace
codewit session list --workspace codewit/earth
codewit session new --workspace codewit/earth
codewit send --workspace codewit/earth "Refactor the auth module"
```

Debug builds use the same commands under `codewit-dev`.

`--json` on any command outputs machine-readable JSON. `--data-dir <path>` overrides the data directory.

### Workspace References

Most commands accept either a UUID or a `repo-name/directory-name` shorthand:

```bash
codewit workspace show 5508edf1-bc73-4c6e-9c3d-21de3eeb25be   # UUID
codewit workspace show ai-shipany-template/draco                 # shorthand
```

## MCP Server

Run `codewit mcp` (or `codewit-dev mcp` in debug) to start a stdio MCP server implementing JSON-RPC 2.0.

### Exposed Tools

| Tool | Description |
|------|-------------|
| `codewit_data_info` | Data directory and build mode |
| `codewit_repo_list` | List repositories |
| `codewit_repo_add` | Register a local Git repo |
| `codewit_workspace_list` | List workspaces by status |
| `codewit_workspace_show` | Workspace details |
| `codewit_workspace_create` | Create workspace |
| `codewit_session_list` | List sessions |
| `codewit_session_create` | Create session |
| `codewit_send` | Send prompt to AI agent |

## Agent Commands

Codewit agents understand special commands you can send through `codewit send` or directly in the UI:

### Stacked PR Workflow

Codewit supports building a large change as a **stack of small, dependent PRs** — one workspace = one branch = one PR, linked by `parentWorkspaceId`. Each PR builds on the one below instead of all branching from `main`, keeping every PR small and reviewable while you keep moving.

The agent provides three commands for stacked PR workflows:

- **`/codewit-cli stack`** — Plan and build a large change as a stack of dependent PRs, built one layer at a time. The workspace you start from becomes the stack's base (no throwaway launchpad).
- **`/codewit-cli break`** — Split a change you've *already written* into a stack, confirming the slicing granularity with you first. The starting workspace becomes the root.
- **`/codewit-cli restack`** — Re-sync a stack after a lower layer changes or merges. Also triggered by the composer's **Restack** button.

**Stack structure:**
- Each layer is a workspace with its own branch
- The sidebar groups stack workspaces together (tip on top → base at bottom) with connector lines
- A stacked workspace's panel header shows a clickable parent-workspace chip instead of a raw target-branch name
- `codewit workspace stack <ref>` displays the full PR stack chain

## CLI Commands

### Workspace Commands

#### codewit workspace stack <ref>

Display a workspace's PR stack — shows the whole chain of dependent workspaces from root to tip.

Options:
- `--json` — Output machine-readable JSON format matching the render_stack.py input spec

Example:
```bash
codewit workspace stack codewit/earth
codewit workspace stack codewit/earth --json | python3 scripts/render_stack.py -
```

#### codewit workspace new

Create a new workspace, either from a repository or as a stacked workspace on top of an existing workspace.

Syntax:
```bash
codewit workspace new [--repo <repo>] [--parent <workspace>]
```

Either `--repo` OR `--parent` is required:
- **`--repo <repo>`** — Create a workspace from a repository (for starting fresh)
- **`--parent <workspace-ref>`** — Create a stacked workspace that builds on top of an existing workspace (for stacked PRs). Records the parent workspace ID and sets the child's target branch to the parent's branch.

Examples:
```bash
# Start fresh from a repository
codewit workspace new --repo codewit

# Create a stacked workspace for dependent PRs
codewit workspace new --parent codewit/earth
```

### Register with Claude Code

macOS:

```bash
claude mcp add codewit -- /usr/local/bin/codewit mcp
```

Windows:

```powershell
claude mcp add codewit -- codewit mcp
```

Verify: `claude mcp list`

### Register with Claude Desktop

macOS: edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "codewit": {
      "command": "/usr/local/bin/codewit",
      "args": ["mcp"]
    }
  }
}
```

Windows: edit Claude Desktop's `claude_desktop_config.json` and use either `codewit`
after restarting Claude Desktop, or the absolute `codewit.cmd` path under
`%LOCALAPPDATA%\Codewit\bin`.

Restart Claude Desktop after changing the config.

### Register with Cursor

macOS: edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "codewit": {
      "command": "/usr/local/bin/codewit",
      "args": ["mcp"]
    }
  }
}
```

Windows: use `codewit` after restarting Cursor, or the absolute `codewit.cmd`
path under `%LOCALAPPDATA%\Codewit\bin`.

### Dev Mode

Use the debug entrypoint instead:

macOS:

```bash
claude mcp add codewit-dev -- /usr/local/bin/codewit-dev mcp
```

Windows:

```powershell
claude mcp add codewit-dev -- codewit-dev mcp
```

## Testing the MCP Server

### MCP Inspector (Web UI)

```bash
npx @modelcontextprotocol/inspector -- ./src-tauri/target/debug/codewit-cli mcp
```

Opens a browser UI to browse tools, invoke them, and inspect protocol traffic.

### Terminal Inspector

```bash
npx @wong2/mcp-cli -- ./src-tauri/target/debug/codewit-cli mcp
```

### Manual (pipe JSON-RPC)

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
| ./src-tauri/target/debug/codewit-cli mcp
```
