// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};

/// A running Claude Code session, populated from `claude agents --json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSession {
    pub session_id: String,
    pub cwd: String,
    pub session_type: String,
    pub started_at: Option<String>,
    pub status: String,
}

/// A single event parsed from a session JSONL file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeEvent {
    pub session_id: String,
    pub event_type: String,
    pub timestamp: Option<String>,
    pub tool_name: Option<String>,
    pub uuid: Option<String>,
}

/// Per-session metadata extracted from JSONL records.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SessionMetadata {
    pub cwd: Option<String>,
    pub version: Option<String>,
    pub git_branch: Option<String>,
    pub entrypoint: Option<String>,
}

const EVENTS_RING_BUFFER_CAP: usize = 50;

/// Ring buffer holding the most recent events for a session.
#[derive(Debug, Clone)]
pub struct EventRingBuffer {
    buf: VecDeque<ClaudeEvent>,
    cap: usize,
}

impl EventRingBuffer {
    pub fn new() -> Self {
        Self {
            buf: VecDeque::with_capacity(EVENTS_RING_BUFFER_CAP),
            cap: EVENTS_RING_BUFFER_CAP,
        }
    }

    pub fn push(&mut self, event: ClaudeEvent) {
        if self.buf.len() >= self.cap {
            self.buf.pop_front();
        }
        self.buf.push_back(event);
    }

    pub fn iter(&self) -> impl Iterator<Item = &ClaudeEvent> {
        self.buf.iter()
    }
}

/// Shared state between the file watcher and `poll()`.
#[derive(Debug)]
pub struct ClaudeState {
    pub sessions: Vec<ClaudeSession>,
    pub events: HashMap<String, EventRingBuffer>,
    pub metadata: HashMap<String, SessionMetadata>,
    pub file_offsets: HashMap<String, u64>,
}

impl ClaudeState {
    pub fn new() -> Self {
        Self {
            sessions: Vec::new(),
            events: HashMap::new(),
            metadata: HashMap::new(),
            file_offsets: HashMap::new(),
        }
    }
}
