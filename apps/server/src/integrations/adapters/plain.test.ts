import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { plainAdapter } from "./plain";

const originalFetch = globalThis.fetch;

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

const threadNode = {
  id: "th_01abc",
  title: "Customer cannot log in",
  status: "TODO",
  customer: { fullName: "Bob Smith" },
  updatedAt: "2026-03-10T12:00:00.000Z",
};

describe("plainAdapter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("validate returns workspace name as displayName", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { myWorkspace: { name: "Acme Support" } } }),
    );
    const result = await plainAdapter.validate({ token: "plain_key_abc" });
    expect(result.displayName).toBe("Acme Support");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer plain_key_abc");
  });

  it("validate throws when token is missing", async () => {
    await expect(plainAdapter.validate({})).rejects.toThrow(/Missing required credential: token/);
  });

  it("validate throws on a GraphQL error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ errors: [{ message: "Authentication failed" }] }),
    );
    await expect(plainAdapter.validate({ token: "bad" })).rejects.toThrow(/Authentication failed/);
  });

  it("listIssues maps thread edges to LinkedIssue", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { threads: { edges: [{ node: threadNode }] } } }),
    );
    const result = await plainAdapter.listIssues({ token: "plain_key_abc" }, { limit: 50 });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      provider: "plain",
      identifier: "th_01abc",
      title: "Customer cannot log in",
      url: "https://app.plain.com/workspace/thread/th_01abc",
      status: "TODO",
      assignees: ["Bob Smith"],
      updatedAt: "2026-03-10T12:00:00.000Z",
    });
    expect(result.issues[0]?.fetchedAt).toBeTruthy();
  });

  it("listIssues returns a failure result on transport error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await plainAdapter.listIssues({ token: "plain_key_abc" }, { limit: 50 });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toMatch(/ECONNREFUSED/);
  });

  it("searchIssues filters threads client-side by title (case-insensitive)", async () => {
    const secondThread = { ...threadNode, id: "th_02def", title: "Billing question" };
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          threads: {
            edges: [{ node: threadNode }, { node: secondThread }],
          },
        },
      }),
    );
    const result = await plainAdapter.searchIssues(
      { token: "plain_key_abc" },
      { searchTerm: "LOG IN", limit: 50 },
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.identifier).toBe("th_01abc");
  });

  it("getIssueContext returns not-found failure when thread is null", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { thread: null } }));
    const result = await plainAdapter.getIssueContext?.(
      { token: "plain_key_abc" },
      { identifier: "th_missing" },
    );
    expect(result?.success).toBe(false);
    if (result?.success) throw new Error("expected failure");
    expect(result?.error).toMatch(/th_missing/);
  });
});
