// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

mod parser;
mod types;
mod watcher;

use self::types::{ClaudeSession, ClaudeState};
use self::watcher::FileWatcher;
use super::traits::{Provider, ProviderCategory};
use serde_json::json;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub struct ClaudeProvider {
    state: Arc<Mutex<ClaudeState>>,
    /// Lazily initialized on first `poll()` — cannot be created in `new()`
    /// because Tauri's `setup()` runs before the Tokio runtime is available.
    watcher: Mutex<Option<Arc<Mutex<FileWatcher>>>>,
}

impl ClaudeProvider {
    pub fn new() -> Self {
        let state = Arc::new(Mutex::new(ClaudeState::new()));

        Self {
            state,
            watcher: Mutex::new(None),
        }
    }

    /// Ensure the file watcher is running. Called from `poll()` which
    /// executes inside the Tokio runtime.
    fn ensure_watcher(&self) -> Option<Arc<Mutex<FileWatcher>>> {
        let mut guard = match self.watcher.lock() {
            Ok(g) => g,
            Err(_) => return None,
        };
        if guard.is_none() {
            match watcher::start_watcher(Arc::clone(&self.state)) {
                Ok(w) => *guard = Some(w),
                Err(e) => {
                    eprintln!("[claude] failed to start file watcher: {e}");
                }
            }
        }
        guard.clone()
    }
}

impl Provider for ClaudeProvider {
    fn id(&self) -> &str {
        "claude"
    }

    fn display_name(&self) -> &str {
        "Claude Code"
    }

    fn category(&self) -> ProviderCategory {
        ProviderCategory::AITool
    }

    fn poll_interval(&self) -> Duration {
        Duration::from_secs(5)
    }

    fn poll(
        &self,
    ) -> Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>>,
                > + Send
                + '_,
        >,
    > {
        Box::pin(async {
            if !check_cli_available() {
                return Ok(json!({
                    "status": "unavailable",
                    "sessions": [],
                    "recent_events": {},
                    "error": "Claude CLI not found. Install in ~/.local/bin, /opt/homebrew/bin or /usr/local/bin, or set SIDEDECK_CLAUDE_PATH to an absolute executable path and restart."
                }));
            }

            let sessions = match fetch_sessions().await {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[claude] CLI error: {e}");
                    return Ok(json!({
                        "status": "unavailable",
                        "sessions": [],
                        "recent_events": {},
                        "error": format!("{e}")
                    }));
                }
            };

            // Derive watch paths from session CWDs and sync watcher
            if let Some(ref watcher) = self.ensure_watcher() {
                let desired_paths: Vec<PathBuf> = sessions
                    .iter()
                    .filter_map(|s| cwd_to_projects_dir(&s.cwd))
                    .collect();

                if let Ok(mut w) = watcher.lock() {
                    w.sync_paths(&desired_paths);
                }
            }

            // Update sessions in shared state
            if let Ok(mut st) = self.state.lock() {
                st.sessions = sessions.clone();
            }

            // Build response from shared state
            let (recent_events, metadata) = {
                let st =
                    self.state
                        .lock()
                        .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> {
                            format!("lock poisoned: {e}").into()
                        })?;

                let mut events_map = serde_json::Map::new();
                for (sid, ring) in &st.events {
                    let arr: Vec<serde_json::Value> = ring
                        .iter()
                        .map(|e| serde_json::to_value(e).unwrap_or_default())
                        .collect();
                    events_map.insert(sid.clone(), serde_json::Value::Array(arr));
                }

                let mut meta_map = serde_json::Map::new();
                for (sid, meta) in &st.metadata {
                    meta_map.insert(sid.clone(), serde_json::to_value(meta).unwrap_or_default());
                }

                (
                    serde_json::Value::Object(events_map),
                    serde_json::Value::Object(meta_map),
                )
            };

            Ok(json!({
                "status": "ok",
                "sessions": sessions,
                "recent_events": recent_events,
                "metadata": metadata,
            }))
        })
    }
}

/// Check if the `claude` CLI is available on PATH.
fn check_cli_available() -> bool {
    super::cli::resolve("claude").is_some()
}

/// Execute `claude agents --json` and parse the output into `ClaudeSession` structs.
async fn fetch_sessions() -> Result<Vec<ClaudeSession>, Box<dyn std::error::Error + Send + Sync>> {
    let output = super::cli::command("claude")?
        .args(["agents", "--json"])
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("claude agents --json failed: {stderr}").into());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let raw: serde_json::Value = serde_json::from_str(&stdout)?;

    let arr = raw.as_array().ok_or("expected JSON array")?;

    let sessions: Vec<ClaudeSession> = arr
        .iter()
        .map(|item| {
            let session_id = item
                .get("sessionId")
                .or_else(|| item.get("session_id"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let cwd = item
                .get("cwd")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let session_type = item
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("interactive")
                .to_string();

            let started_at = item
                .get("startedAt")
                .or_else(|| item.get("started_at"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let status = item
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("running")
                .to_string();

            ClaudeSession {
                session_id,
                cwd,
                session_type,
                started_at,
                status,
            }
        })
        .collect();

    Ok(sessions)
}

/// Convert a project CWD path to the corresponding `~/.claude/projects/` directory.
/// `/path/to/project` → `~/.claude/projects/-path-to-project/`
fn cwd_to_projects_dir(cwd: &str) -> Option<PathBuf> {
    if cwd.is_empty() {
        return None;
    }

    let home = dirs_next_home()?;
    let encoded = cwd.replace('/', "-");
    let dir = home.join(".claude").join("projects").join(encoded);

    if dir.exists() {
        Some(dir)
    } else {
        None
    }
}

/// Get the user's home directory.
fn dirs_next_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}
