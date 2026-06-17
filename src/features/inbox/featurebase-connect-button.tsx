import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Lightbulb, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type FeaturebaseConnection, featurebaseConnect } from "@/lib/api";
import { openUrl } from "@/lib/platform-bridge";
import { grexQueryKeys } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";

/** Stable identifier for the connect mutation. The inbox section reads it
 *  via `useIsMutating` to keep its state machine in the "connecting"
 *  branch while the credentials are being validated. */
export const FEATUREBASE_CONNECT_MUTATION_KEY = [
	"featurebase",
	"connect",
] as const;

/** Where the user finds their API key + feedback URL. */
const FEATUREBASE_HELP_URL = "https://help.featurebase.app/en/articles/2474184";

/** Empty-state form shown when Featurebase isn't connected. Local-first: the
 *  user pastes an API key + their public feedback URL which is validated and
 *  then stored in the macOS Keychain. No OAuth app, no browser round-trip.
 *
 *  `className` lets a different surface (e.g. Settings → Contexts)
 *  override the default viewport-height container. */
export function FeaturebaseConnectState({
	onConnected,
	className = "min-h-[calc(100vh-200px)]",
}: {
	onConnected?: (connection: FeaturebaseConnection) => void;
	className?: string;
}) {
	const { t } = useTranslation("inbox");
	const [apiKey, setApiKey] = useState("");
	const [orgUrl, setOrgUrl] = useState("");
	const connectMutation = useFeaturebaseConnectMutation({ onConnected });
	const trimmedKey = apiKey.trim();
	const trimmedUrl = orgUrl.trim();

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		if (!trimmedKey || !trimmedUrl || connectMutation.isPending) return;
		connectMutation.mutate({ apiKey: trimmedKey, orgUrl: trimmedUrl });
	};

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-4 px-6 text-center",
				className,
			)}
		>
			<Lightbulb className="text-muted-foreground/80" size={28} />
			<div className="space-y-1">
				<div className="text-ui font-medium text-foreground">
					{t("connect.featurebase.title")}
				</div>
				<div className="text-pretty text-small leading-5 text-muted-foreground">
					{t("connect.featurebase.description")}
				</div>
			</div>
			<form
				onSubmit={handleSubmit}
				className="flex w-full max-w-[280px] flex-col gap-2"
			>
				<Input
					type="password"
					autoComplete="off"
					spellCheck={false}
					placeholder={t("connect.featurebase.apiKeyPlaceholder")}
					aria-label={t("connect.featurebase.apiKeyLabel")}
					value={apiKey}
					onChange={(event) => setApiKey(event.target.value)}
					disabled={connectMutation.isPending}
					className="text-small"
				/>
				<Input
					type="text"
					autoComplete="off"
					spellCheck={false}
					placeholder={t("connect.featurebase.urlPlaceholder")}
					aria-label={t("connect.featurebase.urlLabel")}
					value={orgUrl}
					onChange={(event) => setOrgUrl(event.target.value)}
					disabled={connectMutation.isPending}
					className="text-small"
				/>
				<Button
					type="submit"
					variant="default"
					size="sm"
					className="cursor-interactive text-small"
					disabled={!trimmedKey || !trimmedUrl || connectMutation.isPending}
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
				onClick={() => void openUrl(FEATUREBASE_HELP_URL)}
				className="inline-flex cursor-interactive items-center gap-1 text-mini text-muted-foreground/80 transition-colors hover:text-foreground"
			>
				{t("connect.featurebase.help")}
				<ExternalLink className="size-3" strokeWidth={1.8} />
			</button>
		</div>
	);
}

/** Mutation factory for the connect flow. On success bumps the connection
 *  + inbox caches so the feed re-fetches with the new credentials. Tagged
 *  with `FEATUREBASE_CONNECT_MUTATION_KEY` so the inbox section can read the
 *  in-flight state via `useIsMutating`. */
export function useFeaturebaseConnectMutation(opts?: {
	onConnected?: (connection: FeaturebaseConnection) => void;
}) {
	const { t } = useTranslation("inbox");
	const pushToast = useWorkspaceToast();
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: FEATUREBASE_CONNECT_MUTATION_KEY,
		mutationFn: (args: { apiKey: string; orgUrl: string }) =>
			featurebaseConnect(args),
		onSuccess: (connection) => {
			void queryClient.invalidateQueries({
				queryKey: grexQueryKeys.featurebaseConnections,
			});
			void queryClient.invalidateQueries({
				predicate: (query) =>
					query.queryKey[0] === "featurebaseInbox" ||
					query.queryKey[0] === "featurebaseSearch",
			});
			opts?.onConnected?.(connection);
		},
		onError: (error) => {
			const message =
				error instanceof Error
					? error.message
					: t("connect.featurebase.failedMessage");
			pushToast(message, t("connect.featurebase.failedTitle"), "destructive");
		},
	});
}
