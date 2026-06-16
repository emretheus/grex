/**
 * A recommended, installable skill. Installing fetches the real upstream
 * `SKILL.md` from `sourceUrl` when present (server-side, CORS-free) and falls
 * back to a generated starter built from `body` on any failure. The user can
 * edit it afterwards.
 */
export type SkillCatalogEntry = {
	/** Install name (lowercase-hyphen) — also the directory name. */
	key: string;
	name: string;
	description: string;
	iconKey?: string;
	/** Real upstream SKILL.md to fetch on install (optional). */
	sourceUrl?: string;
	/** Fallback markdown body (used when there is no source / fetch fails). */
	body: string;
};

function md(entry: SkillCatalogEntry): string {
	return `---\nname: ${entry.key}\ndescription: ${entry.description}\n---\n\n# ${entry.name}\n\n${entry.body.trim()}\n`;
}

/** Render an entry to its fallback SKILL.md content (used at install time). */
export function skillCatalogContent(entry: SkillCatalogEntry): string {
	return md(entry);
}

/** Raw SKILL.md from Anthropic's skills repo. */
function anthropic(name: string): string {
	return `https://raw.githubusercontent.com/anthropics/skills/main/skills/${name}/SKILL.md`;
}

export const SKILLS_CATALOG: readonly SkillCatalogEntry[] = [
	// ── Documents (Anthropic) ─────────────────────────────────────────────
	{
		key: "pdf",
		name: "PDF",
		description: "Read, fill, split, merge, and create PDF files.",
		iconKey: "pdf",
		sourceUrl: anthropic("pdf"),
		body: "Use this skill whenever the user works with PDF files — reading, extracting, filling forms, splitting, merging, or generating PDFs.",
	},
	{
		key: "docx",
		name: "Word Documents",
		description: "Create, read, and edit Word (.docx) documents.",
		iconKey: "docx",
		sourceUrl: anthropic("docx"),
		body: "Use this skill whenever the user wants to create, read, edit, or review Word documents, with a render-and-verify workflow.",
	},
	{
		key: "xlsx",
		name: "Spreadsheets",
		description: "Create and edit Excel (.xlsx) spreadsheets.",
		iconKey: "xlsx",
		sourceUrl: anthropic("xlsx"),
		body: "Use this skill any time a spreadsheet file is the primary input or output — formulas, formatting, charts, and recalculation.",
	},
	{
		key: "pptx",
		name: "Presentations",
		description: "Build and edit PowerPoint (.pptx) decks.",
		iconKey: "pptx",
		sourceUrl: anthropic("pptx"),
		body: "Use this skill any time a .pptx file is involved — building, editing, and visually verifying slide decks.",
	},
	// ── Design / build (Anthropic) ────────────────────────────────────────
	{
		key: "frontend-design",
		name: "Frontend Design",
		description: "Distinctive, intentional UI design guidance.",
		iconKey: "frontend-design",
		sourceUrl: anthropic("frontend-design"),
		body: "Guidance for distinctive, intentional visual design when building new UI or reshaping existing interfaces.",
	},
	{
		key: "canvas-design",
		name: "Canvas Design",
		description: "Create polished visual art as PNG and PDF.",
		iconKey: "canvas-design",
		sourceUrl: anthropic("canvas-design"),
		body: "Create beautiful visual art in .png and .pdf documents using a strong design philosophy.",
	},
	{
		key: "algorithmic-art",
		name: "Algorithmic Art",
		description: "Generative art with p5.js and seeded randomness.",
		iconKey: "algorithmic-art",
		sourceUrl: anthropic("algorithmic-art"),
		body: "Create algorithmic art using p5.js with seeded randomness and interactive parameter exploration.",
	},
	{
		key: "brand-guidelines",
		name: "Brand Guidelines",
		description: "Apply consistent brand colors and typography.",
		iconKey: "brand-guidelines",
		sourceUrl: anthropic("brand-guidelines"),
		body: "Apply official brand colors and typography to any artifact for a consistent visual identity.",
	},
	{
		key: "webapp-testing",
		name: "Web App Testing",
		description: "Test local web apps end-to-end with Playwright.",
		iconKey: "webapp-testing",
		sourceUrl: anthropic("webapp-testing"),
		body: "Toolkit for interacting with and testing local web applications using Playwright.",
	},
	{
		key: "mcp-builder",
		name: "MCP Builder",
		description: "Build high-quality MCP servers.",
		iconKey: "mcp-builder",
		sourceUrl: anthropic("mcp-builder"),
		body: "Guide for creating high-quality MCP (Model Context Protocol) servers that expose tools to LLMs.",
	},
	{
		key: "skill-creator",
		name: "Skill Creator",
		description: "Create, improve, and measure agent skills.",
		iconKey: "skill-creator",
		sourceUrl: anthropic("skill-creator"),
		body: "Create new skills, modify and improve existing skills, and measure skill performance.",
	},
	// ── Generic workflows (offline starters) ──────────────────────────────
	{
		key: "code-reviewer",
		name: "Code Reviewer",
		description: "Review a diff for bugs, edge cases, and quality.",
		iconKey: "code-reviewer",
		body: "When asked to review code, inspect the current diff and report:\n\n- **Correctness** — bugs, off-by-one, null/undefined, race conditions.\n- **Edge cases** — empty input, large input, error paths.\n- **Quality** — naming, duplication, dead code, missing tests.\n\nBe specific (file + line), prioritize by severity, and suggest concrete fixes.",
	},
	{
		key: "commit-message",
		name: "Commit Messages",
		description: "Write clear Conventional Commits from staged changes.",
		iconKey: "commit-message",
		body: "Write commit messages in Conventional Commits format: `type(scope): summary`.\n\n- Types: feat, fix, refactor, docs, test, chore, perf.\n- Summary in imperative mood, ≤ 72 chars, no trailing period.\n- Add a body explaining *why* when the change isn't obvious.",
	},
	{
		key: "pr-description",
		name: "PR Descriptions",
		description: "Generate a structured pull-request description.",
		iconKey: "pr-description",
		body: "Generate a PR description with: **Summary** (what & why), **Changes** (bulleted), **Testing** (how verified), and **Risk** (what reviewers should watch).",
	},
	{
		key: "debugger",
		name: "Debugger",
		description: "Systematically find the root cause of a bug.",
		iconKey: "debugger",
		body: "Debug methodically:\n\n1. Reproduce and capture the exact error.\n2. Hypothesize; add logging or a failing test to confirm.\n3. Bisect to the smallest failing case.\n4. Fix the root cause (not the symptom) and verify the repro passes.",
	},
	{
		key: "security-review",
		name: "Security Review",
		description: "Audit changes for common vulnerabilities.",
		iconKey: "security-review",
		body: "Review for injection (SQL/command/XSS), authn/authz gaps, secrets in code, unsafe deserialization, SSRF, and path traversal. Report each finding with severity and a remediation.",
	},
	{
		key: "figma-to-code",
		name: "Figma to Code",
		description: "Turn Figma designs into production-ready UI.",
		iconKey: "figma",
		body: "When a Figma frame or link is provided, use the Figma MCP server to read the design, then implement it with the project's component library and design tokens — matching spacing, typography, and color, responsive and accessible.",
	},
	{
		key: "github-pr-review",
		name: "GitHub PR Review",
		description: "Address review comments on a GitHub PR.",
		iconKey: "github",
		body: "Use the GitHub tooling to fetch unresolved review threads on the PR, implement the requested changes, and summarize what was addressed.",
	},
];
