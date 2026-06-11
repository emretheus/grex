// FILE: QwenCodeAcpSupport.test.ts
// Purpose: Unit tests for QwenCode ACP support utilities.
// Layer: Provider ACP support tests

import { Effect } from "effect";
import * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildQwenCodeAcpSpawnInput,
  getQwenCodeApiKeyEnv,
  resolveQwenCodeAcpAuthMethodId,
} from "./QwenCodeAcpSupport.ts";

function initializeWithAuthMethods(ids: ReadonlyArray<string>): EffectAcpSchema.InitializeResponse {
  return {
    protocolVersion: 1,
    authMethods: ids.map((id) => ({ id, name: id })),
  };
}

describe("buildQwenCodeAcpSpawnInput", () => {
  it("builds the default Qwen Code ACP command", () => {
    expect(buildQwenCodeAcpSpawnInput(undefined, "/tmp/project")).toEqual({
      command: "qwen",
      args: ["--acp"],
      cwd: "/tmp/project",
    });
  });

  it("uses the configured Qwen Code binary path", () => {
    expect(
      buildQwenCodeAcpSpawnInput({ binaryPath: "/usr/local/bin/qwen" }, "/tmp/project"),
    ).toEqual({
      command: "/usr/local/bin/qwen",
      args: ["--acp"],
      cwd: "/tmp/project",
    });
  });
});

describe("getQwenCodeApiKeyEnv", () => {
  const previousQwenApiKey = process.env.QWEN_API_KEY;
  const previousDashscopeApiKey = process.env.DASHSCOPE_API_KEY;

  afterEach(() => {
    if (previousQwenApiKey === undefined) {
      delete process.env.QWEN_API_KEY;
    } else {
      process.env.QWEN_API_KEY = previousQwenApiKey;
    }
    if (previousDashscopeApiKey === undefined) {
      delete process.env.DASHSCOPE_API_KEY;
    } else {
      process.env.DASHSCOPE_API_KEY = previousDashscopeApiKey;
    }
  });

  it("returns the QWEN_API_KEY env var when set", () => {
    process.env.QWEN_API_KEY = "qwen-test-key";
    delete process.env.DASHSCOPE_API_KEY;
    expect(getQwenCodeApiKeyEnv({ QWEN_API_KEY: "qwen-test-key" })).toBe("qwen-test-key");
  });

  it("falls back to DASHSCOPE_API_KEY when QWEN_API_KEY is not set", () => {
    delete process.env.QWEN_API_KEY;
    expect(getQwenCodeApiKeyEnv({ DASHSCOPE_API_KEY: "dashscope-test-key" })).toBe(
      "dashscope-test-key",
    );
  });

  it("returns undefined when neither env var is set", () => {
    delete process.env.QWEN_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    expect(getQwenCodeApiKeyEnv({})).toBeUndefined();
  });
});

describe("resolveQwenCodeAcpAuthMethodId", () => {
  const previousQwenApiKey = process.env.QWEN_API_KEY;
  const previousDashscopeApiKey = process.env.DASHSCOPE_API_KEY;

  afterEach(() => {
    if (previousQwenApiKey === undefined) {
      delete process.env.QWEN_API_KEY;
    } else {
      process.env.QWEN_API_KEY = previousQwenApiKey;
    }
    if (previousDashscopeApiKey === undefined) {
      delete process.env.DASHSCOPE_API_KEY;
    } else {
      process.env.DASHSCOPE_API_KEY = previousDashscopeApiKey;
    }
  });

  it("prefers cached_token auth when QWEN_API_KEY is not set", async () => {
    delete process.env.QWEN_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;

    await expect(
      Effect.runPromise(
        resolveQwenCodeAcpAuthMethodId(initializeWithAuthMethods(["cached_token", "oauth"])),
      ),
    ).resolves.toBe("cached_token");
  });

  it("prefers cached_token even when QWEN_API_KEY is set", async () => {
    process.env.QWEN_API_KEY = "qwen-test-key";
    delete process.env.DASHSCOPE_API_KEY;

    await expect(
      Effect.runPromise(
        resolveQwenCodeAcpAuthMethodId(initializeWithAuthMethods(["cached_token", "oauth"])),
      ),
    ).resolves.toBe("cached_token");
  });

  it("fails clearly when Qwen Code exposes no supported ACP auth method", async () => {
    delete process.env.QWEN_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;

    const error = await Effect.runPromise(
      resolveQwenCodeAcpAuthMethodId(initializeWithAuthMethods(["browser_login"])).pipe(
        Effect.flip,
      ),
    );

    expect(error).toBeInstanceOf(EffectAcpErrors.AcpRequestError);
    expect(error.message).toBe("Qwen Code ACP authentication is unavailable.");
  });
});
