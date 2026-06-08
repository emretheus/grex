import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jiraAdapter } from "./jira";

const originalFetch = globalThis.fetch;

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

const jiraIssue = {
  key: "PROJ-42",
  fields: {
    summary: "Handle null pointer in auth flow",
    status: { name: "In Progress" },
    assignee: { displayName: "Ada Lovelace" },
    project: { name: "Project Alpha" },
    updated: "2026-01-01T00:00:00.000Z",
  },
};

const creds = {
  siteUrl: "https://acme.atlassian.net",
  email: "ada@acme.com",
  token: "jira_token_abc",
};

describe("jiraAdapter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("validate returns the displayName from /myself", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ displayName: "Ada Lovelace" }));
    const result = await jiraAdapter.validate(creds);
    expect(result.displayName).toBe("Ada Lovelace");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/rest/api/3/myself");
    const authHeader = (init.headers as Record<string, string>).authorization;
    expect(authHeader).toMatch(/^Basic /);
  });

  it("validate throws on non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "Unauthorized" }, false, 401));
    await expect(jiraAdapter.validate(creds)).rejects.toThrow(/401/);
  });

  it("listIssues maps Jira issues to LinkedIssue", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ issues: [jiraIssue] }));
    const result = await jiraAdapter.listIssues(creds, { limit: 50 });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      provider: "jira",
      identifier: "PROJ-42",
      title: "Handle null pointer in auth flow",
      url: "https://acme.atlassian.net/browse/PROJ-42",
      status: "In Progress",
      project: "Project Alpha",
      assignees: ["Ada Lovelace"],
    });
    expect(result.issues[0]?.fetchedAt).toBeTruthy();
  });

  it("listIssues returns a failure result on transport error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network timeout"));
    const result = await jiraAdapter.listIssues(creds, { limit: 50 });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toMatch(/Network timeout/);
  });

  it("searchIssues uses text ~ JQL and maps results", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ issues: [jiraIssue] }));
    const result = await jiraAdapter.searchIssues(creds, { searchTerm: "auth flow", limit: 20 });
    expect(result.success).toBe(true);
    const [url] = fetchMock.mock.calls[0] as [string];
    // encodeURIComponent encodes space as %20 and leaves ~ unencoded
    expect(url).toContain("text%20~");
  });

  it("validate throws when a credential field is missing", async () => {
    await expect(
      jiraAdapter.validate({ siteUrl: "https://x.atlassian.net", token: "t" }),
    ).rejects.toThrow(/Missing required credential: email/);
  });
});
