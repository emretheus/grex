import type {
  ConnectionStatusMap,
  IntegrationConnectInput,
  IntegrationDisconnectInput,
  IntegrationListIssuesInput,
  IntegrationSearchIssuesInput,
  IssueProviderType,
} from "@t3tools/contracts";
import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";

import { ensureNativeApi } from "../nativeApi";

// Connection status is cheap and changes only when the user connects or
// disconnects, so a relaxed cadence (plus refetch-on-focus and explicit
// invalidation after mutations) keeps it fresh without polling hard.
const CONNECTION_STATUS_STALE_TIME_MS = 30_000;
const CONNECTION_STATUS_REFETCH_INTERVAL_MS = 300_000;

const ISSUE_LIST_STALE_TIME_MS = 30_000;

export const integrationsQueryKeys = {
  all: ["integrations"] as const,
  connections: () => ["integrations", "connections"] as const,
  issues: (provider: IssueProviderType | null, context: string) =>
    ["integrations", "issues", provider, context] as const,
  search: (provider: IssueProviderType | null, term: string, context: string) =>
    ["integrations", "search", provider, term, context] as const,
};

export const integrationsMutationKeys = {
  connect: (provider: IssueProviderType) =>
    ["integrations", "mutation", "connect", provider] as const,
  disconnect: (provider: IssueProviderType) =>
    ["integrations", "mutation", "disconnect", provider] as const,
};

export function invalidateIntegrationConnections(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.connections() });
}

export function integrationConnectionsQueryOptions() {
  return queryOptions({
    queryKey: integrationsQueryKeys.connections(),
    queryFn: async (): Promise<ConnectionStatusMap> => {
      const api = ensureNativeApi();
      const result = await api.integrations.checkConnections();
      return result.statuses;
    },
    staleTime: CONNECTION_STATUS_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: "always",
    refetchInterval: CONNECTION_STATUS_REFETCH_INTERVAL_MS,
  });
}

export function integrationConnectMutationOptions(provider: IssueProviderType) {
  return mutationOptions({
    mutationKey: integrationsMutationKeys.connect(provider),
    mutationFn: async (input: IntegrationConnectInput) => {
      const api = ensureNativeApi();
      return api.integrations.connect(input);
    },
  });
}

export function integrationDisconnectMutationOptions(provider: IssueProviderType) {
  return mutationOptions({
    mutationKey: integrationsMutationKeys.disconnect(provider),
    mutationFn: async (input: IntegrationDisconnectInput) => {
      const api = ensureNativeApi();
      return api.integrations.disconnect(input);
    },
  });
}

/** A stable cache-key fragment for the optional project/repo context. */
const contextKey = (input: {
  projectPath?: string | undefined;
  repositoryUrl?: string | undefined;
}): string => `${input.projectPath ?? ""}::${input.repositoryUrl ?? ""}`;

export function integrationIssuesQueryOptions(
  provider: IssueProviderType | null,
  input: Omit<IntegrationListIssuesInput, "provider"> & { enabled?: boolean },
) {
  const { enabled = true, ...rest } = input;
  return queryOptions({
    queryKey: integrationsQueryKeys.issues(provider, contextKey(rest)),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!provider) throw new Error("No issue provider selected.");
      return api.integrations.listIssues({ provider, ...rest });
    },
    enabled: enabled && provider !== null,
    staleTime: ISSUE_LIST_STALE_TIME_MS,
  });
}

export function integrationSearchQueryOptions(
  provider: IssueProviderType | null,
  searchTerm: string,
  input: Omit<IntegrationSearchIssuesInput, "provider" | "searchTerm"> & { enabled?: boolean },
) {
  const { enabled = true, ...rest } = input;
  return queryOptions({
    queryKey: integrationsQueryKeys.search(provider, searchTerm, contextKey(rest)),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!provider) throw new Error("No issue provider selected.");
      return api.integrations.searchIssues({ provider, searchTerm, ...rest });
    },
    enabled: enabled && provider !== null && searchTerm.length > 0,
    staleTime: ISSUE_LIST_STALE_TIME_MS,
  });
}
