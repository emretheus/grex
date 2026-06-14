//! Render Gemini's native `gemini_message` into universal `MessagePart`s.
//! Shared by the live-stream path and historical reload. The accumulator
//! (`accumulator/gemini.rs`) produces parts of type text / reasoning / tool /
//! plan from the ACP `session/update` stream.

use serde_json::{json, Value};

use super::super::types::{MessagePart, StreamingStatus, TodoItem, TodoStatus};
use super::blocks::CLAUDE_TASK_LIST_ID_PREFIX;

// `msg_id` seeds stable keys (`<msg_id>:<index>`). On a live partial the
// trailing part is the actively-generating one.
pub(crate) fn render_parts(parsed: &Value, msg_id: &str, is_streaming: bool) -> Vec<MessagePart> {
    let Some(parts) = parsed.get("parts").and_then(Value::as_array) else {
        return Vec::new();
    };
    let last_idx = parts.len().saturating_sub(1);
    let mut out = Vec::with_capacity(parts.len());
    for (idx, part) in parts.iter().enumerate() {
        let streaming_now = is_streaming && idx == last_idx;
        if let Some(rendered) = render_part(part, format!("{msg_id}:{idx}"), streaming_now) {
            out.push(rendered);
        }
    }
    out
}

fn render_part(part: &Value, id: String, streaming_now: bool) -> Option<MessagePart> {
    let kind = part.get("type").and_then(Value::as_str).unwrap_or_default();
    let text = part.get("text").and_then(Value::as_str).unwrap_or_default();
    match kind {
        "text" => (!text.is_empty()).then(|| MessagePart::Text {
            id,
            text: text.to_string(),
        }),
        "reasoning" => (!text.is_empty()).then(|| MessagePart::Reasoning {
            id,
            text: text.to_string(),
            streaming: streaming_now.then_some(true),
            duration_ms: None,
        }),
        "tool" => Some(render_tool(part)),
        "plan" => render_plan(part, &id),
        _ => None,
    }
}

