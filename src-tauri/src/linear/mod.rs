//! Linear as a Context source.
//!
//! Authentication = a personal API key (local-first): the user pastes a
//! key they create at <https://linear.app/settings/api>. No OAuth app to
//! register, no client id to ship, no callback server — the key is stored
//! in the macOS Keychain via `/usr/bin/security` (see `credentials.rs`)
//! and sent as the `Authorization` header. Non-secret connection metadata
//! (organization name, user name, connected-at) goes into the generic
//! `settings` KV table under [`CONNECTION_META_KEY`].
//!
//! Live data is fetched read-only via Linear's GraphQL API (`api.rs`):
//! the signed-in user's assigned issues, free-text issue search, and
//! single-issue detail. Read-only by usage — no status write-back, no
//! agent-side MCP.

pub mod api;
pub mod connection;
pub mod credentials;
pub mod types;

/// `settings` KV key holding the JSON-encoded array of
/// [`types::LinearConnectionRecord`] — one per connected workspace.
pub const CONNECTIONS_KEY: &str = "linear.connections";

/// Legacy `settings` KV key holding a single JSON-encoded
/// [`types::LinearConnectionMeta`] from pre-multi-workspace builds. Read
/// only by [`connection`]'s lazy migration; never written anymore.
pub const CONNECTION_META_KEY: &str = "linear.connection";
