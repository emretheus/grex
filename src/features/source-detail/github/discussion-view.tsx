import { useTranslation } from "react-i18next";
import {
	GitHubDetailPage,
	type SourceDetailProps,
	toRefreshControl,
	useInboxItemDetailQuery,
} from "../common";

export function GitHubDiscussionView({
	card,
	appendContextTarget,
}: SourceDetailProps) {
	const { t } = useTranslation("sourceDetail");
	const detailRef =
		card.detailRef?.source === "github_discussion" ? card.detailRef : null;
	const detailQuery = useInboxItemDetailQuery(detailRef, card.id);
	const detail =
		detailQuery.data?.type === "github_discussion"
			? detailQuery.data.data
			: null;

	return (
		<GitHubDetailPage
			card={card}
			appendContextTarget={appendContextTarget}
			description={detail?.body ?? undefined}
			error={detailQuery.error}
			isLoading={detailQuery.isLoading}
			kindLabel={t("kind.discussion")}
			refresh={detailRef ? toRefreshControl(detailQuery) : undefined}
		/>
	);
}
