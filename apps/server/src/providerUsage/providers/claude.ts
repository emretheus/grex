// FILE: providers/claude.ts
// Purpose: Live Claude (Anthropic) usage fetcher. Reads the Claude Code OAuth token from
// ~/.claude/.credentials.json or the macOS keychain ("Claude Code-credentials", possibly
// hex-encoded) read-only, and calls the OAuth usage endpoint, mapping the 5h/weekly/sonnet
// utilization windows + extra-usage credits. Reference: Synara's claude.ts implementation.

import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

import type {
  ServerProviderUsageLimit,
  ServerProviderUsageLine,
  ServerProviderUsageSnapshot,
} from "@t3tools/contracts";

import type { ProviderUsageContext, ProviderUsageFetcher } from "../types";
import { fetchJson, isAuthFailureStatus } from "../http";

// ── Constants ───────────────────────────────────────────────────────

const LOG_PREFIX = "[claude-usage]";
const SOURCE = "claude-oauth-usage";
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const REFRESH_URL = "https://platform.claude.com/v1/oauth/token";
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const KEYCHAIN_SERVICE = "Claude Code-credentials";
const SCOPES =
  "user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 10_000;

// ── Credential types ────────────────────────────────────────────────

interface ClaudeCreds {
  accessToken: string;
  refreshToken: string | undefined;
  expiresAtMs: number | undefined;
  subscriptionType: string | undefined;
  rateLimitTier: string | undefined;
  scopes: ReadonlyArray<string>;
}

// ── Helpers ─────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampPercent(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, value));
}

function isoFromString(value: unknown): string | undefined {
  const text = asString(value);
  if (!text) return undefined;
  const millis = Date.parse(text);
  return Number.isNaN(millis) ? undefined : new Date(millis).toISOString();
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/u)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function readJsonFile(path: string): unknown | null {
  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function decodeKeychainJson(value: string): unknown | null {
  const trimmed = value.trim();
  // Try direct JSON parse first.
  try {
    return JSON.parse(trimmed);
  } catch {
    // not JSON, try hex
  }
  const hex = trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed.slice(2) : trimmed;
  if (hex.length % 2 === 0 && /^[0-9a-fA-F]+$/u.test(hex)) {
    try {
      return JSON.parse(Buffer.from(hex, "hex").toString("utf8"));
    } catch {
      return null;
    }
  }
  return null;
}

function readKeychainPassword(service: string, account?: string): string | null {
  if (process.platform !== "darwin") return null;
  const args = ["find-generic-password", "-s", service, "-w"];
  if (account) args.push("-a", account);
  try {
    const result = spawnSync("security", args, { timeout: 5_000 });
    if (result.status !== 0) return null;
    const value = result.stdout.toString().trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

// ── Credential resolution ───────────────────────────────────────────

function readScopes(oauth: Record<string, unknown> | null): ReadonlyArray<string> {
  if (Array.isArray(oauth?.scopes)) {
    return oauth.scopes.filter((scope): scope is string => typeof scope === "string");
  }
  const scopeText = asString(oauth?.scope);
  return scopeText ? scopeText.split(/\s+/u).filter((s) => s.length > 0) : [];
}

function readClaudeCreds(record: Record<string, unknown> | null): ClaudeCreds | null {
  const oauth = asRecord(record?.claudeAiOauth);
  const accessToken = asString(oauth?.accessToken);
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken: asString(oauth?.refreshToken) ?? undefined,
    expiresAtMs: asFiniteNumber(oauth?.expiresAt),
    subscriptionType: asString(oauth?.subscriptionType) ?? undefined,
    rateLimitTier: asString(oauth?.rateLimitTier) ?? undefined,
    scopes: readScopes(oauth),
  };
}

function resolveClaudeCredCandidates(ctx: ProviderUsageContext): ClaudeCreds[] {
  const candidates: ClaudeCreds[] = [];

  // 1. Try file: $CLAUDE_CONFIG_DIR/.credentials.json or ~/.claude/.credentials.json
  const homeDir = ctx.homeDir || process.env.HOME || process.env.USERPROFILE || "";
  const paths: string[] = [];
  if (ctx.env.CLAUDE_CONFIG_DIR) {
    paths.push(resolve(ctx.env.CLAUDE_CONFIG_DIR, ".credentials.json"));
  }
  paths.push(resolve(homeDir, ".claude", ".credentials.json"));

  for (const path of paths) {
    if (!existsSync(path)) continue;
    const json = readJsonFile(path);
    const record = asRecord(json);
    const creds = readClaudeCreds(record);
    if (creds) {
      console.error(`${LOG_PREFIX} Found OAuth creds in ${path}`);
      candidates.push(creds);
    }
  }

  // 2. Try macOS keychain: service "Claude Code-credentials"
  const keychainAccount = asString(ctx.env.USER) ?? asString(ctx.env.LOGNAME);
  let keychainValue: string | null = null;
  if (keychainAccount) {
    keychainValue = readKeychainPassword(KEYCHAIN_SERVICE, keychainAccount);
  }
  if (!keychainValue) {
    keychainValue = readKeychainPassword(KEYCHAIN_SERVICE);
  }
  if (keychainValue) {
    const decoded = decodeKeychainJson(keychainValue);
    const creds = readClaudeCreds(asRecord(decoded));
    if (creds) {
      console.error(`${LOG_PREFIX} Found OAuth creds in macOS keychain`);
      candidates.push(creds);
    }
  }

  return candidates;
}

function hasProfileScope(creds: ClaudeCreds): boolean {
  return creds.scopes.length === 0 || creds.scopes.includes("user:profile");
}

function shouldRefreshCreds(creds: ClaudeCreds, nowMs: number): boolean {
  return creds.expiresAtMs !== undefined && creds.expiresAtMs <= nowMs + REFRESH_BUFFER_MS;
}

function claudePlanName(creds: ClaudeCreds): string | undefined {
  if (!creds.subscriptionType) return undefined;
  let name = titleCase(creds.subscriptionType);
  const tier = creds.rateLimitTier?.match(/(\d+x)/iu)?.[1];
  if (tier) name += ` (${tier.toLowerCase()})`;
  return name;
}

// ── OAuth refresh ───────────────────────────────────────────────────

async function refreshOAuthToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken?: string; expiresAtMs?: number } | null> {
  try {
    const response = await fetch(REFRESH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        scope: SCOPES,
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`${LOG_PREFIX} Token refresh failed: HTTP ${response.status}`);
      return null;
    }

    const json = (await response.json()) as Record<string, unknown>;
    const accessToken = asString(json.access_token);
    if (!accessToken) {
      console.error(`${LOG_PREFIX} Token refresh response missing access_token`);
      return null;
    }

    const newRefreshToken = asString(json.refresh_token);
    const expiresIn = asFiniteNumber(json.expires_in);

    console.error(`${LOG_PREFIX} Token refreshed successfully`);
    return {
      accessToken,
      ...(newRefreshToken ? { refreshToken: newRefreshToken } : {}),
      ...(expiresIn !== undefined ? { expiresAtMs: Date.now() + expiresIn * 1000 } : {}),
    };
  } catch (err) {
    console.error(`${LOG_PREFIX} Token refresh error:`, err);
    return null;
  }
}

