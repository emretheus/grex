// FILE: gitFileStatus.ts
// Purpose: Derive a per-file git change-status map from a working-tree patch so
//          UI surfaces (the file tree, future panels) can tint rows by status —
//          added / modified / deleted / renamed — using the same patch the diff
//          panel already parses. No extra RPC, no server change.
// Layer: Web git/diff helper

import { getRenderablePatch, resolveFileDiffPath } from "./diffRendering";

/** Simplified, UI-facing change status for a working-tree file. */
export type GitFileStatus = "added" | "modified" | "deleted" | "renamed";

/**
 * Parse a unified working-tree patch into a `path → status` map. Paths are
 * worktree-relative (the `a/`/`b/` prefixes are stripped), matching the paths
 * the file tree uses. For renames, both the old and new paths are recorded so
 * either row can be tinted.
 */
export function buildGitFileStatusMap(
  patch: string | undefined,
  cacheScope = "file-tree-status",
): ReadonlyMap<string, GitFileStatus> {
  const result = new Map<string, GitFileStatus>();
  const renderable = getRenderablePatch(patch, cacheScope);
  if (renderable?.kind !== "files") return result;

  for (const file of renderable.files) {
    const path = resolveFileDiffPath(file);
    if (!path) continue;
    const status = toGitFileStatus(file.type);
    result.set(path, status);
    // Tint the previous path too so a rename shows on the source row if it
    // still appears in the tree.
    if (file.prevName) {
      const prev = stripPatchPrefix(file.prevName);
      if (prev && prev !== path) result.set(prev, status);
    }
  }
  return result;
}

function toGitFileStatus(type: string): GitFileStatus {
  switch (type) {
    case "new":
      return "added";
    case "deleted":
      return "deleted";
    case "rename-pure":
    case "rename-changed":
      return "renamed";
    default:
      return "modified";
  }
}

function stripPatchPrefix(raw: string): string {
  return raw.startsWith("a/") || raw.startsWith("b/") ? raw.slice(2) : raw;
}

/**
 * Tailwind text-color class for a given status, themed to match the diff stat
 * colors used elsewhere (green add / red delete / amber modify / blue rename).
 * Returns null when the file is unchanged.
 */
export function gitFileStatusColorClass(status: GitFileStatus | undefined): string | null {
  switch (status) {
    case "added":
      return "text-emerald-500 dark:text-emerald-400";
    case "deleted":
      return "text-rose-500 dark:text-rose-400";
    case "renamed":
      return "text-sky-500 dark:text-sky-400";
    case "modified":
      return "text-amber-500 dark:text-amber-400";
    default:
      return null;
  }
}

/** Single-letter badge (M/A/D/R) shown next to a changed file, emdash-style. */
export function gitFileStatusBadge(status: GitFileStatus | undefined): string | null {
  switch (status) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "modified":
      return "M";
    default:
      return null;
  }
}
