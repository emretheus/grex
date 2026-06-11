// FILE: EditorWorkspaceView.tsx
// Purpose: Full-screen 3-pane editor workspace: left activity bar + sidebar,
//          center editable Monaco editor or diff view, right resizable chat pane.
// Layer: Chat route presentation

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";

import type { ProjectId, ThreadId } from "@t3tools/contracts";
import { readNativeApi } from "~/nativeApi";
import { createThreadSelector } from "~/storeSelectors";
import { useStore as useAppStore } from "~/store";
import { useEditorStore, selectThreadEditorState } from "~/editorStore";
import { gitWorkingTreeDiffQueryOptions } from "~/lib/gitReactQuery";
import {
  buildGitFileStatusMap,
  gitFileStatusBadge,
  gitFileStatusColorClass,
  type GitFileStatus,
} from "~/lib/gitFileStatus";
import { basenameOfPath } from "~/file-icons";
import { copyTextToClipboard } from "~/hooks/useCopyToClipboard";
import { useDesktopTopBarTrafficLightGutterClassName } from "~/hooks/useDesktopTopBarGutter";
import {
  appendChatFileReference,
  appendComposerPromptText,
  buildWhyLinesPrompt,
  getSelectionWithin,
  type ChatFileReference,
} from "~/lib/chatReferences";
import {
  readEditorWorkspaceViewState,
  storeEditorWorkspaceViewState,
  defaultEditorWorkspaceViewState,
  EDITOR_CHAT_PANE_MIN_WIDTH_PX,
  EDITOR_CHAT_PANE_MAX_WIDTH_PX,
  EDITOR_CHAT_PANE_DEFAULT_WIDTH_PX,
  type EditorCenterMode,
} from "~/editorWorkspaceViewState";
import {
  ChangesIcon,
  ChevronLeftIcon,
  FileIcon,
  FolderIcon,
  MessageCircleIcon,
  PanelRightCloseIcon,
} from "~/lib/icons";
import { cn } from "~/lib/utils";
import {
  ChatHeaderButton,
  CHAT_SURFACE_HEADER_DIVIDER_CLASS_NAME,
  CHAT_SURFACE_HEADER_HEIGHT_CLASS,
} from "./chat/chatHeaderControls";
import { WorkspaceFileTree, joinDirectoryPath } from "./chat/WorkspaceFileTree";
import { DockEditorPane } from "./chat/DockEditorPane";
import { TranscriptSelectionAction } from "./chat/TranscriptSelectionAction";
import { useCodeSelectionAction } from "./chat/useCodeSelectionAction";
import { toastManager } from "./ui/toast";
import { PanelStateMessage } from "./chat/PanelStateMessage";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

// ---- Props ----

export interface EditorWorkspaceViewProps {
  threadId: ThreadId;
  workspaceRoot: string | null;
  projectName: string | null;
  selectedFilePath: string | null;
  chatPanel: ReactNode;
  diffPanel?: ReactNode;
  onSelectFile: (path: string) => void;
  onExitEditorView: () => void;
}

const SURFACE_BORDER_CLASS = "border-[var(--app-surface-divider)]";
const SIDEBAR_SUBHEADER_CLASS =
  "flex h-8 shrink-0 items-center gap-2 border-b px-2.5 " + SURFACE_BORDER_CLASS;
const SIDEBAR_SUBHEADER_LABEL_CLASS =
  "truncate text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-foreground-secondary)]";

const CHAT_PANE_KEYBOARD_STEP = 24;

function clampChatPaneWidth(width: number): number {
  return Math.min(
    EDITOR_CHAT_PANE_MAX_WIDTH_PX,
    Math.max(EDITOR_CHAT_PANE_MIN_WIDTH_PX, Math.round(width)),
  );
}

// ---- Resize state ----

interface ChatPaneResizeState {
  pointerId: number;
  startX: number;
  startWidth: number;
  pendingWidth: number;
  rafId: number | null;
  restoreBodyCursor: string;
  restoreBodyUserSelect: string;
  onPointerMove: (event: PointerEvent) => void;
  onPointerEnd: (event: PointerEvent) => void;
}

// ---- Activity bar button ----

