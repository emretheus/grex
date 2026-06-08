import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { asanaAdapter } from "./asana";

const originalFetch = globalThis.fetch;

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

const meResponse = {
  data: {
    name: "Alice Asana",
    workspaces: [{ gid: "ws-001", name: "Acme" }],
  },
};

const taskFixture = {
  gid: "task-999",
  name: "Ship the feature",
  permalink_url: "https://app.asana.com/0/0/task-999",
  completed: false,
  notes: "Must ship by Q3",
  assignee: { name: "Alice" },
  projects: [{ name: "Q3 Roadmap" }],
  modified_at: "2026-02-01T09:00:00.000Z",
};

describe("asanaAdapter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("validate returns displayName from users/me", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(meResponse));
    const result = await asanaAdapter.validate({ token: "asana_abc" });
    expect(result.displayName).toBe("Alice Asana");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer asana_abc");
  });

  it("validate throws on 401 response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ errors: [{ message: "Not Authorized" }] }, false, 401),
    );
    await expect(asanaAdapter.validate({ token: "bad" })).rejects.toThrow(/401/);
  });

  it("listIssues fetches workspace then tasks and maps them", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(meResponse)) // users/me
      .mockResolvedValueOnce(jsonResponse({ data: [taskFixture] })); // tasks

    const result = await asanaAdapter.listIssues({ token: "asana_abc" }, { limit: 50 });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      provider: "asana",
      identifier: "task-999",
      title: "Ship the feature",
      url: "https://app.asana.com/0/0/task-999",
      status: "Open",
      description: "Must ship by Q3",
      assignees: ["Alice"],
      project: "Q3 Roadmap",
    });
    expect(result.issues[0]?.fetchedAt).toBeTruthy();
  });

  it("listIssues returns failure when no workspace is found", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { name: "Alice", workspaces: [] } }));
    const result = await asanaAdapter.listIssues({ token: "asana_abc" }, { limit: 50 });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toMatch(/No Asana workspace found/);
  });

  it("listIssues returns failure on network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const result = await asanaAdapter.listIssues({ token: "asana_abc" }, { limit: 50 });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toMatch(/ECONNRESET/);
  });

  it("searchIssues uses workspace search endpoint with encoded term", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(meResponse))
      .mockResolvedValueOnce(jsonResponse({ data: [taskFixture] }));

    const result = await asanaAdapter.searchIssues(
      { token: "asana_abc" },
      { searchTerm: "ship it", limit: 10 },
    );
    expect(result.success).toBe(true);
    const [url] = fetchMock.mock.calls[1] as [string];
    expect(url).toContain("workspaces/ws-001/tasks/search");
    expect(url).toContain("text=ship%20it");
  });
});
