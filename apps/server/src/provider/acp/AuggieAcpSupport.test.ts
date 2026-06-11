// FILE: AuggieAcpSupport.test.ts
// Purpose: Unit tests for Auggie ACP support utilities.
// Layer: Provider ACP support tests

import { Effect } from "effect";
import * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";
import { describe, expect, it } from "vitest";

import { buildAuggieAcpSpawnInput, resolveAuggieAcpAuthMethodId } from "./AuggieAcpSupport.ts";

function initializeWithAuthMethods(ids: ReadonlyArray<string>): EffectAcpSchema.InitializeResponse {
  return {
    protocolVersion: 1,
    authMethods: ids.map((id) => ({ id, name: id })),
  };
}

describe("buildAuggieAcpSpawnInput", () => {
  it("builds the default Auggie ACP command", () => {
    expect(buildAuggieAcpSpawnInput(undefined, "/tmp/project")).toEqual({
      command: "auggie",
      args: ["--acp"],
      cwd: "/tmp/project",
    });
  });

  it("uses the configured Auggie binary path", () => {
    expect(
      buildAuggieAcpSpawnInput({ binaryPath: "/usr/local/bin/auggie" }, "/tmp/project"),
    ).toEqual({
      command: "/usr/local/bin/auggie",
      args: ["--acp"],
      cwd: "/tmp/project",
    });
  });
});

describe("resolveAuggieAcpAuthMethodId", () => {
  it("resolves with the augment_login auth method", async () => {
    await expect(
      Effect.runPromise(
        resolveAuggieAcpAuthMethodId(initializeWithAuthMethods(["cached_token", "augment_login"])),
      ),
    ).resolves.toBe("augment_login");
  });

  it("falls back to cached_token when augment_login is not available", async () => {
    await expect(
      Effect.runPromise(resolveAuggieAcpAuthMethodId(initializeWithAuthMethods(["cached_token"]))),
    ).resolves.toBe("cached_token");
  });

  it("fails clearly when Auggie exposes no supported ACP auth method", async () => {
    const error = await Effect.runPromise(
      resolveAuggieAcpAuthMethodId(initializeWithAuthMethods(["browser_login"])).pipe(Effect.flip),
    );

    expect(error).toBeInstanceOf(EffectAcpErrors.AcpRequestError);
    expect(error.message).toBe("Auggie ACP authentication is unavailable.");
  });
});
