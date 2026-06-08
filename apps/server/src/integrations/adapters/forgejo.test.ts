import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forgejoAdapter } from "./forgejo";

const originalFetch = globalThis.fetch;

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

const issueFixture = {
  number: 42,
  title: "Fix the login bug",
  html_url: "https://codeberg.org/acme/app/issues/42",
  state: "open",
  body: "Steps to reproduce...",
  assignees: [{ login: "alice" }],
  repository: { full_name: "acme/app" },
  updated_at: "2026-01-15T12:00:00.000Z",
};

describe("forgejoAdapter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("validate returns displayName from full_name", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ login: "alice", full_name: "Alice Acme" }));
    const result = await forgejoAdapter.validate({
      instanceUrl: "https://codeberg.org",
      token: "abc123",
    });
    expect(result.displayName).toBe("Alice Acme");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/user");
    expect((init.headers as Record<string, string>).authorization).toBe("token abc123");
  });

  it("validate falls back to login when full_name is empty", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ login: "alice", full_name: "" }));
    const result = await forgejoAdapter.validate({
      instanceUrl: "https://codeberg.org",
      token: "abc123",
    });
    expect(result.displayName).toBe("alice");
  });

  it("validate throws on non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "Unauthorized" }, false, 401));
    await expect(
      forgejoAdapter.validate({ instanceUrl: "https://codeberg.org", token: "bad" }),
    ).rejects.toThrow(/401/);
  });

  it("listIssues maps issues to LinkedIssue", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([issueFixture]));
    const result = await forgejoAdapter.listIssues(
      { instanceUrl: "https://codeberg.org", token: "abc123" },
      { limit: 25 },
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      provider: "forgejo",
      identifier: "#42",
      title: "Fix the login bug",
      url: "https://codeberg.org/acme/app/issues/42",
      status: "open",
      description: "Steps to reproduce...",
      assignees: ["alice"],
      project: "acme/app",
    });
    expect(result.issues[0]?.fetchedAt).toBeTruthy();
  });

  it("listIssues returns failure on network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const result = await forgejoAdapter.listIssues(
      { instanceUrl: "https://codeberg.org", token: "abc123" },
      { limit: 25 },
    );
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toMatch(/ECONNRESET/);
  });

  it("searchIssues passes the query term in the URL", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([issueFixture]));
    const result = await forgejoAdapter.searchIssues(
      { instanceUrl: "https://codeberg.org", token: "abc123" },
      { searchTerm: "login bug", limit: 10 },
    );
    expect(result.success).toBe(true);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("q=login%20bug");
    expect(url).toContain("state=all");
  });
});
