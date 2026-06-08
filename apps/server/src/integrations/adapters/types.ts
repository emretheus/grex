import type {
  IntegrationCredentials,
  IssueContextResult,
  IssueListResult,
  IssueProviderType,
  LinkedIssue,
} from "@t3tools/contracts";

/**
 * Server-internal contract every issue-tracker adapter implements. This is the
 * analog of emdash's `IssueProvider`, with one deliberate difference: adapters
 * are **stateless and auth-injected** — credentials are passed in on every call
 * rather than held on the instance. The `IntegrationsService` owns credential
 * loading, validation, and (later) client caching, so adapters stay pure and
 * trivially unit-testable.
 */
export interface ProviderAdapter {
  readonly type: IssueProviderType;

  /**
   * Validate the credentials and return a human-friendly workspace/display name
   * on success. Throws (rejects) on auth failure — the service translates that
   * into a `connected: false` status with the error message.
   */
  validate(creds: IntegrationCredentials): Promise<{ displayName?: string | undefined }>;

  /** Recent issues for the authenticated user/workspace. */
  listIssues(creds: IntegrationCredentials, opts: AdapterListOpts): Promise<IssueListResult>;

  /** Full-text search across issues. */
  searchIssues(creds: IntegrationCredentials, opts: AdapterSearchOpts): Promise<IssueListResult>;

  /** Optional: hydrate a single issue with extended context (comments, etc.). */
  getIssueContext?(
    creds: IntegrationCredentials,
    opts: AdapterContextOpts,
  ): Promise<IssueContextResult>;
}

export interface AdapterListOpts {
  readonly projectPath?: string | undefined;
  readonly repositoryUrl?: string | undefined;
  readonly limit: number;
}

export interface AdapterSearchOpts extends AdapterListOpts {
  readonly searchTerm: string;
}

export interface AdapterContextOpts {
  readonly identifier: string;
  readonly projectPath?: string | undefined;
  readonly repositoryUrl?: string | undefined;
}

/** Re-export for adapter convenience. */
export type { LinkedIssue, IssueListResult, IssueContextResult };

/** Thrown by adapters when credentials are missing a required field. */
export class MissingCredentialError extends Error {
  constructor(field: string) {
    super(`Missing required credential: ${field}`);
    this.name = "MissingCredentialError";
  }
}

/** Reads a required credential field or throws a typed error. */
export const requireField = (creds: IntegrationCredentials, key: string): string => {
  const value = creds[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new MissingCredentialError(key);
  }
  return value;
};
