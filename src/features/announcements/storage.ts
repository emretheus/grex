import { compareSemver } from "./announcements";

/**
 * Watermark: the highest release version the user has dismissed
 * announcements for. Anything ≤ this is treated as dismissed.
 */
export const LAST_DISMISSED_RELEASE_VERSION_STORAGE_KEY =
	"codewit:last-dismissed-release-version";

export const LAST_SEEN_INSTALL_VERSION_STORAGE_KEY =
	"codewit:last-seen-install-version";

/**
 * Best-effort detection of "this device has never run Codewit before".
 * We can't ask `LAST_SEEN_INSTALL_VERSION_STORAGE_KEY` directly — it's a
 * brand-new key, so existing users look identical to new users from its
 * point of view. Instead we look for older Codewit keys that pre-date
 * the announcement system: `codewit-theme` is the most reliable signal
 * because it's read synchronously on every boot to avoid splash flash,
 * so any user who has opened a recent Codewit build has it set.
 *
 * Edge: a user who manually nukes localStorage will look "fresh" on
 * their next boot. Acceptable — they'd also lose dismiss state, theme,
 * etc., so missing one onboarding toast is the least of it.
 */
export function isFirstCodewitBoot(): boolean {
	try {
		return (
			window.localStorage.getItem("codewit-theme") === null &&
			window.localStorage.getItem("codewit-dark-theme") === null
		);
	} catch {
		// Storage access blocked — fail closed (assume not fresh) so we
		// at least try to show the toast instead of silently skipping.
		return false;
	}
}

export function readLastDismissedReleaseVersion(): string | null {
	try {
		const raw = window.localStorage.getItem(
			LAST_DISMISSED_RELEASE_VERSION_STORAGE_KEY,
		);
		return typeof raw === "string" && raw.length > 0 ? raw : null;
	} catch {
		return null;
	}
}

export function dismissReleaseAnnouncement(releaseVersion: string): void {
	const current = readLastDismissedReleaseVersion();
	if (current !== null && compareSemver(releaseVersion, current) <= 0) return;
	try {
		window.localStorage.setItem(
			LAST_DISMISSED_RELEASE_VERSION_STORAGE_KEY,
			releaseVersion,
		);
	} catch (error) {
		console.error(
			"[codewit] failed to save release announcement dismissal",
			error,
		);
	}
}

export function readLastSeenInstallVersion(): string | null {
	try {
		const raw = window.localStorage.getItem(
			LAST_SEEN_INSTALL_VERSION_STORAGE_KEY,
		);
		return typeof raw === "string" && raw.length > 0 ? raw : null;
	} catch {
		return null;
	}
}

export function writeLastSeenInstallVersion(version: string): void {
	try {
		window.localStorage.setItem(LAST_SEEN_INSTALL_VERSION_STORAGE_KEY, version);
	} catch (error) {
		console.error("[codewit] failed to save last seen install version", error);
	}
}
