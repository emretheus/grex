/**
 * Qwen Code ACP support - builds the Qwen CLI stdio command and resolves auth.
 *
 * @module QwenCodeAcpSupport
 */
import { Effect, Layer, Scope, ServiceMap } from "effect";
import type * as EffectAcpErrors from "effect-acp/errors";
import * as EffectAcpErrorsRuntime from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";
import { ChildProcessSpawner } from "effect/unstable/process";

import {
  AcpSessionRuntime,
  type AcpSessionRuntimeOptions,
  type AcpSessionRuntimeShape,
  type AcpSpawnInput,
} from "./AcpSessionRuntime.ts";

export interface QwenCodeAcpRuntimeSettings {
  readonly binaryPath?: string;
}

export interface QwenCodeAcpRuntimeInput extends Omit<
  AcpSessionRuntimeOptions,
  "authMethodId" | "resolveAuthMethodId" | "spawn"
> {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly qwenCodeSettings: QwenCodeAcpRuntimeSettings | null | undefined;
}

const QWEN_CODE_CACHED_TOKEN_AUTH_METHOD_ID = "cached_token";
const QWEN_CODE_API_KEY_AUTH_METHOD_ID = "oauth";

export function getQwenCodeApiKeyEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.QWEN_API_KEY?.trim() || env.DASHSCOPE_API_KEY?.trim() || undefined;
}

export function buildQwenCodeAcpSpawnInput(
  qwenCodeSettings: QwenCodeAcpRuntimeSettings | null | undefined,
  cwd: string,
): AcpSpawnInput {
  return {
    command: qwenCodeSettings?.binaryPath || "qwen",
    args: ["--acp"],
    cwd,
  };
}

function availableAuthMethodIds(
  initializeResult: EffectAcpSchema.InitializeResponse,
): ReadonlySet<string> {
  return new Set((initializeResult.authMethods ?? []).map((method) => method.id.trim()));
}

export const resolveQwenCodeAcpAuthMethodId = (
  initializeResult: EffectAcpSchema.InitializeResponse,
): Effect.Effect<string, EffectAcpErrors.AcpError> =>
  Effect.gen(function* () {
    const authMethodIds = availableAuthMethodIds(initializeResult);
    if (authMethodIds.has(QWEN_CODE_CACHED_TOKEN_AUTH_METHOD_ID)) {
      return QWEN_CODE_CACHED_TOKEN_AUTH_METHOD_ID;
    }
    if (getQwenCodeApiKeyEnv() && authMethodIds.has(QWEN_CODE_API_KEY_AUTH_METHOD_ID)) {
      return QWEN_CODE_API_KEY_AUTH_METHOD_ID;
    }
    return yield* new EffectAcpErrorsRuntime.AcpRequestError({
      code: -32602,
      errorMessage: "Qwen Code ACP authentication is unavailable.",
      data: {
        authMethods: [...authMethodIds],
        detail: "Run `qwen` to authenticate locally, or set QWEN_API_KEY.",
      },
    });
  });

export const makeQwenCodeAcpRuntime = (
  input: QwenCodeAcpRuntimeInput,
): Effect.Effect<AcpSessionRuntimeShape, EffectAcpErrors.AcpError, Scope.Scope> =>
  Effect.gen(function* () {
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...input,
        spawn: buildQwenCodeAcpSpawnInput(input.qwenCodeSettings, input.cwd),
        resolveAuthMethodId: resolveQwenCodeAcpAuthMethodId,
      }).pipe(
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, input.childProcessSpawner),
        ),
      ),
    );
    return ServiceMap.getUnsafe(acpContext, AcpSessionRuntime);
  });
