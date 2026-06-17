import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { JiraBrandIcon } from "@/components/brand-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type JiraConnection, jiraConnect } from "@/lib/api";
import { openUrl } from "@/lib/platform-bridge";
import { grexQueryKeys } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";

/** Stable identifier for the connect mutation. The inbox section reads it
 *  via `useIsMutating` to keep its state machine in the "connecting"
 *  branch while the token is being validated. */
export const JIRA_CONNECT_MUTATION_KEY = ["jira", "connect"] as const;

/** Where the user creates a personal API token. */
const JIRA_API_TOKENS_URL =
	"https://id.atlassian.com/manage-profile/security/api-tokens";

/** Empty-state form shown when Jira isn't connected. Local-first: the user
 *  enters their site URL, email, and an Atlassian API token (created in
 *  Atlassian account settings) which is validated and then stored in the
 *  macOS Keychain. No OAuth app, no browser round-trip.
 *
 *  `className` lets a different surface (e.g. Settings → Contexts)
 *  override the default viewport-height container. */
export function JiraConnectState({
	onConnected,
	className = "min-h-[calc(100vh-200px)]",
}: {
	onConnected?: (connection: JiraConnection) => void;
	className?: string;
}) {
	const { t } = useTranslation("inbox");
	const [site, setSite] = useState("");
	const [email, setEmail] = useState("");
	const [token, setToken] = useState("");
	const connectMutation = useJiraConnectMutation({ onConnected });
	const trimmedSite = site.trim();
	const trimmedEmail = email.trim();
	const trimmedToken = token.trim();
	const canSubmit =
		trimmedSite.length > 0 &&
		trimmedEmail.length > 0 &&
		trimmedToken.length > 0;

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		if (!canSubmit || connectMutation.isPending) return;
		connectMutation.mutate({
			site: trimmedSite,
			email: trimmedEmail,
			token: trimmedToken,
		});
	};

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-4 px-6 text-center",
				className,
			)}
		>
			<JiraBrandIcon className="text-muted-foreground/80" size={28} />
			<div className="space-y-1">
				<div className="text-ui font-medium text-foreground">
					{t("connect.jira.title")}
				</div>
				<div className="text-pretty text-small leading-5 text-muted-foreground">
					{t("connect.jira.description")}
				</div>
			</div>
			<form
				onSubmit={handleSubmit}
				className="flex w-full max-w-[280px] flex-col gap-2"
			>
				<Input
					type="text"
					autoComplete="off"
					spellCheck={false}
					placeholder={t("connect.jira.sitePlaceholder")}
					aria-label={t("connect.jira.siteLabel")}
					value={site}
					onChange={(event) => setSite(event.target.value)}
					disabled={connectMutation.isPending}
					className="text-small"
				/>
				<Input
					type="email"
					autoComplete="off"
					spellCheck={false}
					placeholder={t("connect.jira.emailPlaceholder")}
					aria-label={t("connect.jira.emailLabel")}
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					disabled={connectMutation.isPending}
					className="text-small"
				/>
				<Input
					type="password"
					autoComplete="off"
					spellCheck={false}
					placeholder={t("connect.jira.tokenPlaceholder")}
					aria-label={t("connect.jira.tokenLabel")}
					value={token}
					onChange={(event) => setToken(event.target.value)}
					disabled={connectMutation.isPending}
					className="text-small"
				/>
				<Button
					type="submit"
					variant="default"
					size="sm"
					className="cursor-interactive text-small"
					disabled={!canSubmit || connectMutation.isPending}
				>
					{connectMutation.isPending ? (
						<>
							<Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
							{t("connect.connecting")}
						</>
					) : (
						t("connect.connect")
					)}
				</Button>
			</form>
			<button
				type="button"
				onClick={() => void openUrl(JIRA_API_TOKENS_URL)}
				className="inline-flex cursor-interactive items-center gap-1 text-mini text-muted-foreground/80 transition-colors hover:text-foreground"
			>
				{t("connect.jira.help")}
				<ExternalLink className="size-3" strokeWidth={1.8} />
			</button>
		</div>
	);
}

/** Mutation factory for the connect flow. On success bumps the connection
 *  + inbox caches so the feed re-fetches with the new token. Tagged with
 *  `JIRA_CONNECT_MUTATION_KEY` so the inbox section can read the
 *  in-flight state via `useIsMutating`. */
export function useJiraConnectMutation(opts?: {
	onConnected?: (connection: JiraConnection) => void;
}) {
	const { t } = useTranslation("inbox");
	const pushToast = useWorkspaceToast();
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: JIRA_CONNECT_MUTATION_KEY,
		mutationFn: (args: { site: string; email: string; token: string }) =>
			jiraConnect(args),
		onSuccess: (connection) => {
			void queryClient.invalidateQueries({
				queryKey: grexQueryKeys.jiraConnections,
			});
			void queryClient.invalidateQueries({
				predicate: (query) =>
					query.queryKey[0] === "jiraInbox" ||
					query.queryKey[0] === "jiraSearch",
			});
			opts?.onConnected?.(connection);
		},
		onError: (error) => {
			const message =
				error instanceof Error
					? error.message
					: t("connect.jira.failedMessage");
			pushToast(message, t("connect.jira.failedTitle"), "destructive");
		},
	});
}
