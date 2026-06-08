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

const MONDAY_URL = "https://api.monday.com/v2";

const authHeaders = (token: string): Record<string, string> => ({
  authorization: token,
});

interface MondayColumnValue {
  readonly id: string;
  readonly text?: string | null;
}

interface MondayItem {
  readonly id: string;
  readonly name?: string | null;
  readonly url?: string | null;
  readonly state?: string | null;
  readonly column_values?: ReadonlyArray<MondayColumnValue> | null;
  readonly updated_at?: string | null;
}

interface MondayBoard {
  readonly id: string;
  readonly name?: string | null;
  readonly items_page?: {
    readonly items?: ReadonlyArray<MondayItem> | null;
  } | null;
}

const firstNonEmptyColumnText = (
  columns?: ReadonlyArray<MondayColumnValue> | null,
): string | undefined => {
  if (!columns) return undefined;
  // TODO: Monday status requires knowing the specific column id per board; for
  // now we return the first non-empty column text value as a best-effort status.
  for (const col of columns) {
    if (col.text && col.text.trim().length > 0) return col.text;
  }
  return undefined;
};

const toLinkedIssue = (item: MondayItem, boardName?: string): LinkedIssue => ({
  provider: "monday",
  identifier: item.id,
  title: item.name ?? item.id,
  url: item.url ?? `https://view.monday.com/${item.id}`,
  status: firstNonEmptyColumnText(item.column_values),
  project: boardName ?? undefined,
  updatedAt: item.updated_at ?? undefined,
  fetchedAt: new Date().toISOString(),
});

const BOARDS_QUERY = `
  query ($limit: Int!) {
    boards(limit: 25) {
      id
      name
      items_page(limit: $limit) {
        items {
          id
          name
          url
          state
          column_values { id text }
          updated_at
        }
      }
    }
  }
`;

const ITEM_QUERY = `
  query ($ids: [ID!]) {
    items(ids: $ids) {
      id
      name
      url
      updated_at
      column_values { id text }
    }
  }
`;

export const mondayAdapter: ProviderAdapter = {
  type: "monday",

  async validate(creds: IntegrationCredentials) {
    const token = requireField(creds, "token");
    const data = await graphqlRequest<{
      me?: { name?: string | null } | null;
      account?: { name?: string | null } | null;
    }>(MONDAY_URL, authHeaders(token), `{ me { name } account { name } }`);
    return { displayName: data.account?.name ?? data.me?.name ?? undefined };
  },

  async listIssues(creds: IntegrationCredentials, opts: AdapterListOpts): Promise<IssueListResult> {
    try {
      const token = requireField(creds, "token");
      const data = await graphqlRequest<{ boards?: ReadonlyArray<MondayBoard> | null }>(
        MONDAY_URL,
        authHeaders(token),
        BOARDS_QUERY,
        { limit: opts.limit },
      );
      const issues: LinkedIssue[] = [];
      for (const board of data.boards ?? []) {
        for (const item of board.items_page?.items ?? []) {
          issues.push(toLinkedIssue(item, board.name ?? undefined));
          if (issues.length >= opts.limit) break;
        }
        if (issues.length >= opts.limit) break;
      }
      return { success: true, issues };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to load Monday.com items") };
    }
  },

  async searchIssues(
    creds: IntegrationCredentials,
    opts: AdapterSearchOpts,
  ): Promise<IssueListResult> {
    try {
      // Monday lacks server-side item search; filter client-side
      const token = requireField(creds, "token");
      const data = await graphqlRequest<{ boards?: ReadonlyArray<MondayBoard> | null }>(
        MONDAY_URL,
        authHeaders(token),
        BOARDS_QUERY,
        { limit: 100 },
      );
      const term = opts.searchTerm.toLowerCase();
      const issues: LinkedIssue[] = [];
      for (const board of data.boards ?? []) {
        for (const item of board.items_page?.items ?? []) {
          if ((item.name ?? "").toLowerCase().includes(term)) {
            issues.push(toLinkedIssue(item, board.name ?? undefined));
            if (issues.length >= opts.limit) break;
          }
        }
        if (issues.length >= opts.limit) break;
      }
      return { success: true, issues };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to search Monday.com items") };
    }
  },

  async getIssueContext(
    creds: IntegrationCredentials,
    opts: AdapterContextOpts,
  ): Promise<IssueContextResult> {
    try {
      const token = requireField(creds, "token");
      const data = await graphqlRequest<{
        items?: ReadonlyArray<MondayItem> | null;
      }>(MONDAY_URL, authHeaders(token), ITEM_QUERY, { ids: [opts.identifier] });
      const item = data.items?.[0];
      if (!item) {
        return { success: false, error: `Item ${opts.identifier} not found` };
      }
      return { success: true, issue: toLinkedIssue(item) };
    } catch (cause) {
      return {
        success: false,
        error: toErrorMessage(cause, "Failed to load Monday.com item"),
      };
    }
  },
};
