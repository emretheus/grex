// FILE: EditorWorkspaceView.tsx
// Purpose: Full-screen 3-pane editor workspace: left activity bar + sidebar,
//          center Monaco editor or diff view, right resizable chat pane.
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
import { useEditorStore } from "~/editorStore";
import { gitWorkingTreeDiffQueryOptions } from "~/lib/gitReactQuery";
import { buildGitFileStatusMap } from "~/lib/gitFileStatus";
import { copyTextToClipboard } from "~/hooks/useCopyToClipboard";
import { useDesktopTopBarTrafficLightGutterClassName } from "~/hooks/useDesktopTopBarGutter";
import {
  appendChatFileReference,
  appendComposerPromptText,
  buildWhyLinesPrompt,
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
import { ChangesIcon, MessageCircleIcon, PanelRightCloseIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import {
  ChatHeaderButton,
  CHAT_SURFACE_HEADER_DIVIDER_CLASS_NAME,
  CHAT_SURFACE_HEADER_HEIGHT_CLASS,
} from "./chat/chatHeaderControls";
import { WorkspaceFileTree, joinDirectoryPath } from "./chat/WorkspaceFileTree";
import { DockEditorPane } from "./chat/DockEditorPane";
import { toastManager } from "./ui/toast";
import { PanelStateMessage } from "./chat/PanelStateMessage";
import { FolderIcon } from "~/lib/icons";
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

function clampChatPaneWidth(width: number): number {
  return Math.min(
    EDITOR_CHAT_PANE_MAX_WIDTH_PX,
    Math.max(EDITOR_CHAT_PANE_MIN_WIDTH_PX, Math.round(width)),
  );
}

const CHAT_PANE_KEYBOARD_STEP = 24;

// ---- Activity bar button ----

function ActivityBarButton(props: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const button = (
    <button
      type="button"
      className={cn(
        "relative flex h-12 w-full cursor-pointer items-center justify-center text-muted-foreground/72 transition-colors hover:bg-[var(--color-background-button-secondary-hover)] hover:text-foreground",
        props.active && "bg-[var(--color-background-button-secondary)] text-foreground",
      )}
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
      onClick={props.onClick}
    >
      <span
        className={cn(
          "absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-transparent",
          props.active && "bg-foreground/85",
        )}
        aria-hidden="true"
      />
      {props.children}
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipPopup side="right">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

// ---- Main component ----

export function EditorWorkspaceView(props: EditorWorkspaceViewProps) {
  const { threadId, workspaceRoot, projectName, onExitEditorView, onSelectFile } = props;

  // Resolve projectId for DockEditorPane
  const thread = useAppStore(useMemo(() => createThreadSelector(threadId), [threadId]));
  const projectId: ProjectId | null = thread?.projectId ?? null;

  const trafficLightGutterClassName = useDesktopTopBarTrafficLightGutterClassName();

  // Restore persisted state
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

  // Persist state whenever it changes
  useEffect(() => {
    storeEditorWorkspaceViewState(threadId, {
      expandedDirectories: [...expandedDirectories],
      centerMode,
      sidebarVisible,
      chatPaneVisible,
      chatPaneWidth,
    });
  }, [centerMode, sidebarVisible, chatPaneVisible, chatPaneWidth, expandedDirectories, threadId]);

  // Git status for file tree tinting
  const workingTreeDiffQuery = useQuery(
    gitWorkingTreeDiffQueryOptions({ cwd: workspaceRoot, scope: "workingTree" }),
  );
  const statusByPath = useMemo(
    () => buildGitFileStatusMap(workingTreeDiffQuery.data?.patch),
    [workingTreeDiffQuery.data?.patch],
  );

  const openFile = useEditorStore((s) => s.openFile);

  const handleFileClick = useCallback(
    (path: string) => {
      openFile(threadId, path);
      onSelectFile(path);
    },
    [threadId, openFile, onSelectFile],
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
          ...(entry.kind === "file"
            ? [{ id: "reference-in-chat" as const, label: "Reference in chat" }]
            : []),
          ...(hasChanges && entry.kind === "file"
            ? [{ id: "ask-why-changed" as const, label: "Ask why changed" }]
            : []),
          { id: "copy-path" as const, label: "Copy path" },
          { id: "copy-relative-path" as const, label: "Copy relative path" },
          ...(workspaceRoot ? [{ id: "reveal" as const, label: "Reveal in file manager" }] : []),
        ],
        { x: event.clientX, y: event.clientY },
      );
      switch (clicked) {
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
          if (workspaceRoot && api.shell) {
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
    [workspaceRoot, statusByPath, threadId],
  );

  // Activity bar — clicking the active mode collapses the sidebar
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

  const toggleChatPane = useCallback(() => {
    setChatPaneVisible((prev) => !prev);
  }, []);

  // Chat pane resize (pointer + RAF, from right edge dragging left)
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
      else if (event.key === "Home") nextWidth = EDITOR_CHAT_PANE_MIN_WIDTH_PX;
      else if (event.key === "End") nextWidth = EDITOR_CHAT_PANE_MAX_WIDTH_PX;
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

  const filesLabel = centerMode === "file" && sidebarVisible ? "Hide files sidebar" : "Files";
  const diffLabel = centerMode === "diff" && sidebarVisible ? "Hide diff sidebar" : "Diff";

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-background-root)] text-foreground">
      {/* Header */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 px-2 sm:px-3",
          CHAT_SURFACE_HEADER_HEIGHT_CLASS,
          CHAT_SURFACE_HEADER_DIVIDER_CLASS_NAME,
        )}
      >
        <div className={cn("flex min-w-0 flex-1 items-center gap-2", trafficLightGutterClassName)}>
          <span className="truncate text-[13px] font-medium text-foreground">
            {projectName ?? "Workspace"}
          </span>
          <span className="hidden truncate text-[11px] text-muted-foreground/70 sm:inline">
            {workspaceRoot ?? "No workspace"}
          </span>
        </div>
        <ChatHeaderButton
          type="button"
          tone="outline"
          aria-pressed={chatPaneVisible}
          title={chatPaneVisible ? "Hide chat panel" : "Show chat panel"}
          className="gap-1.5"
          onClick={toggleChatPane}
        >
          <PanelRightCloseIcon className="size-3.5" />
          <span className="sr-only">{chatPaneVisible ? "Hide chat panel" : "Show chat panel"}</span>
        </ChatHeaderButton>
        <ChatHeaderButton
          type="button"
          tone="outline"
          title="Switch to chat view"
          className="w-[5.5rem] gap-1.5"
          onClick={onExitEditorView}
        >
          <MessageCircleIcon className="size-3.5" />
          <span className="truncate font-normal">Chat</span>
        </ChatHeaderButton>
      </div>

      {/* Body */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* Activity bar */}
        <nav
          className="flex w-12 shrink-0 flex-col items-center border-r border-border/65 bg-[var(--color-background-surface)]"
          aria-label="Editor activity bar"
        >
          <ActivityBarButton
            label={filesLabel}
            active={centerMode === "file" && sidebarVisible}
            onClick={() => handleActivityBarSelect("file")}
          >
            <FolderIcon className="size-5" />
          </ActivityBarButton>
          <ActivityBarButton
            label={diffLabel}
            active={centerMode === "diff" && sidebarVisible}
            onClick={() => handleActivityBarSelect("diff")}
          >
            <ChangesIcon className="size-5" />
          </ActivityBarButton>
        </nav>

        {/* Content area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Sidebar */}
          {sidebarVisible ? (
            <aside className="flex min-h-[11rem] w-full shrink-0 flex-col border-b border-border/65 bg-[var(--color-background-surface)] lg:h-full lg:w-52 lg:border-b-0 lg:border-r">
              {centerMode === "file" ? (
                <>
                  <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/45 px-2.5">
                    <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground/65">
                      Files
                    </span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto py-1">
                    <WorkspaceFileTree
                      cwd={workspaceRoot}
                      statusByPath={statusByPath}
                      expandedExternally={expandedExternally}
                      onFileClick={handleFileClick}
                      onFileContextMenu={handleFileContextMenu}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/45 px-2.5">
                    <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground/65">
                      Changed files
                    </span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {props.diffPanel ? (
                      <PanelStateMessage density="compact">
                        Select a file from the diff view.
                      </PanelStateMessage>
                    ) : (
                      <PanelStateMessage density="compact">No diff available.</PanelStateMessage>
                    )}
                  </div>
                </>
              )}
            </aside>
          ) : null}

          {/* Center pane */}
          <main className="flex min-h-[16rem] min-w-0 flex-1 border-b border-border/65 lg:h-full lg:border-b-0">
            {/* Diff panel — kept mounted to avoid cold reload when switching modes */}
            {props.diffPanel ? (
              <div className={cn("min-h-0 min-w-0 flex-1", centerMode !== "diff" && "hidden")}>
                {props.diffPanel}
              </div>
            ) : null}
            {centerMode === "file" ? (
              <div className="flex min-h-0 min-w-0 flex-1">
                {workspaceRoot ? (
                  <DockEditorPane hostThreadId={threadId} projectId={projectId} isActive />
                ) : (
                  <PanelStateMessage>No workspace is attached to this chat.</PanelStateMessage>
                )}
              </div>
            ) : null}
          </main>

          {/* Chat pane resize handle */}
          <div
            role="separator"
            aria-label="Resize chat panel"
            aria-orientation="vertical"
            aria-valuemin={EDITOR_CHAT_PANE_MIN_WIDTH_PX}
            aria-valuemax={EDITOR_CHAT_PANE_MAX_WIDTH_PX}
            aria-valuenow={chatPaneWidth}
            tabIndex={0}
            title="Drag to resize chat panel"
            className={cn(
              "group relative z-10 w-0 shrink-0 cursor-col-resize outline-none",
              chatPaneVisible ? "hidden lg:block" : "hidden",
            )}
            onPointerDown={handleResizePointerDown}
            onDoubleClick={handleResizeDoubleClick}
            onKeyDown={handleResizeKeyDown}
          >
            <span
              className="absolute inset-y-0 left-[-3px] w-1.5 cursor-col-resize bg-transparent transition-colors group-hover:bg-[var(--color-background-button-secondary-hover)] group-focus-visible:bg-[var(--color-background-button-secondary-hover)]"
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute inset-y-0 left-0 w-px bg-[var(--app-surface-divider)] transition-colors group-hover:bg-[var(--color-text-accent)] group-focus-visible:bg-[var(--color-text-accent)]"
              aria-hidden="true"
            />
          </div>

          {/* Chat pane — kept mounted so runtime + draft survive toggle */}
          <aside
            className={cn(
              "min-h-[18rem] w-full shrink-0 bg-[var(--color-background-surface)] lg:h-full lg:w-[var(--editor-chat-pane-width)]",
              chatPaneVisible ? "flex" : "hidden",
            )}
            style={
              {
                "--editor-chat-pane-width": `${chatPaneWidth}px`,
              } as CSSProperties
            }
          >
            {props.chatPanel}
          </aside>
        </div>
      </div>
    </div>
  );
}

export default EditorWorkspaceView;
