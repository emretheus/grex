import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { githubAdapter } from "./github";

const originalFetch = globalThis.fetch;

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

const issueItem = {
  number: 42,
  title: "Fix the login bug",
  html_url: "https://github.com/acme/app/issues/42",
  state: "open",
  body: "Steps to reproduce…",
  updated_at: "2026-01-01T00:00:00.000Z",
  repository: { full_name: "acme/app" },
  assignees: [{ login: "ada" }],
};

describe("githubAdapter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("validate returns the user login as displayName", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ login: "ada" }));
    const result = await githubAdapter.validate({ token: "ghp_abc" });
    expect(result.displayName).toBe("ada");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/user");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ghp_abc");
  });

  it("validate throws on non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "Bad credentials" }, false, 401));
    await expect(githubAdapter.validate({ token: "bad" })).rejects.toThrow(/401/);
  });

  it("listIssues maps items and filters out pull requests", async () => {
    const prItem = { ...issueItem, number: 99, pull_request: { url: "…" } };
    fetchMock.mockResolvedValueOnce(jsonResponse([issueItem, prItem]));
    const result = await githubAdapter.listIssues({ token: "ghp_abc" }, { limit: 25 });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      provider: "github",
      identifier: "acme/app#42",
      title: "Fix the login bug",
      url: "https://github.com/acme/app/issues/42",
      status: "open",
      project: "acme/app",
      assignees: ["ada"],
    });
    expect(result.issues[0]?.fetchedAt).toBeTruthy();
  });

  it("listIssues returns a failure result on transport error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await githubAdapter.listIssues({ token: "ghp_abc" }, { limit: 25 });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toMatch(/ECONNREFUSED/);
  });

  it("searchIssues appends is:issue to the query and maps search items", async () => {
    const searchItem = { ...issueItem, repository_url: "https://api.github.com/repos/acme/app" };
    // Remove repository field to simulate search response shape
    const { repository: _repo, ...searchItemNoRepo } = searchItem;
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [searchItemNoRepo] }));
    const result = await githubAdapter.searchIssues(
      { token: "ghp_abc" },
      { searchTerm: "login bug", limit: 10 },
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.issues).toHaveLength(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("is%3Aissue");
    expect(result.issues[0]?.identifier).toBe("acme/app#42");
  });

  it("searchIssues returns a failure result on non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "Unprocessable" }, false, 422));
    const result = await githubAdapter.searchIssues(
      { token: "ghp_abc" },
      { searchTerm: "foo", limit: 10 },
    );
    expect(result.success).toBe(false);
  });
});
