import { Option, Schema } from "effect";
import { NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas";
import { DEFAULT_GIT_TEXT_GENERATION_MODEL } from "./model";
import { ProviderStartOptions } from "./orchestration";

const TrimmedNonEmptyStringSchema = TrimmedNonEmptyString;

// Domain Types

export const GitStackedAction = Schema.Literals([
  "commit",
  "push",
  "create_pr",
  "commit_push",
  "commit_push_pr",
]);
export type GitStackedAction = typeof GitStackedAction.Type;
export const GitActionProgressPhase = Schema.Literals(["branch", "commit", "push", "pr"]);
export type GitActionProgressPhase = typeof GitActionProgressPhase.Type;
export const GitActionProgressKind = Schema.Literals([
  "action_started",
  "phase_started",
  "hook_started",
  "hook_output",
  "hook_finished",
  "action_finished",
  "action_failed",
]);
export type GitActionProgressKind = typeof GitActionProgressKind.Type;
export const GitActionProgressStream = Schema.Literals(["stdout", "stderr"]);
export type GitActionProgressStream = typeof GitActionProgressStream.Type;
const GitCommitStepStatus = Schema.Literals([
  "created",
  "skipped_no_changes",
  "skipped_not_requested",
]);
const GitPushStepStatus = Schema.Literals([
  "pushed",
  "skipped_not_requested",
  "skipped_up_to_date",
]);
const GitBranchStepStatus = Schema.Literals(["created", "skipped_not_requested"]);
const GitPrStepStatus = Schema.Literals(["created", "opened_existing", "skipped_not_requested"]);
const GitStatusPrState = Schema.Literals(["open", "closed", "merged"]);
const GitPullRequestReference = TrimmedNonEmptyStringSchema;
const GitPullRequestState = Schema.Literals(["open", "closed", "merged"]);
const GitPreparePullRequestThreadMode = Schema.Literals(["local", "worktree"]);
const GitHandoffThreadMode = Schema.Literals(["local", "worktree"]);

export const GitBranch = Schema.Struct({
  name: TrimmedNonEmptyStringSchema,
  isRemote: Schema.optional(Schema.Boolean),
  remoteName: Schema.optional(TrimmedNonEmptyStringSchema),
  current: Schema.Boolean,
  isDefault: Schema.Boolean,
  worktreePath: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
});
export type GitBranch = typeof GitBranch.Type;

const GitWorktree = Schema.Struct({
  path: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
});
const GitDetachedWorktree = Schema.Struct({
  path: TrimmedNonEmptyStringSchema,
  ref: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
});
const GitResolvedPullRequest = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyStringSchema,
  url: Schema.String,
  baseBranch: TrimmedNonEmptyStringSchema,
  headBranch: TrimmedNonEmptyStringSchema,
  state: GitPullRequestState,
});
export type GitResolvedPullRequest = typeof GitResolvedPullRequest.Type;

// RPC Inputs

export const GitStatusInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitStatusInput = typeof GitStatusInput.Type;

export const GitHubRepositoryInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitHubRepositoryInput = typeof GitHubRepositoryInput.Type;

export const GitReadWorkingTreeDiffInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  scope: Schema.optional(Schema.Literals(["workingTree", "unstaged", "staged", "branch"])).pipe(
    Schema.withConstructorDefault(() => Option.some("workingTree" as const)),
  ),
});
export type GitReadWorkingTreeDiffInput = typeof GitReadWorkingTreeDiffInput.Type;

export const GitPullInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitPullInput = typeof GitPullInput.Type;

// Read a single file's content at a git ref (e.g. "HEAD", ":0" for the index) so
// the editor can show the original side of an editable diff.
export const GitReadFileAtRefInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  ref: TrimmedNonEmptyStringSchema.check(Schema.isMaxLength(256)),
  relativePath: TrimmedNonEmptyStringSchema.check(Schema.isMaxLength(512)),
});
export type GitReadFileAtRefInput = typeof GitReadFileAtRefInput.Type;

// Read-only diff summary requests reuse the shared git text-generation model settings.
export const GitSummarizeDiffInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  patch: Schema.String,
  codexHomePath: Schema.optional(TrimmedNonEmptyStringSchema),
  providerOptions: Schema.optional(ProviderStartOptions),
  textGenerationModel: Schema.optional(TrimmedNonEmptyStringSchema).pipe(
    Schema.withConstructorDefault(() => Option.some(DEFAULT_GIT_TEXT_GENERATION_MODEL)),
  ),
});
export type GitSummarizeDiffInput = typeof GitSummarizeDiffInput.Type;

