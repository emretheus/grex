import { useQuery } from "@tanstack/react-query";
import {
	CircleDot,
	GitPullRequest,
	LifeBuoy,
	Lightbulb,
	MessagesSquare,
	Pickaxe,
	Plus,
	Smartphone,
} from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	ForgejoBrandIcon,
	GithubBrandIcon,
	GitlabBrandIcon,
	JiraBrandIcon,
	LinearBrandIcon,
	SlackBrandIcon,
	TrelloBrandIcon,
} from "@/components/brand-icon";
import { Button } from "@/components/ui/button";
import { SlackConnectState } from "@/features/inbox/slack-connect-button";
import { useSlackWorkspaces } from "@/features/inbox/use-slack-workspaces";
import { FeaturebaseSettingsPanel } from "@/features/settings/panels/featurebase-settings";
import { ForgejoSettingsPanel } from "@/features/settings/panels/forgejo-settings";
import { JiraSettingsPanel } from "@/features/settings/panels/jira-settings";
import { LinearSettingsPanel } from "@/features/settings/panels/linear-settings";
import { PlainSettingsPanel } from "@/features/settings/panels/plain-settings";
import { TrelloSettingsPanel } from "@/features/settings/panels/trello-settings";
import type {
	ForgeProvider,
	InboxKind,
	InboxKindLabels,
	RepositoryCreateOption,
} from "@/lib/api";
import { forgeLabelsFor } from "@/lib/forge-labels";
import {
	parseForgeRepoFilter,
	parseForgeRepoHost,
} from "@/lib/forge-repo-filter";
import { i18n } from "@/lib/i18n";
import {
	forgeLabelsQueryOptions,
	inboxKindLabelsQueryOptions,
} from "@/lib/query-client";
import {
	DEFAULT_INBOX_ACCOUNT_TOGGLES,
	DEFAULT_INBOX_REPO_CONFIG,
	type InboxAccountSourceToggles,
	type InboxDraftFilter,
	type InboxIssueScope,
	type InboxPullRequestScope,
	type InboxRepoSourceConfig,
	type InboxSort,
	type InboxSourceConfig,
	useSettings,
} from "@/lib/settings";

/** Defensive default — `appSettings` may have been loaded from a session
 * persisted before this field existed (HMR or pre-migration users). */
const EMPTY_INBOX_CONFIG: InboxSourceConfig = { accounts: {} };

import { useForgeAccountsAll } from "@/lib/use-forge-accounts";
import { cn } from "@/lib/utils";
import { SettingsGroup, SettingsRow } from "../components/settings-row";
import type { ContextProviderTab } from "../types";
import {
	LabelMultiSelect,
	type Option,
	RepoPicker,
	ScopeMultiSelect,
	SettingsSelect,
} from "./inbox/inbox-controls";
import {
	ContextConfigRow,
	ContextKindSection,
} from "./inbox/inbox-section-layout";

/** Storage key shape used by the inbox settings map: `<provider>:<login>`.
 * Keep the shape stable — the future Tauri command that fetches inbox
 * items will look up toggles by the same key. */
function accountConfigKey(provider: string, login: string): string {
	return `${provider}:${login}`;
}

type ToggleField = "issues" | "prs" | "discussions";
type ConfigField = keyof Omit<
	InboxRepoSourceConfig,
	"enabled" | "issues" | "prs" | "discussions"
>;

// Type lives in ../types so the shell event bus can carry it.

