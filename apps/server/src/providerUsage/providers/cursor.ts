// FILE: providers/cursor.ts
// Purpose: Live Cursor usage fetcher.

import type { ProviderUsageContext, ProviderUsageFetcher } from "../types";
import { fetchJson, isAuthFailureStatus } from "../http";
import { authErrorSnapshot } from "../base";
import type { ServerProviderUsageSnapshot } from "@t3tools/contracts";
import { resolve } from "path";
import { readSqliteValue } from "../sqlite";

async function resolveCursorToken(ctx: ProviderUsageContext): Promise<string | null> {
  const homeDir = ctx.homeDir || process.env.HOME || process.env.USERPROFILE || "";
  const dbPath = resolve(
    homeDir,
    "Library",
    "Application Support",
    "Cursor",
    "User",
    "globalStorage",
    "state.vscdb",
  );
  try {
    const token = await readSqliteValue(
      dbPath,
      "ItemTable",
      "key",
      "secret::cursorAuth/accessToken",
      "value",
    );
    return token ?? null;
  } catch {
    return null;
  }
}

export const cursorUsageFetcher: ProviderUsageFetcher = {
  provider: "cursor",
  async fetch(ctx: ProviderUsageContext): Promise<ServerProviderUsageSnapshot> {
    const token = await resolveCursorToken(ctx);
    if (!token) {
      return authErrorSnapshot(
        "cursor",
        ctx.nowMs,
        "cursor-db",
        "Sign in to Cursor to view usage.",
      );
    }
    try {
      const result = await fetchJson<Record<string, unknown>>(
        "https://cursor.com/api/dashboard/usage",
        {
          headers: { Authorization: `Bearer ${token}` },
          timeoutMs: 10_000,
        },
      );
      if (isAuthFailureStatus(result.status)) {
        return authErrorSnapshot(
          "cursor",
          ctx.nowMs,
          "cursor-api",
          `Auth rejected (status ${result.status}).`,
        );
      }
      const data = result.data;
      const usageLines: Array<{ label: string; value: string }> = [];
      const usage = (data as Record<string, unknown>).usage as Record<string, unknown> | undefined;
      if (usage) {
        for (const [key, value] of Object.entries(usage)) {
          usageLines.push({
            label: key,
            value: typeof value === "number" ? String(value) : String(value),
          });
        }
      }
      return {
        provider: "cursor",
        updatedAt: new Date(ctx.nowMs).toISOString(),
        limits: [],
        usageLines,
        source: "cursor-api",
      };
    } catch {
      return authErrorSnapshot(
        "cursor",
        ctx.nowMs,
        "cursor-api",
        "Unable to reach Cursor usage API.",
      );
    }
  },
};