export const GitRunStackedActionInput = Schema.Struct({
  actionId: TrimmedNonEmptyStringSchema,
  cwd: TrimmedNonEmptyStringSchema,
  action: GitStackedAction,
  commitMessage: Schema.optional(TrimmedNonEmptyStringSchema.check(Schema.isMaxLength(10_000))),
  featureBranch: Schema.optional(Schema.Boolean),
  filePaths: Schema.optional(
    Schema.Array(TrimmedNonEmptyStringSchema).check(Schema.isMinLength(1)),
  ),
  codexHomePath: Schema.optional(TrimmedNonEmptyStringSchema),
  providerOptions: Schema.optional(ProviderStartOptions),
  textGenerationModel: Schema.optional(TrimmedNonEmptyStringSchema).pipe(
    Schema.withConstructorDefault(() => Option.some(DEFAULT_GIT_TEXT_GENERATION_MODEL)),
  ),
  // Optional overrides for the PR step. When omitted, the title/body are
  // AI-generated and the base branch is auto-resolved (config → upstream →
  // repo default), preserving the existing behavior.
  prTitle: Schema.optional(TrimmedNonEmptyStringSchema.check(Schema.isMaxLength(256))),
  prBody: Schema.optional(Schema.String.check(Schema.isMaxLength(60_000))),
  prBaseBranch: Schema.optional(TrimmedNonEmptyStringSchema),
  prDraft: Schema.optional(Schema.Boolean),
});
export type GitRunStackedActionInput = typeof GitRunStackedActionInput.Type;

export const GitListBranchesInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitListBranchesInput = typeof GitListBranchesInput.Type;

export const GitCreateWorktreeInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
  newBranch: Schema.optional(TrimmedNonEmptyStringSchema),
  path: Schema.NullOr(TrimmedNonEmptyStringSchema),
});
export type GitCreateWorktreeInput = typeof GitCreateWorktreeInput.Type;

export const GitCreateDetachedWorktreeInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  ref: TrimmedNonEmptyStringSchema,
  path: Schema.NullOr(TrimmedNonEmptyStringSchema),
});
export type GitCreateDetachedWorktreeInput = typeof GitCreateDetachedWorktreeInput.Type;

export const GitPullRequestRefInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  reference: GitPullRequestReference,
});
export type GitPullRequestRefInput = typeof GitPullRequestRefInput.Type;

export const GitPreparePullRequestThreadInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  reference: GitPullRequestReference,
  mode: GitPreparePullRequestThreadMode,
});
export type GitPreparePullRequestThreadInput = typeof GitPreparePullRequestThreadInput.Type;

export const GitHandoffThreadInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  targetMode: GitHandoffThreadMode,
  currentBranch: Schema.NullOr(TrimmedNonEmptyStringSchema),
  worktreePath: Schema.NullOr(TrimmedNonEmptyStringSchema),
  associatedWorktreePath: Schema.NullOr(TrimmedNonEmptyStringSchema),
  associatedWorktreeBranch: Schema.NullOr(TrimmedNonEmptyStringSchema),
  associatedWorktreeRef: Schema.NullOr(TrimmedNonEmptyStringSchema),
  preferredLocalBranch: Schema.NullOr(TrimmedNonEmptyStringSchema),
  preferredWorktreeBaseBranch: Schema.NullOr(TrimmedNonEmptyStringSchema),
  preferredNewWorktreeName: Schema.NullOr(TrimmedNonEmptyStringSchema),
});
export type GitHandoffThreadInput = typeof GitHandoffThreadInput.Type;

export const GitRemoveWorktreeInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  path: TrimmedNonEmptyStringSchema,
  force: Schema.optional(Schema.Boolean),
});
export type GitRemoveWorktreeInput = typeof GitRemoveWorktreeInput.Type;

export const GitCreateBranchInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
  publish: Schema.optional(Schema.Boolean),
});
export type GitCreateBranchInput = typeof GitCreateBranchInput.Type;

export const GitCheckoutInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
});
export type GitCheckoutInput = typeof GitCheckoutInput.Type;

export const GitStashAndCheckoutInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema,
});
export type GitStashAndCheckoutInput = typeof GitStashAndCheckoutInput.Type;