// ── Usage parsing ───────────────────────────────────────────────────

export function parseClaudeUsage(input: {
  data: Record<string, unknown>;
  nowMs: number;
}): ServerProviderUsageSnapshot {
  const root = input.data;
  const limits: ServerProviderUsageLimit[] = [];
  const usageLines: ServerProviderUsageLine[] = [];

  const pushWindow = (label: string, windowValue: unknown, windowDurationMins: number): void => {
    const window = asRecord(windowValue);
    if (!window) return;
    const usedPercent = clampPercent(asFiniteNumber(window.utilization));
    const resetsAt = isoFromString(window.resets_at);
    if (usedPercent === undefined && !resetsAt) return;
    limits.push({
      window: label,
      ...(usedPercent !== undefined ? { usedPercent } : {}),
      ...(resetsAt ? { resetsAt } : {}),
      windowDurationMins,
    });
  };

  pushWindow("5h", root.five_hour, 300);
  pushWindow("Weekly", root.seven_day, 10_080);
  pushWindow("Sonnet", root.seven_day_sonnet, 10_080);
  pushWindow("Opus", root.seven_day_opus, 10_080);

  // Parse extra_usage (credits) into usageLines
  const extra = asRecord(root.extra_usage);
  if (extra && extra.is_enabled !== false) {
    const usedCredits = asFiniteNumber(extra.used_credits);
    const monthlyLimit = asFiniteNumber(extra.monthly_limit);
    if (usedCredits !== undefined) {
      const usedUsd = formatUsd(usedCredits / 100);
      const value =
        monthlyLimit && monthlyLimit > 0
          ? `${usedUsd} of ${formatUsd(monthlyLimit / 100)}`
          : `${usedUsd} spent`;
      usageLines.push({ label: "Extra usage", value });
    }
  }

  if (limits.length === 0 && usageLines.length === 0) {
    console.error(`${LOG_PREFIX} No usage windows in API response. Keys:`, Object.keys(root));
  }

  return {
    provider: "claudeAgent",
    updatedAt: new Date(input.nowMs).toISOString(),
    limits,
    usageLines,
    source: SOURCE,
  };
}

