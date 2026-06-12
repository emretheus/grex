// FILE: providerUsage/types.ts
// Purpose: Shared contract for the server-side live provider-usage fetchers.

import type { ProviderKind, ServerProviderUsageSnapshot } from "@t3tools/contracts";

export interface ProviderUsageContext {
  readonly homeDir: string;
  readonly env: NodeJS.ProcessEnv;
  readonly platform: NodeJS.Platform;
  readonly nowMs: number;
}

export interface ProviderUsageFetcher {
  readonly provider: ProviderKind;
  fetch(ctx: ProviderUsageContext): Promise<ServerProviderUsageSnapshot>;
}
