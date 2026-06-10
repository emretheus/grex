// FILE: DockEditorPane.tsx
// Purpose: Right-dock "Editor" pane — an editable Monaco editor with one tab per
//          open file. Opens files via the readFile RPC, tracks unsaved (dirty)
//          state via the model registry, and saves with Cmd/Ctrl+S.
// Layer: Chat right-dock UI
// Depends on: monacoSetup, modelRegistry, projects.readFile/writeFile RPCs, editorStore.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore as useAppStore } from "~/store";

import type { ProjectId, ThreadId } from "@t3tools/contracts";
import { readNativeApi } from "~/nativeApi";
import { createProjectSelector, createThreadSelector } from "~/storeSelectors";
import { selectThreadEditorState, useEditorStore } from "~/editorStore";
import { ensureMonacoSetup, monaco } from "~/lib/monaco/monacoSetup";
import { modelRegistry } from "~/lib/monaco/modelRegistry";
import { DiffIcon, XIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
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

export function DockEditorPane({ hostThreadId, projectId, isActive }: DockEditorPaneProps) {
  const thread = useAppStore(useMemo(() => createThreadSelector(hostThreadId), [hostThreadId]));
  const project = useAppStore(useMemo(() => createProjectSelector(projectId), [projectId]));
  const cwd = thread?.worktreePath ?? project?.cwd ?? null;

  const editorState = useEditorStore((s) => selectThreadEditorState(s, hostThreadId));
  const setActive = useEditorStore((s) => s.setActive);
  const closeFile = useEditorStore((s) => s.closeFile);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  // Per-open-file load state (model key once ready).
  const [loadByPath, setLoadByPath] = useState<Record<string, FileLoadState>>({});
  // Dirty set (mirror of modelRegistry) so the tab bar re-renders on edits.
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(() => new Set());

  const activePath = editorState.activePath;
  const activeFile = activePath
    ? editorState.openFiles.find((f) => f.relativePath === activePath)
    : undefined;
  const activeIsDiff = activeFile?.kind === "diff";

  // Mount the single Monaco editor instance for this pane.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const m = ensureMonacoSetup();
    const editor = m.editor.create(container, {
      model: null,
      // `automaticLayout` polls, but it can measure a stale (narrow/hidden) size
      // when the dock pane mounts before its reveal animation settles. We pair it
      // with an explicit ResizeObserver below so the editor always fills the pane.
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      scrollBeyondLastLine: false,
      renderWhitespace: "selection",
      tabSize: 2,
    });
    editorRef.current = editor;

    // Relayout Monaco to the container's real size whenever it changes (pane
    // reveal, dock resize, window resize). Without this the editor renders into a
    // narrow strip when first mounted while the pane is still expanding.
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

  // Force a relayout when this pane becomes active/visible (a kept-mounted pane
  // may have been laid out at zero/stale size while hidden).
  useEffect(() => {
    if (!isActive) return;
    const editor = editorRef.current;
    const el = containerRef.current;
    if (!editor || !el) return;
    // Defer to the next frame so the pane has its final dimensions.
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
    if (!cwd) return;
    for (const file of editorState.openFiles) {
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
      editorState.openFiles.filter((f) => f.kind !== "diff").map((f) => f.relativePath),
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
  }, [cwd, editorState.openFiles, loadByPath]);

  // Swap the editor's model when the active file (or its load state) changes.
  const activeLoad = activePath && !activeIsDiff ? loadByPath[activePath] : undefined;
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (activeLoad?.kind === "ready") {
      const model = modelRegistry.getModel(activeLoad.modelKey);
      if (model && editor.getModel() !== model) {
        editor.setModel(model);
        // Re-measure after attaching a model — the surface may have only just
        // become non-empty/visible.
        const el = containerRef.current;
        if (el) editor.layout({ width: el.clientWidth, height: el.clientHeight });
      }
    } else {
      editor.setModel(null);
    }
  }, [activeLoad]);

  const saveActive = useCallback(async () => {
    if (!cwd || !activePath) return;
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
      // Surface as a no-op for MVP; a toast can be wired later.
    }
  }, [cwd, activePath, loadByPath]);

  // Cmd/Ctrl+S to save the active file (only when this pane is active).
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

  const showOverlay =
    activeLoad?.kind === "loading" ||
    activeLoad?.kind === "too-large" ||
    activeLoad?.kind === "error" ||
    activeLoad === undefined;

  return (
    <div className="flex h-full min-w-0 w-full flex-1 flex-col overflow-hidden bg-[var(--color-background-surface)]">
      {/* Tab bar */}
      <div className="flex h-[34px] shrink-0 items-stretch overflow-x-auto border-b border-[color:var(--color-border-light)]">
        {editorState.openFiles.map((file) => {
          const isDiffTab = file.kind === "diff";
          // File tabs track dirty via loadByPath; diff tabs share the editable
          // modified model, keyed directly in the registry.
          const dirtyKey = isDiffTab
            ? cwd
              ? modelRegistry.keyFor(cwd, file.relativePath)
              : null
            : loadByPath[file.relativePath]?.kind === "ready"
              ? (loadByPath[file.relativePath] as { modelKey: string }).modelKey
              : null;
          const dirty = dirtyKey !== null && dirtyKeys.has(dirtyKey);
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
                onClick={() => setActive(hostThreadId, file.relativePath)}
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
                onClick={() => {
                  closeFile(hostThreadId, file.relativePath);
                }}
              >
                <XIcon className="size-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Editor surface */}
      <div className="relative min-h-0 flex-1">
        {/* The plain-file editor is always mounted (cheap, kept warm); a diff tab
            overlays it with a dedicated diff editor. */}
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
