// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use super::types::{ClaudeEvent, SessionMetadata};
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::Path;

/// Incrementally parse a JSONL file starting from `offset`.
/// Returns newly parsed events, updated session metadata, and the new byte offset.
pub fn parse_jsonl_incremental(
    path: &Path,
    offset: u64,
) -> Result<(Vec<ClaudeEvent>, Option<SessionMetadata>, u64), std::io::Error> {
    let file = std::fs::File::open(path)?;
    let file_len = file.metadata()?.len();

    if offset >= file_len {
        return Ok((Vec::new(), None, offset));
    }

    let mut reader = BufReader::new(file);
    reader.seek(SeekFrom::Start(offset))?;

    let mut events = Vec::new();
    let mut metadata: Option<SessionMetadata> = None;
    let mut current_offset = offset;

    let mut line = String::new();
    loop {
        line.clear();
        let bytes_read = reader.read_line(&mut line)?;
        if bytes_read == 0 {
            break;
        }
        current_offset += bytes_read as u64;

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let record: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[claude-parser] invalid JSON line, skipping: {e}");
                continue;
            }
        };

        let session_id = record
            .get("sessionId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let (event_type, tool_name) = extract_event_type(&record);

        let timestamp = record
            .get("timestamp")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let uuid = record
            .get("uuid")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        events.push(ClaudeEvent {
            session_id: session_id.clone(),
            event_type,
            timestamp,
            tool_name,
            uuid,
        });

        metadata = Some(extract_metadata(&record, metadata));
    }

    Ok((events, metadata, current_offset))
}

/// Extract the event type and optional tool name from a JSONL record.
/// Handles top-level `type` field plus attachment subtype parsing.
fn extract_event_type(record: &serde_json::Value) -> (String, Option<String>) {
    let raw_type = record
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    match raw_type {
        "user" => ("user".into(), None),
        "assistant" => {
            // Check if assistant message contains tool_use content blocks
            let tool = record
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_array())
                .and_then(|blocks| {
                    blocks.iter().find_map(|b| {
                        if b.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                            b.get("name")
                                .and_then(|n| n.as_str())
                                .map(|s| s.to_string())
                        } else {
                            None
                        }
                    })
                });
            if tool.is_some() {
                ("tool_use".into(), tool)
            } else {
                ("assistant".into(), None)
            }
        }
        "tool_use" => {
            let name = record
                .get("name")
                .or_else(|| record.get("tool_name"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            ("tool_use".into(), name)
        }
        "tool_result" => ("tool_result".into(), None),
        "queue-operation" => ("queue-operation".into(), None),
        "attachment" => parse_attachment_subtype(record),
        _ => ("unknown".into(), None),
    }
}

/// Parse attachment subtype from the nested `attachment.type` field.
fn parse_attachment_subtype(record: &serde_json::Value) -> (String, Option<String>) {
    let attachment = match record.get("attachment") {
        Some(a) => a,
        None => return ("attachment".into(), None),
    };

    let sub_type = attachment
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match sub_type {
        "tool_use" => {
            let name = attachment
                .get("name")
                .or_else(|| attachment.get("tool_name"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            ("tool_use".into(), name)
        }
        "tool_result" => ("tool_result".into(), None),
        "agent_listing_delta" | "skill_listing" => ("system".into(), None),
        "hook_non_blocking_error" => ("system".into(), None),
        _ => ("attachment".into(), None),
    }
}

/// Extract session-level metadata from a JSONL record, merging with any prior values.
fn extract_metadata(
    record: &serde_json::Value,
    previous: Option<SessionMetadata>,
) -> SessionMetadata {
    let mut meta = previous.unwrap_or_default();

    if let Some(v) = record.get("cwd").and_then(|v| v.as_str()) {
        meta.cwd = Some(v.to_string());
    }
    if let Some(v) = record.get("version").and_then(|v| v.as_str()) {
        meta.version = Some(v.to_string());
    }
    if let Some(v) = record.get("gitBranch").and_then(|v| v.as_str()) {
        meta.git_branch = Some(v.to_string());
    }
    if let Some(v) = record.get("entrypoint").and_then(|v| v.as_str()) {
        meta.entrypoint = Some(v.to_string());
    }

    meta
}
