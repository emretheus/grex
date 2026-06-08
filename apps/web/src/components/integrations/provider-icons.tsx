import type { IssueProviderType } from "@t3tools/contracts";

import { cn } from "~/lib/utils";

/**
 * Lightweight branded monograms for each issue-tracker provider. These are
 * deliberately simple (a tinted rounded square with the provider's initial)
 * rather than the official logos — it keeps the bundle small and sidesteps
 * trademark concerns while still giving each provider a recognizable color.
 */
const PROVIDER_BRAND: Record<IssueProviderType, { bg: string; fg: string; label: string }> = {
  linear: { bg: "#5E6AD2", fg: "#ffffff", label: "L" },
  github: { bg: "#1f2328", fg: "#ffffff", label: "G" },
  jira: { bg: "#0052CC", fg: "#ffffff", label: "J" },
  gitlab: { bg: "#FC6D26", fg: "#ffffff", label: "G" },
  forgejo: { bg: "#FB923C", fg: "#1f2328", label: "F" },
  asana: { bg: "#F06A6A", fg: "#ffffff", label: "A" },
  monday: { bg: "#FF3D57", fg: "#ffffff", label: "M" },
  trello: { bg: "#0079BF", fg: "#ffffff", label: "T" },
  featurebase: { bg: "#6366F1", fg: "#ffffff", label: "F" },
  plain: { bg: "#111827", fg: "#ffffff", label: "P" },
};

interface ProviderIconProps {
  provider: IssueProviderType;
  className?: string;
}

export function ProviderIcon({ provider, className }: ProviderIconProps) {
  const brand = PROVIDER_BRAND[provider];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex items-center justify-center rounded-[5px] text-[10px] font-semibold leading-none",
        className,
      )}
      style={{ backgroundColor: brand.bg, color: brand.fg }}
    >
      {brand.label}
    </span>
  );
}