const PROVIDER_TABS: {
	id: ContextProviderTab;
	label: string;
	icon: ReactNode;
}[] = [
	{ id: "github", label: "GitHub", icon: <GithubBrandIcon size={13} /> },
	{ id: "gitlab", label: "GitLab", icon: <GitlabBrandIcon size={13} /> },
	// Slack ships before Linear since it's the only non-forge provider
	// with a real settings flow (connect / connected) — Linear is still
	// "Coming Soon" copy.
	{ id: "slack", label: "Slack", icon: <SlackBrandIcon size={13} /> },
	{ id: "linear", label: "Linear", icon: <LinearBrandIcon size={13} /> },
	{ id: "jira", label: "Jira", icon: <JiraBrandIcon size={13} /> },
	{ id: "trello", label: "Trello", icon: <TrelloBrandIcon size={13} /> },
	{ id: "forgejo", label: "Forgejo", icon: <ForgejoBrandIcon size={13} /> },
	{
		id: "featurebase",
		label: "Featurebase",
		icon: <Lightbulb className="size-3.5" strokeWidth={2} />,
	},
	{
		id: "plain",
		label: "Plain",
		icon: <LifeBuoy className="size-3.5" strokeWidth={2} />,
	},
	{
		id: "mobile",
		label: "Mobile",
		icon: <Smartphone className="size-3.5" strokeWidth={2} />,
	},
];

/** Tabs that still don't have any settings UI of their own and fall back
 *  to the generic "Coming Soon" placeholder. Slack and Linear graduated:
 *  Slack reuses `<SlackConnectState>` via `<SlackSettingsPanel>`, and
 *  Linear takes a personal API key through `<LinearSettingsPanel>`. Only
 *  Mobile remains here. */
type ComingSoonProvider = Exclude<
	ContextProviderTab,
	| "github"
	| "gitlab"
	| "slack"
	| "linear"
	| "jira"
	| "trello"
	| "forgejo"
	| "featurebase"
	| "plain"
>;

const COMING_SOON_COPY: Record<ComingSoonProvider, string[]> = {
	mobile: [
		"comingSoon.mobile.line1",
		"comingSoon.mobile.line2",
		"comingSoon.mobile.line3",
	],
};

const GITHUB_ISSUE_SCOPE_OPTIONS: Option<InboxIssueScope>[] = [
	{ value: "all", label: "settings.scopeOptions.all" },
	{ value: "involves", label: "settings.scopeOptions.involves" },
	{ value: "assigned", label: "settings.scopeOptions.assigned" },
	{ value: "mentioned", label: "settings.scopeOptions.mentioned" },
	{ value: "created", label: "settings.scopeOptions.created" },
];

const GITHUB_PR_SCOPE_OPTIONS: Option<InboxPullRequestScope>[] = [
	{ value: "all", label: "settings.scopeOptions.all" },
	{ value: "involves", label: "settings.scopeOptions.involves" },
	{ value: "reviewRequested", label: "settings.scopeOptions.reviewRequested" },
	{ value: "author", label: "settings.scopeOptions.author" },
	{ value: "assignee", label: "settings.scopeOptions.assignee" },
	{ value: "mentions", label: "settings.scopeOptions.mentions" },
	{ value: "reviewedBy", label: "settings.scopeOptions.reviewedBy" },
];

/** GitLab REST exposes a smaller scope surface than GitHub's search
 *  query syntax: only `created_by_me` / `assigned_to_me` / `all`. The
 *  backend (`apply_scope_filter_*` in `forge::gitlab::inbox`) honors
 *  the first selected scope and falls back to "all" otherwise. We
 *  surface the supported subset here so the UI doesn't promise filters
 *  the API can't deliver. */
const GITLAB_ISSUE_SCOPE_OPTIONS: Option<InboxIssueScope>[] = [
	{ value: "all", label: "settings.scopeOptions.all" },
	{ value: "assigned", label: "settings.scopeOptions.assigned" },
	{ value: "created", label: "settings.scopeOptions.created" },
];

const GITLAB_PR_SCOPE_OPTIONS: Option<InboxPullRequestScope>[] = [
	{ value: "all", label: "settings.scopeOptions.all" },
	{ value: "assignee", label: "settings.scopeOptions.assignee" },
	{ value: "author", label: "settings.scopeOptions.author" },
];

