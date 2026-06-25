import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	CheckCircle2,
	ChevronDown,
	HelpCircle,
	Settings,
	Volume2,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModelIcon } from "@/components/model-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarSeparator,
} from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { getShortcut } from "@/features/shortcuts/registry";
import { ShortcutsSettingsPanel } from "@/features/shortcuts/settings-panel";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import {
	type AgentModelOption,
	type AgentModelSection,
	isConductorAvailable,
	type RepositoryCreateOption,
} from "@/lib/api";
import { i18n } from "@/lib/i18n";
import {
	NOTIFICATION_SOUND_LABELS,
	playNotificationSound,
} from "@/lib/notification-sound";
import {
	agentModelSectionsQueryOptions,
	grexQueryKeys,
	repositoriesQueryOptions,
} from "@/lib/query-client";
import type {
	AppSettings,
	ClaudeThinkingDisplay,
	NotificationSound,
} from "@/lib/settings";
import { useSettings, VALID_NOTIFICATION_SOUNDS } from "@/lib/settings";
import { requestSidebarReconcile } from "@/lib/sidebar-mutation-gate";
import { cn } from "@/lib/utils";
import { clampEffort, findModelOption } from "@/lib/workspace-helpers";
import { SettingsGroup, SettingsRow } from "./components/settings-row";
import { SettingsSelect } from "./components/settings-select";
import { AccountPanel } from "./panels/account";
import { AppUpdatesPanel } from "./panels/app-updates";
import { AppearancePanel } from "./panels/appearance";
import { ArchiveCleanupPanel } from "./panels/archive-cleanup";
import { ComponentsPanel } from "./panels/components";
import { ConductorImportPanel } from "./panels/conductor-import";
import { DevToolsPanel } from "./panels/dev-tools";
import { InboxSettingsPanel } from "./panels/inbox";
import { LocalLlmPanel } from "./panels/local-llm";
import { MobileCompanionPanel } from "./panels/mobile-companion";
import { ProvidersPanel } from "./panels/providers";
import { RepositorySettingsPanel } from "./panels/repository-settings";

const FALLBACK_EFFORT_LEVELS = ["low", "medium", "high"];

const NOTIFICATION_SOUND_OPTIONS = VALID_NOTIFICATION_SOUNDS.map((value) => ({
	value,
	label: NOTIFICATION_SOUND_LABELS[value],
})) satisfies readonly { value: NotificationSound; label: string }[];

export type { ContextProviderTab, SettingsSection } from "./types";

import type { ContextProviderTab, SettingsSection } from "./types";

/// Sections whose caption surfaces a one-liner next to the dialog title.
/// Lets a panel surface a one-liner without rendering its own header
/// row (which otherwise duplicates the section name).
const SECTIONS_WITH_CAPTION: SettingsSection[] = ["account", "inbox"];

type SectionTranslate = ReturnType<typeof useTranslation>["t"];

function sidebarSectionLabel(
	section: SettingsSection,
	repos: RepositoryCreateOption[],
	t: SectionTranslate,
): string {
	if (section.startsWith("repo:")) {
		const repoId = section.slice(5);
		return (
			repos.find((r) => r.id === repoId)?.name ?? t("nav.repositoryFallback")
		);
	}
	// Each fixed section has an explicit, human-curated label so the
	// nav reads naturally in every locale (no capitalize-the-key hack).
	return t(`nav.sections.${section}`);
}

function titleSectionLabel(
	section: SettingsSection,
	repos: RepositoryCreateOption[],
	t: SectionTranslate,
): string {
	return sidebarSectionLabel(section, repos, t);
}

