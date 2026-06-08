import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gitlabAdapter } from "./gitlab";

const originalFetch = globalThis.fetch;

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

const gitlabIssue = {
  iid: 7,
  title: "Refactor auth module",
  web_url: "https://gitlab.com/acme/app/-/issues/7",
  state: "opened",
  description: "The auth module needs cleanup.",
  updated_at: "2026-01-01T00:00:00.000Z",
  references: { full: "acme/app#7" },
  assignees: [{ name: "Ada Lovelace" }],
};

const creds = {
  instanceUrl: "https://gitlab.com",
  token: "glpat_abc",
};

describe("gitlabAdapter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("validate returns the user name as displayName", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ name: "Ada Lovelace", username: "ada" }));
    const result = await gitlabAdapter.validate(creds);
    expect(result.displayName).toBe("Ada Lovelace");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v4/user");
    expect((init.headers as Record<string, string>)["private-token"]).toBe("glpat_abc");
  });

  it("validate falls back to username when name is absent", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ username: "ada" }));
    const result = await gitlabAdapter.validate(creds);
    expect(result.displayName).toBe("ada");
  });

  it("validate throws on non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "401 Unauthorized" }, false, 401));
    await expect(gitlabAdapter.validate(creds)).rejects.toThrow(/401/);
  });

  it("listIssues maps GitLab issues to LinkedIssue", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([gitlabIssue]));
    const result = await gitlabAdapter.listIssues(creds, { limit: 50 });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      provider: "gitlab",
      identifier: "acme/app#7",
      title: "Refactor auth module",
      url: "https://gitlab.com/acme/app/-/issues/7",
      status: "opened",
      assignees: ["Ada Lovelace"],
    });
    expect(result.issues[0]?.fetchedAt).toBeTruthy();
  });

  it("listIssues returns a failure result on transport error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Connection refused"));
    const result = await gitlabAdapter.listIssues(creds, { limit: 50 });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toMatch(/Connection refused/);
  });

  it("searchIssues hits the correct URL with encoded search term", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([gitlabIssue]));
    const result = await gitlabAdapter.searchIssues(creds, {
      searchTerm: "auth module",
      limit: 15,
    });
    expect(result.success).toBe(true);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("scope=all");
    expect(url).toContain("auth%20module");
  });
});
