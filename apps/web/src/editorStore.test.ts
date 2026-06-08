import type { ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vitest";

function createMemoryStorage(): Storage {
  const storage = new Map<string, string>();
  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size;
    },
  } as Storage;
}

// Persist binds `localStorage` lazily on first write, so install a working
// memory storage BEFORE the store module loads (the import below triggers
// store creation). The jsdom/bun default here is a broken `--localstorage-file`
// stub whose `setItem` throws.
globalThis.localStorage = createMemoryStorage();

const { selectThreadEditorState, useEditorStore } = await import("./editorStore");

const asThreadId = (value: string): ThreadId => value as ThreadId;

describe("selectThreadEditorState", () => {
  beforeEach(() => {
    useEditorStore.setState({ byThreadId: {} });
  });

  it("returns a STABLE reference for threads with no editor state", () => {
    // Regression: returning a fresh empty object here made the zustand
    // useSyncExternalStore snapshot change every render → "Maximum update
    // depth exceeded" when the Editor pane mounted for a fresh thread.
    const state = useEditorStore.getState();
    const a = selectThreadEditorState(state, asThreadId("never-opened"));
    const b = selectThreadEditorState(state, asThreadId("also-never-opened"));
    const c = selectThreadEditorState(state, null);
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(a.openFiles).toHaveLength(0);
    expect(a.activePath).toBeNull();
  });

  it("returns the live entry once a file is opened", () => {
    const threadId = asThreadId("t-open");
    useEditorStore.getState().openFile(threadId, "src/index.ts");
    const entry = selectThreadEditorState(useEditorStore.getState(), threadId);
    expect(entry.openFiles.map((f) => f.relativePath)).toEqual(["src/index.ts"]);
    expect(entry.openFiles[0]?.name).toBe("index.ts");
    expect(entry.activePath).toBe("src/index.ts");
  });
});
