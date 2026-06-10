// FILE: MonacoDiffView.tsx
// Purpose: An editable Monaco diff editor for a single file — original (left) is
//          the file's content at a git ref (read-only), modified (right) is the
//          working-tree file (editable, saved with Cmd/Ctrl+S). Mounted by the
//          editor pane when the active tab is a diff.
// Layer: Chat right-dock git/editor UI
// Depends on: monacoSetup, modelRegistry, git.readFileAtRef + projects.readFile/writeFile.

import { useEffect, useMemo, useRef, useState } from "react";

import { readNativeApi } from "~/nativeApi";
import { ensureMonacoSetup, monaco } from "~/lib/monaco/monacoSetup";
import { modelRegistry } from "~/lib/monaco/modelRegistry";
import { PanelStateMessage } from "./PanelStateMessage";

interface MonacoDiffViewProps {
  readonly cwd: string;
  readonly relativePath: string;
  readonly ref: string;
  /** Whether this view is the visible tab (drives relayout + save keybinding). */
  readonly isActive: boolean;
  /** Bump to force a reload (e.g. after an external change). */
  readonly reloadToken?: number;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; originalKey: string; modifiedKey: string }
  | { kind: "too-large" }
  | { kind: "error"; message: string };

export function MonacoDiffView({
  cwd,
  relativePath,
  ref,
  isActive,
  reloadToken = 0,
}: MonacoDiffViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });

  // Mount the diff editor instance once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const m = ensureMonacoSetup();
    const editor = m.editor.createDiffEditor(container, {
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      scrollBeyondLastLine: false,
      renderWhitespace: "selection",
      // The original side stays read-only; the modified side is editable so the
      // user can fix things up directly in the diff.
      originalEditable: false,
      readOnly: false,
      renderSideBySide: true,
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

  // Load both sides whenever the file/ref/reload-token changes.
  useEffect(() => {
    let cancelled = false;
    setLoad({ kind: "loading" });
    void (async () => {
      try {
        const api = readNativeApi();
        if (!api) {
          if (!cancelled) setLoad({ kind: "error", message: "Editor unavailable." });
          return;
        }
        const [original, modified] = await Promise.all([
          api.git.readFileAtRef({ cwd, ref, relativePath }),
          api.projects.readFile({ cwd, relativePath }),
        ]);
        if (cancelled) return;
        if (original.truncated || modified.truncated) {
          setLoad({ kind: "too-large" });
          return;
        }
        const originalKey = modelRegistry.acquireOriginal(
          cwd,
          relativePath,
          ref,
          original.exists ? original.contents : "",
        );
        const modifiedKey = modelRegistry.acquire(cwd, relativePath, modified.contents);
        setLoad({ kind: "ready", originalKey, modifiedKey });
      } catch (e) {
        if (!cancelled)
          setLoad({ kind: "error", message: e instanceof Error ? e.message : "Failed to open" });
      }
    })();
    return () => {
      cancelled = true;
    };
    // reloadToken intentionally in deps to allow forced reloads.
  }, [cwd, relativePath, ref, reloadToken]);

  // Release acquired models when this load is replaced/unmounted.
  const readyKeys = load.kind === "ready" ? load : null;
  useEffect(() => {
    if (!readyKeys) return;
    return () => {
      modelRegistry.releaseOriginal(readyKeys.originalKey);
      modelRegistry.release(readyKeys.modifiedKey);
    };
  }, [readyKeys]);

  // Attach the model pair to the diff editor once both are ready.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !readyKeys) return;
    const originalModel = modelRegistry.getOriginalModel(readyKeys.originalKey);
    const modifiedModel = modelRegistry.getModel(readyKeys.modifiedKey);
    if (!originalModel || !modifiedModel) return;
    editor.setModel({ original: originalModel, modified: modifiedModel });
    const el = containerRef.current;
    if (el) editor.layout({ width: el.clientWidth, height: el.clientHeight });
  }, [readyKeys]);

  // Relayout when this becomes the visible tab.
  useEffect(() => {
    if (!isActive) return;
    const editor = editorRef.current;
    const el = containerRef.current;
    if (!editor || !el) return;
    const raf = requestAnimationFrame(() =>
      editor.layout({ width: el.clientWidth, height: el.clientHeight }),
    );
    return () => cancelAnimationFrame(raf);
  }, [isActive, readyKeys]);

  // Cmd/Ctrl+S saves the modified side (same write path as the file editor).
  const modifiedKey = readyKeys?.modifiedKey ?? null;
  useEffect(() => {
    if (!isActive || !modifiedKey) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "s") return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      void (async () => {
        if (!modelRegistry.isDirty(modifiedKey)) return;
        const value = modelRegistry.getValue(modifiedKey);
        if (value === undefined) return;
        const api = readNativeApi();
        if (!api) return;
        try {
          await api.projects.writeFile({ cwd, relativePath, contents: value });
          modelRegistry.markSaved(modifiedKey);
        } catch {
          // No-op for now; a toast can be wired later.
        }
      })();
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [isActive, modifiedKey, cwd, relativePath]);

  const overlay = useMemo(() => {
    if (load.kind === "loading") return "Loading diff…";
    if (load.kind === "too-large") return "File too large to diff in the editor.";
    if (load.kind === "error") return load.message;
    return null;
  }, [load]);

  return (
    <div className="relative h-full min-h-0 w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {overlay ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-background-surface)] px-4 text-center text-xs text-[var(--color-text-foreground-secondary)]">
          <PanelStateMessage density="compact">{overlay}</PanelStateMessage>
        </div>
      ) : null}
    </div>
  );
}