// ── API fetch ───────────────────────────────────────────────────────

function fetchClaudeUsage(accessToken: string) {
  return fetchJson<Record<string, unknown>>(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "anthropic-beta": "oauth-2025-04-20",
      "User-Agent": "claude-code/2.1.69",
    },
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
}

// ── Main fetcher ────────────────────────────────────────────────────

export const claudeUsageFetcher: ProviderUsageFetcher = {
  provider: "claudeAgent",
  async fetch(ctx: ProviderUsageContext): Promise<ServerProviderUsageSnapshot> {
    // Resolve OAuth credentials from file (~/.claude/.credentials.json) or macOS keychain.
    const candidates = resolveClaudeCredCandidates(ctx);
    if (candidates.length === 0) {
      console.error(
        `${LOG_PREFIX} No OAuth credentials found (no ~/.claude/.credentials.json, no keychain)`,
      );
      return {
        provider: "claudeAgent",
        updatedAt: new Date(ctx.nowMs).toISOString(),
        limits: [],
        usageLines: [{ label: "Auth", value: "Run `claude` to authenticate and view usage." }],
        source: SOURCE,
      };
    }

    let lastErrorSnapshot: ServerProviderUsageSnapshot | null = null;

    for (const creds of candidates) {
      if (!hasProfileScope(creds)) {
        // Has credentials but no user:profile scope — return plan name only.
        const planName = claudePlanName(creds);
        console.error(`${LOG_PREFIX} Creds found but missing user:profile scope`);
        return {
          provider: "claudeAgent",
          updatedAt: new Date(ctx.nowMs).toISOString(),
          limits: [],
          usageLines: planName
            ? [{ label: "Plan", value: planName }]
            : [{ label: "Auth", value: "Re-authenticate to view usage." }],
          source: SOURCE,
        };
      }

      let activeCreds = creds;

      // Refresh if near expiry.
      if (shouldRefreshCreds(activeCreds, ctx.nowMs)) {
        console.error(`${LOG_PREFIX} Token near expiry, refreshing...`);
        if (activeCreds.refreshToken) {
          const refreshed = await refreshOAuthToken(activeCreds.refreshToken);
          if (refreshed) {
            activeCreds = {
              ...activeCreds,
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken ?? activeCreds.refreshToken,
              expiresAtMs: refreshed.expiresAtMs ?? activeCreds.expiresAtMs,
            };
          } else if (
            activeCreds.expiresAtMs !== undefined &&
            activeCreds.expiresAtMs <= ctx.nowMs
          ) {
            // Token expired and refresh failed — skip this candidate.
            continue;
          }
        }
      }

      try {
        let result = await fetchClaudeUsage(activeCreds.accessToken);

        // If auth failed, try refreshing and retrying once.
        if (isAuthFailureStatus(result.status) && activeCreds.refreshToken) {
          console.error(`${LOG_PREFIX} Auth rejected, attempting refresh + retry...`);
          const refreshed = await refreshOAuthToken(activeCreds.refreshToken);
          if (refreshed) {
            activeCreds = {
              ...activeCreds,
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken ?? activeCreds.refreshToken,
              expiresAtMs: refreshed.expiresAtMs ?? activeCreds.expiresAtMs,
            };
            result = await fetchClaudeUsage(activeCreds.accessToken);
          }
        }

        if (isAuthFailureStatus(result.status)) {
          console.error(`${LOG_PREFIX} Auth still rejected after retry`);
          continue;
        }

        if (result.status !== 200) {
          lastErrorSnapshot = {
            provider: "claudeAgent",
            updatedAt: new Date(ctx.nowMs).toISOString(),
            limits: [],
            usageLines: [
              { label: "Error", value: `Claude usage request failed (${result.status}).` },
            ],
            source: SOURCE,
          };
          continue;
        }

        console.error(`${LOG_PREFIX} Usage fetch succeeded`);
        return parseClaudeUsage({ data: result.data, nowMs: ctx.nowMs });
      } catch (err) {
        console.error(`${LOG_PREFIX} Fetch error:`, err);
        lastErrorSnapshot = {
          provider: "claudeAgent",
          updatedAt: new Date(ctx.nowMs).toISOString(),
          limits: [],
          usageLines: [{ label: "Error", value: "Could not reach Claude usage endpoint." }],
          source: SOURCE,
        };
        continue;
      }
    }

    return (
      lastErrorSnapshot ?? {
        provider: "claudeAgent",
        updatedAt: new Date(ctx.nowMs).toISOString(),
        limits: [],
        usageLines: [{ label: "Auth", value: "Run `claude` to authenticate and view usage." }],
        source: SOURCE,
      }
    );
  },
};
