import {
  INTEGRATION_ISSUE_LIST_DEFAULT_LIMIT,
  type ConnectionStatus,
  type ConnectionStatusMap,
  type IntegrationCredentials,
  type IssueProviderType,
} from "@t3tools/contracts";
import { ISSUE_PROVIDER_CAPABILITIES, ISSUE_PROVIDER_META } from "@t3tools/shared/integrations";
import { Effect, Layer } from "effect";

import { ServerSecretStore } from "../../auth/Services/ServerSecretStore";
import { getAdapter, hasAdapter } from "../adapters/registry";
import {
  IntegrationsService,
  IntegrationsServiceError,
  type IntegrationsServiceShape,
} from "../Services/IntegrationsService";

const ALL_PROVIDERS = Object.keys(ISSUE_PROVIDER_META) as IssueProviderType[];

const secretName = (provider: IssueProviderType): string => `integration:${provider}`;

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/** Shape persisted under the secret store for each connected provider. */
interface StoredConnection {
  readonly credentials: IntegrationCredentials;
  readonly displayName?: string | undefined;
}

const disconnectedStatus = (provider: IssueProviderType): ConnectionStatus => ({
  provider,
  connected: false,
  capabilities: ISSUE_PROVIDER_CAPABILITIES[provider],
});

export const makeIntegrationsService = Effect.gen(function* () {
  const secretStore = yield* ServerSecretStore;

  const loadConnection = (
    provider: IssueProviderType,
  ): Effect.Effect<StoredConnection | null, IntegrationsServiceError> =>
    secretStore.get(secretName(provider)).pipe(
      Effect.map((bytes) => {
        if (!bytes) return null;
        try {
          return JSON.parse(decoder.decode(bytes)) as StoredConnection;
        } catch {
          return null;
        }
      }),
      Effect.mapError(
        (cause) =>
          new IntegrationsServiceError({
            message: `Failed to read credentials for ${provider}.`,
            cause,
          }),
      ),
    );

  const saveConnection = (
    provider: IssueProviderType,
    connection: StoredConnection,
  ): Effect.Effect<void, IntegrationsServiceError> =>
    secretStore.set(secretName(provider), encoder.encode(JSON.stringify(connection))).pipe(
      Effect.mapError(
        (cause) =>
          new IntegrationsServiceError({
            message: `Failed to store credentials for ${provider}.`,
            cause,
          }),
      ),
    );

  const requireCredentials = (
    provider: IssueProviderType,
  ): Effect.Effect<IntegrationCredentials, IntegrationsServiceError> =>
    loadConnection(provider).pipe(
      Effect.flatMap((connection) =>
        connection
          ? Effect.succeed(connection.credentials)
          : Effect.fail(new IntegrationsServiceError({ message: `${provider} is not connected.` })),
      ),
    );

  const checkConnections: IntegrationsServiceShape["checkConnections"] = () =>
    Effect.gen(function* () {
      const entries = yield* Effect.forEach(
        ALL_PROVIDERS,
        (provider) =>
          Effect.gen(function* () {
            if (!hasAdapter(provider)) {
              return [provider, disconnectedStatus(provider)] as const;
            }
            const connection = yield* loadConnection(provider);
            if (!connection) {
              return [provider, disconnectedStatus(provider)] as const;
            }
            const status: ConnectionStatus = {
              provider,
              connected: true,
              capabilities: ISSUE_PROVIDER_CAPABILITIES[provider],
              displayName: connection.displayName ?? ISSUE_PROVIDER_META[provider].displayName,
            };
            return [provider, status] as const;
          }),
        { concurrency: "unbounded" },
      );
      const statuses = Object.fromEntries(entries) as ConnectionStatusMap;
      return { statuses };
    });

  const connect: IntegrationsServiceShape["connect"] = (input) =>
    Effect.gen(function* () {
      const adapter = getAdapter(input.provider);
      if (!adapter) {
        return { success: false, error: `${input.provider} is not supported yet.` };
      }
      // Validate against the live API before persisting anything.
      const validation = yield* Effect.tryPromise({
        try: () => adapter.validate(input.credentials),
        catch: (cause) => cause,
      }).pipe(
        Effect.map((result) => ({ ok: true as const, ...result })),
        Effect.catch((cause) =>
          Effect.succeed({
            ok: false as const,
            error: cause instanceof Error ? cause.message : "Could not verify credentials.",
          }),
        ),
      );
      if (!validation.ok) {
        return { success: false, error: validation.error };
      }
      yield* saveConnection(input.provider, {
        credentials: input.credentials,
        displayName: validation.displayName,
      });
      return { success: true, displayName: validation.displayName };
    });

  const disconnect: IntegrationsServiceShape["disconnect"] = (input) =>
    secretStore.remove(secretName(input.provider)).pipe(
      Effect.as({ success: true }),
      Effect.catch((cause) =>
        Effect.succeed({
          success: false,
          error: cause instanceof Error ? cause.message : `Failed to disconnect ${input.provider}.`,
        }),
      ),
    );

  const listIssues: IntegrationsServiceShape["listIssues"] = (input) =>
    Effect.gen(function* () {
      const adapter = getAdapter(input.provider);
      if (!adapter) {
        return { success: false, error: `${input.provider} is not supported yet.` };
      }
      const credentials = yield* requireCredentials(input.provider);
      return yield* Effect.tryPromise({
        try: () =>
          adapter.listIssues(credentials, {
            projectPath: input.projectPath,
            repositoryUrl: input.repositoryUrl,
            limit: input.limit ?? INTEGRATION_ISSUE_LIST_DEFAULT_LIMIT,
          }),
        catch: (cause) =>
          new IntegrationsServiceError({ message: "Failed to list issues.", cause }),
      });
    });

  const searchIssues: IntegrationsServiceShape["searchIssues"] = (input) =>
    Effect.gen(function* () {
      const adapter = getAdapter(input.provider);
      if (!adapter) {
        return { success: false, error: `${input.provider} is not supported yet.` };
      }
      const credentials = yield* requireCredentials(input.provider);
      return yield* Effect.tryPromise({
        try: () =>
          adapter.searchIssues(credentials, {
            searchTerm: input.searchTerm,
            projectPath: input.projectPath,
            repositoryUrl: input.repositoryUrl,
            limit: input.limit ?? INTEGRATION_ISSUE_LIST_DEFAULT_LIMIT,
          }),
        catch: (cause) =>
          new IntegrationsServiceError({ message: "Failed to search issues.", cause }),
      });
    });

  const getIssueContext: IntegrationsServiceShape["getIssueContext"] = (input) =>
    Effect.gen(function* () {
      const adapter = getAdapter(input.provider);
      if (!adapter?.getIssueContext) {
        return { success: false, error: `${input.provider} does not support issue context.` };
      }
      const credentials = yield* requireCredentials(input.provider);
      const fetchContext = adapter.getIssueContext.bind(adapter);
      return yield* Effect.tryPromise({
        try: () =>
          fetchContext(credentials, {
            identifier: input.identifier,
            projectPath: input.projectPath,
            repositoryUrl: input.repositoryUrl,
          }),
        catch: (cause) =>
          new IntegrationsServiceError({ message: "Failed to load issue context.", cause }),
      });
    });

  return {
    checkConnections,
    connect,
    disconnect,
    listIssues,
    searchIssues,
    getIssueContext,
  } satisfies IntegrationsServiceShape;
});

export const IntegrationsServiceLive = Layer.effect(IntegrationsService, makeIntegrationsService);
