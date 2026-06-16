//! "Test connection" for a Library MCP server.
//!
//! Performs a real MCP handshake — `initialize` then `tools/list` — against a
//! server config without persisting anything, so the user can validate a server
//! (and see how many tools it exposes) before relying on it. Supports both
//! stdio (spawn the command, newline-delimited JSON-RPC) and http (Streamable
//! HTTP POST, JSON or SSE response). Everything is best-effort with a hard
//! timeout; failures come back as a message rather than an error.

use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};

use crate::models::library_mcp::McpServerInput;

const TIMEOUT: Duration = Duration::from_secs(12);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTestResult {
    pub ok: bool,
    /// Server-reported name from `initialize`, when available.
    pub server_name: Option<String>,
    /// Number of tools from `tools/list`, when reachable.
    pub tool_count: Option<usize>,
    pub error: Option<String>,
}

impl McpTestResult {
    fn failure(msg: impl Into<String>) -> Self {
        Self {
            ok: false,
            server_name: None,
            tool_count: None,
            error: Some(msg.into()),
        }
    }
}

fn initialize_req() -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": { "name": "grex", "version": "1.0" }
        }
    })
}

fn initialized_notif() -> Value {
    json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })
}

fn tools_list_req() -> Value {
    json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} })
}

fn server_name_of(init: &Value) -> Option<String> {
    init.pointer("/result/serverInfo/name")
        .and_then(|v| v.as_str())
        .map(String::from)
}

fn tool_count_of(tools: &Value) -> Option<usize> {
    tools
        .pointer("/result/tools")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
}

/// Run a full test against the given (unsaved) server config.
pub fn test_server(input: &McpServerInput) -> McpTestResult {
    if input.transport == "http" {
        match input.url.as_deref() {
            Some(url) if !url.is_empty() => test_http(url, input),
            _ => McpTestResult::failure("No URL set for this http server."),
        }
    } else {
        match input.command.as_deref() {
            Some(cmd) if !cmd.is_empty() => test_stdio(cmd, input),
            _ => McpTestResult::failure("No command set for this stdio server."),
        }
    }
}

