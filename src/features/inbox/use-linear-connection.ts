import { useQuery } from "@tanstack/react-query";
import { type LinearConnection, linearConnections } from "@/lib/api";
import { grexQueryKeys, PERSIST_META } from "@/lib/query-client";

/** Connected Linear workspaces for the inbox + settings panels. Cache is
 *  bumped by the `linearConnectionChanged` UI-mutation event (Connect /
 *  Disconnect / scope change / token invalidated), so a default
 *  `staleTime: 0` is fine.
 *
 *  Persisted across cold start so the connected state renders immediately
 *  on boot rather than flashing the connect CTA — same treatment as
 *  `useSlackWorkspaces`. The payload is tiny (a handful of names + ids). */
export function useLinearConnections() {
	return useQuery<LinearConnection[]>({
		queryKey: grexQueryKeys.linearConnections,
		queryFn: linearConnections,
		staleTime: 0,
		meta: PERSIST_META,
	});
}
