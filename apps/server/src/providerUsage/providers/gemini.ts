// FILE: providers/gemini.ts
// Purpose: Live Gemini usage fetcher.

import type { ProviderUsageContext, ProviderUsageFetcher } from "../types";
import { fetchJson, isAuthFailureStatus } from "../http";
import { authErrorSnapshot } from "../base";
import { readJsonFile, isJwtExpired } from "../credentials";
import type { ServerProviderUsageSnapshot } from "@t3tools/contracts";
import { resolve } from "path";

async function resolveGeminiToken(ctx: ProviderUsageContext): Promise<string | null> {
  const homeDir = ctx.homeDir || process.env.HOME || process.env.USERPROFILE || "";
  const oauthPath = resolve(homeDir, ".gemini", "oauth_creds.json");
  const creds = readJsonFile<{ access_token?: string; refresh_token?: string }>(oauthPath);
  if (creds?.access_token && !isJwtExpired(creds.access_token, ctx.nowMs))
    return creds.access_token;
  return null;
}

export const geminiUsageFetcher: ProviderUsageFetcher = {
  provider: "gemini",
  async fetch(ctx: ProviderUsageContext): Promise<ServerProviderUsageSnapshot> {
    const token = await resolveGeminiToken(ctx);
    if (!token) {
      return authErrorSnapshot(
        "gemini",
        ctx.nowMs,
        "gemini-oauth",
        "Run `gemini` to authenticate and view usage.",
      );
    }
    try {
      const result = await fetchJson<Record<string, unknown>>(
        "https://generativelanguage.googleapis.com/v1beta/quota",
        {
          headers: { Authorization: `Bearer ${token}` },
          timeoutMs: 10_000,
        },
      );
      if (isAuthFailureStatus(result.status)) {
        return authErrorSnapshot(
          "gemini",
          ctx.nowMs,
          "gemini-api",
          `Auth rejected (status ${result.status}).`,
        );
      }
      const data = result.data;
      const usageLines: Array<{ label: string; value: string }> = [];
      const quota = (data as Record<string, unknown>).quota as Record<string, number> | undefined;
      if (quota) {
        for (const [key, value] of Object.entries(quota)) {
          usageLines.push({ label: key, value: String(Math.round(value * 100) / 100) });
        }
      }
      return {
        provider: "gemini",
        updatedAt: new Date(ctx.nowMs).toISOString(),
        limits: [],
        usageLines,
        source: "gemini-api",
      };
    } catch {
      return authErrorSnapshot(
        "gemini",
        ctx.nowMs,
        "gemini-api",
        "Unable to reach Gemini usage API.",
      );
    }
  },
};
