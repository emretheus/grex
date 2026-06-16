import { memo } from "react";
import type { ComposerInsertTarget } from "@/lib/composer-insert";
import type { ContextCard } from "@/lib/sources/types";
import { FeaturebasePostView } from "./featurebase/issue-view";
import { ForgejoIssueView } from "./forgejo/issue-view";
import { GitHubDiscussionView } from "./github/discussion-view";
import { GitHubIssueView } from "./github/issue-view";
import { GitHubPullRequestView } from "./github/pull-request-view";
import { GitLabIssueView } from "./gitlab/issue-view";
import { GitLabMergeRequestView } from "./gitlab/merge-request-view";
import { JiraIssueView } from "./jira/issue-view";
import { LinearIssueView } from "./linear/issue-view";
import { PlainThreadView } from "./plain/issue-view";
import { SlackThreadView } from "./slack/thread-view";
import { TrelloCardView } from "./trello/issue-view";

// `memo` keeps the markdown render in `GitHubDetailPage` from re-running
// when the surrounding start page changes state. Once a card is open and the
// detail data has been fetched, the only reason to re-render is when the
// `card` reference itself changes.
export const SourceDetailView = memo(function SourceDetailView({
	card,
	appendContextTarget,
	onStartWorkspace,
}: {
	card: ContextCard;
	appendContextTarget?: ComposerInsertTarget;
	onStartWorkspace?: (card: ContextCard) => void;
}) {
	switch (card.source) {
		case "github_issue":
			return (
				<GitHubIssueView
					card={card}
					appendContextTarget={appendContextTarget}
				/>
			);
		case "github_pr":
			return (
				<GitHubPullRequestView
					card={card}
					appendContextTarget={appendContextTarget}
				/>
			);
		case "github_discussion":
			return (
				<GitHubDiscussionView
					card={card}
					appendContextTarget={appendContextTarget}
				/>
			);
		case "gitlab_issue":
			return (
				<GitLabIssueView
					card={card}
					appendContextTarget={appendContextTarget}
				/>
			);
		case "gitlab_mr":
			return (
				<GitLabMergeRequestView
					card={card}
					appendContextTarget={appendContextTarget}
				/>
			);
		case "slack_thread":
			return (
				<SlackThreadView
					card={card}
					appendContextTarget={appendContextTarget}
				/>
			);
		case "linear":
			return (
				<LinearIssueView
					card={card}
					appendContextTarget={appendContextTarget}
					onStartWorkspace={onStartWorkspace}
				/>
			);
		case "jira":
			return (
				<JiraIssueView
					card={card}
					appendContextTarget={appendContextTarget}
					onStartWorkspace={onStartWorkspace}
				/>
			);
		case "trello":
			return (
				<TrelloCardView
					card={card}
					appendContextTarget={appendContextTarget}
					onStartWorkspace={onStartWorkspace}
				/>
			);
		case "forgejo":
			return (
				<ForgejoIssueView
					card={card}
					appendContextTarget={appendContextTarget}
					onStartWorkspace={onStartWorkspace}
				/>
			);
		case "featurebase":
			return (
				<FeaturebasePostView
					card={card}
					appendContextTarget={appendContextTarget}
					onStartWorkspace={onStartWorkspace}
				/>
			);
		case "plain":
			return (
				<PlainThreadView
					card={card}
					appendContextTarget={appendContextTarget}
					onStartWorkspace={onStartWorkspace}
				/>
			);
	}
});
