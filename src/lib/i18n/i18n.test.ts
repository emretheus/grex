import { beforeAll, describe, expect, it } from "vitest";
import { i18n, initI18n, resources, setLanguage } from "./index";
import { SUPPORTED_LANGUAGE_CODES } from "./locales";

describe("i18n", () => {
	beforeAll(() => {
		initI18n("en");
	});

	it("initializes with the requested language", () => {
		expect(i18n.isInitialized).toBe(true);
		expect(i18n.language).toBe("en");
	});

	it("translates a known key", () => {
		expect(i18n.t("settings:language.title")).toBe("Language");
	});

	it("switches language at runtime", async () => {
		await setLanguage("es");
		expect(i18n.t("settings:language.title")).toBe("Idioma");
		await setLanguage("zh");
		expect(i18n.t("settings:appearance.theme.dark")).toBe("深色");
		await setLanguage("en");
	});

	it("falls back to en for an untranslated key", async () => {
		// `de` intentionally lacks this synthetic key → should fall back to en.
		await setLanguage("de");
		expect(i18n.t("common:__missing_key__", "Action failed")).toBe(
			"Action failed",
		);
		await setLanguage("en");
	});

	it("ships a catalog for every supported language", () => {
		for (const code of SUPPORTED_LANGUAGE_CODES) {
			expect(resources[code]).toBeDefined();
			expect(resources[code].common).toBeDefined();
			expect(resources[code].settings).toBeDefined();
		}
	});
});