export const SettingsDialog = memo(function SettingsDialog({
	open,
	workspaceId,
	workspaceRepoId,
	initialSection,
	initialInboxProvider,
	onClose,
}: {
	open: boolean;
	workspaceId: string | null;
	workspaceRepoId: string | null;
	initialSection?: SettingsSection;
	initialInboxProvider?: ContextProviderTab;
	onClose: () => void;
}) {
	const { t } = useTranslation(["settings", "common"]);
	const { settings, updateSettings } = useSettings();
	const queryClient = useQueryClient();
	const [activeSection, setActiveSection] =
		useState<SettingsSection>("general");
	const [conductorEnabled, setConductorEnabled] = useState(false);

	useEffect(() => {
		if (open && initialSection) {
			setActiveSection(initialSection);
		}
	}, [open, initialSection]);

	const reposQuery = useQuery({
		...repositoriesQueryOptions(),
		enabled: open,
	});
	const repositories = reposQuery.data ?? [];
	const modelSectionsQuery = useQuery({
		...agentModelSectionsQueryOptions(),
		enabled: open,
	});
	const modelSections = modelSectionsQuery.data ?? [];
	const allModels = modelSections.flatMap((s) => s.options);

	// Note: null review/pr model fields used to be promoted to default
	// values here on every dialog open. That migration now runs once in
	// `materialize_review_pr_model_defaults` (src-tauri/src/schema.rs) at
	// schema upgrade time. Consumers fall back to `?? settings.defaultX`
	// for the brief window between first-time default-set and next
	// cold-start, which is what the existing UI bindings already do.

	useEffect(() => {
		if (open) {
			void isConductorAvailable().then(setConductorEnabled);
		}
	}, [open]);

	const isDev = import.meta.env.DEV;

	const fixedSections: SettingsSection[] = [
		"general",
		"appearance",
		"model",
		"providers",
		"shortcuts",
		...(conductorEnabled ? (["import"] as const) : []),
		"account",
		"inbox",
		"experimental",
		// Developer is intentionally last in the fixed group — it sits
		// directly above the dynamic repository entries in the sidebar
		// (so the bottom of the static nav reads: experimental →
		// developer → <repos>). Hidden in non-dev builds.
		...(isDev ? (["developer"] as const) : []),
	];

	const activeRepoId = activeSection.startsWith("repo:")
		? activeSection.slice(5)
		: null;
	const activeRepo = activeRepoId
		? repositories.find((r) => r.id === activeRepoId)
		: null;

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="h-[min(80vh,640px)] w-[min(80vw,860px)] max-w-[860px] overflow-hidden rounded-2xl border-border/60 bg-settings-content p-0 shadow-2xl sm:max-w-[860px]">
				<SidebarProvider className="flex h-full min-h-0 w-full min-w-0 gap-0 overflow-hidden">
					{/* Nav sidebar */}
					<nav className="scrollbar-stable flex w-[200px] shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r border-sidebar-border bg-settings-nav py-6">
						<SidebarGroup>
							<SidebarGroupContent>
								<SidebarMenu>
									{fixedSections.map((section) => (
										<SidebarMenuItem key={section}>
											<SidebarMenuButton
												isActive={activeSection === section}
												onClick={() => setActiveSection(section)}
											>
												{sidebarSectionLabel(section, repositories, t)}
											</SidebarMenuButton>
										</SidebarMenuItem>
									))}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>

						{repositories.length > 0 && (
							<>
								<SidebarSeparator />
								<SidebarGroup>
									<SidebarGroupLabel>{t("nav.repositories")}</SidebarGroupLabel>
									<SidebarGroupContent>
										<SidebarMenu>
											{repositories.map((repo) => {
												const key: SettingsSection = `repo:${repo.id}`;
												return (
													<SidebarMenuItem key={key}>
														<SidebarMenuButton
															isActive={activeSection === key}
															onClick={() => setActiveSection(key)}
														>
															{repo.repoIconSrc ? (
																<img
																	src={repo.repoIconSrc}
																	alt=""
																	className="size-4 shrink-0 rounded"
																/>
															) : (
																<span className="flex size-4 shrink-0 items-center justify-center rounded bg-muted text-nano font-semibold uppercase text-muted-foreground">
																	{repo.repoInitials?.slice(0, 2)}
																</span>
															)}
															<span>{repo.name}</span>
														</SidebarMenuButton>
													</SidebarMenuItem>
												);
											})}
										</SidebarMenu>
									</SidebarGroupContent>
								</SidebarGroup>
							</>
						)}
					</nav>

					{/* Main content */}
					<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
						{/* Header */}
						<div className="flex items-baseline gap-3 border-b border-border/40 px-8 py-4">
							<DialogTitle className="text-title font-semibold text-foreground">
								{activeRepo
									? activeRepo.name
									: titleSectionLabel(activeSection, repositories, t)}
							</DialogTitle>
							{!activeRepo && SECTIONS_WITH_CAPTION.includes(activeSection) ? (
								<span className="truncate text-small text-muted-foreground/70">
									{t(`nav.captions.${activeSection}`)}
								</span>
							) : null}
						</div>

						{/* Content area — `scrollbar-stable` reserves the scrollbar
						    gutter so expanding/collapsing a provider row (which
						    toggles the vertical scrollbar) never reflows the body
						    width, matching the nav's stable gutter. */}
						<div className="scrollbar-stable min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-8 pt-1 pb-6">
							{activeSection === "general" && (
								<SettingsGroup>
									<SettingsRow
										title={t("general.notifications.title")}
										description={t("general.notifications.description")}
									>
										<Switch
											checked={settings.notifications}
											onCheckedChange={(checked) =>
												updateSettings({ notifications: checked })
											}
										/>
									</SettingsRow>
									<SettingsRow
										title={t("general.notificationSound.title")}
										description={t("general.notificationSound.description")}
									>
										<div className="flex items-center gap-1.5">
											<SettingsSelect<NotificationSound>
												value={settings.notificationSound}
												options={NOTIFICATION_SOUND_OPTIONS}
												onChange={(next) =>
													updateSettings({ notificationSound: next })
												}
												disabled={!settings.notifications}
												ariaLabel={t("general.notificationSound.aria")}
											/>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												aria-label={t("general.notificationSound.testAria")}
												className="size-8"
												disabled={
													!settings.notifications ||
													settings.notificationSound === "off"
												}
												onClick={() =>
													playNotificationSound(settings.notificationSound)
												}
											>
												<Volume2
													className="size-4 text-muted-foreground"
													strokeWidth={1.8}
												/>
											</Button>
										</div>
									</SettingsRow>
									<SettingsRow
										title={t("general.terminalHoverExpansion.title")}
										description={t(
											"general.terminalHoverExpansion.description",
										)}
									>
										<Switch
											checked={settings.terminalHoverExpansion}
											onCheckedChange={(checked) =>
												updateSettings({ terminalHoverExpansion: checked })
											}
										/>
									</SettingsRow>
									<SettingsRow
										title={t("general.terminalMode.title")}
										releaseMarker={{ kind: "feature" }}
										description={t("general.terminalMode.description")}
									>
										<Switch
											checked={settings.enableTerminalMode}
											onCheckedChange={(checked) =>
												updateSettings({ enableTerminalMode: checked })
											}
										/>
									</SettingsRow>
									<SettingsRow
										title={t("general.alwaysShowContextUsage.title")}
										description={t(
											"general.alwaysShowContextUsage.description",
										)}
									>
										<Switch
											checked={settings.alwaysShowContextUsage}
											onCheckedChange={(checked) =>
												updateSettings({ alwaysShowContextUsage: checked })
											}
										/>
									</SettingsRow>
									<SettingsRow
										title={t("general.usageStats.title")}
										description={t("general.usageStats.description")}
									>
										<Switch
											checked={settings.showUsageStats}
											onCheckedChange={(checked) =>
												updateSettings({ showUsageStats: checked })
											}
										/>
									</SettingsRow>
									<SettingsRow
										title={t("general.autoArchiveOnMerge.title")}
										description={t("general.autoArchiveOnMerge.description")}
									>
										<Switch
											checked={settings.autoArchiveOnMerge}
											onCheckedChange={(checked) =>
												updateSettings({ autoArchiveOnMerge: checked })
											}
										/>
									</SettingsRow>
									<SettingsRow
										title={t("general.followUpBehavior.title")}
										description={
											<>
												{t("general.followUpBehavior.description")}
												{(() => {
													const toggleHotkey = getShortcut(
														settings.shortcuts,
														"composer.toggleFollowUpBehavior",
													);
													if (!toggleHotkey) return null;
													// Split the localized sentence around the |shortcut|
													// marker so the live shortcut chip can render inline
													// regardless of word order in each locale.
													const [before, after] = t(
														"general.followUpBehavior.pressToInvert",
														{ shortcut: " " },
													).split(" ");
													return (
														<>
															{" "}
															{before}
															<InlineShortcutDisplay
																hotkey={toggleHotkey}
																className="align-baseline text-muted-foreground"
															/>
															{after}
														</>
													);
												})()}
											</>
										}
									>
										<ToggleGroup
											type="single"
											value={settings.followUpBehavior}
											onValueChange={(value) => {
												if (value === "queue" || value === "steer") {
													updateSettings({ followUpBehavior: value });
												}
											}}
											className="gap-1"
										>
											<ToggleGroupItem
												value="queue"
												aria-label={t("general.followUpBehavior.queue")}
												className="h-7 rounded-md px-2.5 text-small font-medium text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground"
											>
												{t("general.followUpBehavior.queue")}
											</ToggleGroupItem>
											<ToggleGroupItem
												value="steer"
												aria-label={t("general.followUpBehavior.steer")}
												className="h-7 rounded-md px-2.5 text-small font-medium text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground"
											>
												{t("general.followUpBehavior.steer")}
											</ToggleGroupItem>
										</ToggleGroup>
									</SettingsRow>
									<SettingsRow
										title={
											<span className="inline-flex items-center gap-1.5">
												{t("general.claudeThinking.title")}
												{/* SettingsDialog renders outside AppShell's
												 *  TooltipProvider tree, so panels need their
												 *  own — same pattern as repository-settings /
												 *  cursor-provider. */}
												<TooltipProvider>
													<Tooltip>
														<TooltipTrigger asChild>
															<HelpCircle
																className="size-3 cursor-help text-muted-foreground/70"
																strokeWidth={1.8}
															/>
														</TooltipTrigger>
														<TooltipContent
															side="top"
															className="max-w-[320px] text-left"
														>
															<div className="space-y-1.5">
																<div>
																	<span className="font-medium">
																		{t(
																			"general.claudeThinking.tooltip.summarizedLabel",
																		)}
																	</span>
																	{" — "}
																	{t(
																		"general.claudeThinking.tooltip.summarizedBody",
																	)}
																</div>
																<div>
																	<span className="font-medium">
																		{t(
																			"general.claudeThinking.tooltip.omittedLabel",
																		)}
																	</span>
																	{" — "}
																	{t(
																		"general.claudeThinking.tooltip.omittedBody",
																	)}
																</div>
															</div>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											</span>
										}
										description={t("general.claudeThinking.description")}
									>
										<ToggleGroup
											type="single"
											value={settings.claudeThinkingDisplay}
											onValueChange={(value) => {
												if (value === "summarized" || value === "omitted") {
													updateSettings({
														claudeThinkingDisplay:
															value as ClaudeThinkingDisplay,
													});
												}
											}}
											className="gap-1"
										>
											<ToggleGroupItem
												value="summarized"
												aria-label={t("general.claudeThinking.summarized")}
												className="h-7 rounded-md px-2.5 text-small font-medium text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground"
											>
												{t("general.claudeThinking.summarized")}
											</ToggleGroupItem>
											<ToggleGroupItem
												value="omitted"
												aria-label={t("general.claudeThinking.omitted")}
												className="h-7 rounded-md px-2.5 text-small font-medium text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground"
											>
												{t("general.claudeThinking.omitted")}
											</ToggleGroupItem>
										</ToggleGroup>
									</SettingsRow>
									<ArchiveCleanupPanel />
									<AppUpdatesPanel />
									<ComponentsPanel />
								</SettingsGroup>
							)}

							{activeSection === "shortcuts" && (
								<ShortcutsSettingsPanel
									overrides={settings.shortcuts}
									onChange={(shortcuts) => updateSettings({ shortcuts })}
								/>
							)}

							{activeSection === "appearance" && (
								<AppearancePanel
									settings={settings}
									updateSettings={updateSettings}
								/>
							)}

							{activeSection === "model" && (
								<SettingsGroup>
									<ModelSettingRow
										title={t("model.default.title")}
										description={t("model.default.description")}
										models={allModels}
										modelSections={modelSections}
										isLoadingModels={modelSectionsQuery.isPending}
										// Each row reads its own state directly. The `?? default*`
										// fallbacks here only cover the brief moment between
										// dialog open and `hasMaterialized` running — once the
										// migration lands, stored values are explicit and these
										// fallbacks no-op.
										modelId={settings.defaultModelId}
										effort={settings.defaultEffort}
										fastMode={settings.defaultFastMode}
										ariaPrefix="Default"
										onChange={(p) => {
											const patch: Partial<AppSettings> = {};
											if (p.modelId !== undefined)
												patch.defaultModelId = p.modelId;
											if (p.effort !== undefined)
												patch.defaultEffort = p.effort;
											if (p.fastMode !== undefined)
												patch.defaultFastMode = p.fastMode;
											void updateSettings(patch);
										}}
									/>
									<ModelSettingRow
										title={t("model.review.title")}
										description={t("model.review.description")}
										models={allModels}
										modelSections={modelSections}
										isLoadingModels={modelSectionsQuery.isPending}
										modelId={settings.reviewModelId ?? settings.defaultModelId}
										effort={settings.reviewEffort ?? settings.defaultEffort}
										fastMode={
											settings.reviewFastMode ?? settings.defaultFastMode
										}
										ariaPrefix="Review"
										onChange={(p) => {
											const patch: Partial<AppSettings> = {};
											if (p.modelId !== undefined)
												patch.reviewModelId = p.modelId;
											if (p.effort !== undefined) patch.reviewEffort = p.effort;
											if (p.fastMode !== undefined)
												patch.reviewFastMode = p.fastMode;
											void updateSettings(patch);
										}}
									/>
									<ModelSettingRow
										title={t("model.action.title")}
										description={t("model.action.description")}
										models={allModels}
										modelSections={modelSections}
										isLoadingModels={modelSectionsQuery.isPending}
										modelId={settings.prModelId ?? settings.defaultModelId}
										effort={settings.prEffort ?? settings.defaultEffort}
										fastMode={settings.prFastMode ?? settings.defaultFastMode}
										ariaPrefix="Action"
										onChange={(p) => {
											const patch: Partial<AppSettings> = {};
											if (p.modelId !== undefined) patch.prModelId = p.modelId;
											if (p.effort !== undefined) patch.prEffort = p.effort;
											if (p.fastMode !== undefined)
												patch.prFastMode = p.fastMode;
											void updateSettings(patch);
										}}
									/>
								</SettingsGroup>
							)}

							{activeSection === "providers" && <ProvidersPanel />}

							{activeSection === "experimental" && (
								<SettingsGroup>
									<LocalLlmPanel
										settings={settings}
										updateSettings={updateSettings}
									/>
									<MobileCompanionPanel />
								</SettingsGroup>
							)}

							{activeSection === "import" && <ConductorImportPanel />}

							{activeSection === "developer" && <DevToolsPanel />}

							{activeSection === "account" && <AccountPanel />}

							{activeSection === "inbox" && (
								<InboxSettingsPanel
									repositories={repositories}
									initialProvider={initialInboxProvider}
								/>
							)}

							{activeRepo && (
								<RepositorySettingsPanel
									repo={activeRepo}
									workspaceId={
										activeRepo.id === workspaceRepoId ? workspaceId : null
									}
									onRepoSettingsChanged={() => {
										void queryClient.invalidateQueries({
											queryKey: grexQueryKeys.repositories,
										});
										requestSidebarReconcile(queryClient);
										// Invalidate all workspace detail caches so
										// open panels pick up the new remote/branch.
										void queryClient.invalidateQueries({
											predicate: (q) => q.queryKey[0] === "workspaceDetail",
										});
									}}
									onRepoDeleted={() => {
										setActiveSection("general");
										void queryClient.invalidateQueries({
											queryKey: grexQueryKeys.repositories,
										});
										requestSidebarReconcile(queryClient);
									}}
								/>
							)}
						</div>
					</div>
				</SidebarProvider>
			</DialogContent>
		</Dialog>
	);
});

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

