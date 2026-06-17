import { Play, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ActionRow, ActionRowButton } from "@/components/action-row";
import { cn } from "@/lib/utils";

type TriageQuickActionsProps = {
	onStart: () => void;
	onDismiss: () => void;
	/** Disable both buttons (e.g. composer is sending or archive in flight). */
	disabled?: boolean;
};

// Composer Start/Dismiss row for un-engaged triage workspaces.
export function TriageQuickActions({
	onStart,
	onDismiss,
	disabled,
}: TriageQuickActionsProps) {
	const { t } = useTranslation("composer");
	return (
		<ActionRow
			className={cn(
				"relative z-0 mx-auto -mb-px w-[90%] rounded-t-2xl border-b-0 border-secondary/80",
			)}
			leading={
				<>
					<Sparkles
						className="size-3.5 shrink-0 text-muted-foreground/60"
						strokeWidth={1.8}
						aria-hidden="true"
					/>
					<span className="truncate text-small font-medium tracking-[0.01em] text-muted-foreground">
						{t("triage.prompt")}
					</span>
				</>
			}
			trailing={
				<>
					<ActionRowButton
						aria-label={t("triage.dismissAria")}
						disabled={disabled}
						onClick={onDismiss}
					>
						<X className="size-[13px] shrink-0" strokeWidth={1.8} />
						<span className="inline-flex items-center">
							{t("triage.dismiss")}
						</span>
					</ActionRowButton>
					<ActionRowButton
						active
						aria-label={t("triage.startAria")}
						disabled={disabled}
						onClick={onStart}
					>
						<Play className="size-[13px] shrink-0" strokeWidth={1.8} />
						<span className="inline-flex items-center">
							{t("triage.start")}
						</span>
					</ActionRowButton>
				</>
			}
		/>
	);
}
