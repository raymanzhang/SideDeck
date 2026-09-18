// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

//! Persist only waiting identities, never conversation/tool content. This makes
//! no-request-ID episodes stable across a HUD restart until an explicit exit.
use super::telemetry::{now_ms, Episode, Telemetry};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::PathBuf};
#[derive(Serialize, Deserialize)]
struct Saved {
    id: String,
    turn_id: Option<String>,
    state: String,
    episodes: Vec<Episode>,
    at: i64,
}
fn path() -> Option<PathBuf> {
    Some(
        PathBuf::from(std::env::var_os("HOME")?)
            .join("Library/Application Support/com.syshud.app/codex-episodes-v1.json"),
    )
}
pub fn load() -> HashMap<String, Telemetry> {
    path().map(load_path).unwrap_or_default()
}
fn load_path(path: PathBuf) -> HashMap<String, Telemetry> {
    let mut result = HashMap::new();
    let Ok(bytes) = std::fs::read(path) else {
        return result;
    };
    if bytes.len() > 256 * 1024 {
        return result;
    }
    let Ok(rows) = serde_json::from_slice::<Vec<Saved>>(&bytes) else {
        return result;
    };
    for row in rows.into_iter().take(200) {
        if now_ms() - row.at > 7 * 86400_000 || row.at > now_ms() + 300_000 {
            continue;
        }
        let mut t = Telemetry::new(&row.id);
        t.turn_id = row.turn_id;
        t.state = row.state;
        t.episodes = row.episodes;
        t.waiting_since = t.episodes.first().and_then(|e| e.started_at);
        t.stamp("state", "ipc", row.at, true);
        result.insert(row.id, t);
    }
    result
}
pub fn save(values: &HashMap<String, Telemetry>) {
    let Some(path) = path() else { return };
    save_path(values, path);
}
fn save_path(values: &HashMap<String, Telemetry>, path: PathBuf) {
    let mut rows: Vec<_> = values
        .values()
        .filter(|t| !t.episodes.is_empty())
        .map(|t| Saved {
            id: t.thread_id.clone(),
            turn_id: t.turn_id.clone(),
            state: t.state.clone(),
            episodes: t.episodes.clone(),
            at: t.provenance.get("state").map_or(0, |p| p.observed_at),
        })
        .filter(|r| now_ms() - r.at < 7 * 86400_000)
        .collect();
    rows.sort_by_key(|r| std::cmp::Reverse(r.at));
    rows.truncate(200);
    let Ok(bytes) = serde_json::to_vec(&rows) else {
        return;
    };
    // Avoid rewriting an unchanged cache on every poll.
    if std::fs::read(&path).ok().as_ref() == Some(&bytes) {
        return;
    }
    if let Some(parent) = path.parent() {
        if std::fs::create_dir_all(parent).is_err() {
            return;
        }
    }
    let temporary = path.with_extension("tmp");
    if std::fs::write(&temporary, bytes).is_ok() {
        let _ = std::fs::rename(temporary, path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restart_preserves_episode_identity() {
        let file =
            std::env::temp_dir().join(format!("sys-hud-episodes-{}.json", std::process::id()));
        let mut t = Telemetry::new("test");
        t.set_state("waitingOnApproval", "ipc", now_ms(), false);
        let id = t.episodes[0].id.clone();
        save_path(&HashMap::from([("test".into(), t)]), file.clone());
        let mut loaded = load_path(file.clone());
        let t = loaded.get_mut("test").unwrap();
        t.set_state("waitingOnApproval", "ipc", now_ms() + 1, true);
        assert_eq!(t.episodes[0].id, id);
        t.set_state("active", "ipc", now_ms() + 2, false);
        t.set_state("waitingOnApproval", "ipc", now_ms() + 3, false);
        assert_ne!(t.episodes[0].id, id);
        std::fs::remove_file(file).unwrap();
    }
}
