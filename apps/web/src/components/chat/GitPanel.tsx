// FILE: GitPanel.tsx
// Purpose: Source-control staging pane for the right dock (staged/unstaged lists + per-file diff).
// Layer: Chat right-dock UI
// Depends on: gitReactQuery (diff queries + stage/unstage mutations), diffRendering (patch parsing),
//             @pierre/diffs FileDiff for the per-file viewer.
//
// The pane derives its cwd like DockTerminalPane (thread worktree or project cwd) and reads the
// staged/unstaged patches, parsing them into file lists. Stage/unstage are index mutations routed
// through GitCore; on settle we invalidate the per-cwd git caches so both lists stay in sync.

import { type FileDiffMetadata } from "@pierre/diffs/react";
import { type ProjectId, type ThreadId } from "@t3tools/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, memo, Suspense, useCallback, useMemo, useState } from "react";

import { useTheme } from "~/hooks/useTheme";
import { useWorkspaceFileWatch } from "~/hooks/useWorkspaceFileWatch";

const GitHistoryPanel = lazy(() => import("./GitHistoryPanel"));
import {
  buildFileDiffRenderKey,
  getRenderablePatch,
  resolveFileDiffPath,
  sortFileDiffsByPath,
  splitRepoRelativePath,
  summarizeFileDiffStats,
} from "~/lib/diffRendering";
import {
  gitDiscardFilesMutationOptions,
  gitQueryKeys,
  gitStageFilesMutationOptions,
  gitUnstageFilesMutationOptions,
  gitWorkingTreeDiffQueryOptions,
} from "~/lib/gitReactQuery";
import { PlusIcon, RefreshCwIcon, RotateCcwIcon, Trash2 } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { showConfirmDialogFallback } from "~/confirmDialogFallback";
import { useStore } from "~/store";
import { createProjectSelector, createThreadSelector } from "~/storeSelectors";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { IconButton } from "../ui/icon-button";
import { DOCK_HEADER_ICON_BUTTON_CLASS } from "./chatHeaderControls";
import { DiffStat } from "./DiffStatLabel";
import { DockPaneHeader } from "./DockPaneHeader";
import { FileDiffCard, FileDiffSurface } from "./FileDiffView";
import { FileEntryIcon } from "./FileEntryIcon";
import { PanelStateMessage } from "./PanelStateMessage";

type GitPanelSection = "staged" | "unstaged";

// Selection is keyed by section + working-tree path (not the content-hashed
// render key) so it survives a file moving between the staged and unstaged
// lists after a stage/unstage action.
interface SelectedFile {
  section: GitPanelSection;
  path: string;
}

function parsePatchToSortedFiles(
  patch: string | undefined,
  cacheScope: string,
): FileDiffMetadata[] {
  const renderable = getRenderablePatch(patch, cacheScope);
  return renderable?.kind === "files" ? sortFileDiffsByPath(renderable.files) : [];
}

// Memoized so a stage/unstage in-flight toggle (which flips `actionDisabled`
// across siblings) and unrelated parent re-renders stay cheap; the per-row stat
// is only recomputed when the underlying file diff actually changes.
const GitFileRow = memo(function GitFileRow(props: {
  fileDiff: FileDiffMetadata;
  theme: "light" | "dark";
  isSelected: boolean;
  actionLabel: string;
  actionIcon: "stage" | "unstage";
  actionDisabled: boolean;
  onSelect: (file: FileDiffMetadata) => void;
  onAction: (paths: string[]) => void;
  onDiscard?: ((paths: string[]) => void) | undefined;
}) {
  const filePath = resolveFileDiffPath(props.fileDiff);
  const { dir, name } = splitRepoRelativePath(filePath);
  const stat = useMemo(() => summarizeFileDiffStats([props.fileDiff]), [props.fileDiff]);
  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left",
        props.isSelected ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5"
        onClick={() => props.onSelect(props.fileDiff)}
        title={filePath}
      >
        <FileEntryIcon pathValue={filePath} kind="file" theme={props.theme} className="size-4" />
        <span className="min-w-0 truncate text-[12px] text-foreground">
          {dir ? <span className="text-muted-foreground/70">{dir}</span> : null}
          <span>{name}</span>
        </span>
      </button>
      <DiffStat
        additions={stat.additions}
        deletions={stat.deletions}
        className="shrink-0 text-[11px]"
      />
      {props.onDiscard ? (
        <IconButton
          size="icon-xs"
          variant="ghost"
          className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-rose-500 data-[disabled]:opacity-40"
          label="Discard file changes"
          tooltip="Discard file changes"
          disabled={props.actionDisabled}
          onClick={() => props.onDiscard?.([filePath])}
        >
          <Trash2 className="size-3.5" />
        </IconButton>
      ) : null}
      <IconButton
        size="icon-xs"
        variant="ghost"
        className="shrink-0 opacity-0 group-hover:opacity-100 data-[disabled]:opacity-40"
        label={props.actionLabel}
        tooltip={props.actionLabel}
        disabled={props.actionDisabled}
        onClick={() => props.onAction([filePath])}
      >
        {props.actionIcon === "stage" ? (
          <PlusIcon className="size-3.5" />
        ) : (
          <RotateCcwIcon className="size-3.5" />
        )}
      </IconButton>
    </div>
  );
});

