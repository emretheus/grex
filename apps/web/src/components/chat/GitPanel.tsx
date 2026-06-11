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
import {
  type GitStackedAction,
  type GitStatusResult,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, memo, Suspense, useCallback, useId, useMemo, useRef, useState } from "react";
import { buildHunkPatch } from "~/lib/patchManipulation";

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
  gitApplyPatchMutationOptions,
  gitDiscardFilesMutationOptions,
  gitQueryKeys,
  gitRunStackedActionMutationOptions,
  gitStageFilesMutationOptions,
  gitStatusQueryOptions,
  gitUnstageFilesMutationOptions,
  gitWorkingTreeDiffQueryOptions,
} from "~/lib/gitReactQuery";
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SquarePenIcon,
  Trash2,
} from "~/lib/icons";
import { cn } from "~/lib/utils";
import { readNativeApi } from "~/nativeApi";
import { useEditorStore } from "~/editorStore";
import { useRightDockStore } from "~/rightDockStore";
import { showConfirmDialogFallback } from "~/confirmDialogFallback";
import { CreatePullRequestDialog } from "./CreatePullRequestDialog";
import { useStore } from "~/store";
import { createProjectSelector, createThreadSelector } from "~/storeSelectors";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { IconButton } from "../ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/menu";
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
  onEditDiff?: ((path: string) => void) | undefined;
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
      {props.onEditDiff ? (
        <IconButton
          size="icon-xs"
          variant="ghost"
          className="shrink-0 opacity-0 group-hover:opacity-100 data-[disabled]:opacity-40"
          label="Edit in diff editor"
          tooltip="Edit in diff editor"
          onClick={() => props.onEditDiff?.(filePath)}
        >
          <SquarePenIcon className="size-3.5" />
        </IconButton>
      ) : null}
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
  onEditDiff?: ((path: string) => void) | undefined;
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
                onEditDiff={props.onEditDiff}
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

// ── Hunk actions panel ────────────────────────────────────────────────────────
// Rendered between the file list and the diff viewer. Shows per-hunk action
// buttons (Stage/Unstage/Discard hunk) for the currently selected file.

