import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import {
	type LinearInboxItem,
	type LinearInboxPage,
	linearListInboxItems,
	linearSearchIssues,
} from "@/lib/api";
import { grexQueryKeys } from "@/lib/query-client";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";

const PAGE_SIZE = 30;
/** Linear isn't realtime-pushed to us, so re-validate every minute on
 *  focus rather than every render. Manual refresh stays available via
 *  `refetch()`. Mirrors the Slack/forge inbox staleness. */
const STALE_MS = 60_000;

export type UseLinearInboxItemsResult = {
	items: LinearInboxItem[];
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	error: unknown;
	hasResolved: boolean;
	fetchNextPage: () => void;
	refetch: () => void;
};

/** Drives the Linear inbox feed: assigned issues when `query` is empty,
 *  `searchIssues` results when the user is typing. One hook, two backends
 *  — the query key swaps so React Query keeps the two result sets
 *  separate. Disabled until `connected` so we never hit the IPC layer
 *  before a token exists (which would surface a spurious "not connected"
 *  toast). */
export function useLinearInboxItems(
	query: string | null,
	connected: boolean,
): UseLinearInboxItemsResult {
	const trimmed = (query ?? "").trim();
	const isSearching = trimmed.length > 0;
	const enabled = connected;

	const infiniteQuery = useInfiniteQuery<
		LinearInboxPage,
		Error,
		{ pages: LinearInboxPage[] },
		readonly unknown[],
		Record<string, string> | null
	>({
		queryKey: isSearching
			? grexQueryKeys.linearSearch(trimmed)
			: grexQueryKeys.linearInbox,
		enabled,
		initialPageParam: null,
		queryFn: async ({ pageParam }) => {
			const cursors = pageParam ?? null;
			return isSearching
				? linearSearchIssues({ query: trimmed, cursors, limit: PAGE_SIZE })
				: linearListInboxItems({ cursors, limit: PAGE_SIZE });
		},
		// A non-empty cursor map means at least one connection has more pages;
		// pass it back verbatim so only those connections are re-fetched.
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
				: "Couldn't load Linear issues.";
		pushToast(message, "Linear fetch failed", "destructive");
	}, [infiniteQuery.error, pushToast]);

	const items = useMemo<LinearInboxItem[]>(
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
