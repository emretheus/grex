import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";

export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel,
	cancelLabel,
	onConfirm,
	loading = false,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: ReactNode;
	confirmLabel?: string;
	cancelLabel?: string;
	onConfirm: () => void;
	loading?: boolean;
}) {
	const { t } = useTranslation("common");
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="max-w-[320px] gap-0 p-4"
				showCloseButton={false}
			>
				<DialogTitle className="text-ui font-semibold">{title}</DialogTitle>
				<DialogDescription className="mt-1.5 text-small leading-relaxed text-muted-foreground">
					{description}
				</DialogDescription>
				<div className="mt-3 flex justify-end gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => onOpenChange(false)}
						disabled={loading}
					>
						{cancelLabel ?? t("actions.cancel")}
					</Button>
					<Button
						variant="destructive"
						size="sm"
						onClick={onConfirm}
						disabled={loading}
					>
						{loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
						{confirmLabel ?? t("actions.confirm")}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
