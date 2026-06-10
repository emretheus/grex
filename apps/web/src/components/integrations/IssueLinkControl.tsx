import type { LinkedIssue, LinkedIssues, ThreadId } from "@t3tools/contracts";
import { MAX_LINKED_ISSUES, dedupeLinkedIssues } from "@t3tools/contracts";
import { useRef, useState } from "react";

import { useComposerDraftStore } from "~/composerDraftStore";
import { readNativeApi } from "~/nativeApi";
import { ExternalLinkIcon, XIcon } from "~/lib/icons";
import { newCommandId } from "~/lib/utils";
import { cn } from "~/lib/utils";
import { toastManager } from "../ui/toast";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { IssueLinkDialog } from "./IssueLinkDialog";
import { ProviderIcon } from "./provider-icons";
import {
  ENVIRONMENT_ROW_CLASS_NAME,
  ENVIRONMENT_ROW_ICON_CLASS_NAME,
  EnvironmentRowBody,
  EnvironmentSectionLabel,
} from "../chat/environment/EnvironmentRow";

// How many chips to render inline before collapsing to a +N badge.
const MAX_INLINE_CHIPS = 2;

interface IssueLinkControlProps {
  threadId: ThreadId;
  linkedIssues: LinkedIssues;
  /** Whether this thread already exists on the server (vs. a draft). */
  hasServerThread: boolean;
  projectPath?: string | undefined;
  repositoryUrl?: string | undefined;
  className?: string;
  /** `toolbar` = compact inline chips row (default); `panel` = Environment panel style rows. */
  variant?: "toolbar" | "panel";
}

/**
 * Composer affordance for linking external issues to a thread.
 * In toolbar mode: inline chips (up to MAX_INLINE_CHIPS) + +N overflow badge + "Link issue" button.
 * In panel mode: full-width EnvironmentRow rows matching the Environment panel grid.
 */
