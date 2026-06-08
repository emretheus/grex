# Plan: Issue/Task-Tracker Integrations (emdash-style) for Codewit

## Goal

Port emdash's **integrations** subsystem to Codewit: connect third-party issue/task
trackers so a thread/task can be **linked to an external issue or PR**. emdash supports
10 providers — **GitHub, Linear, Jira, GitLab, Forgejo, Asana, Monday, Trello,
Featurebase, Plain**. Target: all 10, built on a clean provider abstraction so adding
the 11th is a single file.

This is a **next-version** feature. This document is the implementation blueprint; code
lands in stages behind a settings surface, with no impact on existing thread/agent flow
until a user connects a provider.

## How emdash does it (validated against `/tmp/emdash-research`)

Three clean layers, one registry:

1. **`IssueProvider`** (`src/main/core/issues/issue-provider.ts`) — the per-provider query
   interface. Every provider implements:
   ```ts
   interface IssueProvider {
     readonly type: IssueProviderType;
     readonly capabilities: IssueProviderCapabilities;
     checkConnection(): Promise<ConnectionStatus>;
     listIssues(opts: IssueQueryOpts): Promise<IssueListResult>;
     searchIssues(opts: IssueSearchOpts): Promise<IssueListResult>;
     getIssueContext?(opts: IssueContextOpts): Promise<IssueContextResult>;
   }
   ```
2. **`ConnectionService`** (per provider) — owns auth + credential persistence + a cached
   client. Methods are `saveToken`/`saveCredentials`, `clearToken`/`clearCredentials`,
   `checkConnection`, `getClient`.
3. **Controllers** (per provider + a central `issues` controller) — the IPC surface the
   renderer calls.
4. **Registry** (`src/main/core/issues/registry.ts`) — `Map<IssueProviderType, IssueProvider>`,
   one `register()` call per provider.

Credentials: Electron `safeStorage` → encrypted blob in a SQLite `app_secrets` table;
non-secret config (instance URLs, board IDs) in a JSON `kv` table.

`LinkedIssue` (a flat, versioned snapshot — provider, identifier, title, url, status, …) is
stored on the task row at link time; it is a snapshot, **not** a live reference.

Capabilities matrix declares per-provider requirements: `requiresProjectPath`,
`requiresRepositoryUrl`, `supportsIssueContext`.

Renderer: a global `IntegrationsProvider` (React Query for connection status, polled every
30s + on focus), a generic `useProviderConnection` mutation hook, `useIssues` (debounced
dual initial/search queries), `useConnectedIssueProviders` (capability filtering), a
provider-dispatching `IntegrationSetupModal` with one `*SetupForm` per provider, an
`IntegrationsCard` in Settings, and an `IssueSelector` combobox consumed at task creation.

## How it maps onto Codewit (the adaptation)

Codewit is **not** Electron-IPC + Drizzle. It is **Effect-TS server + WebSocket RPC +
monorepo + React/Zustand/React Query**. The layering survives almost 1:1; the substrate
changes:

| emdash | Codewit equivalent |
| --- | --- |
| `IssueProvider` interface (main) | same interface, lives in `packages/shared/src/integrations` (pure, no Effect) so it can be unit-tested in isolation |
| `ConnectionService` per provider (main) | folded into the server `IntegrationsService` (Effect Layer); per-provider logic = a `ProviderAdapter` module |
| `safeStorage` + `app_secrets` table | **`ServerSecretStore`** (`apps/server/src/auth/…`) — already an encrypted file-based KV. Key scheme: `integration:<provider>:token` (+ `:config` for non-secret) |
| `kv` table for configs | a small JSON file via `ServerSecretStore` or a sibling config store; non-secret so plain file is fine |
| IPC controllers | **WS RPC** methods (`integrations.*`) via the 4-file contracts flow |
| `rpc.issues.*` / `rpc.<provider>.*` | `integrations.checkAllConnections`, `integrations.listIssues`, `integrations.searchIssues`, `integrations.connect`, `integrations.disconnect` |
| `LinkedIssue` zod schema | effect/Schema in `packages/contracts/src/integrations.ts` |
| Drizzle `tasks.linkedIssue` column | a `linkedIssue` field on our thread/session record (where thread metadata persists) |
| `IntegrationsProvider` context | a Zustand store (`codewit:integrations:v1`) + React Query, matching our store idiom |
| BaseUI-less modal | our **BaseUI `Dialog`** primitive (`apps/web/src/components/ui/dialog.tsx`) |
| `IntegrationsCard` (shadcn) | our **Settings primitives** (`SettingsSection`/`SettingsRow`/`SettingsCard`) |

