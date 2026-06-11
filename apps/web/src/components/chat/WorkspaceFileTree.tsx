// FILE: WorkspaceFileTree.tsx
// Purpose: Reusable lazy file-tree widget backed by the projects.listDirectories RPC.
//          Handles directory expansion, live file-watch invalidation, and optional
//          git-status tinting. Extracted from DockFilesPane so EditorWorkspaceView
//          can reuse the same tree without duplicating logic.
// Layer: Shared chat/editor UI

import { useCallback, useEffect, useState, useMemo } from "react";

import type { ProjectFileSystemEntry, WorkspaceFileChangeEvent } from "@t3tools/contracts";
import { readNativeApi } from "~/nativeApi";
import {
  gitFileStatusBadge,
  gitFileStatusColorClass,
  type GitFileStatus,
} from "~/lib/gitFileStatus";
import { useWorkspaceFileWatch } from "~/hooks/useWorkspaceFileWatch";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
} from "~/lib/icons";
import { cn } from "~/lib/utils";

// ---- Public helpers (used by both DockFilesPane and EditorWorkspaceView) ----

/** Join a worktree root with a worktree-relative path, preserving the platform
 *  separator so the absolute path round-trips on Windows and POSIX. */
export function joinDirectoryPath(rootPath: string, relativePath: string): string {
  if (!relativePath) return rootPath;
  const separator = rootPath.includes("\\") ? "\\" : "/";
  const normalizedRoot = rootPath.endsWith(separator) ? rootPath.slice(0, -1) : rootPath;
  const normalizedRelative = relativePath.split(/[\\/]+/).join(separator);
  return `${normalizedRoot}${separator}${normalizedRelative}`;
}

/** Directories first, then files; each group sorted alphabetically (case-insensitive). */
export function sortEntries(entries: readonly ProjectFileSystemEntry[]): ProjectFileSystemEntry[] {
  return entries.toSorted((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

// ---- FileTreeLevel ----

const ROW_HEIGHT_CLASS = "h-7";

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

export function FileTreeLevel({
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

// ---- WorkspaceFileTree ----

export interface WorkspaceFileTreeProps {
  /** Absolute workspace root path. When null, an empty message is rendered. */
  readonly cwd: string | null;
  /**
   * Optional git-status map (path → status) for tinting file rows.
   * When omitted, all rows render without status colors.
   */
  readonly statusByPath?: ReadonlyMap<string, GitFileStatus>;
  /**
   * When provided the caller owns the expanded set and receives toggle events.
   * When omitted the tree manages expansion internally.
   */
  readonly expandedExternally?: {
    expanded: ReadonlySet<string>;
    onToggle: (path: string) => void;
  };
  /** Called when the user clicks a file row. */
  readonly onFileClick: (path: string) => void;
  /**
   * Called when the user right-clicks any row. The caller is responsible for
   * showing the context menu (native or fallback DOM menu).
   */
  readonly onFileContextMenu: (
    event: React.MouseEvent,
    entry: { path: string; kind: "file" | "directory" },
  ) => void;
}

/**
 * Lazy file-tree widget backed by the projects.listDirectories RPC.
 * Renders the directory hierarchy for `cwd`, optionally tinting rows by git
 * status. The root directory is loaded on mount; child directories are loaded
 * on first expand.
 */
export function WorkspaceFileTree({
  cwd,
  statusByPath,
  expandedExternally,
  onFileClick,
  onFileContextMenu,
}: WorkspaceFileTreeProps) {
  const resolvedStatusByPath = statusByPath ?? EMPTY_STATUS_MAP;

  // Per-parent-path children, expanded set, loading set.
  const [childrenByParent, setChildrenByParent] = useState<
    Record<string, readonly ProjectFileSystemEntry[]>
  >({});
  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const expanded = expandedExternally
    ? (expandedExternally.expanded as Set<string>)
    : internalExpanded;

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
    setInternalExpanded(new Set());
    setError(null);
    if (cwd) void loadDirectory("");
  }, [cwd, loadDirectory]);

  // Live disk changes: refresh only the loaded directories that contain a changed path.
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
      if (expandedExternally) {
        // Ensure child entries are loaded before the caller opens the directory.
        if (!childrenByParent[path] && !loading.has(path)) void loadDirectory(path);
        expandedExternally.onToggle(path);
        return;
      }
      setInternalExpanded((prev) => {
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
    [childrenByParent, expandedExternally, loading, loadDirectory],
  );

  if (!cwd) {
    return (
      <div className="px-3 py-2 text-xs text-[var(--color-text-foreground-secondary)]">
        No workspace directory.
      </div>
    );
  }

  const rootEntries = childrenByParent[""];

  if (error) {
    return (
      <div className="px-3 py-2 text-xs text-[var(--color-text-foreground-error,#e5484d)]">
        {error}
      </div>
    );
  }

  if (rootEntries === undefined) {
    return (
      <div className="px-3 py-2 text-xs text-[var(--color-text-foreground-secondary)]">
        Loading…
      </div>
    );
  }

  if (rootEntries.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-[var(--color-text-foreground-secondary)]">
        Empty directory.
      </div>
    );
  }

  return (
    <FileTreeLevel
      entries={rootEntries}
      depth={0}
      expanded={expanded}
      loading={loading}
      childrenByParent={childrenByParent}
      statusByPath={resolvedStatusByPath}
      onToggleDirectory={toggleDirectory}
      onFileClick={onFileClick}
      onContextMenu={onFileContextMenu}
    />
  );
}

const EMPTY_STATUS_MAP: ReadonlyMap<string, GitFileStatus> = new Map();
