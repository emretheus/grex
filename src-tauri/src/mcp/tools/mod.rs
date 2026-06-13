use anyhow::Result;
use serde_json::Value;

mod common;
mod data;
mod repo;
mod send;
mod session;
mod workspace;

pub(super) fn dispatch_tool(name: &str, args: &Value) -> Result<String> {
    match name {
        "grex_data_info" => data::tool_data_info(args),
        "grex_repo_list" => repo::tool_repo_list(args),
        "grex_repo_add" => repo::tool_repo_add(args),
        "grex_workspace_list" => workspace::tool_workspace_list(args),
        "grex_workspace_show" => workspace::tool_workspace_show(args),
        "grex_workspace_create" => workspace::tool_workspace_create(args),
        "grex_workspace_set_status" => workspace::tool_workspace_set_status(args),
        "grex_workspace_archive" => workspace::tool_workspace_archive(args),
        "grex_workspace_permanently_delete" => workspace::tool_workspace_permanently_delete(args),
        "grex_workspace_run_action" => workspace::tool_workspace_run_action(args),
        "grex_session_get_messages" => session::tool_session_get_messages(args),
        "grex_session_list" => session::tool_session_list(args),
        "grex_session_create" => session::tool_session_create(args),
        "grex_session_search" => session::tool_session_search(args),
        "grex_send" => send::tool_send(args),
        _ => anyhow::bail!("Unknown tool: {name}"),
    }
}

#[cfg(test)]
mod tests;
