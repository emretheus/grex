// FILE: EnvironmentUsageSection.tsx
// Purpose: "Usage" section of the Environment panel — same menu as the header chip.
//          Shows the most critical quota line inline (lowest remaining percent).

import type { ProviderKind } from "@t3tools/contracts";

import {
  ProviderUsageMenuPopup,
  useProviderUsageMenuModel,
} from "~/components/ProviderUsageMenuControl";
import { ProviderIcon } from "~/components/ProviderIcon";
import { MenuTrigger } from "~/components/ui/menu";

import {
  ENVIRONMENT_ROW_CLASS_NAME,
  ENVIRONMENT_ROW_ICON_CLASS_NAME,
  EnvironmentCollapsibleSection,
  EnvironmentRowBody,
  EnvironmentRowChevron,
} from "./EnvironmentRow";

export function EnvironmentUsageSection({ provider }: { provider: ProviderKind }) {
  const model = useProviderUsageMenuModel(provider);

  if (!model) {
    return null;
  }

  return (
    <EnvironmentCollapsibleSection label="Usage" defaultOpen>
      <ProviderUsageMenuPopup provider={provider} model={model} align="start">
        <MenuTrigger
          render={
            <button
              type="button"
              className={ENVIRONMENT_ROW_CLASS_NAME}
              aria-label={model.menuTitle}
            />
          }
        >
          <EnvironmentRowBody
            icon={
              <ProviderIcon
                provider={provider}
                tone="header"
                className={ENVIRONMENT_ROW_ICON_CLASS_NAME}
              />
            }
            label={
              model.isLoading ? (
                <span className="truncate">...</span>
              ) : model.summaryRows.length > 0 ? (
                <span className="flex min-w-0 items-center gap-2 truncate">
                  {model.summaryRows.map((row) => (
                    <span key={row.id} className="flex items-baseline gap-1">
                      <span className="text-[var(--color-text-foreground-secondary)]">
                        {row.label}
                      </span>
                      <span className="tabular-nums">{row.remainingPercent}%</span>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="truncate">
                  {model.primaryRow?.remainingLabel ?? model.menuTitle}
                </span>
              )
            }
            trailing={<EnvironmentRowChevron />}
          />
        </MenuTrigger>
      </ProviderUsageMenuPopup>
    </EnvironmentCollapsibleSection>
  );
}
