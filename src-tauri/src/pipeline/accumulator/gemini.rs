//! Gemini CLI (ACP) event handling — `gemini/`-namespaced events normalized by
//! the sidecar from the Agent Client Protocol `session/update` stream.
//!
//! Unlike opencode (cumulative snapshots), ACP message/thought chunks are TRUE
//! deltas (append), and tool calls are patch-by-id (`tool_call` then
//! `tool_call_update` keyed by `toolCallId`). A turn finalizes on
//! `gemini/turn_complete`. Output is a `gemini_message` rendered by
//! `adapter/gemini_parts.rs`.

use std::collections::HashMap;

use serde_json::{json, Value};

use super::super::types::{CollectedTurn, MessageRole};
use super::{PushOutcome, StreamAccumulator};

const PLAN_PART_ID: &str = "__gemini_plan";

#[derive(Debug, Default)]
pub(super) struct GeminiRunState {
    pub turn_id: Option<String>,
    /// Ordered render parts (text / reasoning / tool / plan).
    pub parts: Vec<Value>,
    /// part_id (text/thought run id) or toolCallId → index into `parts`.
    pub part_index: HashMap<String, usize>,
    pub model: Option<String>,
    /// Turn duration (ms) from `gemini/turn_complete`; drives the duration
    /// footer synthesized on finalize. Absent → no footer (keeps fixtures
    /// without timing byte-identical and free of wall-clock dependence).
    pub turn_duration_ms: Option<f64>,
}

pub(super) fn new_run_state() -> GeminiRunState {
    GeminiRunState::default()
}

// ── Event handlers ──────────────────────────────────────────────────────────

pub(super) fn handle_session_init(acc: &mut StreamAccumulator, value: &Value) -> PushOutcome {
    if let Some(model) = value.get("model").and_then(Value::as_str) {
        acc.gemini_state.model = Some(model.to_string());
        acc.resolved_model = model.to_string();
    }
    PushOutcome::NoOp
}

pub(super) fn handle_message_delta(acc: &mut StreamAccumulator, value: &Value) -> PushOutcome {
    append_chunk(acc, value, "text")
}

pub(super) fn handle_thought_delta(acc: &mut StreamAccumulator, value: &Value) -> PushOutcome {
    append_chunk(acc, value, "reasoning")
}

fn append_chunk(acc: &mut StreamAccumulator, value: &Value, part_type: &str) -> PushOutcome {
    let Some(part_id) = value.get("part_id").and_then(Value::as_str) else {
        return PushOutcome::NoOp;
    };
    let delta = value
        .get("delta")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if delta.is_empty() {
        return PushOutcome::NoOp;
    }
    let part_id = part_id.to_string();
    if let Some(&idx) = acc.gemini_state.part_index.get(&part_id) {
        if let Some(slot) = acc.gemini_state.parts.get_mut(idx) {
            let prev = slot.get("text").and_then(Value::as_str).unwrap_or_default();
            slot["text"] = json!(format!("{prev}{delta}"));
        }
    } else {
        let idx = acc.gemini_state.parts.len();
        acc.gemini_state
            .parts
            .push(json!({ "type": part_type, "text": delta }));
        acc.gemini_state.part_index.insert(part_id, idx);
    }
    rebuild_collected(acc);
    PushOutcome::StreamingDelta
}

pub(super) fn handle_tool_call(acc: &mut StreamAccumulator, value: &Value) -> PushOutcome {
    let Some(call_id) = value.get("tool_call_id").and_then(Value::as_str) else {
        return PushOutcome::NoOp;
    };
    let rendered = json!({
        "type": "tool",
        "toolCallId": call_id,
        "kind": value.get("kind").and_then(Value::as_str).unwrap_or("other"),
        "title": value.get("title").and_then(Value::as_str).unwrap_or_default(),
        "status": value.get("status").and_then(Value::as_str).unwrap_or("pending"),
        "input": value.get("input").cloned().unwrap_or_else(|| json!({})),
    });
    upsert_part(acc, call_id, rendered);
    rebuild_collected(acc);
    PushOutcome::StreamingDelta
}

