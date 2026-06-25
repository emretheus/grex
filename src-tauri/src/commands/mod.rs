pub(crate) mod automation_commands;
mod common;
pub(crate) mod companion_commands;
pub(crate) mod conductor_commands;
pub(crate) mod editor_commands;
pub(crate) mod editors;
pub(crate) mod featurebase_commands;
pub(crate) mod feedback_commands;
pub(crate) mod forge_commands;
pub(crate) mod forgejo_commands;
pub(crate) mod jira_commands;
pub(crate) mod kimi_config_commands;
pub(crate) mod library_commands;
pub(crate) mod linear_commands;
pub(crate) mod local_llm_commands;
pub(crate) mod opencode_config_commands;
pub(crate) mod plain_commands;
pub(crate) mod provider_commands;
pub(crate) mod repository_commands;
pub(crate) mod script_commands;
pub(crate) mod session_commands;
pub(crate) mod settings_commands;
pub(crate) mod slack_commands;
pub(crate) mod system_commands;
pub(crate) mod terminal_commands;
pub(crate) mod trello_commands;
pub(crate) mod updater_commands;
pub(crate) mod workspace_commands;

pub use system_commands::DataInfo;

#[cfg(test)]
mod tests;
