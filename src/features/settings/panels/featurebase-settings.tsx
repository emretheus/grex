import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FeaturebaseConnectState } from "@/features/inbox/featurebase-connect-button";
import { useFeaturebaseConnections } from "@/features/inbox/use-featurebase-connection";
import { type FeaturebaseConnection, featurebaseDisconnect } from "@/lib/api";
import { grexQueryKeys } from "@/lib/query-client";
import { useWorkspaceToast } from "@/lib/workspace-toast-context";

/** Featurebase tab content inside Settings → Context.
 *
 *  Lists every connected org; each exposes only a Disconnect button —
 *  Featurebase feedback posts are read-only, so there's no scope toggle or
 *  board picker. A "Connect another board" affordance reuses
 *  `FeaturebaseConnectState`. */
export function FeaturebaseSettingsPanel() {
	const { t } = useTranslation("integrations");
	const connectionsQuery = useFeaturebaseConnections();
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
		return <FeaturebaseConnectState className="min-h-[360px]" />;
	}

	return (
		<div className="flex min-h-[360px] w-full flex-col gap-4 px-1 py-2">
			{connections.map((connection) => (
				<FeaturebaseConnectionCard
					key={connection.id}
					connection={connection}
				/>
			))}
			{showConnectAnother ? (
				<div className="rounded-lg border border-border/60 p-2">
					<FeaturebaseConnectState
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
					{t("featurebase.connectAnother")}
				</Button>
			)}
		</div>
	);
}

function FeaturebaseConnectionCard({
	connection,
}: {
	connection: FeaturebaseConnection;
}) {
	const { t } = useTranslation("integrations");
	const pushToast = useWorkspaceToast();
	const queryClient = useQueryClient();

	const disconnectMutation = useMutation({
		mutationFn: () => featurebaseDisconnect(connection.id),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: grexQueryKeys.featurebaseConnections,
			});
		},
		onError: (error) => {
			const message =
				error instanceof Error
					? error.message
					: t("featurebase.disconnectError");
			pushToast(message, t("featurebase.disconnectFailed"), "destructive");
		},
	});

	const org = connection.orgName?.trim();

	return (
		<div className="flex w-full flex-col gap-3 rounded-lg border border-border/60 p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-ui font-medium text-foreground">
						{org || t("featurebase.boardFallback")}
					</div>
					<p className="text-mini text-muted-foreground/65">
						{t("featurebase.readOnlyHint")}
					</p>
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
		</div>
	);
}
