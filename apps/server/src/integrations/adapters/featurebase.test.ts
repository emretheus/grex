import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { featurebaseAdapter } from "./featurebase";

const originalFetch = globalThis.fetch;

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

const postFixture = {
  id: "post-001",
  title: "Add dark mode",
  permalink: "https://feedback.example.com/posts/add-dark-mode",
  postStatus: { name: "In Review" },
  content: "<p>We <b>need</b> dark mode.</p>",
  lastModified: "2026-02-01T08:00:00.000Z",
};

describe("featurebaseAdapter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("validate returns fixed displayName on success", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }));
    const result = await featurebaseAdapter.validate({ token: "fb_key_abc" });
    expect(result.displayName).toBe("Featurebase");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("fb_key_abc");
  });

  it("validate throws when token is missing", async () => {
    await expect(featurebaseAdapter.validate({})).rejects.toThrow(
      /Missing required credential: token/,
    );
  });

  it("validate throws on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "Unauthorized" }, false, 401));
    await expect(featurebaseAdapter.validate({ token: "bad" })).rejects.toThrow(/401/);
  });

  it("listIssues maps posts to LinkedIssue and strips HTML from content", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [postFixture] }));
    const result = await featurebaseAdapter.listIssues({ token: "fb_key_abc" }, { limit: 50 });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      provider: "featurebase",
      identifier: "post-001",
      title: "Add dark mode",
      url: "https://feedback.example.com/posts/add-dark-mode",
      status: "In Review",
      updatedAt: "2026-02-01T08:00:00.000Z",
    });
    // HTML tags must be stripped from description
    expect(result.issues[0]?.description).not.toContain("<p>");
    expect(result.issues[0]?.description).toContain("dark mode");
    expect(result.issues[0]?.fetchedAt).toBeTruthy();
  });

  it("listIssues falls back to data.posts when data.results is absent", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ posts: [postFixture] }));
    const result = await featurebaseAdapter.listIssues({ token: "fb_key_abc" }, { limit: 50 });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.issues).toHaveLength(1);
  });

  it("listIssues returns a failure result on transport error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network timeout"));
    const result = await featurebaseAdapter.listIssues({ token: "fb_key_abc" }, { limit: 50 });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toMatch(/Network timeout/);
  });
});
