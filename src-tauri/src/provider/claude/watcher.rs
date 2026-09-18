// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use super::parser::parse_jsonl_incremental;
use super::types::ClaudeState;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

/// Handle wrapping a `notify` watcher with dynamic path management.
pub struct FileWatcher {
    watcher: RecommendedWatcher,
    watched_paths: Vec<PathBuf>,
}

impl FileWatcher {
    /// Add a directory to the watch list. Ignores errors for non-existent paths.
    pub fn add_watch_path(&mut self, path: &Path) {
        if !path.exists() {
            eprintln!(
                "[claude-watcher] path does not exist, skipping: {}",
                path.display()
            );
            return;
        }
        if self.watched_paths.iter().any(|p| p == path) {
            return;
        }
        match self.watcher.watch(path, RecursiveMode::NonRecursive) {
            Ok(()) => {
                self.watched_paths.push(path.to_path_buf());
            }
            Err(e) => {
                eprintln!("[claude-watcher] failed to watch {}: {e}", path.display());
            }
        }
    }

    /// Remove a directory from the watch list.
    pub fn remove_watch_path(&mut self, path: &Path) {
        if let Some(idx) = self.watched_paths.iter().position(|p| p == path) {
            let _ = self.watcher.unwatch(path);
            self.watched_paths.swap_remove(idx);
        }
    }

    /// Sync watched paths: add new ones and remove stale ones.
    pub fn sync_paths(&mut self, desired: &[PathBuf]) {
        let to_remove: Vec<PathBuf> = self
            .watched_paths
            .iter()
            .filter(|p| !desired.contains(p))
            .cloned()
            .collect();
        for path in &to_remove {
            self.remove_watch_path(path);
        }
        for path in desired {
            self.add_watch_path(path);
        }
    }
}

/// Start the file system watcher in a background tokio task.
/// Returns an `Arc<Mutex<FileWatcher>>` for dynamic path management from `poll()`.
pub fn start_watcher(
    state: Arc<Mutex<ClaudeState>>,
) -> Result<Arc<Mutex<FileWatcher>>, Box<dyn std::error::Error + Send + Sync>> {
    let (tx, mut rx) = mpsc::channel::<Event>(256);

    let watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let _ = tx.blocking_send(event);
            }
        },
        Config::default(),
    )?;

    let file_watcher = Arc::new(Mutex::new(FileWatcher {
        watcher,
        watched_paths: Vec::new(),
    }));

    let state_clone = state;
    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            handle_fs_event(event, &state_clone);
        }
    });

    Ok(file_watcher)
}

/// Process a single file system event: incrementally parse changed JSONL files
/// and update the shared state.
fn handle_fs_event(event: Event, state: &Arc<Mutex<ClaudeState>>) {
    let dominated = matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_));
    if !dominated {
        return;
    }

    for path in &event.paths {
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }

        let path_key = path.to_string_lossy().to_string();

        let current_offset = {
            let st = match state.lock() {
                Ok(s) => s,
                Err(_) => continue,
            };
            st.file_offsets.get(&path_key).copied().unwrap_or(0)
        };

        let (events, metadata, new_offset) = match parse_jsonl_incremental(path, current_offset) {
            Ok(result) => result,
            Err(e) => {
                eprintln!("[claude-watcher] parse error for {}: {e}", path.display());
                continue;
            }
        };

        if events.is_empty() {
            continue;
        }

        let session_id = events[0].session_id.clone();

        let mut st = match state.lock() {
            Ok(s) => s,
            Err(_) => continue,
        };

        st.file_offsets.insert(path_key, new_offset);

        let ring = st
            .events
            .entry(session_id.clone())
            .or_insert_with(super::types::EventRingBuffer::new);
        for ev in events {
            ring.push(ev);
        }

        if let Some(meta) = metadata {
            st.metadata.insert(session_id, meta);
        }
    }
}
