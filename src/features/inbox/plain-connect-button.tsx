import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, LifeBuoy, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type PlainConnection, plainConnect } from "@/lib/api";
import { openUrl } from "@/lib/platform-bridge";
import { grexQueryKeys } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";

/** Stable identifier for the connect mutation. The inbox section reads it
 *  via `useIsMutating` to keep its state machine in the "connecting"
 *  branch while the credentials are being validated. */
export const PLAIN_CONNECT_MUTATION_KEY = ["plain", "connect"] as const;

/** Where the user creates a Plain API key. */
const PLAIN_API_KEY_URL =
	"https://www.plain.com/docs/api-reference/graphql/authentication";

/** Empty-state form shown when Plain isn't connected. Local-first: the
 *  user pastes an API key (created in Plain's settings) which is validated
 *  and then stored in the macOS Keychain. No OAuth app, no browser
 *  round-trip.
 *
 *  `className` lets a different surface (e.g. Settings → Contexts)
 *  override the default viewport-height container. */
export function PlainConnectState({
	onConnected,
	className = "min-h-[calc(100vh-200px)]",
}: {
	onConnected?: (connection: PlainConnection) => void;
	className?: string;
}) {
	const { t } = useTranslation("inbox");
	const [apiKey, setApiKey] = useState("");
	const connectMutation = usePlainConnectMutation({ onConnected });
	const trimmedKey = apiKey.trim();

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		if (!trimmedKey || connectMutation.isPending) return;
		connectMutation.mutate(trimmedKey);
	};

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-4 px-6 text-center",
				className,
			)}
		>
			<LifeBuoy className="text-muted-foreground/80" size={28} />
			<div className="space-y-1">
				<div className="text-ui font-medium text-foreground">
					{t("connect.plain.title")}
				</div>
				<div className="text-pretty text-small leading-5 text-muted-foreground">
					{t("connect.plain.description")}
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
					placeholder={t("connect.plain.apiKeyPlaceholder")}
					aria-label={t("connect.plain.apiKeyLabel")}
					value={apiKey}
					onChange={(event) => setApiKey(event.target.value)}
					disabled={connectMutation.isPending}
					className="text-small"
				/>
				<Button
					type="submit"
					variant="default"
					size="sm"
					className="cursor-interactive text-small"
					disabled={!trimmedKey || connectMutation.isPending}
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
				onClick={() => void openUrl(PLAIN_API_KEY_URL)}
				className="inline-flex cursor-interactive items-center gap-1 text-mini text-muted-foreground/80 transition-colors hover:text-foreground"
			>
				{t("connect.plain.help")}
				<ExternalLink className="size-3" strokeWidth={1.8} />
			</button>
		</div>
	);
}

/** Mutation factory for the connect flow. On success bumps the connection
 *  + inbox caches so the feed re-fetches with the new credentials. Tagged
 *  with `PLAIN_CONNECT_MUTATION_KEY` so the inbox section can read the
 *  in-flight state via `useIsMutating`. */
export function usePlainConnectMutation(opts?: {
	onConnected?: (connection: PlainConnection) => void;
}) {
	const { t } = useTranslation("inbox");
	const pushToast = useWorkspaceToast();
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: PLAIN_CONNECT_MUTATION_KEY,
		mutationFn: (apiKey: string) => plainConnect(apiKey),
		onSuccess: (connection) => {
			void queryClient.invalidateQueries({
				queryKey: grexQueryKeys.plainConnections,
			});
			void queryClient.invalidateQueries({
				predicate: (query) =>
					query.queryKey[0] === "plainInbox" ||
					query.queryKey[0] === "plainSearch",
			});
			opts?.onConnected?.(connection);
		},
		onError: (error) => {
			const message =
				error instanceof Error
					? error.message
					: t("connect.plain.failedMessage");
			pushToast(message, t("connect.plain.failedTitle"), "destructive");
		},
	});
}
