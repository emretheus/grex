import { Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { IssueInboxPage } from "@/lib/api";
import type { ComposerInsertTarget } from "@/lib/composer-insert";
import { issueItemToContextCard } from "@/lib/sources/issue-card";
import type { ContextCard } from "@/lib/sources/types";
import { InboxSearchField } from "./actions";
import { InboxSourceLayout } from "./layout";
import { SourceCard } from "./source-card";
import { useDebouncedValue } from "./use-debounced-value";
import { useIssueInboxItems } from "./use-issue-inbox-items";

type Cursors = Record<string, string>;

export type IssueInboxSectionProps = {
	/** Provider display name, e.g. "Linear" / "Jira" / "Trello". */
	providerLabel: string;
	connected: boolean;
	isLoadingConnections: boolean;
	isConnecting: boolean;
	/** Rendered when not connected and not mid-connect. */
	connectState: ReactNode;
	/** connectionId → workspace/site/member label, for the per-card badge. */
	displayNames: Map<string, string>;
	/** Prefix the subtitle with the account label (>1 account connected). */
	showWorkspace: boolean;
	inboxKey: readonly unknown[];
	searchKey: (query: string) => readonly unknown[];
	listFn: (input: {
		cursors?: Cursors | null;
		limit?: number;
	}) => Promise<IssueInboxPage>;
	searchFn: (input: {
		query: string;
		cursors?: Cursors | null;
		limit?: number;
	}) => Promise<IssueInboxPage>;
	/** Copy for the empty default feed (no search active). */
	emptyTitle: string;
	emptySubtitle: string;
	onOpenCard?: (card: ContextCard) => void;
	selectedCardId?: string | null;
	appendContextTarget?: ComposerInsertTarget;
	horizontalPaddingClass: string;
};

/** Provider-agnostic Contexts-sidebar subtree: connect CTA, the default feed,
 *  free-text search, and the loading / empty / error states. Mirrors the forge
 *  + Slack inbox paths so cards open in the same preview slot. Linear, Jira,
 *  and Trello are thin wrappers that supply their connections + fns. */
export function IssueInboxSection(props: IssueInboxSectionProps) {
	const [searchInput, setSearchInput] = useState("");
	const debouncedQuery = useDebouncedValue(searchInput, 250);
	const trimmedQuery = debouncedQuery.trim();
	const isSearching = trimmedQuery.length > 0;

	const inbox = useIssueInboxItems({
		query: isSearching ? trimmedQuery : null,
		connected: props.connected,
		inboxKey: props.inboxKey,
		searchKey: props.searchKey,
		listFn: props.listFn,
		searchFn: props.searchFn,
		errorLabel: props.providerLabel,
	});

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
		!props.isLoadingConnections && !props.connected && !props.isConnecting;

	const actions = props.connected ? (
		<InboxSearchField
			value={searchInput}
			onChange={(e) => setSearchInput(e.target.value)}
			onClear={() => setSearchInput("")}
			ariaLabel={`Search ${props.providerLabel} issues`}
		/>
	) : null;

	return (
		<InboxSourceLayout
			horizontalPaddingClass={props.horizontalPaddingClass}
			actions={actions}
		>
			<div className="flex w-full flex-col gap-2">
				{showConnectState ? (
					props.connectState
				) : props.isLoadingConnections || props.isConnecting ? (
					<InboxLoadingState label={props.providerLabel} />
				) : inbox.error && !inbox.hasResolved ? (
					<InboxErrorState
						label={props.providerLabel}
						error={inbox.error}
						onRetry={inbox.refetch}
					/>
				) : !inbox.hasResolved ? (
					<InboxLoadingState label={props.providerLabel} />
				) : inbox.items.length > 0 ? (
					<>
						<div className="flex w-full flex-col gap-2">
							{inbox.items.map((item) => {
								const card = issueItemToContextCard(item, {
									displayName: props.displayNames.get(item.connectionId),
									showWorkspace: props.showWorkspace,
								});
								return (
									<SourceCard
										key={card.id}
										card={card}
										selected={card.id === props.selectedCardId}
										onOpen={props.onOpenCard}
										appendContextTarget={props.appendContextTarget}
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
						providerLabel={props.providerLabel}
						emptyTitle={props.emptyTitle}
						emptySubtitle={props.emptySubtitle}
						onRefresh={inbox.refetch}
					/>
				)}
			</div>
		</InboxSourceLayout>
	);
}

function InboxLoadingState({ label }: { label: string }) {
	return (
		<div className="mt-8 flex flex-col items-center gap-2 px-6 text-muted-foreground/70">
			<Loader2 className="size-4 animate-spin" strokeWidth={2} />
			<div className="text-small leading-5">Loading {label}…</div>
		</div>
	);
}

function InboxErrorState({
	label,
	error,
	onRetry,
}: {
	label: string;
	error: unknown;
	onRetry: () => void;
}) {
	const message =
		error instanceof Error ? error.message : `Couldn't load ${label} issues.`;
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
	providerLabel,
	emptyTitle,
	emptySubtitle,
	onRefresh,
}: {
	isSearching: boolean;
	query: string;
	providerLabel: string;
	emptyTitle: string;
	emptySubtitle: string;
	onRefresh: () => void;
}) {
	const title = isSearching ? "No matches" : emptyTitle;
	const subtitle = isSearching
		? `Nothing in ${providerLabel} matches "${query}".`
		: emptySubtitle;
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
