// FILE: DockFilesPane.tsx
// Purpose: Right-dock "Files" pane — a lazy-loaded file explorer scoped to the
//          active thread's worktree (or the project cwd). Clicking a file opens it
//          in the Editor pane.
// Layer: Chat right-dock UI
// Depends on: projects.listDirectories RPC, editorStore, rightDockStore.

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ProjectFileSystemEntry,
  ProjectId,
  ThreadId,
  WorkspaceFileChangeEvent,
} from "@t3tools/contracts";
import { readNativeApi } from "~/nativeApi";
import { createProjectSelector, createThreadSelector } from "~/storeSelectors";
import { useStore as useAppStore } from "~/store";
import { useEditorStore } from "~/editorStore";
import { useRightDockStore } from "~/rightDockStore";
import { gitWorkingTreeDiffQueryOptions } from "~/lib/gitReactQuery";
import {
  buildGitFileStatusMap,
  gitFileStatusBadge,
  gitFileStatusColorClass,
  type GitFileStatus,
} from "~/lib/gitFileStatus";
import { copyTextToClipboard } from "~/hooks/useCopyToClipboard";
import { useWorkspaceFileWatch } from "~/hooks/useWorkspaceFileWatch";
import { toastManager } from "~/components/ui/toast";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
} from "~/lib/icons";
import { cn } from "~/lib/utils";
import { PanelStateMessage } from "./PanelStateMessage";

interface DockFilesPaneProps {
  readonly hostThreadId: ThreadId;
  readonly projectId: ProjectId | null;
}

const ROW_HEIGHT_CLASS = "h-7";

