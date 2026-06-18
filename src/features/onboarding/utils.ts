import { i18n } from "@/lib/i18n";

export function basename(path: string): string {
	const normalized = path.replace(/\/+$/, "");
	const value = normalized.split(/[\\/]/).pop();
	return value && value.length > 0
		? value
		: i18n.t("onboarding:fallback.localProject");
}

export function repositoryNameFromUrl(url: string): string {
	const withoutTrailingSlash = url.trim().replace(/\/+$/, "");
	const name = withoutTrailingSlash
		.split("/")
		.pop()
		?.replace(/\.git$/, "");
	return name && name.length > 0
		? name
		: i18n.t("onboarding:fallback.githubRepository");
}
