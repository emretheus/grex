import type { IssueProviderType } from "@t3tools/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ISSUE_PROVIDER_META, ISSUE_PROVIDER_ORDER } from "@t3tools/shared/integrations";
import { useState } from "react";

import { CheckIcon, PlusIcon } from "~/lib/icons";
import {
  integrationConnectionsQueryOptions,
  integrationDisconnectMutationOptions,
  invalidateIntegrationConnections,
} from "~/lib/integrationsReactQuery";
import { cn } from "~/lib/utils";
import { SETTINGS_SECTION_LABEL_CLASS_NAME } from "~/settingsPanelStyles";
import { Spinner } from "../ui/spinner";
import { IntegrationConnectDialog } from "./IntegrationConnectDialog";
import { ProviderIcon } from "./provider-icons";

const PROVIDER_DESCRIPTIONS: Record<IssueProviderType, string> = {
  linear: "Work on Linear issues",
  github: "Work on GitHub issues",
  jira: "Work on Jira tickets",
  gitlab: "Work on GitLab issues",
  forgejo: "Work on Forgejo issues",
  asana: "Work on Asana tasks",
  monday: "Work on Monday.com items",
  trello: "Work on Trello cards",
  featurebase: "Work on Featurebase posts",
  plain: "Work on Plain threads",
};

const actionButtonClassName = cn(
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg border",
  "border-[color:var(--color-border)] text-muted-foreground transition-colors",
  "hover:bg-[var(--sidebar-accent)] hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
  "disabled:pointer-events-none disabled:opacity-60",
);

function ProviderCard({
  provider,
  connected,
  displayName,
  isLoading,
  onConnect,
}: {
  provider: IssueProviderType;
  connected: boolean;
  displayName: string | undefined;
  isLoading: boolean;
  onConnect: () => void;
}) {
  const queryClient = useQueryClient();
  const disconnectMutation = useMutation({
    ...integrationDisconnectMutationOptions(provider),
    onSettled: () => invalidateIntegrationConnections(queryClient),
  });

  const meta = ISSUE_PROVIDER_META[provider];
  const subtitle = connected
    ? displayName
      ? `Connected · ${displayName}`
      : "Connected"
    : PROVIDER_DESCRIPTIONS[provider];

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3.5",
        "border-[color:var(--color-border)] bg-[var(--color-surface,transparent)]",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sidebar-accent)]/60">
        <ProviderIcon provider={provider} size={20} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{meta.displayName}</p>
        <p
          className={cn(
            "truncate text-xs",
            connected ? "text-emerald-500" : "text-muted-foreground",
          )}
        >
          {subtitle}
        </p>
      </div>

      {isLoading ? (
        <span className="inline-flex size-8 items-center justify-center">
          <Spinner className="size-4" />
        </span>
      ) : connected ? (
        <button
          type="button"
          aria-label={`Disconnect ${meta.displayName}`}
          title={`Disconnect ${meta.displayName}`}
          disabled={disconnectMutation.isPending}
          onClick={() => disconnectMutation.mutate({ provider })}
          className={cn(actionButtonClassName, "text-emerald-500 hover:text-emerald-400")}
        >
          {disconnectMutation.isPending ? (
            <Spinner className="size-4" />
          ) : (
            <CheckIcon className="size-4" />
          )}
        </button>
      ) : (
        <button
          type="button"
          aria-label={`Connect ${meta.displayName}`}
          title={`Connect ${meta.displayName}`}
          onClick={onConnect}
          className={actionButtonClassName}
        >
          <PlusIcon className="size-4" />
        </button>
      )}
    </div>
  );
}

export function IntegrationsSettingsPanel() {
  const connectionsQuery = useQuery(integrationConnectionsQueryOptions());
  const [dialogProvider, setDialogProvider] = useState<IssueProviderType | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const statuses = connectionsQuery.data;

  const openConnect = (provider: IssueProviderType) => {
    setDialogProvider(provider);
    setDialogOpen(true);
  };

  return (
    <section className="flex flex-col gap-1.5 not-first:mt-4">
      <h2 className={SETTINGS_SECTION_LABEL_CLASS_NAME}>Issue trackers</h2>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {ISSUE_PROVIDER_ORDER.map((provider) => {
          const status = statuses?.[provider];
          return (
            <ProviderCard
              key={provider}
              provider={provider}
              connected={status?.connected ?? false}
              displayName={status?.displayName}
              isLoading={connectionsQuery.isLoading}
              onConnect={() => openConnect(provider)}
            />
          );
        })}
      </div>

      <IntegrationConnectDialog
        provider={dialogProvider}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </section>
  );
}
