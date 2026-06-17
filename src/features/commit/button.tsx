import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	ButtonGroup,
	ButtonGroupSeparator,
} from "@/components/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	type MergeBlockedReason,
	mergeBlockedShortLabel,
} from "@/lib/commit-button-logic";
import { i18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type CommitButtonState = "idle" | "busy" | "done" | "error" | "disabled";
export type WorkspaceCommitButtonMode =
	| "create-pr"
	| "commit-and-push"
	| "push"
	| "fix"
	| "resolve-conflicts"
	| "checks-running"
	| "merge-blocked"
	| "merge"
	| "open-pr"
	| "merged"
	| "closed";

export type WorkspaceCommitAction = {
	id: string;
	label: string;
	onClick?: () => void | Promise<void>;
};

interface WorkspaceCommitButtonProps {
	mainLabel?: string;
	mode?: WorkspaceCommitButtonMode;
	disabled?: boolean;
	state?: CommitButtonState;
	doneDurationMs?: number;
	errorDurationMs?: number;
	menuItems?: WorkspaceCommitAction[];
	changeRequestName?: string;
	/** Drives the idle label when `mode === "merge-blocked"`. */
	mergeBlockedReason?: MergeBlockedReason | null;
	className?: string;
	onCommit?: () => void | Promise<void>;
	onStateChange?: (nextState: CommitButtonState) => void;
}

/** i18n key segment for each non-create/open mode under `commit:states`. */
const STATE_LABEL_KEY: Record<
	Exclude<WorkspaceCommitButtonMode, "create-pr" | "open-pr">,
	string
> = {
	"commit-and-push": "commitAndPush",
	push: "push",
	fix: "fix",
	"resolve-conflicts": "resolveConflicts",
	"checks-running": "checksRunning",
	"merge-blocked": "mergeBlocked",
	merge: "merge",
	merged: "merged",
	closed: "closed",
};

/**
 * Resolve the label for a non-create/open mode + state via i18n. Re-resolves
 * on every call so the label follows the active language.
 *   • `merged` / `closed` are settled ghost states with a single label across
 *     all button states.
 *   • the transient `error` state shares the generic "Retry" word from the
 *     `common` namespace.
 */
function resolveStateLabel(
	mode: Exclude<WorkspaceCommitButtonMode, "create-pr" | "open-pr">,
	state: CommitButtonState,
): string {
	const segment = STATE_LABEL_KEY[mode];
	if (mode === "merged" || mode === "closed") {
		return i18n.t(`commit:states.${segment}`);
	}
	if (state === "error") {
		return i18n.t("common:actions.retry");
	}
	return i18n.t(`commit:states.${segment}.${state}`);
}

export function getCommitButtonLabel(
	mode: WorkspaceCommitButtonMode,
	state: CommitButtonState,
	changeRequestName: string,
	mergeBlockedReason?: MergeBlockedReason | null,
): string {
	if (mode === "create-pr") {
		switch (state) {
			case "busy":
				return i18n.t("commit:createPr.busy", { changeRequestName });
			case "done":
				return i18n.t("commit:createPr.done", { changeRequestName });
			case "error":
				return i18n.t("common:actions.retry");
			case "idle":
			case "disabled":
				return i18n.t("commit:createPr.idle", { changeRequestName });
		}
	}
	if (mode === "open-pr") {
		switch (state) {
			case "busy":
				return i18n.t("commit:openPr.busy", { changeRequestName });
			case "done":
				return i18n.t("commit:openPr.done");
			case "error":
				return i18n.t("common:actions.retry");
			case "idle":
			case "disabled":
				return i18n.t("commit:openPr.idle", { changeRequestName });
		}
	}
	// Busy/done/error keep the generic "Merging…" / "Merged" / "Retry".
	if (
		mode === "merge-blocked" &&
		mergeBlockedReason &&
		(state === "idle" || state === "disabled")
	) {
		return mergeBlockedShortLabel(mergeBlockedReason);
	}
	return resolveStateLabel(mode, state);
}

function getDefaultMenuItems(
	mode: WorkspaceCommitButtonMode,
	changeRequestName: string,
): WorkspaceCommitAction[] {
	if (mode === "commit-and-push") {
		return [
			{
				id: "commit-and-push-manually",
				label: i18n.t("commit:menu.commitAndPushManually"),
			},
		];
	}

	if (mode === "push") {
		return [
			{
				id: "push-manually",
				label: i18n.t("commit:menu.pushManually"),
			},
		];
	}

	if (mode === "fix") {
		return [
			{
				id: "fix-manually",
				label: i18n.t("commit:menu.fixManually"),
			},
		];
	}

	return [
		{
			id: "create-draft-pr",
			label: i18n.t("commit:menu.createDraftPr", { changeRequestName }),
		},
		{
			id: "create-pr-manually",
			label: i18n.t("commit:menu.createPrManually", { changeRequestName }),
		},
	];
}

type ActionButtonVariant = "default" | "secondary" | "outline" | "destructive";

function getButtonVariant(
	mode: WorkspaceCommitButtonMode,
	state: CommitButtonState | undefined,
): ActionButtonVariant {
	// Non-actionable states all share the "muted ghost" look (outline +
	// transparent bg + muted accent), regardless of mode:
	//   • merged / closed — settled ghost (PR finalized).
	//   • merge + disabled — mergeability is still computing.
	// Filled CTA is reserved for actively-actionable modes only.
	if (mode === "merged" || mode === "closed") return "outline";
	if (mode === "merge" && state === "disabled") return "outline";
	switch (mode) {
		case "fix":
		case "resolve-conflicts":
		case "merge":
			return "default";
		case "checks-running":
		case "merge-blocked":
			return "outline";
		default:
			return "outline";
	}
}

/** Mode-specific button color overrides (layered on top of the variant).
 *
 * Two visual families:
 *  - **Filled CTA** for actionable modes (fix / resolve-conflicts / merge).
 *  - **Muted ghost** for non-actionable modes — transparent bg, muted
 *    accent border + text. Used for both settled ghost states (merged /
 *    closed) and the transient merge-disabled state (mergeability still
 *    computing). Keeping these in one shape so wrapper-level opacity
 *    tricks aren't needed.
 */
function getModeClassName(
	mode: WorkspaceCommitButtonMode,
	state: CommitButtonState | undefined,
): string | undefined {
	// Computing mergeability: render the merge button as a green ghost so
	// it visually pairs with merged/closed (and the open-accent PR badge
	// next to it) instead of a faded-out solid CTA.
	if (mode === "merge" && state === "disabled") {
		return "border-[var(--workspace-pr-open-accent)] bg-transparent text-[var(--workspace-pr-open-accent)] transition-[background-color,border-color,color,box-shadow,opacity] duration-300 ease-out hover:bg-transparent hover:text-[var(--workspace-pr-open-accent)]";
	}
	switch (mode) {
		case "fix":
			return "bg-clip-border bg-[var(--workspace-pr-closed-accent)] text-white transition-[background-color,border-color,color,box-shadow,opacity] duration-300 ease-out hover:bg-[var(--workspace-pr-closed-accent)]";
		case "resolve-conflicts":
			return "bg-clip-border bg-[var(--workspace-pr-conflicts-accent)] text-white transition-[background-color,border-color,color,box-shadow,opacity] duration-300 ease-out hover:bg-[var(--workspace-pr-conflicts-accent)]";
		case "checks-running":
			return "border-[var(--workspace-pr-checks-running-accent)] bg-transparent text-[var(--workspace-pr-checks-running-accent)] transition-[background-color,border-color,color,box-shadow,opacity] duration-300 ease-out hover:bg-transparent hover:text-[var(--workspace-pr-checks-running-accent)]";
		case "merge-blocked":
			return "border-[var(--workspace-pr-closed-accent)] bg-transparent text-[var(--workspace-pr-closed-accent)] transition-[background-color,border-color,color,box-shadow,opacity] duration-300 ease-out hover:bg-transparent hover:text-[var(--workspace-pr-closed-accent)]";
		case "merge":
			return "bg-clip-border bg-[var(--workspace-pr-open-accent)] text-white transition-[background-color,border-color,color,box-shadow,opacity] duration-300 ease-out hover:bg-[var(--workspace-pr-open-accent)]";
		// Ghost: outline + transparent + the same pure accent the PR badge
		// and Continue button use, so all three pieces in the bar share
		// one color.
		case "merged":
			return "border-[var(--workspace-pr-merged-accent)] bg-transparent text-[var(--workspace-pr-merged-accent)] transition-[background-color,border-color,color,box-shadow,opacity] duration-300 ease-out hover:bg-transparent hover:text-[var(--workspace-pr-merged-accent)]";
		case "closed":
			return "border-[var(--workspace-pr-closed-accent)] bg-transparent text-[var(--workspace-pr-closed-accent)] transition-[background-color,border-color,color,box-shadow,opacity] duration-300 ease-out hover:bg-transparent hover:text-[var(--workspace-pr-closed-accent)]";
		default:
			return undefined;
	}
}

function getModeIcon(mode: WorkspaceCommitButtonMode) {
	switch (mode) {
		case "create-pr":
			return null;
		case "commit-and-push":
		case "push":
			return null;
		case "fix":
			return null;
		case "resolve-conflicts":
			return null;
		case "checks-running":
			return null;
		case "merge-blocked":
			return null;
		case "merge":
		case "merged":
			return null;
		case "open-pr":
			return null;
		case "closed":
			return null;
	}
}

export function WorkspaceCommitButton({
	mainLabel,
	mode = "create-pr",
	disabled = false,
	state,
	doneDurationMs = 900,
	errorDurationMs = 1200,
	menuItems,
	changeRequestName = "PR",
	mergeBlockedReason = null,
	className,
	onCommit,
	onStateChange,
}: WorkspaceCommitButtonProps) {
	const { t } = useTranslation(["commit", "common"]);
	const isControlled = state !== undefined;
	const [internalState, setInternalState] = useState<CommitButtonState>(
		disabled ? "disabled" : "idle",
	);
	useEffect(() => {
		if (disabled) {
			setInternalState("disabled");
			return;
		}
		if (!isControlled && internalState === "disabled") {
			setInternalState("idle");
		}
	}, [disabled, isControlled, internalState]);

	const currentState = isControlled ? state : internalState;
	const isBusy = currentState === "busy";
	const isGhostMode = mode === "merged" || mode === "closed";
	const buttonVariant = getButtonVariant(mode, currentState);
	const modeClassName = getModeClassName(mode, currentState);

	const setState = (nextState: CommitButtonState) => {
		onStateChange?.(nextState);
		if (!isControlled) {
			setInternalState(nextState);
		}
	};

	const runAction = (action?: () => void | Promise<void>) => {
		if (currentState === "busy" || currentState === "disabled" || disabled)
			return;

		// Controlled mode: parent drives the state machine across multi-phase
		// flows (e.g. createSession → stream → PR lookup → mode rotation). We
		// just invoke the action and let the parent flip `state` externally.
		if (isControlled) {
			void Promise.resolve().then(() => action?.());
			return;
		}

		setState("busy");

		void Promise.resolve()
			.then(() => action?.())
			.then(() => {
				setState("done");
				setTimeout(() => {
					if (!disabled) {
						setState("idle");
					}
				}, doneDurationMs);
			})
			.catch(() => {
				setState("error");
				setTimeout(() => {
					if (!disabled) {
						setState("idle");
					}
				}, errorDurationMs);
			});
	};

	const resolvedMenuItems =
		menuItems ?? getDefaultMenuItems(mode, changeRequestName);
	const hasMenuItems =
		mode !== "fix" &&
		mode !== "resolve-conflicts" &&
		mode !== "checks-running" &&
		mode !== "merge-blocked" &&
		mode !== "merge" &&
		mode !== "open-pr" &&
		mode !== "merged" &&
		mode !== "closed" &&
		resolvedMenuItems.length > 0;
	const mainText =
		mainLabel ??
		getCommitButtonLabel(
			mode,
			currentState,
			changeRequestName,
			mergeBlockedReason,
		);
	const mainIcon = getModeIcon(mode);
	const optionsAriaLabel =
		mode === "commit-and-push"
			? t("commit:options.commitAndPush")
			: mode === "push"
				? t("commit:options.push")
				: mode === "fix"
					? t("commit:options.fix")
					: mode === "resolve-conflicts"
						? t("commit:options.resolveConflicts")
						: mode === "checks-running"
							? t("commit:options.checksRunning")
							: mode === "merge-blocked"
								? t("commit:options.mergeBlocked")
								: mode === "merge"
									? t("commit:options.merge")
									: mode === "open-pr"
										? t("commit:options.openPr", { changeRequestName })
										: mode === "merged"
											? t("commit:options.merged")
											: mode === "closed"
												? t("commit:options.closed")
												: t("commit:options.createPr", {
														changeRequestName,
													});

	const mainButton = (
		<Button
			type="button"
			size="xs"
			variant={buttonVariant}
			disabled={isBusy || currentState === "disabled" || disabled}
			onClick={isGhostMode ? undefined : () => runAction(onCommit)}
			className={cn(
				"min-w-0",
				modeClassName,
				className,
				isGhostMode && "pointer-events-none",
			)}
		>
			{mainIcon}
			<span>{mainText}</span>
		</Button>
	);

	if (!hasMenuItems) {
		return mainButton;
	}

	return (
		<DropdownMenu>
			<ButtonGroup aria-label={mainText} className={className}>
				<Button
					type="button"
					size="xs"
					variant={buttonVariant}
					disabled={isBusy || currentState === "disabled" || disabled}
					onClick={() => runAction(onCommit)}
					className={cn("min-w-0", modeClassName)}
				>
					{mainIcon}
					<span>{mainText}</span>
				</Button>
				<ButtonGroupSeparator
					orientation="vertical"
					className="bg-primary-foreground/20"
				/>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						size="icon-xs"
						variant={buttonVariant}
						disabled={
							isBusy || currentState === "disabled" || disabled || !hasMenuItems
						}
						aria-label={optionsAriaLabel}
						className={modeClassName}
					>
						<ChevronDown strokeWidth={2.2} />
					</Button>
				</DropdownMenuTrigger>
			</ButtonGroup>
			<DropdownMenuContent align="end" side="bottom" sideOffset={4}>
				{resolvedMenuItems.map((item) => (
					<DropdownMenuItem
						key={item.id}
						onClick={() => runAction(item.onClick)}
					>
						{item.label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export default WorkspaceCommitButton;
