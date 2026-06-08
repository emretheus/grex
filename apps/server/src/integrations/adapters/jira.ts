import type { IntegrationCredentials, LinkedIssue } from "@t3tools/contracts";

import { restRequest, toErrorMessage } from "./http";
import {
  type AdapterListOpts,
  type AdapterSearchOpts,
  type IssueListResult,
  type ProviderAdapter,
  requireField,
} from "./types";

const authHeaders = (email: string, token: string): Record<string, string> => ({
  authorization: "Basic " + Buffer.from(`${email}:${token}`).toString("base64"),
  accept: "application/json",
});

interface JiraIssue {
  readonly key: string;
  readonly fields: {
    readonly summary: string;
    readonly status?: { readonly name?: string | null } | null;
    readonly description?: unknown;
    readonly assignee?: { readonly displayName?: string | null } | null;
    readonly project?: { readonly name?: string | null } | null;
    readonly updated?: string | null;
  };
}

interface JiraSearchResult {
  readonly issues: JiraIssue[];
}

interface JiraMyself {
  readonly displayName: string;
}

const toLinkedIssue = (issue: JiraIssue, base: string): LinkedIssue => ({
  provider: "jira",
  identifier: issue.key,
  title: issue.fields.summary,
  url: `${base}/browse/${issue.key}`,
  status: issue.fields.status?.name ?? undefined,
  // Jira description is ADF (Atlassian Document Format) — not a plain string
  description: undefined,
  assignees: issue.fields.assignee?.displayName ? [issue.fields.assignee.displayName] : undefined,
  project: issue.fields.project?.name ?? undefined,
  updatedAt: issue.fields.updated ?? undefined,
  fetchedAt: new Date().toISOString(),
});

export const jiraAdapter: ProviderAdapter = {
  type: "jira",

  async validate(creds: IntegrationCredentials) {
    const siteUrl = requireField(creds, "siteUrl");
    const email = requireField(creds, "email");
    const token = requireField(creds, "token");
    const base = siteUrl.replace(/\/$/, "");
    const myself = await restRequest<JiraMyself>(
      `${base}/rest/api/3/myself`,
      authHeaders(email, token),
    );
    return { displayName: myself.displayName };
  },

  async listIssues(creds: IntegrationCredentials, opts: AdapterListOpts): Promise<IssueListResult> {
    try {
      const siteUrl = requireField(creds, "siteUrl");
      const email = requireField(creds, "email");
      const token = requireField(creds, "token");
      const base = siteUrl.replace(/\/$/, "");
      const jql = encodeURIComponent("assignee = currentUser() ORDER BY updated DESC");
      const result = await restRequest<JiraSearchResult>(
        `${base}/rest/api/3/search?jql=${jql}&maxResults=${opts.limit}`,
        authHeaders(email, token),
      );
      return { success: true, issues: result.issues.map((i) => toLinkedIssue(i, base)) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to load Jira issues") };
    }
  },

  async searchIssues(
    creds: IntegrationCredentials,
    opts: AdapterSearchOpts,
  ): Promise<IssueListResult> {
    try {
      const siteUrl = requireField(creds, "siteUrl");
      const email = requireField(creds, "email");
      const token = requireField(creds, "token");
      const base = siteUrl.replace(/\/$/, "");
      // Strip double quotes to avoid breaking the JQL string literal
      const safeTerm = opts.searchTerm.replace(/"/g, "");
      const jql = encodeURIComponent(`text ~ "${safeTerm}" ORDER BY updated DESC`);
      const result = await restRequest<JiraSearchResult>(
        `${base}/rest/api/3/search?jql=${jql}&maxResults=${opts.limit}`,
        authHeaders(email, token),
      );
      return { success: true, issues: result.issues.map((i) => toLinkedIssue(i, base)) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to search Jira issues") };
    }
  },
};
