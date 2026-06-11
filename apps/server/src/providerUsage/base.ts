// FILE: base.ts
// Purpose: Shared helpers for provider-usage fetchers: sanitization, snapshot builders, formatting.

import type { ProviderKind, ServerProviderUsageSnapshot } from "@t3tools/contracts";

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return null;
  if (Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function formatUtilization(value: number): number {
  return clamp(Math.round(value * 1000) / 10, 0, 100);
}

export function errorSnapshot(
  provider: ProviderKind,
  nowMs: number,
  source: string,
  message = "Unavailable",
): ServerProviderUsageSnapshot {
  return {
    provider,
    updatedAt: new Date(nowMs).toISOString(),
    limits: [],
    usageLines: [{ label: "Error", value: message }],
    source,
    status: "error",
  };
}

export function authErrorSnapshot(
  provider: ProviderKind,
  nowMs: number,
  source: string,
  message = "Sign in required",
): ServerProviderUsageSnapshot {
  return {
    provider,
    updatedAt: new Date(nowMs).toISOString(),
    limits: [],
    usageLines: [{ label: "Auth", value: message }],
    source,
    status: "needs-auth",
  };
}