export function IssueLinkControl({
  threadId,
  linkedIssues,
  hasServerThread,
  projectPath,
  repositoryUrl,
  className,
  variant = "toolbar",
}: IssueLinkControlProps) {
  const [open, setOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const lastAddedRef = useRef<string | null>(null);
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const isPanel = variant === "panel";

  const persist = (next: LinkedIssue[]) => {
    if (hasServerThread) {
      const api = readNativeApi();
      void api?.orchestration.dispatchCommand({
        type: "thread.meta.update",
        commandId: newCommandId(),
        threadId,
        linkedIssues: next,
      });
    }
    setDraftThreadContext(threadId, { linkedIssues: next });
  };

  const handleAdd = (issue: LinkedIssue) => {
    const key = `${issue.provider}:${issue.identifier}`;
    const alreadyLinked = linkedIssues.some((i) => `${i.provider}:${i.identifier}` === key);
    if (alreadyLinked) {
      toastManager.add({
        type: "info",
        title: `${issue.identifier} is already linked`,
      });
      return;
    }
    if (linkedIssues.length >= MAX_LINKED_ISSUES) {
      toastManager.add({
        type: "error",
        title: "Issue limit reached",
        description: `You can link up to ${MAX_LINKED_ISSUES} issues per thread.`,
      });
      return;
    }
    const next = dedupeLinkedIssues([...linkedIssues, issue]);
    lastAddedRef.current = key;
    persist(next);
    toastManager.add({
      type: "success",
      title: `Linked ${issue.identifier}`,
      description: issue.title,
    });
  };

  const handleRemove = (issue: LinkedIssue) => {
    const key = `${issue.provider}:${issue.identifier}`;
    const next = linkedIssues.filter((i) => `${i.provider}:${i.identifier}` !== key);
    if (lastAddedRef.current === key) lastAddedRef.current = null;
    persist(next);
    toastManager.add({
      type: "info",
      title: `Unlinked ${issue.identifier}`,
    });
  };

  const openIssue = (issue: LinkedIssue) => {
    if (!issue.url) return;
    const api = readNativeApi();
    void api?.shell.openExternal(issue.url);
  };

  const dialog = (
    <IssueLinkDialog
      open={open}
      onOpenChange={setOpen}
      onSelect={handleAdd}
      linkedIssues={linkedIssues}
      projectPath={projectPath}
      repositoryUrl={repositoryUrl}
    />
  );

  if (isPanel) {
    return (
      <>
        <div className={cn("flex flex-col gap-0.5", className)}>
          <EnvironmentSectionLabel>Linked issues</EnvironmentSectionLabel>
          {linkedIssues.map((issue) => {
            const key = `${issue.provider}:${issue.identifier}`;
            return (
              <div
                key={key}
                className="flex w-full items-center gap-1 rounded-lg px-2 py-1 text-[length:var(--app-font-size-ui,12px)]"
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  <ProviderIcon provider={issue.provider} className="size-3.5" />
                </span>
                <button
                  type="button"
                  onClick={() => openIssue(issue)}
                  disabled={!issue.url}
                  className="min-w-0 flex-1 truncate text-left hover:underline disabled:no-underline"
                  title={issue.url ? `Open ${issue.identifier}` : undefined}
                >
                  <span className="font-medium">{issue.identifier}</span>
                  {issue.title ? (
                    <span className="text-[var(--color-text-foreground-secondary)]">
                      {" "}
                      · {issue.title}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  aria-label={`Unlink ${issue.identifier}`}
                  className="text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5"
                  onClick={() => handleRemove(issue)}
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(ENVIRONMENT_ROW_CLASS_NAME)}
          >
            <EnvironmentRowBody
              icon={<ExternalLinkIcon className={ENVIRONMENT_ROW_ICON_CLASS_NAME} />}
              label={linkedIssues.length === 0 ? "Link issue" : "Add issue"}
            />
          </button>
        </div>
        {dialog}
      </>
    );
  }

  const inlineIssues = linkedIssues.slice(0, MAX_INLINE_CHIPS);
  const overflowIssues = linkedIssues.slice(MAX_INLINE_CHIPS);

  return (
    <>
      <style>{`@keyframes issue-link-flash {
        0% { box-shadow: 0 0 0 0 transparent; }
        15% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent-blue) 45%, transparent); }
        100% { box-shadow: 0 0 0 0 transparent; }
      }`}</style>

      <div className={cn("inline-flex flex-wrap items-center gap-1", className)}>
        {inlineIssues.map((issue) => {
          const key = `${issue.provider}:${issue.identifier}`;
          const isNew = lastAddedRef.current === key;
          return (
            <IssueChip
              key={key}
              issue={issue}
              flash={isNew}
              onOpen={openIssue}
              onRemove={handleRemove}
            />
          );
        })}

        {overflowIssues.length > 0 && (
          <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
            <PopoverTrigger
              className={cn(
                "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[length:var(--app-font-size-ui-xs,10px)] font-medium",
                "border-[color:color-mix(in_srgb,var(--color-accent-blue)_46%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent-blue)_12%,transparent)]",
                "text-[var(--color-text-foreground)] hover:bg-[color-mix(in_srgb,var(--color-accent-blue)_20%,transparent)]",
              )}
              title={`${overflowIssues.length} more linked issue${overflowIssues.length > 1 ? "s" : ""}`}
            >
              +{overflowIssues.length}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-1.5">
              <div className="flex flex-col gap-0.5">
                {overflowIssues.map((issue) => {
                  const key = `${issue.provider}:${issue.identifier}`;
                  return (
                    <div key={key} className="flex items-center gap-1 px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => openIssue(issue)}
                        disabled={!issue.url}
                        className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-[length:var(--app-font-size-ui-xs,10px)] hover:underline disabled:no-underline"
                        title={issue.url ? `Open ${issue.identifier}` : undefined}
                      >
                        <ProviderIcon provider={issue.provider} className="size-3.5 shrink-0" />
                        <span className="min-w-[4.5rem] shrink-0 font-medium">
                          {issue.identifier}
                        </span>
                        <span
                          className="truncate text-[var(--color-text-foreground-secondary)]"
                          title={issue.title}
                        >
                          {issue.title}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Unlink ${issue.identifier}`}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        onClick={() => handleRemove(issue)}
                      >
                        <XIcon className="size-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        )}

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 px-1.5 text-[length:var(--app-font-size-ui-xs,10px)] font-normal text-[var(--color-text-foreground-secondary)] hover:text-[var(--color-text-foreground)]"
          title="Link an issue"
        >
          <ExternalLinkIcon className="size-3.5" />
          {linkedIssues.length === 0 ? "Link issue" : "Add issue"}
        </button>
      </div>

      {dialog}
    </>
  );
}

interface IssueChipProps {
  issue: LinkedIssue;
  flash: boolean;
  onOpen: (issue: LinkedIssue) => void;
  onRemove: (issue: LinkedIssue) => void;
}

function IssueChip({ issue, flash, onOpen, onRemove }: IssueChipProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-48 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[length:var(--app-font-size-ui-xs,10px)]",
        "border-[color:color-mix(in_srgb,var(--color-accent-blue)_46%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent-blue)_12%,transparent)]",
        "text-[var(--color-text-foreground)]",
        flash && "animate-[issue-link-flash_900ms_ease-out]",
      )}
      title={`${issue.identifier} · ${issue.title}`}
    >
      <button
        type="button"
        onClick={() => onOpen(issue)}
        disabled={!issue.url}
        className="inline-flex min-w-0 items-center gap-1 hover:underline disabled:no-underline"
        title={issue.url ? `Open ${issue.identifier}` : undefined}
      >
        <ProviderIcon provider={issue.provider} className="size-3.5 shrink-0" />
        <span className="truncate font-medium">{issue.identifier}</span>
      </button>
      <button
        type="button"
        aria-label={`Unlink ${issue.identifier}`}
        className="text-muted-foreground hover:text-foreground -mr-0.5 shrink-0"
        onClick={() => onRemove(issue)}
      >
        <XIcon className="size-3" />
      </button>
    </span>
  );
}
