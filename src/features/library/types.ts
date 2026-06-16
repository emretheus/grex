/** The three Library sections, mirroring emdash's Library tabs. */
export type LibrarySection = "prompts" | "skills" | "mcp";

export const LIBRARY_SECTIONS: readonly LibrarySection[] = [
	"mcp",
	"prompts",
	"skills",
];

export const LIBRARY_SECTION_LABELS: Record<LibrarySection, string> = {
	prompts: "Prompts",
	skills: "Skills",
	mcp: "MCP Servers",
};

export const LIBRARY_SECTION_CAPTIONS: Record<LibrarySection, string> = {
	prompts: "Reusable instructions you can insert into any conversation",
	skills: "Reusable agent skill modules",
	mcp: "External tools and data sources, synced to your agents",
};
