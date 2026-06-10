import { Schema } from "effect";
import * as SchemaGetter from "effect/SchemaGetter";
import { PositiveInt, TrimmedNonEmptyString } from "./baseSchemas";

// ── Provider identity ────────────────────────────────────────────────

/**
 * Every supported issue/task-tracker integration. Adding a provider is a single
 * literal here plus a server-side adapter and a shared metadata/auth-spec entry.
 */
export const IssueProviderType = Schema.Literals([
  "github",
  "linear",
  "jira",
  "gitlab",
  "forgejo",
  "asana",
  "monday",
  "trello",
  "featurebase",
  "plain",
]);
export type IssueProviderType = typeof IssueProviderType.Type;

/**
 * Declares what context a provider needs before it can be used and what it can
 * do. Mirrors emdash's capability matrix: GitHub needs a repository URL, the
 * self-hosted git forges need the project path to resolve the repo, and a few
 * trackers can hydrate a full issue context.
 */
export const IssueProviderCapabilities = Schema.Struct({
  requiresProjectPath: Schema.Boolean,
  requiresRepositoryUrl: Schema.Boolean,
  supportsIssueContext: Schema.Boolean,
});
export type IssueProviderCapabilities = typeof IssueProviderCapabilities.Type;

// ── Linked issue snapshot ────────────────────────────────────────────

/**
 * A flat, self-contained snapshot of an external issue captured at link time.
 * This is intentionally NOT a live reference — once linked, the metadata is
 * frozen until explicitly refreshed, so a tracker outage never breaks a thread.
 */
export const LinkedIssue = Schema.Struct({
  provider: IssueProviderType,
  identifier: TrimmedNonEmptyString,
  title: Schema.String,
  url: Schema.String,
  description: Schema.optional(Schema.String),
  context: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  branchName: Schema.optional(Schema.String),
  assignees: Schema.optional(Schema.Array(Schema.String)),
  project: Schema.optional(Schema.String),
  updatedAt: Schema.optional(Schema.String),
  fetchedAt: Schema.optional(Schema.String),
});
export type LinkedIssue = typeof LinkedIssue.Type;

// ── Multi-issue helpers ──────────────────────────────────────────────

export const MAX_LINKED_ISSUES = 10;

/** Dedup by the stable identity pair (provider + identifier). First occurrence wins. */
export function dedupeLinkedIssues(issues: readonly LinkedIssue[]): LinkedIssue[] {
  const seen = new Set<string>();
  const out: LinkedIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.provider}:${issue.identifier}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(issue);
    }
  }
  return out;
}

/**
 * Identity equality for two LinkedIssue arrays: same length and same ordered
 * provider:identifier sequence.  Plain `Equal.equals` cannot be used because
 * LinkedIssue decodes to plain objects (not Effect-Equal), making it always
 * return false for distinct array references.
 */
export function linkedIssuesEqual(a: readonly LinkedIssue[], b: readonly LinkedIssue[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.provider !== b[i]!.provider || a[i]!.identifier !== b[i]!.identifier) return false;
  }
  return true;
}

/**
 * Accepts: LinkedIssue[] | LinkedIssue | null | undefined
 * Produces: readonly LinkedIssue[]  (deduped, capped at MAX_LINKED_ISSUES)
 *
 * Used as the backward-compat bridge for legacy single-issue fields stored in
 * the DB, orchestration events, and localStorage drafts.
 */
export const LinkedIssues = Schema.Union([
  Schema.Array(LinkedIssue),
  LinkedIssue,
  Schema.Null,
  Schema.Undefined,
]).pipe(
  Schema.decodeTo(Schema.Array(LinkedIssue), {
    decode: SchemaGetter.transform((value) => {
      if (value == null) return [];
      const arr = Array.isArray(value) ? value : [value];
      return dedupeLinkedIssues(arr).slice(0, MAX_LINKED_ISSUES);
    }),
    encode: SchemaGetter.transform((value) => value),
  }),
);
export type LinkedIssues = typeof LinkedIssues.Type;

/**
 * DB / JSON-string variant: wraps `LinkedIssues` so a `linked_issue_json`
 * column (TEXT) can hold either a legacy single-object or a new array, and
 * always decodes to `readonly LinkedIssue[]`.
 *
 * The column stores NULL for no issues, or a JSON string that may be a single
 * LinkedIssue object (legacy) or an array (current).  Both are normalised to
 * `readonly LinkedIssue[]` via the `LinkedIssues` bridge schema.
 */
export const LinkedIssuesFromJsonString = Schema.NullOr(Schema.fromJsonString(LinkedIssues)).pipe(
  Schema.decodeTo(Schema.Array(LinkedIssue), {
    decode: SchemaGetter.transform((value) => value ?? []),
    encode: SchemaGetter.transform((value) => (value.length === 0 ? null : value)),
  }),
);

// ── Connection status ────────────────────────────────────────────────

