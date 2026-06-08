import type { IssueProviderType } from "@t3tools/contracts";

import { asanaAdapter } from "./asana";
import { featurebaseAdapter } from "./featurebase";
import { forgejoAdapter } from "./forgejo";
import { githubAdapter } from "./github";
import { gitlabAdapter } from "./gitlab";
import { jiraAdapter } from "./jira";
import { linearAdapter } from "./linear";
import { mondayAdapter } from "./monday";
import { plainAdapter } from "./plain";
import { trelloAdapter } from "./trello";
import type { ProviderAdapter } from "./types";

/**
 * The runtime adapter map. Adding a provider is one import + one entry here,
 * plus a shared metadata/auth-spec entry in `@t3tools/shared/integrations`.
 * Providers absent from this map report as unavailable.
 */
const ADAPTERS: Record<IssueProviderType, ProviderAdapter> = {
  linear: linearAdapter,
  github: githubAdapter,
  jira: jiraAdapter,
  gitlab: gitlabAdapter,
  forgejo: forgejoAdapter,
  asana: asanaAdapter,
  monday: mondayAdapter,
  trello: trelloAdapter,
  featurebase: featurebaseAdapter,
  plain: plainAdapter,
};

export const getAdapter = (type: IssueProviderType): ProviderAdapter | undefined => ADAPTERS[type];

export const listAdapters = (): ProviderAdapter[] => Object.values(ADAPTERS);

export const hasAdapter = (type: IssueProviderType): boolean => type in ADAPTERS;
