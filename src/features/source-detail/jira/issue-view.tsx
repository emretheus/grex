import { useQuery } from "@tanstack/react-query";
import { Clock3, GitBranchPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { SourceIcon } from "@/features/inbox/source-icon";
import { type IssueDetail, jiraGetIssue } from "@/lib/api";
import type { ComposerInsertTarget } from "@/lib/composer-insert";
import { useComposerInsert } from "@/lib/composer-insert-context";
import { grexQueryKeys } from "@/lib/query-client";
import type { ContextCard, JiraIssueMeta } from "@/lib/sources/types";
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

export function JiraIssueView({
	card,
	appendContextTarget,
	onStartWorkspace,
}: SourceDetailProps) {
	const { t } = useTranslation("sourceDetail");
	const meta = card.meta.type === "jira" ? card.meta : null;
	const connectionId = meta?.connectionId ?? "";
	// The card id IS the Jira issue id (set in `jiraItemToContextCard`);
	// `connectionId` selects which site's token fetches it.
	const detailQuery = useQuery({
		queryKey: grexQueryKeys.jiraIssueDetail(connectionId, card.id),
		queryFn: () => jiraGetIssue({ connectionId, issueId: card.id }),
		enabled: connectionId.length > 0,
		staleTime: 60_000,
		refetchOnMount: "always",
		refetchOnWindowFocus: "always",
	});
	const detail = detailQuery.data ?? null;
	const markdownBody = detail?.description?.trim() || t("body.noDescription");

	const insertIntoComposer = useComposerInsert();
	const handleStartWorkspace = () => {
		if (!onStartWorkspace) return;
		// Seed the start composer with the full issue (title + url + body)
		// before the controller stashes the branch + closes the preview.
		insertIntoComposer(buildJiraStartInsert(card, detail, appendContextTarget));
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
						{meta?.projectName ? (
							<span className="font-normal text-muted-foreground/70">
								{meta.projectName}
							</span>
						) : null}
						<span className="inline-flex items-center gap-1 font-normal text-muted-foreground/70">
							<SourceIcon source="jira" size={13} className="shrink-0" />
							{meta?.issueType ?? t("kind.issue")}
						</span>
						{meta?.priority ? (
							<span className="font-normal text-muted-foreground/70">
								{meta.priority}
							</span>
						) : null}
						<span className="inline-flex items-center gap-1 font-normal text-muted-foreground/70">
							<Clock3 className="size-[13px]" strokeWidth={1.8} />
							{t("meta.updated", {
								time: formatRelativeTime(card.lastActivityAt),
							})}
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
								key={label}
								className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-mini text-muted-foreground"
							>
								{label}
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
	const { t } = useTranslation("sourceDetail");
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					aria-label={t("startWorkspace.fromIssue")}
					onClick={onClick}
					className="size-7 cursor-interactive rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
				>
					<GitBranchPlus className="size-[13px]" strokeWidth={1.8} />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top">{t("startWorkspace.tooltip")}</TooltipContent>
		</Tooltip>
	);
}

/** Build the composer insert that seeds a new workspace from a Jira issue:
 *  a custom tag whose submit text carries the issue header (identifier,
 *  title, URL, project, type, priority, labels) plus the markdown body, so
 *  the agent's first turn has the whole task in context. */
export function buildJiraStartInsert(
	card: ContextCard,
	detail: IssueDetail | null,
	target?: ComposerInsertTarget,
) {
	const meta = card.meta.type === "jira" ? (card.meta as JiraIssueMeta) : null;
	const headerLines = [
		`Jira issue ${card.externalId}: ${card.title}`,
		`URL: ${card.externalUrl}`,
		meta?.projectName ? `Project: ${meta.projectName}` : null,
		meta?.issueType ? `Type: ${meta.issueType}` : null,
		meta?.priority ? `Priority: ${meta.priority}` : null,
		meta && meta.labels.length > 0 ? `Labels: ${meta.labels.join(", ")}` : null,
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
				key: `jira-start:${card.id}`,
				preview: { kind: "text" as const, title: label, text: submitText },
				source: card.source,
				stateTone: card.state?.tone,
			},
		],
	};
}
