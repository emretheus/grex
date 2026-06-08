import type { IntegrationCredentials, LinkedIssue } from "@t3tools/contracts";

import { restRequest, toErrorMessage } from "./http";
import {
  type AdapterListOpts,
  type AdapterSearchOpts,
  type IssueListResult,
  type ProviderAdapter,
  requireField,
} from "./types";

const GITHUB_API_BASE = "https://api.github.com";

const authHeaders = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
  accept: "application/vnd.github+json",
  "user-agent": "codewit",
});

interface GitHubIssue {
  readonly number: number;
  readonly title: string;
  readonly html_url: string;
  readonly state: string;
  readonly body?: string | null;
  readonly updated_at: string;
  readonly pull_request?: unknown;
  readonly repository?: {
    readonly full_name: string;
  } | null;
  readonly assignees?: ReadonlyArray<{ readonly login: string }> | null;
  // search items use repository_url instead of repository
  readonly repository_url?: string | null;
}

interface GitHubUser {
  readonly login: string;
}

interface GitHubSearchResult {
  readonly items: GitHubIssue[];
}

const repoFullNameFromUrl = (repositoryUrl: string): string =>
  repositoryUrl.replace("https://api.github.com/repos/", "");

const toLinkedIssue = (issue: GitHubIssue): LinkedIssue => {
  const repoName =
    issue.repository?.full_name ??
    (issue.repository_url ? repoFullNameFromUrl(issue.repository_url) : undefined);

  const identifier = repoName ? `${repoName}#${issue.number}` : `#${issue.number}`;

  return {
    provider: "github",
    identifier,
    title: issue.title,
    url: issue.html_url,
    status: issue.state,
    description: issue.body ?? undefined,
    assignees:
      issue.assignees && issue.assignees.length > 0
        ? issue.assignees.map((a) => a.login)
        : undefined,
    project: repoName ?? undefined,
    updatedAt: issue.updated_at,
    fetchedAt: new Date().toISOString(),
  };
};

export const githubAdapter: ProviderAdapter = {
  type: "github",

  async validate(creds: IntegrationCredentials) {
    const token = requireField(creds, "token");
    const user = await restRequest<GitHubUser>(`${GITHUB_API_BASE}/user`, authHeaders(token));
    return { displayName: user.login };
  },

  async listIssues(creds: IntegrationCredentials, opts: AdapterListOpts): Promise<IssueListResult> {
    // TODO: scope to opts.repositoryUrl when provided
    try {
      const token = requireField(creds, "token");
      const issues = await restRequest<GitHubIssue[]>(
        `${GITHUB_API_BASE}/issues?filter=assigned&state=open&per_page=${opts.limit}`,
        authHeaders(token),
      );
      const filtered = issues.filter((i) => !i.pull_request);
      return { success: true, issues: filtered.map(toLinkedIssue) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to load GitHub issues") };
    }
  },

  async searchIssues(
    creds: IntegrationCredentials,
    opts: AdapterSearchOpts,
  ): Promise<IssueListResult> {
    // TODO: scope to opts.repositoryUrl when provided
    try {
      const token = requireField(creds, "token");
      const q = encodeURIComponent(`${opts.searchTerm} is:issue`);
      const result = await restRequest<GitHubSearchResult>(
        `${GITHUB_API_BASE}/search/issues?q=${q}&per_page=${opts.limit}`,
        authHeaders(token),
      );
      return { success: true, issues: result.items.map(toLinkedIssue) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to search GitHub issues") };
    }
  },
};
