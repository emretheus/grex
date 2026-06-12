// FILE: providers/codex.ts
// Purpose: Live Codex usage fetcher.

import type { ProviderUsageContext, ProviderUsageFetcher } from "../types";
import { fetchJson } from "../http";
import { authErrorSnapshot } from "../base";
import { readJsonFile, getKeychainPassword, isJwtExpired } from "../credentials";
import type { ServerProviderUsageLimit, ServerProviderUsageSnapshot } from "@t3tools/contracts";
import { resolve } from "path";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampPercent(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Math.min(100, Math.max(0, value));
}

// The Codex CLI persists its ChatGPT OAuth tokens in `auth.json` under the
// resolved CODEX_HOME (default `~/.codex`); the bearer we need is
// `tokens.access_token`. Older fetcher logic looked for `config.json` /
// `auth.accessToken`, which the CLI never writes, so usage always read as empty.
interface CodexAuthFile {
  readonly tokens?: {
    readonly access_token?: string;
  };
}

function resolveCodexHomeDir(ctx: ProviderUsageContext): string {
  const explicitHome = ctx.env.CODEX_HOME?.trim();
  if (explicitHome) return explicitHome;
  const homeDir = ctx.homeDir || ctx.env.HOME || ctx.env.USERPROFILE || "";
  return resolve(homeDir, ".codex");
}

async function resolveCodexToken(ctx: ProviderUsageContext): Promise<string | null> {
  const codexHome = resolveCodexHomeDir(ctx);
  const authPaths = [
    resolve(codexHome, "auth.json"),
    // Honour the legacy XDG-style location as a secondary lookup.
    resolve(ctx.homeDir || "", ".config", "codex", "auth.json"),
  ];
  for (const authPath of authPaths) {
    if (!authPath) continue;
    const auth = readJsonFile<CodexAuthFile>(authPath);
    const token = auth?.tokens?.access_token;
    if (token && !isJwtExpired(token, ctx.nowMs)) return token;
  }
  const keychainToken = getKeychainPassword("codex", "openai-codex-auth");
  if (keychainToken && !isJwtExpired(keychainToken, ctx.nowMs)) return keychainToken;
  return null;
}

export const codexUsageFetcher: ProviderUsageFetcher = {
  provider: "codex",
  async fetch(ctx: ProviderUsageContext): Promise<ServerProviderUsageSnapshot> {
    const token = await resolveCodexToken(ctx);
    if (!token) {
      return authErrorSnapshot(
        "codex",
        ctx.nowMs,
        "codex-cli",
        "Sign in with `codex login` to view usage.",
      );
    }
    try {
      const result = await fetchJson<Record<string, unknown>>(
        "https://chatgpt.com/backend-api/wham/usage",
        {
          headers: { Authorization: `Bearer ${token}` },
          timeoutMs: 10_000,
        },
      );
      if (result.status !== 200) {
        return authErrorSnapshot(
          "codex",
          ctx.nowMs,
          "codex-api",
          `API returned status ${result.status}`,
        );
      }
      // The usage API reports a single `rate_limit` object with a `primary_window`
      // (rolling 5h) and `secondary_window` (rolling weekly). Each window exposes
      // `used_percent`, `limit_window_seconds`, and a `reset_at` epoch (seconds).
      const rateLimit = asRecord((result.data as Record<string, unknown>).rate_limit);
      const limits: ServerProviderUsageLimit[] = [];

      const pushWindow = (label: string, windowValue: unknown): void => {
        const window = asRecord(windowValue);
        if (!window) return;
        const usedPercent = clampPercent(asFiniteNumber(window.used_percent));
        const resetAtSeconds = asFiniteNumber(window.reset_at);
        const resetsAt =
          resetAtSeconds !== undefined ? new Date(resetAtSeconds * 1000).toISOString() : undefined;
        // Derive the window label bucket from its duration so the UI maps it to
        // the "5h" / "Weekly" rows (300 / 10080 minutes) consistently with Claude.
        const durationSeconds = asFiniteNumber(window.limit_window_seconds);
        const windowDurationMins =
          durationSeconds !== undefined ? Math.round(durationSeconds / 60) : undefined;
        if (usedPercent === undefined && !resetsAt) return;
        limits.push({
          window: label,
          ...(usedPercent !== undefined ? { usedPercent } : {}),
          ...(resetsAt ? { resetsAt } : {}),
          ...(windowDurationMins !== undefined ? { windowDurationMins } : {}),
        });
      };

      if (rateLimit) {
        pushWindow("5h", rateLimit.primary_window);
        pushWindow("Weekly", rateLimit.secondary_window);
      }

      if (limits.length === 0) {
        return authErrorSnapshot(
          "codex",
          ctx.nowMs,
          "codex-api",
          "No usage windows reported by Codex.",
        );
      }

      return {
        provider: "codex",
        updatedAt: new Date(ctx.nowMs).toISOString(),
        limits,
        usageLines: [],
        source: "codex-api",
      };
    } catch {
      return authErrorSnapshot("codex", ctx.nowMs, "codex-api", "Unable to reach Codex usage API.");
    }
  },
};
