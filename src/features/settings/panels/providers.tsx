import { useIsMutating, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
	ClaudeColorIcon,
	CursorIcon,
	GeminiColorIcon,
	KimiIcon,
	OpenAIIcon,
	OpenCodeIcon,
} from "@/components/icons";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getAgentLoginStatus, getAgentVersions } from "@/lib/api";
import { grexQueryKeys } from "@/lib/query-client";
import { SettingsGroup } from "../components/settings-row";
import { AgentProxyPanel, ClaudeCustomProvidersPanel } from "./model-providers";
import { CodexCustomProvidersPanel } from "./providers/codex-custom-providers";
import { CursorCardBody } from "./providers/cursor-card-body";
import { KimiCustomProvidersPanel } from "./providers/kimi-custom-providers";
import { OfficialModelSelect } from "./providers/official-model-select";
import { OpencodeCustomProvidersPanel } from "./providers/opencode-custom-providers";
import {
	OpencodeModels,
	type OpencodeModelsHandle,
} from "./providers/opencode-models";
import { ProviderConfigRow, ProviderRow } from "./providers/provider-row";
import { useKimiModelSync } from "./providers/use-kimi-model-sync";

// SettingsDialog renders outside AppShell's TooltipProvider, so wrap our own.
export function ProvidersPanel() {
	const { t } = useTranslation("providers");
	const statusQuery = useQuery({
		queryKey: grexQueryKeys.agentLoginStatus,
		queryFn: getAgentLoginStatus,
	});
	const status = statusQuery.data;
	// CLI versions change only across app builds — cache for the session.
	const versionsQuery = useQuery({
		queryKey: grexQueryKeys.agentVersions,
		queryFn: getAgentVersions,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const versions = versionsQuery.data;
	const opencodeModelsRef = useRef<OpencodeModelsHandle | null>(null);

	// First status fetch in flight → show "Connecting…" instead of a premature
	// "Log in". opencode also stays connecting while a model sync (server boot)
	// runs, since its readiness is derived from that fetch's cache.
	const statusLoading = statusQuery.isLoading;
	const opencodeSyncing =
		useIsMutating({ mutationKey: ["opencodeModelSync"] }) > 0;
	const kimiSyncing = useIsMutating({ mutationKey: ["kimiModelSync"] }) > 0;

	const refetchStatus = () => {
		void statusQuery.refetch();
	};

	// Refresh the Kimi model cache (`app.kimi_provider`) whenever Settings opens
	// so the composer picker reflects `~/.kimi-code` config edits / a fresh login.
	const { sync: syncKimi } = useKimiModelSync();
	useEffect(() => {
		void syncKimi();
	}, [syncKimi]);

	return (
		<TooltipProvider>
			<SettingsGroup>
				<ProviderRow
					icon={OpenCodeIcon}
					name="OpenCode"
					version={versions?.opencode}
					ready={Boolean(status?.opencode)}
					connecting={statusLoading || opencodeSyncing}
					loginProvider="opencode"
					onLoginExit={() => {
						refetchStatus();
						opencodeModelsRef.current?.refresh();
					}}
					collapsible
				>
					<ProviderConfigRow
						label={t("common.models")}
						description={t("providers.opencode.modelsDescription")}
					>
						<OpencodeModels ref={opencodeModelsRef} />
					</ProviderConfigRow>
					<ProviderConfigRow
						label={t("common.customProviders")}
						description={t("providers.opencode.customProvidersDescription")}
					>
						<OpencodeCustomProvidersPanel
							onChanged={() => opencodeModelsRef.current?.syncIfIdle()}
						/>
					</ProviderConfigRow>
				</ProviderRow>
				<ProviderRow
					icon={ClaudeColorIcon}
					name="Claude Code"
					version={versions?.claude}
					ready={Boolean(status?.claude)}
					connecting={statusLoading}
					loginProvider="claude"
					onLoginExit={refetchStatus}
					collapsible
				>
					<ProviderConfigRow
						label={t("common.models")}
						description={t("providers.claude.modelsDescription")}
					>
						<OfficialModelSelect provider="claude" />
					</ProviderConfigRow>
					<ProviderConfigRow
						label={t("common.customProviders")}
						description={t("providers.claude.customProvidersDescription")}
					>
						<ClaudeCustomProvidersPanel />
					</ProviderConfigRow>
				</ProviderRow>
				<ProviderRow
					icon={OpenAIIcon}
					name="Codex"
					version={versions?.codex}
					ready={Boolean(status?.codex)}
					connecting={statusLoading}
					loginProvider="codex"
					onLoginExit={refetchStatus}
					collapsible
				>
					<ProviderConfigRow
						label={t("common.models")}
						description={t("providers.codex.modelsDescription")}
					>
						<OfficialModelSelect provider="codex" />
					</ProviderConfigRow>
					<ProviderConfigRow
						label={t("common.customProviders")}
						description={t("providers.codex.customProvidersDescription")}
					>
						<CodexCustomProvidersPanel />
					</ProviderConfigRow>
				</ProviderRow>
				<ProviderRow
					icon={CursorIcon}
					name="Cursor"
					ready={Boolean(status?.cursor)}
					loginProvider={null}
				>
					<ProviderConfigRow description={t("providers.cursor.description")}>
						<CursorCardBody />
					</ProviderConfigRow>
				</ProviderRow>
				<ProviderRow
					icon={GeminiColorIcon}
					name="Gemini"
					version={versions?.gemini}
					ready={Boolean(status?.gemini)}
					connecting={statusLoading}
					loginProvider="gemini"
					onLoginExit={refetchStatus}
				/>
				<ProviderRow
					icon={KimiIcon}
					name="Kimi"
					version={versions?.kimi}
					ready={Boolean(status?.kimi)}
					connecting={statusLoading || kimiSyncing}
					loginProvider="kimi"
					onLoginExit={() => {
						refetchStatus();
						void syncKimi();
					}}
					collapsible
				>
					<ProviderConfigRow
						label={t("common.customProviders")}
						description={t("providers.kimi.customProvidersDescription")}
					>
						<KimiCustomProvidersPanel onChanged={() => void syncKimi()} />
					</ProviderConfigRow>
				</ProviderRow>
				<AgentProxyPanel />
			</SettingsGroup>
		</TooltipProvider>
	);
}
