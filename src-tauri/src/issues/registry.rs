//! Static dispatch table mapping a [`ProviderKind`] to its [`IssueProvider`].
//!
//! Each impl is a zero-sized unit struct, so the registry hands out `&'static`
//! references with no allocation or lazy init.

use super::provider::{IssueProvider, ProviderKind};
use super::providers;

pub fn provider(kind: ProviderKind) -> &'static dyn IssueProvider {
    match kind {
        ProviderKind::Linear => &providers::linear::LinearProvider,
        ProviderKind::Jira => &providers::jira::JiraProvider,
        ProviderKind::Trello => &providers::trello::TrelloProvider,
    }
}
