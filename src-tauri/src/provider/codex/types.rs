// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

// ---------------------------------------------------------------------------
// CodexThread – mirrors Codex app-server Thread schema (v2)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexThread {
    pub id: String,
    pub name: Option<String>,
    pub cwd: String,
    pub status: CodexThreadStatus,
    pub model: Option<String>,
    pub model_provider: String,
    pub source: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CodexThreadStatus {
    Active {
        #[serde(default, rename = "activeFlags")]
        active_flags: Vec<String>,
    },
    Idle,
    NotLoaded,
    SystemError,
}

impl Default for CodexThreadStatus {
    fn default() -> Self {
        Self::NotLoaded
    }
}

// ---------------------------------------------------------------------------
// CodexEvent – parsed from rollout JSONL
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexEvent {
    pub session_id: String,
    pub event_type: String,
    pub timestamp: Option<String>,
    pub ordinal: Option<u64>,
    pub tool_name: Option<String>,
    pub summary: Option<String>,
}

// ---------------------------------------------------------------------------
// CodexConfig – parsed from ~/.codex/config.toml
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexConfig {
    pub model: String,
    pub model_provider: String,
    pub sandbox_mode: String,
    pub approval_policy: String,
}

impl CodexConfig {
    pub fn from_toml_file() -> Self {
        let path = super::watcher::codex_home().join("config.toml");
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[codex] failed to read config.toml: {e}");
                return Self::default();
            }
        };

        let table: toml::Table = match content.parse() {
            Ok(t) => t,
            Err(e) => {
                eprintln!("[codex] failed to parse config.toml: {e}");
                return Self::default();
            }
        };

        let get_str = |key: &str| -> String {
            table
                .get(key)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        };

        Self {
            model: get_str("model"),
            model_provider: get_str("model_provider"),
            sandbox_mode: get_str("sandbox_mode"),
            approval_policy: get_str("approval_policy"),
        }
    }
}

// ---------------------------------------------------------------------------
// CodexSessionIndexEntry – parsed from session_index.jsonl
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexSessionIndexEntry {
    pub id: String,
    pub thread_name: String,
    pub updated_at: String,
}

// ---------------------------------------------------------------------------
// CodexSessionMeta – extracted from rollout session_meta events
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionMeta {
    pub session_id: String,
    pub cwd: String,
    pub cli_version: String,
    pub model_provider: String,
    pub source: String,
}

// ---------------------------------------------------------------------------
// Ring buffer for recent events (cap = 50)
// ---------------------------------------------------------------------------

const EVENTS_RING_BUFFER_CAP: usize = 50;

#[derive(Debug, Clone)]
pub struct EventRingBuffer {
    buf: VecDeque<CodexEvent>,
    cap: usize,
}

impl EventRingBuffer {
    pub fn new() -> Self {
        Self {
            buf: VecDeque::with_capacity(EVENTS_RING_BUFFER_CAP),
            cap: EVENTS_RING_BUFFER_CAP,
        }
    }

    pub fn push(&mut self, event: CodexEvent) {
        if self.buf.iter().any(|old| {
            old.session_id == event.session_id
                && old.ordinal == event.ordinal
                && old.timestamp == event.timestamp
                && old.event_type == event.event_type
        }) {
            return;
        }
        if self.buf.len() >= self.cap {
            self.buf.pop_front();
        }
        self.buf.push_back(event);
    }

    pub fn iter(&self) -> impl Iterator<Item = &CodexEvent> {
        self.buf.iter()
    }
}
