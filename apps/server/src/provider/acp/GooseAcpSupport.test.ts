/**
 * GooseAcpSupport tests — verifies spawn input building and auth method resolution.
 */

import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import type * as EffectAcpSchema from "effect-acp/schema";

import {
  buildGooseAcpSpawnInput,
  resolveGooseAcpAuthMethodId,
  type GooseAcpRuntimeSettings,
} from "./GooseAcpSupport.ts";

function initializeWithAuthMethods(
  authMethodIds: string[],
): EffectAcpSchema.InitializeResponse {
  return {
    authMethods: authMethodIds.map((id) => ({ id, name: id, description: id })),
  } as unknown as EffectAcpSchema.InitializeResponse;
}

describe("buildGooseAcpSpawnInput", () => {
  it("uses default binary path 'goose' with 'acp' args", () => {
    const input = buildGooseAcpSpawnInput(null, "/workspace");
    expect(input.command).toBe("goose");
    expect(input.args).toEqual(["acp"]);
    expect(input.cwd).toBe("/workspace");
  });

  it("uses custom binary path when provided", () => {
    const settings: GooseAcpRuntimeSettings = { binaryPath: "/usr/local/bin/goose" };
    const input = buildGooseAcpSpawnInput(settings, "/workspace");
    expect(input.command).toBe("/usr/local/bin/goose");
    expect(input.args).toEqual(["acp"]);
  });
});

describe("resolveGooseAcpAuthMethodId", () => {
  it("uses cached_token when available", async () => {
    await expect(
      Effect.runPromise(
        resolveGooseAcpAuthMethodId(
          initializeWithAuthMethods(["cached_token", "oauth"]),
        ),
      ),
    ).resolves.toBe("cached_token");
  });

  it("falls back to oauth when cached_token is unavailable", async () => {
    await expect(
      Effect.runPromise(
        resolveGooseAcpAuthMethodId(
          initializeWithAuthMethods(["oauth"]),
        ),
      ),
    ).resolves.toBe("oauth");
  });

  it("fails when no known auth methods are available", async () => {
    await expect(
      Effect.runPromise(
        resolveGooseAcpAuthMethodId(
          initializeWithAuthMethods(["unknown"]),
        ),
      ),
    ).rejects.toThrow();
  });
});
