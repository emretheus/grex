import { useIsMutating } from "@tanstack/react-query";
import { plainListInboxItems, plainSearchIssues } from "@/lib/api";
import type { ComposerInsertTarget } from "@/lib/composer-insert";
import { grexQueryKeys } from "@/lib/query-client";
import type { ContextCard } from "@/lib/sources/types";
import { IssueInboxSection } from "./issue-inbox-section";
import {
	PLAIN_CONNECT_MUTATION_KEY,
	PlainConnectState,
} from "./plain-connect-button";
import { usePlainConnections } from "./use-plain-connection";

/** Plain subtree of the Contexts sidebar — a thin wrapper that wires the
 *  Plain connections + list/search fns into the shared `IssueInboxSection`. */
export function PlainInboxSection({
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
	const connectionsQuery = usePlainConnections();
	const connections = connectionsQuery.data ?? [];
	const displayNames = new Map(
		connections.map((c) => [c.id, c.workspaceName ?? ""]),
	);
	const isConnecting =
		useIsMutating({ mutationKey: PLAIN_CONNECT_MUTATION_KEY }) > 0;

	return (
		<IssueInboxSection
			providerLabel="Plain"
			connected={connections.length > 0}
			isLoadingConnections={connectionsQuery.isLoading}
			isConnecting={isConnecting}
			connectState={<PlainConnectState />}
			displayNames={displayNames}
			showWorkspace={connections.length > 1}
			inboxKey={grexQueryKeys.plainInbox}
			searchKey={grexQueryKeys.plainSearch}
			listFn={plainListInboxItems}
			searchFn={plainSearchIssues}
			emptyTitle="No threads"
			emptySubtitle="Open support threads from Plain will appear here."
			onOpenCard={onOpenCard}
			selectedCardId={selectedCardId}
			appendContextTarget={appendContextTarget}
			horizontalPaddingClass={horizontalPaddingClass}
		/>
	);
}
