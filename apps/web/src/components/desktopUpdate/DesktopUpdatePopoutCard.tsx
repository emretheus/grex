// FILE: desktopUpdate/DesktopUpdatePopoutCard.tsx
// Purpose: Bottom-left "update available" popout card — the pre-update sibling of
// WhatsNewPopoutCard (which shows post-update). Replaces the previous bottom-right
// toast so the "a new Codewit is ready" moment gets a polished, branded surface
// instead of a transient notification.
// Layer: overlay — rendered once from the root route.

import type { DesktopUpdateState } from "@t3tools/contracts";

import { DownloadIcon, RocketIcon, XIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { CodewitLogo } from "~/components/CodewitLogo";
import { Spinner } from "~/components/ui/spinner";

export interface DesktopUpdatePopoutCardProps {
  readonly state: DesktopUpdateState;
  readonly action: "download" | "install";
  readonly isBusy: boolean;
  readonly onAction: () => void;
  readonly onDismiss: () => void;
  readonly className?: string;
}

/**
 * A small attention card pinned to the bottom-left, matching WhatsNewPopoutCard.
 * The primary button downloads the update (when available) or restarts to install
 * it (when downloaded). The ✕ dismisses the card for this version only.
 */
export function DesktopUpdatePopoutCard({
  state,
  action,
  isBusy,
  onAction,
  onDismiss,
  className,
}: DesktopUpdatePopoutCardProps) {
  const version = state.downloadedVersion ?? state.availableVersion ?? null;
  const isInstall = action === "install";

  const eyebrow = isInstall ? "Ready to install" : "Update available";
  const title = version ? `Codewit ${version}` : "A new version of Codewit";
  const blurb = isInstall
    ? "Restart to finish updating."
    : "Download it in the background — no interruption.";
  const actionLabel = isBusy
    ? isInstall
      ? "Restarting…"
      : "Downloading…"
    : isInstall
      ? "Restart & install"
      : "Download";
  const ActionIcon = isInstall ? RocketIcon : DownloadIcon;

  return (
    <div
      className={cn(
        "fixed bottom-3 left-3 z-50 w-56 max-w-[calc(100vw-1.5rem)] select-none",
        className,
      )}
      style={{ animationName: "desktop-update-popout-in", animationDuration: "200ms" }}
    >
      <style>{`@keyframes desktop-update-popout-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}`}</style>
      <div
        className={cn(
          "relative flex flex-col overflow-hidden rounded-xl",
          "border border-white/[0.08] bg-popover/90 text-popover-foreground shadow-xl backdrop-blur-xl",
        )}
      >
        <button
          type="button"
          aria-label="Dismiss update notification"
          onClick={onDismiss}
          className={cn(
            "absolute end-1.5 top-1.5 z-10 inline-flex size-6 items-center justify-center rounded-full",
            "text-muted-foreground/80 transition-colors",
            "hover:bg-[var(--sidebar-accent)] hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          )}
        >
          <XIcon className="size-3.5" />
        </button>

        {/* Branded hero band, matching the What's New card. */}
        <div className="relative h-20 w-full overflow-hidden">
          <div
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center bg-[radial-gradient(120%_140%_at_10%_0%,color-mix(in_srgb,var(--color-primary)_38%,transparent)_0%,transparent_60%),radial-gradient(100%_120%_at_100%_100%,color-mix(in_srgb,var(--color-primary)_22%,transparent)_0%,transparent_70%)]"
          >
            <CodewitLogo aria-hidden className="size-8 text-foreground" />
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent to-popover/90"
          />
        </div>

        <div className="flex flex-col gap-0.5 px-3 pb-3 pt-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-primary">{eyebrow}</p>
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{blurb}</p>

          <button
            type="button"
            onClick={onAction}
            disabled={isBusy}
            className={cn(
              "mt-2.5 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium",
              "bg-primary text-primary-foreground transition-colors",
              "hover:bg-primary/90 disabled:opacity-70",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
          >
            {isBusy ? <Spinner className="size-3.5" /> : <ActionIcon className="size-3.5" />}
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
