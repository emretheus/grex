# `/grex-cli restack` — re-sync a PR stack after lower layers changed

Restack propagates changes **up** a stack: after a lower layer gets new commits (or merges), every layer above it is out of date and must pull the new base. This is the "brain" behind the composer's **Restack** button (it appears on a stack tip and sends `/grex-cli restack`).

In Grex each layer's target branch is its parent's branch, so restacking = syncing each layer with its parent, **bottom-up**. v1 is **merge-based** — no rebase, no force-push — matching `grex workspace sync`.

## Workflow

### 1. Map the stack
Run `grex workspace stack <current-workspace-ref>` (add `--json` to parse) to see the full chain root → tip: each layer's branch, target, PR, and status. You're typically invoked from the tip.

### 2. Sync bottom-up
Walk the chain from the **bottom up** (skip the root — its base is `main`, not another layer). For each layer in order:

1. If the layer below has local commits the child still needs on its remote, push it first: `grex workspace push <lower-ref>`.
2. Pull the parent's latest into this layer: `grex workspace sync <this-ref>` — merges this layer's target (its parent's branch) in.

`sync` reports an outcome: `Updated`, `AlreadyUpToDate`, `Conflict`, or `StashPopConflict`.

### 3. Stop on conflict
If any `sync` reports a conflict, **STOP**. Tell the user which layer conflicted and the files involved — do **not** try to auto-resolve. Let them resolve in that workspace, then re-run `/grex-cli restack`.

### 4. Report
Summarize per layer (synced / already up to date / conflicted) and name the next layer to review.

## Notes
- Restack is **manual** for now (the button or this command). Automatic restack-on-merge is a planned Grex feature.
- Never rebase or force-push in v1 — stay merge-based via `grex workspace sync`.
- When the bottom PR merges into `main`, the next layer should re-target `main` before syncing: `grex workspace target-branch set <ref> main`, then `grex workspace sync <ref>`.
- Stop for the user before any risky git operation (dirty worktrees, multi-branch pushes, conflict resolution).
