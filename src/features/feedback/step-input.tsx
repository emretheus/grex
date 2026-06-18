import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ExistingGrexRepo } from "@/lib/api";

import { GREX_UPSTREAM_SLUG } from "./constants";

type StepInputProps = {
	input: string;
	existing: ExistingGrexRepo | null;
	/** False until `findExistingGrexRepo` has resolved. Gates Quick fix
	 *  so a fast user can't bypass the "reuse local repo" optimization. */
	existingLoaded: boolean;
	githubConnected: boolean;
	/** True after the first "Create issue" click — show the confirm UI. */
	confirming: boolean;
	/** True while the issue API call is in flight. */
	sending: boolean;
	onInputChange: (input: string) => void;
	onCreateIssue: () => void;
	onCancelConfirm: () => void;
	onQuickFix: () => void;
	onOpenSettings: () => void;
};

export function StepInput({
	input,
	existing,
	existingLoaded,
	githubConnected,
	confirming,
	sending,
	onInputChange,
	onCreateIssue,
	onCancelConfirm,
	onQuickFix,
	onOpenSettings,
}: StepInputProps) {
	const { t } = useTranslation(["feedback", "common"]);
	const hasInput = input.trim().length > 0;
	const canCreateIssue = hasInput && githubConnected;
	// Quick fix additionally waits for the existing-repo lookup so it
	// can take the reuse-local-repo branch when applicable.
	const canQuickFix = canCreateIssue && existingLoaded;

	return (
		<div className="flex flex-col gap-3">
			<Textarea
				id="feedback-input"
				value={input}
				onChange={(event) => onInputChange(event.target.value)}
				placeholder={t("input.placeholder")}
				aria-label={t("input.ariaLabel")}
				disabled={sending}
				className="field-sizing-fixed min-h-32"
			/>
			<div className="min-h-4 text-small text-muted-foreground">
				{!githubConnected ? (
					<>
						{t("input.connectGithubPrefix")}
						<Button
							variant="link"
							size="xs"
							className="h-auto p-0 text-small"
							onClick={onOpenSettings}
						>
							{t("input.settingsLink")}
						</Button>
						{t("input.connectGithubSuffix")}
					</>
				) : existing && !confirming ? (
					t("input.reuseLocalRepo")
				) : null}
			</div>
			<div className="mt-1 flex items-center justify-between gap-3">
				<p className="text-small text-muted-foreground">
					{confirming
						? t("input.confirmPrompt", { slug: GREX_UPSTREAM_SLUG })
						: null}
				</p>
				<div className="flex shrink-0 items-center gap-2">
					{confirming ? (
						<>
							<Button
								variant="outline"
								size="sm"
								onClick={onCancelConfirm}
								disabled={sending}
							>
								{t("common:actions.cancel")}
							</Button>
							<Button size="sm" onClick={onCreateIssue} disabled={sending}>
								{sending ? t("input.sending") : t("input.confirmSend")}
							</Button>
						</>
					) : (
						<>
							<Button
								variant="outline"
								size="sm"
								onClick={onCreateIssue}
								disabled={!canCreateIssue}
							>
								{t("input.createIssue")}
							</Button>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										onClick={onQuickFix}
										disabled={!canQuickFix}
									>
										{t("input.quickFix")}
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top" sideOffset={6}>
									{t("input.quickFixTooltip")}
								</TooltipContent>
							</Tooltip>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
