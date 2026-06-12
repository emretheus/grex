// FILE: ProviderUsageSettingsPanel.tsx
// Purpose: Polished standalone Usage settings page — provider quota cards with
//          progress bars, brand colors, and live refresh.
// Layer: Settings section component

import type { ProviderKind } from "@t3tools/contracts";
import { PROVIDER_DISPLAY_NAMES } from "@t3tools/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { memo, useCallback, useMemo, useState } from "react";

import { useAppSettings } from "~/appSettings";
import { useProviderUsageSummary } from "~/hooks/useProviderUsageSummary";
import { RefreshCwIcon } from "~/lib/icons";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { ProviderIcon } from "~/components/ProviderIcon";
import { ProviderUsagePanelContent } from "~/components/ProviderUsagePanelContent";

import { SETTINGS_CARD_CLASS_NAME } from "~/settingsPanelStyles";

const USAGE_PROVIDERS: ReadonlyArray<ProviderKind> = [
  "codex",
  "claudeAgent",
  "cursor",
  "gemini",
  "grok",
  "opencode",
  "kilo",
  "pi",
  "qwenCode",
  "auggie",
  "goose",
];

interface ProviderAccent {
  border: string;
  bg: string;
  text: string;
  meterTrack: string;
  meterFill: string;
}

const PROVIDER_ACCENTS: Partial<Record<ProviderKind, ProviderAccent>> = {
  codex: {
    border: "border-l-emerald-500/60",
    bg: "bg-emerald-500/5",
    text: "text-emerald-600 dark:text-emerald-400",
    meterTrack: "bg-emerald-500/10",
    meterFill: "bg-emerald-500",
  },
  claudeAgent: {
    border: "border-l-amber-500/60",
    bg: "bg-amber-500/5",
    text: "text-amber-600 dark:text-amber-400",
    meterTrack: "bg-amber-500/10",
    meterFill: "bg-amber-500",
  },
  cursor: {
    border: "border-l-violet-500/60",
    bg: "bg-violet-500/5",
    text: "text-violet-600 dark:text-violet-400",
    meterTrack: "bg-violet-500/10",
    meterFill: "bg-violet-500",
  },
  gemini: {
    border: "border-l-blue-500/60",
    bg: "bg-blue-500/5",
    text: "text-blue-600 dark:text-blue-400",
    meterTrack: "bg-blue-500/10",
    meterFill: "bg-blue-500",
  },
  grok: {
    border: "border-l-cyan-500/60",
    bg: "bg-cyan-500/5",
    text: "text-cyan-600 dark:text-cyan-400",
    meterTrack: "bg-cyan-500/10",
    meterFill: "bg-cyan-500",
  },
  goose: {
    border: "border-l-rose-500/60",
    bg: "bg-rose-500/5",
    text: "text-rose-600 dark:text-rose-400",
    meterTrack: "bg-rose-500/10",
    meterFill: "bg-rose-500",
  },
};

function fallbackAccent(): ProviderAccent {
  return {
    border: "border-l-slate-400/40",
    bg: "bg-slate-500/5",
    text: "text-slate-500 dark:text-slate-400",
    meterTrack: "bg-slate-500/10",
    meterFill: "bg-slate-500",
  };
}

function ProviderUsageCard({ provider }: { provider: ProviderKind }) {
  const { settings } = useAppSettings();
  const codexHomePath = provider === "codex" ? (settings.codexHomePath ?? null) : null;
  const { isLoading, learnMoreHref, rateLimits, usageLines } = useProviderUsageSummary({
    provider,
    threads: [],
    codexHomePath,
  });

  const accent = PROVIDER_ACCENTS[provider] ?? fallbackAccent();
  const displayName = PROVIDER_DISPLAY_NAMES[provider];
  const hasData = rateLimits.length > 0 || usageLines.length > 0;
  const isEmpty = !isLoading && !hasData;

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 overflow-hidden border-l-2 bg-card/60 p-3.5 transition-shadow hover:shadow-sm",
        SETTINGS_CARD_CLASS_NAME,
        accent.border,
        accent.bg,
      )}
    >
      <div className="flex items-center gap-2">
        <ProviderIcon provider={provider} className="size-4 shrink-0" />
        <span className={cn("text-sm font-semibold", accent.text)}>{displayName}</span>
        {isLoading ? (
          <span className="ml-auto h-1.5 w-8 animate-pulse rounded-full bg-muted-foreground/20" />
        ) : null}
      </div>

      {isEmpty ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground/70">
          No usage data available yet. Start a session with {displayName} to see limits.
        </p>
      ) : (
        <ProviderUsagePanelContent
          provider={provider}
          rateLimits={rateLimits}
          usageLines={usageLines}
          isLoading={isLoading}
          learnMoreHref={learnMoreHref}
          showTitle={false}
          className="text-[11px]"
        />
      )}

      {hasData ? (
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
          <div className={cn("h-1 w-1 rounded-full", accent.meterFill)} />
          <span>Live from provider CLI</span>
        </div>
      ) : null}
    </div>
  );
}

export const ProviderUsageSettingsPanel = memo(function ProviderUsageSettingsPanel() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void queryClient
      .invalidateQueries({ queryKey: ["server", "allProviderUsage"] })
      .then(() => queryClient.invalidateQueries({ queryKey: ["server", "providerUsage"] }))
      .finally(() => setTimeout(() => setRefreshing(false), 600));
  }, [queryClient]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[length:var(--app-font-size-ui-sm,13px)] leading-relaxed text-muted-foreground">
            Live remaining quotas and credits read from your provider CLI credentials. Start a
            session with any provider to populate its card.
          </p>
        </div>
        <Button
          variant="outline"
          size="xs"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh usage data"
          aria-label="Refresh usage data"
        >
          <RefreshCwIcon className={cn("size-3.5", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {USAGE_PROVIDERS.map((provider) => (
          <ProviderUsageCard key={provider} provider={provider} />
        ))}
      </div>
    </div>
  );
});