const SORT_OPTIONS: Option<InboxSort>[] = [
	{ value: "updated", label: "settings.sortOptions.updated" },
	{ value: "created", label: "settings.sortOptions.created" },
	{ value: "comments", label: "settings.sortOptions.comments" },
];

const DRAFT_OPTIONS: Option<InboxDraftFilter>[] = [
	{ value: "exclude", label: "settings.draftOptions.exclude" },
	{ value: "include", label: "settings.draftOptions.include" },
	{ value: "only", label: "settings.draftOptions.only" },
];

/** Triggers App.tsx's settings-route handler to switch to the Accounts
 * panel from inside the Contexts panel — for the "Add account…" dropdown
 * footer. Reuses the same window event the Contexts sidebar uses, so the
 * route is single-source. */
function openAccountSettings() {
	window.dispatchEvent(
		new CustomEvent("grex:open-settings", {
			detail: { section: "account" },
		}),
	);
}

/** Map a settings tab id onto the `ForgeProvider` it represents.
 *  Only forge providers (github/gitlab) have inbox configuration here;
 *  other tabs render a Coming Soon panel. */
function tabToForgeProvider(tab: ContextProviderTab): ForgeProvider | null {
	if (tab === "github") return "github";
	if (tab === "gitlab") return "gitlab";
	return null;
}

function splitLabels(value: string): string[] {
	return value
		.split(",")
		.map((label) => label.trim())
		.filter(Boolean);
}

function joinLabels(labels: string[]): string {
	return labels.join(", ");
}

/** Join a set of plural-singular labels into prose: `[a]` → `a`,
 *  `[a, b]` → `a or b`, `[a, b, c]` → `a, b, or c`. Used for "issues
 *  or merge requests" / "issues, pull requests, or discussions" copy
 *  built dynamically from the backend's kind list. */
function joinSingularsAsList(items: string[]): string {
	if (items.length === 0) return i18n.t("inbox:settings.itemsFallback");
	if (items.length === 1) return items[0];
	if (items.length === 2) return `${items[0]} or ${items[1]}`;
	return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}

