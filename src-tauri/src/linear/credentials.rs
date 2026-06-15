//! OS-keychain storage for the Linear personal API key.
//!
//! Local-first auth: the user pastes a personal API key they create at
//! <https://linear.app/settings/api> — no OAuth app to register, no
//! client id to ship, no callback server. The key is sent verbatim as the
//! `Authorization` header against Linear's GraphQL API.
//!
//! Same keychain rationale as `slack::credentials`: we shell out to
//! `/usr/bin/security` instead of the `keyring` crate, which silently
//! no-ops from a tokio worker thread (the macOS Security framework wants a
//! CFRunLoop the blocking pool doesn't provide). There's a single entry,
//! keyed by the fixed [`ACCOUNT`] account name.

use anyhow::{bail, Context, Result};
use std::process::{Command, Stdio};

const KEYCHAIN_SERVICE: &str = "io.grex.linear";
/// Fixed account name — there is only ever one Linear API key.
const ACCOUNT: &str = "api-key";

pub fn store_api_key(api_key: &str) -> Result<()> {
    let status = Command::new("/usr/bin/security")
        .args([
            "add-generic-password",
            "-U",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            ACCOUNT,
            "-w",
            api_key,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .context("Failed to spawn /usr/bin/security for the Linear API key")?;
    if !status.status.success() {
        bail!(
            "`security add-generic-password` failed (exit={:?}): {}",
            status.status.code(),
            String::from_utf8_lossy(&status.stderr).trim()
        );
    }
    Ok(())
}

pub fn load_api_key() -> Result<Option<String>> {
    let output = Command::new("/usr/bin/security")
        .args([
            "find-generic-password",
            "-w",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            ACCOUNT,
        ])
        .output()
        .context("Failed to spawn /usr/bin/security for the Linear API key")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("could not be found") || stderr.contains("not be found") {
            return Ok(None);
        }
        bail!(
            "`security find-generic-password` failed (exit={:?}): {}",
            output.status.code(),
            stderr.trim()
        );
    }
    let mut bytes = output.stdout;
    if bytes.last() == Some(&b'\n') {
        bytes.pop();
    }
    let key = String::from_utf8(bytes).context("Stored Linear API key isn't valid UTF-8")?;
    if key.is_empty() {
        return Ok(None);
    }
    Ok(Some(key))
}

pub fn clear_api_key() -> Result<()> {
    let output = Command::new("/usr/bin/security")
        .args([
            "delete-generic-password",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            ACCOUNT,
        ])
        .output()
        .context("Failed to spawn /usr/bin/security for the Linear API key")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("could not be found") || stderr.contains("not be found") {
            return Ok(());
        }
        bail!(
            "`security delete-generic-password` failed (exit={:?}): {}",
            output.status.code(),
            stderr.trim()
        );
    }
    Ok(())
}