export const ConnectionStatus = Schema.Struct({
  provider: IssueProviderType,
  connected: Schema.Boolean,
  capabilities: IssueProviderCapabilities,
  displayName: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
});
export type ConnectionStatus = typeof ConnectionStatus.Type;

export const ConnectionStatusMap = Schema.Record(IssueProviderType, ConnectionStatus);
export type ConnectionStatusMap = typeof ConnectionStatusMap.Type;

// ── RPC: connect / disconnect ────────────────────────────────────────

/**
 * Credentials are a flat string map keyed by the provider's auth-spec field
 * keys (e.g. `{ token }` for Linear, `{ siteUrl, email, token }` for Jira).
 * The server validates and stores them; they never round-trip back to the web.
 */
export const IntegrationCredentials = Schema.Record(Schema.String, TrimmedNonEmptyString);
export type IntegrationCredentials = typeof IntegrationCredentials.Type;

export const IntegrationConnectInput = Schema.Struct({
  provider: IssueProviderType,
  credentials: IntegrationCredentials,
});
export type IntegrationConnectInput = typeof IntegrationConnectInput.Type;

export const IntegrationConnectResult = Schema.Struct({
  success: Schema.Boolean,
  displayName: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
});
export type IntegrationConnectResult = typeof IntegrationConnectResult.Type;

export const IntegrationDisconnectInput = Schema.Struct({
  provider: IssueProviderType,
});
export type IntegrationDisconnectInput = typeof IntegrationDisconnectInput.Type;

export const IntegrationDisconnectResult = Schema.Struct({
  success: Schema.Boolean,
  error: Schema.optional(Schema.String),
});
export type IntegrationDisconnectResult = typeof IntegrationDisconnectResult.Type;

// ── RPC: connection status ───────────────────────────────────────────

export const IntegrationCheckConnectionsResult = Schema.Struct({
  statuses: ConnectionStatusMap,
});
export type IntegrationCheckConnectionsResult = typeof IntegrationCheckConnectionsResult.Type;

// ── RPC: list / search issues ────────────────────────────────────────

const ISSUE_LIST_MAX_LIMIT = 100;

export const IntegrationListIssuesInput = Schema.Struct({
  provider: IssueProviderType,
  // Optional context the capability matrix may require.
  projectPath: Schema.optional(TrimmedNonEmptyString),
  repositoryUrl: Schema.optional(TrimmedNonEmptyString),
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(ISSUE_LIST_MAX_LIMIT))),
});
export type IntegrationListIssuesInput = typeof IntegrationListIssuesInput.Type;

export const IntegrationSearchIssuesInput = Schema.Struct({
  provider: IssueProviderType,
  searchTerm: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  projectPath: Schema.optional(TrimmedNonEmptyString),
  repositoryUrl: Schema.optional(TrimmedNonEmptyString),
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(ISSUE_LIST_MAX_LIMIT))),
});
export type IntegrationSearchIssuesInput = typeof IntegrationSearchIssuesInput.Type;

/**
 * Issue queries never fail the RPC — a provider outage or auth error is a
 * normal, displayable state, so it is folded into the success payload as a
 * discriminated result. This matches emdash's `IssueListResult` shape.
 */
export const IssueListResult = Schema.Union([
  Schema.Struct({
    success: Schema.tag(true),
    issues: Schema.Array(LinkedIssue),
  }),
  Schema.Struct({
    success: Schema.tag(false),
    error: Schema.String,
  }),
]);
export type IssueListResult = typeof IssueListResult.Type;

// ── RPC: issue context ───────────────────────────────────────────────

export const IntegrationIssueContextInput = Schema.Struct({
  provider: IssueProviderType,
  identifier: TrimmedNonEmptyString,
  projectPath: Schema.optional(TrimmedNonEmptyString),
  repositoryUrl: Schema.optional(TrimmedNonEmptyString),
});
export type IntegrationIssueContextInput = typeof IntegrationIssueContextInput.Type;

export const IssueContextResult = Schema.Union([
  Schema.Struct({
    success: Schema.tag(true),
    issue: LinkedIssue,
  }),
  Schema.Struct({
    success: Schema.tag(false),
    error: Schema.String,
  }),
]);
export type IssueContextResult = typeof IssueContextResult.Type;

// Re-exported so the registry/meta in @t3tools/shared and the server adapters
// can share the numeric ceiling without re-declaring it.
export const INTEGRATION_ISSUE_LIST_MAX_LIMIT: number = ISSUE_LIST_MAX_LIMIT;
export const INTEGRATION_ISSUE_LIST_DEFAULT_LIMIT: number = 50;

// Convenience guard for narrowing untrusted input to a known provider.
const ISSUE_PROVIDER_TYPES = IssueProviderType.literals;
export const isIssueProviderType = (value: unknown): value is IssueProviderType =>
  typeof value === "string" && (ISSUE_PROVIDER_TYPES as readonly string[]).includes(value);
