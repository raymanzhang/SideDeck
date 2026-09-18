// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use super::{
    telemetry::Telemetry,
    types::{CodexEvent, CodexSessionMeta},
};
use serde_json::Value;
use std::{
    fs::File,
    io::{BufRead, BufReader, Read, Seek, SeekFrom},
    path::Path,
};

pub const BASELINE_BYTES: u64 = 256 * 1024;
pub const CHUNK_BYTES: u64 = 512 * 1024;
#[derive(Debug, Default)]
pub struct FileCursor {
    pub offset: u64,
    pub identity: u64,
    pub metadata: Option<CodexSessionMeta>,
    pub telemetry: Option<Telemetry>,
    pub initialized: bool,
    pub baseline_end: u64,
    pub discarding: bool,
    pub anchor: Vec<u8>,
}
#[cfg(unix)]
fn identity(m: &std::fs::Metadata) -> u64 {
    use std::os::unix::fs::MetadataExt;
    m.ino()
}
#[cfg(not(unix))]
fn identity(m: &std::fs::Metadata) -> u64 {
    m.created()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |t| t.as_nanos() as u64)
}

/// Read only complete lines, leaving a trailing partial line at its original offset.
/// Every read is bounded, including malformed/no-newline files.
pub fn complete_lines(
    path: &Path,
    offset: u64,
    limit: u64,
) -> std::io::Result<(Vec<(u64, Value)>, u64)> {
    let mut f = File::open(path)?;
    f.seek(SeekFrom::Start(offset))?;
    let mut bytes = Vec::new();
    f.take(limit).read_to_end(&mut bytes)?;
    let end = bytes.iter().rposition(|b| *b == b'\n').map_or(0, |n| n + 1);
    let mut pos = offset;
    let mut records = vec![];
    for line in bytes[..end].split_inclusive(|b| *b == b'\n') {
        if let Ok(v) = serde_json::from_slice(line) {
            records.push((pos, v));
        }
        pos += line.len() as u64;
    }
    Ok((records, pos))
}
fn metadata(v: &Value) -> Option<CodexSessionMeta> {
    if v["type"] != "session_meta" {
        return None;
    }
    let p = &v["payload"];
    let id = p["id"].as_str().or(p["session_id"].as_str())?;
    Some(CodexSessionMeta {
        session_id: id.into(),
        cwd: p["cwd"].as_str().unwrap_or("").into(),
        cli_version: p["cli_version"].as_str().unwrap_or("").into(),
        model_provider: p["model_provider"].as_str().unwrap_or("").into(),
        source: p["originator"].as_str().unwrap_or("").into(),
    })
}
pub fn read_rollout(path: &Path, cursor: &mut FileCursor) -> std::io::Result<Vec<CodexEvent>> {
    let stat = std::fs::metadata(path)?;
    let inode = identity(&stat);
    let changed_in_place =
        if cursor.initialized && !cursor.anchor.is_empty() && stat.len() >= cursor.offset {
            let mut f = File::open(path)?;
            f.seek(SeekFrom::Start(cursor.offset - cursor.anchor.len() as u64))?;
            let mut bytes = vec![0; cursor.anchor.len()];
            f.read_exact(&mut bytes)?;
            bytes != cursor.anchor
        } else {
            false
        };
    if cursor.initialized
        && (cursor.identity != inode || stat.len() < cursor.offset || changed_in_place)
    {
        *cursor = FileCursor::default();
    }
    if !cursor.initialized {
        cursor.identity = inode;
        cursor.baseline_end = stat.len();
        let (head, _) = complete_lines(path, 0, 64 * 1024)?;
        cursor.metadata = head.iter().find_map(|(_, v)| metadata(v));
        if let Some(meta) = &cursor.metadata {
            let mut t = Telemetry::new(&meta.session_id);
            for (offset, v) in &head {
                if v["type"] == "session_meta" {
                    t.apply(v, *offset, true);
                }
            }
            cursor.telemetry = Some(t);
        }
        if stat.len() > BASELINE_BYTES {
            let mut reader = BufReader::new(File::open(path)?);
            reader.seek(SeekFrom::Start(stat.len() - BASELINE_BYTES))?;
            let mut discard = Vec::new();
            reader
                .take(BASELINE_BYTES)
                .read_until(b'\n', &mut discard)?;
            cursor.offset = stat.len() - BASELINE_BYTES + discard.len() as u64;
        }
        cursor.initialized = true;
    }
    if cursor.discarding {
        let mut f = File::open(path)?;
        f.seek(SeekFrom::Start(cursor.offset))?;
        let mut bytes = Vec::new();
        f.take(CHUNK_BYTES).read_to_end(&mut bytes)?;
        if let Some(end) = bytes.iter().position(|b| *b == b'\n') {
            cursor.offset += end as u64 + 1;
            cursor.discarding = false;
        } else {
            cursor.offset += bytes.len() as u64;
            return Ok(vec![]);
        }
    }
    let (records, next) = complete_lines(path, cursor.offset, CHUNK_BYTES)?;
    if next == cursor.offset && stat.len().saturating_sub(cursor.offset) >= CHUNK_BYTES {
        // A single oversized record is outside the bounded telemetry contract.
        cursor.offset += CHUNK_BYTES;
        cursor.anchor.clear();
        cursor.discarding = true;
        return Ok(vec![]);
    }
    let mut events = vec![];
    for (offset, v) in records {
        if let Some(meta) = metadata(&v) {
            if cursor.metadata.is_none() {
                cursor.telemetry = Some(Telemetry::new(&meta.session_id));
                cursor.metadata = Some(meta);
            }
        }
        let Some(meta) = &cursor.metadata else {
            continue;
        };
        let baseline = offset < cursor.baseline_end;
        if let Some(t) = &mut cursor.telemetry {
            t.apply(&v, offset, baseline);
        }
        let p = &v["payload"];
        let kind = p["type"]
            .as_str()
            .or(v["type"].as_str())
            .unwrap_or("unknown");
        events.push(CodexEvent {
            session_id: meta.session_id.clone(),
            event_type: kind.into(),
            timestamp: v["timestamp"].as_str().map(str::to_owned),
            ordinal: Some(offset),
            tool_name: p["name"].as_str().map(str::to_owned),
            summary: None,
        });
    }
    cursor.offset = next;
    let mut f = File::open(path)?;
    let length = next.min(64);
    f.seek(SeekFrom::Start(next - length))?;
    cursor.anchor = vec![0; length as usize];
    f.read_exact(&mut cursor.anchor)?;
    Ok(events)
}
