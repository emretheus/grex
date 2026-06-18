import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cloneRepositoryFromUrl, forkGrexUpstream } from "@/lib/api";
import { describeUnknownError } from "@/lib/workspace-helpers";

import { GREX_UPSTREAM_SLUG } from "./constants";

type ClonePhase = "idle" | "forking" | "picking" | "cloning";

type StepCloneProps = {
	phase: ClonePhase;
	forkedCloneUrl: string | null;
	cloneDirectory: string | null;
	error: string | null;
	onPhaseChange: (phase: ClonePhase) => void;
	onForkSucceeded: (cloneUrl: string) => void;
	onDirectorySelected: (directory: string) => void;
	onFailed: (message: string) => void;
	onCloneSucceeded: (repoId: string) => void;
};

export function StepClone({
	phase,
	forkedCloneUrl,
	cloneDirectory,
	error,
	onPhaseChange,
	onForkSucceeded,
	onDirectorySelected,
	onFailed,
	onCloneSucceeded,
}: StepCloneProps) {
	const { t } = useTranslation("feedback");
	// Kick off the fork as soon as the step mounts. Reducer seeds phase =
	// "forking" on entry; if we're back in "idle" after a failure the user
	// can hit "Try again" manually.
	useEffect(() => {
		if (phase !== "forking" || forkedCloneUrl) {
			return;
		}
		let cancelled = false;
		void (async () => {
			try {
				const fork = await forkGrexUpstream();
				if (!cancelled) {
					onForkSucceeded(fork.cloneUrl);
				}
			} catch (error) {
				if (!cancelled) {
					onFailed(describeUnknownError(error, t("clone.forkFailed")));
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [phase, forkedCloneUrl, onForkSucceeded, onFailed, t]);

	const handleBrowse = async () => {
		try {
			const selection = await openDialog({
				directory: true,
				multiple: false,
				defaultPath: cloneDirectory ?? undefined,
			});
			const selected = Array.isArray(selection) ? selection[0] : selection;
			if (selected) {
				onDirectorySelected(selected);
			}
		} catch (error) {
			onFailed(describeUnknownError(error, t("clone.folderPickerFailed")));
		}
	};

	const handleClone = async () => {
		if (!forkedCloneUrl || !cloneDirectory) return;
		onPhaseChange("cloning");
		try {
			const response = await cloneRepositoryFromUrl({
				gitUrl: forkedCloneUrl,
				cloneDirectory,
			});
			onCloneSucceeded(response.repositoryId);
		} catch (error) {
			onFailed(describeUnknownError(error, t("clone.cloneFailed")));
		}
	};

	const handleRetryFork = () => {
		onPhaseChange("forking");
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-start gap-2 text-small leading-snug">
				{phase === "forking" ? (
					<>
						<LoaderCircle
							className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground"
							strokeWidth={2.1}
						/>
						<span className="text-muted-foreground">
							{t("clone.forking", { slug: GREX_UPSTREAM_SLUG })}
						</span>
					</>
				) : forkedCloneUrl ? (
					<span className="text-muted-foreground">{t("clone.forkReady")}</span>
				) : (
					<span className="text-muted-foreground">{t("clone.forkIntro")}</span>
				)}
			</div>

			{forkedCloneUrl ? (
				<div className="flex flex-col gap-1">
					<Label
						htmlFor="feedback-clone-location"
						className="text-small font-medium tracking-[-0.01em]"
					>
						{t("clone.cloneLocationLabel")}
					</Label>
					<div className="flex items-center gap-1.5">
						<Input
							id="feedback-clone-location"
							type="text"
							value={cloneDirectory ?? ""}
							readOnly
							placeholder={t("clone.cloneLocationPlaceholder")}
							className="h-7 text-ui"
						/>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => {
								void handleBrowse();
							}}
							disabled={phase === "cloning"}
						>
							<FolderOpen data-icon="inline-start" />
							{t("clone.browse")}
						</Button>
					</div>
				</div>
			) : null}

			{error ? (
				<p role="alert" className="text-small leading-snug text-destructive">
					{error}
				</p>
			) : null}

			<div className="flex items-center justify-end gap-2 pt-0.5">
				{phase === "idle" && error ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleRetryFork}
					>
						{t("clone.tryAgain")}
					</Button>
				) : null}
				<Button
					type="button"
					size="sm"
					onClick={() => {
						void handleClone();
					}}
					disabled={
						!forkedCloneUrl ||
						!cloneDirectory ||
						phase === "cloning" ||
						phase === "forking"
					}
				>
					{phase === "cloning" ? (
						<>
							<LoaderCircle
								data-icon="inline-start"
								className="animate-spin"
								strokeWidth={2.1}
							/>
							{t("clone.cloning")}
						</>
					) : (
						t("clone.cloneToFolder")
					)}
				</Button>
			</div>
		</div>
	);
}
