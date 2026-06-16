import { useQuery } from "@tanstack/react-query";
import { Clock3, GitBranchPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { SourceIcon } from "@/features/inbox/source-icon";
import { type IssueDetail, trelloGetIssue } from "@/lib/api";
import type { ComposerInsertTarget } from "@/lib/composer-insert";
import { useComposerInsert } from "@/lib/composer-insert-context";
import { grexQueryKeys } from "@/lib/query-client";
import type { ContextCard, TrelloCardMeta } from "@/lib/sources/types";
import {
	DetailErrorState,
	DetailLoadingState,
	formatRelativeTime,
	MarkdownBody,
	SourceDetailActions,
	type SourceDetailProps,
	StatePill,
	toRefreshControl,
} from "../common";

export function TrelloCardView({
	card,
	appendContextTarget,
	onStartWorkspace,
}: SourceDetailProps) {
	const meta = card.meta.type === "trello" ? card.meta : null;
	const connectionId = meta?.connectionId ?? "";
	// The card id IS the Trello card id (set in `trelloItemToContextCard`);
	// `connectionId` selects which account's credentials fetch it.
	const detailQuery = useQuery({
		queryKey: grexQueryKeys.trelloIssueDetail(connectionId, card.id),
		queryFn: () => trelloGetIssue({ connectionId, issueId: card.id }),
		enabled: connectionId.length > 0,
		staleTime: 60_000,
		refetchOnMount: "always",
		refetchOnWindowFocus: "always",
	});
	const detail = detailQuery.data ?? null;
	const markdownBody =
		detail?.description?.trim() || "No description provided.";

	const insertIntoComposer = useComposerInsert();
	const handleStartWorkspace = () => {
		if (!onStartWorkspace) return;
		// Seed the start composer with the full card (title + url + body)
		// before the controller stashes the branch + closes the preview.
		insertIntoComposer(
			buildTrelloStartInsert(card, detail, appendContextTarget),
		);
		onStartWorkspace(card);
	};

	return (
		<article className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-y-auto px-4 [contain:content] [scrollbar-gutter:stable]">
			<header className="shrink-0 py-1.5">
				<div className="flex min-w-0 items-center justify-between gap-4">
					<div className="flex min-w-0 flex-wrap items-center gap-2 text-ui text-muted-foreground">
						{card.state ? <StatePill state={card.state} /> : null}
						<span className="font-medium text-foreground/80">
							{card.externalId}
						</span>
						{meta?.boardName ? (
							<span className="font-normal text-muted-foreground/70">
								{meta.boardName}
							</span>
						) : null}
						<span className="inline-flex items-center gap-1 font-normal text-muted-foreground/70">
							<SourceIcon source="trello" size={13} className="shrink-0" />
							card
						</span>
						<span className="inline-flex items-center gap-1 font-normal text-muted-foreground/70">
							<Clock3 className="size-[13px]" strokeWidth={1.8} />
							Updated {formatRelativeTime(card.lastActivityAt)}
						</span>
					</div>
					<SourceDetailActions
						card={card}
						appendContextTarget={appendContextTarget}
						markdownBody={markdownBody}
						copyDisabled={detailQuery.isLoading || Boolean(detailQuery.error)}
						refresh={toRefreshControl(detailQuery)}
						extraActions={
							onStartWorkspace ? (
								<StartWorkspaceButton onClick={handleStartWorkspace} />
							) : null
						}
					/>
				</div>
				{meta && meta.labels.length > 0 ? (
					<div className="mt-2 flex flex-wrap items-center gap-1.5">
						{meta.labels.map((label) => (
							<span
								key={label.name}
								className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-mini text-muted-foreground"
							>
								<span
									aria-hidden="true"
									className="size-2 rounded-full"
									style={{ backgroundColor: label.color }}
								/>
								{label.name}
							</span>
						))}
					</div>
				) : null}
			</header>

			<div
				className={cnDetailBody(detailQuery.isLoading || !!detailQuery.error)}
			>
				{detailQuery.isLoading ? (
					<DetailLoadingState />
				) : detailQuery.error ? (
					<DetailErrorState error={detailQuery.error as Error} />
				) : (
					<MarkdownBody body={markdownBody} />
				)}
			</div>
		</article>
	);
}

function cnDetailBody(centered: boolean) {
	return centered
		? "min-h-0 flex-1 flex items-center justify-center"
		: "min-h-0 flex-1 py-4";
}

function StartWorkspaceButton({ onClick }: { onClick: () => void }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					aria-label="Start workspace from card"
					onClick={onClick}
					className="size-7 cursor-interactive rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
				>
					<GitBranchPlus className="size-[13px]" strokeWidth={1.8} />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top">Start workspace</TooltipContent>
		</Tooltip>
	);
}

/** Build the composer insert that seeds a new workspace from a Trello
 *  card: a custom tag whose submit text carries the card header
 *  (title, URL, board, list, labels) plus the markdown body, so the
 *  agent's first turn has the whole task in context. */
export function buildTrelloStartInsert(
	card: ContextCard,
	detail: IssueDetail | null,
	target?: ComposerInsertTarget,
) {
	const meta =
		card.meta.type === "trello" ? (card.meta as TrelloCardMeta) : null;
	const headerLines = [
		`Trello card: ${card.title}`,
		`URL: ${card.externalUrl}`,
		meta?.boardName ? `Board: ${meta.boardName}` : null,
		meta?.listName ? `List: ${meta.listName}` : null,
		meta && meta.labels.length > 0
			? `Labels: ${meta.labels.map((l) => l.name).join(", ")}`
			: null,
	].filter((line): line is string => Boolean(line));
	const body = detail?.description?.trim();
	const submitText = body
		? `${headerLines.join("\n")}\n\n${body}`
		: headerLines.join("\n");
	const label = `${card.title} ${card.externalId}`.trim();

	return {
		target,
		behavior: "append" as const,
		items: [
			{
				kind: "custom-tag" as const,
				label,
				submitText,
				key: `trello-start:${card.id}`,
				preview: { kind: "text" as const, title: label, text: submitText },
				source: card.source,
				stateTone: card.state?.tone,
			},
		],
	};
}
