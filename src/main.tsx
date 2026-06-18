import React from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import App from "./App";
import { initDevReactScan } from "./lib/dev-react-scan";
import { i18n, initI18n } from "./lib/i18n";
import { getPreloadedLanguage } from "./lib/settings";

initDevReactScan();

// Initialize i18n synchronously with the persisted language so the first
// paint is already localized (no English flash before SQLite settings load).
initI18n(getPreloadedLanguage());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<I18nextProvider i18n={i18n} defaultNS="common">
			<App />
		</I18nextProvider>
	</React.StrictMode>,
);
