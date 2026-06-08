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
import { SettingsRow, SettingsSection } from "../settings/SettingsPanelPrimitives";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { IntegrationConnectDialog } from "./IntegrationConnectDialog";
import { ProviderIcon } from "./provider-icons";

const PROVIDER_DESCRIPTIONS: Record<IssueProviderType, string> = {
  linear: "Link Linear issues to your threads.",
  github: "Link GitHub issues to your threads.",
  jira: "Link Jira issues to your threads.",
  gitlab: "Link GitLab issues to your threads.",
  forgejo: "Link Forgejo issues to your threads.",
  asana: "Link Asana tasks to your threads.",
  monday: "Link Monday.com items to your threads.",
  trello: "Link Trello cards to your threads.",
  featurebase: "Link Featurebase posts to your threads.",
  plain: "Link Plain threads to your threads.",
};

function DisconnectButton({ provider }: { provider: IssueProviderType }) {
  const queryClient = useQueryClient();
  const disconnectMutation = useMutation({
    ...integrationDisconnectMutationOptions(provider),
    onSettled: () => invalidateIntegrationConnections(queryClient),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disconnectMutation.isPending}
      onClick={() => disconnectMutation.mutate({ provider })}
    >
      {disconnectMutation.isPending ? (
        <Spinner className="size-4" />
      ) : (
        <CheckIcon className="text-emerald-500" />
      )}
      Connected
    </Button>
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
    <>
      <SettingsSection title="Issue trackers">
        {ISSUE_PROVIDER_ORDER.map((provider) => {
          const status = statuses?.[provider];
          const connected = status?.connected ?? false;
          return (
            <SettingsRow
              key={provider}
              title={ISSUE_PROVIDER_META[provider].displayName}
              description={PROVIDER_DESCRIPTIONS[provider]}
              status={
                connected && status?.displayName ? `Connected as ${status.displayName}` : undefined
              }
              control={
                <div className="flex items-center gap-2">
                  <ProviderIcon provider={provider} className="size-5 opacity-80" />
                  {connectionsQuery.isLoading ? (
                    <Spinner className="size-4" />
                  ) : connected ? (
                    <DisconnectButton provider={provider} />
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => openConnect(provider)}>
                      <PlusIcon />
                      Connect
                    </Button>
                  )}
                </div>
              }
            />
          );
        })}
      </SettingsSection>

      <IntegrationConnectDialog
        provider={dialogProvider}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
