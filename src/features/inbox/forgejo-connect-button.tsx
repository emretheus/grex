import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ForgejoBrandIcon } from "@/components/brand-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ForgejoConnection, forgejoConnect } from "@/lib/api";
import { openUrl } from "@/lib/platform-bridge";
import { grexQueryKeys } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";

/** Stable identifier for the connect mutation. The inbox section reads it
 *  via `useIsMutating` to keep its state machine in the "connecting"
 *  branch while the credentials are being validated. */
export const FORGEJO_CONNECT_MUTATION_KEY = ["forgejo", "connect"] as const;

/** Where the user creates a personal access token. Host is dynamic, so we
 *  point at the generic API-usage docs rather than a specific instance. */
const FORGEJO_API_KEY_URL = "https://forgejo.org/docs/latest/user/api-usage/";

/** Empty-state form shown when Forgejo isn't connected. Local-first: the
 *  user pastes their instance URL + an access token (created in the
 *  instance's settings) which is validated and then stored in the macOS
 *  Keychain. No OAuth app, no browser round-trip.
 *
 *  `className` lets a different surface (e.g. Settings → Contexts)
 *  override the default viewport-height container. */
export function ForgejoConnectState({
	onConnected,
	className = "min-h-[calc(100vh-200px)]",
}: {
	onConnected?: (connection: ForgejoConnection) => void;
	className?: string;
}) {
	const [host, setHost] = useState("");
	const [token, setToken] = useState("");
	const connectMutation = useForgejoConnectMutation({ onConnected });
	const trimmedHost = host.trim();
	const trimmedToken = token.trim();

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		if (!trimmedHost || !trimmedToken || connectMutation.isPending) return;
		connectMutation.mutate({ host: trimmedHost, token: trimmedToken });
	};

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-4 px-6 text-center",
				className,
			)}
		>
			<ForgejoBrandIcon className="text-muted-foreground/80" size={28} />
			<div className="space-y-1">
				<div className="text-ui font-medium text-foreground">
					Connect Forgejo
				</div>
				<div className="text-pretty text-small leading-5 text-muted-foreground">
					Paste your Forgejo instance URL and an access token. Stored locally in
					your macOS Keychain.
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
					placeholder="https://codeberg.org"
					aria-label="Forgejo instance URL"
					value={host}
					onChange={(event) => setHost(event.target.value)}
					disabled={connectMutation.isPending}
					className="text-small"
				/>
				<Input
					type="password"
					autoComplete="off"
					spellCheck={false}
					placeholder="Access token"
					aria-label="Forgejo access token"
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
					disabled={!trimmedHost || !trimmedToken || connectMutation.isPending}
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
				onClick={() => void openUrl(FORGEJO_API_KEY_URL)}
				className="inline-flex cursor-interactive items-center gap-1 text-mini text-muted-foreground/80 transition-colors hover:text-foreground"
			>
				Create an access token
				<ExternalLink className="size-3" strokeWidth={1.8} />
			</button>
		</div>
	);
}

/** Mutation factory for the connect flow. On success bumps the connection
 *  + inbox caches so the feed re-fetches with the new credentials. Tagged
 *  with `FORGEJO_CONNECT_MUTATION_KEY` so the inbox section can read the
 *  in-flight state via `useIsMutating`. */
export function useForgejoConnectMutation(opts?: {
	onConnected?: (connection: ForgejoConnection) => void;
}) {
	const pushToast = useWorkspaceToast();
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: FORGEJO_CONNECT_MUTATION_KEY,
		mutationFn: (args: { host: string; token: string }) => forgejoConnect(args),
		onSuccess: (connection) => {
			void queryClient.invalidateQueries({
				queryKey: grexQueryKeys.forgejoConnections,
			});
			void queryClient.invalidateQueries({
				predicate: (query) =>
					query.queryKey[0] === "forgejoInbox" ||
					query.queryKey[0] === "forgejoSearch",
			});
			opts?.onConnected?.(connection);
		},
		onError: (error) => {
			const message =
				error instanceof Error ? error.message : "Couldn't connect Forgejo.";
			pushToast(message, "Forgejo connect failed", "destructive");
		},
	});
}
