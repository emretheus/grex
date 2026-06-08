import type { IntegrationCredentials, LinkedIssue } from "@t3tools/contracts";

import { restRequest, toErrorMessage } from "./http";
import {
  type AdapterListOpts,
  type AdapterSearchOpts,
  type IssueListResult,
  type ProviderAdapter,
  requireField,
} from "./types";

const authHeaders = (token: string): Record<string, string> => ({
  "private-token": token,
});

interface GitLabIssue {
  readonly iid: number;
  readonly title: string;
  readonly web_url: string;
  readonly state: string;
  readonly description?: string | null;
  readonly updated_at: string;
  readonly references?: {
    readonly full?: string | null;
  } | null;
  readonly assignees?: ReadonlyArray<{ readonly name: string }> | null;
}

interface GitLabUser {
  readonly name?: string | null;
  readonly username: string;
}

const toLinkedIssue = (issue: GitLabIssue): LinkedIssue => ({
  provider: "gitlab",
  identifier: issue.references?.full ?? `#${issue.iid}`,
  title: issue.title,
  url: issue.web_url,
  status: issue.state,
  description: issue.description ?? undefined,
  assignees:
    issue.assignees && issue.assignees.length > 0 ? issue.assignees.map((a) => a.name) : undefined,
  // GitLab issues list doesn't include a separate project name field
  project: undefined,
  updatedAt: issue.updated_at,
  fetchedAt: new Date().toISOString(),
});

export const gitlabAdapter: ProviderAdapter = {
  type: "gitlab",

  async validate(creds: IntegrationCredentials) {
    const instanceUrl = requireField(creds, "instanceUrl");
    const token = requireField(creds, "token");
    const base = `${instanceUrl.replace(/\/$/, "")}/api/v4`;
    const user = await restRequest<GitLabUser>(`${base}/user`, authHeaders(token));
    return { displayName: user.name ?? user.username };
  },

  async listIssues(creds: IntegrationCredentials, opts: AdapterListOpts): Promise<IssueListResult> {
    // TODO: scope to opts.projectPath when provided
    try {
      const instanceUrl = requireField(creds, "instanceUrl");
      const token = requireField(creds, "token");
      const base = `${instanceUrl.replace(/\/$/, "")}/api/v4`;
      const issues = await restRequest<GitLabIssue[]>(
        `${base}/issues?scope=assigned_to_me&state=opened&per_page=${opts.limit}&order_by=updated_at`,
        authHeaders(token),
      );
      return { success: true, issues: issues.map(toLinkedIssue) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to load GitLab issues") };
    }
  },

  async searchIssues(
    creds: IntegrationCredentials,
    opts: AdapterSearchOpts,
  ): Promise<IssueListResult> {
    // TODO: scope to opts.projectPath when provided
    try {
      const instanceUrl = requireField(creds, "instanceUrl");
      const token = requireField(creds, "token");
      const base = `${instanceUrl.replace(/\/$/, "")}/api/v4`;
      const issues = await restRequest<GitLabIssue[]>(
        `${base}/issues?scope=all&search=${encodeURIComponent(opts.searchTerm)}&per_page=${opts.limit}`,
        authHeaders(token),
      );
      return { success: true, issues: issues.map(toLinkedIssue) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to search GitLab issues") };
    }
  },
};