pub(super) fn handle_tool_call_update(acc: &mut StreamAccumulator, value: &Value) -> PushOutcome {
    let Some(call_id) = value.get("tool_call_id").and_then(Value::as_str) else {
        return PushOutcome::NoOp;
    };
    let Some(&idx) = acc.gemini_state.part_index.get(call_id) else {
        // Update before the initial tool_call — synthesize a tool part so the
        // status/output still render.
        let rendered = json!({
            "type": "tool",
            "toolCallId": call_id,
            "kind": value.get("kind").and_then(Value::as_str).unwrap_or("other"),
            "title": value.get("title").and_then(Value::as_str).unwrap_or_default(),
            "status": value.get("status").and_then(Value::as_str).unwrap_or("in_progress"),
            "input": value.get("input").cloned().unwrap_or_else(|| json!({})),
        });
        upsert_part(acc, call_id, rendered);
        merge_tool_update(acc, call_id, value);
        rebuild_collected(acc);
        return PushOutcome::StreamingDelta;
    };
    let _ = idx;
    merge_tool_update(acc, call_id, value);
    rebuild_collected(acc);
    PushOutcome::StreamingDelta
}

fn merge_tool_update(acc: &mut StreamAccumulator, call_id: &str, value: &Value) {
    let Some(&idx) = acc.gemini_state.part_index.get(call_id) else {
        return;
    };
    let Some(slot) = acc.gemini_state.parts.get_mut(idx) else {
        return;
    };
    if let Some(status) = value.get("status").and_then(Value::as_str) {
        slot["status"] = json!(status);
    }
    if let Some(title) = value.get("title").and_then(Value::as_str) {
        if !title.is_empty() {
            slot["title"] = json!(title);
        }
    }
    if let Some(output) = value.get("output").and_then(Value::as_str) {
        if !output.is_empty() {
            slot["output"] = json!(output);
        }
    }
    if let Some(diffs) = value.get("diffs").and_then(Value::as_array) {
        let changes: Vec<Value> = diffs
            .iter()
            .filter_map(|d| {
                let path = d.get("path").and_then(Value::as_str)?;
                let diff = d.get("diff").and_then(Value::as_str)?;
                (!diff.is_empty()).then(|| json!({ "path": path, "diff": diff }))
            })
            .collect();
        if !changes.is_empty() {
            slot["fileDiffs"] = json!(changes);
        }
    }
    if value
        .get("status")
        .and_then(Value::as_str)
        .is_some_and(|s| s == "failed")
    {
        slot["isError"] = json!(true);
    }
}

pub(super) fn handle_plan(acc: &mut StreamAccumulator, value: &Value) -> PushOutcome {
    let Some(entries) = value.get("entries").and_then(Value::as_array) else {
        return PushOutcome::NoOp;
    };
    let rendered = json!({ "type": "plan", "entries": entries });
    upsert_part(acc, PLAN_PART_ID, rendered);
    rebuild_collected(acc);
    PushOutcome::StreamingDelta
}

pub(super) fn handle_turn_complete(acc: &mut StreamAccumulator, value: &Value) -> PushOutcome {
    if let Some(d) = value.get("duration_ms").and_then(Value::as_f64) {
        acc.gemini_state.turn_duration_ms = Some(d);
    }
    finalize(acc)
}

// Drain in-flight state on abort (no `gemini/turn_complete` will arrive).
pub(super) fn flush_in_progress(acc: &mut StreamAccumulator) {
    finalize(acc);
}

// ── Internals ───────────────────────────────────────────────────────────────

fn upsert_part(acc: &mut StreamAccumulator, part_id: &str, rendered: Value) {
    if let Some(&idx) = acc.gemini_state.part_index.get(part_id) {
        if let Some(slot) = acc.gemini_state.parts.get_mut(idx) {
            // Preserve accumulated output/diffs that a fresh tool_call lacks.
            let mut merged = rendered;
            for key in ["output", "fileDiffs", "isError"] {
                if merged.get(key).is_none() {
                    if let Some(existing) = slot.get(key) {
                        merged[key] = existing.clone();
                    }
                }
            }
            *slot = merged;
        }
    } else {
        let idx = acc.gemini_state.parts.len();
        acc.gemini_state.parts.push(rendered);
        acc.gemini_state.part_index.insert(part_id.to_string(), idx);
    }
}

