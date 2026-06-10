// FILE: editorStore.ts
// Purpose: Per-thread state for the in-app code editor — which files are open as
//          tabs and which tab is active. Dirty state lives in the Monaco
//          modelRegistry; this store only tracks tab identity/order/active so the
//          UI can render the tab bar and restore open files across reloads.
// Layer: Web editor state

import type { ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** A tab is either a plain editable file or a diff against a git ref. */
export type EditorTabKind = "file" | "diff";

export interface EditorOpenFile {
  /** Worktree-relative path, e.g. "src/index.ts". */
  readonly relativePath: string;
  /** Display name (basename). */
  readonly name: string;
  /** How the tab renders. Absent means "file" (back-compat with persisted state). */
  readonly kind?: EditorTabKind;
  /** For diff tabs: the git ref for the original (left) side, e.g. "HEAD". */
  readonly diffRef?: string;
}

export interface SplitSlotState {
  openFiles: EditorOpenFile[];
  activePath: string | null;
}

interface ThreadEditorState {
  openFiles: EditorOpenFile[];
  activePath: string | null;
  // null = no split; populated when the user clicks "Split"
  split: SplitSlotState | null;
}

interface EditorStoreState {
  byThreadId: Record<string, ThreadEditorState>;
  // Keyed by threadId; default 50 when absent. Session-only (not persisted).
  splitWidthPercent: Record<string, number>;
  openFile: (threadId: ThreadId, relativePath: string) => void;
  openDiff: (threadId: ThreadId, relativePath: string, ref?: string) => void;
  closeFile: (threadId: ThreadId, relativePath: string) => void;
  setActive: (threadId: ThreadId, relativePath: string) => void;
  reorderFiles: (threadId: ThreadId, fromIndex: number, toIndex: number) => void;
  openFileSplit: (threadId: ThreadId, relativePath: string) => void;
  closeFileSplit: (threadId: ThreadId, relativePath: string) => void;
  setActiveSplit: (threadId: ThreadId, relativePath: string) => void;
  closeSplit: (threadId: ThreadId) => void;
  setSplitWidthPercent: (threadId: ThreadId, percent: number) => void;
}

const EDITOR_STATE_STORAGE_KEY = "codewit:editor-state:v1";

function basename(relativePath: string): string {
  return relativePath.split("/").pop() ?? relativePath;
}

function emptyState(): ThreadEditorState {
  return { openFiles: [], activePath: null, split: null };
}

// A single stable empty value so the selector returns the SAME reference for
// threads with no editor state yet. Returning a fresh object would make the
// zustand `useSyncExternalStore` snapshot change on every render and trigger an
// infinite "Maximum update depth exceeded" loop.
const EMPTY_OPEN_FILES: readonly EditorOpenFile[] = [];
const EMPTY_THREAD_EDITOR_STATE: ThreadEditorState = {
  openFiles: EMPTY_OPEN_FILES as EditorOpenFile[],
  activePath: null,
  split: null,
};

export const useEditorStore = create<EditorStoreState>()(
  persist(
    (set) => ({
      byThreadId: {},
      splitWidthPercent: {},

      openFile: (threadId, relativePath) =>
        set((state) => {
          const current = state.byThreadId[threadId] ?? emptyState();
          const existing = current.openFiles.find((f) => f.relativePath === relativePath);
          const openFiles = existing
            ? // Re-opening as a plain file flips an existing diff tab back to file mode.
              current.openFiles.map((f) =>
                f.relativePath === relativePath
                  ? { relativePath, name: f.name, kind: "file" as const }
                  : f,
              )
            : [
                ...current.openFiles,
                { relativePath, name: basename(relativePath), kind: "file" as const },
              ];
          return {
            byThreadId: {
              ...state.byThreadId,
              [threadId]: { ...current, openFiles, activePath: relativePath },
            },
          };
        }),

      openDiff: (threadId, relativePath, ref = "HEAD") =>
        set((state) => {
          const current = state.byThreadId[threadId] ?? emptyState();
          const existing = current.openFiles.find((f) => f.relativePath === relativePath);
          const openFiles = existing
            ? current.openFiles.map((f) =>
                f.relativePath === relativePath
                  ? { relativePath, name: f.name, kind: "diff" as const, diffRef: ref }
                  : f,
              )
            : [
                ...current.openFiles,
                { relativePath, name: basename(relativePath), kind: "diff" as const, diffRef: ref },
              ];
          return {
            byThreadId: {
              ...state.byThreadId,
              [threadId]: { ...current, openFiles, activePath: relativePath },
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
              [threadId]: { ...current, openFiles, activePath },
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

      openFileSplit: (threadId, relativePath) =>
        set((state) => {
          const current = state.byThreadId[threadId] ?? emptyState();
          const prevSplit = current.split ?? { openFiles: [], activePath: null };
          const alreadyOpen = prevSplit.openFiles.some((f) => f.relativePath === relativePath);
          const splitOpenFiles = alreadyOpen
            ? prevSplit.openFiles
            : [...prevSplit.openFiles, { relativePath, name: basename(relativePath) }];
          return {
            byThreadId: {
              ...state.byThreadId,
              [threadId]: {
                ...current,
                split: { openFiles: splitOpenFiles, activePath: relativePath },
              },
            },
          };
        }),

      closeFileSplit: (threadId, relativePath) =>
        set((state) => {
          const current = state.byThreadId[threadId];
          if (!current?.split) return state;
          const idx = current.split.openFiles.findIndex((f) => f.relativePath === relativePath);
          if (idx === -1) return state;
          const splitOpenFiles = current.split.openFiles.filter(
            (f) => f.relativePath !== relativePath,
          );
          if (splitOpenFiles.length === 0) {
            // No files left — close the split entirely.
            return {
              byThreadId: {
                ...state.byThreadId,
                [threadId]: { ...current, split: null },
              },
            };
          }
          let splitActivePath = current.split.activePath;
          if (splitActivePath === relativePath) {
            const next = splitOpenFiles[idx - 1] ?? splitOpenFiles[idx] ?? null;
            splitActivePath = next?.relativePath ?? null;
          }
          return {
            byThreadId: {
              ...state.byThreadId,
              [threadId]: {
                ...current,
                split: { openFiles: splitOpenFiles, activePath: splitActivePath },
              },
            },
          };
        }),

      setActiveSplit: (threadId, relativePath) =>
        set((state) => {
          const current = state.byThreadId[threadId];
          if (!current?.split) return state;
          if (!current.split.openFiles.some((f) => f.relativePath === relativePath)) return state;
          return {
            byThreadId: {
              ...state.byThreadId,
              [threadId]: {
                ...current,
                split: { ...current.split, activePath: relativePath },
              },
            },
          };
        }),

      closeSplit: (threadId) =>
        set((state) => {
          const current = state.byThreadId[threadId];
          if (!current) return state;
          return {
            byThreadId: {
              ...state.byThreadId,
              [threadId]: { ...current, split: null },
            },
          };
        }),

      setSplitWidthPercent: (threadId, percent) =>
        set((state) => ({
          splitWidthPercent: { ...state.splitWidthPercent, [threadId]: percent },
        })),
    }),
    {
      name: EDITOR_STATE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Only persist tab state — split layout is session-only.
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

export function selectThreadEditorSplitState(
  state: EditorStoreState,
  threadId: ThreadId | null | undefined,
): SplitSlotState | null {
  if (!threadId) return null;
  return state.byThreadId[threadId]?.split ?? null;
}
