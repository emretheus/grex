/**
 * Auggie ACP support - builds the Auggie CLI stdio command and resolves auth.
 *
 * @module AuggieAcpSupport
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

export interface AuggieAcpRuntimeSettings {
  readonly binaryPath?: string;
}

export interface AuggieAcpRuntimeInput extends Omit<
  AcpSessionRuntimeOptions,
  "authMethodId" | "resolveAuthMethodId" | "spawn"
> {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly auggieSettings: AuggieAcpRuntimeSettings | null | undefined;
}

const AUGGIE_LOGIN_AUTH_METHOD_ID = "augment_login";
const AUGGIE_CACHED_TOKEN_AUTH_METHOD_ID = "cached_token";

export function buildAuggieAcpSpawnInput(
  auggieSettings: AuggieAcpRuntimeSettings | null | undefined,
  cwd: string,
): AcpSpawnInput {
  return {
    command: auggieSettings?.binaryPath || "auggie",
    args: ["--acp"],
    cwd,
  };
}

function availableAuthMethodIds(
  initializeResult: EffectAcpSchema.InitializeResponse,
): ReadonlySet<string> {
  return new Set((initializeResult.authMethods ?? []).map((method) => method.id.trim()));
}

export const resolveAuggieAcpAuthMethodId = (
  initializeResult: EffectAcpSchema.InitializeResponse,
): Effect.Effect<string, EffectAcpErrors.AcpError> =>
  Effect.gen(function* () {
    const authMethodIds = availableAuthMethodIds(initializeResult);
    if (authMethodIds.has(AUGGIE_LOGIN_AUTH_METHOD_ID)) {
      return AUGGIE_LOGIN_AUTH_METHOD_ID;
    }
    if (authMethodIds.has(AUGGIE_CACHED_TOKEN_AUTH_METHOD_ID)) {
      return AUGGIE_CACHED_TOKEN_AUTH_METHOD_ID;
    }
    return yield* new EffectAcpErrorsRuntime.AcpRequestError({
      code: -32602,
      errorMessage: "Auggie ACP authentication is unavailable.",
      data: {
        authMethods: [...authMethodIds],
        detail: "Run `auggie login` to authenticate locally.",
      },
    });
  });

export const makeAuggieAcpRuntime = (
  input: AuggieAcpRuntimeInput,
): Effect.Effect<AcpSessionRuntimeShape, EffectAcpErrors.AcpError, Scope.Scope> =>
  Effect.gen(function* () {
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...input,
        spawn: buildAuggieAcpSpawnInput(input.auggieSettings, input.cwd),
        resolveAuthMethodId: resolveAuggieAcpAuthMethodId,
      }).pipe(
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, input.childProcessSpawner),
        ),
      ),
    );
    return ServiceMap.getUnsafe(acpContext, AcpSessionRuntime);
  });
