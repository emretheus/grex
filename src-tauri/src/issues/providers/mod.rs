//! Concrete [`super::provider::IssueProvider`] implementations, one per
//! integration. `linear` adapts the pre-existing `crate::linear` GraphQL
//! module; `jira`, `trello`, and `forgejo` are self-contained REST clients;
//! `featurebase` is a REST client and `plain` is a GraphQL client.

pub mod featurebase;
pub mod forgejo;
pub mod jira;
pub mod linear;
pub mod plain;
pub mod trello;
