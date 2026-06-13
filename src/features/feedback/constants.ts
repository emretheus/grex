/** Upstream grex repository — hardcoded. Users never configure this. */
export const GREX_UPSTREAM_OWNER = "emretheus";
export const GREX_UPSTREAM_REPO = "grex";
export const GREX_UPSTREAM_SLUG = `${GREX_UPSTREAM_OWNER}/${GREX_UPSTREAM_REPO}`;
export const GREX_UPSTREAM_HTML_URL = `https://github.com/${GREX_UPSTREAM_SLUG}`;

/** Max characters we auto-derive from user input when generating an issue title. */
export const ISSUE_TITLE_MAX_CHARS = 30;

/** Fallback title when the user's input is empty after trimming. */
export const FALLBACK_ISSUE_TITLE = "Grex feedback";