export function DockFilesPane({ hostThreadId, projectId }: DockFilesPaneProps) {
  const thread = useAppStore(useMemo(() => createThreadSelector(hostThreadId), [hostThreadId]));
  const project = useAppStore(useMemo(() => createProjectSelector(projectId), [projectId]));
  const cwd = thread?.worktreePath ?? project?.cwd ?? null;

  const openFile = useEditorStore((s) => s.openFile);
  const openPane = useRightDockStore((s) => s.openPane);

  // Per-file git status (added/modified/deleted/renamed) for tinting tree rows,
  // derived from the same working-tree patch the diff panel uses.
  const workingTreeDiffQuery = useQuery(
    gitWorkingTreeDiffQueryOptions({ cwd, scope: "workingTree" }),
  );
  const statusByPath = useMemo(
    () => buildGitFileStatusMap(workingTreeDiffQuery.data?.patch),
    [workingTreeDiffQuery.data?.patch],
  );

  // Per-parent-path children, expanded set, loading set.
  const [childrenByParent, setChildrenByParent] = useState<
    Record<string, readonly ProjectFileSystemEntry[]>
  >({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(
    async (relativePath: string) => {
      if (!cwd) return;
      const api = readNativeApi();
      if (!api) return;
      setLoading((prev) => new Set(prev).add(relativePath));
      setError(null);
      try {
        const result = await api.projects.listDirectories({
          cwd,
          includeFiles: true,
          ...(relativePath ? { relativePath } : {}),
        });
        setChildrenByParent((prev) => ({ ...prev, [relativePath]: result.entries }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to load files.");
      } finally {
        setLoading((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
      }
    },
    [cwd],
  );

  // Reset + load the root whenever the scoped cwd changes.
  useEffect(() => {
    setChildrenByParent({});
    setExpanded(new Set());
    setError(null);
    if (cwd) void loadDirectory("");
  }, [cwd, loadDirectory]);

  // Live disk changes: refresh only the loaded directories that actually
  // contain a changed path (the root is always loaded). Falls back to
  // refreshing every loaded directory when the watcher reports a broad change.
  useWorkspaceFileWatch(
    cwd,
    useCallback(
      (event: WorkspaceFileChangeEvent) => {
        setChildrenByParent((prev) => {
          const loadedDirs = Object.keys(prev);
          if (loadedDirs.length === 0) return prev;
          const broad = event.paths.length === 0;
          const dirsToReload = broad
            ? loadedDirs
            : loadedDirs.filter((dir) =>
                event.paths.some((changed) => {
                  const slash = changed.lastIndexOf("/");
                  const parent = slash === -1 ? "" : changed.slice(0, slash);
                  return parent === dir;
                }),
              );
          for (const dir of dirsToReload) void loadDirectory(dir);
          return prev;
        });
      },
      [loadDirectory],
    ),
  );

  const toggleDirectory = useCallback(
    (path: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
          if (!childrenByParent[path] && !loading.has(path)) void loadDirectory(path);
        }
        return next;
      });
    },
    [childrenByParent, loading, loadDirectory],
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
      const clicked = await api.contextMenu.show(
        [
          ...(entry.kind === "file" ? [{ id: "open", label: "Open" }] : []),
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
    [cwd, handleFileClick],
  );

  if (!cwd) {
    return <PanelStateMessage>No workspace directory for this thread.</PanelStateMessage>;
  }

  const rootEntries = childrenByParent[""];

  return (
    <div className="flex h-full min-w-0 w-full flex-1 flex-col overflow-hidden bg-[var(--color-background-surface)]">
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {error ? (
          <div className="px-3 py-2 text-xs text-[var(--color-text-foreground-error,#e5484d)]">
            {error}
          </div>
        ) : rootEntries === undefined ? (
          <div className="px-3 py-2 text-xs text-[var(--color-text-foreground-secondary)]">
            Loading…
          </div>
        ) : rootEntries.length === 0 ? (
          <div className="px-3 py-2 text-xs text-[var(--color-text-foreground-secondary)]">
            Empty directory.
          </div>
        ) : (
          <FileTreeLevel
            entries={rootEntries}
            depth={0}
            expanded={expanded}
            loading={loading}
            childrenByParent={childrenByParent}
            statusByPath={statusByPath}
            onToggleDirectory={toggleDirectory}
            onFileClick={handleFileClick}
            onContextMenu={handleContextMenu}
          />
        )}
      </div>
    </div>
  );
}

interface FileTreeLevelProps {
  readonly entries: readonly ProjectFileSystemEntry[];
  readonly depth: number;
  readonly expanded: Set<string>;
  readonly loading: Set<string>;
  readonly childrenByParent: Record<string, readonly ProjectFileSystemEntry[]>;
  readonly statusByPath: ReadonlyMap<string, GitFileStatus>;
  readonly onToggleDirectory: (path: string) => void;
  readonly onFileClick: (path: string) => void;
  readonly onContextMenu: (
    event: React.MouseEvent,
    entry: { path: string; kind: "file" | "directory" },
  ) => void;
}

function FileTreeLevel({
  entries,
  depth,
  expanded,
  loading,
  childrenByParent,
  statusByPath,
  onToggleDirectory,
  onFileClick,
  onContextMenu,
}: FileTreeLevelProps) {
  const sorted = useMemo(() => sortEntries(entries), [entries]);
  return (
    <>
      {sorted.map((entry) => {
        const isDir = entry.kind === "directory";
        const isExpanded = isDir && expanded.has(entry.path);
        const children = childrenByParent[entry.path];
        const status = isDir ? undefined : statusByPath.get(entry.path);
        const statusColor = gitFileStatusColorClass(status);
        const statusBadge = gitFileStatusBadge(status);
        return (
          <div key={entry.path}>
            <button
              type="button"
              onClick={() => (isDir ? onToggleDirectory(entry.path) : onFileClick(entry.path))}
              onContextMenu={(event) =>
                onContextMenu(event, { path: entry.path, kind: entry.kind })
              }
              className={cn(
                "group flex w-full items-center gap-1.5 truncate px-2 text-left text-[13px] text-[var(--color-text-foreground)] transition-colors hover:bg-[var(--color-background-button-secondary-hover)]",
                ROW_HEIGHT_CLASS,
              )}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              title={entry.path}
            >
              {isDir ? (
                isExpanded ? (
                  <ChevronDownIcon className="size-3.5 shrink-0 text-[var(--color-text-foreground-secondary)]" />
                ) : (
                  <ChevronRightIcon className="size-3.5 shrink-0 text-[var(--color-text-foreground-secondary)]" />
                )
              ) : (
                <span className="inline-block size-3.5 shrink-0" />
              )}
              {isDir ? (
                isExpanded ? (
                  <FolderOpenIcon className="size-4 shrink-0 text-[var(--color-text-foreground-secondary)]" />
                ) : (
                  <FolderIcon className="size-4 shrink-0 text-[var(--color-text-foreground-secondary)]" />
                )
              ) : (
                <FileIcon
                  className={cn(
                    "size-4 shrink-0",
                    statusColor ??
                      "text-[var(--color-text-foreground-tertiary,var(--color-text-foreground-secondary))]",
                  )}
                />
              )}
              <span className={cn("truncate", statusColor)}>{entry.name}</span>
              {statusBadge ? (
                <span
                  className={cn(
                    "ml-auto shrink-0 pl-1 font-mono text-[10px] font-semibold tabular-nums",
                    statusColor,
                  )}
                  aria-hidden="true"
                >
                  {statusBadge}
                </span>
              ) : null}
            </button>
            {isDir && isExpanded ? (
              loading.has(entry.path) && children === undefined ? (
                <div
                  className="px-2 py-1 text-xs text-[var(--color-text-foreground-secondary)]"
                  style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}
                >
                  Loading…
                </div>
              ) : children && children.length > 0 ? (
                <FileTreeLevel
                  entries={children}
                  depth={depth + 1}
                  expanded={expanded}
                  loading={loading}
                  childrenByParent={childrenByParent}
                  statusByPath={statusByPath}
                  onToggleDirectory={onToggleDirectory}
                  onFileClick={onFileClick}
                  onContextMenu={onContextMenu}
                />
              ) : null
            ) : null}
          </div>
        );
      })}
    </>
  );
}

// Join a worktree root with a worktree-relative path, preserving the platform
// separator so the absolute path round-trips on Windows and POSIX.
function joinDirectoryPath(rootPath: string, relativePath: string): string {
  if (!relativePath) return rootPath;
  const separator = rootPath.includes("\\") ? "\\" : "/";
  const normalizedRoot = rootPath.endsWith(separator) ? rootPath.slice(0, -1) : rootPath;
  const normalizedRelative = relativePath.split(/[\\/]+/).join(separator);
  return `${normalizedRoot}${separator}${normalizedRelative}`;
}

// Directories first, then files; each alphabetical (case-insensitive).
function sortEntries(entries: readonly ProjectFileSystemEntry[]): ProjectFileSystemEntry[] {
  return entries.toSorted((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