fn rebuild_collected(acc: &mut StreamAccumulator) {
    if acc.gemini_state.parts.is_empty() {
        return;
    }
    let turn_id = acc
        .gemini_state
        .turn_id
        .get_or_insert_with(|| uuid::Uuid::new_v4().to_string())
        .clone();
    let session_id_value: Value = acc
        .session_id
        .as_deref()
        .map(|s| Value::String(s.to_string()))
        .unwrap_or(Value::Null);
    let message = json!({
        "type": "gemini_message",
        "session_id": session_id_value,
        "role": "assistant",
        "model": acc.gemini_state.model,
        "parts": acc.gemini_state.parts.clone(),
    });
    let raw = message.to_string();

    if let Some(pos) = acc.collected.iter().rposition(|m| m.id == turn_id) {
        acc.collected[pos].raw_json = raw;
        acc.collected[pos].parsed = Some(message);
        acc.gemini_partial_idx = Some(pos);
    } else {
        let idx = acc.collected.len();
        acc.collect_message(&raw, &message, MessageRole::Assistant, Some(&turn_id));
        acc.gemini_partial_idx = Some(idx);
    }
}

fn finalize(acc: &mut StreamAccumulator) -> PushOutcome {
    if acc.gemini_state.parts.is_empty() {
        return PushOutcome::NoOp;
    }
    rebuild_collected(acc);
    acc.gemini_partial_idx = None;

    let turn_id = acc
        .gemini_state
        .turn_id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let assistant_text: String = acc
        .gemini_state
        .parts
        .iter()
        .filter(|p| p.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|p| p.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("");
    if !assistant_text.is_empty() {
        if !acc.assistant_text.is_empty() {
            acc.assistant_text.push('\n');
        }
        acc.assistant_text.push_str(&assistant_text);
    }

    if let Some(entry) = acc.collected.iter().rev().find(|m| m.id == turn_id) {
        acc.turns.push(CollectedTurn {
            id: turn_id,
            role: MessageRole::Assistant,
            content_json: entry.raw_json.clone(),
        });
    }

    // Synthesize a turn-result footer ("Ns • X ago") when the sidecar supplied
    // a turn duration. Gated so trimmed fixtures (no timing) stay byte-identical.
    if let Some(duration) = acc.gemini_state.turn_duration_ms {
        if duration > 0.0 {
            let enriched = json!({ "type": "turn/completed", "duration_ms": duration });
            let enriched_str = serde_json::to_string(&enriched).unwrap_or_default();
            let id = uuid::Uuid::new_v4().to_string();
            acc.result_id = Some(id.clone());
            acc.result_json = Some(enriched_str.clone());
            acc.collect_message(&enriched_str, &enriched, MessageRole::Assistant, Some(&id));
        }
    }

    // Reset per-turn state.
    acc.gemini_state.turn_id = None;
    acc.gemini_state.parts.clear();
    acc.gemini_state.part_index.clear();
    acc.gemini_state.turn_duration_ms = None;

    PushOutcome::Finalized
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::accumulator::StreamAccumulator;
    use serde_json::json;

    fn msg_delta(part_id: &str, delta: &str) -> Value {
        json!({ "type": "gemini/agent_message_chunk", "session_id": "s1",
                "part_id": part_id, "delta": delta })
    }
    fn thought_delta(part_id: &str, delta: &str) -> Value {
        json!({ "type": "gemini/agent_thought_chunk", "session_id": "s1",
                "part_id": part_id, "delta": delta })
    }
    fn complete() -> Value {
        json!({ "type": "gemini/turn_complete", "session_id": "s1" })
    }

    #[test]
    fn text_chunks_stream_and_finalize() {
        let mut acc = StreamAccumulator::new("gemini", "");
        let out = acc.push_event(&msg_delta("text:1", "Hel"), "");
        assert_eq!(out, PushOutcome::StreamingDelta);
        acc.push_event(&msg_delta("text:1", "lo"), "");
        let parsed = acc.collected()[0].parsed.as_ref().unwrap();
        assert_eq!(parsed["type"], "gemini_message");
        assert_eq!(parsed["parts"][0]["text"], "Hello");
        let out = acc.push_event(&complete(), "");
        assert_eq!(out, PushOutcome::Finalized);
        assert_eq!(acc.turns_len(), 1);
    }

    #[test]
    fn thought_then_text_render_in_order() {
        let mut acc = StreamAccumulator::new("gemini", "");
        acc.push_event(&thought_delta("thought:1", "Think"), "");
        acc.push_event(&thought_delta("thought:1", "ing"), "");
        acc.push_event(&msg_delta("text:2", "Answer"), "");
        acc.push_event(&complete(), "");
        let parsed = acc.collected()[0].parsed.as_ref().unwrap();
        assert_eq!(parsed["parts"][0]["type"], "reasoning");
        assert_eq!(parsed["parts"][0]["text"], "Thinking");
        assert_eq!(parsed["parts"][1]["type"], "text");
        assert_eq!(parsed["parts"][1]["text"], "Answer");
    }

    #[test]
    fn tool_call_then_update_merges_by_id() {
        let mut acc = StreamAccumulator::new("gemini", "");
        acc.push_event(
            &json!({ "type": "gemini/tool_call", "session_id": "s1",
                "tool_call_id": "tc1", "title": "ls -la", "kind": "execute",
                "status": "in_progress", "input": { "command": "ls -la" } }),
            "",
        );
        acc.push_event(
            &json!({ "type": "gemini/tool_call_update", "session_id": "s1",
                "tool_call_id": "tc1", "status": "completed", "output": "a.txt\nb.txt" }),
            "",
        );
        acc.push_event(&complete(), "");
        let tool = &acc.collected()[0].parsed.as_ref().unwrap()["parts"][0];
        assert_eq!(tool["type"], "tool");
        assert_eq!(tool["toolCallId"], "tc1");
        assert_eq!(tool["status"], "completed");
        assert_eq!(tool["output"], "a.txt\nb.txt");
        assert_eq!(tool["kind"], "execute");
    }

    #[test]
    fn edit_tool_update_carries_file_diffs() {
        let mut acc = StreamAccumulator::new("gemini", "");
        acc.push_event(
            &json!({ "type": "gemini/tool_call", "session_id": "s1",
                "tool_call_id": "tc1", "title": "Edit a.txt", "kind": "edit",
                "status": "in_progress", "input": {} }),
            "",
        );
        acc.push_event(
            &json!({ "type": "gemini/tool_call_update", "session_id": "s1",
                "tool_call_id": "tc1", "status": "completed",
                "diffs": [{ "path": "a.txt", "diff": "--- a.txt\n+++ a.txt\n@@\n-x\n+y\n" }] }),
            "",
        );
        acc.push_event(&complete(), "");
        let tool = &acc.collected()[0].parsed.as_ref().unwrap()["parts"][0];
        let diffs = tool["fileDiffs"].as_array().expect("fileDiffs present");
        assert_eq!(diffs[0]["path"], "a.txt");
    }

    #[test]
    fn plan_snapshot_is_latest_wins() {
        let mut acc = StreamAccumulator::new("gemini", "");
        acc.push_event(
            &json!({ "type": "gemini/plan", "session_id": "s1",
                "entries": [{ "content": "Step 1", "status": "pending" }] }),
            "",
        );
        acc.push_event(
            &json!({ "type": "gemini/plan", "session_id": "s1",
                "entries": [{ "content": "Step 1", "status": "completed" },
                            { "content": "Step 2", "status": "in_progress" }] }),
            "",
        );
        acc.push_event(&complete(), "");
        let plan = &acc.collected()[0].parsed.as_ref().unwrap()["parts"][0];
        assert_eq!(plan["type"], "plan");
        assert_eq!(plan["entries"].as_array().unwrap().len(), 2);
        assert_eq!(plan["entries"][0]["status"], "completed");
    }

    #[test]
    fn session_init_and_usage_are_noops_not_dropped() {
        let mut acc = StreamAccumulator::new("gemini", "");
        for ev in [
            json!({ "type": "gemini/session_init", "session_id": "s1", "model": "gemini-2.5-pro" }),
            json!({ "type": "gemini/usage", "session_id": "s1", "used": 100, "size": 1000000 }),
        ] {
            let out = acc.push_event(&ev, "");
            assert_eq!(out, PushOutcome::NoOp);
        }
        assert!(
            acc.dropped_event_types().is_empty(),
            "informational events must not be dropped: {:?}",
            acc.dropped_event_types()
        );
    }

    #[test]
    fn abort_flush_finalizes_in_flight_turn() {
        let mut acc = StreamAccumulator::new("gemini", "");
        acc.push_event(&msg_delta("text:1", "partial"), "");
        assert_eq!(acc.turns_len(), 0);
        flush_in_progress(&mut acc);
        assert_eq!(acc.turns_len(), 1);
    }
}
