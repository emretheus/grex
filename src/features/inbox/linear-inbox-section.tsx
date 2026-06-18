import { useIsMutating } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { linearListInboxItems, linearSearchIssues } from "@/lib/api";
import type { ComposerInsertTarget } from "@/lib/composer-insert";
import { grexQueryKeys } from "@/lib/query-client";
import type { ContextCard } from "@/lib/sources/types";
import { IssueInboxSection } from "./issue-inbox-section";
import {
	LINEAR_CONNECT_MUTATION_KEY,
	LinearConnectState,
} from "./linear-connect-button";
import { useLinearConnections } from "./use-linear-connection";

/** Linear subtree of the Contexts sidebar — a thin wrapper that wires the
 *  Linear connections + list/search fns into the shared `IssueInboxSection`. */
export function LinearInboxSection({
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
	const connectionsQuery = useLinearConnections();
	const connections = connectionsQuery.data ?? [];
	const displayNames = new Map(
		connections.map((c) => [c.id, c.workspaceName ?? ""]),
	);
	const isConnecting =
		useIsMutating({ mutationKey: LINEAR_CONNECT_MUTATION_KEY }) > 0;

	return (
		<IssueInboxSection
			providerLabel="Linear"
			connected={connections.length > 0}
			isLoadingConnections={connectionsQuery.isLoading}
			isConnecting={isConnecting}
			connectState={<LinearConnectState />}
			displayNames={displayNames}
			showWorkspace={connections.length > 1}
			inboxKey={grexQueryKeys.linearInbox}
			searchKey={grexQueryKeys.linearSearch}
			listFn={linearListInboxItems}
			searchFn={linearSearchIssues}
			emptyTitle={t("section.linear.emptyTitle")}
			emptySubtitle={t("section.linear.emptySubtitle")}
			onOpenCard={onOpenCard}
			selectedCardId={selectedCardId}
			appendContextTarget={appendContextTarget}
			horizontalPaddingClass={horizontalPaddingClass}
		/>
	);
}
