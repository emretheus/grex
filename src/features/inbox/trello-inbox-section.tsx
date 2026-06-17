import { useIsMutating } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { trelloListInboxItems, trelloSearchIssues } from "@/lib/api";
import type { ComposerInsertTarget } from "@/lib/composer-insert";
import { grexQueryKeys } from "@/lib/query-client";
import type { ContextCard } from "@/lib/sources/types";
import { IssueInboxSection } from "./issue-inbox-section";
import {
	TRELLO_CONNECT_MUTATION_KEY,
	TrelloConnectState,
} from "./trello-connect-button";
import { useTrelloConnections } from "./use-trello-connection";

/** Trello subtree of the Contexts sidebar — a thin wrapper that wires the
 *  Trello connections + list/search fns into the shared `IssueInboxSection`. */
export function TrelloInboxSection({
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
	const connectionsQuery = useTrelloConnections();
	const connections = connectionsQuery.data ?? [];
	const displayNames = new Map(
		connections.map((c) => [c.id, c.memberName ?? ""]),
	);
	const isConnecting =
		useIsMutating({ mutationKey: TRELLO_CONNECT_MUTATION_KEY }) > 0;

	return (
		<IssueInboxSection
			providerLabel="Trello"
			connected={connections.length > 0}
			isLoadingConnections={connectionsQuery.isLoading}
			isConnecting={isConnecting}
			connectState={<TrelloConnectState />}
			displayNames={displayNames}
			showWorkspace={connections.length > 1}
			inboxKey={grexQueryKeys.trelloInbox}
			searchKey={grexQueryKeys.trelloSearch}
			listFn={trelloListInboxItems}
			searchFn={trelloSearchIssues}
			emptyTitle={t("section.trello.emptyTitle")}
			emptySubtitle={t("section.trello.emptySubtitle")}
			onOpenCard={onOpenCard}
			selectedCardId={selectedCardId}
			appendContextTarget={appendContextTarget}
			horizontalPaddingClass={horizontalPaddingClass}
		/>
	);
}
