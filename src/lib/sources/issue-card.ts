import type { IssueInboxItem } from "@/lib/api";
import type {
	ContextCard,
	ContextCardMeta,
	ContextCardStateTone,
} from "./types";

const TONES = new Set<ContextCardStateTone>([
	"open",
	"closed",
	"merged",
	"draft",
	"answered",
	"unanswered",
	"urgent",
	"neutral",
]);

/** The backend emits a normalized tone string; clamp it to the card palette
 *  so an unexpected value degrades to `neutral` rather than breaking styling. */
function toTone(tone: string): ContextCardStateTone {
	return TONES.has(tone as ContextCardStateTone)
		? (tone as ContextCardStateTone)
		: "neutral";
}

/** Map a provider-agnostic [`IssueInboxItem`] into the shared `ContextCard` shape
 *  `SourceCard` renders. `displayName` is the connection's workspace/site/
 *  member label, shown in the subtitle only when more than one account of the
 *  same provider is connected (`showWorkspace`). One mapper serves Linear,
 *  Jira, and Trello — it branches only on `meta.type`. */
export function issueItemToContextCard(
	item: IssueInboxItem,
	opts?: { displayName?: string; showWorkspace?: boolean },
): ContextCard {
	const displayName = opts?.displayName?.trim() || undefined;
	const showWorkspace = opts?.showWorkspace ?? false;
	return {
		id: item.id,
		source: item.provider,
		externalId: item.externalId,
		externalUrl: item.url,
		title: item.title,
		subtitle: buildSubtitle(item, displayName, showWorkspace),
		state: { label: item.state.label, tone: toTone(item.state.tone) },
		lastActivityAt: item.lastActivityAt,
		meta: buildMeta(item, displayName),
	};
}

function withPrefix(
	primary: string | undefined,
	displayName: string | undefined,
	showWorkspace: boolean,
): string | undefined {
	if (showWorkspace && displayName) {
		return primary ? `${displayName} · ${primary}` : displayName;
	}
	return primary || undefined;
}

function buildSubtitle(
	item: IssueInboxItem,
	displayName: string | undefined,
	showWorkspace: boolean,
): string | undefined {
	switch (item.meta.type) {
		case "linear":
			return withPrefix(item.meta.team.name, displayName, showWorkspace);
		case "jira":
			return withPrefix(item.meta.projectName, displayName, showWorkspace);
		case "trello": {
			const { boardName, listName } = item.meta;
			if (boardName && listName) return `${boardName} · ${listName}`;
			return boardName || listName || undefined;
		}
		case "forgejo":
			return withPrefix(item.meta.repo, displayName, showWorkspace);
		case "featurebase":
			return withPrefix(item.meta.board, displayName, showWorkspace);
		case "plain":
			return withPrefix(item.meta.customerName, displayName, showWorkspace);
	}
}

function buildMeta(
	item: IssueInboxItem,
	displayName: string | undefined,
): ContextCardMeta {
	switch (item.meta.type) {
		case "linear":
			return {
				type: "linear",
				connectionId: item.connectionId,
				workspaceName: displayName,
				identifier: item.meta.identifier,
				priorityLabel: item.meta.priorityLabel,
				team: item.meta.team,
				project: item.meta.project ?? undefined,
				labels: item.meta.labels,
			};
		case "jira":
			return {
				type: "jira",
				connectionId: item.connectionId,
				siteName: displayName,
				issueType: item.meta.issueType,
				priority: item.meta.priority ?? undefined,
				projectName: item.meta.projectName,
				labels: item.meta.labels,
			};
		case "trello":
			return {
				type: "trello",
				connectionId: item.connectionId,
				boardName: item.meta.boardName,
				listName: item.meta.listName,
				labels: item.meta.labels,
			};
		case "forgejo":
			return {
				type: "forgejo",
				connectionId: item.connectionId,
				hostName: displayName,
				repo: item.meta.repo,
				number: item.meta.number,
				labels: item.meta.labels,
			};
		case "featurebase":
			return {
				type: "featurebase",
				connectionId: item.connectionId,
				orgName: displayName,
				board: item.meta.board,
				upvotes: item.meta.upvotes,
			};
		case "plain":
			return {
				type: "plain",
				connectionId: item.connectionId,
				workspaceName: displayName,
				customerName: item.meta.customerName,
				priority: item.meta.priority ?? undefined,
			};
	}
}
