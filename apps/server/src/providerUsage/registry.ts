// FILE: registry.ts
// Purpose: Map each supported ProviderKind to its live usage fetcher.

import type { ProviderKind } from "@t3tools/contracts";
import { codexUsageFetcher } from "./providers/codex";
import { claudeUsageFetcher } from "./providers/claude";
import { cursorUsageFetcher } from "./providers/cursor";
import { geminiUsageFetcher } from "./providers/gemini";
import type { ProviderUsageFetcher } from "./types";

export const PROVIDER_USAGE_FETCHERS: Partial<Record<ProviderKind, ProviderUsageFetcher>> = {
  codex: codexUsageFetcher,
  claudeAgent: claudeUsageFetcher,
  cursor: cursorUsageFetcher,
  gemini: geminiUsageFetcher,
};
