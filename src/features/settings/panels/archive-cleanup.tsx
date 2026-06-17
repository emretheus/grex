import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cleanupArchivedWorkspaces } from "@/lib/api";
import { archivedWorkspacesQueryOptions } from "@/lib/query-client";
import { requestSidebarReconcile } from "@/lib/sidebar-mutation-gate";
import { SettingsRow } from "../components/settings-row";

/**
 * Settings → General "Clean up archived workspaces" row.
 *
 * One button that permanently deletes every archived workspace through
 * the standard backend delete path, behind an explicit confirmation
 * dialog. Once confirmed the run is backend-owned and not cancellable —
 * the dialog stays open in a loading state until the run finishes, and
 * the outcome (including partial failures) lands as a toast.
 */
export function ArchiveCleanupPanel() {
	const { t } = useTranslation("settings");
	const queryClient = useQueryClient();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const archivedQuery = useQuery(archivedWorkspacesQueryOptions());
	const archivedCount = archivedQuery.data?.length ?? 0;

	const cleanup = useMutation({
		mutationFn: cleanupArchivedWorkspaces,
		onSuccess: (result) => {
			if (result.failures.length === 0) {
				toast.success(
					result.deletedCount === 0
						? t("archiveCleanup.toast.nothing")
						: t("archiveCleanup.toast.cleaned", {
								count: result.deletedCount,
							}),
				);
				return;
			}
			toast.error(
				t("archiveCleanup.toast.partial", {
					deleted: result.deletedCount,
					count: result.failures.length,
				}),
				{
					description: result.failures
						.map((failure) =>
							failure.title
								? `${failure.title}: ${failure.message}`
								: failure.message,
						)
						.join("\n"),
				},
			);
		},
		onError: (error) => {
			toast.error(t("archiveCleanup.toast.failedTitle"), {
				description: error instanceof Error ? error.message : String(error),
			});
		},
		onSettled: () => {
			setConfirmOpen(false);
			requestSidebarReconcile(queryClient);
		},
	});

	return (
		<SettingsRow
			title={t("archiveCleanup.title")}
			description={
				archivedCount === 0
					? t("archiveCleanup.descriptionEmpty")
					: t("archiveCleanup.description", { count: archivedCount })
			}
		>
			<Button
				variant="outline"
				size="sm"
				disabled={archivedCount === 0 || cleanup.isPending}
				onClick={() => setConfirmOpen(true)}
			>
				{cleanup.isPending ? (
					<Loader2 className="size-3.5 animate-spin" />
				) : (
					<Trash2 className="size-3.5" />
				)}
				{cleanup.isPending
					? t("archiveCleanup.buttonBusy")
					: t("archiveCleanup.button")}
			</Button>
			<ConfirmDialog
				open={confirmOpen}
				// Once the run starts it cannot be cancelled — keep the dialog
				// up (with disabled buttons) so the loading state stays visible.
				onOpenChange={(open) => {
					if (!cleanup.isPending) {
						setConfirmOpen(open);
					}
				}}
				title={t("archiveCleanup.confirmTitle")}
				description={t("archiveCleanup.confirmDescription", {
					count: archivedCount,
				})}
				confirmLabel={t("archiveCleanup.confirmLabel")}
				onConfirm={() => cleanup.mutate()}
				loading={cleanup.isPending}
			/>
		</SettingsRow>
	);
}
