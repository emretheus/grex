import { GrexThinkingIndicator } from "@/components/grex-thinking-indicator";

/**
 * Pure-UI "Working" footer shown at the bottom of an in-flight assistant
 * turn — Grex logo loading indicator + label, matching the production
 * panel header (`features/panel/header.tsx`).
 */
export function WorkingIndicatorUI({ label = "Working" }: { label?: string }) {
	return (
		<div className="flex items-center gap-1.5 px-5 py-3 text-small tabular-nums text-muted-foreground">
			<GrexThinkingIndicator size={14} />
			{label}
		</div>
	);
}
