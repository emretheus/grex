import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ForgejoConnectState } from "@/features/inbox/forgejo-connect-button";
import { useForgejoConnections } from "@/features/inbox/use-forgejo-connection";
import {
	type ForgejoConnection,
	forgejoDisconnect,
	forgejoUpdateScope,
} from "@/lib/api";
import { grexQueryKeys } from "@/lib/query-client";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";

/** Forgejo tab content inside Settings → Context.
 *
 *  Lists every connected instance; each exposes a My issues/All issues scope
 *  toggle, plus Disconnect. A "Connect another instance" affordance reuses
 *  `ForgejoConnectState`. Unlike Trello there's no board/repo picker — scope
 *  is a simple assigned-only flag. */
export function ForgejoSettingsPanel() {
	const { t } = useTranslation("integrations");
	const connectionsQuery = useForgejoConnections();
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
		return <ForgejoConnectState className="min-h-[360px]" />;
	}

	return (
		<div className="flex min-h-[360px] w-full flex-col gap-4 px-1 py-2">
			{connections.map((connection) => (
				<ForgejoConnectionCard key={connection.id} connection={connection} />
			))}
			{showConnectAnother ? (
				<div className="rounded-lg border border-border/60 p-2">
					<ForgejoConnectState
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
					{t("forgejo.connectAnother")}
				</Button>
			)}
		</div>
	);
}

function ForgejoConnectionCard({
	connection,
}: {
	connection: ForgejoConnection;
}) {
	const { t } = useTranslation("integrations");
	const pushToast = useWorkspaceToast();
	const queryClient = useQueryClient();

	// Local mirror so the controls stay responsive while the persist + cache
	// invalidation round-trips. Seeded from the persisted connection.
	const [assignedOnly, setAssignedOnly] = useState<boolean>(
		connection.assignedOnly,
	);

	const updateMutation = useMutation({
		mutationFn: forgejoUpdateScope,
		onError: (error) => {
			const message =
				error instanceof Error ? error.message : t("forgejo.updateError");
			pushToast(message, t("forgejo.updateFailed"), "destructive");
		},
	});

	const disconnectMutation = useMutation({
		mutationFn: () => forgejoDisconnect(connection.id),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: grexQueryKeys.forgejoConnections,
			});
		},
		onError: (error) => {
			const message =
				error instanceof Error ? error.message : t("forgejo.disconnectError");
			pushToast(message, t("forgejo.disconnectFailed"), "destructive");
		},
	});

	const handleScope = (value: string) => {
		if (value !== "assigned" && value !== "all") return;
		const nextAssignedOnly = value === "assigned";
		setAssignedOnly(nextAssignedOnly);
		updateMutation.mutate({
			connectionId: connection.id,
			assignedOnly: nextAssignedOnly,
		});
	};

	const host = connection.hostName?.trim();
	const user = connection.userName?.trim();

	return (
		<div className="flex w-full flex-col gap-3 rounded-lg border border-border/60 p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-ui font-medium text-foreground">
						{host || t("forgejo.instanceFallback")}
					</div>
					{user ? (
						<div className="truncate text-mini text-muted-foreground/70">
							{user}
						</div>
					) : null}
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="cursor-interactive shrink-0 text-small"
					onClick={() => disconnectMutation.mutate()}
					disabled={disconnectMutation.isPending}
				>
					{disconnectMutation.isPending
						? t("common.disconnecting")
						: t("common.disconnect")}
				</Button>
			</div>

			<div className="flex items-center gap-2">
				<ToggleGroup
					type="single"
					value={assignedOnly ? "assigned" : "all"}
					onValueChange={handleScope}
					variant="outline"
					size="sm"
				>
					<ToggleGroupItem value="assigned" className="cursor-interactive">
						{t("forgejo.scopeMine")}
					</ToggleGroupItem>
					<ToggleGroupItem value="all" className="cursor-interactive">
						{t("forgejo.scopeAll")}
					</ToggleGroupItem>
				</ToggleGroup>
			</div>

			{assignedOnly ? (
				<p className="text-mini text-muted-foreground/65">
					{t("common.assignedFeedHint")}
				</p>
			) : (
				<p className="text-mini text-muted-foreground/65">
					{t("forgejo.allIssuesHint")}
				</p>
			)}
		</div>
	);
}
