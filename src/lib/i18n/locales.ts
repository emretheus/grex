// Registry of the languages Grex ships with. Kept free of any i18next /
// React imports so it can be consumed from `settings.ts` (boot path) and the
// i18n instance alike without creating an import cycle.
import { de, enUS, es, fr, ja, type Locale, zhCN } from "date-fns/locale";

export type SupportedLanguage = "en" | "zh" | "es" | "de" | "fr" | "ja";

export type LanguageDescriptor = {
	code: SupportedLanguage;
	/** Native endonym shown in the language picker (never translated). */
	label: string;
	/** Locale object passed to date-fns formatters. */
	dateFnsLocale: Locale;
};

/// Display order in the language picker. English first, then by rough
/// global developer-population reach.
export const SUPPORTED_LANGUAGES: readonly LanguageDescriptor[] = [
	{ code: "en", label: "English", dateFnsLocale: enUS },
	{ code: "zh", label: "中文", dateFnsLocale: zhCN },
	{ code: "es", label: "Español", dateFnsLocale: es },
	{ code: "de", label: "Deutsch", dateFnsLocale: de },
	{ code: "fr", label: "Français", dateFnsLocale: fr },
	{ code: "ja", label: "日本語", dateFnsLocale: ja },
];

export const SUPPORTED_LANGUAGE_CODES: readonly SupportedLanguage[] =
	SUPPORTED_LANGUAGES.map((l) => l.code);

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

export function isSupportedLanguage(
	value: unknown,
): value is SupportedLanguage {
	return (
		typeof value === "string" &&
		SUPPORTED_LANGUAGE_CODES.includes(value as SupportedLanguage)
	);
}

/** Resolve the date-fns locale for a language code, falling back to en-US. */
export function getDateFnsLocale(code: string): Locale {
	return (
		SUPPORTED_LANGUAGES.find((l) => l.code === code)?.dateFnsLocale ?? enUS
	);
}
