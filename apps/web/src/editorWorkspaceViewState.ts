// FILE: editorWorkspaceViewState.ts
// Purpose: Persists per-thread editor-workspace UI preferences (expanded
//          explorer directories, file/diff center mode, sidebar visibility,
//          chat-pane width) so re-entering the editor view restores the layout.
//          Tab/active-file/split/dirty state lives in editorStore + modelRegistry;
//          this store only holds the workspace-shell chrome preferences.
// Layer: Web UI state persistence

const EDITOR_WORKSPACE_VIEW_STATE_STORAGE_KEY = "codewit:editor-workspace-view-state:v1";
const MAX_PERSISTED_THREADS = 50;

export type EditorCenterMode = "file" | "diff";

export const EDITOR_CHAT_PANE_MIN_WIDTH_PX = 320;
export const EDITOR_CHAT_PANE_MAX_WIDTH_PX = 640;
export const EDITOR_CHAT_PANE_DEFAULT_WIDTH_PX = 384;

export interface EditorWorkspaceViewStateSnapshot {
  expandedDirectories: ReadonlyArray<string>;
  centerMode: EditorCenterMode;
  sidebarVisible: boolean;
  chatPaneVisible: boolean;
  chatPaneWidth: number;
}

interface PersistedEditorWorkspaceViewState extends EditorWorkspaceViewStateSnapshot {
  updatedAt: number;
}

type PersistedMap = Record<string, PersistedEditorWorkspaceViewState>;

export function defaultEditorWorkspaceViewState(): EditorWorkspaceViewStateSnapshot {
  return {
    expandedDirectories: [],
    centerMode: "file",
    sidebarVisible: true,
    chatPaneVisible: true,
    chatPaneWidth: EDITOR_CHAT_PANE_DEFAULT_WIDTH_PX,
  };
}

function clampChatPaneWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return EDITOR_CHAT_PANE_DEFAULT_WIDTH_PX;
  }
  return Math.min(EDITOR_CHAT_PANE_MAX_WIDTH_PX, Math.max(EDITOR_CHAT_PANE_MIN_WIDTH_PX, value));
}

function readPersistedMap(): PersistedMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(EDITOR_WORKSPACE_VIEW_STATE_STORAGE_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as PersistedMap;
  } catch {
    return {};
  }
}

export function readEditorWorkspaceViewState(
  threadId: string,
): EditorWorkspaceViewStateSnapshot | null {
  const entry = readPersistedMap()[threadId];
  if (!entry) {
    return null;
  }
  return {
    expandedDirectories: Array.isArray(entry.expandedDirectories)
      ? entry.expandedDirectories.filter((path): path is string => typeof path === "string")
      : [],
    centerMode: entry.centerMode === "diff" ? "diff" : "file",
    sidebarVisible: entry.sidebarVisible !== false,
    chatPaneVisible: entry.chatPaneVisible !== false,
    chatPaneWidth: clampChatPaneWidth(entry.chatPaneWidth),
  };
}

export function storeEditorWorkspaceViewState(
  threadId: string,
  snapshot: EditorWorkspaceViewStateSnapshot,
): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const map = readPersistedMap();
    map[threadId] = {
      ...snapshot,
      chatPaneWidth: clampChatPaneWidth(snapshot.chatPaneWidth),
      updatedAt: Date.now(),
    };
    const entries = Object.entries(map);
    if (entries.length > MAX_PERSISTED_THREADS) {
      entries
        .toSorted((left, right) => (left[1]?.updatedAt ?? 0) - (right[1]?.updatedAt ?? 0))
        .slice(0, entries.length - MAX_PERSISTED_THREADS)
        .forEach(([staleThreadId]) => {
          delete map[staleThreadId];
        });
    }
    window.localStorage.setItem(EDITOR_WORKSPACE_VIEW_STATE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Best-effort preference persistence only.
  }
}
