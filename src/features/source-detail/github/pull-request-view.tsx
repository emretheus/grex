import { useTranslation } from "react-i18next";
import {
	GitHubDetailPage,
	type SourceDetailProps,
	toRefreshControl,
	useInboxItemDetailQuery,
} from "../common";

export function GitHubPullRequestView({
	card,
	appendContextTarget,
}: SourceDetailProps) {
	const { t } = useTranslation("sourceDetail");
	const detailRef =
		card.detailRef?.source === "github_pr" ? card.detailRef : null;
	const detailQuery = useInboxItemDetailQuery(detailRef, card.id);
	const detail =
		detailQuery.data?.type === "github_pr" ? detailQuery.data.data : null;

	return (
		<GitHubDetailPage
			card={card}
			appendContextTarget={appendContextTarget}
			description={detail?.body ?? undefined}
			error={detailQuery.error}
			isLoading={detailQuery.isLoading}
			kindLabel={t("kind.pullRequest")}
			refresh={detailRef ? toRefreshControl(detailQuery) : undefined}
		/>
	);
}
