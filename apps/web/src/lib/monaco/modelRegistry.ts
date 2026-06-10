// FILE: modelRegistry.ts
// Purpose: Owns Monaco text models for open files. Each open file gets a single
//          editable "buffer" model plus the last-known on-disk snapshot, so we can
//          compute dirty state (buffer ≠ disk), save, and detect external changes.
// Layer: Web editor infrastructure
// Depends on: monacoSetup, the workspace readFile/writeFile RPCs (called by callers).

import { ensureMonacoSetup, monaco } from "./monacoSetup";
import { languageForPath } from "./language";

interface ModelEntry {
  /** The editable Monaco model bound to the editor. */
  readonly model: monaco.editor.ITextModel;
  /** Last content known to be on disk (baseline for dirty + conflict checks). */
  diskContent: string;
  /** Reference count across panes/tabs sharing this file. */
  refs: number;
  /** Disposes the content-change listener. */
  dispose: () => void;
}

type DirtyListener = (uri: string, isDirty: boolean) => void;

/**
 * A small, framework-agnostic registry of editable file models keyed by a stable
 * URI (`codewit-file://<cwd>/<relativePath>`). Stores subscribe to dirty changes.
 */
class ModelRegistry {
  private readonly entries = new Map<string, ModelEntry>();
  private readonly dirtyUris = new Set<string>();
  private readonly dirtyListeners = new Set<DirtyListener>();

  private uriFor(cwd: string, relativePath: string): monaco.Uri {
    ensureMonacoSetup();
    // Normalize to a stable, collision-free path. Monaco needs a unique URI per file.
    const safe = `${cwd}/${relativePath}`.replace(/\\/g, "/").replace(/\/+/g, "/");
    return monaco.Uri.parse(`codewit-file://${encodeURI(safe)}`);
  }

  keyFor(cwd: string, relativePath: string): string {
    return this.uriFor(cwd, relativePath).toString();
  }

  /**
   * Get or create the editable model for a file. On first open, seeds both the
   * editable buffer and the disk baseline from `contents`.
   */
  acquire(cwd: string, relativePath: string, contents: string): string {
    ensureMonacoSetup();
    const uri = this.uriFor(cwd, relativePath);
    const key = uri.toString();
    const existing = this.entries.get(key);
    if (existing) {
      existing.refs += 1;
      return key;
    }

    const model =
      monaco.editor.getModel(uri) ??
      monaco.editor.createModel(contents, languageForPath(relativePath), uri);
    if (model.getValue() !== contents) model.setValue(contents);

    const changeSub = model.onDidChangeContent(() => {
      this.recomputeDirty(key);
    });

    this.entries.set(key, {
      model,
      diskContent: contents,
      refs: 1,
      dispose: () => changeSub.dispose(),
    });
    this.recomputeDirty(key);
    return key;
  }

  getModel(key: string): monaco.editor.ITextModel | undefined {
    return this.entries.get(key)?.model;
  }

  // ── Read-only "original" models (the left side of a diff editor) ──
  // Keyed by ref + path so the same HEAD blob is shared across diff tabs. These
  // are never edited, so they only need a model + ref-count (no dirty tracking).
  private readonly originals = new Map<
    string,
    { readonly model: monaco.editor.ITextModel; refs: number }
  >();

  private originalUriFor(cwd: string, relativePath: string, ref: string): monaco.Uri {
    ensureMonacoSetup();
    const safe = `${ref}/${cwd}/${relativePath}`.replace(/\\/g, "/").replace(/\/+/g, "/");
    return monaco.Uri.parse(`codewit-ref://${encodeURI(safe)}`);
  }

  /** Acquire a read-only model holding `contents` (a file's content at a ref). */
  acquireOriginal(cwd: string, relativePath: string, ref: string, contents: string): string {
    ensureMonacoSetup();
    const uri = this.originalUriFor(cwd, relativePath, ref);
    const key = uri.toString();
    const existing = this.originals.get(key);
    if (existing) {
      existing.refs += 1;
      if (existing.model.getValue() !== contents) existing.model.setValue(contents);
      return key;
    }
    const model =
      monaco.editor.getModel(uri) ??
      monaco.editor.createModel(contents, languageForPath(relativePath), uri);
    if (model.getValue() !== contents) model.setValue(contents);
    this.originals.set(key, { model, refs: 1 });
    return key;
  }

  getOriginalModel(key: string): monaco.editor.ITextModel | undefined {
    return this.originals.get(key)?.model;
  }

  releaseOriginal(key: string): void {
    const entry = this.originals.get(key);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    if (!entry.model.isDisposed()) entry.model.dispose();
    this.originals.delete(key);
  }

  isDirty(key: string): boolean {
    return this.dirtyUris.has(key);
  }

  /** Baseline on-disk content (for conflict comparison). */
  getDiskContent(key: string): string | undefined {
    return this.entries.get(key)?.diskContent;
  }

  /** Current editable value. */
  getValue(key: string): string | undefined {
    return this.entries.get(key)?.model.getValue();
  }

  /** Mark the current buffer as saved (disk now matches buffer). */
  markSaved(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.diskContent = entry.model.getValue();
    this.recomputeDirty(key);
  }

  /**
   * Apply an external on-disk change. Returns "reloaded" when the buffer was clean
   * (and got refreshed) or "conflict" when the buffer had unsaved edits that differ.
   */
  applyDiskChange(key: string, nextContent: string): "reloaded" | "conflict" | "noop" {
    const entry = this.entries.get(key);
    if (!entry) return "noop";
    entry.diskContent = nextContent;
    const bufferValue = entry.model.getValue();
    if (bufferValue === nextContent) {
      this.recomputeDirty(key);
      return "noop";
    }
    if (!this.dirtyUris.has(key)) {
      // Clean buffer → safe to refresh in place.
      entry.model.setValue(nextContent);
      this.recomputeDirty(key);
      return "reloaded";
    }
    // Dirty buffer that differs from new disk content → conflict.
    this.recomputeDirty(key);
    return "conflict";
  }

  /** Force the buffer to match disk (used to resolve a conflict by accepting incoming). */
  reloadFromDisk(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.model.setValue(entry.diskContent);
    this.recomputeDirty(key);
  }

  release(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    entry.dispose();
    if (!entry.model.isDisposed()) entry.model.dispose();
    this.entries.delete(key);
    this.dirtyUris.delete(key);
  }

  onDirtyChange(listener: DirtyListener): () => void {
    this.dirtyListeners.add(listener);
    return () => this.dirtyListeners.delete(listener);
  }

  private recomputeDirty(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    const dirty = entry.model.getValue() !== entry.diskContent;
    const wasDirty = this.dirtyUris.has(key);
    if (dirty === wasDirty) return;
    if (dirty) this.dirtyUris.add(key);
    else this.dirtyUris.delete(key);
    for (const listener of this.dirtyListeners) listener(key, dirty);
  }
}

export const modelRegistry = new ModelRegistry();
