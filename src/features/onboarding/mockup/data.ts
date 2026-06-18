import type {
	ActionStatusKind,
	GroupTone,
	InspectorFileStatus,
	WorkspaceBranchTone,
} from "./ui/shared";

/**
 * Mock data fed into the mockup-private `.ui.tsx` primitives. Types come
 * from `./ui/shared` (mockup-private string literals), NOT from
 * `@/lib/api` — that's how we keep the onboarding preview from breaking
 * when production types evolve.
 *
 * User-visible strings are stored as i18next keys (under the `onboarding`
 * namespace) rather than literal English. The mockup consumers translate
 * them at render via `t(...)`, so the preview is localized in all six
 * supported languages. Identifier-like values (branch names, file paths,
 * repo initials, provider ids) stay literal.
 */

export type MockWorkspaceRow = {
	id: string;
	title: string;
	branch: string;
	repoInitials: string;
	branchTone: WorkspaceBranchTone;
	hasUnread?: boolean;
	isSending?: boolean;
	isSelected?: boolean;
	state?: "active" | "archived";
	status?: "backlog" | "in-progress" | "review" | "done" | "canceled";
	/**
	 * When true, this row is a spotlight target during the `cliSplitSpotlight`
	 * onboarding pass — used to highlight the three workspaces the assistant
	 * just spun up via `grex workspace new` so the punch-through effect
	 * draws the eye to them.
	 */
	cliSplitTarget?: boolean;
};

export type MockWorkspaceGroup = {
	id: string;
	label: string;
	tone: GroupTone;
	rows: MockWorkspaceRow[];
};

export type MockSession = {
	id: string;
	title: string;
	provider: "claude" | "codex";
	active?: boolean;
	unread?: boolean;
	streaming?: boolean;
};

export type MockMessagePart =
	| { type: "reasoning"; label: string }
	| { type: "todo"; items: Array<{ label: string; done?: boolean }> }
	| {
			type: "tool";
			name: string;
			detail: string;
			/**
			 * When true, this tool call is a spotlight target during the
			 * `cliSplitSpotlight` onboarding pass — paired with the matching
			 * sidebar row so both render as the same bright island under the
			 * mask.
			 */
			cliSplitTarget?: boolean;
	  }
	| { type: "text"; text: string };

export type MockMessage =
	| { id: string; role: "user"; text: string }
	| { id: string; role: "assistant"; parts: MockMessagePart[] };

export type MockChangeItem = {
	name: string;
	path: string;
	status: InspectorFileStatus;
	insertions?: number;
	deletions?: number;
};

export type MockActionStatus = {
	/** i18next key (onboarding namespace) for the row label. */
	label: string;
	/** Interpolation values for the label key (e.g. `{ count }`). */
	labelValues?: Record<string, string | number>;
	status: ActionStatusKind;
	/** i18next key for the optional right-aligned action link. */
	action?: string;
};

export const mockSidebar: {
	selectedWorkspaceId: string;
	groups: MockWorkspaceGroup[];
} = {
	selectedWorkspaceId: "workspace-auth-main",
	groups: [
		{
			id: "done",
			label: "mockup.sidebar.groups.done",
			tone: "done",
			rows: [
				{
					id: "workspace-release",
					title: "mockup.sidebar.workspaces.release",
					branch: "release/v1.2",
					repoInitials: "HE",
					branchTone: "merged",
				},
			],
		},
		{
			id: "review",
			label: "mockup.sidebar.groups.review",
			tone: "review",
			rows: [
				{
					id: "workspace-settings",
					title: "mockup.sidebar.workspaces.settings",
					branch: "review/settings",
					repoInitials: "ST",
					branchTone: "open",
					hasUnread: true,
				},
			],
		},
		{
			id: "progress",
			label: "mockup.sidebar.groups.progress",
			tone: "progress",
			rows: [
				{
					id: "workspace-auth-main",
					title: "mockup.sidebar.workspaces.authPlan",
					branch: "feature/user-auth",
					repoInitials: "UA",
					branchTone: "working",
					isSending: true,
					isSelected: true,
				},
				{
					id: "workspace-auth-db",
					title: "mockup.sidebar.workspaces.authDb",
					branch: "feature/user-auth-db",
					repoInitials: "DB",
					branchTone: "working",
					cliSplitTarget: true,
				},
				{
					id: "workspace-auth-be",
					title: "mockup.sidebar.workspaces.authBe",
					branch: "feature/user-auth-be",
					repoInitials: "BE",
					branchTone: "working",
					cliSplitTarget: true,
				},
				{
					id: "workspace-auth-fe",
					title: "mockup.sidebar.workspaces.authFe",
					branch: "feature/user-auth-fe",
					repoInitials: "FE",
					branchTone: "working",
					cliSplitTarget: true,
				},
			],
		},
		{
			id: "backlog",
			label: "mockup.sidebar.groups.backlog",
			tone: "backlog",
			rows: [
				{
					id: "workspace-cleanup",
					title: "mockup.sidebar.workspaces.cleanup",
					branch: "task/api-cleanup",
					repoInitials: "AC",
					branchTone: "inactive",
				},
			],
		},
	],
};

export const mockConversation: {
	branch: string;
	branchTone: WorkspaceBranchTone;
	targetBranch: { remote: string; branch: string };
	sessions: MockSession[];
	messages: MockMessage[];
} = {
	branch: "feature/user-auth",
	branchTone: "working" as WorkspaceBranchTone,
	targetBranch: { remote: "origin", branch: "main" },
	sessions: [
		{
			id: "session-plan",
			title: "mockup.conversation.sessions.planSplit",
			provider: "claude",
			active: true,
		},
		{
			id: "session-contracts",
			title: "mockup.conversation.sessions.refineContracts",
			provider: "codex",
			unread: true,
			streaming: true,
		},
	],
	messages: [
		{
			id: "user-1",
			role: "user",
			text: "mockup.conversation.userPrompt",
		},
		{
			id: "assistant-1",
			role: "assistant",
			parts: [
				{ type: "reasoning", label: "mockup.conversation.reasoning" },
				{
					type: "tool",
					name: "Bash",
					detail: "grex workspace new --repo grex  # DB",
					cliSplitTarget: true,
				},
				{
					type: "tool",
					name: "Bash",
					detail: "grex workspace new --repo grex  # backend",
					cliSplitTarget: true,
				},
				{
					type: "tool",
					name: "Bash",
					detail: "grex workspace new --repo grex  # frontend",
					cliSplitTarget: true,
				},
				{
					type: "text",
					text: "mockup.conversation.assistantReply",
				},
			],
		},
	],
};

export const mockInspector: {
	changes: MockChangeItem[];
	gitActions: MockActionStatus[];
	reviewActions: MockActionStatus[];
} = {
	changes: [
		{
			name: "0042_user_auth.sql",
			path: "migrations/0042_user_auth.sql",
			status: "A",
			insertions: 86,
		},
		{
			name: "users_seed.sql",
			path: "seed/users_seed.sql",
			status: "A",
			insertions: 24,
		},
		{
			name: "schema.ts",
			path: "src/db/schema.ts",
			status: "M",
			insertions: 12,
			deletions: 4,
		},
	],
	gitActions: [
		{
			label: "mockup.inspector.changes",
			labelValues: { count: 3 },
			status: "pending",
			action: "mockup.inspector.commit",
		},
		{
			label: "mockup.inspector.branchUnpublished",
			status: "pending",
			action: "mockup.inspector.push",
		},
		{ label: "mockup.inspector.upToDate", status: "success" },
	],
	reviewActions: [
		{ label: "mockup.inspector.waitingForReview", status: "pending" },
	],
};
