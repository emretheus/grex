import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type RenameWorkspaceDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Current title shown in the sidebar — pre-fills the input. */
	currentTitle: string;
	onConfirm: (name: string) => Promise<void> | void;
};

export function RenameWorkspaceDialog({
	open,
	onOpenChange,
	currentTitle,
	onConfirm,
}: RenameWorkspaceDialogProps) {
	const { t } = useTranslation(["navigation", "common"]);
	const [value, setValue] = useState(currentTitle);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (open) {
			setValue(currentTitle);
			setSubmitting(false);
		}
	}, [open, currentTitle]);

	const trimmed = value.trim();
	const unchanged = trimmed === currentTitle.trim();

	async function handleConfirm() {
		if (submitting || unchanged) {
			return;
		}
		setSubmitting(true);
		try {
			await onConfirm(trimmed);
			onOpenChange(false);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="gap-3 sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("renameDialog.title")}</DialogTitle>
				</DialogHeader>
				<Input
					autoFocus
					value={value}
					placeholder={t("renameDialog.placeholder")}
					onChange={(event) => setValue(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							void handleConfirm();
						}
					}}
				/>
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
						disabled={submitting || unchanged}
						onClick={handleConfirm}
					>
						{t("renameDialog.save")}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
