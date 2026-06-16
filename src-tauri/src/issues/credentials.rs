//! Generic macOS-keychain storage for issue-provider secrets.
//!
//! Generalizes the per-provider keychain helper: the `service` is
//! `ProviderKind::keychain_service()`, the `account` is the connection id, and
//! the stored value is the provider's secret bundle (raw API key for Linear;
//! JSON `{site,email,token}` / `{key,token}` for Jira / Trello).
//!
//! Same rationale as `linear::credentials` / `slack::credentials`: we shell
//! out to `/usr/bin/security` rather than the `keyring` crate, which silently
//! no-ops from a tokio worker thread (the macOS Security framework wants a
//! CFRunLoop the blocking pool doesn't provide).

use anyhow::{bail, Context, Result};
use std::process::{Command, Stdio};

use super::provider::ProviderKind;

pub fn store(kind: ProviderKind, account: &str, secret: &str) -> Result<()> {
    let service = kind.keychain_service();
    let status = Command::new("/usr/bin/security")
        .args([
            "add-generic-password",
            "-U",
            "-s",
            service,
            "-a",
            account,
            "-w",
            secret,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .with_context(|| format!("Failed to spawn /usr/bin/security for {service}"))?;
    if !status.status.success() {
        bail!(
            "`security add-generic-password` failed (exit={:?}): {}",
            status.status.code(),
            String::from_utf8_lossy(&status.stderr).trim()
        );
    }
    Ok(())
}

pub fn load(kind: ProviderKind, account: &str) -> Result<Option<String>> {
    let service = kind.keychain_service();
    let output = Command::new("/usr/bin/security")
        .args(["find-generic-password", "-w", "-s", service, "-a", account])
        .output()
        .with_context(|| format!("Failed to spawn /usr/bin/security for {service}"))?;
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
    let secret = String::from_utf8(bytes).context("Stored secret isn't valid UTF-8")?;
    if secret.is_empty() {
        return Ok(None);
    }
    Ok(Some(secret))
}

pub fn clear(kind: ProviderKind, account: &str) -> Result<()> {
    let service = kind.keychain_service();
    let output = Command::new("/usr/bin/security")
        .args(["delete-generic-password", "-s", service, "-a", account])
        .output()
        .with_context(|| format!("Failed to spawn /usr/bin/security for {service}"))?;
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