export const GitStashDropInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitStashDropInput = typeof GitStashDropInput.Type;

export const GitStashInfoInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitStashInfoInput = typeof GitStashInfoInput.Type;

export const GitRemoveIndexLockInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitRemoveIndexLockInput = typeof GitRemoveIndexLockInput.Type;

export const GitInitInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
});
export type GitInitInput = typeof GitInitInput.Type;

export const GitStageFilesInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  paths: Schema.Array(TrimmedNonEmptyStringSchema).check(Schema.isMinLength(1)),
});
export type GitStageFilesInput = typeof GitStageFilesInput.Type;

export const GitUnstageFilesInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  paths: Schema.Array(TrimmedNonEmptyStringSchema).check(Schema.isMinLength(1)),
});
export type GitUnstageFilesInput = typeof GitUnstageFilesInput.Type;

// Discard working-tree changes for the given paths: tracked files are reverted
// to HEAD/index; untracked files are deleted. This is destructive and cannot be
// undone, so the UI confirms first.
export const GitDiscardFilesInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  paths: Schema.Array(TrimmedNonEmptyStringSchema).check(Schema.isMinLength(1)),
});
export type GitDiscardFilesInput = typeof GitDiscardFilesInput.Type;

// patch must NOT be trimmed — leading/trailing characters are significant in unified diffs
export const GitApplyPatchInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  patch: Schema.String,
  reverse: Schema.optional(Schema.Boolean),
  cached: Schema.optional(Schema.Boolean),
});
export type GitApplyPatchInput = typeof GitApplyPatchInput.Type;

// RPC Results

const GitStatusPr = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyStringSchema,
  url: Schema.String,
  baseBranch: TrimmedNonEmptyStringSchema,
  headBranch: TrimmedNonEmptyStringSchema,
  state: GitStatusPrState,
});

export const GitStatusResult = Schema.Struct({
  branch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  hasWorkingTreeChanges: Schema.Boolean,
  workingTree: Schema.Struct({
    files: Schema.Array(
      Schema.Struct({
        path: TrimmedNonEmptyStringSchema,
        insertions: NonNegativeInt,
        deletions: NonNegativeInt,
      }),
    ),
    insertions: NonNegativeInt,
    deletions: NonNegativeInt,
  }),
  hasUpstream: Schema.Boolean,
  upstreamBranch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  aheadCount: NonNegativeInt,
  behindCount: NonNegativeInt,
  pr: Schema.NullOr(GitStatusPr),
});
export type GitStatusResult = typeof GitStatusResult.Type;

export const GitStatusLocalResult = Schema.Struct({
  branch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  hasWorkingTreeChanges: Schema.Boolean,
  workingTree: GitStatusResult.fields.workingTree,
});
export type GitStatusLocalResult = typeof GitStatusLocalResult.Type;

export const GitStatusRemoteResult = Schema.Struct({
  hasUpstream: Schema.Boolean,
  upstreamBranch: GitStatusResult.fields.upstreamBranch,
  aheadCount: NonNegativeInt,
  behindCount: NonNegativeInt,
  pr: Schema.NullOr(GitStatusPr),
});
export type GitStatusRemoteResult = typeof GitStatusRemoteResult.Type;

export const GitHubRepositoryResult = Schema.Struct({
  repository: Schema.NullOr(
    Schema.Struct({
      nameWithOwner: TrimmedNonEmptyStringSchema,
      url: TrimmedNonEmptyStringSchema,
    }),
  ),
});
export type GitHubRepositoryResult = typeof GitHubRepositoryResult.Type;

export const GitStatusStreamEvent = Schema.Union([
  Schema.TaggedStruct("snapshot", {
    local: GitStatusLocalResult,
    remote: Schema.NullOr(GitStatusRemoteResult),
  }),
  Schema.TaggedStruct("localUpdated", {
    local: GitStatusLocalResult,
  }),
  Schema.TaggedStruct("remoteUpdated", {
    remote: Schema.NullOr(GitStatusRemoteResult),
  }),
]);
export type GitStatusStreamEvent = typeof GitStatusStreamEvent.Type;

export const GitReadWorkingTreeDiffResult = Schema.Struct({
  patch: Schema.String,
});
export type GitReadWorkingTreeDiffResult = typeof GitReadWorkingTreeDiffResult.Type;

