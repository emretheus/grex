import { useTranslation } from "react-i18next";
import {
	GitHubDetailPage,
	type SourceDetailProps,
	toRefreshControl,
	useInboxItemDetailQuery,
} from "../common";

export function GitLabIssueView({
	card,
	appendContextTarget,
}: SourceDetailProps) {
	const { t } = useTranslation("sourceDetail");
	const detailRef =
		card.detailRef?.source === "gitlab_issue" ? card.detailRef : null;
	const detailQuery = useInboxItemDetailQuery(detailRef, card.id);
	const detail =
		detailQuery.data?.type === "gitlab_issue" ? detailQuery.data.data : null;

	return (
		<GitHubDetailPage
			card={card}
			appendContextTarget={appendContextTarget}
			description={detail?.body ?? undefined}
			error={detailQuery.error}
			isLoading={detailQuery.isLoading}
			kindLabel={t("kind.issue")}
			refresh={detailRef ? toRefreshControl(detailQuery) : undefined}
		/>
	);
}
