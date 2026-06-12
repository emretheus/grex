// FILE: claude.test.ts
// Purpose: Unit tests for parseClaudeUsage — verifies that the Anthropic usage API
// response is correctly parsed into ServerProviderUsageSnapshot with limits (5h, Weekly,
// Sonnet, Opus) and extra-usage credits.

import { describe, expect, it } from "vitest";

import { parseClaudeUsage } from "./claude";

describe("parseClaudeUsage", () => {
  it("parses five_hour and seven_day utilization into limits with usedPercent", () => {
    const result = parseClaudeUsage({
      data: {
        five_hour: { utilization: 29, resets_at: "2026-06-10T15:00:00Z" },
        seven_day: { utilization: 45 },
      },
      nowMs: Date.parse("2026-06-10T12:00:00Z"),
    });

    expect(result.provider).toBe("claudeAgent");
    expect(result.limits).toHaveLength(2);

    const fiveHour = result.limits.find((l) => l.window === "5h");
    expect(fiveHour).toBeDefined();
    expect(fiveHour!.usedPercent).toBe(29);
    expect(fiveHour!.windowDurationMins).toBe(300);
    expect(fiveHour!.resetsAt).toBe("2026-06-10T15:00:00.000Z");

    const weekly = result.limits.find((l) => l.window === "Weekly");
    expect(weekly).toBeDefined();
    expect(weekly!.usedPercent).toBe(45);
    expect(weekly!.windowDurationMins).toBe(10080);
    expect(weekly!.resetsAt).toBeUndefined();
  });

  it("parses seven_day_sonnet and seven_day_opus windows", () => {
    const result = parseClaudeUsage({
      data: {
        seven_day_sonnet: { utilization: 60 },
        seven_day_opus: { utilization: 80 },
      },
      nowMs: Date.parse("2026-06-10T12:00:00Z"),
    });

    expect(result.limits).toHaveLength(2);

    const sonnet = result.limits.find((l) => l.window === "Sonnet");
    expect(sonnet).toBeDefined();
    expect(sonnet!.usedPercent).toBe(60);
    expect(sonnet!.windowDurationMins).toBe(10080);

    const opus = result.limits.find((l) => l.window === "Opus");
    expect(opus).toBeDefined();
    expect(opus!.usedPercent).toBe(80);
    expect(opus!.windowDurationMins).toBe(10080);
  });

  it("parses extra_usage credits into usageLines", () => {
    const result = parseClaudeUsage({
      data: {
        five_hour: { utilization: 10 },
        extra_usage: {
          is_enabled: true,
          used_credits: 1500,
          monthly_limit: 50000,
        },
      },
      nowMs: Date.parse("2026-06-10T12:00:00Z"),
    });

    expect(result.usageLines).toHaveLength(1);
    expect(result.usageLines[0]!.label).toBe("Extra usage");
    expect(result.usageLines[0]!.value).toContain("$15.00");
    expect(result.usageLines[0]!.value).toContain("$500.00");
  });

  it("skips extra_usage when is_enabled is false", () => {
    const result = parseClaudeUsage({
      data: {
        five_hour: { utilization: 10 },
        extra_usage: {
          is_enabled: false,
          used_credits: 1500,
        },
      },
      nowMs: Date.parse("2026-06-10T12:00:00Z"),
    });

    expect(result.usageLines).toHaveLength(0);
  });

  it("skips windows with no utilization or resets_at", () => {
    const result = parseClaudeUsage({
      data: {
        five_hour: { something_else: "not utilization" },
        seven_day: {},
      },
      nowMs: Date.parse("2026-06-10T12:00:00Z"),
    });

    expect(result.limits).toHaveLength(0);
  });

  it("returns empty limits and usageLines for empty data", () => {
    const result = parseClaudeUsage({
      data: {},
      nowMs: Date.parse("2026-06-10T12:00:00Z"),
    });

    expect(result.limits).toHaveLength(0);
    expect(result.usageLines).toHaveLength(0);
    expect(result.source).toBe("claude-oauth-usage");
  });

  it("formats extra_usage without monthly_limit", () => {
    const result = parseClaudeUsage({
      data: {
        five_hour: { utilization: 50 },
        extra_usage: {
          used_credits: 250,
        },
      },
      nowMs: Date.parse("2026-06-10T12:00:00Z"),
    });

    expect(result.usageLines).toHaveLength(1);
    expect(result.usageLines[0]!.value).toContain("$2.50 spent");
  });

  it("clamps utilization to 0-100 range", () => {
    const result = parseClaudeUsage({
      data: {
        five_hour: { utilization: 150 },
        seven_day: { utilization: -5 },
      },
      nowMs: Date.parse("2026-06-10T12:00:00Z"),
    });

    const fiveHour = result.limits.find((l) => l.window === "5h");
    expect(fiveHour!.usedPercent).toBe(100);

    const weekly = result.limits.find((l) => l.window === "Weekly");
    expect(weekly!.usedPercent).toBe(0);
  });

  it("sets updatedAt from nowMs", () => {
    const nowMs = Date.parse("2026-06-10T14:30:00Z");
    const result = parseClaudeUsage({
      data: { five_hour: { utilization: 42 } },
      nowMs,
    });

    expect(result.updatedAt).toBe("2026-06-10T14:30:00.000Z");
  });
});
