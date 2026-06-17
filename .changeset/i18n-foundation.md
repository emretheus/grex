---
"grex": patch
---

Add internationalization (i18n) support with a Language setting. The app ships with English, Chinese, Spanish, German, French, and Japanese, switchable live from Settings → Appearance and persisted across restarts.

- Built on react-i18next with auto-loaded per-language catalogs, locale-aware persistence (flash-free first paint), and a `bun run i18n:extract` workflow.
- Translates essentially the entire desktop UI: the navigation sidebar, message composer, conversation thread (including live streaming summaries), commit button, inspector, the full Settings UI and AI-provider panels, onboarding, the inbox and issue-tracker integrations (Jira/Linear/Trello/Forgejo/Featurebase), the file editor, prompt/skills/MCP library, source-detail views, keyboard-shortcut settings, automations, feedback, shared components, and assorted smaller surfaces (quick panel, quick switch, workspace start, updater, announcements, terminal).
- Any not-yet-translated string falls back to English. Backend/sidecar-originated error strings remain English for now and are planned for a follow-up that maps them to machine-readable error codes.
