// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

//! Polling is deliberate: every five seconds discover paths and read only new bytes.
//! The root and index are checked on every poll; new date directories are discovered
//! without depending on a platform-specific nonrecursive watch receiving nested events.
use super::{
    parser::{complete_lines, read_rollout, FileCursor, BASELINE_BYTES},
    types::{CodexSessionIndexEntry, EventRingBuffer},
};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};
pub fn codex_home() -> PathBuf {
    std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".codex")
        })
}
#[derive(Default)]
pub struct FileCollector {
    pub files: HashMap<PathBuf, FileCursor>,
    pub events: HashMap<String, EventRingBuffer>,
    pub index: HashMap<String, CodexSessionIndexEntry>,
    index_offset: u64,
    index_identity: u64,
}
fn discover(root: &Path, depth: usize, files: &mut Vec<PathBuf>) {
    if depth > 4 {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                discover(&p, depth + 1, files);
            } else if p.extension().is_some_and(|x| x == "jsonl") {
                files.push(p);
            }
        }
    }
}
impl FileCollector {
    pub fn refresh(&mut self, root: &Path) -> std::io::Result<()> {
        if !root.is_dir() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "CODEX_HOME unavailable",
            ));
        }
        let index = root.join("session_index.jsonl");
        if let Ok(stat) = std::fs::metadata(&index) {
            #[cfg(unix)]
            let inode = {
                use std::os::unix::fs::MetadataExt;
                stat.ino()
            };
            #[cfg(not(unix))]
            let inode = 0;
            if stat.len() < self.index_offset || inode != self.index_identity {
                self.index_offset = 0;
                self.index.clear();
                self.index_identity = inode;
            }
            if self.index_offset == 0 && stat.len() > BASELINE_BYTES {
                self.index_offset = stat.len() - BASELINE_BYTES;
            }
            if let Ok((rows, next)) = complete_lines(&index, self.index_offset, BASELINE_BYTES) {
                for (_, v) in rows {
                    if let Ok(entry) = serde_json::from_value::<CodexSessionIndexEntry>(v) {
                        self.index.insert(entry.id.clone(), entry);
                    }
                }
                self.index_offset = next;
            }
        }
        let mut paths = vec![];
        discover(&root.join("sessions"), 0, &mut paths);
        paths.sort();
        paths.reverse();
        paths.truncate(200);
        self.files.retain(|p, _| paths.contains(p));
        for path in paths {
            let cursor = self.files.entry(path.clone()).or_default();
            let events = read_rollout(&path, cursor)?;
            for event in events {
                self.events
                    .entry(event.session_id.clone())
                    .or_insert_with(EventRingBuffer::new)
                    .push(event);
            }
        }
        self.events.retain(|id, _| {
            self.files
                .values()
                .any(|f| f.metadata.as_ref().is_some_and(|m| &m.session_id == id))
        });
        if self.index.len() > 500 {
            let mut rows: Vec<_> = self.index.values().collect();
            rows.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
            let ids: Vec<_> = rows.iter().take(500).map(|r| r.id.clone()).collect();
            self.index.retain(|id, _| ids.contains(id));
        }
        Ok(())
    }
}