function GitFileSection(props: {
  title: string;
  emptyLabel: string;
  files: FileDiffMetadata[];
  theme: "light" | "dark";
  section: GitPanelSection;
  selectedPath: string | null;
  actionLabel: string;
  actionAllLabel: string;
  actionIcon: "stage" | "unstage";
  actionDisabled: boolean;
  onSelect: (file: FileDiffMetadata) => void;
  onAction: (paths: string[]) => void;
  onDiscard?: ((paths: string[]) => void) | undefined;
}) {
  const stat = useMemo(() => summarizeFileDiffStats(props.files), [props.files]);
  const allPaths = useMemo(
    () => props.files.map((file) => resolveFileDiffPath(file)),
    [props.files],
  );
  return (
    <section className="min-w-0">
      <header className="flex items-center gap-2 px-1.5 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {props.title}
        </span>
        <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
          {props.files.length}
        </span>
        <DiffStat additions={stat.additions} deletions={stat.deletions} className="text-[10px]" />
        {props.files.length > 0 ? (
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {props.onDiscard ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="text-muted-foreground hover:text-rose-500"
                disabled={props.actionDisabled}
                onClick={() => props.onDiscard?.(allPaths)}
              >
                Discard all
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={props.actionDisabled}
              onClick={() => props.onAction(allPaths)}
            >
              {props.actionAllLabel}
            </Button>
          </div>
        ) : null}
      </header>
      {props.files.length === 0 ? (
        <p className="px-1.5 py-1 text-[11px] text-muted-foreground/70">{props.emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {props.files.map((file) => {
            const key = buildFileDiffRenderKey(file);
            const filePath = resolveFileDiffPath(file);
            return (
              <GitFileRow
                key={key}
                fileDiff={file}
                theme={props.theme}
                isSelected={props.selectedPath === filePath}
                actionLabel={props.actionLabel}
                actionIcon={props.actionIcon}
                actionDisabled={props.actionDisabled}
                onSelect={props.onSelect}
                onAction={props.onAction}
                onDiscard={props.onDiscard}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

// Isolated + memoized so the (heavy) diff viewer only re-renders when the
// selected file or theme changes — not when stage/unstage mutations toggle the
// pane's pending state.
const SelectedFileDiff = memo(function SelectedFileDiff(props: {
  fileDiff: FileDiffMetadata;
  theme: "light" | "dark";
}) {
  return (
    <FileDiffSurface className="h-full min-h-0 overflow-auto px-2 py-2">
      <div className="diff-render-file rounded-md">
        <FileDiffCard fileDiff={props.fileDiff} theme={props.theme} />
      </div>
    </FileDiffSurface>
  );
});

type GitPanelTab = "changes" | "history";

function TabSwitcher(props: { active: GitPanelTab; onChange: (tab: GitPanelTab) => void }) {
  return (
    <div className="flex items-center gap-px rounded-md bg-muted/60 p-0.5">
      {(["changes", "history"] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => props.onChange(tab)}
          className={cn(
            "rounded px-2 py-0.5 text-[11px] font-medium capitalize leading-none transition-colors",
            props.active === tab
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function GitPanel(props: {
  hostThreadId: ThreadId;
  projectId: ProjectId | null;
  onClose?: () => void;
}) {
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme as "light" | "dark";
  const thread = useStore(
    useMemo(() => createThreadSelector(props.hostThreadId), [props.hostThreadId]),
  );
  const project = useStore(
    useMemo(() => createProjectSelector(props.projectId), [props.projectId]),
  );
  const cwd = thread?.worktreePath ?? project?.cwd ?? null;

  const [activeTab, setActiveTab] = useState<GitPanelTab>("changes");

  // Keep the status/diff lists live as the worktree changes on disk, without
  // polling. The watcher is shared per cwd, so mounting it here and in the
  // Files pane is cheap.
  useWorkspaceFileWatch(cwd);

  const [selected, setSelected] = useState<SelectedFile | null>(null);

  // No fixed polling: turn-driven file changes already push-invalidate the
  // working-tree-diff cache (see __root.tsx), and focus + the Refresh button +
  // post-mutation invalidation cover the rest. This keeps the pane cheap.
  const stagedQuery = useQuery(gitWorkingTreeDiffQueryOptions({ cwd, scope: "staged" }));
  const unstagedQuery = useQuery(gitWorkingTreeDiffQueryOptions({ cwd, scope: "unstaged" }));

  const stagedFiles = useMemo(
    () => parsePatchToSortedFiles(stagedQuery.data?.patch, `git-pane:staged:${theme}`),
    [stagedQuery.data?.patch, theme],
  );
  const unstagedFiles = useMemo(
    () => parsePatchToSortedFiles(unstagedQuery.data?.patch, `git-pane:unstaged:${theme}`),
    [unstagedQuery.data?.patch, theme],
  );

  const stageMutation = useMutation(gitStageFilesMutationOptions({ cwd, queryClient }));
  const unstageMutation = useMutation(gitUnstageFilesMutationOptions({ cwd, queryClient }));
  const discardMutation = useMutation(gitDiscardFilesMutationOptions({ cwd, queryClient }));
  const mutating =
    stageMutation.isPending || unstageMutation.isPending || discardMutation.isPending;

  const stage = useCallback(
    (paths: string[]) => {
      if (!cwd || paths.length === 0) return;
      stageMutation.mutate(paths);
    },
    [cwd, stageMutation],
  );
  const unstage = useCallback(
    (paths: string[]) => {
      if (!cwd || paths.length === 0) return;
      unstageMutation.mutate(paths);
    },
    [cwd, unstageMutation],
  );
  const discard = useCallback(
    (paths: string[]) => {
      if (!cwd || paths.length === 0) return;
      const count = paths.length;
      const target = count === 1 ? `“${paths[0]}”` : `${count} files`;
      void showConfirmDialogFallback(
        `Discard changes to ${target}?\nThis permanently reverts uncommitted changes and cannot be undone.`,
      ).then((confirmed) => {
        if (confirmed) discardMutation.mutate(paths);
      });
    },
    [cwd, discardMutation],
  );

  const selectStaged = useCallback((file: FileDiffMetadata) => {
    setSelected({ section: "staged", path: resolveFileDiffPath(file) });
  }, []);
  const selectUnstaged = useCallback((file: FileDiffMetadata) => {
    setSelected({ section: "unstaged", path: resolveFileDiffPath(file) });
  }, []);

  const refresh = useCallback(() => {
    if (!cwd) return;
    void queryClient.invalidateQueries({ queryKey: gitQueryKeys.workingTreeDiff(cwd, "staged") });
    void queryClient.invalidateQueries({
      queryKey: gitQueryKeys.workingTreeDiff(cwd, "unstaged"),
    });
  }, [cwd, queryClient]);

  // Resolve the selected file by path, preferring its stored section but falling
  // back to the other list so the diff (and row highlight) follow a file across a
  // stage/unstage move instead of silently clearing.
  const selectedResolved = useMemo(() => {
    if (!selected) return null;
    const findInSection = (section: GitPanelSection) =>
      (section === "staged" ? stagedFiles : unstagedFiles).find(
        (file) => resolveFileDiffPath(file) === selected.path,
      ) ?? null;
    const preferred = findInSection(selected.section);
    if (preferred) {
      return { section: selected.section, file: preferred };
    }
    const otherSection: GitPanelSection = selected.section === "staged" ? "unstaged" : "staged";
    const fallback = findInSection(otherSection);
    return fallback ? { section: otherSection, file: fallback } : null;
  }, [selected, stagedFiles, unstagedFiles]);
  const selectedFileDiff = selectedResolved?.file ?? null;
  const selectedPath = selected?.path ?? null;

  const isLoading = stagedQuery.isLoading || unstagedQuery.isLoading;
  const error =
    stagedQuery.error instanceof Error
      ? stagedQuery.error.message
      : unstagedQuery.error instanceof Error
        ? unstagedQuery.error.message
        : null;
  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0;

  if (!cwd) {
    return <PanelStateMessage>Source control is unavailable for this thread.</PanelStateMessage>;
  }

  if (activeTab === "history") {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <DockPaneHeader
          title="Source control"
          onClose={props.onClose}
          closeLabel="Close source control"
          actions={
            <div className="flex items-center gap-1">
              <TabSwitcher active={activeTab} onChange={setActiveTab} />
            </div>
          }
        />
        <div className="min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={<PanelStateMessage density="compact">Loading…</PanelStateMessage>}>
            <GitHistoryPanel cwd={cwd} />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <DockPaneHeader
        title="Source control"
        onClose={props.onClose}
        closeLabel="Close source control"
        actions={
          <div className="flex items-center gap-1">
            <TabSwitcher active={activeTab} onChange={setActiveTab} />
            <IconButton
              size="icon-xs"
              variant="ghost"
              label="Refresh changes"
              tooltip="Refresh changes"
              className={DOCK_HEADER_ICON_BUTTON_CLASS}
              onClick={refresh}
            >
              <RefreshCwIcon className="size-3.5" />
            </IconButton>
          </div>
        }
      />

      <div className="flex max-h-[48%] min-h-0 shrink-0 flex-col gap-2 overflow-auto px-1.5 py-2">
        {error ? (
          <Alert variant="error" size="sm" className="text-destructive">
            {error}
          </Alert>
        ) : null}
        {!error && isLoading && !hasChanges ? (
          <p className="px-1.5 py-1 text-[11px] text-muted-foreground/70">Loading changes...</p>
        ) : null}
        {!error && !isLoading && !hasChanges ? (
          <p className="px-1.5 py-2 text-center text-[12px] text-muted-foreground/70">
            No changes in the working tree.
          </p>
        ) : null}
        {hasChanges ? (
          <>
            <GitFileSection
              title="Staged"
              emptyLabel="No staged changes."
              files={stagedFiles}
              theme={theme}
              section="staged"
              selectedPath={selectedResolved?.section === "staged" ? selectedPath : null}
              actionLabel="Unstage file"
              actionAllLabel="Unstage all"
              actionIcon="unstage"
              actionDisabled={mutating}
              onSelect={selectStaged}
              onAction={unstage}
            />
            <GitFileSection
              title="Changes"
              emptyLabel="No unstaged changes."
              files={unstagedFiles}
              theme={theme}
              section="unstaged"
              selectedPath={selectedResolved?.section === "unstaged" ? selectedPath : null}
              actionLabel="Stage file"
              actionAllLabel="Stage all"
              actionIcon="stage"
              actionDisabled={mutating}
              onSelect={selectUnstaged}
              onAction={stage}
              onDiscard={discard}
            />
          </>
        ) : null}
      </div>

      <div className="diff-panel-viewport min-h-0 min-w-0 flex-1 overflow-hidden border-t border-border/70">
        {selectedFileDiff ? (
          <SelectedFileDiff fileDiff={selectedFileDiff} theme={theme} />
        ) : (
          <PanelStateMessage density="compact">Select a file to view its diff.</PanelStateMessage>
        )}
      </div>
    </div>
  );
}

export default GitPanel;
