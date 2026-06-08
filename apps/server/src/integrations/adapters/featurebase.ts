import type { IntegrationCredentials, LinkedIssue } from "@t3tools/contracts";

import { restRequest, toErrorMessage } from "./http";
import {
  type AdapterListOpts,
  type AdapterSearchOpts,
  type IssueListResult,
  type ProviderAdapter,
  requireField,
} from "./types";

const FEATUREBASE_BASE = "https://do.featurebase.app/v2";

const authHeaders = (token: string): Record<string, string> => ({ "X-API-Key": token });

interface FeaturebasePost {
  readonly id: string;
  readonly title: string;
  readonly permalink?: string | null;
  readonly postStatus?: { readonly name?: string | null } | null;
  readonly content?: string | null;
  readonly lastModified?: string | null;
  readonly date?: string | null;
}

interface FeaturebaseListResponse {
  readonly results?: FeaturebasePost[];
  readonly posts?: FeaturebasePost[];
}

const stripHtml = (html: string): string => html.replace(/<[^>]+>/g, " ").trim();

const toLinkedIssue = (post: FeaturebasePost): LinkedIssue => ({
  provider: "featurebase",
  identifier: post.id,
  title: post.title,
  url: post.permalink ?? `https://do.featurebase.app/posts/${post.id}`,
  description: post.content ? stripHtml(post.content) : undefined,
  status: post.postStatus?.name ?? undefined,
  branchName: undefined,
  project: undefined,
  assignees: undefined,
  updatedAt: post.lastModified ?? post.date ?? undefined,
  fetchedAt: new Date().toISOString(),
});

export const featurebaseAdapter: ProviderAdapter = {
  type: "featurebase",

  async validate(creds: IntegrationCredentials) {
    const token = requireField(creds, "token");
    // No dedicated /me endpoint; a successful posts call validates the key.
    await restRequest<FeaturebaseListResponse>(
      `${FEATUREBASE_BASE}/posts?limit=1`,
      authHeaders(token),
    );
    return { displayName: "Featurebase" };
  },

  async listIssues(creds: IntegrationCredentials, opts: AdapterListOpts): Promise<IssueListResult> {
    try {
      const token = requireField(creds, "token");
      const data = await restRequest<FeaturebaseListResponse>(
        `${FEATUREBASE_BASE}/posts?limit=${opts.limit}&sortBy=date:desc`,
        authHeaders(token),
      );
      const posts = data.results ?? data.posts ?? [];
      return { success: true, issues: posts.map(toLinkedIssue) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to load Featurebase posts") };
    }
  },

  async searchIssues(
    creds: IntegrationCredentials,
    opts: AdapterSearchOpts,
  ): Promise<IssueListResult> {
    try {
      const token = requireField(creds, "token");
      const data = await restRequest<FeaturebaseListResponse>(
        `${FEATUREBASE_BASE}/posts?q=${encodeURIComponent(opts.searchTerm)}&limit=${opts.limit}`,
        authHeaders(token),
      );
      const posts = data.results ?? data.posts ?? [];
      return { success: true, issues: posts.map(toLinkedIssue) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to search Featurebase posts") };
    }
  },
};
