/**
 * Goose ACP support - builds the Goose CLI stdio command and resolves auth.
 *
 * @module GooseAcpSupport
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

export interface GooseAcpRuntimeSettings {
  readonly binaryPath?: string;
}

export interface GooseAcpRuntimeInput extends Omit<
  AcpSessionRuntimeOptions,
  "authMethodId" | "resolveAuthMethodId" | "spawn"
> {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly gooseSettings: GooseAcpRuntimeSettings | null | undefined;
}

const GOOSE_CACHED_TOKEN_AUTH_METHOD_ID = "cached_token";
const GOOSE_OAUTH_AUTH_METHOD_ID = "oauth";

export function buildGooseAcpSpawnInput(
  gooseSettings: GooseAcpRuntimeSettings | null | undefined,
  cwd: string,
): AcpSpawnInput {
  return {
    command: gooseSettings?.binaryPath || "goose",
    args: ["acp"],
    cwd,
  };
}

function availableAuthMethodIds(
  initializeResult: EffectAcpSchema.InitializeResponse,
): ReadonlySet<string> {
  return new Set((initializeResult.authMethods ?? []).map((method) => method.id.trim()));
}

export const resolveGooseAcpAuthMethodId = (
  initializeResult: EffectAcpSchema.InitializeResponse,
): Effect.Effect<string, EffectAcpErrors.AcpError> =>
  Effect.gen(function* () {
    const authMethodIds = availableAuthMethodIds(initializeResult);
    if (authMethodIds.has(GOOSE_CACHED_TOKEN_AUTH_METHOD_ID)) {
      return GOOSE_CACHED_TOKEN_AUTH_METHOD_ID;
    }
    if (authMethodIds.has(GOOSE_OAUTH_AUTH_METHOD_ID)) {
      return GOOSE_OAUTH_AUTH_METHOD_ID;
    }
    return yield* new EffectAcpErrorsRuntime.AcpRequestError({
      code: -32602,
      errorMessage: "Goose ACP authentication is unavailable.",
      data: {
        authMethods: [...authMethodIds],
        detail: "Run `goose` to authenticate locally, or set provider API keys (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY).",
      },
    });
  });

export const makeGooseAcpRuntime = (
  input: GooseAcpRuntimeInput,
): Effect.Effect<AcpSessionRuntimeShape, EffectAcpErrors.AcpError, Scope.Scope> =>
  Effect.gen(function* () {
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...input,
        spawn: buildGooseAcpSpawnInput(input.gooseSettings, input.cwd),
        resolveAuthMethodId: resolveGooseAcpAuthMethodId,
      }).pipe(
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, input.childProcessSpawner),
        ),
      ),
    );
    return ServiceMap.getUnsafe(acpContext, AcpSessionRuntime);
  });
