import type { IntegrationCredentials, LinkedIssue } from "@t3tools/contracts";

import { restRequest, toErrorMessage } from "./http";
import {
  type AdapterListOpts,
  type AdapterSearchOpts,
  type IssueListResult,
  type ProviderAdapter,
  requireField,
} from "./types";

const ASANA_BASE = "https://app.asana.com/api/1.0";

const authHeaders = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
});

const clampLimit = (limit: number): number => Math.min(Math.max(limit, 1), 100);

const OPT_FIELDS = "name,permalink_url,completed,notes,assignee.name,projects.name,modified_at";

interface AsanaUser {
  readonly name?: string | null;
  readonly workspaces?: ReadonlyArray<{
    readonly gid: string;
    readonly name?: string | null;
  }> | null;
}

interface AsanaTask {
  readonly gid: string;
  readonly name?: string | null;
  readonly permalink_url?: string | null;
  readonly completed?: boolean | null;
  readonly notes?: string | null;
  readonly assignee?: { readonly name?: string | null } | null;
  readonly projects?: ReadonlyArray<{ readonly name?: string | null }> | null;
  readonly modified_at?: string | null;
}

interface AsanaMeResponse {
  readonly data: AsanaUser;
}

interface AsanaTasksResponse {
  readonly data: AsanaTask[];
}

const toLinkedIssue = (task: AsanaTask): LinkedIssue => ({
  provider: "asana",
  identifier: task.gid,
  title: task.name ?? task.gid,
  url: task.permalink_url ?? `https://app.asana.com/0/0/${task.gid}`,
  status: task.completed ? "Completed" : "Open",
  description: task.notes ?? undefined,
  assignees: task.assignee?.name ? [task.assignee.name] : undefined,
  project: task.projects?.[0]?.name ?? undefined,
  updatedAt: task.modified_at ?? undefined,
  fetchedAt: new Date().toISOString(),
});

const getWorkspaceGid = async (token: string): Promise<string | null> => {
  const me = await restRequest<AsanaMeResponse>(`${ASANA_BASE}/users/me`, authHeaders(token));
  return me.data.workspaces?.[0]?.gid ?? null;
};

export const asanaAdapter: ProviderAdapter = {
  type: "asana",

  async validate(creds: IntegrationCredentials) {
    const token = requireField(creds, "token");
    const me = await restRequest<AsanaMeResponse>(`${ASANA_BASE}/users/me`, authHeaders(token));
    return { displayName: me.data.name ?? undefined };
  },

  async listIssues(creds: IntegrationCredentials, opts: AdapterListOpts): Promise<IssueListResult> {
    try {
      const token = requireField(creds, "token");
      const limit = clampLimit(opts.limit);
      const gid = await getWorkspaceGid(token);
      if (!gid) {
        return { success: false, error: "No Asana workspace found" };
      }
      const tasks = await restRequest<AsanaTasksResponse>(
        `${ASANA_BASE}/tasks?assignee=me&workspace=${gid}&completed_since=now&limit=${limit}&opt_fields=${OPT_FIELDS}`,
        authHeaders(token),
      );
      return { success: true, issues: tasks.data.map(toLinkedIssue) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to load Asana tasks") };
    }
  },

  async searchIssues(
    creds: IntegrationCredentials,
    opts: AdapterSearchOpts,
  ): Promise<IssueListResult> {
    try {
      const token = requireField(creds, "token");
      const limit = clampLimit(opts.limit);
      const gid = await getWorkspaceGid(token);
      if (!gid) {
        return { success: false, error: "No Asana workspace found" };
      }
      const tasks = await restRequest<AsanaTasksResponse>(
        `${ASANA_BASE}/workspaces/${gid}/tasks/search?text=${encodeURIComponent(opts.searchTerm)}&limit=${limit}&opt_fields=${OPT_FIELDS}`,
        authHeaders(token),
      );
      return { success: true, issues: tasks.data.map(toLinkedIssue) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to search Asana tasks") };
    }
  },
};
