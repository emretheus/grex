import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trelloAdapter } from "./trello";

const originalFetch = globalThis.fetch;

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

const cardFixture = {
  id: "abc123",
  shortLink: "XyZ789",
  name: "Build the thing",
  url: "https://trello.com/c/XyZ789/build-the-thing",
  desc: "Some description",
  dateLastActivity: "2026-01-15T10:00:00.000Z",
};

describe("trelloAdapter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("validate returns fullName as displayName", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ fullName: "Ada Lovelace", username: "ada" }));
    const result = await trelloAdapter.validate({ apiKey: "key123", token: "tok456" });
    expect(result.displayName).toBe("Ada Lovelace");

    // Credentials must be in the URL query string, NOT headers.
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("key=key123");
    expect(url).toContain("token=tok456");
  });

  it("validate throws when apiKey is missing", async () => {
    await expect(trelloAdapter.validate({ token: "tok456" })).rejects.toThrow(
      /Missing required credential: apiKey/,
    );
  });

  it("validate throws on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "invalid key" }, false, 401));
    await expect(trelloAdapter.validate({ apiKey: "bad", token: "bad" })).rejects.toThrow(/401/);
  });

  it("listIssues maps cards to LinkedIssue using shortLink as identifier", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([cardFixture]));
    const result = await trelloAdapter.listIssues(
      { apiKey: "key123", token: "tok456" },
      { limit: 50 },
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      provider: "trello",
      identifier: "XyZ789",
      title: "Build the thing",
      url: "https://trello.com/c/XyZ789/build-the-thing",
      description: "Some description",
      updatedAt: "2026-01-15T10:00:00.000Z",
    });
    expect(result.issues[0]?.fetchedAt).toBeTruthy();
  });

  it("listIssues falls back to card id when shortLink is absent", async () => {
    const cardNoShortLink = { ...cardFixture, shortLink: null };
    fetchMock.mockResolvedValueOnce(jsonResponse([cardNoShortLink]));
    const result = await trelloAdapter.listIssues(
      { apiKey: "key123", token: "tok456" },
      { limit: 50 },
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.issues[0]?.identifier).toBe("abc123");
  });

  it("listIssues returns a failure result on transport error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const result = await trelloAdapter.listIssues(
      { apiKey: "key123", token: "tok456" },
      { limit: 50 },
    );
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toMatch(/ECONNRESET/);
  });

  it("searchIssues sends query to the search endpoint and maps cards", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ cards: [cardFixture] }));
    const result = await trelloAdapter.searchIssues(
      { apiKey: "key123", token: "tok456" },
      { searchTerm: "build", limit: 25 },
    );
    expect(result.success).toBe(true);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/search");
    expect(url).toContain("query=build");
  });
});
