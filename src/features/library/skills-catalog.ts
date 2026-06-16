/**
 * A recommended, installable skill. Installing writes a starter `SKILL.md`
 * (frontmatter + the `body` below) into `~/.agentskills/<key>` and links it into
 * every agent — fully offline, no download. The user can edit it afterwards.
 */
export type SkillCatalogEntry = {
	/** Install name (lowercase-hyphen) — also the directory name. */
	key: string;
	name: string;
	description: string;
	iconKey?: string;
	/** Markdown body appended after the generated frontmatter. */
	body: string;
};

function md(entry: SkillCatalogEntry): string {
	return `---\nname: ${entry.key}\ndescription: ${entry.description}\n---\n\n# ${entry.name}\n\n${entry.body.trim()}\n`;
}

/** Render an entry to its full SKILL.md content (used at install time). */
export function skillCatalogContent(entry: SkillCatalogEntry): string {
	return md(entry);
}

export const SKILLS_CATALOG: readonly SkillCatalogEntry[] = [
	{
		key: "code-reviewer",
		name: "Code Reviewer",
		description: "Review a diff for bugs, edge cases, and quality issues.",
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
		body: "Generate a PR description with these sections:\n\n- **Summary** — what changed and why, in 1-3 sentences.\n- **Changes** — bulleted list of the notable edits.\n- **Testing** — how it was verified.\n- **Risk** — anything reviewers should watch.",
	},
	{
		key: "test-writer",
		name: "Test Writer",
		description: "Write focused unit tests for the change at hand.",
		iconKey: "test-writer",
		body: "Write tests that cover the happy path, edge cases, and error handling. Match the project's existing test framework and conventions. Prefer small, isolated, deterministic tests with clear names that state the expected behavior.",
	},
	{
		key: "debugger",
		name: "Debugger",
		description: "Systematically find the root cause of a bug.",
		iconKey: "debugger",
		body: "Debug methodically:\n\n1. Reproduce the failure and capture the exact error.\n2. Form a hypothesis; add logging or a failing test to confirm it.\n3. Bisect — narrow to the smallest failing case.\n4. Fix the root cause (not the symptom) and verify the repro now passes.",
	},
	{
		key: "refactor",
		name: "Refactor",
		description: "Improve structure without changing behavior.",
		iconKey: "refactor",
		body: "Refactor in small, safe steps. Keep behavior identical — run tests after each step. Reduce duplication, clarify names, shrink functions, and remove dead code. Never mix a refactor with a behavior change in the same commit.",
	},
	{
		key: "security-review",
		name: "Security Review",
		description: "Audit changes for common vulnerabilities.",
		iconKey: "security-review",
		body: "Review for: injection (SQL/command/XSS), authn/authz gaps, secrets in code, unsafe deserialization, SSRF, path traversal, and missing input validation. Report each finding with severity and a concrete remediation.",
	},
	{
		key: "performance-audit",
		name: "Performance Audit",
		description: "Find and fix performance bottlenecks.",
		iconKey: "performance-audit",
		body: "Profile before optimizing. Look for N+1 queries, unnecessary re-renders, blocking I/O on hot paths, unbounded allocations, and missing caching/indexes. Quantify the win and avoid premature micro-optimizations.",
	},
	{
		key: "api-docs",
		name: "API Docs",
		description: "Document endpoints, params, and examples.",
		iconKey: "api-docs",
		body: "For each endpoint or public function, document: purpose, parameters (type, required, default), return shape, error cases, and a minimal usage example. Keep it accurate to the current code.",
	},
	{
		key: "sql-helper",
		name: "SQL Helper",
		description: "Write and optimize SQL queries safely.",
		iconKey: "sql-helper",
		body: "Write correct, parameterized SQL (never string-concatenate user input). Explain the query, suggest indexes for slow paths, and prefer set-based operations over row-by-row logic.",
	},
	{
		key: "figma-to-code",
		name: "Figma to Code",
		description: "Turn Figma designs into production-ready UI.",
		iconKey: "figma",
		body: "When a Figma frame or link is provided, use the Figma MCP server to read the design, then implement it with the project's component library and design tokens. Match spacing, typography, and colors exactly; make it responsive and accessible.",
	},
	{
		key: "github-pr-review",
		name: "GitHub PR Review",
		description: "Address review comments on a GitHub PR.",
		iconKey: "github",
		body: "Use the GitHub tooling to fetch unresolved review threads on the PR, implement the requested changes, and summarize what was addressed. Reply to or resolve threads where appropriate.",
	},
];
