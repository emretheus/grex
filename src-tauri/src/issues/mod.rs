//! Provider-agnostic issue/task Context sources (Linear, Jira, Trello).
//!
//! The seam: each integration implements [`provider::IssueProvider`] and is
//! registered in [`registry`]. The merged read feed lives in [`feed`] and is
//! shared by every provider's thin command file. Generic connection +
//! credential persistence ([`connection`], [`credentials`]) backs Jira and
//! Trello; Linear keeps its pre-existing `crate::linear` store and is adapted
//! into the seam by [`providers::linear`].

pub mod connection;
pub mod credentials;
pub mod feed;
pub mod provider;
pub mod providers;
pub mod registry;
pub mod types;