/// Effort levels come from live model metadata, so the set isn't closed.
/// Known levels (low/medium/high/xhigh) get curated translations; anything
/// else falls back to a capitalized raw value so a new backend level still
/// renders sensibly.
function effortLabel(level: string): string {
	const known = ["low", "medium", "high", "xhigh"];
	if (known.includes(level)) {
		return i18n.t(`settings:model.effort.${level}`);
	}
	return level.charAt(0).toUpperCase() + level.slice(1);
}

type ModelRowChange = {
	modelId?: string;
	effort?: string;
	fastMode?: boolean;
};

/// One row of the Model settings panel: model picker + effort picker + fast
/// mode switch. Shared by Default / Review / PR-MR rows so they all carry the
/// same clamp + display logic. Each row is fully independent — the parent
/// passes its row's own (modelId, effort, fastMode) and gets back a partial
/// patch on any change.
function ModelSettingRow({
	title,
	description,
	models,
	modelSections,
	isLoadingModels,
	modelId,
	effort,
	fastMode,
	ariaPrefix,
	onChange,
}: {
	title: string;
	description: string;
	models: AgentModelOption[];
	modelSections: AgentModelSection[];
	isLoadingModels: boolean;
	modelId: string | null;
	effort: string | null;
	fastMode: boolean;
	ariaPrefix: string;
	onChange: (patch: ModelRowChange) => void;
}) {
	const { t } = useTranslation(["settings", "common"]);
	const selected = findModelOption(modelSections, modelId);
	// Key off real model metadata — Haiku reports `effortLevels: []`, and
	// the wire format may also drop the field entirely when empty. Either
	// way `?.length ?? 0` resolves to 0 → disabled. The fallback list only
	// keeps the dropdown from rendering empty while metadata is loading.
	const supportsEffort = (selected?.effortLevels?.length ?? 0) > 0;
	const effortLevels = supportsEffort
		? (selected?.effortLevels ?? FALLBACK_EFFORT_LEVELS)
		: FALLBACK_EFFORT_LEVELS;
	const supportsFastMode = selected?.supportsFastMode === true;
	const label =
		selected?.label ??
		(isLoadingModels ? t("common:state.loading") : t("model.selectModel"));
	const displayEffort = effort ?? "high";

	// Auto-clamp effort when model changes — but only after model metadata
	// has actually loaded, otherwise the fallback levels silently kill
	// max/xhigh.
	useEffect(() => {
		if (!selected) return;
		if (!effort) return;
		if (effortLevels.length > 0 && !effortLevels.includes(effort)) {
			onChange({ effort: clampEffort(effort, effortLevels) });
		}
	}, [selected, effort, effortLevels, onChange]);

	return (
		<SettingsRow title={title} description={description}>
			<div className="flex w-[360px] items-center gap-2">
				<DropdownMenu>
					<DropdownMenuTrigger
						className={cn(
							"flex h-8 cursor-interactive items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 text-ui text-foreground hover:bg-muted/50",
							"min-w-0 flex-1 gap-1.5",
						)}
					>
						<span className="flex min-w-0 items-center gap-1.5">
							<ModelIcon model={selected} className="size-[13px] shrink-0" />
							<span className="min-w-0 truncate whitespace-nowrap">
								{label}
							</span>
						</span>
						<ChevronDown className="size-3 shrink-0 opacity-40" />
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						sideOffset={4}
						className="min-w-[10rem]"
					>
						{models.map((m) => (
							<DropdownMenuItem
								key={m.id}
								onClick={() => onChange({ modelId: m.id })}
								className="justify-between gap-2"
							>
								<span className="flex min-w-0 items-center gap-2">
									<ModelIcon model={m} className="size-4" />
									{m.label}
								</span>
								<CheckCircle2
									className={cn(
										"size-3.5 shrink-0 text-emerald-500",
										m.id !== modelId && "invisible",
									)}
								/>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				<DropdownMenu>
					<DropdownMenuTrigger
						disabled={!supportsEffort}
						className={cn(
							"flex h-8 items-center rounded-lg border border-border/50 bg-muted/30 px-3 text-ui",
							"shrink-0 gap-1.5",
							supportsEffort
								? "cursor-interactive text-foreground hover:bg-muted/50"
								: "cursor-not-allowed text-muted-foreground opacity-60",
						)}
					>
						<span>{effortLabel(displayEffort)}</span>
						<ChevronDown className="size-3 opacity-40" />
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						sideOffset={4}
						className="min-w-[8rem]"
					>
						{effortLevels.map((l) => (
							<DropdownMenuItem key={l} onClick={() => onChange({ effort: l })}>
								{effortLabel(l)}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				<div
					className={cn(
						"flex h-8 cursor-interactive items-center rounded-lg border border-border/50 bg-muted/30 px-3 text-ui text-foreground hover:bg-muted/50",
						"shrink-0 gap-2",
					)}
				>
					<span
						className={
							supportsFastMode
								? "text-ui text-foreground"
								: "text-ui text-muted-foreground"
						}
					>
						{t("model.fastMode")}
					</span>
					<Switch
						checked={supportsFastMode && fastMode}
						disabled={!supportsFastMode}
						onCheckedChange={(checked) => onChange({ fastMode: checked })}
						aria-label={t("model.fastModeAria", { prefix: ariaPrefix })}
					/>
				</div>
			</div>
		</SettingsRow>
	);
}

export function SettingsButton({
	onClick,
	shortcut,
}: {
	onClick: () => void;
	shortcut?: string | null;
}) {
	const { t } = useTranslation("settings");
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={onClick}
					className="text-muted-foreground hover:text-foreground"
				>
					<Settings className="size-[15px]" strokeWidth={1.8} />
				</Button>
			</TooltipTrigger>
			<TooltipContent
				side="top"
				sideOffset={4}
				className="flex h-[24px] items-center gap-2 rounded-md px-2 text-small leading-none"
			>
				<span className="leading-none">{t("nav.settings")}</span>
				{shortcut ? (
					<InlineShortcutDisplay
						hotkey={shortcut}
						className="text-background/60"
					/>
				) : null}
			</TooltipContent>
		</Tooltip>
	);
}
