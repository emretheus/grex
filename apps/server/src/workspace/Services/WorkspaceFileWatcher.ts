import type { WorkspaceFileChangeEvent } from "@t3tools/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

/**
 * Live worktree file watcher.
 *
 * `subscribe(cwd, listener)` registers a listener for debounced file-change
 * batches in a single worktree and returns an unsubscribe effect. The first
 * subscriber for a cwd starts a recursive `fs.watch` on that directory; the
 * watcher is reference-counted and torn down when the last subscriber leaves.
 * Events ignore noisy paths (`.git/`, `node_modules/`, build output) and carry
 * worktree-relative POSIX paths so the client can refresh the file tree, open
 * diffs, and git status precisely. Each batch also triggers a best-effort git
 * status refresh so the status panel stays live without polling.
 */
export interface WorkspaceFileWatcherShape {
  readonly subscribe: (
    cwd: string,
    listener: (event: WorkspaceFileChangeEvent) => void,
  ) => Effect.Effect<() => void>;
}

export class WorkspaceFileWatcher extends ServiceMap.Service<
  WorkspaceFileWatcher,
  WorkspaceFileWatcherShape
>()("t3/workspace/Services/WorkspaceFileWatcher") {}
