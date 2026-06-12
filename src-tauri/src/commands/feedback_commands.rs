use crate::feedback::{self, github_rest};

use super::common::{run_blocking, CmdResult};

#[tauri::command]
pub async fn fork_codewit_upstream() -> CmdResult<github_rest::ForkResult> {
    run_blocking(github_rest::fork_codewit_upstream).await
}

#[tauri::command]
pub async fn create_codewit_issue(
    title: String,
    body: String,
) -> CmdResult<github_rest::IssueResult> {
    run_blocking(move || github_rest::create_codewit_issue(&title, &body)).await
}

#[tauri::command]
pub async fn find_existing_codewit_repo() -> CmdResult<Option<feedback::ExistingCodewitRepo>> {
    run_blocking(feedback::find_existing_codewit_repo).await
}