function ActivityBarButton(props: {
  label: string;
  active: boolean;
  collapsible: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const button = (
    <button
      type="button"
      className={cn(
        "group/activity relative flex h-12 w-full cursor-pointer items-center justify-center text-[var(--color-text-foreground-secondary)] transition-colors",
        "hover:bg-[var(--color-background-button-secondary-hover)] hover:text-[var(--color-text-foreground)]",
        "focus-visible:bg-[var(--color-background-button-secondary-hover)] focus-visible:outline-none",
        props.active && "text-[var(--color-text-foreground)]",
      )}
      aria-label={props.label}
      aria-pressed={props.active}
      onClick={props.onClick}
    >
      {/* Active rail accent on the left edge. */}
      <span
        className={cn(
          "absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full transition-colors",
          props.active ? "bg-[var(--color-text-foreground)]" : "bg-transparent",
        )}
        aria-hidden="true"
      />
      {props.children}
      {/* Collapse affordance: a small chevron when re-clicking will hide the sidebar. */}
      {props.collapsible ? (
        <ChevronLeftIcon
          className="absolute right-1 top-1/2 size-3 -translate-y-1/2 text-[var(--color-text-foreground-secondary)] opacity-0 transition-opacity group-hover/activity:opacity-100"
          aria-hidden="true"
        />
      ) : null}
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipPopup side="right">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

// ---- Diff-mode changed-files list ----

interface ChangedFileEntry {
  path: string;
  name: string;
  status: GitFileStatus;
}

function DiffFilesSidebar(props: {
  files: ReadonlyArray<ChangedFileEntry>;
  loading: boolean;
  activeFilePath: string | null;
  onSelect: (path: string) => void;
}) {
  if (props.loading && props.files.length === 0) {
    return <PanelStateMessage density="compact">Loading changed files…</PanelStateMessage>;
  }
  if (props.files.length === 0) {
    return (
      <PanelStateMessage density="compact">
        No uncommitted changes. Edits you make will appear here.
      </PanelStateMessage>
    );
  }
  return (
    <div className="flex flex-col py-1">
      {props.files.map((file) => {
        const statusColor = gitFileStatusColorClass(file.status);
        const statusBadge = gitFileStatusBadge(file.status);
        const isActive = file.path === props.activeFilePath;
        return (
          <button
            key={file.path}
            type="button"
            onClick={() => props.onSelect(file.path)}
            aria-current={isActive ? "true" : undefined}
            title={file.path}
            className={cn(
              "group flex h-7 w-full items-center gap-1.5 px-2.5 text-left text-[13px] text-[var(--color-text-foreground)] outline-none transition-colors",
              "hover:bg-[var(--color-background-button-secondary-hover)]",
              "focus-visible:bg-[var(--color-background-button-secondary-hover)]",
              isActive && "bg-sidebar-accent",
            )}
          >
            <FileIcon
              className={cn(
                "size-4 shrink-0",
                statusColor ?? "text-[var(--color-text-foreground-secondary)]",
              )}
            />
            <span className={cn("truncate", statusColor)}>{file.name}</span>
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
        );
      })}
    </div>
  );
}

// ---- Main component ----

export function EditorWorkspaceView(props: EditorWorkspaceViewProps) {
  const { threadId, workspaceRoot, projectName, selectedFilePath, onExitEditorView, onSelectFile } =
    props;

  const thread = useAppStore(useMemo(() => createThreadSelector(threadId), [threadId]));
  const projectId: ProjectId | null = thread?.projectId ?? null;

  const trafficLightGutterClassName = useDesktopTopBarTrafficLightGutterClassName();

  // Active file: prefer the live editor tab, fall back to the URL-driven selection.
  const editorState = useEditorStore((s) => selectThreadEditorState(s, threadId));
  const activeFilePath = editorState.activePath ?? selectedFilePath;

  // Restore persisted shell preferences for this thread.
  const initialState = useMemo(
    () => readEditorWorkspaceViewState(threadId) ?? defaultEditorWorkspaceViewState(),
    [threadId],
  );

  const [centerMode, setCenterMode] = useState<EditorCenterMode>(initialState.centerMode);
  const [sidebarVisible, setSidebarVisible] = useState(initialState.sidebarVisible);
  const [chatPaneVisible, setChatPaneVisible] = useState(initialState.chatPaneVisible);
  const [chatPaneWidth, setChatPaneWidth] = useState(() =>
    clampChatPaneWidth(initialState.chatPaneWidth),
  );
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(
    () => new Set(initialState.expandedDirectories),
  );

  // Persist shell prefs whenever they change.
  useEffect(() => {
    storeEditorWorkspaceViewState(threadId, {
      expandedDirectories: [...expandedDirectories],
      centerMode,
      sidebarVisible,
      chatPaneVisible,
      chatPaneWidth,
    });
  }, [centerMode, sidebarVisible, chatPaneVisible, chatPaneWidth, expandedDirectories, threadId]);

  // Working-tree diff drives both the file-tree status tints and the diff-mode list.
  const workingTreeDiffQuery = useQuery(
    gitWorkingTreeDiffQueryOptions({ cwd: workspaceRoot, scope: "workingTree" }),
  );
  const statusByPath = useMemo(
    () => buildGitFileStatusMap(workingTreeDiffQuery.data?.patch),
    [workingTreeDiffQuery.data?.patch],
  );
  const changedFiles = useMemo<ChangedFileEntry[]>(() => {
    const entries: ChangedFileEntry[] = [];
    for (const [path, status] of statusByPath) {
      entries.push({ path, name: basenameOfPath(path), status });
    }
    return entries.toSorted((a, b) =>
      a.path.localeCompare(b.path, undefined, { sensitivity: "base" }),
    );
  }, [statusByPath]);

  const openFile = useEditorStore((s) => s.openFile);
  const openDiff = useEditorStore((s) => s.openDiff);

  const handleFileClick = useCallback(
    (path: string) => {
      openFile(threadId, path);
      onSelectFile(path);
    },
    [threadId, openFile, onSelectFile],
  );

  const handleDiffFileSelect = useCallback(
    (path: string) => {
      openDiff(threadId, path, "HEAD");
      onSelectFile(path);
    },
    [threadId, openDiff, onSelectFile],
  );

  const handleFileContextMenu = useCallback(
    async (event: React.MouseEvent, entry: { path: string; kind: "file" | "directory" }) => {
      event.preventDefault();
      const api = readNativeApi();
      if (!api) return;
      const absolutePath = workspaceRoot
        ? joinDirectoryPath(workspaceRoot, entry.path)
        : entry.path;
      const hasChanges = entry.kind === "file" && statusByPath.has(entry.path);
      const clicked = await api.contextMenu.show(
        [
          ...(entry.kind === "file" ? [{ id: "open" as const, label: "Open" }] : []),
          ...(hasChanges ? [{ id: "open-diff" as const, label: "Open diff" }] : []),
          {
            id: "reference-in-chat" as const,
            label: "Reference in chat",
            separatorBefore: entry.kind === "file",
          },
          ...(hasChanges
            ? [{ id: "ask-why-changed" as const, label: "Ask why this changed" }]
            : []),
          { id: "copy-path" as const, label: "Copy path", separatorBefore: true },
          { id: "copy-relative-path" as const, label: "Copy relative path" },
          ...(workspaceRoot
            ? [{ id: "reveal" as const, label: "Reveal in file manager", separatorBefore: true }]
            : []),
        ],
        { x: event.clientX, y: event.clientY },
      );
      switch (clicked) {
        case "open":
          handleFileClick(entry.path);
          break;
        case "open-diff":
          handleDiffFileSelect(entry.path);
          break;
        case "reference-in-chat":
          appendChatFileReference(threadId, { path: entry.path });
          break;
        case "ask-why-changed": {
          const ref: ChatFileReference = { path: entry.path };
          appendComposerPromptText(threadId, buildWhyLinesPrompt(ref));
          break;
        }
        case "copy-path":
          void copyTextToClipboard(absolutePath);
          break;
        case "copy-relative-path":
          void copyTextToClipboard(entry.path);
          break;
        case "reveal":
          if (workspaceRoot) {
            void api.shell.showInFolder(absolutePath).catch(() => {
              toastManager.add({
                type: "error",
                title: "Could not reveal file",
                description: "The file manager could not be opened.",
              });
            });
          }
          break;
        default:
          break;
      }
    },
    [workspaceRoot, statusByPath, threadId, handleFileClick, handleDiffFileSelect],
  );

  // Activity bar: clicking the active mode collapses the sidebar.
  const handleActivityBarSelect = useCallback(
    (mode: EditorCenterMode) => {
      if (mode === centerMode && sidebarVisible) {
        setSidebarVisible(false);
        return;
      }
      if (!sidebarVisible) setSidebarVisible(true);
      setCenterMode(mode);
    },
    [centerMode, sidebarVisible],
  );

  const toggleChatPane = useCallback(() => setChatPaneVisible((prev) => !prev), []);

  // ---- Monaco "Add to chat" selection overlay (over the center editor) ----
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null);
  const codeSelection = useCodeSelectionAction<ChatFileReference>({
    enabled: centerMode === "file" && activeFilePath !== null,
    readSelection: (container) => {
      if (!activeFilePath) return null;
      const selection = getSelectionWithin(container);
      if (!selection) return null;
      return { path: activeFilePath, ...selection };
    },
    onCommit: (reference) => appendChatFileReference(threadId, reference),
  });

  // ---- Chat-pane resize (pointer + RAF) ----
  const chatPaneResizeStateRef = useRef<ChatPaneResizeState | null>(null);

  const stopResize = useCallback(() => {
    const s = chatPaneResizeStateRef.current;
    if (!s || typeof window === "undefined") return;
    if (s.rafId !== null) {
      window.cancelAnimationFrame(s.rafId);
      s.rafId = null;
    }
    window.removeEventListener("pointermove", s.onPointerMove);
    window.removeEventListener("pointerup", s.onPointerEnd);
    window.removeEventListener("pointercancel", s.onPointerEnd);
    document.body.style.cursor = s.restoreBodyCursor;
    document.body.style.userSelect = s.restoreBodyUserSelect;
    setChatPaneWidth(s.pendingWidth);
    chatPaneResizeStateRef.current = null;
  }, []);

  useEffect(() => stopResize, [stopResize]);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || typeof window === "undefined") return;
      event.preventDefault();
      event.stopPropagation();
      stopResize();

      const s: ChatPaneResizeState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: chatPaneWidth,
        pendingWidth: chatPaneWidth,
        rafId: null,
        restoreBodyCursor: document.body.style.cursor,
        restoreBodyUserSelect: document.body.style.userSelect,
        onPointerMove: () => undefined,
        onPointerEnd: () => undefined,
      };

      s.onPointerMove = (moveEvent) => {
        if (moveEvent.pointerId !== s.pointerId) return;
        // Dragging left (smaller clientX) widens the chat pane.
        s.pendingWidth = clampChatPaneWidth(s.startWidth + s.startX - moveEvent.clientX);
        if (s.rafId !== null) return;
        s.rafId = window.requestAnimationFrame(() => {
          s.rafId = null;
          setChatPaneWidth(s.pendingWidth);
        });
      };

      s.onPointerEnd = (endEvent) => {
        if (endEvent.pointerId !== s.pointerId) return;
        stopResize();
      };

      chatPaneResizeStateRef.current = s;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", s.onPointerMove);
      window.addEventListener("pointerup", s.onPointerEnd);
      window.addEventListener("pointercancel", s.onPointerEnd);
    },
    [chatPaneWidth, stopResize],
  );

  const handleResizeDoubleClick = useCallback(() => {
    setChatPaneWidth(EDITOR_CHAT_PANE_DEFAULT_WIDTH_PX);
  }, []);

  const handleResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      let nextWidth: number | null = null;
      if (event.key === "ArrowLeft") nextWidth = chatPaneWidth + CHAT_PANE_KEYBOARD_STEP;
      else if (event.key === "ArrowRight") nextWidth = chatPaneWidth - CHAT_PANE_KEYBOARD_STEP;
      else if (event.key === "Home") nextWidth = EDITOR_CHAT_PANE_MAX_WIDTH_PX;
      else if (event.key === "End") nextWidth = EDITOR_CHAT_PANE_MIN_WIDTH_PX;
      if (nextWidth === null) return;
      event.preventDefault();
      setChatPaneWidth(clampChatPaneWidth(nextWidth));
    },
    [chatPaneWidth],
  );

  const expandedExternally = useMemo(
    () => ({
      expanded: expandedDirectories as ReadonlySet<string>,
      onToggle: (path: string) => {
        setExpandedDirectories((prev) => {
          const next = new Set(prev);
          if (next.has(path)) next.delete(path);
          else next.add(path);
          return next;
        });
      },
    }),
    [expandedDirectories],
  );

  const filesActive = centerMode === "file" && sidebarVisible;
  const diffActive = centerMode === "diff" && sidebarVisible;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-background-surface)] text-[var(--color-text-foreground)]">
      {/* Header */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 px-2 sm:px-3",
          CHAT_SURFACE_HEADER_HEIGHT_CLASS,
          CHAT_SURFACE_HEADER_DIVIDER_CLASS_NAME,
        )}
      >
        <div className={cn("flex min-w-0 flex-1 items-center gap-2", trafficLightGutterClassName)}>
          <span
            className="truncate text-[13px] font-medium text-[var(--color-text-foreground)]"
            title={projectName ?? undefined}
          >
            {projectName ?? "Workspace"}
          </span>
          <span
            className="hidden truncate text-[11px] text-[var(--color-text-foreground-secondary)] sm:inline"
            title={workspaceRoot ?? undefined}
          >
            {workspaceRoot ?? "No workspace"}
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <ChatHeaderButton
                type="button"
                tone="outline"
                aria-pressed={chatPaneVisible}
                aria-label={chatPaneVisible ? "Hide chat panel" : "Show chat panel"}
                className="!size-7 justify-center px-0"
                onClick={toggleChatPane}
              >
                <PanelRightCloseIcon
                  className={cn("size-3.5 transition-transform", !chatPaneVisible && "rotate-180")}
                />
              </ChatHeaderButton>
            }
          />
          <TooltipPopup side="bottom">
            {chatPaneVisible ? "Hide chat panel" : "Show chat panel"}
          </TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <ChatHeaderButton
                type="button"
                tone="outline"
                aria-label="Return to chat view"
                className="gap-1.5"
                onClick={onExitEditorView}
              >
                <MessageCircleIcon className="size-3.5" />
                <span className="truncate font-normal">Chat</span>
              </ChatHeaderButton>
            }
          />
          <TooltipPopup side="bottom">Return to the standard chat view</TooltipPopup>
        </Tooltip>
      </div>

      {/* Body */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* Activity bar */}
        <nav
          className={cn(
            "flex w-12 shrink-0 flex-col items-center border-r bg-[var(--color-background-surface)]",
            SURFACE_BORDER_CLASS,
          )}
          aria-label="Editor activity bar"
        >
          <ActivityBarButton
            label={filesActive ? "Hide files sidebar" : "Files"}
            active={filesActive}
            collapsible={filesActive}
            onClick={() => handleActivityBarSelect("file")}
          >
            <FolderIcon className="size-5" />
          </ActivityBarButton>
          <ActivityBarButton
            label={diffActive ? "Hide changes sidebar" : "Changes"}
            active={diffActive}
            collapsible={diffActive}
            onClick={() => handleActivityBarSelect("diff")}
          >
            <ChangesIcon className="size-5" />
          </ActivityBarButton>
        </nav>

        {/* Content area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Sidebar — width animates closed/open (matches chat-pane motion). On
              narrow layouts it stacks full-width above the editor instead. */}
          <aside
            className={cn(
              "flex shrink-0 flex-col overflow-hidden border-b bg-[var(--color-background-surface)] transition-[width] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none lg:h-full lg:border-b-0 lg:border-r",
              SURFACE_BORDER_CLASS,
              sidebarVisible
                ? "min-h-[11rem] w-full lg:w-52"
                : "min-h-0 w-full overflow-hidden lg:w-0 lg:min-h-0",
              !sidebarVisible && "hidden lg:flex",
            )}
            aria-hidden={!sidebarVisible}
          >
            {centerMode === "file" ? (
              <>
                <div className={SIDEBAR_SUBHEADER_CLASS}>
                  <span className={SIDEBAR_SUBHEADER_LABEL_CLASS}>Explorer</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto py-1">
                  <WorkspaceFileTree
                    cwd={workspaceRoot}
                    statusByPath={statusByPath}
                    activeFilePath={activeFilePath}
                    emptyMessage="This workspace is empty. Use the terminal to add files."
                    expandedExternally={expandedExternally}
                    onFileClick={handleFileClick}
                    onFileContextMenu={handleFileContextMenu}
                  />
                </div>
              </>
            ) : (
              <>
                <div className={SIDEBAR_SUBHEADER_CLASS}>
                  <span className={SIDEBAR_SUBHEADER_LABEL_CLASS}>Changes</span>
                  {changedFiles.length > 0 ? (
                    <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[var(--color-text-foreground-secondary)]">
                      {changedFiles.length}
                    </span>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <DiffFilesSidebar
                    files={changedFiles}
                    loading={workingTreeDiffQuery.isLoading}
                    activeFilePath={activeFilePath}
                    onSelect={handleDiffFileSelect}
                  />
                </div>
              </>
            )}
          </aside>

          {/* Center pane */}
          <main
            ref={editorSurfaceRef}
            className={cn(
              "relative flex min-h-[16rem] min-w-0 flex-1 border-b lg:h-full lg:border-b-0",
              SURFACE_BORDER_CLASS,
            )}
            onMouseUp={codeSelection.onContainerMouseUp}
          >
            {workspaceRoot ? (
              <DockEditorPane
                hostThreadId={threadId}
                projectId={projectId}
                isActive
                emptyStateMessage="Select a file in the sidebar to open it here."
              />
            ) : (
              <PanelStateMessage>No workspace is attached to this chat.</PanelStateMessage>
            )}
            {codeSelection.pendingAction ? (
              <TranscriptSelectionAction
                left={codeSelection.pendingAction.left}
                top={codeSelection.pendingAction.top}
                placement={codeSelection.pendingAction.placement}
                onAddToChat={codeSelection.commit}
              />
            ) : null}
          </main>

          {/* Chat pane resize handle */}
          <div
            role="slider"
            aria-label="Chat panel width"
            aria-orientation="vertical"
            aria-valuemin={EDITOR_CHAT_PANE_MIN_WIDTH_PX}
            aria-valuemax={EDITOR_CHAT_PANE_MAX_WIDTH_PX}
            aria-valuenow={chatPaneWidth}
            tabIndex={chatPaneVisible ? 0 : -1}
            title="Drag to resize the chat panel (double-click to reset)"
            className={cn(
              "group relative z-10 w-1 shrink-0 cursor-col-resize bg-[var(--app-surface-divider)] outline-none transition-colors",
              "hover:bg-[var(--color-text-accent)] focus-visible:bg-[var(--color-text-accent)]",
              chatPaneVisible ? "hidden lg:block" : "hidden",
            )}
            onPointerDown={handleResizePointerDown}
            onDoubleClick={handleResizeDoubleClick}
            onKeyDown={handleResizeKeyDown}
          >
            {/* Wider invisible hit area for easier grabbing. */}
            <span className="absolute inset-y-0 -left-1.5 -right-1.5" aria-hidden="true" />
          </div>

          {/* Chat pane — width animates; kept mounted so runtime + draft survive toggle. */}
          <aside
            className={cn(
              "shrink-0 overflow-hidden bg-[var(--color-background-surface)] transition-[width] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
              "w-full lg:h-full",
              chatPaneVisible
                ? "flex min-h-[18rem] lg:w-[var(--editor-chat-pane-width)]"
                : "hidden lg:flex lg:w-0",
            )}
            style={
              {
                "--editor-chat-pane-width": `${chatPaneWidth}px`,
              } as CSSProperties
            }
            aria-hidden={!chatPaneVisible}
          >
            <div className="flex min-h-0 min-w-0 flex-1">{props.chatPanel}</div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default EditorWorkspaceView;
