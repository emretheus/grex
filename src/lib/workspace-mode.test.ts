import { describe, expect, it } from "vitest";
import { type WorkspaceMode, workspaceModeHasGitContext } from "@/lib/api";

describe("workspaceModeHasGitContext", () => {
	it("is true for git-backed modes", () => {
		expect(workspaceModeHasGitContext("worktree")).toBe(true);
		expect(workspaceModeHasGitContext("local")).toBe(true);
	});

	it("is false for the no-git-context modes", () => {
		expect(workspaceModeHasGitContext("chat")).toBe(false);
		expect(workspaceModeHasGitContext("non_git")).toBe(false);
	});

	it("defaults unknown/loading mode to git-backed", () => {
		expect(workspaceModeHasGitContext(null)).toBe(true);
		expect(workspaceModeHasGitContext(undefined)).toBe(true);
		// Exhaustiveness guard: every WorkspaceMode is handled above.
		const modes: WorkspaceMode[] = ["worktree", "local", "chat", "non_git"];
		expect(modes.filter((m) => !workspaceModeHasGitContext(m))).toEqual([
			"chat",
			"non_git",
		]);
	});
});
