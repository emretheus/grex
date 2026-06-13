# Grex CLI & MCP Server

Grex ships a companion CLI inside the desktop app bundle. Release builds
install `grex`; debug builds install `grex-dev`. The terminal entrypoint
always points at the currently installed desktop app so CLI and desktop
versions stay aligned.

## Install

### Settings UI

Open the desktop app → Settings → Experimental → **Command Line Tool** → Install.
This installs a managed launcher to the app bundle's `grex-cli`:

- macOS release: `/usr/local/bin/grex`
- macOS debug: `/usr/local/bin/grex-dev`
- Windows release: `%LOCALAPPDATA%\Grex\bin\grex.cmd`
- Windows debug: `%LOCALAPPDATA%\Grex\bin\grex-dev.cmd`

On Windows, open a new terminal after installing so the updated user `PATH` is visible.

### Development

```bash
bun run dev:cli:build
./src-tauri/target/debug/grex-cli cli-status
bun run dev:cli:install
grex-dev cli-status
```

The debug build reads `~/grex-dev/` — same database as `bun run dev`.

## CLI Usage

```bash
grex data info
grex repo list
grex repo add /path/to/repo
grex workspace list
grex workspace show grex/earth            # human-readable ref
grex workspace new --repo grex
grex workspace stack grex/earth           # show PR stack for a workspace
grex session list --workspace grex/earth
grex session new --workspace grex/earth
grex send --workspace grex/earth "Refactor the auth module"
```

Debug builds use the same commands under `grex-dev`.

`--json` on any command outputs machine-readable JSON. `--data-dir <path>` overrides the data directory.

### Workspace References

Most commands accept either a UUID or a `repo-name/directory-name` shorthand:

```bash
grex workspace show 5508edf1-bc73-4c6e-9c3d-21de3eeb25be   # UUID
grex workspace show ai-shipany-template/draco                 # shorthand
```

## MCP Server

Run `grex mcp` (or `grex-dev mcp` in debug) to start a stdio MCP server implementing JSON-RPC 2.0.

### Exposed Tools

| Tool | Description |
|------|-------------|
| `grex_data_info` | Data directory and build mode |
| `grex_repo_list` | List repositories |
| `grex_repo_add` | Register a local Git repo |
| `grex_workspace_list` | List workspaces by status |
| `grex_workspace_show` | Workspace details |
| `grex_workspace_create` | Create workspace |
| `grex_session_list` | List sessions |
| `grex_session_create` | Create session |
| `grex_send` | Send prompt to AI agent |

## Agent Commands

Grex agents understand special commands you can send through `grex send` or directly in the UI:

### Stacked PR Workflow

Grex supports building a large change as a **stack of small, dependent PRs** — one workspace = one branch = one PR, linked by `parentWorkspaceId`. Each PR builds on the one below instead of all branching from `main`, keeping every PR small and reviewable while you keep moving.

The agent provides three commands for stacked PR workflows:

- **`/grex-cli stack`** — Plan and build a large change as a stack of dependent PRs, built one layer at a time. The workspace you start from becomes the stack's base (no throwaway launchpad).
- **`/grex-cli break`** — Split a change you've *already written* into a stack, confirming the slicing granularity with you first. The starting workspace becomes the root.
- **`/grex-cli restack`** — Re-sync a stack after a lower layer changes or merges. Also triggered by the composer's **Restack** button.

**Stack structure:**
- Each layer is a workspace with its own branch
- The sidebar groups stack workspaces together (tip on top → base at bottom) with connector lines
- A stacked workspace's panel header shows a clickable parent-workspace chip instead of a raw target-branch name
- `grex workspace stack <ref>` displays the full PR stack chain

## CLI Commands

### Workspace Commands

#### grex workspace stack <ref>

Display a workspace's PR stack — shows the whole chain of dependent workspaces from root to tip.

Options:
- `--json` — Output machine-readable JSON format matching the render_stack.py input spec

Example:
```bash
grex workspace stack grex/earth
grex workspace stack grex/earth --json | python3 scripts/render_stack.py -
```

#### grex workspace new

Create a new workspace, either from a repository or as a stacked workspace on top of an existing workspace.

Syntax:
```bash
grex workspace new [--repo <repo>] [--parent <workspace>]
```

Either `--repo` OR `--parent` is required:
- **`--repo <repo>`** — Create a workspace from a repository (for starting fresh)
- **`--parent <workspace-ref>`** — Create a stacked workspace that builds on top of an existing workspace (for stacked PRs). Records the parent workspace ID and sets the child's target branch to the parent's branch.

Examples:
```bash
# Start fresh from a repository
grex workspace new --repo grex

# Create a stacked workspace for dependent PRs
grex workspace new --parent grex/earth
```

### Register with Claude Code

macOS:

```bash
claude mcp add grex -- /usr/local/bin/grex mcp
```

Windows:

```powershell
claude mcp add grex -- grex mcp
```

Verify: `claude mcp list`

### Register with Claude Desktop

macOS: edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "grex": {
      "command": "/usr/local/bin/grex",
      "args": ["mcp"]
    }
  }
}
```

Windows: edit Claude Desktop's `claude_desktop_config.json` and use either `grex`
after restarting Claude Desktop, or the absolute `grex.cmd` path under
`%LOCALAPPDATA%\Grex\bin`.

Restart Claude Desktop after changing the config.

### Register with Cursor

macOS: edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "grex": {
      "command": "/usr/local/bin/grex",
      "args": ["mcp"]
    }
  }
}
```

Windows: use `grex` after restarting Cursor, or the absolute `grex.cmd`
path under `%LOCALAPPDATA%\Grex\bin`.

### Dev Mode

Use the debug entrypoint instead:

macOS:

```bash
claude mcp add grex-dev -- /usr/local/bin/grex-dev mcp
```

Windows:

```powershell
claude mcp add grex-dev -- grex-dev mcp
```

## Testing the MCP Server

### MCP Inspector (Web UI)

```bash
npx @modelcontextprotocol/inspector -- ./src-tauri/target/debug/grex-cli mcp
```

Opens a browser UI to browse tools, invoke them, and inspect protocol traffic.

### Terminal Inspector

```bash
npx @wong2/mcp-cli -- ./src-tauri/target/debug/grex-cli mcp
```

### Manual (pipe JSON-RPC)

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
| ./src-tauri/target/debug/grex-cli mcp
```
