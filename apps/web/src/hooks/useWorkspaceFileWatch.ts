// FILE: hooks/useWorkspaceFileWatch.ts
// Purpose: Subscribe a component to live disk changes for a worktree cwd and
// keep git-derived React Query caches fresh without polling. Optionally invokes
// a callback with the changed relative paths so local view state (e.g. the file
// tree's lazily-loaded directories) can refresh precisely.
// Layer: Web hook over the workspace.fileChanged push channel.

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WorkspaceFileChangeEvent } from "@t3tools/contracts";

import { readNativeApi } from "../nativeApi";
import { invalidateGitQueriesForCwds } from "../lib/gitReactQuery";

/**
 * Watch `cwd` for live file changes. While mounted, git status / branches /
 * working-tree diff queries for this cwd are invalidated whenever the worktree
 * changes on disk (debounced server-side). Pass `onChange` to additionally
 * react to the specific changed paths.
 *
 * Multiple components may watch the same cwd cheaply: the transport keeps a
 * single server-side `fs.watch` per cwd and fans out to all listeners.
 */
export function useWorkspaceFileWatch(
  cwd: string | null,
  onChange?: (event: WorkspaceFileChangeEvent) => void,
): void {
  const queryClient = useQueryClient();
  // Keep the latest callback without re-subscribing on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!cwd) return;
    const api = readNativeApi();
    if (!api) return;

    const unsubscribe = api.workspace.onFileChanged(cwd, (event) => {
      void invalidateGitQueriesForCwds(queryClient, [event.cwd]);
      onChangeRef.current?.(event);
    });
    return unsubscribe;
  }, [cwd, queryClient]);
}
