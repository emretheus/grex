import type { LinkedIssue, ThreadId } from "@t3tools/contracts";
import { useState } from "react";

import { useComposerDraftStore } from "~/composerDraftStore";
import { readNativeApi } from "~/nativeApi";
import { ExternalLinkIcon, XIcon } from "~/lib/icons";
import { newCommandId } from "~/lib/utils";
import { cn } from "~/lib/utils";
import { IssueLinkDialog } from "./IssueLinkDialog";
import { ProviderIcon } from "./provider-icons";

interface IssueLinkControlProps {
  threadId: ThreadId;
  linkedIssue: LinkedIssue | null;
  /** Whether this thread already exists on the server (vs. a draft). */
  hasServerThread: boolean;
  projectPath?: string | undefined;
  repositoryUrl?: string | undefined;
  className?: string;
}

/**
 * Compact composer affordance for linking an external issue to a thread.
 * Shows the linked issue as a removable chip, or a "Link issue" button that
 * opens the issue selector. Selection persists to the draft so it rides along
 * into the thread.create command; for an already-created thread it updates the
 * thread metadata via thread.meta.update.
 */
export function IssueLinkControl({
  threadId,
  linkedIssue,
  hasServerThread,
  projectPath,
  repositoryUrl,
  className,
}: IssueLinkControlProps) {
  const [open, setOpen] = useState(false);
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);

  const persist = (issue: LinkedIssue | null) => {
    if (hasServerThread) {
      const api = readNativeApi();
      void api?.orchestration.dispatchCommand({
        type: "thread.meta.update",
        commandId: newCommandId(),
        threadId,
        linkedIssue: issue,
      });
    }
    // Keep the draft in sync either way so the chip stays correct before the
    // server round-trip lands.
    setDraftThreadContext(threadId, { linkedIssue: issue });
  };

  if (linkedIssue) {
    return (
      <span
        className={cn(
          "border-border/60 inline-flex max-w-48 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[length:var(--app-font-size-ui-xs,10px)]",
          className,
        )}
        title={`${linkedIssue.identifier} · ${linkedIssue.title}`}
      >
        <ProviderIcon provider={linkedIssue.provider} className="size-3.5 shrink-0" />
        <span className="truncate font-medium">{linkedIssue.identifier}</span>
        <button
          type="button"
          aria-label="Unlink issue"
          className="text-muted-foreground hover:text-foreground -mr-0.5 shrink-0"
          onClick={() => persist(null)}
        >
          <XIcon className="size-3" />
        </button>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 px-1.5 text-[length:var(--app-font-size-ui-xs,10px)] font-normal text-[var(--color-text-foreground-secondary)] hover:text-[var(--color-text-foreground)]",
          className,
        )}
      >
        <ExternalLinkIcon className="size-3.5" />
        Link issue
      </button>
      <IssueLinkDialog
        open={open}
        onOpenChange={setOpen}
        onSelect={persist}
        projectPath={projectPath}
        repositoryUrl={repositoryUrl}
      />
    </>
  );
}
