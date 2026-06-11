// FILE: credentials.ts
// Purpose: Credential resolution helpers: file reads, keychain access, JWT expiry.

import { spawnSync } from "child_process";
import { readFileSync } from "fs";

export function readFileIfExists(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

export function readJsonFile<T = Record<string, unknown>>(path: string): T | null {
  const content = readFileIfExists(path);
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export function getKeychainPassword(account: string, service: string): string | null {
  if (process.platform !== "darwin") return null;
  try {
    const result = spawnSync(
      "security",
      ["find-generic-password", "-a", account, "-s", service, "-w"],
      { timeout: 5_000 },
    );
    if (result.status !== 0) return null;
    return result.stdout.toString().trim() || null;
  } catch {
    return null;
  }
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string, nowMs: number): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  const exp = typeof payload.exp === "number" ? payload.exp * 1000 : null;
  return exp === null || exp <= nowMs;
}