export function InboxSettingsPanel({
	repositories,
	initialProvider,
}: {
	repositories: RepositoryCreateOption[];
	initialProvider?: ContextProviderTab;
}) {
	const { t } = useTranslation("inbox");
	const localizeOptions = useCallback(
		<T extends string>(options: Option<T>[]): Option<T>[] =>
			options.map((option) => ({ ...option, label: t(option.label) })),
		[t],
	);
	const accountsQuery = useForgeAccountsAll();
	const { settings, updateSettings } = useSettings();
	const [activeProvider, setActiveProvider] = useState<ContextProviderTab>(
		initialProvider ?? "github",
	);
	// Re-sync on reopen with a new inbox tab.
	useEffect(() => {
		if (initialProvider) setActiveProvider(initialProvider);
	}, [initialProvider]);
	const activeForgeProvider = tabToForgeProvider(activeProvider);
	const isGithub = activeForgeProvider === "github";
	// Provider-level labels (provider name, "Connect GitHub" CTA, …)
	// come from the forge-labels mirror — same pattern as the Git Header.
	const activeForgeLabels = activeForgeProvider
		? forgeLabelsFor(activeForgeProvider)
		: null;
	// Inbox kind labels (Issues / PRs vs MRs / Pull requests vs Merge
	// requests / discussions-or-not) are backend-authoritative. The
	// frontend never branches on `isGithub`/`isGitlab` to choose copy.
	const kindLabelsQuery = useQuery({
		...inboxKindLabelsQueryOptions(activeForgeProvider ?? "github"),
		enabled: activeForgeProvider !== null,
	});
	const kindLabels = kindLabelsQuery.data ?? [];
	const labelsByKind = useMemo<Partial<Record<InboxKind, InboxKindLabels>>>(
		() => Object.fromEntries(kindLabels.map((entry) => [entry.kind, entry])),
		[kindLabels],
	);
	const issueLabels = labelsByKind.issues;
	const prLabels = labelsByKind.prs;
	const discussionLabels = labelsByKind.discussions;

	// Accounts the active forge tab can configure. Filtered by the
	// chosen provider so the dropdown / repo picker stays scoped.
	const forgeAccounts = useMemo(
		() =>
			(accountsQuery.data ?? []).filter(
				(a) => a.provider === activeForgeProvider,
			),
		[accountsQuery.data, activeForgeProvider],
	);

	const forgeRepositories = useMemo(
		() =>
			repositories
				.map((repository) => ({
					repository,
					repoFilter: parseForgeRepoFilter(repository),
				}))
				.filter(
					(
						entry,
					): entry is {
						repository: RepositoryCreateOption;
						repoFilter: string;
					} => {
						if (!entry.repoFilter) return false;
						const provider = entry.repository.forgeProvider;
						if (activeForgeProvider === "github") {
							return !provider || provider === "github";
						}
						if (activeForgeProvider === "gitlab") {
							return provider === "gitlab";
						}
						return false;
					},
				),
		[repositories, activeForgeProvider],
	);
	const [selectedRepoFilter, setSelectedRepoFilter] = useState<string | null>(
		null,
	);
	const effectiveRepoFilter =
		selectedRepoFilter &&
		forgeRepositories.some((entry) => entry.repoFilter === selectedRepoFilter)
			? selectedRepoFilter
			: (forgeRepositories[0]?.repoFilter ?? null);
	const selectedRepository =
		forgeRepositories.find((entry) => entry.repoFilter === effectiveRepoFilter)
			?.repository ?? null;
	const selectedAccount =
		forgeAccounts.find(
			(account) => account.login === selectedRepository?.forgeLogin,
		) ??
		forgeAccounts[0] ??
		null;
	const effectiveLogin = selectedAccount?.login ?? null;
	useEffect(() => {
		if (effectiveRepoFilter && effectiveRepoFilter !== selectedRepoFilter) {
			setSelectedRepoFilter(effectiveRepoFilter);
		}
	}, [effectiveRepoFilter, selectedRepoFilter]);
	// Forge-aware label query — both GitHub and GitLab go through the
	// same backend command, so the LabelMultiSelect doesn't need to
	// branch on provider. `host` is required for GitLab self-hosted;
	// GitHub ignores it.
	const labelsHost = parseForgeRepoHost(selectedRepository);
	const labelsQuery = useQuery({
		...forgeLabelsQueryOptions({
			provider: activeForgeProvider ?? "github",
			login: effectiveLogin ?? "",
			host: labelsHost,
			repos: effectiveRepoFilter ? [effectiveRepoFilter] : [],
		}),
		enabled:
			activeForgeProvider !== null &&
			Boolean(effectiveLogin) &&
			Boolean(effectiveRepoFilter),
	});
	const labelOptions = labelsQuery.data ?? [];

	// Defensive read: fall back to an empty config when the field is
	// missing on `settings` (e.g. legacy persisted state from before the
	// `inboxSourceConfig` field shipped, or a stale HMR snapshot).
	const inboxConfig: InboxSourceConfig =
		settings.inboxSourceConfig ?? EMPTY_INBOX_CONFIG;
	const accountKey = selectedAccount
		? accountConfigKey(selectedAccount.provider, selectedAccount.login)
		: null;
	const currentToggles: InboxAccountSourceToggles =
		(accountKey ? inboxConfig.accounts[accountKey] : undefined) ??
		DEFAULT_INBOX_ACCOUNT_TOGGLES;
	const currentRepoConfig: InboxRepoSourceConfig = (effectiveRepoFilter
		? currentToggles.repos?.[effectiveRepoFilter]
		: undefined) ?? { ...DEFAULT_INBOX_REPO_CONFIG, enabled: true };

	const setRepoConfig = useCallback(
		(nextRepoConfig: InboxRepoSourceConfig) => {
			if (!accountKey || !effectiveRepoFilter) return;
			void updateSettings({
				inboxSourceConfig: {
					...inboxConfig,
					accounts: {
						...inboxConfig.accounts,
						[accountKey]: {
							...currentToggles,
							repos: {
								...(currentToggles.repos ?? {}),
								[effectiveRepoFilter]: {
									...nextRepoConfig,
									enabled: true,
								},
							},
						},
					},
				},
			});
		},
		[
			accountKey,
			currentToggles,
			effectiveRepoFilter,
			inboxConfig,
			updateSettings,
		],
	);
	const setToggle = useCallback(
		(field: ToggleField, next: boolean) => {
			setRepoConfig({ ...currentRepoConfig, [field]: next });
		},
		[currentRepoConfig, setRepoConfig],
	);
	const setConfig = useCallback(
		<Field extends ConfigField>(
			field: Field,
			next: InboxRepoSourceConfig[Field],
		) => {
			setRepoConfig({ ...currentRepoConfig, [field]: next });
		},
		[currentRepoConfig, setRepoConfig],
	);

	return (
		<div className="space-y-3 pt-2">
			<ProviderTabs
				value={activeProvider}
				onChange={(provider) => setActiveProvider(provider)}
			/>

			{!activeForgeProvider ? (
				activeProvider === "slack" ? (
					<SlackSettingsPanel />
				) : activeProvider === "linear" ? (
					<LinearSettingsPanel />
				) : activeProvider === "jira" ? (
					<JiraSettingsPanel />
				) : activeProvider === "trello" ? (
					<TrelloSettingsPanel />
				) : activeProvider === "forgejo" ? (
					<ForgejoSettingsPanel />
				) : activeProvider === "featurebase" ? (
					<FeaturebaseSettingsPanel />
				) : activeProvider === "plain" ? (
					<PlainSettingsPanel />
				) : (
					<ProviderComingSoon provider={activeProvider as ComingSoonProvider} />
				)
			) : forgeAccounts.length === 0 ? (
				<div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 px-6 py-10 text-center">
					<div className="flex size-9 items-center justify-center rounded-lg border border-border/50 text-muted-foreground">
						{isGithub ? (
							<GithubBrandIcon size={18} />
						) : (
							<GitlabBrandIcon size={18} />
						)}
					</div>
					<div className="text-ui font-medium text-foreground">
						{t("settings.connectAccount", {
							provider: activeForgeLabels?.providerName,
						})}
					</div>
					<div className="max-w-[360px] text-small leading-5 text-muted-foreground">
						{t("settings.connectAccountDescription", {
							provider: activeForgeLabels?.providerName,
							kinds: joinSingularsAsList(
								kindLabels.map((entry) => `${entry.singular}s`),
							),
						})}
					</div>
					<Button
						type="button"
						size="sm"
						onClick={openAccountSettings}
						className="mt-1 cursor-interactive gap-1.5"
					>
						<Plus className="size-3.5" strokeWidth={2} />
						{t("settings.addAccount")}
					</Button>
				</div>
			) : (
				<SettingsGroup>
					<SettingsRow
						title={t("settings.repository")}
						description={t("settings.repositoryDescription")}
					>
						<RepoPicker
							repositories={forgeRepositories}
							selected={selectedRepository}
							onSelect={setSelectedRepoFilter}
						/>
					</SettingsRow>
					{effectiveRepoFilter ? (
						<div className="py-1">
							{issueLabels ? (
								<ContextKindSection
									title={issueLabels.plural}
									icon={<CircleDot className="size-3" strokeWidth={2} />}
									description={t("settings.issuesDescription", {
										plural: issueLabels.plural.toLowerCase(),
									})}
									enabled={currentRepoConfig.issues}
									onEnabledChange={(next) => setToggle("issues", next)}
								>
									<ContextConfigRow
										title={t("settings.scope")}
										description={t("settings.scopeDescription", {
											singular: issueLabels.singular,
											provider: activeForgeLabels?.providerName,
										})}
									>
										<ScopeMultiSelect
											value={currentRepoConfig.issueScopes}
											options={localizeOptions(
												isGithub
													? GITHUB_ISSUE_SCOPE_OPTIONS
													: GITLAB_ISSUE_SCOPE_OPTIONS,
											)}
											onChange={(value) => setConfig("issueScopes", value)}
										/>
									</ContextConfigRow>
									<ContextConfigRow
										title={t("settings.sort")}
										description={t("settings.sortDescription")}
									>
										<SettingsSelect
											value={currentRepoConfig.issueSort}
											options={localizeOptions(SORT_OPTIONS)}
											onChange={(value) => setConfig("issueSort", value)}
										/>
									</ContextConfigRow>
									<ContextConfigRow
										title={t("settings.labels")}
										description={t("settings.labelsDescription", {
											plural: issueLabels.plural.toLowerCase(),
										})}
									>
										<LabelMultiSelect
											value={splitLabels(currentRepoConfig.issueLabels)}
											options={labelOptions}
											loading={labelsQuery.isLoading || labelsQuery.isFetching}
											onChange={(value) =>
												setConfig("issueLabels", joinLabels(value))
											}
										/>
									</ContextConfigRow>
								</ContextKindSection>
							) : null}
							{prLabels ? (
								<ContextKindSection
									title={prLabels.plural}
									icon={<GitPullRequest className="size-3" strokeWidth={2} />}
									description={t("settings.prsDescription", {
										plural: prLabels.plural.toLowerCase(),
									})}
									enabled={currentRepoConfig.prs}
									onEnabledChange={(next) => setToggle("prs", next)}
								>
									<ContextConfigRow
										title={t("settings.scope")}
										description={t("settings.scopeDescription", {
											singular: prLabels.singular,
											provider: activeForgeLabels?.providerName,
										})}
									>
										<ScopeMultiSelect
											value={currentRepoConfig.prScopes}
											options={localizeOptions(
												isGithub
													? GITHUB_PR_SCOPE_OPTIONS
													: GITLAB_PR_SCOPE_OPTIONS,
											)}
											onChange={(value) => setConfig("prScopes", value)}
										/>
									</ContextConfigRow>
									<ContextConfigRow
										title={t("settings.drafts")}
										description={t("settings.draftsDescription", {
											plural: prLabels.plural.toLowerCase(),
										})}
									>
										<SettingsSelect
											value={currentRepoConfig.draftPrs}
											options={localizeOptions(DRAFT_OPTIONS)}
											onChange={(value) => setConfig("draftPrs", value)}
										/>
									</ContextConfigRow>
									<ContextConfigRow
										title={t("settings.sort")}
										description={t("settings.sortDescription")}
									>
										<SettingsSelect
											value={currentRepoConfig.prSort}
											options={localizeOptions(SORT_OPTIONS)}
											onChange={(value) => setConfig("prSort", value)}
										/>
									</ContextConfigRow>
									<ContextConfigRow
										title={t("settings.labels")}
										description={t("settings.labelsDescription", {
											plural: prLabels.plural.toLowerCase(),
										})}
									>
										<LabelMultiSelect
											value={splitLabels(currentRepoConfig.prLabels)}
											options={labelOptions}
											loading={labelsQuery.isLoading || labelsQuery.isFetching}
											onChange={(value) =>
												setConfig("prLabels", joinLabels(value))
											}
										/>
									</ContextConfigRow>
								</ContextKindSection>
							) : null}
							{discussionLabels ? (
								<ContextKindSection
									title={discussionLabels.plural}
									icon={<MessagesSquare className="size-3" strokeWidth={2} />}
									description={t("settings.discussionsDescription", {
										plural: discussionLabels.plural.toLowerCase(),
									})}
									enabled={currentRepoConfig.discussions}
									onEnabledChange={(next) => setToggle("discussions", next)}
								>
									<ContextConfigRow
										title={t("settings.sort")}
										description={t("settings.sortDescription")}
									>
										<SettingsSelect
											value={currentRepoConfig.discussionSort}
											options={localizeOptions(SORT_OPTIONS)}
											onChange={(value) => setConfig("discussionSort", value)}
										/>
									</ContextConfigRow>
								</ContextKindSection>
							) : null}
						</div>
					) : (
						<div className="py-8 text-center text-small text-muted-foreground">
							{t("settings.addRepoFirst", {
								provider: activeForgeLabels?.providerName,
							})}
						</div>
					)}
				</SettingsGroup>
			)}
		</div>
	);
}

