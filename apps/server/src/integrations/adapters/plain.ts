import type { IntegrationCredentials, LinkedIssue } from "@t3tools/contracts";

import { graphqlRequest, toErrorMessage } from "./http";
import {
  type AdapterContextOpts,
  type AdapterListOpts,
  type AdapterSearchOpts,
  type IssueContextResult,
  type IssueListResult,
  type ProviderAdapter,
  requireField,
} from "./types";

const PLAIN_GRAPHQL_URL = "https://core-api.uk.plain.com/graphql/v1";

const authHeaders = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
});

// Plain schema is workspace-specific; minimal mapping
interface PlainThreadNode {
  readonly id: string;
  readonly title?: string | null;
  readonly status?: string | null;
  readonly customer?: { readonly fullName?: string | null } | null;
  readonly updatedAt?: string | null;
}

const toLinkedIssue = (node: PlainThreadNode): LinkedIssue => ({
  provider: "plain",
  identifier: node.id,
  title: node.title ?? "(untitled thread)",
  url: `https://app.plain.com/workspace/thread/${node.id}`,
  description: undefined,
  status: node.status ?? undefined,
  branchName: undefined,
  project: undefined,
  assignees: node.customer?.fullName ? [node.customer.fullName] : undefined,
  updatedAt: node.updatedAt ?? undefined,
  fetchedAt: new Date().toISOString(),
});

const THREADS_QUERY = `
  query ($first: Int!) {
    threads(first: $first, filters: { statuses: [TODO, SNOOZED] }) {
      edges {
        node {
          id
          title
          status
          customer { fullName }
          updatedAt
        }
      }
    }
  }
`;

const THREAD_QUERY = `
  query ($id: ID!) {
    thread(threadId: $id) {
      id
      title
      status
      updatedAt
    }
  }
`;

export const plainAdapter: ProviderAdapter = {
  type: "plain",

  async validate(creds: IntegrationCredentials) {
    const token = requireField(creds, "token");
    const data = await graphqlRequest<{ myWorkspace: { name?: string | null } | null }>(
      PLAIN_GRAPHQL_URL,
      authHeaders(token),
      `{ myWorkspace { name } }`,
    );
    return { displayName: data.myWorkspace?.name ?? undefined };
  },

  async listIssues(creds: IntegrationCredentials, opts: AdapterListOpts): Promise<IssueListResult> {
    try {
      const token = requireField(creds, "token");
      const data = await graphqlRequest<{
        threads: { edges: Array<{ node: PlainThreadNode }> };
      }>(PLAIN_GRAPHQL_URL, authHeaders(token), THREADS_QUERY, { first: opts.limit });
      return {
        success: true,
        issues: data.threads.edges.map((e) => toLinkedIssue(e.node)),
      };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to load Plain threads") };
    }
  },

  async searchIssues(
    creds: IntegrationCredentials,
    opts: AdapterSearchOpts,
  ): Promise<IssueListResult> {
    try {
      const token = requireField(creds, "token");
      // Plain's search API is limited; fetch threads and filter client-side by title.
      const data = await graphqlRequest<{
        threads: { edges: Array<{ node: PlainThreadNode }> };
      }>(PLAIN_GRAPHQL_URL, authHeaders(token), THREADS_QUERY, { first: opts.limit });
      const lc = opts.searchTerm.toLowerCase();
      const filtered = data.threads.edges
        .map((e) => e.node)
        .filter((n) => (n.title ?? "").toLowerCase().includes(lc))
        .slice(0, opts.limit);
      return { success: true, issues: filtered.map(toLinkedIssue) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to search Plain threads") };
    }
  },

  async getIssueContext(
    creds: IntegrationCredentials,
    opts: AdapterContextOpts,
  ): Promise<IssueContextResult> {
    try {
      const token = requireField(creds, "token");
      const data = await graphqlRequest<{ thread: PlainThreadNode | null }>(
        PLAIN_GRAPHQL_URL,
        authHeaders(token),
        THREAD_QUERY,
        { id: opts.identifier },
      );
      if (!data.thread) {
        return { success: false, error: `Thread ${opts.identifier} not found` };
      }
      return { success: true, issue: toLinkedIssue(data.thread) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to load Plain thread") };
    }
  },
};
