// FILE: monacoSetup.ts
// Purpose: One-time Monaco environment bootstrap for the in-app editor — wires the
//          web workers (Vite `?worker` imports) and keeps the Monaco theme synced to
//          Codewit's active light/dark variant.
// Layer: Web editor infrastructure
// Depends on: monaco-editor, the root `.dark` class managed by useTheme.

import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

let bootstrapped = false;

/**
 * Resolve the Monaco theme name for the current root variant. Codewit toggles a
 * `.dark` class on <html> (see useTheme), so we mirror that into Monaco's built-in
 * `vs` / `vs-dark` themes.
 */
function resolveMonacoTheme(): "vs" | "vs-dark" {
  if (typeof document === "undefined") return "vs-dark";
  return document.documentElement.classList.contains("dark") ? "vs-dark" : "vs";
}

/**
 * Wire Monaco's web workers and theme observer exactly once. Safe to call from
 * every editor mount — subsequent calls are no-ops.
 */
export function ensureMonacoSetup(): typeof monaco {
  if (bootstrapped) return monaco;
  bootstrapped = true;

  // Vite-compatible worker wiring: each language ships its own worker bundle.
  self.MonacoEnvironment = {
    getWorker(_workerId, label) {
      switch (label) {
        case "json":
          return new JsonWorker();
        case "css":
        case "scss":
        case "less":
          return new CssWorker();
        case "html":
        case "handlebars":
        case "razor":
          return new HtmlWorker();
        case "typescript":
        case "javascript":
          return new TsWorker();
        default:
          return new EditorWorker();
      }
    },
  };

  monaco.editor.setTheme(resolveMonacoTheme());

  // Keep Monaco in step with theme changes (system toggle or user theme switch).
  if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
    const observer = new MutationObserver(() => {
      monaco.editor.setTheme(resolveMonacoTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme-variant"],
    });
  }

  return monaco;
}

export { monaco };
