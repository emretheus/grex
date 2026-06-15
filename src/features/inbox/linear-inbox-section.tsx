import { useIsMutating } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LinearInboxItem } from "@/lib/api";
import type { ComposerInsertTarget } from "@/lib/composer-insert";
import type {
	ContextCard,
	ContextCardStateTone,
	LinearIssueMeta,
} from "@/lib/sources/types";
import { InboxSearchField } from "./actions";
import { InboxSourceLayout } from "./layout";
import {
	LINEAR_CONNECT_MUTATION_KEY,
	LinearConnectState,
} from "./linear-connect-button";
import { SourceCard } from "./source-card";
import { useDebouncedValue } from "./use-debounced-value";
import { useLinearConnections } from "./use-linear-connection";
import { useLinearInboxItems } from "./use-linear-inbox-items";

/** Self-contained Linear subtree of the Contexts sidebar. Owns the
 *  connect CTA, the assigned-issues feed, free-text search, and the
 *  loading / empty / error states. Mirrors the visual contract of the
 *  forge + Slack inbox paths so cards open in the same preview slot. */
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
	const connectionsQuery = useLinearConnections();
	const connections = connectionsQuery.data ?? [];
	const connected = connections.length > 0;
	/** connectionId → workspace display name, for the per-card badge shown
	 *  only when more than one workspace is connected. */
	const workspaceNames = new Map(
		connections.map((c) => [c.id, c.workspaceName ?? ""]),
	);
	const showWorkspace = connections.length > 1;
	const [searchInput, setSearchInput] = useState("");
	const debouncedQuery = useDebouncedValue(searchInput, 250);
	const trimmedQuery = debouncedQuery.trim();
	const isSearching = trimmedQuery.length > 0;

	const inbox = useLinearInboxItems(
		isSearching ? trimmedQuery : null,
		connected,
	);

	/** Non-zero while the connect mutation (API-key validation) is in
	 *  flight. Keeps the state machine in the loading branch instead of
	 *  flashing the connect form back. */
	const isConnecting =
		useIsMutating({ mutationKey: LINEAR_CONNECT_MUTATION_KEY }) > 0;

	const sentinelRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel || !inbox.hasNextPage) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					inbox.fetchNextPage();
				}
			},
			{ rootMargin: "200px 0px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [inbox.hasNextPage, inbox.fetchNextPage]);

	const showConnectState =
		!connectionsQuery.isLoading && !connected && !isConnecting;

	const actions = connected ? (
		<InboxSearchField
			value={searchInput}
			onChange={(e) => setSearchInput(e.target.value)}
			onClear={() => setSearchInput("")}
			ariaLabel="Search Linear issues"
		/>
	) : null;

	return (
		<InboxSourceLayout
			horizontalPaddingClass={horizontalPaddingClass}
			actions={actions}
		>
			<div className="flex w-full flex-col gap-2">
				{showConnectState ? (
					<LinearConnectState />
				) : connectionsQuery.isLoading || isConnecting ? (
					<InboxLoadingState />
				) : inbox.error && !inbox.hasResolved ? (
					<InboxErrorState error={inbox.error} onRetry={inbox.refetch} />
				) : !inbox.hasResolved ? (
					<InboxLoadingState />
				) : inbox.items.length > 0 ? (
					<>
						<div className="flex w-full flex-col gap-2">
							{inbox.items.map((item) => {
								const card = linearItemToContextCard(item, {
									workspaceName: workspaceNames.get(item.connectionId),
									showWorkspace,
								});
								return (
									<SourceCard
										key={card.id}
										card={card}
										selected={card.id === selectedCardId}
										onOpen={onOpenCard}
										appendContextTarget={appendContextTarget}
									/>
								);
							})}
						</div>
						{inbox.hasNextPage ? (
							<div
								ref={sentinelRef}
								aria-hidden="true"
								className="flex h-8 w-full shrink-0 items-center justify-center text-muted-foreground/60"
							>
								{inbox.isFetchingNextPage ? (
									<Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
								) : null}
							</div>
						) : null}
					</>
				) : (
					<EmptyState
						isSearching={isSearching}
						query={trimmedQuery}
						onRefresh={inbox.refetch}
					/>
				)}
			</div>
		</InboxSourceLayout>
	);
}

function InboxLoadingState() {
	return (
		<div className="mt-8 flex flex-col items-center gap-2 px-6 text-muted-foreground/70">
			<Loader2 className="size-4 animate-spin" strokeWidth={2} />
			<div className="text-small leading-5">Loading Linear…</div>
		</div>
	);
}

function InboxErrorState({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) {
	const message =
		error instanceof Error ? error.message : "Couldn't load Linear issues.";
	return (
		<div className="mt-8 flex flex-col items-center gap-2 px-6 text-center">
			<div className="text-ui font-medium text-foreground">Couldn't load</div>
			<div className="text-small leading-5 text-muted-foreground">
				{message}
			</div>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={onRetry}
				className="mt-1 cursor-interactive text-small"
			>
				Try again
			</Button>
		</div>
	);
}

function EmptyState({
	isSearching,
	query,
	onRefresh,
}: {
	isSearching: boolean;
	query: string;
	onRefresh: () => void;
}) {
	const title = isSearching ? "No matches" : "No assigned issues";
	const subtitle = isSearching
		? `Nothing in Linear matches "${query}".`
		: "Issues assigned to you in Linear will appear here.";
	return (
		<div className="mt-10 flex flex-col items-center gap-2 px-6 text-center">
			<div className="text-ui font-medium text-foreground">{title}</div>
			<div className="text-small leading-5 text-muted-foreground">
				{subtitle}
			</div>
			{!isSearching ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onRefresh}
					className="mt-1 cursor-interactive text-small"
				>
					Refresh
				</Button>
			) : null}
		</div>
	);
}

/** Linear workflow-state category → context-card state tone. Linear's
 *  `state.type` is one of triage / backlog / unstarted / started /
 *  completed / canceled; we collapse it onto the shared tone palette the
 *  forge/Slack cards already use for their status glyph colour. */
function stateTone(stateType: string): ContextCardStateTone {
	switch (stateType) {
		case "started":
			return "open";
		case "completed":
			return "merged";
		case "canceled":
			return "closed";
		default:
			return "neutral";
	}
}

/** Map a Linear issue into the shared ContextCard shape SourceCard
 *  renders. `externalId` is the human identifier (`ENG-123`) so the card
 *  footer + append payload reference the issue the way Linear does. */
export function linearItemToContextCard(
	item: LinearInboxItem,
	opts?: { workspaceName?: string; showWorkspace?: boolean },
): ContextCard {
	const workspaceName = opts?.workspaceName?.trim() || undefined;
	const meta: LinearIssueMeta = {
		type: "linear",
		connectionId: item.connectionId,
		workspaceName,
		identifier: item.identifier,
		priorityLabel: item.priorityLabel,
		team: { name: item.teamName, key: item.teamKey },
		project: item.project ?? undefined,
		labels: item.labels,
	};
	// When more than one workspace is connected, prefix the subtitle with the
	// org so the merged feed stays legible across workspaces.
	const subtitle =
		opts?.showWorkspace && workspaceName
			? item.teamName
				? `${workspaceName} · ${item.teamName}`
				: workspaceName
			: item.teamName || undefined;
	return {
		id: item.id,
		source: "linear",
		externalId: item.identifier,
		externalUrl: item.url,
		title: item.title,
		subtitle,
		state: { label: item.stateName, tone: stateTone(item.stateType) },
		lastActivityAt: item.lastActivityAt,
		meta,
	};
}
