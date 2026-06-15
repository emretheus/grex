import type { RepositoryCreateOption } from "@/lib/api";
import type { ContextCard } from "@/lib/sources/types";

/** Repo-configured branch prefix (`emre/`, a custom literal, or none).
 *  Single source of truth shared by the start surface's "create branch"
 *  dialog and the "Start workspace from issue" branch seeder. */
export function defaultBranchPrefix(
	repo: RepositoryCreateOption | null,
): string {
	if (!repo) return "";
	switch (repo.branchPrefixType ?? null) {
		case "username":
			return repo.forgeLogin ? `${repo.forgeLogin}/` : "";
		case "custom":
			return repo.branchPrefixCustom ?? "";
		case "none":
			return "";
		default:
			return repo.forgeLogin ? `${repo.forgeLogin}/` : "";
	}
}

/** Slug a free-text string into git-branch-safe characters: lowercase,
 *  non-alphanumerics collapsed to single hyphens, trimmed. */
function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

const MAX_SLUG_LENGTH = 48;

/** Derive a branch name from a Linear issue card: `<prefix><identifier>-<title>`,
 *  e.g. `emre/eng-123-fix-flaky-login`. The identifier leads so the branch
 *  is greppable back to the issue; the title slug is best-effort and the
 *  whole slug is length-capped. Falls back to the card's externalId when
 *  the meta isn't Linear. */
export function buildIssueBranchName(
	card: ContextCard,
	repo: RepositoryCreateOption | null,
): string {
	const identifier =
		card.meta.type === "linear" ? card.meta.identifier : card.externalId;
	const idSlug = slugify(identifier);
	const titleSlug = slugify(card.title);
	const combined = titleSlug ? `${idSlug}-${titleSlug}` : idSlug;
	const slug = combined.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "");
	return `${defaultBranchPrefix(repo)}${slug}`;
}
