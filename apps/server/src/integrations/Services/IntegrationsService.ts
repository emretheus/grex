import type {
  IntegrationCheckConnectionsResult,
  IntegrationConnectInput,
  IntegrationConnectResult,
  IntegrationDisconnectInput,
  IntegrationDisconnectResult,
  IntegrationIssueContextInput,
  IntegrationListIssuesInput,
  IntegrationSearchIssuesInput,
  IssueContextResult,
  IssueListResult,
} from "@t3tools/contracts";
import { Data, Effect, ServiceMap } from "effect";

export class IntegrationsServiceError extends Data.TaggedError("IntegrationsServiceError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface IntegrationsServiceShape {
  /** Connection status for every known provider (connected adapters validated lazily). */
  readonly checkConnections: () => Effect.Effect<
    IntegrationCheckConnectionsResult,
    IntegrationsServiceError
  >;
  /** Store credentials for a provider after validating them. */
  readonly connect: (
    input: IntegrationConnectInput,
  ) => Effect.Effect<IntegrationConnectResult, IntegrationsServiceError>;
  /** Forget a provider's stored credentials. */
  readonly disconnect: (
    input: IntegrationDisconnectInput,
  ) => Effect.Effect<IntegrationDisconnectResult, IntegrationsServiceError>;
  /** Recent issues for a connected provider. */
  readonly listIssues: (
    input: IntegrationListIssuesInput,
  ) => Effect.Effect<IssueListResult, IntegrationsServiceError>;
  /** Search a connected provider's issues. */
  readonly searchIssues: (
    input: IntegrationSearchIssuesInput,
  ) => Effect.Effect<IssueListResult, IntegrationsServiceError>;
  /** Hydrate a single issue with extended context, when the provider supports it. */
  readonly getIssueContext: (
    input: IntegrationIssueContextInput,
  ) => Effect.Effect<IssueContextResult, IntegrationsServiceError>;
}

export class IntegrationsService extends ServiceMap.Service<
  IntegrationsService,
  IntegrationsServiceShape
>()("t3/integrations/Services/IntegrationsService") {}
