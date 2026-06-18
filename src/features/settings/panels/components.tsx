import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	type GrexComponentsUpdateCheck,
	getGrexComponentsUpdateCheck,
	installCli,
	installGrexSkills,
	recheckGrexComponents,
} from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { SettingsRow } from "../components/settings-row";

/**
 * Settings → General "Grex components" row.
 *
 * Surfaces the per-version silent startup re-check of the Grex CLI
 * symlink and the Grex Skills package. Steady state: green check on
 * each, no controls. When the silent pass deferred work to the user
 * (CLI needs sudo, skills install errored), the affected row shows a
 * red mark + per-component Retry button. A "Re-check now" button
 * always clears the per-version cache and re-runs both halves.
 *
 * The actual install logic lives in the Rust system_commands module —
 * this panel is purely a presentation layer over the IPC snapshot.
 */
export function ComponentsPanel() {
	const { t } = useTranslation("settings");
	const [snapshot, setSnapshot] = useState<GrexComponentsUpdateCheck | null>(
		null,
	);
	const [rechecking, setRechecking] = useState(false);
	const [retryingCli, setRetryingCli] = useState(false);
	const [retryingSkills, setRetryingSkills] = useState(false);

	const refresh = useCallback(async () => {
		try {
			const next = await getGrexComponentsUpdateCheck();
			setSnapshot(next);
		} catch (error) {
			// Reading the snapshot is a pure DB read; a failure here means
			// something is genuinely wrong with the install. Surface it
			// instead of swallowing.
			toast.error(t("components.toast.readFailed"), {
				description: error instanceof Error ? error.message : String(error),
			});
		}
	}, [t]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const handleRecheck = useCallback(async () => {
		setRechecking(true);
		try {
			const next = await recheckGrexComponents();
			setSnapshot(next);
			if (!next.cliError && !next.skillsError) {
				toast.success(t("components.toast.upToDate"));
			}
		} catch (error) {
			toast.error(t("components.toast.recheckFailed"), {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setRechecking(false);
		}
	}, [t]);

	const handleRetryCli = useCallback(async () => {
		setRetryingCli(true);
		try {
			await installCli();
			await refresh();
		} catch (error) {
			toast.error(t("components.toast.cliInstallFailed"), {
				description: error instanceof Error ? error.message : String(error),
			});
			// Refresh anyway so any partial state is reflected.
			await refresh();
		} finally {
			setRetryingCli(false);
		}
	}, [refresh, t]);

	const handleRetrySkills = useCallback(async () => {
		setRetryingSkills(true);
		try {
			await installGrexSkills();
			await refresh();
		} catch (error) {
			toast.error(t("components.toast.skillsInstallFailed"), {
				description: error instanceof Error ? error.message : String(error),
			});
			await refresh();
		} finally {
			setRetryingSkills(false);
		}
	}, [refresh, t]);

	const cliOk = snapshot?.cli.installState === "managed" && !snapshot.cliError;
	const skillsOk = !!snapshot?.skills.installed && !snapshot?.skillsError;
	const cliBusy = rechecking || retryingCli;
	const skillsBusy = rechecking || retryingSkills;

	const summary = (() => {
		if (!snapshot) return t("components.loadingStatus");
		if (cliOk && skillsOk) {
			const checked = snapshot.lastCheckedVersion;
			if (checked === snapshot.currentVersion) {
				return t("components.summary.upToDate", {
					version: snapshot.currentVersion,
				});
			}
			return t("components.summary.healthy");
		}
		return t("components.summary.needsAttention");
	})();

	return (
		<SettingsRow
			align="start"
			title={t("components.title")}
			description={
				<>
					<div>{summary}</div>
					{snapshot ? (
						<div className="mt-3 grid gap-2">
							<ComponentLine
								label={t("components.cliLabel")}
								ok={cliOk}
								busy={cliBusy}
								onRetry={handleRetryCli}
								error={snapshot.cliError}
								state={describeCliState(snapshot)}
							/>
							<ComponentLine
								label={t("components.skillsLabel")}
								ok={skillsOk}
								busy={skillsBusy}
								onRetry={handleRetrySkills}
								error={snapshot.skillsError}
								state={describeSkillsState(snapshot)}
							/>
						</div>
					) : null}
				</>
			}
		>
			<Button
				variant="outline"
				size="sm"
				onClick={handleRecheck}
				disabled={rechecking || retryingCli || retryingSkills}
			>
				{rechecking ? (
					<Loader2 className="size-3.5 animate-spin" />
				) : (
					<RefreshCw className="size-3.5" />
				)}
				{rechecking ? t("components.recheckBusy") : t("components.recheck")}
			</Button>
		</SettingsRow>
	);
}

function ComponentLine({
	label,
	ok,
	busy,
	error,
	state,
	onRetry,
}: {
	label: string;
	ok: boolean;
	busy: boolean;
	error: string | null;
	state: string;
	onRetry: () => void;
}) {
	const Icon = busy ? Loader2 : ok ? CheckCircle2 : XCircle;
	const iconClass = busy
		? "text-muted-foreground animate-spin"
		: ok
			? "text-green-500"
			: "text-destructive";
	return (
		<div className="flex items-start justify-between gap-3">
			<div className="flex min-w-0 items-start gap-2">
				<Icon className={cn("mt-0.5 size-3.5 shrink-0", iconClass)} />
				<div className="min-w-0">
					<div className="text-small font-medium text-foreground">{label}</div>
					<div className="text-mini leading-snug text-muted-foreground">
						{error ?? state}
					</div>
				</div>
			</div>
			{!ok && !busy ? (
				<Button
					variant="ghost"
					size="sm"
					onClick={onRetry}
					className="h-7 shrink-0 px-2 text-mini"
				>
					{i18n.t("common:actions.retry")}
				</Button>
			) : null}
		</div>
	);
}

function describeCliState(snapshot: GrexComponentsUpdateCheck): string {
	switch (snapshot.cli.installState) {
		case "managed":
			return snapshot.cli.installPath
				? i18n.t("settings:components.cli.installedAt", {
						path: snapshot.cli.installPath,
					})
				: i18n.t("settings:components.cli.installed");
		case "stale":
			return i18n.t("settings:components.cli.stale");
		case "missing":
			return i18n.t("settings:components.cli.missing");
		default:
			return i18n.t("settings:components.cli.unavailable");
	}
}

function describeSkillsState(snapshot: GrexComponentsUpdateCheck): string {
	if (snapshot.skills.installed) {
		// Provider identifiers ("Claude Code", "Codex") are product names —
		// kept verbatim; only the surrounding sentence is localized.
		const parts: string[] = [];
		if (snapshot.skills.claude) parts.push("Claude Code");
		if (snapshot.skills.codex) parts.push("Codex");
		return parts.length > 0
			? i18n.t("settings:components.skills.installedFor", {
					targets: parts.join(i18n.t("settings:components.skills.join")),
				})
			: i18n.t("settings:components.skills.installed");
	}
	return i18n.t("settings:components.skills.signInPrompt");
}