function ProviderTabs({
	value,
	onChange,
}: {
	value: ContextProviderTab;
	onChange: (value: ContextProviderTab) => void;
}) {
	return (
		<div className="grid grid-cols-7 gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
			{PROVIDER_TABS.map((tab) => (
				<button
					key={tab.id}
					type="button"
					aria-pressed={value === tab.id}
					onClick={() => onChange(tab.id)}
					className={cn(
						"flex h-8 cursor-interactive items-center justify-center gap-1.5 rounded-md px-2 text-small font-medium text-muted-foreground transition-[background-color,color,box-shadow]",
						"hover:bg-accent/60 hover:text-foreground",
						value === tab.id && "bg-accent text-foreground shadow-xs",
					)}
				>
					{tab.icon}
					<span className="truncate">{tab.label}</span>
				</button>
			))}
		</div>
	);
}

function ProviderComingSoon({ provider }: { provider: ComingSoonProvider }) {
	const { t } = useTranslation("inbox");
	return (
		<div className="flex min-h-[360px] w-full items-center justify-center px-3 py-8">
			<div className="flex w-full max-w-[380px] flex-col items-stretch text-muted-foreground/65">
				<div className="flex items-center justify-center gap-2">
					<Pickaxe
						className="inbox-coming-soon-pickaxe size-3.5 shrink-0"
						strokeWidth={2}
					/>
					<span className="text-ui font-medium">{t("comingSoon.title")}</span>
				</div>
				<div className="my-7 flex items-center gap-2 px-2">
					<div className="h-px flex-1 bg-border" />
					<div className="size-0.5 rounded-full bg-border" />
					<div className="h-px flex-1 bg-border" />
				</div>
				<ul className="mx-auto list-disc space-y-3 pl-4 text-left text-pretty text-mini leading-4 marker:text-muted-foreground/35">
					{COMING_SOON_COPY[provider].map((lineKey) => (
						<li key={lineKey}>{t(lineKey)}</li>
					))}
				</ul>
			</div>
		</div>
	);
}

