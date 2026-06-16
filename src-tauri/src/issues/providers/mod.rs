//! Concrete [`super::provider::IssueProvider`] implementations, one per
//! integration. `linear` adapts the pre-existing `crate::linear` GraphQL
//! module; `jira` and `trello` are self-contained REST clients.

pub mod jira;
pub mod linear;
pub mod trello;
