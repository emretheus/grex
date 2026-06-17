// Single i18next instance for the desktop app. Catalogs are bundled
// statically (six small locales) so the first paint is already localized
// with no async flash; revisit lazy loading only if bundle size warrants it.
import i18n, { type Resource } from "i18next";
import { initReactI18next } from "react-i18next";
import {
	DEFAULT_LANGUAGE,
	isSupportedLanguage,
	SUPPORTED_LANGUAGE_CODES,
	type SupportedLanguage,
} from "./locales";

export const defaultNS = "common";

// Eagerly bundle every catalog under src/locales/<lng>/<ns>.json. Adding a new
// namespace or locale file is picked up automatically — no edits needed here.
const catalogModules = import.meta.glob<{ default: Record<string, unknown> }>(
	"../../locales/*/*.json",
	{ eager: true },
);

export const resources: Resource = (() => {
	const built: Resource = {};
	for (const [path, mod] of Object.entries(catalogModules)) {
		const match = path.match(/\/locales\/([^/]+)\/([^/]+)\.json$/);
		if (!match) continue;
		const [, lng, ns] = match;
		const langResources = built[lng] ?? {};
		langResources[ns] = mod.default;
		built[lng] = langResources;
	}
	return built;
})();

/** Namespaces available to `useTranslation`. Derived from the en catalog. */
export const namespaces = Object.keys(resources.en ?? {});

/**
 * Initialize the shared i18n instance. Idempotent — safe to call once at
 * boot with the preloaded language. Pass the synchronously-read language
 * preference so first paint matches the user's choice.
 */
export function initI18n(language: string): typeof i18n {
	if (!i18n.isInitialized) {
		const lng = isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE;
		void i18n.use(initReactI18next).init({
			resources,
			lng,
			fallbackLng: DEFAULT_LANGUAGE,
			supportedLngs: SUPPORTED_LANGUAGE_CODES as string[],
			ns: namespaces,
			defaultNS,
			interpolation: { escapeValue: false },
			returnNull: false,
		});
		if (typeof document !== "undefined") {
			document.documentElement.lang = lng;
		}
	}
	return i18n;
}

/** Switch the active language at runtime and reflect it on <html lang>. */
export async function setLanguage(language: SupportedLanguage): Promise<void> {
	// Guard against a not-yet-initialized instance (e.g. unit tests that render
	// components without booting through `main.tsx`).
	if (!i18n.isInitialized) return;
	if (i18n.language !== language) {
		await i18n.changeLanguage(language);
	}
	if (typeof document !== "undefined") {
		document.documentElement.lang = language;
	}
}

export { i18n };