export const GitReadFileAtRefResult = Schema.Struct({
  // File content at the ref. `exists` is false for files added since the ref
  // (no original side); content is then empty.
  contents: Schema.String,
  exists: Schema.Boolean,
  // True when the blob is too large to load into the editor.
  truncated: Schema.Boolean,
});
export type GitReadFileAtRefResult = typeof GitReadFileAtRefResult.Type;

// Stage/unstage are fire-and-forget index mutations; callers refetch status/diff.
export const GitStageFilesResult = Schema.Struct({
  ok: Schema.Boolean,
});
export type GitStageFilesResult = typeof GitStageFilesResult.Type;

export const GitUnstageFilesResult = GitStageFilesResult;
export type GitUnstageFilesResult = GitStageFilesResult;

export const GitDiscardFilesResult = GitStageFilesResult;
export type GitDiscardFilesResult = GitStageFilesResult;

export const GitApplyPatchResult = Schema.Struct({
  ok: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
});
export type GitApplyPatchResult = typeof GitApplyPatchResult.Type;

export const GitListBranchesResult = Schema.Struct({
  branches: Schema.Array(GitBranch),
  isRepo: Schema.Boolean,
  hasOriginRemote: Schema.Boolean,
});
export type GitListBranchesResult = typeof GitListBranchesResult.Type;

export const GitCreateWorktreeResult = Schema.Struct({
  worktree: GitWorktree,
});
export type GitCreateWorktreeResult = typeof GitCreateWorktreeResult.Type;

export const GitCreateDetachedWorktreeResult = Schema.Struct({
  worktree: GitDetachedWorktree,
});
export type GitCreateDetachedWorktreeResult = typeof GitCreateDetachedWorktreeResult.Type;

export const GitStashInfoResult = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  branch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  stashRef: TrimmedNonEmptyStringSchema,
  message: TrimmedNonEmptyStringSchema,
  files: Schema.Array(TrimmedNonEmptyStringSchema),
});
export type GitStashInfoResult = typeof GitStashInfoResult.Type;

export const GitResolvePullRequestResult = Schema.Struct({
  pullRequest: GitResolvedPullRequest,
});
export type GitResolvePullRequestResult = typeof GitResolvePullRequestResult.Type;

export const GitPreparePullRequestThreadResult = Schema.Struct({
  pullRequest: GitResolvedPullRequest,
  branch: TrimmedNonEmptyStringSchema,
  worktreePath: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
});
export type GitPreparePullRequestThreadResult = typeof GitPreparePullRequestThreadResult.Type;

export const GitHandoffThreadResult = Schema.Struct({
  targetMode: GitHandoffThreadMode,
  branch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  worktreePath: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  associatedWorktreePath: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  associatedWorktreeBranch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  associatedWorktreeRef: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
  changesTransferred: Schema.Boolean,
  conflictsDetected: Schema.Boolean,
  message: Schema.NullOr(Schema.String),
});
export type GitHandoffThreadResult = typeof GitHandoffThreadResult.Type;

export const GitRunStackedActionResult = Schema.Struct({
  action: GitStackedAction,
  branch: Schema.Struct({
    status: GitBranchStepStatus,
    name: Schema.optional(TrimmedNonEmptyStringSchema),
  }),
  commit: Schema.Struct({
    status: GitCommitStepStatus,
    commitSha: Schema.optional(TrimmedNonEmptyStringSchema),
    subject: Schema.optional(TrimmedNonEmptyStringSchema),
  }),
  push: Schema.Struct({
    status: GitPushStepStatus,
    branch: Schema.optional(TrimmedNonEmptyStringSchema),
    upstreamBranch: Schema.optional(TrimmedNonEmptyStringSchema),
    setUpstream: Schema.optional(Schema.Boolean),
  }),
  pr: Schema.Struct({
    status: GitPrStepStatus,
    url: Schema.optional(Schema.String),
    number: Schema.optional(PositiveInt),
    baseBranch: Schema.optional(TrimmedNonEmptyStringSchema),
    headBranch: Schema.optional(TrimmedNonEmptyStringSchema),
    title: Schema.optional(TrimmedNonEmptyStringSchema),
  }),
});
export type GitRunStackedActionResult = typeof GitRunStackedActionResult.Type;

// ── Commit log ──────────────────────────────────────────────────────────────

