import * as fs from "node:fs/promises";
import * as path from "node:path";

// String-level containment checks (path.resolve + path.relative) cannot see
// symlinks, so a link inside the workspace pointing outside it would pass and
// the subsequent open/read/write would follow it. Resolve both sides through the
// filesystem and re-check containment on the canonical paths. This also
// canonicalizes roots that are themselves behind symlinks (e.g. /tmp ->
// /private/tmp on macOS), so in-root symlinks keep working.
//
// `absolutePath` may not exist yet (e.g. writing a brand-new file). In that case
// we cannot realpath the target itself, so we realpath the nearest existing
// ancestor and re-check containment on that — a new file under an in-root
// directory is allowed; a new file under a symlink that escapes the root is not.
export async function resolveRealPathWithinRoot(
  workspaceRoot: string,
  absolutePath: string,
): Promise<string | null> {
  const realRoot = await fs.realpath(workspaceRoot);

  const realTarget = await realpathOrNearestAncestor(absolutePath);
  if (realTarget === null) return null;

  if (realTarget === realRoot || realTarget.startsWith(realRoot + path.sep)) {
    return realTarget;
  }
  return null;
}

// Resolve the canonical path of `absolutePath`, falling back to the canonical
// path of its nearest existing ancestor when the target does not exist yet.
// Returns null only when even the filesystem root cannot be resolved.
async function realpathOrNearestAncestor(absolutePath: string): Promise<string | null> {
  let current = absolutePath;
  // Walk up at most until the filesystem root; `path.dirname` of the root is the
  // root itself, which terminates the loop.
  for (;;) {
    try {
      return await fs.realpath(current);
    } catch (cause) {
      if (!isNotFound(cause)) throw cause;
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
}

function isNotFound(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { code?: unknown }).code === "ENOENT"
  );
}
