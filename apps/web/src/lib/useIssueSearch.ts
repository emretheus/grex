import type { IssueProviderType, LinkedIssue } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { ISSUE_PROVIDER_ORDER } from "@t3tools/shared/integrations";
import { useEffect, useMemo, useState } from "react";

import {
  integrationConnectionsQueryOptions,
  integrationIssuesQueryOptions,
  integrationSearchQueryOptions,
} from "./integrationsReactQuery";

export interface UseIssueSearchResult {
  /** Providers the user has connected, in display order. */
  connectedProviders: IssueProviderType[];
  hasAnyIntegration: boolean;
  /** The currently selected provider (auto-defaults to the first connected one). */
  provider: IssueProviderType | null;
  setProvider: (provider: IssueProviderType) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  issues: LinkedIssue[];
  isLoading: boolean;
  error: string | null;
}

interface UseIssueSearchOptions {
  projectPath?: string | undefined;
  repositoryUrl?: string | undefined;
  enabled?: boolean;
}

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Bridges the connected-providers list with the list/search issue queries.
 * Mirrors emdash's `useIssueSearch`: pick a provider (defaulting to the first
 * connected one), debounce the search term, and surface either the recent
 * issues (empty term) or the search results.
 */
export function useIssueSearch(options: UseIssueSearchOptions = {}): UseIssueSearchResult {
  const { projectPath, repositoryUrl, enabled = true } = options;

  const connectionsQuery = useQuery(integrationConnectionsQueryOptions());
  const connectedProviders = useMemo(() => {
    const statuses = connectionsQuery.data;
    if (!statuses) return [];
    return ISSUE_PROVIDER_ORDER.filter((provider) => statuses[provider]?.connected);
  }, [connectionsQuery.data]);

  const [explicitProvider, setExplicitProvider] = useState<IssueProviderType | null>(null);
  const provider = explicitProvider ?? connectedProviders[0] ?? null;

  // Drop an explicit selection that is no longer connected.
  useEffect(() => {
    if (explicitProvider && !connectedProviders.includes(explicitProvider)) {
      setExplicitProvider(null);
    }
  }, [connectedProviders, explicitProvider]);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm] = useDebouncedValue(searchTerm, { wait: SEARCH_DEBOUNCE_MS });
  const trimmedTerm = debouncedTerm.trim();
  const isSearching = trimmedTerm.length > 0;

  const listQuery = useQuery(
    integrationIssuesQueryOptions(provider, {
      projectPath,
      repositoryUrl,
      enabled: enabled && !isSearching,
    }),
  );
  const searchQuery = useQuery(
    integrationSearchQueryOptions(provider, trimmedTerm, {
      projectPath,
      repositoryUrl,
      enabled: enabled && isSearching,
    }),
  );

  const activeQuery = isSearching ? searchQuery : listQuery;
  const result = activeQuery.data;

  const issues = result?.success ? result.issues : [];
  const error = result && !result.success ? result.error : null;

  return {
    connectedProviders,
    hasAnyIntegration: connectedProviders.length > 0,
    provider,
    setProvider: setExplicitProvider,
    searchTerm,
    setSearchTerm,
    issues: [...issues],
    isLoading: activeQuery.isLoading || (enabled && connectionsQuery.isLoading),
    error,
  };
}
