import type { IssueProviderCapabilities, IssueProviderType } from "@t3tools/contracts";

/**
 * Pure, runtime-agnostic metadata for the issue/task-tracker integrations.
 *
 * This module is the single source of truth shared by the web (which renders
 * the connection forms straight from the auth-specs) and the server (which
 * validates submitted credentials against the same specs). It contains no I/O
 * and no provider clients — those live server-side in the adapters.
 */

// ── Ordering & display ───────────────────────────────────────────────

/**
 * Display order for the settings list and provider pickers — most commonly
 * used trackers first.
 */
export const ISSUE_PROVIDER_ORDER: readonly IssueProviderType[] = [
  "linear",
  "github",
  "jira",
  "gitlab",
  "asana",
  "monday",
  "trello",
  "forgejo",
  "featurebase",
  "plain",
];

export const ISSUE_PROVIDER_META: Record<IssueProviderType, { displayName: string }> = {
  linear: { displayName: "Linear" },
  github: { displayName: "GitHub" },
  jira: { displayName: "Jira" },
  gitlab: { displayName: "GitLab" },
  asana: { displayName: "Asana" },
  monday: { displayName: "Monday.com" },
  trello: { displayName: "Trello" },
  forgejo: { displayName: "Forgejo" },
  featurebase: { displayName: "Featurebase" },
  plain: { displayName: "Plain" },
};

// ── Capabilities ─────────────────────────────────────────────────────

/**
 * What each provider needs before it can run, and what it can do. Mirrors
 * emdash's capability matrix. The web uses `requires*` to gray out providers
 * that lack the necessary context; the server uses `supportsIssueContext` to
 * decide whether `getIssueContext` is available.
 */
export const ISSUE_PROVIDER_CAPABILITIES: Record<IssueProviderType, IssueProviderCapabilities> = {
  linear: { requiresProjectPath: false, requiresRepositoryUrl: false, supportsIssueContext: true },
  github: { requiresProjectPath: false, requiresRepositoryUrl: true, supportsIssueContext: false },
  jira: { requiresProjectPath: false, requiresRepositoryUrl: false, supportsIssueContext: false },
  gitlab: { requiresProjectPath: true, requiresRepositoryUrl: false, supportsIssueContext: false },
  forgejo: { requiresProjectPath: true, requiresRepositoryUrl: false, supportsIssueContext: false },
  asana: { requiresProjectPath: false, requiresRepositoryUrl: false, supportsIssueContext: false },
  monday: { requiresProjectPath: false, requiresRepositoryUrl: false, supportsIssueContext: true },
  trello: { requiresProjectPath: false, requiresRepositoryUrl: false, supportsIssueContext: true },
  featurebase: {
    requiresProjectPath: false,
    requiresRepositoryUrl: false,
    supportsIssueContext: false,
  },
  plain: { requiresProjectPath: false, requiresRepositoryUrl: false, supportsIssueContext: true },
};

// ── Auth specs (drive the connection form) ───────────────────────────

export type AuthFieldType = "text" | "password";

export interface AuthField {
  /** Key under which the value is sent in `credentials`. */
  readonly key: string;
  readonly label: string;
  readonly type: AuthFieldType;
  readonly placeholder: string;
  /** When true the field may be left blank (e.g. Monday/Trello board URLs). */
  readonly optional?: boolean;
}

export interface AuthSpec {
  readonly fields: readonly AuthField[];
  /** Where the user creates the credential. */
  readonly helpUrl?: string;
  /** Short, ordered steps shown beneath the form. */
  readonly helpSteps?: readonly string[];
}

const TOKEN_ONLY = (
  label: string,
  placeholder: string,
  helpUrl: string,
  helpSteps: string[],
): AuthSpec => ({
  fields: [{ key: "token", label, type: "password", placeholder }],
  helpUrl,
  helpSteps,
});

/**
 * One spec per provider. The web renders these directly — a single form
 * component handles all ten, replacing emdash's ten hand-written `*SetupForm`s.
 */
export const ISSUE_PROVIDER_AUTH_SPECS: Record<IssueProviderType, AuthSpec> = {
  linear: TOKEN_ONLY("API key", "Linear API key", "https://linear.app/settings/account/security", [
    "Open Linear → Settings → Security & access → Personal API keys.",
    "Create a new key and paste it here.",
  ]),
  github: TOKEN_ONLY("Personal access token", "ghp_…", "https://github.com/settings/tokens", [
    "Create a token with the `repo` scope (and `read:org` for org repos).",
    "Paste it here.",
  ]),
  jira: {
    fields: [
      {
        key: "siteUrl",
        label: "Site URL",
        type: "text",
        placeholder: "https://your-domain.atlassian.net",
      },
      { key: "email", label: "Email", type: "text", placeholder: "you@example.com" },
      { key: "token", label: "API token", type: "password", placeholder: "API token" },
    ],
    helpUrl: "https://id.atlassian.com/manage-profile/security/api-tokens",
    helpSteps: ["Create an API token at id.atlassian.com, then enter your site URL and email."],
  },
  gitlab: {
    fields: [
      {
        key: "instanceUrl",
        label: "Instance URL",
        type: "text",
        placeholder: "https://gitlab.com",
      },
      { key: "token", label: "Access token", type: "password", placeholder: "glpat-…" },
    ],
    helpUrl: "https://gitlab.com/-/user_settings/personal_access_tokens",
    helpSteps: ["Create a personal access token with the `api` scope."],
  },
  forgejo: {
    fields: [
      {
        key: "instanceUrl",
        label: "Instance URL",
        type: "text",
        placeholder: "https://codeberg.org",
      },
      { key: "token", label: "Access token", type: "password", placeholder: "Access token" },
    ],
    helpSteps: ["Create an access token in your Forgejo instance under Settings → Applications."],
  },
  asana: TOKEN_ONLY(
    "Personal access token",
    "Asana personal access token",
    "https://app.asana.com/0/my-apps",
    ["Create a personal access token under My Settings → Apps → Manage developer apps."],
  ),
  monday: {
    fields: [
      { key: "token", label: "API token", type: "password", placeholder: "Monday API token" },
      {
        key: "boardUrls",
        label: "Board URLs",
        type: "text",
        placeholder: "https://…/boards/123, https://…/boards/456",
        optional: true,
      },
    ],
    helpUrl: "https://developer.monday.com/api-reference/docs/authentication",
    helpSteps: [
      "Copy your API token from Developers → My access tokens.",
      "Optionally scope to specific boards by URL.",
    ],
  },
  trello: {
    fields: [
      { key: "apiKey", label: "API key", type: "password", placeholder: "Trello API key" },
      { key: "token", label: "Token", type: "password", placeholder: "Trello token" },
      {
        key: "boardUrls",
        label: "Board URLs",
        type: "text",
        placeholder: "https://trello.com/b/…",
        optional: true,
      },
    ],
    helpUrl: "https://trello.com/power-ups/admin",
    helpSteps: ["Generate an API key and token from the Trello developer portal."],
  },
  featurebase: TOKEN_ONLY(
    "API key",
    "Featurebase API key",
    "https://help.featurebase.app/en/articles/-api-key",
    ["Create an API key in Featurebase under Settings → API."],
  ),
  plain: TOKEN_ONLY("API key", "Plain API key", "https://app.plain.com/settings/api-keys", [
    "Create an API key under Settings → Machine users / API keys.",
  ]),
};

/** All known provider types, in display order. */
export const isIssueProviderType = (value: string): value is IssueProviderType =>
  Object.prototype.hasOwnProperty.call(ISSUE_PROVIDER_META, value);
