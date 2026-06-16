export type ContextCardSource =
	| "linear"
	| "jira"
	| "trello"
	| "forgejo"
	| "featurebase"
	| "plain"
	| "github_issue"
	| "github_pr"
	| "github_discussion"
	| "gitlab_issue"
	| "gitlab_mr"
	| "slack_thread";

export type ContextCardForgeSource = Extract<
	ContextCardSource,
	| "github_issue"
	| "github_pr"
	| "github_discussion"
	| "gitlab_issue"
	| "gitlab_mr"
>;

export type ContextCardStateTone =
	| "open"
	| "closed"
	| "merged"
	| "draft"
	| "answered"
	| "unanswered"
	| "urgent"
	| "neutral";

export type ContextCardForgeDetailRef = {
	provider: "github" | "gitlab";
	login: string;
	source: ContextCardForgeSource;
	externalId: string;
};

export type ContextCard = {
	id: string;
	source: ContextCardSource;
	externalId: string;
	externalUrl: string;
	title: string;
	subtitle?: string;
	state?: { label: string; tone: ContextCardStateTone };
	lastActivityAt: number;
	detailRef?: ContextCardForgeDetailRef;
	meta: ContextCardMeta;
};

export type LinearIssueMeta = {
	type: "linear";
	/** Which connected workspace this issue came from — needed to route the
	 *  detail fetch to the right API key. */
	connectionId: string;
	/** Org display name, shown as a badge when >1 workspace is connected. */
	workspaceName?: string;
	identifier: string;
	priorityLabel: string;
	team: { name: string; key: string };
	project?: { name: string; color: string };
	labels: { name: string; color: string }[];
};

export type JiraIssueMeta = {
	type: "jira";
	/** Which connected site produced this issue — routes the detail fetch. */
	connectionId: string;
	/** Site host, shown as a badge when >1 site is connected. */
	siteName?: string;
	issueType: string;
	priority?: string;
	projectName: string;
	labels: string[];
};

export type TrelloCardMeta = {
	type: "trello";
	/** Which connected Trello account produced this card. */
	connectionId: string;
	boardName: string;
	listName: string;
	labels: { name: string; color: string }[];
};

export type ForgejoIssueMeta = {
	type: "forgejo";
	/** Which connected instance produced this issue — routes the detail fetch. */
	connectionId: string;
	/** Instance host, shown as a badge when >1 instance is connected. */
	hostName?: string;
	/** Repository `owner/name`. */
	repo: string;
	number: number;
	labels: { name: string; color: string }[];
};

export type FeaturebasePostMeta = {
	type: "featurebase";
	/** Which connected org produced this post — routes the detail fetch. */
	connectionId: string;
	/** Org feedback host, shown as a badge when >1 org is connected. */
	orgName?: string;
	board: string;
	upvotes: number;
};

export type PlainThreadMeta = {
	type: "plain";
	/** Which connected workspace produced this thread — routes detail fetch. */
	connectionId: string;
	/** Workspace name, shown as a badge when >1 workspace is connected. */
	workspaceName?: string;
	customerName: string;
	priority?: string;
};

export type GitHubIssueMeta = {
	type: "github_issue";
	repo: string;
	number: number;
	labels: { name: string; color: string }[];
};

export type GitHubPRMeta = {
	type: "github_pr";
	repo: string;
	number: number;
	additions: number;
	deletions: number;
	changedFiles: number;
	ciStatus?: "success" | "failure" | "pending" | "neutral";
};

export type GitHubDiscussionMeta = {
	type: "github_discussion";
	repo: string;
	number: number;
	category: { name: string; emoji: string };
};

export type GitLabIssueMeta = {
	type: "gitlab_issue";
	/** GitLab project full path (`group/sub/project`). */
	repo: string;
	number: number;
	labels: { name: string; color: string }[];
};

export type GitLabMRMeta = {
	type: "gitlab_mr";
	repo: string;
	number: number;
	draft: boolean;
};

export type SlackThreadMeta = {
	type: "slack_thread";
	workspaceName: string;
	channelName: string;
	rootAuthor: { name: string };
};

export type ContextCardMeta =
	| LinearIssueMeta
	| JiraIssueMeta
	| TrelloCardMeta
	| ForgejoIssueMeta
	| FeaturebasePostMeta
	| PlainThreadMeta
	| GitHubIssueMeta
	| GitHubPRMeta
	| GitHubDiscussionMeta
	| GitLabIssueMeta
	| GitLabMRMeta
	| SlackThreadMeta;