/** Slack tab content inside Settings → Context.
 *
 *  No real settings to expose yet (filter / sort / per-channel toggles
 *  are future work); this slot just mirrors the inbox empty-state
 *  connect flow when zero workspaces are connected, and acknowledges
 *  success otherwise. Reuses `<SlackConnectState>` so the import
 *  affordance is identical on both surfaces. */
function SlackSettingsPanel() {
	const { t } = useTranslation("inbox");
	const workspacesQuery = useSlackWorkspaces();
	const connectedCount = workspacesQuery.data?.length ?? 0;
	if (connectedCount === 0) {
		// Constrain the connect card to the settings panel slot — its
		// default `min-h-[calc(100vh-200px)]` is sized for the inbox
		// sidebar's full viewport and would over-stretch here.
		return <SlackConnectState className="min-h-[360px]" />;
	}
	return (
		<div className="flex min-h-[360px] w-full items-center justify-center px-6 text-center">
			<p className="text-small text-muted-foreground/65">
				{connectedCount === 1
					? t("settings.slackConnected")
					: t("settings.slackConnectedCount", { count: connectedCount })}
			</p>
		</div>
	);
}

// `LinearSettingsPanel` lives in `./linear-settings` — it owns the
// per-workspace scope toggle + team/project filters + multi-connect flow.
