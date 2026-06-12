// FILE: ProviderUsageMenuControl.tsx
// Purpose: Shared provider-usage chip/popover used in the chat header and
//          Environment panel — shows live remaining quota at a glance.
// Layer: Shared UI component

import { PROVIDER_DISPLAY_NAMES, type ProviderKind } from "@t3tools/contracts";
import { useMemo, type ReactNode } from "react";

import { useAppSettings } from "~/appSettings";
import { useProviderUsageSummary } from "~/hooks/useProviderUsageSummary";
import type { OpenUsageUsageLine } from "~/lib/openUsageRateLimits";
import { deriveVisibleRateLimitRows, type ProviderRateLimit } from "~/lib/rateLimits";
import { useStore } from "~/store";
import { createAllThreadsSelector } from "~/storeSelectors";
import { cn } from "~/lib/utils";

import { ComposerPickerMenuPopup } from "./chat/ComposerPickerMenuPopup";
import { Menu, MenuTrigger } from "./ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { ProviderIcon } from "./ProviderIcon";
import { ProviderUsagePanelContent } from "./ProviderUsagePanelContent";

export interface ProviderUsageSummaryRow {
  id: string;
  label: string;
  remainingPercent: number;
}

export interface ProviderUsageMenuModel {
  menuTitle: string;
  primaryRow: {
    remainingLabel: string;
    remainingPercent: number;
  } | null;
  // The rate-limit windows worth surfacing inline on the collapsed control
  // (e.g. "5h" and "Weekly"), in display order. Empty when no windows exist.
  summaryRows: ReadonlyArray<ProviderUsageSummaryRow>;
  rateLimits: ReadonlyArray<ProviderRateLimit>;
  usageLines: ReadonlyArray<OpenUsageUsageLine>;
  isLoading: boolean;
}

// Windows shown inline on the compact usage control, in display order.
const SUMMARY_WINDOW_LABELS = ["5h", "Weekly"] as const;

export function useProviderUsageMenuModel(provider: ProviderKind): ProviderUsageMenuModel | null {
  const { settings } = useAppSettings();
  const selectAllThreads = useMemo(() => createAllThreadsSelector(), []);
  const threads = useStore(selectAllThreads);
  const usageSummary = useProviderUsageSummary({
    provider,
    threads: threads.filter((t) => t.modelSelection.provider === provider),
    codexHomePath: provider === "codex" ? (settings.codexHomePath ?? null) : null,
  });

  // Derive the primary display row from rate limits — the most critical quota
  // (lowest remaining percent) that should be shown in the compact inline label.
  const visibleRows = useMemo(
    () => deriveVisibleRateLimitRows(usageSummary.rateLimits),
    [usageSummary.rateLimits],
  );

  const primaryRow = useMemo(() => {
    return visibleRows.reduce<{ remainingLabel: string; remainingPercent: number } | null>(
      (selected, row) => {
        const percent = row.remainingPercent;
        if (!selected || percent < selected.remainingPercent) {
          return {
            remainingLabel: `${percent}% left`,
            remainingPercent: percent,
          };
        }
        return selected;
      },
      null,
    );
  }, [visibleRows]);

  // The 5h and Weekly windows, surfaced together on the collapsed control so
  // both critical quotas are visible at a glance without opening the menu.
  const summaryRows = useMemo<ReadonlyArray<ProviderUsageSummaryRow>>(() => {
    return SUMMARY_WINDOW_LABELS.flatMap((label) => {
      const row = visibleRows.find((candidate) => candidate.label === label);
      return row ? [{ id: row.id, label: row.label, remainingPercent: row.remainingPercent }] : [];
    });
  }, [visibleRows]);

  const hasData = usageSummary.rateLimits.length > 0 || usageSummary.usageLines.length > 0;
  if (!hasData && !usageSummary.isLoading) {
    return null;
  }

  return {
    menuTitle: `${PROVIDER_DISPLAY_NAMES[provider]} usage`,
    primaryRow,
    summaryRows,
    rateLimits: usageSummary.rateLimits,
    usageLines: usageSummary.usageLines,
    isLoading: usageSummary.isLoading,
  };
}

export function ProviderUsageMenuPopup({
  provider,
  model,
  align = "end",
  children,
}: {
  provider: ProviderKind;
  model: ProviderUsageMenuModel;
  align?: "start" | "end";
  children: ReactNode;
}) {
  return (
    <Menu modal={false}>
      {children}
      <ComposerPickerMenuPopup align={align} side="bottom" className="w-64 min-w-64">
        <ProviderUsagePanelContent
          provider={provider}
          rateLimits={model.rateLimits}
          usageLines={model.usageLines}
          isLoading={model.isLoading}
          showTitle={false}
          className="px-2 pb-1 pt-1"
        />
      </ComposerPickerMenuPopup>
    </Menu>
  );
}

export function ProviderUsageMenuControl({
  provider,
  className,
}: {
  provider: ProviderKind;
  className?: string;
}) {
  const model = useProviderUsageMenuModel(provider);

  if (!model) {
    return null;
  }

  return (
    <ProviderUsageMenuPopup provider={provider} model={model}>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                    "hover:bg-accent/50",
                    "text-muted-foreground hover:text-foreground",
                    className,
                  )}
                  aria-label={model.menuTitle}
                />
              }
            >
              <ProviderIcon provider={provider} tone="header" className="size-3 shrink-0" />
              <span className="truncate max-w-[8ch]">
                {model.isLoading ? "..." : (model.primaryRow?.remainingLabel ?? provider)}
              </span>
            </MenuTrigger>
          }
        />
        <TooltipPopup side="bottom">{model.menuTitle}</TooltipPopup>
      </Tooltip>
    </ProviderUsageMenuPopup>
  );
}
