/** Upstream codewit repository — hardcoded. Users never configure this. */
export const CODEWIT_UPSTREAM_OWNER = "dohooo";
export const CODEWIT_UPSTREAM_REPO = "codewit";
export const CODEWIT_UPSTREAM_SLUG = `${CODEWIT_UPSTREAM_OWNER}/${CODEWIT_UPSTREAM_REPO}`;
export const CODEWIT_UPSTREAM_HTML_URL = `https://github.com/${CODEWIT_UPSTREAM_SLUG}`;

/** Max characters we auto-derive from user input when generating an issue title. */
export const ISSUE_TITLE_MAX_CHARS = 30;

/** Fallback title when the user's input is empty after trimming. */
export const FALLBACK_ISSUE_TITLE = "Codewit feedback";
