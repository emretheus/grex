import type { IssueProviderType } from "@t3tools/contracts";

import { linearAdapter } from "./linear";
import type { ProviderAdapter } from "./types";

/**
 * The runtime adapter map. Adding a provider is one import + one entry here,
 * plus a shared metadata/auth-spec entry in `@t3tools/shared/integrations`.
 * Providers absent from this map report as unavailable.
 */
const ADAPTERS: Partial<Record<IssueProviderType, ProviderAdapter>> = {
  linear: linearAdapter,
};

export const getAdapter = (type: IssueProviderType): ProviderAdapter | undefined => ADAPTERS[type];

export const listAdapters = (): ProviderAdapter[] => Object.values(ADAPTERS);

export const hasAdapter = (type: IssueProviderType): boolean => type in ADAPTERS;
