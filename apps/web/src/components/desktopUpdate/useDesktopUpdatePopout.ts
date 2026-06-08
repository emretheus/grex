// FILE: desktopUpdate/useDesktopUpdatePopout.ts
// Purpose: Drives the bottom-left "update available" popout card — subscribes to
// the desktop updater state, gates visibility to the actionable states, and
// exposes download/install actions. Mirrors useWhatsNew's dismiss-per-version
// persistence so a dismissed update never nags again for the same version.
// Layer: Web UI state hook (desktop-only; a no-op in the browser build).

import type { DesktopUpdateState } from "@t3tools/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  desktopUpdateOfferedVersion,
  resolveDesktopUpdateButtonAction,
  shouldShowDesktopUpdatePopout,
} from "../desktopUpdate.logic";

const DISMISS_STORAGE_KEY = "codewit:update-popout-dismissed:v1";

// The version a dismiss applies to, so a newer release re-surfaces the card.
function readDismissedVersion(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeDismissedVersion(version: string | null): void {
  try {
    if (version) {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, version);
    } else {
      window.localStorage.removeItem(DISMISS_STORAGE_KEY);
    }
  } catch {
    // Best-effort; a storage failure just means the card may reappear.
  }
}

export interface DesktopUpdatePopout {
  readonly state: DesktopUpdateState | null;
  readonly isVisible: boolean;
  /** "download" while a new version is available, "install" once it's downloaded. */
  readonly action: "download" | "install";
  readonly isBusy: boolean;
  readonly download: () => void;
  readonly install: () => void;
  readonly dismiss: () => void;
}

export function useDesktopUpdatePopout(): DesktopUpdatePopout {
  const [state, setState] = useState<DesktopUpdateState | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    readDismissedVersion(),
  );
  const [isBusy, setIsBusy] = useState(false);

  // Subscribe to updater state pushed from the Electron main process.
  useEffect(() => {
    const bridge = window.desktopBridge;
    if (!bridge?.onUpdateState) return;
    let disposed = false;
    const unsubscribe = bridge.onUpdateState((next) => {
      if (!disposed) setState(next);
    });
    void bridge.getUpdateState?.().then((initial) => {
      if (!disposed) setState(initial);
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const action = useMemo<"download" | "install">(() => {
    if (!state) return "download";
    return resolveDesktopUpdateButtonAction(state) === "install" ? "install" : "download";
  }, [state]);

  const isVisible = useMemo(
    () => shouldShowDesktopUpdatePopout(state, dismissedVersion),
    [state, dismissedVersion],
  );

  // A freshly offered version clears any stale dismissal so the card returns.
  const lastSeenVersionRef = useRef<string | null>(null);
  useEffect(() => {
    const version = desktopUpdateOfferedVersion(state);
    if (version && version !== lastSeenVersionRef.current) {
      lastSeenVersionRef.current = version;
      if (dismissedVersion && dismissedVersion !== version) {
        setDismissedVersion(null);
        writeDismissedVersion(null);
      }
    }
  }, [state, dismissedVersion]);

  const download = useCallback(() => {
    const bridge = window.desktopBridge;
    if (!bridge?.downloadUpdate) return;
    setIsBusy(true);
    void bridge
      .downloadUpdate()
      .then((result) => setState(result.state))
      .finally(() => setIsBusy(false));
  }, []);

  const install = useCallback(() => {
    const bridge = window.desktopBridge;
    if (!bridge?.installUpdate) return;
    setIsBusy(true);
    void bridge
      .installUpdate()
      .then((result) => setState(result.state))
      .finally(() => setIsBusy(false));
  }, []);

  const dismiss = useCallback(() => {
    const version = desktopUpdateOfferedVersion(state);
    setDismissedVersion(version);
    writeDismissedVersion(version);
  }, [state]);

  return { state, isVisible, action, isBusy, download, install, dismiss };
}
