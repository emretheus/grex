import type { LinkedIssue } from "@t3tools/contracts";
import { ISSUE_PROVIDER_META } from "@t3tools/shared/integrations";

import { useIssueSearch } from "~/lib/useIssueSearch";
import { cn } from "~/lib/utils";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { ProviderIcon } from "./provider-icons";

interface IssueLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (issue: LinkedIssue) => void;
  projectPath?: string | undefined;
  repositoryUrl?: string | undefined;
}

export function IssueLinkDialog({
  open,
  onOpenChange,
  onSelect,
  projectPath,
  repositoryUrl,
}: IssueLinkDialogProps) {
  const {
    connectedProviders,
    hasAnyIntegration,
    provider,
    setProvider,
    searchTerm,
    setSearchTerm,
    issues,
    isLoading,
    error,
  } = useIssueSearch({ projectPath, repositoryUrl, enabled: open });

  const handleSelect = (issue: LinkedIssue) => {
    onSelect(issue);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg gap-0 p-0">
        <DialogHeader className="gap-1 p-4 pr-12">
          <DialogTitle className="text-base">Link an issue</DialogTitle>
          <DialogDescription className="text-xs">
            Attach an external issue to this thread.
          </DialogDescription>
        </DialogHeader>

        {!hasAnyIntegration ? (
          <DialogPanel className="p-4">
            <p className="text-muted-foreground text-sm">
              No issue trackers are connected. Connect one in Settings → Integrations to link
              issues.
            </p>
          </DialogPanel>
        ) : (
          <>
            <div className="border-border/60 flex items-center gap-2 border-y px-4 py-2">
              {connectedProviders.length > 1 ? (
                <div className="flex shrink-0 items-center gap-1">
                  {connectedProviders.map((candidate) => (
                    <button
                      key={candidate}
                      type="button"
                      onClick={() => setProvider(candidate)}
                      aria-pressed={candidate === provider}
                      title={ISSUE_PROVIDER_META[candidate].displayName}
                      className={cn(
                        "rounded-md p-1 transition-opacity",
                        candidate === provider
                          ? "bg-muted opacity-100"
                          : "opacity-50 hover:opacity-80",
                      )}
                    >
                      <ProviderIcon provider={candidate} className="size-4" />
                    </button>
                  ))}
                </div>
              ) : provider ? (
                <ProviderIcon provider={provider} className="size-4 shrink-0" />
              ) : null}
              <Input
                autoFocus
                placeholder={
                  provider
                    ? `Search ${ISSUE_PROVIDER_META[provider].displayName} issues…`
                    : "Search…"
                }
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>

            <DialogPanel className="max-h-[min(50vh,420px)] p-2">
              {isLoading ? (
                <div className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
                  <Spinner className="size-4" /> Loading…
                </div>
              ) : error ? (
                <p className="text-destructive px-2 py-6 text-center text-sm">{error}</p>
              ) : issues.length === 0 ? (
                <p className="text-muted-foreground px-2 py-6 text-center text-sm">
                  {searchTerm.trim() ? "No matching issues." : "No issues found."}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {issues.map((issue) => (
                    <li key={`${issue.provider}:${issue.identifier}`}>
                      <button
                        type="button"
                        onClick={() => handleSelect(issue)}
                        className="hover:bg-muted/60 flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left"
                      >
                        <ProviderIcon
                          provider={issue.provider}
                          className="mt-0.5 size-4 shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{issue.title}</span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {issue.identifier}
                            {issue.status ? ` · ${issue.status}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </DialogPanel>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}
