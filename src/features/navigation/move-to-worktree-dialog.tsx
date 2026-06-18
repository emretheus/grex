import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export type MoveToWorktreeDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspaceTitle: string;
	onConfirm: () => Promise<void> | void;
};

// Confirmation for move-to-worktree — silent mode flip on a click is
// surprising even though the action is reversible.
export function MoveToWorktreeDialog({
	open,
	onOpenChange,
	workspaceTitle,
	onConfirm,
}: MoveToWorktreeDialogProps) {
	const { t } = useTranslation(["navigation", "common"]);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (open) {
			setSubmitting(false);
		}
	}, [open]);

	async function handleConfirm() {
		setSubmitting(true);
		try {
			await onConfirm();
			onOpenChange(false);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="gap-3 sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("moveToWorktreeDialog.title")}</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-2 text-ui leading-snug text-muted-foreground">
					<p>
						<Trans
							t={t}
							i18nKey="moveToWorktreeDialog.description"
							values={{ name: workspaceTitle }}
							components={{
								bold: <span className="font-medium text-foreground" />,
							}}
						/>
					</p>
					<ul className="list-disc space-y-0.5 pl-4">
						<li>{t("moveToWorktreeDialog.localUntouched")}</li>
						<li>{t("moveToWorktreeDialog.changesCarriedOver")}</li>
					</ul>
				</div>
				<div className="flex justify-end gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={submitting}
						onClick={() => onOpenChange(false)}
					>
						{t("common:actions.cancel")}
					</Button>
					<Button
						type="button"
						size="sm"
						disabled={submitting}
						onClick={handleConfirm}
					>
						{submitting
							? t("moveToWorktreeDialog.moving")
							: t("moveToWorktreeDialog.submit")}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
