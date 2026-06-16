import { useQuery } from "@tanstack/react-query";
import { type FeaturebaseConnection, featurebaseConnections } from "@/lib/api";
import { grexQueryKeys, PERSIST_META } from "@/lib/query-client";

/** Connected Featurebase orgs for the inbox + settings panels. Cache is
 *  bumped by the `issueConnectionChanged` UI-mutation event (Connect /
 *  Disconnect / token invalidated), so a default `staleTime: 0` is fine.
 *
 *  Persisted across cold start so the connected state renders immediately
 *  on boot rather than flashing the connect CTA — same treatment as
 *  `useTrelloConnections`. The payload is tiny (a handful of names + ids). */
export function useFeaturebaseConnections() {
	return useQuery<FeaturebaseConnection[]>({
		queryKey: grexQueryKeys.featurebaseConnections,
		queryFn: featurebaseConnections,
		staleTime: 0,
		meta: PERSIST_META,
	});
}
