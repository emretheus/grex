import type { IntegrationCredentials, LinkedIssue } from "@t3tools/contracts";

import { restRequest, toErrorMessage } from "./http";
import {
  type AdapterContextOpts,
  type AdapterListOpts,
  type AdapterSearchOpts,
  type IssueContextResult,
  type IssueListResult,
  type ProviderAdapter,
  requireField,
} from "./types";

const TRELLO_BASE = "https://api.trello.com/1";

const auth = (creds: IntegrationCredentials): string =>
  `key=${requireField(creds, "apiKey")}&token=${requireField(creds, "token")}`;

interface TrelloCard {
  readonly id: string;
  readonly shortLink?: string | null;
  readonly name: string;
  readonly url: string;
  readonly desc?: string | null;
  readonly dateLastActivity?: string | null;
}

const toLinkedIssue = (card: TrelloCard): LinkedIssue => ({
  provider: "trello",
  identifier: card.shortLink ?? card.id,
  title: card.name,
  url: card.url,
  description: card.desc ?? undefined,
  status: undefined,
  branchName: undefined,
  project: undefined,
  assignees: undefined,
  updatedAt: card.dateLastActivity ?? undefined,
  fetchedAt: new Date().toISOString(),
});

export const trelloAdapter: ProviderAdapter = {
  type: "trello",

  async validate(creds: IntegrationCredentials) {
    const a = auth(creds);
    const data = await restRequest<{ fullName?: string; username?: string }>(
      `${TRELLO_BASE}/members/me?${a}`,
      {},
    );
    return { displayName: data.fullName ?? data.username ?? undefined };
  },

  async listIssues(creds: IntegrationCredentials, opts: AdapterListOpts): Promise<IssueListResult> {
    try {
      const a = auth(creds);
      const cards = await restRequest<TrelloCard[]>(
        `${TRELLO_BASE}/members/me/cards?${a}&fields=id,shortLink,name,url,desc,dateLastActivity&limit=${opts.limit}`,
        {},
      );
      return { success: true, issues: cards.map(toLinkedIssue) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to load Trello cards") };
    }
  },

  async searchIssues(
    creds: IntegrationCredentials,
    opts: AdapterSearchOpts,
  ): Promise<IssueListResult> {
    try {
      const a = auth(creds);
      const data = await restRequest<{ cards?: TrelloCard[] }>(
        `${TRELLO_BASE}/search?${a}&query=${encodeURIComponent(opts.searchTerm)}&modelTypes=cards&cards_limit=${opts.limit}&card_fields=id,shortLink,name,url,desc,dateLastActivity`,
        {},
      );
      return { success: true, issues: (data.cards ?? []).map(toLinkedIssue) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to search Trello cards") };
    }
  },

  async getIssueContext(
    creds: IntegrationCredentials,
    opts: AdapterContextOpts,
  ): Promise<IssueContextResult> {
    try {
      const a = auth(creds);
      const card = await restRequest<TrelloCard>(
        `${TRELLO_BASE}/cards/${opts.identifier}?${a}&fields=id,shortLink,name,url,desc,dateLastActivity`,
        {},
      );
      return { success: true, issue: toLinkedIssue(card) };
    } catch (cause) {
      return { success: false, error: toErrorMessage(cause, "Failed to load Trello card") };
    }
  },
};
