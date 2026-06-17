import { useIsMutating } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { forgejoListInboxItems, forgejoSearchIssues } from "@/lib/api";
import type { ComposerInsertTarget } from "@/lib/composer-insert";
import { grexQueryKeys } from "@/lib/query-client";
import type { ContextCard } from "@/lib/sources/types";
import {
	FORGEJO_CONNECT_MUTATION_KEY,
	ForgejoConnectState,
} from "./forgejo-connect-button";
import { IssueInboxSection } from "./issue-inbox-section";
import { useForgejoConnections } from "./use-forgejo-connection";

/** Forgejo subtree of the Contexts sidebar — a thin wrapper that wires the
 *  Forgejo connections + list/search fns into the shared `IssueInboxSection`. */
export function ForgejoInboxSection({
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
	const connectionsQuery = useForgejoConnections();
	const connections = connectionsQuery.data ?? [];
	const displayNames = new Map(
		connections.map((c) => [c.id, c.hostName ?? ""]),
	);
	const isConnecting =
		useIsMutating({ mutationKey: FORGEJO_CONNECT_MUTATION_KEY }) > 0;

	return (
		<IssueInboxSection
			providerLabel="Forgejo"
			connected={connections.length > 0}
			isLoadingConnections={connectionsQuery.isLoading}
			isConnecting={isConnecting}
			connectState={<ForgejoConnectState />}
			displayNames={displayNames}
			showWorkspace={connections.length > 1}
			inboxKey={grexQueryKeys.forgejoInbox}
			searchKey={grexQueryKeys.forgejoSearch}
			listFn={forgejoListInboxItems}
			searchFn={forgejoSearchIssues}
			emptyTitle={t("section.forgejo.emptyTitle")}
			emptySubtitle={t("section.forgejo.emptySubtitle")}
			onOpenCard={onOpenCard}
			selectedCardId={selectedCardId}
			appendContextTarget={appendContextTarget}
			horizontalPaddingClass={horizontalPaddingClass}
		/>
	);
}
