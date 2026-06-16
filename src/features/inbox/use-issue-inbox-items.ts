import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import type { IssueInboxItem, IssueInboxPage } from "@/lib/api";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";

const PAGE_SIZE = 30;
/** Issue providers aren't realtime-pushed, so re-validate every minute on
 *  focus rather than every render. Manual refresh stays available. */
const STALE_MS = 60_000;

export type UseIssueInboxItemsResult = {
	items: IssueInboxItem[];
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	error: unknown;
	hasResolved: boolean;
	fetchNextPage: () => void;
	refetch: () => void;
};

type Cursors = Record<string, string>;

/** Drives an issue provider's inbox feed: the default feed when `query` is
 *  empty, search results when the user is typing. One hook, two backends — the
 *  query key swaps so React Query keeps the result sets separate. Provider-
 *  agnostic: callers pass the provider's list/search fns + query keys. */
export function useIssueInboxItems(args: {
	query: string | null;
	connected: boolean;
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
	errorLabel: string;
}): UseIssueInboxItemsResult {
	const trimmed = (args.query ?? "").trim();
	const isSearching = trimmed.length > 0;

	const infiniteQuery = useInfiniteQuery<
		IssueInboxPage,
		Error,
		{ pages: IssueInboxPage[] },
		readonly unknown[],
		Cursors | null
	>({
		queryKey: isSearching ? args.searchKey(trimmed) : args.inboxKey,
		enabled: args.connected,
		initialPageParam: null,
		queryFn: async ({ pageParam }) => {
			const cursors = pageParam ?? null;
			return isSearching
				? args.searchFn({ query: trimmed, cursors, limit: PAGE_SIZE })
				: args.listFn({ cursors, limit: PAGE_SIZE });
		},
		getNextPageParam: (lastPage) =>
			Object.keys(lastPage.cursors).length > 0 ? lastPage.cursors : undefined,
		staleTime: STALE_MS,
	});

	const pushToast = useWorkspaceToast();
	const lastErrorRef = useRef<unknown>(null);
	useEffect(() => {
		if (!infiniteQuery.error) {
			lastErrorRef.current = null;
			return;
		}
		if (lastErrorRef.current === infiniteQuery.error) return;
		lastErrorRef.current = infiniteQuery.error;
		const message =
			infiniteQuery.error instanceof Error
				? infiniteQuery.error.message
				: `Couldn't load ${args.errorLabel} issues.`;
		pushToast(message, `${args.errorLabel} fetch failed`, "destructive");
	}, [infiniteQuery.error, pushToast, args.errorLabel]);

	const items = useMemo<IssueInboxItem[]>(
		() => (infiniteQuery.data?.pages ?? []).flatMap((p) => p.items),
		[infiniteQuery.data],
	);

	return {
		items,
		hasNextPage: Boolean(infiniteQuery.hasNextPage),
		isFetchingNextPage: infiniteQuery.isFetchingNextPage,
		error: infiniteQuery.error,
		hasResolved: infiniteQuery.data !== undefined,
		fetchNextPage: () => {
			void infiniteQuery.fetchNextPage();
		},
		refetch: () => {
			void infiniteQuery.refetch();
		},
	};
}
