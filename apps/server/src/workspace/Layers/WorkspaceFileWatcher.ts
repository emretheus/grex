import { type FSWatcher, realpathSync, watch as fsWatch } from "node:fs";
import path from "node:path";

import type { WorkspaceFileChangeEvent } from "@t3tools/contracts";
import { Effect, Layer } from "effect";

import { GitStatusBroadcaster } from "../../git/Services/GitStatusBroadcaster";
import { createLogger } from "../../logger";
import {
  WorkspaceFileWatcher,
  type WorkspaceFileWatcherShape,
} from "../Services/WorkspaceFileWatcher";

const logger = createLogger("workspace-file-watcher");

// Coalesce bursts of disk events (editors write many times per save) into a
// single client notification + git refresh.
const DEBOUNCE_MS = 200;

// Directory segments whose changes never matter for the tree / diff / status,
// and which would otherwise flood the watcher (node_modules, build output, the
// git object store). Matched against any segment of the relative path.
const IGNORED_SEGMENTS = new Set([
  ".git",
  "node_modules",
  ".turbo",
  "dist",
  "build",
  ".next",
  ".cache",
  ".DS_Store",
]);

function isIgnoredRelativePath(relativePath: string): boolean {
  if (relativePath.length === 0) return false;
  for (const segment of relativePath.split(/[\\/]+/)) {
    if (IGNORED_SEGMENTS.has(segment)) return true;
  }
  return false;
}

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function normalizeCwd(cwd: string): string {
  try {
    return realpathSync.native(cwd);
  } catch {
    return cwd;
  }
}

type ChangeListener = (event: WorkspaceFileChangeEvent) => void;

interface WatcherEntry {
  readonly cwd: string;
  watcher: FSWatcher;
  readonly listeners: Set<ChangeListener>;
  pendingPaths: Set<string>;
  // `true` once an event arrived that we could not attribute to a path, so the
  // next flush tells clients to refresh broadly.
  pendingBroad: boolean;
  debounceTimer: ReturnType<typeof setTimeout> | null;
}

export const WorkspaceFileWatcherLive = Layer.effect(
  WorkspaceFileWatcher,
  Effect.gen(function* () {
    const gitStatusBroadcaster = yield* GitStatusBroadcaster;
    const runtimeServices = yield* Effect.services<GitStatusBroadcaster>();
    const runFork = Effect.runForkWith(runtimeServices);

    // Keyed by the normalized cwd so symlinked worktrees share one fs.watch,
    // but each entry remembers the original cwd to echo back to subscribers.
    const entries = new Map<string, WatcherEntry>();

    const flush = (entry: WatcherEntry): void => {
      entry.debounceTimer = null;
      const broad = entry.pendingBroad;
      const paths = broad ? [] : [...entry.pendingPaths];
      entry.pendingPaths = new Set();
      entry.pendingBroad = false;
      if (!broad && paths.length === 0) return;

      const event: WorkspaceFileChangeEvent = { cwd: entry.cwd, paths };
      for (const listener of entry.listeners) {
        try {
          listener(event);
        } catch (error) {
          logger.warn("file-change listener threw", { error });
        }
      }

      // Keep git status live without polling. Best-effort: a failed refresh
      // must not tear down the watcher.
      runFork(gitStatusBroadcaster.refreshStatus(entry.cwd).pipe(Effect.ignore));
    };

    const scheduleFlush = (entry: WatcherEntry): void => {
      if (entry.debounceTimer !== null) return;
      entry.debounceTimer = setTimeout(() => flush(entry), DEBOUNCE_MS);
    };

    const startWatcher = (cwd: string, normalizedCwd: string): WatcherEntry => {
      const entry: WatcherEntry = {
        cwd,
        watcher: undefined as unknown as FSWatcher,
        listeners: new Set(),
        pendingPaths: new Set(),
        pendingBroad: false,
        debounceTimer: null,
      };

      const watcher = fsWatch(normalizedCwd, { recursive: true }, (_eventType, filename) => {
        if (filename === null) {
          entry.pendingBroad = true;
          scheduleFlush(entry);
          return;
        }
        const relative = toPosix(filename.toString());
        if (isIgnoredRelativePath(relative)) return;
        entry.pendingPaths.add(relative);
        scheduleFlush(entry);
      });
      watcher.on("error", (error) => {
        logger.warn("fs.watch error", { cwd, error });
      });
      entry.watcher = watcher;
      entries.set(normalizedCwd, entry);
      return entry;
    };

    const stopWatcher = (normalizedCwd: string, entry: WatcherEntry): void => {
      if (entry.debounceTimer !== null) {
        clearTimeout(entry.debounceTimer);
        entry.debounceTimer = null;
      }
      try {
        entry.watcher.close();
      } catch {
        // ignore close races
      }
      entries.delete(normalizedCwd);
    };

    const subscribe: WorkspaceFileWatcherShape["subscribe"] = (cwd, listener) =>
      Effect.sync(() => {
        const normalizedCwd = normalizeCwd(cwd);
        let entry = entries.get(normalizedCwd);
        if (!entry) {
          try {
            entry = startWatcher(cwd, normalizedCwd);
          } catch (error) {
            logger.warn("failed to start fs.watch", { cwd, error });
            // Hand back a no-op unsubscribe rather than failing the
            // subscription; the client keeps its polling fallback.
            return () => {};
          }
        }
        const activeEntry = entry;
        activeEntry.listeners.add(listener);
        return () => {
          activeEntry.listeners.delete(listener);
          if (activeEntry.listeners.size === 0) {
            stopWatcher(normalizedCwd, activeEntry);
          }
        };
      });

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const [normalizedCwd, entry] of entries) {
          stopWatcher(normalizedCwd, entry);
        }
      }),
    );

    return { subscribe } satisfies WorkspaceFileWatcherShape;
  }),
);