export const GitLogInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  maxCount: Schema.optional(PositiveInt),
  branch: Schema.optional(TrimmedNonEmptyStringSchema),
  all: Schema.optional(Schema.Boolean),
});
export type GitLogInput = typeof GitLogInput.Type;

export const GitLogCommit = Schema.Struct({
  sha: TrimmedNonEmptyStringSchema,
  shortSha: TrimmedNonEmptyStringSchema,
  subject: Schema.String,
  body: Schema.String,
  authorName: Schema.String,
  authorEmail: Schema.String,
  authorDate: Schema.String,
  committerDate: Schema.String,
  refs: Schema.Array(Schema.String),
  parentShas: Schema.Array(Schema.String),
});
export type GitLogCommit = typeof GitLogCommit.Type;

export const GitLogResult = Schema.Struct({
  commits: Schema.Array(GitLogCommit),
});
export type GitLogResult = typeof GitLogResult.Type;

export const GitShowCommitInput = Schema.Struct({
  cwd: TrimmedNonEmptyStringSchema,
  sha: TrimmedNonEmptyStringSchema,
});
export type GitShowCommitInput = typeof GitShowCommitInput.Type;

export const GitShowCommitFile = Schema.Struct({
  path: Schema.String,
  oldPath: Schema.String.pipe(Schema.NullOr),
  additions: Schema.Number,
  deletions: Schema.Number,
  /** "A" | "M" | "D" | "R" | "C" | "T" | "U" | "X" */
  status: Schema.String,
});
export type GitShowCommitFile = typeof GitShowCommitFile.Type;

export const GitShowCommitResult = Schema.Struct({
  sha: Schema.String,
  subject: Schema.String,
  body: Schema.String,
  authorName: Schema.String,
  authorEmail: Schema.String,
  authorDate: Schema.String,
  committerName: Schema.String,
  committerEmail: Schema.String,
  committerDate: Schema.String,
  parentShas: Schema.Array(Schema.String),
  files: Schema.Array(GitShowCommitFile),
  totalAdditions: Schema.Number,
  totalDeletions: Schema.Number,
});
export type GitShowCommitResult = typeof GitShowCommitResult.Type;

export const GitPullResult = Schema.Struct({
  status: Schema.Literals(["pulled", "skipped_up_to_date"]),
  branch: TrimmedNonEmptyStringSchema,
  upstreamBranch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
});
export type GitPullResult = typeof GitPullResult.Type;

export const GitSummarizeDiffResult = Schema.Struct({
  summary: TrimmedNonEmptyStringSchema,
});
export type GitSummarizeDiffResult = typeof GitSummarizeDiffResult.Type;

const GitActionProgressBase = Schema.Struct({
  actionId: TrimmedNonEmptyStringSchema,
  cwd: TrimmedNonEmptyStringSchema,
  action: GitStackedAction,
});

const GitActionStartedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("action_started"),
  phases: Schema.Array(GitActionProgressPhase),
});
const GitActionPhaseStartedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("phase_started"),
  phase: GitActionProgressPhase,
  label: TrimmedNonEmptyStringSchema,
});
const GitActionHookStartedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("hook_started"),
  hookName: TrimmedNonEmptyStringSchema,
});
const GitActionHookOutputEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("hook_output"),
  hookName: Schema.NullOr(TrimmedNonEmptyStringSchema),
  stream: GitActionProgressStream,
  text: TrimmedNonEmptyStringSchema,
});
const GitActionHookFinishedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("hook_finished"),
  hookName: TrimmedNonEmptyStringSchema,
  exitCode: Schema.NullOr(Schema.Int),
  durationMs: Schema.NullOr(NonNegativeInt),
});
const GitActionFinishedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("action_finished"),
  result: GitRunStackedActionResult,
});
const GitActionFailedEvent = Schema.Struct({
  ...GitActionProgressBase.fields,
  kind: Schema.Literal("action_failed"),
  phase: Schema.NullOr(GitActionProgressPhase),
  message: TrimmedNonEmptyStringSchema,
});

export const GitActionProgressEvent = Schema.Union([
  GitActionStartedEvent,
  GitActionPhaseStartedEvent,
  GitActionHookStartedEvent,
  GitActionHookOutputEvent,
  GitActionHookFinishedEvent,
  GitActionFinishedEvent,
  GitActionFailedEvent,
]);
export type GitActionProgressEvent = typeof GitActionProgressEvent.Type;