const HunkActionsPanel = memo(function HunkActionsPanel(props: {
  file: FileDiffMetadata;
  section: GitPanelSection;
  disabled: boolean;
  onStageHunk: (file: FileDiffMetadata, hunkIndex: number) => void;
  onUnstageHunk: (file: FileDiffMetadata, hunkIndex: number) => void;
  onDiscardHunk: (file: FileDiffMetadata, hunkIndex: number) => void;
}) {
  const { file, section, disabled } = props;
  if (file.hunks.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-border/70 px-1.5 py-1.5">
      <div className="mb-1 flex items-center gap-1.5 px-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          Hunks
        </span>
        <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
          {file.hunks.length}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {file.hunks.map((hunk, i) => {
          const addCount = hunk.additionLines;
          const delCount = hunk.deletionLines;
          const hdrText = hunk.hunkSpecs ?? `@@ -${hunk.deletionStart} +${hunk.additionStart} @@`;
          return (
            <div
              key={i}
              className="group flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-sidebar-accent/40"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                {hdrText}
              </span>
              <DiffStat
                additions={addCount}
                deletions={delCount}
                className="shrink-0 text-[10px]"
              />
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                {section === "unstaged" ? (
                  <>
                    <IconButton
                      size="icon-xs"
                      variant="ghost"
                      label="Stage hunk"
                      tooltip="Stage hunk"
                      disabled={disabled}
                      onClick={() => props.onStageHunk(file, i)}
                    >
                      <PlusIcon className="size-3" />
                    </IconButton>
                    <IconButton
                      size="icon-xs"
                      variant="ghost"
                      label="Discard hunk"
                      tooltip="Discard hunk"
                      disabled={disabled}
                      className="hover:text-rose-500"
                      onClick={() => props.onDiscardHunk(file, i)}
                    >
                      <Trash2 className="size-3" />
                    </IconButton>
                  </>
                ) : (
                  <IconButton
                    size="icon-xs"
                    variant="ghost"
                    label="Unstage hunk"
                    tooltip="Unstage hunk"
                    disabled={disabled}
                    onClick={() => props.onUnstageHunk(file, i)}
                  >
                    <RotateCcwIcon className="size-3" />
                  </IconButton>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ── Commit panel ─────────────────────────────────────────────────────────────
// Placed at the top of the Changes tab. Provides a textarea for the commit
// message, a primary "Commit & Push" button, and a dropdown for "Commit only".

function CommitPanel(props: {
  stagedCount: number;
  disabled: boolean;
  onCommit: (action: GitStackedAction, message: string) => void;
  error: string | null;
}) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const actionId = useId();

  const canCommit = props.stagedCount > 0 && message.trim().length > 0 && !props.disabled;

  const handlePrimaryCommit = useCallback(() => {
    if (!canCommit) return;
    props.onCommit("commit_push", message.trim());
    setMessage("");
  }, [canCommit, message, props]);

  const handleCommitOnly = useCallback(() => {
    if (!canCommit) return;
    props.onCommit("commit", message.trim());
    setMessage("");
  }, [canCommit, message, props]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handlePrimaryCommit();
      }
    },
    [handlePrimaryCommit],
  );

  // Suppress the unused variable — actionId is used as a stable React key
  void actionId;

  return (
    <div className="shrink-0 border-b border-border/70 px-1.5 py-2">
      <textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message (⌘↩ to commit)"
        rows={3}
        disabled={props.disabled}
        className={cn(
          "w-full resize-y rounded-md border border-border/70 bg-background px-2.5 py-1.5",
          "text-[12px] text-foreground placeholder:text-muted-foreground/50",
          "focus:outline-none focus:ring-1 focus:ring-ring/60",
          "disabled:opacity-60",
        )}
      />
      {props.error ? <p className="mt-1 text-[11px] text-destructive">{props.error}</p> : null}
      <div className="mt-1.5 flex items-center justify-end gap-px">
        <Button
          type="button"
          size="xs"
          variant="default"
          disabled={!canCommit}
          onClick={handlePrimaryCommit}
          className="rounded-r-none"
        >
          Commit
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="xs"
                variant="default"
                disabled={!canCommit}
                className="rounded-l-none border-l border-primary-foreground/20 px-1"
                aria-label="More commit options"
              />
            }
          >
            <ChevronDownIcon className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
            <DropdownMenuItem onSelect={handleCommitOnly}>Commit only</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

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
  const [isCreatePrOpen, setIsCreatePrOpen] = useState(false);
  const openDiff = useEditorStore((s) => s.openDiff);
  const openDockPane = useRightDockStore((s) => s.openPane);

  const editInDiff = useCallback(
    (path: string) => {
      openDiff(props.hostThreadId, path, "HEAD");
      openDockPane(props.hostThreadId, { kind: "editor" });
    },
    [openDiff, openDockPane, props.hostThreadId],
  );

  // No fixed polling: turn-driven file changes already push-invalidate the
  // working-tree-diff cache (see __root.tsx), and focus + the Refresh button +
  // post-mutation invalidation cover the rest. This keeps the pane cheap.
  const stagedQuery = useQuery(gitWorkingTreeDiffQueryOptions({ cwd, scope: "staged" }));
  const unstagedQuery = useQuery(gitWorkingTreeDiffQueryOptions({ cwd, scope: "unstaged" }));
  const statusQuery = useQuery(gitStatusQueryOptions(cwd));

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
  const applyPatchMutation = useMutation(gitApplyPatchMutationOptions({ cwd, queryClient }));
  const commitMutation = useMutation(gitRunStackedActionMutationOptions({ cwd, queryClient }));
  const mutating =
    stageMutation.isPending ||
    unstageMutation.isPending ||
    discardMutation.isPending ||
    applyPatchMutation.isPending ||
    commitMutation.isPending;

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

  const stageHunk = useCallback(
    (file: FileDiffMetadata, hunkIndex: number) => {
      if (!cwd) return;
      applyPatchMutation.mutate({ patch: buildHunkPatch(file, hunkIndex), cached: true });
    },
    [cwd, applyPatchMutation],
  );
  const unstageHunk = useCallback(
    (file: FileDiffMetadata, hunkIndex: number) => {
      if (!cwd) return;
      // file comes from staged scope (index vs HEAD); reverse-apply to index to unstage it
      applyPatchMutation.mutate({
        patch: buildHunkPatch(file, hunkIndex),
        cached: true,
        reverse: true,
      });
    },
    [cwd, applyPatchMutation],
  );
  const discardHunk = useCallback(
    (file: FileDiffMetadata, hunkIndex: number) => {
      if (!cwd) return;
      void showConfirmDialogFallback(
        `Discard this hunk in "${file.name}"?\nThis permanently reverts these lines and cannot be undone.`,
      ).then((confirmed) => {
        if (confirmed) {
          applyPatchMutation.mutate({
            patch: buildHunkPatch(file, hunkIndex),
            reverse: true,
          });
        }
      });
    },
    [cwd, applyPatchMutation],
  );

  const selectStaged = useCallback((file: FileDiffMetadata) => {
    setSelected({ section: "staged", path: resolveFileDiffPath(file) });
  }, []);
  const selectUnstaged = useCallback((file: FileDiffMetadata) => {
    setSelected({ section: "unstaged", path: resolveFileDiffPath(file) });
  }, []);

  const handleCommit = useCallback(
    (action: GitStackedAction, commitMessage: string) => {
      commitMutation.mutate({
        actionId: crypto.randomUUID(),
        action,
        commitMessage,
      });
    },
    [commitMutation],
  );

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

      <CommitPanel
        stagedCount={stagedFiles.length}
        disabled={mutating}
        onCommit={handleCommit}
        error={commitMutation.error instanceof Error ? commitMutation.error.message : null}
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
              onEditDiff={editInDiff}
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
              onEditDiff={editInDiff}
            />
          </>
        ) : null}
      </div>

      <PullRequestSection
        status={statusQuery.data ?? null}
        onCreate={() => setIsCreatePrOpen(true)}
        onOpenExternal={(url) => {
          void readNativeApi()?.shell.openExternal(url);
        }}
      />

      <div className="diff-panel-viewport flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-border/70">
        {selectedFileDiff && selectedResolved ? (
          <>
            <HunkActionsPanel
              file={selectedFileDiff}
              section={selectedResolved.section}
              disabled={mutating}
              onStageHunk={stageHunk}
              onUnstageHunk={unstageHunk}
              onDiscardHunk={discardHunk}
            />
            <div className="min-h-0 flex-1 overflow-hidden">
              <SelectedFileDiff fileDiff={selectedFileDiff} theme={theme} />
            </div>
          </>
        ) : (
          <PanelStateMessage density="compact">Select a file to view its diff.</PanelStateMessage>
        )}
      </div>

      <CreatePullRequestDialog
        open={isCreatePrOpen}
        onOpenChange={setIsCreatePrOpen}
        cwd={cwd}
        gitStatus={statusQuery.data ?? null}
        onCreated={(pr) => {
          void queryClient.invalidateQueries({ queryKey: gitQueryKeys.status(cwd) });
          if (pr.url) void readNativeApi()?.shell.openExternal(pr.url);
        }}
      />
    </div>
  );
}

// Compact PR section at the bottom of the panel: "View PR" when an open PR
// already tracks the branch, otherwise a "Create pull request" button.
function PullRequestSection(props: {
  status: GitStatusResult | null;
  onCreate: () => void;
  onOpenExternal: (url: string) => void;
}) {
  const pr = props.status?.pr ?? null;
  const branch = props.status?.branch ?? null;
  if (!branch) return null;

  return (
    <div className="border-t border-border/70 px-2 py-2">
      {pr && pr.state === "open" ? (
        <button
          type="button"
          onClick={() => props.onOpenExternal(pr.url)}
          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-sidebar-accent/60"
          title={`#${pr.number} ${pr.title}`}
        >
          <GitPullRequestIcon className="size-4 shrink-0 text-emerald-500" />
          <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
            <span className="text-muted-foreground">#{pr.number}</span> {pr.title}
          </span>
          <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-center"
          onClick={props.onCreate}
        >
          <GitPullRequestIcon className="size-3.5" />
          Create pull request
        </Button>
      )}
    </div>
  );
}

export default GitPanel;