// Map the ACP tool to the universal tool-call vocabulary. Edits with file diffs
// render through the shared apply_patch diff view; everything else keeps its
// ACP `kind` as a human-readable tool name with the raw input as args.
fn render_tool(part: &Value) -> MessagePart {
    let call_id = part
        .get("toolCallId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let kind = part.get("kind").and_then(Value::as_str).unwrap_or("other");
    let title = part
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let input = part
        .get("input")
        .cloned()
        .unwrap_or_else(|| Value::Object(Default::default()));
    let file_diffs = part
        .get("fileDiffs")
        .and_then(Value::as_array)
        .filter(|c| !c.is_empty());
    let (tool_name, args) = match file_diffs {
        Some(changes) => ("apply_patch".to_string(), json!({ "changes": changes })),
        None => (canonical_tool_name(kind, title), input),
    };
    let args_text = serde_json::to_string(&args).unwrap_or_default();
    let status = part
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("pending");
    let is_error = part
        .get("isError")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || status == "failed";
    let result = part.get("output").and_then(Value::as_str).and_then(|o| {
        // With a rendered diff the success summary is redundant — drop it unless
        // it carries extra feedback.
        if (file_diffs.is_some() && o.len() < 80) || o.is_empty() {
            None
        } else {
            Some(Value::String(o.to_string()))
        }
    });
    let streaming_status = match status {
        "pending" => Some(StreamingStatus::Pending),
        "in_progress" => Some(StreamingStatus::Running),
        "completed" => Some(StreamingStatus::Done),
        "failed" => Some(StreamingStatus::Error),
        _ => None,
    };
    MessagePart::ToolCall {
        tool_call_id: call_id,
        tool_name,
        args,
        args_text,
        result,
        is_error: is_error.then_some(true),
        streaming_status,
        children: Vec::new(),
    }
}

// ACP `kind` → a display tool name. `other` falls back to the human title.
fn canonical_tool_name(kind: &str, title: &str) -> String {
    match kind {
        "read" => "Read".into(),
        "edit" => "Edit".into(),
        "delete" => "Delete".into(),
        "move" => "Move".into(),
        "search" => "Search".into(),
        "execute" => "Bash".into(),
        "think" => "Think".into(),
        "fetch" => "Fetch".into(),
        "switch_mode" => "Mode".into(),
        _ => {
            if title.is_empty() {
                "Tool".into()
            } else {
                title.to_string()
            }
        }
    }
}

// ACP plan entries map cleanly to a todo list; reuse the Claude task-list id
// prefix so `collapse_task_todo_lists` folds repeated snapshots.
fn render_plan(part: &Value, id: &str) -> Option<MessagePart> {
    let entries = part.get("entries").and_then(Value::as_array)?;
    let items: Vec<TodoItem> = entries
        .iter()
        .filter_map(|e| {
            let text = e.get("content").and_then(Value::as_str)?.to_string();
            let status = match e.get("status").and_then(Value::as_str).unwrap_or("pending") {
                "in_progress" => TodoStatus::InProgress,
                "completed" => TodoStatus::Completed,
                _ => TodoStatus::Pending,
            };
            Some(TodoItem { text, status })
        })
        .collect();
    if items.is_empty() {
        return None;
    }
    Some(MessagePart::TodoList {
        id: format!("{CLAUDE_TASK_LIST_ID_PREFIX}{id}"),
        items,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn renders_reasoning_then_text() {
        let msg = json!({ "type": "gemini_message", "parts": [
            { "type": "reasoning", "text": "thinking" },
            { "type": "text", "text": "hello" },
        ]});
        let parts = render_parts(&msg, "m1", false);
        assert_eq!(parts.len(), 2);
        match &parts[0] {
            MessagePart::Reasoning { text, .. } => assert_eq!(text, "thinking"),
            other => panic!("expected reasoning, got {other:?}"),
        }
        match &parts[1] {
            MessagePart::Text { text, .. } => assert_eq!(text, "hello"),
            other => panic!("expected text, got {other:?}"),
        }
    }

    #[test]
    fn execute_tool_maps_to_bash_with_status() {
        let msg = json!({ "type": "gemini_message", "parts": [{
            "type": "tool", "toolCallId": "tc1", "kind": "execute", "title": "ls",
            "status": "completed", "input": { "command": "ls" }, "output": "a.txt",
        }]});
        match &render_parts(&msg, "m1", false)[0] {
            MessagePart::ToolCall {
                tool_call_id,
                tool_name,
                args,
                result,
                streaming_status,
                ..
            } => {
                assert_eq!(tool_call_id, "tc1");
                assert_eq!(tool_name, "Bash");
                assert_eq!(args["command"], "ls");
                assert_eq!(result.as_ref().unwrap(), &Value::String("a.txt".into()));
                assert_eq!(streaming_status, &Some(StreamingStatus::Done));
            }
            other => panic!("expected tool-call, got {other:?}"),
        }
    }

    #[test]
    fn edit_tool_with_diffs_renders_apply_patch() {
        let msg = json!({ "type": "gemini_message", "parts": [{
            "type": "tool", "toolCallId": "tc1", "kind": "edit", "title": "Edit a.txt",
            "status": "completed",
            "fileDiffs": [{ "path": "a.txt", "diff": "--- a.txt\n+++ a.txt\n@@\n-x\n+y\n" }],
        }]});
        match &render_parts(&msg, "m1", false)[0] {
            MessagePart::ToolCall {
                tool_name, args, ..
            } => {
                assert_eq!(tool_name, "apply_patch");
                assert_eq!(args["changes"][0]["path"], "a.txt");
            }
            other => panic!("expected tool-call, got {other:?}"),
        }
    }

    #[test]
    fn failed_tool_flags_error() {
        let msg = json!({ "type": "gemini_message", "parts": [{
            "type": "tool", "toolCallId": "tc1", "kind": "execute", "title": "x",
            "status": "failed", "input": {}, "output": "boom",
        }]});
        match &render_parts(&msg, "m1", false)[0] {
            MessagePart::ToolCall {
                is_error,
                streaming_status,
                ..
            } => {
                assert_eq!(is_error, &Some(true));
                assert_eq!(streaming_status, &Some(StreamingStatus::Error));
            }
            other => panic!("expected tool-call, got {other:?}"),
        }
    }

    #[test]
    fn plan_renders_as_todo_list() {
        let msg = json!({ "type": "gemini_message", "parts": [{
            "type": "plan", "entries": [
                { "content": "Step 1", "status": "completed", "priority": "high" },
                { "content": "Step 2", "status": "in_progress", "priority": "medium" },
                { "content": "Step 3", "status": "pending", "priority": "low" },
            ],
        }]});
        match &render_parts(&msg, "m1", false)[0] {
            MessagePart::TodoList { id, items } => {
                assert!(id.starts_with(CLAUDE_TASK_LIST_ID_PREFIX));
                assert_eq!(items.len(), 3);
                assert_eq!(items[0].status, TodoStatus::Completed);
                assert_eq!(items[1].status, TodoStatus::InProgress);
                assert_eq!(items[2].status, TodoStatus::Pending);
            }
            other => panic!("expected todo-list, got {other:?}"),
        }
    }

    #[test]
    fn reasoning_streams_only_while_trailing() {
        let msg = json!({ "type": "gemini_message",
            "parts": [{ "type": "reasoning", "text": "thinking…" }] });
        match &render_parts(&msg, "m1", true)[0] {
            MessagePart::Reasoning { streaming, .. } => assert_eq!(streaming, &Some(true)),
            other => panic!("expected reasoning, got {other:?}"),
        }
        match &render_parts(&msg, "m1", false)[0] {
            MessagePart::Reasoning { streaming, .. } => assert_eq!(streaming, &None),
            other => panic!("expected reasoning, got {other:?}"),
        }
    }
}
