import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlainConnectState } from "@/features/inbox/plain-connect-button";
import { usePlainConnections } from "@/features/inbox/use-plain-connection";
import { type PlainConnection, plainDisconnect } from "@/lib/api";
import { grexQueryKeys } from "@/lib/query-client";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";

/** Plain tab content inside Settings → Context.
 *
 *  Lists every connected workspace; each exposes Disconnect. A "Connect
 *  another workspace" affordance reuses `PlainConnectState`. */
export function PlainSettingsPanel() {
	const connectionsQuery = usePlainConnections();
	const connections = connectionsQuery.data ?? [];
	const [showConnectAnother, setShowConnectAnother] = useState(false);

	if (connectionsQuery.isLoading) {
		return (
			<div className="flex min-h-[360px] w-full items-center justify-center text-muted-foreground/70">
				<Loader2 className="size-4 animate-spin" strokeWidth={2} />
			</div>
		);
	}

	if (connections.length === 0) {
		return <PlainConnectState className="min-h-[360px]" />;
	}

	return (
		<div className="flex min-h-[360px] w-full flex-col gap-4 px-1 py-2">
			{connections.map((connection) => (
				<PlainConnectionCard key={connection.id} connection={connection} />
			))}
			{showConnectAnother ? (
				<div className="rounded-lg border border-border/60 p-2">
					<PlainConnectState
						className="min-h-[280px]"
						onConnected={() => setShowConnectAnother(false)}
					/>
				</div>
			) : (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="cursor-interactive self-center text-small"
					onClick={() => setShowConnectAnother(true)}
				>
					<Plus className="size-3.5" strokeWidth={2} />
					Connect another workspace
				</Button>
			)}
		</div>
	);
}

function PlainConnectionCard({ connection }: { connection: PlainConnection }) {
	const pushToast = useWorkspaceToast();
	const queryClient = useQueryClient();

	const disconnectMutation = useMutation({
		mutationFn: () => plainDisconnect(connection.id),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: grexQueryKeys.plainConnections,
			});
		},
		onError: (error) => {
			const message =
				error instanceof Error ? error.message : "Couldn't disconnect Plain.";
			pushToast(message, "Plain disconnect failed", "destructive");
		},
	});

	const workspace = connection.workspaceName?.trim();

	return (
		<div className="flex w-full flex-col gap-3 rounded-lg border border-border/60 p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-ui font-medium text-foreground">
						{workspace || "Plain workspace"}
					</div>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="cursor-interactive shrink-0 text-small"
					onClick={() => disconnectMutation.mutate()}
					disabled={disconnectMutation.isPending}
				>
					{disconnectMutation.isPending ? "Disconnecting…" : "Disconnect"}
				</Button>
			</div>

			<p className="text-mini text-muted-foreground/65">
				Open threads (Todo and Snoozed) appear in the feed.
			</p>
		</div>
	);
}
