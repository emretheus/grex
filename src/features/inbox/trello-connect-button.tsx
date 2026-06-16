import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { TrelloBrandIcon } from "@/components/brand-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type TrelloConnection, trelloConnect } from "@/lib/api";
import { openUrl } from "@/lib/platform-bridge";
import { grexQueryKeys } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";

/** Stable identifier for the connect mutation. The inbox section reads it
 *  via `useIsMutating` to keep its state machine in the "connecting"
 *  branch while the credentials are being validated. */
export const TRELLO_CONNECT_MUTATION_KEY = ["trello", "connect"] as const;

/** Where the user creates a personal API key + token. */
const TRELLO_API_KEY_URL = "https://trello.com/app-key";

/** Empty-state form shown when Trello isn't connected. Local-first: the
 *  user pastes an API key + token (created in Trello's developer page)
 *  which is validated and then stored in the macOS Keychain. No OAuth
 *  app, no browser round-trip.
 *
 *  `className` lets a different surface (e.g. Settings → Contexts)
 *  override the default viewport-height container. */
export function TrelloConnectState({
	onConnected,
	className = "min-h-[calc(100vh-200px)]",
}: {
	onConnected?: (connection: TrelloConnection) => void;
	className?: string;
}) {
	const [apiKey, setApiKey] = useState("");
	const [token, setToken] = useState("");
	const connectMutation = useTrelloConnectMutation({ onConnected });
	const trimmedKey = apiKey.trim();
	const trimmedToken = token.trim();

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		if (!trimmedKey || !trimmedToken || connectMutation.isPending) return;
		connectMutation.mutate({ apiKey: trimmedKey, token: trimmedToken });
	};

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-4 px-6 text-center",
				className,
			)}
		>
			<TrelloBrandIcon className="text-muted-foreground/80" size={28} />
			<div className="space-y-1">
				<div className="text-ui font-medium text-foreground">
					Connect Trello
				</div>
				<div className="text-pretty text-small leading-5 text-muted-foreground">
					Paste your Trello API key and token. Stored locally in your macOS
					Keychain.
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
					placeholder="Your Trello API key"
					aria-label="Trello API key"
					value={apiKey}
					onChange={(event) => setApiKey(event.target.value)}
					disabled={connectMutation.isPending}
					className="text-small"
				/>
				<Input
					type="password"
					autoComplete="off"
					spellCheck={false}
					placeholder="Token"
					aria-label="Trello token"
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
					disabled={!trimmedKey || !trimmedToken || connectMutation.isPending}
				>
					{connectMutation.isPending ? (
						<>
							<Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
							Connecting…
						</>
					) : (
						"Connect"
					)}
				</Button>
			</form>
			<button
				type="button"
				onClick={() => void openUrl(TRELLO_API_KEY_URL)}
				className="inline-flex cursor-interactive items-center gap-1 text-mini text-muted-foreground/80 transition-colors hover:text-foreground"
			>
				Get your API key & token
				<ExternalLink className="size-3" strokeWidth={1.8} />
			</button>
		</div>
	);
}

/** Mutation factory for the connect flow. On success bumps the connection
 *  + inbox caches so the feed re-fetches with the new credentials. Tagged
 *  with `TRELLO_CONNECT_MUTATION_KEY` so the inbox section can read the
 *  in-flight state via `useIsMutating`. */
export function useTrelloConnectMutation(opts?: {
	onConnected?: (connection: TrelloConnection) => void;
}) {
	const pushToast = useWorkspaceToast();
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: TRELLO_CONNECT_MUTATION_KEY,
		mutationFn: (args: { apiKey: string; token: string }) =>
			trelloConnect(args),
		onSuccess: (connection) => {
			void queryClient.invalidateQueries({
				queryKey: grexQueryKeys.trelloConnections,
			});
			void queryClient.invalidateQueries({
				predicate: (query) =>
					query.queryKey[0] === "trelloInbox" ||
					query.queryKey[0] === "trelloSearch",
			});
			opts?.onConnected?.(connection);
		},
		onError: (error) => {
			const message =
				error instanceof Error ? error.message : "Couldn't connect Trello.";
			pushToast(message, "Trello connect failed", "destructive");
		},
	});
}
