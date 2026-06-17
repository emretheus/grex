import { ListTree } from "lucide-react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type ComposerQuickAction = {
	id: string;
	label: string;
	/** Prompt sent verbatim when the tag is clicked — typically a slash
	 *  command that triggers the matching skill (e.g. `/grex-cli restack`). */
	prompt: string;
	icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
};

/** Internal shape: `labelKey` is an i18n key (composer namespace) resolved via
 *  `t()` at render so the tag label follows live language switches. `id` and
 *  `prompt` stay verbatim — the prompt is sent to the agent unchanged. */
type QuickActionDef = Omit<ComposerQuickAction, "label"> & { labelKey: string };

// Default quick actions. Each tag fires a preset prompt on click — for now
// just Restack, which kicks off the stacked-PR restack skill.
const DEFAULT_QUICK_ACTIONS: QuickActionDef[] = [
	{
		id: "restack",
		labelKey: "quickActions.restack",
		prompt: "/grex-cli restack",
		icon: ListTree,
	},
];

type ComposerQuickActionsProps = {
	actions?: ComposerQuickAction[];
	onAction: (action: ComposerQuickAction) => void;
	disabled?: boolean;
};

/**
 * Row of one-click quick-action tags that sits above the composer. Clicking a
 * tag dispatches its preset prompt. Rendered inside the composer's floating
 * column so it stacks naturally with the other bars (queue, goal banner) and
 * gets pushed up instead of overlapping them.
 */
export function ComposerQuickActions({
	actions,
	onAction,
	disabled,
}: ComposerQuickActionsProps) {
	const { t } = useTranslation("composer");
	const resolvedActions: ComposerQuickAction[] =
		actions ??
		DEFAULT_QUICK_ACTIONS.map(({ labelKey, ...action }) => ({
			...action,
			label: t(labelKey),
		}));
	if (resolvedActions.length === 0) return null;
	return (
		<div className="pointer-events-auto mb-1.5 flex w-full flex-wrap items-center justify-start gap-1.5 self-stretch pl-1">
			{resolvedActions.map((action) => {
				const Icon = action.icon;
				return (
					<button
						key={action.id}
						type="button"
						disabled={disabled}
						onClick={() => onAction(action)}
						className={cn(
							"inline-flex cursor-pointer items-center gap-1 rounded-md border border-border/50 bg-sidebar/90 px-2 py-1 text-small font-medium text-muted-foreground backdrop-blur transition-colors hover:border-border hover:bg-accent/60 hover:text-foreground",
							disabled &&
								"cursor-not-allowed opacity-50 hover:border-border/50 hover:bg-sidebar/90 hover:text-muted-foreground",
						)}
					>
						{Icon ? (
							<Icon className="size-3 shrink-0" strokeWidth={1.8} />
						) : null}
						<span>{action.label}</span>
					</button>
				);
			})}
		</div>
	);
}
