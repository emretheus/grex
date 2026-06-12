//! codewit CLI — workspace and session management from the terminal.
//!
//! Reuses the same Rust domain logic as the Tauri GUI, reading from / writing
//! to the same SQLite database and worktree layout.
//!
//! Cargo binary name is `codewit-cli` (to avoid conflicting with the Tauri GUI
//! binary). The install process exposes it as `codewit` in release builds and
//! `codewit-dev` in debug builds.
//!
//! The CLI body lives in `codewit_lib::cli` so it can reach crate-private
//! domain logic. This binary is just the entry point.

use std::process::ExitCode;

fn main() -> ExitCode {
    codewit_lib::cli::run()
}
