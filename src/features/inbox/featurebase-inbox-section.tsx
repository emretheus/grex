import { useIsMutating } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { featurebaseListInboxItems, featurebaseSearchIssues } from "@/lib/api";
import type { ComposerInsertTarget } from "@/lib/composer-insert";
import { grexQueryKeys } from "@/lib/query-client";
import type { ContextCard } from "@/lib/sources/types";
import {
	FEATUREBASE_CONNECT_MUTATION_KEY,
	FeaturebaseConnectState,
} from "./featurebase-connect-button";
import { IssueInboxSection } from "./issue-inbox-section";
import { useFeaturebaseConnections } from "./use-featurebase-connection";

/** Featurebase subtree of the Contexts sidebar — a thin wrapper that wires the
 *  Featurebase connections + list/search fns into the shared `IssueInboxSection`. */
export function FeaturebaseInboxSection({
	onOpenCard,
	selectedCardId,
	appendContextTarget,
	horizontalPaddingClass,
}: {
	onOpenCard?: (card: ContextCard) => void;
	selectedCardId?: string | null;
	appendContextTarget?: ComposerInsertTarget;
	horizontalPaddingClass: string;
}) {
	const { t } = useTranslation("inbox");
	const connectionsQuery = useFeaturebaseConnections();
	const connections = connectionsQuery.data ?? [];
	const displayNames = new Map(connections.map((c) => [c.id, c.orgName ?? ""]));
	const isConnecting =
		useIsMutating({ mutationKey: FEATUREBASE_CONNECT_MUTATION_KEY }) > 0;

	return (
		<IssueInboxSection
			providerLabel="Featurebase"
			connected={connections.length > 0}
			isLoadingConnections={connectionsQuery.isLoading}
			isConnecting={isConnecting}
			connectState={<FeaturebaseConnectState />}
			displayNames={displayNames}
			showWorkspace={connections.length > 1}
			inboxKey={grexQueryKeys.featurebaseInbox}
			searchKey={grexQueryKeys.featurebaseSearch}
			listFn={featurebaseListInboxItems}
			searchFn={featurebaseSearchIssues}
			emptyTitle={t("section.featurebase.emptyTitle")}
			emptySubtitle={t("section.featurebase.emptySubtitle")}
			onOpenCard={onOpenCard}
			selectedCardId={selectedCardId}
			appendContextTarget={appendContextTarget}
			horizontalPaddingClass={horizontalPaddingClass}
		/>
	);
}
