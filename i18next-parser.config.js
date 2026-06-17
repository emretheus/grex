// Extracts `t("key")` usages from the frontend into the en source catalogs.
// The en/ JSON files are the source of truth; other locales are translated
// from them. Missing keys fall back to en at runtime, so partial catalogs
// are safe to ship.
//
// Usage: `bun run i18n:extract`
export default {
	input: ["src/**/*.{ts,tsx}"],
	output: "src/locales/$LOCALE/$NAMESPACE.json",
	locales: ["en", "zh", "es", "de", "fr", "ja"],
	defaultNamespace: "common",
	// Keep existing translations; only add newly-discovered keys.
	keepRemoved: false,
	// Nested keys use "." — matches the catalog shape (appearance.theme.title).
	keySeparator: ".",
	namespaceSeparator: ":",
	// Don't overwrite non-en translations with the en source text; leave them
	// empty so missing entries are easy to spot (and fall back to en).
	defaultValue: (locale, _namespace, key) => (locale === "en" ? key : ""),
	sort: true,
	createOldCatalogs: false,
	indentation: "\t",
	lineEnding: "lf",
};
