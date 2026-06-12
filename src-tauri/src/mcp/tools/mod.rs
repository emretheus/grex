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
        "codewit_data_info" => data::tool_data_info(args),
        "codewit_repo_list" => repo::tool_repo_list(args),
        "codewit_repo_add" => repo::tool_repo_add(args),
        "codewit_workspace_list" => workspace::tool_workspace_list(args),
        "codewit_workspace_show" => workspace::tool_workspace_show(args),
        "codewit_workspace_create" => workspace::tool_workspace_create(args),
        "codewit_workspace_set_status" => workspace::tool_workspace_set_status(args),
        "codewit_workspace_archive" => workspace::tool_workspace_archive(args),
        "codewit_workspace_permanently_delete" => workspace::tool_workspace_permanently_delete(args),
        "codewit_workspace_run_action" => workspace::tool_workspace_run_action(args),
        "codewit_session_get_messages" => session::tool_session_get_messages(args),
        "codewit_session_list" => session::tool_session_list(args),
        "codewit_session_create" => session::tool_session_create(args),
        "codewit_session_search" => session::tool_session_search(args),
        "codewit_send" => send::tool_send(args),
        _ => anyhow::bail!("Unknown tool: {name}"),
    }
}

#[cfg(test)]
mod tests;
