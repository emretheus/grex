// FILE: DockEditorPane.tsx
// Purpose: Right-dock "Editor" pane — an editable Monaco editor with one tab per
//          open file. Supports a horizontal split: a second editor side-by-side
//          separated by a draggable divider.
// Layer: Chat right-dock UI
// Depends on: monacoSetup, modelRegistry, projects.readFile/writeFile RPCs, editorStore.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore as useAppStore } from "~/store";

import type { ProjectId, ThreadId } from "@t3tools/contracts";
import { readNativeApi } from "~/nativeApi";
import { createProjectSelector, createThreadSelector } from "~/storeSelectors";
import {
  selectThreadEditorState,
  selectThreadEditorSplitState,
  useEditorStore,
  type EditorOpenFile,
  type SplitSlotState,
} from "~/editorStore";
import { ensureMonacoSetup, monaco } from "~/lib/monaco/monacoSetup";
import { modelRegistry } from "~/lib/monaco/modelRegistry";
import { Columns2Icon, DiffIcon, XIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { createPanelResizeOverlay, removePanelResizeOverlay } from "~/lib/panelResize";
import { MonacoDiffView } from "./MonacoDiffView";
import { PanelStateMessage } from "./PanelStateMessage";

interface DockEditorPaneProps {
  readonly hostThreadId: ThreadId;
  readonly projectId: ProjectId | null;
  readonly isActive: boolean;
}

type FileLoadState =
  | { kind: "loading" }
  | { kind: "ready"; modelKey: string }
  | { kind: "too-large"; totalSize: number }
  | { kind: "error"; message: string };

// ---- EditorSurface ----
// Inner component: one Monaco editor instance + tab bar + load state.
// loadByPath and setLoadByPath are lifted to the parent (PrimarySurface /
// SplitSurface) so those parents can read load state for Cmd+S saves.

interface EditorSurfaceProps {
  readonly cwd: string;
  readonly openFiles: EditorOpenFile[];
  readonly activePath: string | null;
  readonly isActive: boolean;
  readonly widthStyle: string;
  readonly onSetActive: (relativePath: string) => void;
  readonly onCloseFile: (relativePath: string) => void;
  readonly onFocus: () => void;
  readonly headerActions?: React.ReactNode;
  readonly loadByPath: Record<string, FileLoadState>;
  readonly setLoadByPath: React.Dispatch<React.SetStateAction<Record<string, FileLoadState>>>;
}

function EditorSurface({
  cwd,
  openFiles,
  activePath,
  isActive,
  widthStyle,
  onSetActive,
  onCloseFile,
  onFocus,
  headerActions,
  loadByPath,
  setLoadByPath,
}: EditorSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(() => new Set());

  const activeFile = activePath ? openFiles.find((f) => f.relativePath === activePath) : undefined;
  const activeIsDiff = activeFile?.kind === "diff";

  // Mount the single Monaco editor instance for this surface.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const m = ensureMonacoSetup();
    const editor = m.editor.create(container, {
      model: null,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      scrollBeyondLastLine: false,
      renderWhitespace: "selection",
      tabSize: 2,
    });
    editorRef.current = editor;

    const resizeObserver = new ResizeObserver(() => {
      const el = containerRef.current;
      if (!el) return;
      editor.layout({ width: el.clientWidth, height: el.clientHeight });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  // Force a relayout when this pane becomes active/visible.
  useEffect(() => {
    if (!isActive) return;
    const editor = editorRef.current;
    const el = containerRef.current;
    if (!editor || !el) return;
    const raf = requestAnimationFrame(() => {
      editor.layout({ width: el.clientWidth, height: el.clientHeight });
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive]);

  // Track dirty changes from the registry.
  useEffect(() => {
    return modelRegistry.onDirtyChange((key, isDirty) => {
      setDirtyKeys((prev) => {
        const next = new Set(prev);
        if (isDirty) next.add(key);
        else next.delete(key);
        return next;
      });
    });
  }, []);

  // Load each newly-opened file's model. Diff tabs manage their own two-model
  // pair inside MonacoDiffView, so they're skipped here.
  useEffect(() => {
    for (const file of openFiles) {
      if (file.kind === "diff") continue;
      const path = file.relativePath;
      if (loadByPath[path]) continue;
      setLoadByPath((prev) => ({ ...prev, [path]: { kind: "loading" } }));
      void (async () => {
        try {
          const api = readNativeApi();
          if (!api) {
            setLoadByPath((prev) => ({
              ...prev,
              [path]: { kind: "error", message: "Editor unavailable." },
            }));
            return;
          }
          const result = await api.projects.readFile({ cwd, relativePath: path });
          if (result.truncated) {
            setLoadByPath((prev) => ({
              ...prev,
              [path]: { kind: "too-large", totalSize: result.totalSize },
            }));
            return;
          }
          const modelKey = modelRegistry.acquire(cwd, path, result.contents);
          setLoadByPath((prev) => ({ ...prev, [path]: { kind: "ready", modelKey } }));
        } catch (e) {
          setLoadByPath((prev) => ({
            ...prev,
            [path]: { kind: "error", message: e instanceof Error ? e.message : "Failed to open" },
          }));
        }
      })();
    }
    // Release file models that are no longer open as a *file* tab (closed, or
    // flipped to a diff tab — diff tabs own their own models).
    const openFilePaths = new Set(
      openFiles.filter((f) => f.kind !== "diff").map((f) => f.relativePath),
    );
    for (const [path, state] of Object.entries(loadByPath)) {
      if (!openFilePaths.has(path)) {
        if (state.kind === "ready") modelRegistry.release(state.modelKey);
        setLoadByPath((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
      }
    }
    // loadByPath deliberately excluded — adding it causes an infinite update loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, openFiles]);

  // Swap the editor's model when the active file (or its load state) changes.
  const activeLoad = activePath && !activeIsDiff ? loadByPath[activePath] : undefined;
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (activeLoad?.kind === "ready") {
      const model = modelRegistry.getModel(activeLoad.modelKey);
      if (model && editor.getModel() !== model) {
        editor.setModel(model);
        const el = containerRef.current;
        if (el) editor.layout({ width: el.clientWidth, height: el.clientHeight });
      }
    } else {
      editor.setModel(null);
    }
  }, [activeLoad]);

  const showOverlay =
    activeLoad?.kind === "loading" ||
    activeLoad?.kind === "too-large" ||
    activeLoad?.kind === "error" ||
    activeLoad === undefined;

  return (
    <div
      className="flex h-full min-w-0 flex-col overflow-hidden bg-[var(--color-background-surface)]"
      style={{ width: widthStyle }}
      onFocus={onFocus}
    >
      {/* Tab bar */}
      <div className="flex h-[34px] shrink-0 items-stretch overflow-x-auto border-b border-[color:var(--color-border-light)]">
        {openFiles.map((file) => {
          const isDiffTab = file.kind === "diff";
          const load = loadByPath[file.relativePath];
          const dirtyKey = isDiffTab
            ? cwd
              ? modelRegistry.keyFor(cwd, file.relativePath)
              : null
            : load?.kind === "ready"
              ? load.modelKey
              : null;
          const dirty = dirtyKey !== null && dirtyKeys.has(dirtyKey ?? "");
          const isActiveTab = file.relativePath === activePath;
          return (
            <div
              key={file.relativePath}
              className={cn(
                "group flex shrink-0 items-center gap-1.5 border-r border-[color:var(--color-border-light)] px-3 text-[12px] transition-colors",
                isActiveTab
                  ? "bg-[var(--color-background-elevated-secondary,var(--color-background-surface))] text-[var(--color-text-foreground)]"
                  : "text-[var(--color-text-foreground-secondary)] hover:text-[var(--color-text-foreground)]",
              )}
            >
              {isDiffTab ? (
                <DiffIcon className="size-3.5 shrink-0 text-[var(--color-text-foreground-secondary)]" />
              ) : null}
              <button
                type="button"
                className="max-w-[160px] truncate"
                title={
                  isDiffTab
                    ? `${file.relativePath} (diff vs ${file.diffRef ?? "HEAD"})`
                    : file.relativePath
                }
                onClick={() => onSetActive(file.relativePath)}
              >
                {file.name}
              </button>
              {dirty ? (
                <span
                  className="size-1.5 rounded-full bg-[var(--color-text-foreground)] group-hover:hidden"
                  title="Unsaved changes"
                />
              ) : null}
              <button
                type="button"
                className="hidden size-4 items-center justify-center rounded-sm text-[var(--color-text-foreground-secondary)] hover:bg-[var(--color-background-button-secondary-hover)] hover:text-[var(--color-text-foreground)] group-hover:flex"
                title="Close"
                onClick={() => onCloseFile(file.relativePath)}
              >
                <XIcon className="size-3" />
              </button>
            </div>
          );
        })}
        {/* Slot for extra tab-bar actions (e.g. Split / Close-split buttons). */}
        {headerActions ? (
          <div className="ml-auto flex shrink-0 items-center px-1">{headerActions}</div>
        ) : null}
      </div>

      {/* Monaco editor + overlay */}
      <div className="relative min-h-0 flex-1">
        {/* Plain-file editor is always mounted; a diff tab overlays with a dedicated diff view. */}
        <div ref={containerRef} className={cn("absolute inset-0", activeIsDiff && "invisible")} />
        {activeIsDiff && activeFile && cwd ? (
          <div className="absolute inset-0">
            <MonacoDiffView
              key={`${activeFile.relativePath}:${activeFile.diffRef ?? "HEAD"}`}
              cwd={cwd}
              relativePath={activeFile.relativePath}
              ref={activeFile.diffRef ?? "HEAD"}
              isActive={isActive}
            />
          </div>
        ) : null}
        {!activeIsDiff && showOverlay ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-background-surface)] px-4 text-center text-xs text-[var(--color-text-foreground-secondary)]">
            {activeLoad?.kind === "too-large"
              ? `File too large to open in the editor (${Math.round(activeLoad.totalSize / 1024)} KB).`
              : activeLoad?.kind === "error"
                ? activeLoad.message
                : "Loading…"}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---- SplitDivider ----

interface SplitDividerProps {
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  readonly onWidthPercentChange: (percent: number) => void;
}

function SplitDivider({ containerRef, onWidthPercentChange }: SplitDividerProps) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const overlay = createPanelResizeOverlay();

      const onMouseMove = (ev: MouseEvent) => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const rawPercent = ((ev.clientX - rect.left) / rect.width) * 100;
        // Clamp between 20% and 80% so neither side collapses.
        const clamped = Math.min(80, Math.max(20, rawPercent));
        onWidthPercentChange(clamped);
      };

      const onMouseUp = () => {
        removePanelResizeOverlay(overlay);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [containerRef, onWidthPercentChange],
  );

  return (
    <div
      className="relative z-10 w-[4px] shrink-0 cursor-col-resize bg-[var(--color-border-light)] transition-colors hover:bg-[var(--color-border-default,var(--color-border-light))] active:bg-[var(--color-accent-primary,var(--color-border-light))]"
      onMouseDown={handleMouseDown}
    />
  );
}

// ---- PrimarySurface / SplitSurface ----
// Thin wrappers that own loadByPath state so they can provide a save callback
// up to DockEditorPane for Cmd+S routing.

interface PrimarySurfaceProps {
  readonly cwd: string;
  readonly openFiles: EditorOpenFile[];
  readonly activePath: string | null;
  readonly isActive: boolean;
  readonly widthStyle: string;
  readonly onSetActive: (path: string) => void;
  readonly onCloseFile: (path: string) => void;
  readonly onFocus: () => void;
  readonly headerActions?: React.ReactNode;
  readonly onSaveRef?: (saveFn: () => Promise<void>) => void;
}

function PrimarySurface({
  cwd,
  openFiles,
  activePath,
  isActive,
  widthStyle,
  onSetActive,
  onCloseFile,
  onFocus,
  headerActions,
  onSaveRef,
}: PrimarySurfaceProps) {
  const [loadByPath, setLoadByPath] = useState<Record<string, FileLoadState>>({});

  const saveActive = useCallback(async () => {
    if (!activePath) return;
    const load = loadByPath[activePath];
    if (load?.kind !== "ready") return;
    if (!modelRegistry.isDirty(load.modelKey)) return;
    const value = modelRegistry.getValue(load.modelKey);
    if (value === undefined) return;
    try {
      const api = readNativeApi();
      if (!api) return;
      await api.projects.writeFile({ cwd, relativePath: activePath, contents: value });
      modelRegistry.markSaved(load.modelKey);
    } catch {
      // no-op for MVP
    }
  }, [cwd, activePath, loadByPath]);

  useEffect(() => {
    onSaveRef?.(saveActive);
  }, [onSaveRef, saveActive]);

  return (
    <EditorSurface
      cwd={cwd}
      openFiles={openFiles}
      activePath={activePath}
      isActive={isActive}
      widthStyle={widthStyle}
      onSetActive={onSetActive}
      onCloseFile={onCloseFile}
      onFocus={onFocus}
      headerActions={headerActions}
      loadByPath={loadByPath}
      setLoadByPath={setLoadByPath}
    />
  );
}

interface SplitSurfaceProps {
  readonly cwd: string;
  readonly splitState: SplitSlotState;
  readonly isActive: boolean;
  readonly widthStyle: string;
  readonly onSetActive: (path: string) => void;
  readonly onCloseFile: (path: string) => void;
  readonly onFocus: () => void;
  readonly headerActions?: React.ReactNode;
  readonly onSaveRef?: (saveFn: () => Promise<void>) => void;
}

function SplitSurface({
  cwd,
  splitState,
  isActive,
  widthStyle,
  onSetActive,
  onCloseFile,
  onFocus,
  headerActions,
  onSaveRef,
}: SplitSurfaceProps) {
  const [loadByPath, setLoadByPath] = useState<Record<string, FileLoadState>>({});

  const saveActive = useCallback(async () => {
    const activePath = splitState.activePath;
    if (!activePath) return;
    const load = loadByPath[activePath];
    if (load?.kind !== "ready") return;
    if (!modelRegistry.isDirty(load.modelKey)) return;
    const value = modelRegistry.getValue(load.modelKey);
    if (value === undefined) return;
    try {
      const api = readNativeApi();
      if (!api) return;
      await api.projects.writeFile({ cwd, relativePath: activePath, contents: value });
      modelRegistry.markSaved(load.modelKey);
    } catch {
      // no-op for MVP
    }
  }, [cwd, splitState.activePath, loadByPath]);

  useEffect(() => {
    onSaveRef?.(saveActive);
  }, [onSaveRef, saveActive]);

  return (
    <EditorSurface
      cwd={cwd}
      openFiles={splitState.openFiles}
      activePath={splitState.activePath}
      isActive={isActive}
      widthStyle={widthStyle}
      onSetActive={onSetActive}
      onCloseFile={onCloseFile}
      onFocus={onFocus}
      headerActions={headerActions}
      loadByPath={loadByPath}
      setLoadByPath={setLoadByPath}
    />
  );
}

// ---- DockEditorPane ----

export function DockEditorPane({ hostThreadId, projectId, isActive }: DockEditorPaneProps) {
  const thread = useAppStore(useMemo(() => createThreadSelector(hostThreadId), [hostThreadId]));
  const project = useAppStore(useMemo(() => createProjectSelector(projectId), [projectId]));
  const cwd = thread?.worktreePath ?? project?.cwd ?? null;

  const editorState = useEditorStore((s) => selectThreadEditorState(s, hostThreadId));
  const splitState = useEditorStore((s) => selectThreadEditorSplitState(s, hostThreadId));
  const splitWidthPercent = useEditorStore((s) => s.splitWidthPercent[hostThreadId] ?? 50);

  const setActive = useEditorStore((s) => s.setActive);
  const closeFile = useEditorStore((s) => s.closeFile);
  const openFileSplit = useEditorStore((s) => s.openFileSplit);
  const closeFileSplit = useEditorStore((s) => s.closeFileSplit);
  const setActiveSplit = useEditorStore((s) => s.setActiveSplit);
  const closeSplit = useEditorStore((s) => s.closeSplit);
  const setSplitWidthPercent = useEditorStore((s) => s.setSplitWidthPercent);

  // Track which slot was last focused for Cmd+S routing.
  const [focusedSlot, setFocusedSlot] = useState<"primary" | "split">("primary");

  // Outer container ref: SplitDivider measures it to compute width percent.
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Save callback registered by whichever surface is currently focused.
  const focusedSaveRef = useRef<(() => Promise<void>) | null>(null);

  const saveActive = useCallback(async () => {
    if (focusedSaveRef.current) await focusedSaveRef.current();
  }, []);

  // Cmd/Ctrl+S saves the active file in whichever surface is focused.
  useEffect(() => {
    if (!isActive) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "s") return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      void saveActive();
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [isActive, saveActive]);

  if (!cwd) {
    return <PanelStateMessage>No workspace directory for this thread.</PanelStateMessage>;
  }

  if (editorState.openFiles.length === 0) {
    return <PanelStateMessage>Open a file from the Files tab to start editing.</PanelStateMessage>;
  }

  const primaryWidthStyle = splitState ? `${splitWidthPercent}%` : "100%";
  const splitWidthStyle = `${100 - splitWidthPercent}%`;

  const primaryHeaderActions = !splitState ? (
    <button
      type="button"
      className="flex size-6 items-center justify-center rounded-sm text-[var(--color-text-foreground-secondary)] hover:bg-[var(--color-background-button-secondary-hover)] hover:text-[var(--color-text-foreground)]"
      title="Split editor"
      onClick={() => {
        if (editorState.activePath) openFileSplit(hostThreadId, editorState.activePath);
      }}
    >
      <Columns2Icon className="size-3.5" />
    </button>
  ) : undefined;

  const splitHeaderActions = (
    <button
      type="button"
      className="flex size-6 items-center justify-center rounded-sm text-[var(--color-text-foreground-secondary)] hover:bg-[var(--color-background-button-secondary-hover)] hover:text-[var(--color-text-foreground)]"
      title="Close split"
      onClick={() => closeSplit(hostThreadId)}
    >
      <XIcon className="size-3.5" />
    </button>
  );

  return (
    <div ref={containerRef} className="flex h-full w-full flex-row overflow-hidden">
      <PrimarySurface
        cwd={cwd}
        openFiles={editorState.openFiles}
        activePath={editorState.activePath}
        isActive={isActive && focusedSlot === "primary"}
        widthStyle={primaryWidthStyle}
        onSetActive={(path) => setActive(hostThreadId, path)}
        onCloseFile={(path) => closeFile(hostThreadId, path)}
        onFocus={() => setFocusedSlot("primary")}
        {...(primaryHeaderActions ? { headerActions: primaryHeaderActions } : {})}
        {...(focusedSlot === "primary"
          ? {
              onSaveRef: (fn) => {
                focusedSaveRef.current = fn;
              },
            }
          : {})}
      />
      {splitState ? (
        <>
          <SplitDivider
            containerRef={containerRef}
            onWidthPercentChange={(pct) => setSplitWidthPercent(hostThreadId, pct)}
          />
          <SplitSurface
            cwd={cwd}
            splitState={splitState}
            isActive={isActive && focusedSlot === "split"}
            widthStyle={splitWidthStyle}
            onSetActive={(path) => setActiveSplit(hostThreadId, path)}
            onCloseFile={(path) => closeFileSplit(hostThreadId, path)}
            onFocus={() => setFocusedSlot("split")}
            headerActions={splitHeaderActions}
            {...(focusedSlot === "split"
              ? {
                  onSaveRef: (fn) => {
                    focusedSaveRef.current = fn;
                  },
                }
              : {})}
          />
        </>
      ) : null}
    </div>
  );
}
