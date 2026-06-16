import { useQuery } from "@tanstack/react-query";
import { type TrelloConnection, trelloConnections } from "@/lib/api";
import { grexQueryKeys, PERSIST_META } from "@/lib/query-client";

/** Connected Trello accounts for the inbox + settings panels. Cache is
 *  bumped by the `issueConnectionChanged` UI-mutation event (Connect /
 *  Disconnect / scope change / token invalidated), so a default
 *  `staleTime: 0` is fine.
 *
 *  Persisted across cold start so the connected state renders immediately
 *  on boot rather than flashing the connect CTA — same treatment as
 *  `useSlackWorkspaces`. The payload is tiny (a handful of names + ids). */
export function useTrelloConnections() {
	return useQuery<TrelloConnection[]>({
		queryKey: grexQueryKeys.trelloConnections,
		queryFn: trelloConnections,
		staleTime: 0,
		meta: PERSIST_META,
	});
}
