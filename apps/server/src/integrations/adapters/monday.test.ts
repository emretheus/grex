import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mondayAdapter } from "./monday";

const originalFetch = globalThis.fetch;

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

const boardsResponse = {
  data: {
    boards: [
      {
        id: "board-1",
        name: "Engineering",
        items_page: {
          items: [
            {
              id: "item-101",
              name: "Build the widget",
              url: "https://view.monday.com/item-101",
              state: null,
              column_values: [{ id: "status", text: "In Progress" }],
              updated_at: "2026-03-10T10:00:00.000Z",
            },
          ],
        },
      },
    ],
  },
};

describe("mondayAdapter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("validate returns account name", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { me: { name: "Alice" }, account: { name: "Acme Corp" } } }),
    );
    const result = await mondayAdapter.validate({ token: "monday_tok" });
    expect(result.displayName).toBe("Acme Corp");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe("monday_tok");
  });

  it("validate falls back to me.name when account is absent", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { me: { name: "Alice" }, account: null } }),
    );
    const result = await mondayAdapter.validate({ token: "monday_tok" });
    expect(result.displayName).toBe("Alice");
  });

  it("validate throws on GraphQL error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ errors: [{ message: "Invalid API token" }] }));
    await expect(mondayAdapter.validate({ token: "bad" })).rejects.toThrow(/Invalid API token/);
  });

  it("listIssues flattens boards and maps items to LinkedIssue", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(boardsResponse));
    const result = await mondayAdapter.listIssues({ token: "monday_tok" }, { limit: 50 });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      provider: "monday",
      identifier: "item-101",
      title: "Build the widget",
      url: "https://view.monday.com/item-101",
      status: "In Progress",
      project: "Engineering",
    });
    expect(result.issues[0]?.fetchedAt).toBeTruthy();
  });

  it("listIssues returns failure on transport error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const result = await mondayAdapter.listIssues({ token: "monday_tok" }, { limit: 50 });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toMatch(/ECONNRESET/);
  });

  it("searchIssues filters items by name case-insensitively", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(boardsResponse));
    const result = await mondayAdapter.searchIssues(
      { token: "monday_tok" },
      { searchTerm: "WIDGET", limit: 50 },
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.title).toBe("Build the widget");
  });

  it("getIssueContext returns the item as LinkedIssue", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: [
            {
              id: "item-101",
              name: "Build the widget",
              url: "https://view.monday.com/item-101",
              updated_at: "2026-03-10T10:00:00.000Z",
              column_values: [{ id: "status", text: "Done" }],
            },
          ],
        },
      }),
    );
    const result = await mondayAdapter.getIssueContext?.(
      { token: "monday_tok" },
      { identifier: "item-101" },
    );
    expect(result?.success).toBe(true);
    if (!result?.success) throw new Error("expected success");
    expect(result.issue.identifier).toBe("item-101");
    expect(result.issue.status).toBe("Done");
  });

  it("getIssueContext returns failure when item not found", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { items: [] } }));
    const result = await mondayAdapter.getIssueContext?.(
      { token: "monday_tok" },
      { identifier: "item-999" },
    );
    expect(result?.success).toBe(false);
    if (result?.success) throw new Error("expected failure");
    expect(result?.error).toMatch(/item-999/);
  });
});
