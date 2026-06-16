/**
 * Agents that can receive MCP servers, and whether each supports HTTP
 * transport. Must stay in sync with `library::agent_mcp::production_targets`
 * in the Rust backend.
 */
export const MCP_AGENTS: readonly {
	id: string;
	label: string;
	http: boolean;
}[] = [
	{ id: "claude", label: "Claude Code", http: true },
	{ id: "codex", label: "Codex", http: false },
];

export function mcpAgentLabel(id: string): string {
	return MCP_AGENTS.find((a) => a.id === id)?.label ?? id;
}
