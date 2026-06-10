// FILE: CreatePullRequestDialog.tsx
// Purpose: Create a GitHub pull request from the current branch — title, body,
//          base-branch selector, and a draft toggle. Pushes the branch and opens
//          the PR via the existing create_pr stacked action.
// Layer: Chat right-dock git UI

import type { GitStatusResult, ProviderStartOptions } from "@t3tools/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { gitBranchesQueryOptions, gitRunStackedActionMutationOptions } from "~/lib/gitReactQuery";
import { newCommandId } from "~/lib/utils";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { Textarea } from "../ui/textarea";

interface CreatePullRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cwd: string | null;
  gitStatus: GitStatusResult | null;
  model?: string | null;
  codexHomePath?: string | null;
  providerOptions?: ProviderStartOptions | null;
  onCreated?: (pr: { url?: string; number?: number }) => void;
}

export function CreatePullRequestDialog({
  open,
  onOpenChange,
  cwd,
  gitStatus,
  model,
  codexHomePath,
  providerOptions,
  onCreated,
}: CreatePullRequestDialogProps) {
  const queryClient = useQueryClient();
  const branchesQuery = useQuery(gitBranchesQueryOptions(open ? cwd : null));

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [baseBranch, setBaseBranch] = useState<string>("");
  const [draft, setDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headBranch = gitStatus?.branch ?? null;

  // Candidate base branches: every branch except the current head, default first.
  const baseOptions = useMemo(() => {
    const branches = branchesQuery.data?.branches ?? [];
    const names = new Set<string>();
    for (const b of branches) {
      if (b.name && b.name !== headBranch && !b.isRemote) names.add(b.name);
    }
    const ordered = [...names];
    const defaultBranch = branches.find((b) => b.isDefault && !b.isRemote)?.name;
    if (defaultBranch && ordered.includes(defaultBranch)) {
      ordered.sort((a, b) => (a === defaultBranch ? -1 : b === defaultBranch ? 1 : 0));
    }
    return ordered;
  }, [branchesQuery.data, headBranch]);

  // Default the base branch to the repo default once branches load.
  useEffect(() => {
    if (!open) return;
    if (baseBranch && baseOptions.includes(baseBranch)) return;
    const fallback = baseOptions[0] ?? "";
    setBaseBranch(fallback);
  }, [open, baseOptions, baseBranch]);

  // Reset transient fields whenever the dialog reopens.
  useEffect(() => {
    if (open) {
      setTitle("");
      setBody("");
      setDraft(false);
      setError(null);
    }
  }, [open]);

  const createMutation = useMutation(
    gitRunStackedActionMutationOptions({
      cwd,
      queryClient,
      ...(model !== undefined ? { model } : {}),
      ...(codexHomePath !== undefined ? { codexHomePath } : {}),
      ...(providerOptions !== undefined ? { providerOptions } : {}),
    }),
  );

  const handleCreate = async () => {
    if (!cwd) return;
    setError(null);
    try {
      const result = await createMutation.mutateAsync({
        actionId: newCommandId(),
        action: "create_pr",
        ...(title.trim() ? { prTitle: title.trim() } : {}),
        // Body is only honored when a title is also set (server pairs them).
        ...(title.trim() ? { prBody: body } : {}),
        ...(baseBranch ? { prBaseBranch: baseBranch } : {}),
        prDraft: draft,
      });
      if (result.pr.status === "created" || result.pr.status === "opened_existing") {
        onCreated?.({
          ...(result.pr.url ? { url: result.pr.url } : {}),
          ...(result.pr.number ? { number: result.pr.number } : {}),
        });
        onOpenChange(false);
        return;
      }
      setError("The pull request could not be created. Check that the branch is pushed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to create the pull request.");
    }
  };

  const canSubmit = Boolean(cwd && headBranch && baseBranch && baseBranch !== headBranch);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create pull request</DialogTitle>
          <DialogDescription>
            {headBranch ? (
              <>
                Open a PR from <span className="font-medium text-foreground">{headBranch}</span>.
                The branch is pushed first.
              </>
            ) : (
              "Open a pull request from the current branch."
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-3">
          <div className="grid gap-1.5">
            <label htmlFor="pr-base" className="text-xs font-medium">
              Base branch
            </label>
            <select
              id="pr-base"
              value={baseBranch}
              onChange={(event) => setBaseBranch(event.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-2 text-[13px] text-foreground"
            >
              {baseOptions.length === 0 ? (
                <option value="">No other branches</option>
              ) : (
                baseOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="pr-title" className="text-xs font-medium">
              Title <span className="text-muted-foreground">(optional — auto-generated)</span>
            </label>
            <Input
              id="pr-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Leave empty to auto-generate from commits"
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="pr-body" className="text-xs font-medium">
              Description
            </label>
            <Textarea
              id="pr-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={
                title.trim() ? "Describe the change" : "Auto-generated unless a title is set"
              }
              size="sm"
              rows={4}
              disabled={title.trim().length === 0}
            />
          </div>

          <label className="flex items-center gap-2 text-[13px] text-foreground">
            <input
              type="checkbox"
              checked={draft}
              onChange={(event) => setDraft(event.target.checked)}
              className="size-4"
            />
            Create as draft
          </label>

          {error ? (
            <p className={cn("text-destructive text-xs")} role="alert">
              {error}
            </p>
          ) : null}
        </DialogPanel>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit || createMutation.isPending}
            onClick={() => void handleCreate()}
          >
            {createMutation.isPending ? <Spinner className="size-4" /> : null}
            {draft ? "Create draft PR" : "Create PR"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