fn test_stdio(command: &str, input: &McpServerInput) -> McpTestResult {
    let mut cmd = Command::new(command);
    cmd.args(&input.args)
        .envs(input.env.iter())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return McpTestResult::failure(format!("Couldn't start `{command}`: {e}")),
    };
    let mut stdin = match child.stdin.take() {
        Some(s) => s,
        None => {
            let _ = child.kill();
            return McpTestResult::failure("Failed to open stdin.");
        }
    };
    let stdout = child.stdout.take().expect("piped stdout");

    // Read stdout lines on a background thread; the main thread drives the
    // handshake against a shared deadline.
    let (tx, rx) = mpsc::channel::<String>();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            match line {
                Ok(l) => {
                    if tx.send(l).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    let deadline = Instant::now() + TIMEOUT;
    let write = |stdin: &mut std::process::ChildStdin, v: &Value| -> std::io::Result<()> {
        stdin.write_all(serde_json::to_string(v).unwrap_or_default().as_bytes())?;
        stdin.write_all(b"\n")?;
        stdin.flush()
    };

    if write(&mut stdin, &initialize_req()).is_err() {
        let _ = child.kill();
        return McpTestResult::failure("The server closed before initializing.");
    }

    let result = match read_message(&rx, 1, deadline) {
        Some(init) if init.get("error").is_none() => {
            let server_name = server_name_of(&init);
            let _ = write(&mut stdin, &initialized_notif());
            let _ = write(&mut stdin, &tools_list_req());
            let tool_count = read_message(&rx, 2, deadline)
                .as_ref()
                .and_then(tool_count_of);
            McpTestResult {
                ok: true,
                server_name,
                tool_count,
                error: None,
            }
        }
        Some(init) => McpTestResult::failure(rpc_error_message(&init)),
        None => McpTestResult::failure("No response from the server (timed out)."),
    };
    let _ = child.kill();
    result
}

/// Block on the reader channel until a JSON-RPC message with `id` arrives or the
/// deadline passes.
fn read_message(rx: &mpsc::Receiver<String>, id: i64, deadline: Instant) -> Option<Value> {
    loop {
        let now = Instant::now();
        if now >= deadline {
            return None;
        }
        match rx.recv_timeout(deadline - now) {
            Ok(line) => {
                if let Ok(v) = serde_json::from_str::<Value>(&line) {
                    if v.get("id").and_then(|x| x.as_i64()) == Some(id) {
                        return Some(v);
                    }
                }
            }
            Err(_) => return None,
        }
    }
}

fn rpc_error_message(v: &Value) -> String {
    v.pointer("/error/message")
        .and_then(|m| m.as_str())
        .map(|m| format!("Server error: {m}"))
        .unwrap_or_else(|| "Server returned an error.".to_string())
}

fn test_http(url: &str, input: &McpServerInput) -> McpTestResult {
    let client = match reqwest::blocking::Client::builder()
        .timeout(TIMEOUT)
        .build()
    {
        Ok(c) => c,
        Err(e) => return McpTestResult::failure(format!("HTTP client error: {e}")),
    };

    let post = |body: &Value, session: Option<&str>| {
        let mut req = client
            .post(url)
            .header(
                reqwest::header::ACCEPT,
                "application/json, text/event-stream",
            )
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .header("MCP-Protocol-Version", "2025-06-18");
        for (k, v) in &input.headers {
            req = req.header(k.as_str(), v.as_str());
        }
        if let Some(s) = session {
            req = req.header("Mcp-Session-Id", s);
        }
        req.body(serde_json::to_string(body).unwrap_or_default())
            .send()
    };

    let resp = match post(&initialize_req(), None) {
        Ok(r) => r,
        Err(e) => return McpTestResult::failure(format!("Couldn't reach the server: {e}")),
    };
    if !resp.status().is_success() {
        return McpTestResult::failure(format!("Server responded with HTTP {}.", resp.status()));
    }
    let session = resp
        .headers()
        .get("mcp-session-id")
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = resp.text().unwrap_or_default();

    let Some(init) = parse_rpc_body(&content_type, &body) else {
        return McpTestResult::failure("Couldn't parse the server's initialize response.");
    };
    if init.get("error").is_some() {
        return McpTestResult::failure(rpc_error_message(&init));
    }
    let server_name = server_name_of(&init);

    // Best-effort: complete the handshake and list tools.
    let _ = post(&initialized_notif(), session.as_deref());
    let tool_count = post(&tools_list_req(), session.as_deref())
        .ok()
        .and_then(|r| {
            let ct = r
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            r.text().ok().map(|t| (ct, t))
        })
        .and_then(|(ct, t)| parse_rpc_body(&ct, &t))
        .as_ref()
        .and_then(tool_count_of);

    McpTestResult {
        ok: true,
        server_name,
        tool_count,
        error: None,
    }
}

/// Parse a JSON-RPC message from either a plain JSON body or an SSE stream
/// (`data: {...}` lines).
fn parse_rpc_body(content_type: &str, body: &str) -> Option<Value> {
    if content_type.contains("text/event-stream") {
        for line in body.lines() {
            if let Some(rest) = line.strip_prefix("data:") {
                if let Ok(v) = serde_json::from_str::<Value>(rest.trim()) {
                    return Some(v);
                }
            }
        }
        None
    } else {
        serde_json::from_str(body).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_input() -> McpServerInput {
        McpServerInput {
            id: None,
            name: "t".into(),
            transport: "stdio".into(),
            command: None,
            args: vec![],
            url: None,
            headers: Default::default(),
            env: Default::default(),
            providers: vec![],
            enabled: true,
        }
    }

    #[test]
    fn missing_command_or_url_fails_clearly() {
        let stdio = test_server(&base_input());
        assert!(!stdio.ok);
        assert!(stdio.error.unwrap().contains("command"));

        let mut http = base_input();
        http.transport = "http".into();
        let r = test_server(&http);
        assert!(!r.ok);
        assert!(r.error.unwrap().contains("URL"));
    }

    #[test]
    fn unknown_command_reports_failure() {
        let mut input = base_input();
        input.command = Some("grex-no-such-binary-xyz".into());
        let r = test_server(&input);
        assert!(!r.ok);
        assert!(r.error.is_some());
    }

    #[test]
    fn parses_sse_and_json_bodies() {
        let json = parse_rpc_body("application/json", r#"{"id":1,"result":{}}"#).unwrap();
        assert_eq!(json["id"], 1);
        let sse = parse_rpc_body(
            "text/event-stream",
            "event: message\ndata: {\"id\":1,\"result\":{\"tools\":[1,2]}}\n\n",
        )
        .unwrap();
        assert_eq!(tool_count_of(&sse), Some(2));
    }

    /// A trivial stdio MCP server (a shell script) completes the handshake.
    #[cfg(unix)]
    #[test]
    fn stdio_handshake_against_fake_server() {
        use std::io::Write as _;
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("fake-mcp.sh");
        // Reads JSON-RPC lines; replies to initialize (id 1) and tools/list (id 2).
        let body = r#"#!/usr/bin/env bash
while IFS= read -r line; do
  case "$line" in
    *'"id":1'*) printf '{"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"fake"}}}\n' ;;
    *'"id":2'*) printf '{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"a"},{"name":"b"}]}}\n' ;;
  esac
done
"#;
        std::fs::File::create(&script)
            .unwrap()
            .write_all(body.as_bytes())
            .unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();

        let mut input = base_input();
        input.command = Some("bash".into());
        input.args = vec![script.to_string_lossy().to_string()];
        let r = test_server(&input);
        assert!(r.ok, "handshake should succeed: {:?}", r.error);
        assert_eq!(r.server_name.as_deref(), Some("fake"));
        assert_eq!(r.tool_count, Some(2));
    }
}
