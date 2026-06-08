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

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

const authHeaders = (token: string): Record<string, string> => ({ authorization: token });

interface LinearIssueNode {
  readonly identifier: string;
  readonly title: string;
  readonly url: string;
  readonly description?: string | null;
  readonly branchName?: string | null;
  readonly updatedAt?: string | null;
  readonly state?: { readonly name?: string | null } | null;
  readonly project?: { readonly name?: string | null } | null;
  readonly assignee?: { readonly displayName?: string | null } | null;
}

const ISSUE_FIELDS = `
  identifier
  title
  url
  description
  branchName
  updatedAt
  state { name }
  project { name }
  assignee { displayName }
`;

const toLinkedIssue = (node: LinearIssueNode): LinkedIssue => ({
  provider: "linear",
  identifier: node.identifier,
  title: node.title,
  url: node.url,
  description: node.description ?? undefined,
  status: node.state?.name ?? undefined,
  branchName: node.branchName ?? undefined,
  project: node.project?.name ?? undefined,
  assignees: node.assignee?.displayName ? [node.assignee.displayName] : undefined,
  updatedAt: node.updatedAt ?? undefined,
  fetchedAt: new Date().toISOString(),
});

export const linearAdapter: ProviderAdapter = {
  type: "linear",

  async validate(creds: IntegrationCredentials) {
    const token = requireField(creds, "token");
    const data = await graphqlRequest<{
      viewer: { name?: string; organization?: { name?: string } };
    }>(LINEAR_GRAPHQL_URL, authHeaders(token), `query { viewer { name organization { name } } }`);
    return { displayName: data.viewer.organization?.name ?? data.viewer.name };
  },

  async listIssues(creds: IntegrationCredentials, opts: AdapterListOpts): Promise<IssueListResult> {
    try {
      const token = requireField(creds, "token");
      const data = await graphqlRequest<{ issues: { nodes: LinearIssueNode[] } }>(
        LINEAR_GRAPHQL_URL,
        authHeaders(token),
        `query Issues($first: Int!) {
           issues(first: $first, orderBy: updatedAt) { nodes { ${ISSUE_FIELDS} } }
         }`,
        { first: opts.limit },
      );
      return { success: true, issues: data.issues.nodes.map(toLinkedIssue) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to load Linear issues") };
    }
  },

  async searchIssues(
    creds: IntegrationCredentials,
    opts: AdapterSearchOpts,
  ): Promise<IssueListResult> {
    try {
      const token = requireField(creds, "token");
      const data = await graphqlRequest<{ searchIssues: { nodes: LinearIssueNode[] } }>(
        LINEAR_GRAPHQL_URL,
        authHeaders(token),
        `query Search($term: String!, $first: Int!) {
           searchIssues(term: $term, first: $first) { nodes { ${ISSUE_FIELDS} } }
         }`,
        { term: opts.searchTerm, first: opts.limit },
      );
      return { success: true, issues: data.searchIssues.nodes.map(toLinkedIssue) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to search Linear issues") };
    }
  },

  async getIssueContext(
    creds: IntegrationCredentials,
    opts: AdapterContextOpts,
  ): Promise<IssueContextResult> {
    try {
      const token = requireField(creds, "token");
      const data = await graphqlRequest<{ issue: LinearIssueNode | null }>(
        LINEAR_GRAPHQL_URL,
        authHeaders(token),
        `query Issue($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`,
        { id: opts.identifier },
      );
      if (!data.issue) {
        return { success: false, error: `Issue ${opts.identifier} not found` };
      }
      return { success: true, issue: toLinkedIssue(data.issue) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to load Linear issue") };
    }
  },
};
