import { useQuery } from "@tanstack/react-query";
import { linearConnectionStatus } from "@/lib/api";
import { grexQueryKeys, PERSIST_META } from "@/lib/query-client";

/** Linear connection state for the inbox + settings panels. Cache is
 *  bumped by the `linearConnectionChanged` UI-mutation event (Connect /
 *  Disconnect / token invalidated), so a default `staleTime: 0` is fine.
 *
 *  Persisted across cold start so the connected state renders immediately
 *  on boot rather than flashing the connect CTA — same treatment as
 *  `useSlackWorkspaces`. The payload is tiny (a bool + two names). */
export function useLinearConnection() {
	return useQuery({
		queryKey: grexQueryKeys.linearConnection,
		queryFn: linearConnectionStatus,
		staleTime: 0,
		meta: PERSIST_META,
	});
}
