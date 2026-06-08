import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { linearAdapter } from "./linear";

const originalFetch = globalThis.fetch;

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

const issueNode = {
  identifier: "ENG-123",
  title: "Fix the thing",
  url: "https://linear.app/acme/issue/ENG-123",
  description: "details",
  branchName: "eng-123-fix-the-thing",
  updatedAt: "2026-01-01T00:00:00.000Z",
  state: { name: "In Progress" },
  project: { name: "Platform" },
  assignee: { displayName: "Ada" },
};

describe("linearAdapter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("validate returns the organization name", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { viewer: { name: "Ada", organization: { name: "Acme" } } } }),
    );
    const result = await linearAdapter.validate({ token: "lin_abc" });
    expect(result.displayName).toBe("Acme");

    // The token is sent in the Authorization header, not the body.
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe("lin_abc");
  });

  it("validate throws on a GraphQL error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ errors: [{ message: "Authentication required" }] }),
    );
    await expect(linearAdapter.validate({ token: "bad" })).rejects.toThrow(
      /Authentication required/,
    );
  });

  it("validate throws when the token field is missing", async () => {
    await expect(linearAdapter.validate({})).rejects.toThrow(/Missing required credential: token/);
  });

  it("listIssues maps nodes to LinkedIssue", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { issues: { nodes: [issueNode] } } }));
    const result = await linearAdapter.listIssues({ token: "lin_abc" }, { limit: 50 });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      provider: "linear",
      identifier: "ENG-123",
      title: "Fix the thing",
      url: "https://linear.app/acme/issue/ENG-123",
      status: "In Progress",
      project: "Platform",
      branchName: "eng-123-fix-the-thing",
      assignees: ["Ada"],
    });
    expect(result.issues[0]?.fetchedAt).toBeTruthy();
  });

  it("listIssues returns a failure result on transport error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const result = await linearAdapter.listIssues({ token: "lin_abc" }, { limit: 50 });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toMatch(/ECONNRESET/);
  });

  it("searchIssues passes the term and maps results", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { searchIssues: { nodes: [issueNode] } } }),
    );
    const result = await linearAdapter.searchIssues(
      { token: "lin_abc" },
      { searchTerm: "thing", limit: 25 },
    );
    expect(result.success).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { variables: { term: string; first: number } };
    expect(body.variables).toEqual({ term: "thing", first: 25 });
  });

  it("getIssueContext returns a not-found failure when the issue is null", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { issue: null } }));
    const result = await linearAdapter.getIssueContext?.(
      { token: "lin_abc" },
      { identifier: "ENG-999" },
    );
    expect(result?.success).toBe(false);
    if (result?.success) throw new Error("expected failure");
    expect(result?.error).toMatch(/ENG-999/);
  });
});
