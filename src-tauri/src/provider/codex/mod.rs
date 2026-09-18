// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

mod episodes;
mod ipc;
mod parser;
mod telemetry;
#[cfg(test)]
mod tests;
mod types;
mod watcher;
use self::{
    telemetry::{now_ms, Telemetry},
    types::{CodexConfig, CodexThread, CodexThreadStatus},
    watcher::FileCollector,
};
use super::traits::{Provider, ProviderCategory};
use serde_json::json;
use std::{collections::HashMap, pin::Pin, sync::Mutex, time::Duration};
#[derive(Default)]
struct Retry {
    failures: usize,
    next: i64,
}
impl Retry {
    fn failed(&mut self, now: i64) {
        let seconds = [5, 10, 20, 30][self.failures.min(3)];
        self.failures += 1;
        self.next = now + seconds * 1000;
    }
}
pub struct CodexProvider {
    files: Mutex<FileCollector>,
    retry: Mutex<Retry>,
    snapshots: Mutex<HashMap<String, Telemetry>>,
    known_threads: Mutex<HashMap<String, CodexThread>>,
    config: CodexConfig,
}
impl CodexProvider {
    pub fn new() -> Self {
        Self {
            files: Mutex::new(FileCollector::default()),
            retry: Mutex::new(Retry::default()),
            snapshots: Mutex::new(episodes::load()),
            known_threads: Mutex::new(HashMap::new()),
            config: CodexConfig::from_toml_file(),
        }
    }
}
impl Provider for CodexProvider {
    fn id(&self) -> &str {
        "codex"
    }
    fn display_name(&self) -> &str {
        "Codex"
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
            let now = now_ms();
            let attempt = self.retry.lock().map(|r| now >= r.next).unwrap_or(false);
            let reconnected = self.retry.lock().map(|r| r.failures > 0).unwrap_or(true);
            let ipc = if attempt {
                tokio::time::timeout(Duration::from_secs(10), ipc::try_ipc_thread_list())
                    .await
                    .ok()
                    .and_then(Result::ok)
            } else {
                None
            };
            if attempt {
                if let Ok(mut r) = self.retry.lock() {
                    if ipc.is_some() {
                        *r = Retry::default();
                    } else {
                        r.failed(now_ms());
                    }
                }
            }
            let mut files = self.files.lock().map_err(|_| "file state poisoned")?;
            let file_ok = files.refresh(&watcher::codex_home()).is_ok();
            let mut threads = HashMap::new();
            let mut telemetry = HashMap::new();
            for f in files.files.values() {
                if let Some(m) = &f.metadata {
                    threads.insert(
                        m.session_id.clone(),
                        CodexThread {
                            id: m.session_id.clone(),
                            name: files
                                .index
                                .get(&m.session_id)
                                .map(|e| e.thread_name.clone()),
                            cwd: m.cwd.clone(),
                            status: CodexThreadStatus::NotLoaded,
                            model: None,
                            model_provider: m.model_provider.clone(),
                            source: m.source.clone(),
                            created_at: 0,
                            updated_at: 0,
                            preview: String::new(),
                        },
                    );
                    if let Some(t) = &f.telemetry {
                        telemetry.insert(m.session_id.clone(), t.clone());
                    }
                }
            }
            for e in files.index.values() {
                threads.entry(e.id.clone()).or_insert_with(|| CodexThread {
                    id: e.id.clone(),
                    name: Some(e.thread_name.clone()),
                    cwd: String::new(),
                    status: CodexThreadStatus::NotLoaded,
                    model: None,
                    model_provider: String::new(),
                    source: "file".into(),
                    created_at: 0,
                    updated_at: 0,
                    preview: String::new(),
                });
            }
            let connected = ipc.is_some();
            let mut known = self
                .known_threads
                .lock()
                .map_err(|_| "thread cache poisoned")?;
            if !connected {
                for (id, t) in known.iter() {
                    threads.entry(id.clone()).or_insert_with(|| t.clone());
                }
            }
            let mut snapshots = self
                .snapshots
                .lock()
                .map_err(|_| "snapshot state poisoned")?;
            if let Some(rows) = ipc {
                for (thread, raw) in rows {
                    let mut t = snapshots
                        .get(&thread.id)
                        .cloned()
                        .or_else(|| telemetry.get(&thread.id).cloned())
                        .unwrap_or_else(|| Telemetry::new(&thread.id));
                    if let Some(file) = telemetry.get(&thread.id) {
                        t.merge_fields(file);
                    }
                    t.parent_thread_id = raw["parentThreadId"]
                        .as_str()
                        .map(str::to_owned)
                        .or(t.parent_thread_id);
                    if raw["model"].is_string() && t.settings.is_none() {
                        t.settings = Some(
                            json!({"model":raw["model"],"effort":raw["reasoningEffort"],"scope":"Thread configured settings; not turn execution telemetry"}),
                        );
                        t.stamp("settings", "ipc", now, false);
                    }
                    let baseline = reconnected || !snapshots.contains_key(&thread.id);
                    let status = match &thread.status {
                        CodexThreadStatus::NotLoaded => "notLoaded",
                        CodexThreadStatus::Idle => "idle",
                        CodexThreadStatus::SystemError => "error",
                        CodexThreadStatus::Active { active_flags } => {
                            if active_flags.iter().any(|f| f == "waitingOnApproval") {
                                "waitingOnApproval"
                            } else if active_flags.iter().any(|f| f == "waitingOnUserInput") {
                                "waitingOnUserInput"
                            } else {
                                "active"
                            }
                        }
                    };
                    let status = if status == "idle"
                        && telemetry
                            .get(&thread.id)
                            .is_some_and(|file| file.state == "completed")
                    {
                        "completed"
                    } else {
                        status
                    };
                    let previous_episodes = t.episodes.clone();
                    t.set_state(status, "ipc", now, baseline);
                    if let CodexThreadStatus::Active { active_flags } = &thread.status {
                        let waits: Vec<_> = active_flags
                            .iter()
                            .filter(|f| {
                                matches!(f.as_str(), "waitingOnApproval" | "waitingOnUserInput")
                            })
                            .collect();
                        if !waits.is_empty() {
                            t.episodes = waits
                                .iter()
                                .map(|kind| {
                                    previous_episodes
                                        .iter()
                                        .find(|e| &e.kind == *kind)
                                        .cloned()
                                        .unwrap_or_else(|| telemetry::Episode {
                                            id: format!(
                                                "{}/{}/{}/{}",
                                                thread.id,
                                                t.turn_id.as_deref().unwrap_or("unknown"),
                                                kind,
                                                now
                                            ),
                                            kind: (*kind).clone(),
                                            started_at: Some(now),
                                        })
                                })
                                .collect();
                        }
                    }
                    telemetry.insert(thread.id.clone(), t);
                    threads.insert(thread.id.clone(), thread);
                }
            } else {
                // Preserve the last explicit IPC state, but mark that source disconnected.
                for (id, old) in snapshots.iter() {
                    if old
                        .provenance
                        .get("state")
                        .is_some_and(|p| p.source == "ipc")
                    {
                        let newer = telemetry
                            .get(id)
                            .and_then(|t| t.provenance.get("state"))
                            .is_some_and(|p| p.observed_at > old.provenance["state"].observed_at);
                        if !newer {
                            telemetry.insert(id.clone(), old.clone());
                        }
                    }
                }
            }
            if connected {
                episodes::save(&telemetry);
            }
            *snapshots = telemetry.clone();
            let events: HashMap<_, Vec<_>> = files
                .events
                .iter()
                .map(|(id, r)| (id.clone(), r.iter().cloned().collect()))
                .collect();
            *known = threads.clone();
            let mut threads: Vec<_> = threads.into_values().collect();
            threads.sort_by(|a, b| a.id.cmp(&b.id));
            Ok(
                json!({"status":if connected{"ok"}else if file_ok{"fallback"}else{"unavailable"},"dataSource":if connected{"ipc"}else{"file"},"sampledAt":now_ms(),"connection":if connected{"polling"}else if file_ok{"file"}else{"disconnected"},"sources":{"ipc":connected,"file":file_ok},"capability":if connected {"Polled status; visibility limited to the connected Codex server"} else {"File snapshots; live waiting detection is unavailable"},"threads":threads,"telemetry":telemetry,"recentEvents":events,"config":self.config}),
            )
        })
    }
}
