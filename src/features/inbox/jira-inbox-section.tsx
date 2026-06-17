import { useIsMutating } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { jiraListInboxItems, jiraSearchIssues } from "@/lib/api";
import type { ComposerInsertTarget } from "@/lib/composer-insert";
import { grexQueryKeys } from "@/lib/query-client";
import type { ContextCard } from "@/lib/sources/types";
import { IssueInboxSection } from "./issue-inbox-section";
import {
	JIRA_CONNECT_MUTATION_KEY,
	JiraConnectState,
} from "./jira-connect-button";
import { useJiraConnections } from "./use-jira-connection";

/** Jira subtree of the Contexts sidebar — a thin wrapper that wires the
 *  Jira connections + list/search fns into the shared `IssueInboxSection`. */
export function JiraInboxSection({
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
	const connectionsQuery = useJiraConnections();
	const connections = connectionsQuery.data ?? [];
	const displayNames = new Map(
		connections.map((c) => [c.id, c.siteName ?? ""]),
	);
	const isConnecting =
		useIsMutating({ mutationKey: JIRA_CONNECT_MUTATION_KEY }) > 0;

	return (
		<IssueInboxSection
			providerLabel="Jira"
			connected={connections.length > 0}
			isLoadingConnections={connectionsQuery.isLoading}
			isConnecting={isConnecting}
			connectState={<JiraConnectState />}
			displayNames={displayNames}
			showWorkspace={connections.length > 1}
			inboxKey={grexQueryKeys.jiraInbox}
			searchKey={grexQueryKeys.jiraSearch}
			listFn={jiraListInboxItems}
			searchFn={jiraSearchIssues}
			emptyTitle={t("section.jira.emptyTitle")}
			emptySubtitle={t("section.jira.emptySubtitle")}
			onOpenCard={onOpenCard}
			selectedCardId={selectedCardId}
			appendContextTarget={appendContextTarget}
			horizontalPaddingClass={horizontalPaddingClass}
		/>
	);
}