**Key simplification vs emdash:** emdash spreads one `ConnectionService` + one
`controller` per provider across ~40 files. We collapse the server side to **one
`IntegrationsService`** that dispatches to a **registry of `ProviderAdapter`s** (one module
per provider). Same separation of concerns, far fewer wiring files, and a single RPC surface
instead of 11 controllers.

---

## Architecture (Codewit)

### Shared (`packages/shared/src/integrations/`)
Pure, runtime-agnostic — the provider contract + the registry, no Effect, no React.

- `types.ts` — `IssueProviderType`, `IssueProviderCapabilities`, `IssueQueryOpts`,
  `IssueSearchOpts`, `IssueContextOpts`, `ConnectionStatus`, `IssueListResult`,
  `IssueContextResult`, and the `ProviderAdapter` interface (the server-facing analog of
  emdash's `IssueProvider`, but auth-injected rather than stateful):
  ```ts
  interface ProviderAdapter {
    readonly type: IssueProviderType;
    readonly capabilities: IssueProviderCapabilities;
    readonly auth: AuthSpec;            // describes the credential fields (see below)
    checkConnection(creds: Credentials): Promise<ConnectionStatus>;
    listIssues(creds: Credentials, opts: IssueQueryOpts): Promise<IssueListResult>;
    searchIssues(creds: Credentials, opts: IssueSearchOpts): Promise<IssueListResult>;
    getIssueContext?(creds: Credentials, opts: IssueContextOpts): Promise<IssueContextResult>;
  }
  ```
  Auth state is passed in (not held on the adapter), so adapters are pure & cache-free —
  the server `IntegrationsService` owns credential loading and (optionally) client caching.
- `auth-spec.ts` — declarative credential schema per provider so the **UI form is generated
  from data**, removing emdash's 10 hand-written `*SetupForm.tsx`:
  ```ts
  type AuthField = { key: string; label: string; type: 'text'|'password'; placeholder: string; optional?: boolean };
  type AuthSpec = { fields: AuthField[]; helpUrl?: string; helpSteps?: string[] };
  ```
  e.g. Linear = `[{key:'token', type:'password', …}]`; Jira =
  `[siteUrl, email, token]`; Trello = `[apiKey, token, boardUrls?]`.
- `registry.ts` — `INTEGRATION_PROVIDERS: Record<IssueProviderType, ProviderAdapter>` +
  `getProvider(type)` + `listProviders()`. (Adapters themselves live server-side and are
  injected; the shared registry holds only metadata/capabilities/auth-spec so the **web** can
  render forms without importing server code. The server keeps the runtime adapter map.)
- `meta.ts` — `ISSUE_PROVIDER_ORDER`, `ISSUE_PROVIDER_META` (displayName), capabilities map.

> Split detail: **metadata/auth-spec/capabilities** are isomorphic (shared, imported by web).
> **Runtime adapter implementations** (HTTP calls) are server-only. The shared registry is a
> `Record<type, ProviderMeta>`; the server holds `Record<type, ProviderAdapter>` keyed the same.

### Contracts (`packages/contracts/src/integrations.ts`)
effect/Schema mirrors of the shared types + RPC payloads/results:
- `IssueProviderType` (`Schema.Literals([...10...])`)
- `LinkedIssue` (provider, identifier, title, url, description?, status?, assignees?,
  project?, branchName?, updatedAt?, fetchedAt?) — versioned for evolution
- `ConnectionStatus`, `ConnectionStatusMap`
- `IntegrationConnectInput` ({ provider, credentials: Record<string,string> }),
  `IntegrationConnectResult` ({ success, displayName?, error? })
- `IntegrationListIssuesInput` ({ provider, projectPath?, repositoryUrl?, limit? }),
  `IntegrationSearchIssuesInput` (+ searchTerm), `IssueListResult`
- `IntegrationDisconnectInput` ({ provider })

### Server (`apps/server/src/integrations/`)
- `Services/IntegrationsService.ts` — `ServiceMap.Service` interface:
  `checkAllConnections`, `checkConnection`, `connect`, `disconnect`, `listIssues`,
  `searchIssues`, `getIssueContext`.
- `Layers/IntegrationsService.ts` — `Layer.effect` impl. Depends on **`ServerSecretStore`**.
  Owns: credential load/save (`integration:<p>:token`, `integration:<p>:config`), the runtime
  adapter registry, per-provider client caching (keyed by credential hash), and translation
  of adapter `Promise`s into Effects (`Effect.tryPromise`).
- `adapters/<provider>.ts` — one module per provider implementing `ProviderAdapter`. Each is
  plain async TS (fetch/SDK), unit-testable without Effect. Group shared HTTP helpers
  (`adapters/http.ts`) for the custom-client providers (Asana, Monday, Trello, Featurebase,
  Jira). SDK-backed: Linear (`@linear/sdk`), GitLab (`@gitbeaker/rest`),
  Forgejo (`@llamaduck/forgejo-ts`), Plain (`@team-plain/graphql`), GitHub (`@octokit/rest`).
- Wire RPC handlers in `apps/server/src/wsRpc.ts` (`integrations.*` → `rpcEffect(...)`).

### Web (`apps/web/src/integrations/`)
- `integrationsStore.ts` — Zustand (`codewit:integrations:v1`) for last-known connection
  status + selected-provider-per-thread; React Query for live `checkAllConnections`
  (30s stale, refetch on focus). Mirrors emdash's provider but in our store idiom.
- `useProviderConnection.ts`, `useIssues.ts`, `useConnectedIssueProviders.ts` — direct ports
  of emdash hooks, swapping `rpc.*` for our `wsNativeApi` typed calls.
- `IntegrationSetupDialog.tsx` — **data-driven** form from `AuthSpec` (one component, not 10),
  on our `Dialog` primitive.
- `IntegrationsSettingsSection.tsx` — `SettingsSection` + a `SettingsRow` per provider with
  connect/disconnect + status. Renders provider icons.
- `provider-icons.tsx` — port emdash's SVG icon set (10 brand marks).
- `IssueSelector.tsx` + `useIssueSearch.ts` — the combobox for linking an issue, consumed
  wherever we create/start a thread.

---

## Build order (each step independently shippable & testable)

1. **Shared contract + 1 provider end-to-end (Linear).** `packages/shared/src/integrations`
   types + auth-spec + meta; `packages/contracts/src/integrations.ts`; server
   `IntegrationsService` + `adapters/linear.ts`; RPC `integrations.{connect,disconnect,
   checkAllConnections,listIssues,searchIssues}`. **Verify:** connect Linear with a PAT,
   `checkAllConnections` reports connected, `listIssues` returns issues. No UI yet — test via
   a temporary script or the RPC directly.
2. **Settings UI + setup dialog (Linear only).** `IntegrationsSettingsSection` +
   data-driven `IntegrationSetupDialog`. **Verify:** connect/disconnect Linear from Settings;
   status persists across reload; token stored encrypted via `ServerSecretStore`.
3. **IssueSelector + link to thread.** Combobox, `useIssues`, `useConnectedIssueProviders`;
   persist `linkedIssue` on the thread record. **Verify:** search Linear issues, pick one,
   it sticks to the thread and survives restart.
4. **Add providers in capability tiers** (cheap once the harness exists — each is one
   adapter + auth-spec entry + icon + registry line):
   - 4a. **GitHub** (octokit; repo-scoped; needs `repositoryUrl` — reuse existing
     `resolveGitHubRepository` remote parsing in `wsRpc.ts`).
   - 4b. **Token-PAT GraphQL/REST:** Jira, GitLab, Forgejo.
   - 4c. **Custom-client REST/GraphQL:** Asana, Monday, Trello, Featurebase, Plain.
5. **Polish:** issue-context fetch (`getIssueContext` for linear/monday/plain/trello),
   git-aware auto-resolution (GitHub/GitLab/Forgejo infer repo from remote), connection-status
   capability gating in the selector, icons, empty/placeholder states.

## Dependencies to add
`@linear/sdk`, `@octokit/rest`, `@octokit/auth-oauth-device`, `@gitbeaker/rest`,
`@llamaduck/forgejo-ts`, `@team-plain/graphql`. Jira/Asana/Monday/Trello/Featurebase use
`fetch` (no dep). Add incrementally per step 4 tier, not all upfront.

## Credential storage (decision)
Reuse **`ServerSecretStore`** (already encrypted, file-perms 0600). Two key namespaces:
- `integration:<provider>:token` — the secret (string; for multi-field providers, a JSON blob).
- `integration:<provider>:config` — non-secret config (instance URL, board IDs) — could be a
  plain config file, but routing through `ServerSecretStore` keeps one mechanism. Decide at
  step 1.

## Out of scope (future)
OAuth web flows (we start with PAT/API-token entry like emdash's forms; GitHub device-flow
optional later), PR linking (`PrComboboxField`) beyond issue linking, webhook/live issue
sync, writing back to the tracker (comments/status), multi-account per provider (GitHub
accounts), issue-context auto-injection into the agent prompt.

## Verification (per CLAUDE.md)
One final pass: `bun fmt && bun lint && bun typecheck`; tests via `bun run test` (NEVER
`bun test`). Each adapter ships with a unit test (mock fetch/SDK) mirroring emdash's
`*-issue-provider.test.ts`. End-to-end: connect each provider with a real token in a dev
build, list + search + link an issue.
