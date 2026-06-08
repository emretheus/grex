// FILE: editorStore.ts
// Purpose: Per-thread state for the in-app code editor — which files are open as
//          tabs and which tab is active. Dirty state lives in the Monaco
//          modelRegistry; this store only tracks tab identity/order/active so the
//          UI can render the tab bar and restore open files across reloads.
// Layer: Web editor state

import type { ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface EditorOpenFile {
  /** Worktree-relative path, e.g. "src/index.ts". */
  readonly relativePath: string;
  /** Display name (basename). */
  readonly name: string;
}

interface ThreadEditorState {
  openFiles: EditorOpenFile[];
  activePath: string | null;
}

interface EditorStoreState {
  byThreadId: Record<string, ThreadEditorState>;
  openFile: (threadId: ThreadId, relativePath: string) => void;
  closeFile: (threadId: ThreadId, relativePath: string) => void;
  setActive: (threadId: ThreadId, relativePath: string) => void;
  reorderFiles: (threadId: ThreadId, fromIndex: number, toIndex: number) => void;
}

const EDITOR_STATE_STORAGE_KEY = "codewit:editor-state:v1";

function basename(relativePath: string): string {
  return relativePath.split("/").pop() ?? relativePath;
}

function emptyState(): ThreadEditorState {
  return { openFiles: [], activePath: null };
}

// A single stable empty value so the selector returns the SAME reference for
// threads with no editor state yet. Returning a fresh object would make the
// zustand `useSyncExternalStore` snapshot change on every render and trigger an
// infinite "Maximum update depth exceeded" loop.
const EMPTY_OPEN_FILES: readonly EditorOpenFile[] = [];
const EMPTY_THREAD_EDITOR_STATE: ThreadEditorState = {
  openFiles: EMPTY_OPEN_FILES as EditorOpenFile[],
  activePath: null,
};

export const useEditorStore = create<EditorStoreState>()(
  persist(
    (set) => ({
      byThreadId: {},

      openFile: (threadId, relativePath) =>
        set((state) => {
          const current = state.byThreadId[threadId] ?? emptyState();
          const alreadyOpen = current.openFiles.some((f) => f.relativePath === relativePath);
          const openFiles = alreadyOpen
            ? current.openFiles
            : [...current.openFiles, { relativePath, name: basename(relativePath) }];
          return {
            byThreadId: {
              ...state.byThreadId,
              [threadId]: { openFiles, activePath: relativePath },
            },
          };
        }),

      closeFile: (threadId, relativePath) =>
        set((state) => {
          const current = state.byThreadId[threadId];
          if (!current) return state;
          const idx = current.openFiles.findIndex((f) => f.relativePath === relativePath);
          if (idx === -1) return state;
          const openFiles = current.openFiles.filter((f) => f.relativePath !== relativePath);
          let activePath = current.activePath;
          if (activePath === relativePath) {
            // Activate the neighbor (prefer the one to the left).
            const next = openFiles[idx - 1] ?? openFiles[idx] ?? null;
            activePath = next?.relativePath ?? null;
          }
          return {
            byThreadId: {
              ...state.byThreadId,
              [threadId]: { openFiles, activePath },
            },
          };
        }),

      setActive: (threadId, relativePath) =>
        set((state) => {
          const current = state.byThreadId[threadId];
          if (!current) return state;
          if (!current.openFiles.some((f) => f.relativePath === relativePath)) return state;
          return {
            byThreadId: {
              ...state.byThreadId,
              [threadId]: { ...current, activePath: relativePath },
            },
          };
        }),

      reorderFiles: (threadId, fromIndex, toIndex) =>
        set((state) => {
          const current = state.byThreadId[threadId];
          if (!current) return state;
          const openFiles = [...current.openFiles];
          if (
            fromIndex < 0 ||
            fromIndex >= openFiles.length ||
            toIndex < 0 ||
            toIndex >= openFiles.length
          ) {
            return state;
          }
          const [moved] = openFiles.splice(fromIndex, 1);
          if (!moved) return state;
          openFiles.splice(toIndex, 0, moved);
          return {
            byThreadId: { ...state.byThreadId, [threadId]: { ...current, openFiles } },
          };
        }),
    }),
    {
      name: EDITOR_STATE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ byThreadId: state.byThreadId }),
    },
  ),
);

export function selectThreadEditorState(
  state: EditorStoreState,
  threadId: ThreadId | null | undefined,
): ThreadEditorState {
  if (!threadId) return EMPTY_THREAD_EDITOR_STATE;
  return state.byThreadId[threadId] ?? EMPTY_THREAD_EDITOR_STATE;
}
