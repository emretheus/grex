// FILE: DockFilesPane.tsx
// Purpose: Right-dock "Files" pane — a lazy-loaded file explorer scoped to the
//          active thread's worktree (or the project cwd). Clicking a file opens it
//          in the Editor pane.
// Layer: Chat right-dock UI
// Depends on: projects.listDirectories RPC, editorStore, rightDockStore.

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ProjectFileSystemEntry, ProjectId, ThreadId } from "@t3tools/contracts";
import { readNativeApi } from "~/nativeApi";
import { createProjectSelector, createThreadSelector } from "~/storeSelectors";
import { useStore as useAppStore } from "~/store";
import { useEditorStore } from "~/editorStore";
import { useRightDockStore } from "~/rightDockStore";
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
            onToggleDirectory={toggleDirectory}
            onFileClick={handleFileClick}
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
  readonly onToggleDirectory: (path: string) => void;
  readonly onFileClick: (path: string) => void;
}

function FileTreeLevel({
  entries,
  depth,
  expanded,
  loading,
  childrenByParent,
  onToggleDirectory,
  onFileClick,
}: FileTreeLevelProps) {
  const sorted = useMemo(() => sortEntries(entries), [entries]);
  return (
    <>
      {sorted.map((entry) => {
        const isDir = entry.kind === "directory";
        const isExpanded = isDir && expanded.has(entry.path);
        const children = childrenByParent[entry.path];
        return (
          <div key={entry.path}>
            <button
              type="button"
              onClick={() => (isDir ? onToggleDirectory(entry.path) : onFileClick(entry.path))}
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
                <FileIcon className="size-4 shrink-0 text-[var(--color-text-foreground-tertiary,var(--color-text-foreground-secondary))]" />
              )}
              <span className="truncate">{entry.name}</span>
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
                  onToggleDirectory={onToggleDirectory}
                  onFileClick={onFileClick}
                />
              ) : null
            ) : null}
          </div>
        );
      })}
    </>
  );
}

// Directories first, then files; each alphabetical (case-insensitive).
function sortEntries(entries: readonly ProjectFileSystemEntry[]): ProjectFileSystemEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
