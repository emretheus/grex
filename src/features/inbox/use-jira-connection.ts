import { useQuery } from "@tanstack/react-query";
import { type JiraConnection, jiraConnections } from "@/lib/api";
import { grexQueryKeys, PERSIST_META } from "@/lib/query-client";

/** Connected Jira sites for the inbox + settings panels. Cache is bumped by
 *  the `jiraConnectionChanged` UI-mutation event (Connect / Disconnect /
 *  scope change / token invalidated), so a default `staleTime: 0` is fine.
 *
 *  Persisted across cold start so the connected state renders immediately
 *  on boot rather than flashing the connect CTA — same treatment as
 *  `useLinearConnections`. The payload is tiny (a handful of names + ids). */
export function useJiraConnections() {
	return useQuery<JiraConnection[]>({
		queryKey: grexQueryKeys.jiraConnections,
		queryFn: jiraConnections,
		staleTime: 0,
		meta: PERSIST_META,
	});
}
