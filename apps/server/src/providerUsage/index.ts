// FILE: index.ts
// Purpose: Orchestrate live provider-usage fetchers — per-provider TTL cache, defensive
// batch fetch, and enrichment with local token-total usage lines.

import type {
  ProviderKind,
  ServerListProviderUsageInput,
  ServerProviderUsageSnapshot,
} from "@t3tools/contracts";
import { Effect } from "effect";

import { errorSnapshot } from "./base";
import { PROVIDER_USAGE_FETCHERS } from "./registry";
import type { ProviderUsageContext } from "./types";

const LIVE_USAGE_TTL_MS = 60_000;
const LOCAL_ARCHIVE_PROVIDERS: ReadonlySet<ProviderKind> = new Set(["codex", "claudeAgent"]);

interface CacheEntry {
  expiresAtMs: number;
  value: ServerProviderUsageSnapshot | null;
  pending: Promise<ServerProviderUsageSnapshot> | null;
}

const liveUsageCache = new Map<string, CacheEntry>();

function buildContext(): ProviderUsageContext {
  return {
    homeDir: process.env.HOME ?? process.env.USERPROFILE ?? "",
    env: process.env,
    platform: process.platform,
    nowMs: Date.now(),
  };
}

async function fetchProviderUsageCached(
  provider: ProviderKind,
  ctx: ProviderUsageContext,
  options: { forceRefresh?: boolean } = {},
): Promise<ServerProviderUsageSnapshot | null> {
  const fetcher = PROVIDER_USAGE_FETCHERS[provider];
  if (!fetcher) {
    return null;
  }
  const cacheKey = `${provider}:${ctx.homeDir}`;
  const existing = liveUsageCache.get(cacheKey);
  if (!options.forceRefresh && existing && existing.value && existing.expiresAtMs > ctx.nowMs) {
    return existing.value;
  }
  if (!options.forceRefresh && existing?.pending) {
    return existing.pending;
  }
  const pending = fetcher
    .fetch(ctx)
    .catch(() => errorSnapshot(provider, ctx.nowMs, "live-usage"))
    .then((value) => {
      liveUsageCache.set(cacheKey, {
        expiresAtMs: Date.now() + LIVE_USAGE_TTL_MS,
        value,
        pending: null,
      });
      return value;
    });
  liveUsageCache.set(cacheKey, {
    expiresAtMs: existing?.expiresAtMs ?? 0,
    value: existing?.value ?? null,
    pending,
  });
  return pending;
}

/** Effect wrapper for the RPC layer — uses the server config homeDir. */
export const listProviderUsage = Effect.fn(function* (input: ServerListProviderUsageInput) {
  return yield* Effect.tryPromise({
    try: () =>
      collectProviderUsageSnapshots(
        {
          homeDir: process.env.HOME ?? process.env.USERPROFILE ?? "",
          env: process.env,
          platform: process.platform,
          nowMs: Date.now(),
        },
        input.forceRefresh ? { forceRefresh: true } : {},
      ),
    catch: () => [],
  });
});

/** Plain async batch fetch for every supported provider. Never throws. */
export async function collectProviderUsageSnapshots(
  ctx: ProviderUsageContext,
  options: { forceRefresh?: boolean } = {},
): Promise<ServerProviderUsageSnapshot[]> {
  const providers = Object.keys(PROVIDER_USAGE_FETCHERS) as ProviderKind[];
  const settled = await Promise.allSettled(
    providers.map(async (provider) => {
      const snapshot = await fetchProviderUsageCached(provider, ctx, options);
      return snapshot;
    }),
  );
  return settled
    .map((result) => (result.status === "fulfilled" ? result.value : null))
    .filter((snapshot): snapshot is ServerProviderUsageSnapshot => snapshot !== null);
}
