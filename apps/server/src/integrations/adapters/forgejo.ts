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
  authorization: `token ${token}`,
});

const baseUrl = (instanceUrl: string): string => `${instanceUrl.replace(/\/$/, "")}/api/v1`;

interface ForgejoUser {
  readonly login: string;
  readonly full_name?: string | null;
}

interface ForgejoIssue {
  readonly number: number;
  readonly title: string;
  readonly html_url: string;
  readonly state?: string | null;
  readonly body?: string | null;
  readonly assignees?: ReadonlyArray<{ readonly login: string }> | null;
  readonly repository?: { readonly full_name?: string | null } | null;
  readonly updated_at?: string | null;
}

const toLinkedIssue = (issue: ForgejoIssue): LinkedIssue => ({
  provider: "forgejo",
  identifier: `#${issue.number}`,
  title: issue.title,
  url: issue.html_url,
  status: issue.state ?? undefined,
  description: issue.body ?? undefined,
  assignees:
    issue.assignees && issue.assignees.length > 0 ? issue.assignees.map((a) => a.login) : undefined,
  project: issue.repository?.full_name ?? undefined,
  updatedAt: issue.updated_at ?? undefined,
  fetchedAt: new Date().toISOString(),
});

export const forgejoAdapter: ProviderAdapter = {
  type: "forgejo",

  async validate(creds: IntegrationCredentials) {
    const token = requireField(creds, "token");
    const instanceUrl = requireField(creds, "instanceUrl");
    const base = baseUrl(instanceUrl);
    const data = await restRequest<ForgejoUser>(`${base}/user`, authHeaders(token));
    return { displayName: data.full_name || data.login };
  },

  async listIssues(creds: IntegrationCredentials, opts: AdapterListOpts): Promise<IssueListResult> {
    try {
      // TODO: opts.projectPath could scope to a specific repo once supported
      const token = requireField(creds, "token");
      const instanceUrl = requireField(creds, "instanceUrl");
      const base = baseUrl(instanceUrl);
      const issues = await restRequest<ForgejoIssue[]>(
        `${base}/repos/issues/search?state=open&type=issues&limit=${opts.limit}`,
        authHeaders(token),
      );
      return { success: true, issues: issues.map(toLinkedIssue) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to load Forgejo issues") };
    }
  },

  async searchIssues(
    creds: IntegrationCredentials,
    opts: AdapterSearchOpts,
  ): Promise<IssueListResult> {
    try {
      // TODO: opts.projectPath could scope to a specific repo once supported
      const token = requireField(creds, "token");
      const instanceUrl = requireField(creds, "instanceUrl");
      const base = baseUrl(instanceUrl);
      const issues = await restRequest<ForgejoIssue[]>(
        `${base}/repos/issues/search?state=all&type=issues&q=${encodeURIComponent(opts.searchTerm)}&limit=${opts.limit}`,
        authHeaders(token),
      );
      return { success: true, issues: issues.map(toLinkedIssue) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to search Forgejo issues") };
    }
  },
};
