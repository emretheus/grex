import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { devResetAllData, loadDataInfo } from "@/lib/api";
import { saveSettings } from "@/lib/settings";
import {
	SettingsGroup,
	SettingsNotice,
	SettingsRow,
} from "../components/settings-row";

export function DevToolsPanel() {
	const { t } = useTranslation("settings");
	const [dataDir, setDataDir] = useState<string | null>(null);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [resetting, setResetting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [onboardingReset, setOnboardingReset] = useState(false);

	useEffect(() => {
		void loadDataInfo().then((info) => {
			if (info) setDataDir(info.dataRoot);
		});
	}, []);

	const handleReset = useCallback(async () => {
		setResetting(true);
		setError(null);
		try {
			await devResetAllData();
			// Full page reload to reset all component state (selected
			// workspace/session, settings context, etc.) — query invalidation
			// alone leaves stale useState references.
			window.location.reload();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setResetting(false);
			setConfirmOpen(false);
		}
	}, []);

	const handleResetOnboarding = useCallback(() => {
		void saveSettings({ onboardingCompleted: false });
		setOnboardingReset(true);
	}, []);

	return (
		<>
			<SettingsGroup>
				<SettingsRow
					align="start"
					title={
						<span className="flex items-center gap-1.5">
							<RotateCcw
								className="size-3.5 text-muted-foreground"
								strokeWidth={1.8}
							/>
							<span>{t("devTools.showOnboarding.title")}</span>
						</span>
					}
					description={
						<>
							{t("devTools.showOnboarding.description")}
							{onboardingReset ? (
								<SettingsNotice tone="ok">
									{t("devTools.showOnboarding.notice")}
								</SettingsNotice>
							) : null}
						</>
					}
				>
					<Button variant="outline" size="sm" onClick={handleResetOnboarding}>
						{t("devTools.showOnboarding.button")}
					</Button>
				</SettingsRow>

				<SettingsRow
					align="start"
					title={
						<span className="flex items-center gap-1.5">
							<Trash2 className="size-3.5 text-destructive" strokeWidth={1.8} />
							<span>{t("devTools.resetData.title")}</span>
						</span>
					}
					description={
						<>
							{t("devTools.resetData.description")}
							{dataDir ? (
								<SettingsNotice tone="info">
									{t("devTools.resetData.dataDir")}{" "}
									<code className="rounded bg-muted px-1 py-0.5">
										{dataDir}
									</code>
								</SettingsNotice>
							) : null}
							{error ? (
								<SettingsNotice tone="error">{error}</SettingsNotice>
							) : null}
						</>
					}
				>
					<Button
						variant="destructive"
						size="sm"
						onClick={() => {
							setError(null);
							setConfirmOpen(true);
						}}
						disabled={resetting}
					>
						{resetting ? (
							<>
								<Loader2 className="mr-1.5 size-3.5 animate-spin" />
								{t("devTools.resetData.resetting")}
							</>
						) : (
							t("devTools.resetData.button")
						)}
					</Button>
				</SettingsRow>
			</SettingsGroup>

			<ConfirmDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				title={t("devTools.resetData.confirmTitle")}
				description={
					<Trans
						i18nKey="settings:devTools.resetData.confirmDescription"
						components={{ strong: <strong /> }}
					/>
				}
				confirmLabel={
					resetting
						? t("devTools.resetData.confirmLabelBusy")
						: t("devTools.resetData.confirmLabel")
				}
				onConfirm={() => void handleReset()}
				loading={resetting}
			/>
		</>
	);
}
