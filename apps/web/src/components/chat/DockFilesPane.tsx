// FILE: DockFilesPane.tsx
// Purpose: Right-dock "Files" pane — a lazy-loaded file explorer scoped to the
//          active thread's worktree (or the project cwd). Clicking a file opens it
//          in the Editor pane.
// Layer: Chat right-dock UI
// Depends on: WorkspaceFileTree, editorStore, rightDockStore.

import { useCallback, useMemo } from "react";

import type { ProjectId, ThreadId } from "@t3tools/contracts";
import { readNativeApi } from "~/nativeApi";
import { createProjectSelector, createThreadSelector } from "~/storeSelectors";
import { useStore as useAppStore } from "~/store";
import { useEditorStore, selectThreadEditorState } from "~/editorStore";
import { useRightDockStore } from "~/rightDockStore";
import { gitWorkingTreeDiffQueryOptions } from "~/lib/gitReactQuery";
import { buildGitFileStatusMap } from "~/lib/gitFileStatus";
import { copyTextToClipboard } from "~/hooks/useCopyToClipboard";
import { toastManager } from "~/components/ui/toast";
import { useQuery } from "@tanstack/react-query";
import { PanelStateMessage } from "./PanelStateMessage";
import { WorkspaceFileTree, joinDirectoryPath } from "./WorkspaceFileTree";

interface DockFilesPaneProps {
  readonly hostThreadId: ThreadId;
  readonly projectId: ProjectId | null;
}

export function DockFilesPane({ hostThreadId, projectId }: DockFilesPaneProps) {
  const thread = useAppStore(useMemo(() => createThreadSelector(hostThreadId), [hostThreadId]));
  const project = useAppStore(useMemo(() => createProjectSelector(projectId), [projectId]));
  const cwd = thread?.worktreePath ?? project?.cwd ?? null;

  const openFile = useEditorStore((s) => s.openFile);
  const openDiff = useEditorStore((s) => s.openDiff);
  const openPane = useRightDockStore((s) => s.openPane);
  const activeFilePath = useEditorStore((s) => selectThreadEditorState(s, hostThreadId).activePath);

  // Per-file git status (added/modified/deleted/renamed) for tinting tree rows,
  // derived from the same working-tree patch the diff panel uses.
  const workingTreeDiffQuery = useQuery(
    gitWorkingTreeDiffQueryOptions({ cwd, scope: "workingTree" }),
  );
  const statusByPath = useMemo(
    () => buildGitFileStatusMap(workingTreeDiffQuery.data?.patch),
    [workingTreeDiffQuery.data?.patch],
  );

  const handleFileClick = useCallback(
    (path: string) => {
      openFile(hostThreadId, path);
      // Surface the editor so the file is immediately visible.
      openPane(hostThreadId, { kind: "editor" });
    },
    [hostThreadId, openFile, openPane],
  );

  const handleContextMenu = useCallback(
    async (event: React.MouseEvent, entry: { path: string; kind: "file" | "directory" }) => {
      event.preventDefault();
      const api = readNativeApi();
      if (!api || !cwd) return;
      const absolutePath = joinDirectoryPath(cwd, entry.path);
      const hasChanges = entry.kind === "file" && statusByPath.has(entry.path);
      const clicked = await api.contextMenu.show(
        [
          ...(entry.kind === "file" ? [{ id: "open", label: "Open" }] : []),
          ...(hasChanges ? [{ id: "open-diff", label: "Open diff" }] : []),
          { id: "copy-path", label: "Copy path", separatorBefore: entry.kind === "file" },
          { id: "copy-relative-path", label: "Copy relative path" },
          { id: "reveal", label: "Reveal in file manager", separatorBefore: true },
        ],
        { x: event.clientX, y: event.clientY },
      );
      switch (clicked) {
        case "open":
          handleFileClick(entry.path);
          break;
        case "open-diff":
          openDiff(hostThreadId, entry.path, "HEAD");
          openPane(hostThreadId, { kind: "editor" });
          break;
        case "copy-path":
          void copyTextToClipboard(absolutePath);
          break;
        case "copy-relative-path":
          void copyTextToClipboard(entry.path);
          break;
        case "reveal":
          void api.shell.showInFolder(absolutePath).catch(() => {
            toastManager.add({
              type: "error",
              title: "Could not reveal file",
              description: "The file manager could not be opened.",
            });
          });
          break;
        default:
          break;
      }
    },
    [cwd, handleFileClick, statusByPath, openDiff, openPane, hostThreadId],
  );

  if (!cwd) {
    return <PanelStateMessage>No workspace directory for this thread.</PanelStateMessage>;
  }

  return (
    <div className="flex h-full min-w-0 w-full flex-1 flex-col overflow-hidden bg-[var(--color-background-surface)]">
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        <WorkspaceFileTree
          cwd={cwd}
          statusByPath={statusByPath}
          activeFilePath={activeFilePath}
          onFileClick={handleFileClick}
          onFileContextMenu={handleContextMenu}
        />
      </div>
    </div>
  );
}
