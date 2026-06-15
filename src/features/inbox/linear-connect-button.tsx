import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { LinearBrandIcon } from "@/components/brand-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type LinearConnection, linearConnect } from "@/lib/api";
import { openUrl } from "@/lib/platform-bridge";
import { grexQueryKeys } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";

/** Stable identifier for the connect mutation. The inbox section reads it
 *  via `useIsMutating` to keep its state machine in the "connecting"
 *  branch while the key is being validated. */
export const LINEAR_CONNECT_MUTATION_KEY = ["linear", "connect"] as const;

/** Where the user creates a personal API key. */
const LINEAR_API_KEYS_URL = "https://linear.app/settings/api";

/** Empty-state form shown when Linear isn't connected. Local-first: the
 *  user pastes a personal API key (created in Linear settings) which is
 *  validated and then stored in the macOS Keychain. No OAuth app, no
 *  browser round-trip.
 *
 *  `className` lets a different surface (e.g. Settings → Contexts)
 *  override the default viewport-height container. */
export function LinearConnectState({
	onConnected,
	className = "min-h-[calc(100vh-200px)]",
}: {
	onConnected?: (connection: LinearConnection) => void;
	className?: string;
}) {
	const [apiKey, setApiKey] = useState("");
	const connectMutation = useLinearConnectMutation({ onConnected });
	const trimmed = apiKey.trim();

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		if (!trimmed || connectMutation.isPending) return;
		connectMutation.mutate(trimmed);
	};

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-4 px-6 text-center",
				className,
			)}
		>
			<LinearBrandIcon className="text-muted-foreground/80" size={28} />
			<div className="space-y-1">
				<div className="text-ui font-medium text-foreground">
					Connect Linear
				</div>
				<div className="text-pretty text-small leading-5 text-muted-foreground">
					Paste a personal API key. It's validated once and stored locally in
					your macOS Keychain.
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
					placeholder="lin_api_…"
					aria-label="Linear personal API key"
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
					disabled={!trimmed || connectMutation.isPending}
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
				onClick={() => void openUrl(LINEAR_API_KEYS_URL)}
				className="inline-flex cursor-interactive items-center gap-1 text-mini text-muted-foreground/80 transition-colors hover:text-foreground"
			>
				Create a key in Linear
				<ExternalLink className="size-3" strokeWidth={1.8} />
			</button>
		</div>
	);
}

/** Mutation factory for the connect flow. On success bumps the connection
 *  + inbox caches so the feed re-fetches with the new key. Tagged with
 *  `LINEAR_CONNECT_MUTATION_KEY` so the inbox section can read the
 *  in-flight state via `useIsMutating`. */
export function useLinearConnectMutation(opts?: {
	onConnected?: (connection: LinearConnection) => void;
}) {
	const pushToast = useWorkspaceToast();
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: LINEAR_CONNECT_MUTATION_KEY,
		mutationFn: (apiKey: string) => linearConnect(apiKey),
		onSuccess: (connection) => {
			void queryClient.invalidateQueries({
				queryKey: grexQueryKeys.linearConnections,
			});
			void queryClient.invalidateQueries({
				predicate: (query) =>
					query.queryKey[0] === "linearInbox" ||
					query.queryKey[0] === "linearSearch",
			});
			opts?.onConnected?.(connection);
		},
		onError: (error) => {
			const message =
				error instanceof Error ? error.message : "Couldn't connect Linear.";
			pushToast(message, "Linear connect failed", "destructive");
		},
	});
}
