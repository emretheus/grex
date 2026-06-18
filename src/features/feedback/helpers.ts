import { i18n } from "@/lib/i18n";

import {
	FALLBACK_ISSUE_TITLE,
	GREX_UPSTREAM_SLUG,
	ISSUE_TITLE_MAX_CHARS,
} from "./constants";

/**
 * Split the user's feedback into a `(title, body)` pair for the GitHub issue
 * API. Short input becomes the title alone; longer input has the first chunk
 * as title and the remainder as body. Unicode-aware so CJK characters aren't
 * sliced mid-codepoint.
 */
export function splitIssueTitleAndBody(input: string): {
	title: string;
	body: string;
} {
	const trimmed = input.trim();
	if (!trimmed) {
		return { title: FALLBACK_ISSUE_TITLE, body: "" };
	}
	const chars = Array.from(trimmed);
	if (chars.length <= ISSUE_TITLE_MAX_CHARS) {
		return { title: trimmed, body: "" };
	}
	const title = chars.slice(0, ISSUE_TITLE_MAX_CHARS).join("");
	const body = chars.slice(ISSUE_TITLE_MAX_CHARS).join("").trimStart();
	return { title, body };
}

/**
 * Default prompt template sent to the agent when a user picks "Quick fix".
 * Embeds the user's feedback AND the full contribution lifecycle so the user
 * never has to re-explain "commit, push, open a PR" later — the agent
 * already knows the whole shape of the task on turn 1.
 */
export function buildPromptTemplate(input: string): string {
	return [
		i18n.t("feedback:template.intro", { slug: GREX_UPSTREAM_SLUG }),
		"",
		i18n.t("feedback:template.feedbackHeading"),
		input.trim(),
		"",
		i18n.t("feedback:template.howToHeading"),
		i18n.t("feedback:template.step1"),
		i18n.t("feedback:template.step2"),
		i18n.t("feedback:template.step3", { slug: GREX_UPSTREAM_SLUG }),
		"",
		i18n.t("feedback:template.replyInLanguage"),
	].join("\n");
}
