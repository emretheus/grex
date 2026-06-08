import { describe, expect, it } from "vitest";

import {
  WORKTREE_BRANCH_PREFIX,
  buildCodewitBranchName,
  buildTemporaryWorktreeBranchName,
  isTemporaryWorktreeBranch,
  resolveUniqueCodewitBranchName,
  resolveThreadBranchRegressionGuard,
} from "./git";

describe("isTemporaryWorktreeBranch", () => {
  it("matches generated temporary worktree branches", () => {
    expect(isTemporaryWorktreeBranch(buildTemporaryWorktreeBranchName())).toBe(true);
  });

  it("matches generated temporary worktree branches", () => {
    expect(isTemporaryWorktreeBranch(`${WORKTREE_BRANCH_PREFIX}/deadbeef`)).toBe(true);
    expect(isTemporaryWorktreeBranch(` ${WORKTREE_BRANCH_PREFIX}/DEADBEEF `)).toBe(true);
  });

  it("rejects semantic branch names", () => {
    expect(isTemporaryWorktreeBranch(`${WORKTREE_BRANCH_PREFIX}/feature/demo`)).toBe(false);
    expect(isTemporaryWorktreeBranch("feature/demo")).toBe(false);
  });
});

describe("resolveThreadBranchRegressionGuard", () => {
  it("keeps a semantic branch when the next branch is only a temporary worktree placeholder", () => {
    expect(
      resolveThreadBranchRegressionGuard({
        currentBranch: "feature/semantic-branch",
        nextBranch: `${WORKTREE_BRANCH_PREFIX}/deadbeef`,
      }),
    ).toBe("feature/semantic-branch");
  });

  it("accepts real branch changes", () => {
    expect(
      resolveThreadBranchRegressionGuard({
        currentBranch: "feature/old",
        nextBranch: "feature/new",
      }),
    ).toBe("feature/new");
  });

  it("allows clearing the branch", () => {
    expect(
      resolveThreadBranchRegressionGuard({
        currentBranch: "feature/old",
        nextBranch: null,
      }),
    ).toBeNull();
  });
});

describe("buildCodewitBranchName", () => {
  it("uses codewit as the branch namespace", () => {
    expect(buildCodewitBranchName("fix toast copy")).toBe("codewit/fix-toast-copy");
  });

  it("keeps non-Codewit namespaces inside the Codewit branch", () => {
    expect(buildCodewitBranchName("feature/refine-toolbar-actions")).toBe(
      "codewit/feature/refine-toolbar-actions",
    );
  });

  it("normalizes a codex prefix before rebuilding the branch", () => {
    expect(buildCodewitBranchName("codex/refine toolbar actions")).toBe(
      "codewit/refine-toolbar-actions",
    );
  });

  it("falls back to codewit/update when no preferred name is provided", () => {
    expect(buildCodewitBranchName()).toBe("codewit/update");
  });
});

describe("resolveUniqueCodewitBranchName", () => {
  it("increments suffix when the Codewit branch already exists", () => {
    expect(
      resolveUniqueCodewitBranchName(
        ["main", "codewit/fix-toast-copy", "codewit/fix-toast-copy-2"],
        "fix toast copy",
      ),
    ).toBe("codewit/fix-toast-copy-3");
  });
});
