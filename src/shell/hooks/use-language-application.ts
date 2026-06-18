// Side-effect hook that mirrors the `language` setting into the live i18n
// instance whenever it changes (e.g. the user picks a new language in
// Settings). The initial language is set synchronously at boot in
// `main.tsx`; this keeps runtime changes in sync without a reload.
import { useEffect } from "react";
import { setLanguage } from "@/lib/i18n";
import type { SupportedLanguage } from "@/lib/i18n/locales";

export function useLanguageApplication(language: SupportedLanguage): void {
	useEffect(() => {
		void setLanguage(language);
	}, [language]);
}
