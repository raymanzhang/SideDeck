// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
pub fn time_ms(v: &Value) -> Option<i64> {
    v.as_i64()
        .map(|n| if n < 10_000_000_000 { n * 1000 } else { n })
        .or_else(|| {
            v.as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|d| d.timestamp_millis())
        })
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Observed {
    pub source: String,
    pub observed_at: i64,
    pub availability: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    pub id: String,
    pub name: String,
    pub status: String,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub result: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Episode {
    pub id: String,
    pub kind: String,
    pub started_at: Option<i64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Telemetry {
    pub thread_id: String,
    pub parent_thread_id: Option<String>,
    pub state: String,
    pub turn_id: Option<String>,
    pub turn_started_at: Option<i64>,
    pub turn_ended_at: Option<i64>,
    pub waiting_since: Option<i64>,
    pub actions: Vec<Action>,
    pub plan: Option<Value>,
    pub token_usage: Option<Value>,
    pub settings: Option<Value>,
    pub episodes: Vec<Episode>,
    pub provenance: HashMap<String, Observed>,
    pub baseline: bool,
    #[serde(skip)]
    seen: VecDeque<String>,
}
impl Telemetry {
    pub fn new(id: &str) -> Self {
        Self {
            thread_id: id.into(),
            parent_thread_id: None,
            state: "notLoaded".into(),
            turn_id: None,
            turn_started_at: None,
            turn_ended_at: None,
            waiting_since: None,
            actions: vec![],
            plan: None,
            token_usage: None,
            settings: None,
            episodes: vec![],
            provenance: HashMap::new(),
            baseline: true,
            seen: VecDeque::new(),
        }
    }
    pub fn stamp(&mut self, field: &str, source: &str, at: i64, baseline: bool) -> bool {
        if self.provenance.get(field).is_some_and(|p| {
            p.observed_at > at || (p.observed_at == at && p.source == "ipc" && source != "ipc")
        }) {
            return false;
        }
        self.provenance.insert(
            field.into(),
            Observed {
                source: source.into(),
                observed_at: at,
                availability: if baseline { "historical" } else { "available" }.into(),
            },
        );
        true
    }
    pub fn set_state(&mut self, state: &str, source: &str, at: i64, baseline: bool) {
        if !self.stamp("state", source, at, baseline && source != "ipc") {
            return;
        }
        let waiting = matches!(state, "waitingOnApproval" | "waitingOnUserInput");
        if waiting && self.state != state {
            self.waiting_since = Some(at);
            self.episodes = vec![Episode {
                id: format!(
                    "{}/{}/{}/{}",
                    self.thread_id,
                    self.turn_id.as_deref().unwrap_or("unknown"),
                    state,
                    at
                ),
                kind: state.into(),
                started_at: Some(at),
            }];
        } else if !waiting {
            self.episodes.clear();
            self.waiting_since = None;
        }
        self.state = state.into();
        self.baseline = baseline;
    }
    pub fn merge_fields(&mut self, other: &Self) {
        for field in ["settings", "actions", "tokens", "plan"] {
            if let Some(p) = other.provenance.get(field) {
                if self.stamp(
                    field,
                    &p.source,
                    p.observed_at,
                    p.availability == "historical",
                ) {
                    match field {
                        "settings" => self.settings = other.settings.clone(),
                        "actions" => self.actions = other.actions.clone(),
                        "tokens" => self.token_usage = other.token_usage.clone(),
                        "plan" => self.plan = other.plan.clone(),
                        _ => {}
                    }
                }
            }
        }
        if other.turn_started_at > self.turn_started_at {
            self.turn_id = other.turn_id.clone();
            self.turn_started_at = other.turn_started_at;
            self.turn_ended_at = other.turn_ended_at;
        } else if other.turn_id == self.turn_id && other.turn_ended_at > self.turn_ended_at {
            self.turn_ended_at = other.turn_ended_at;
        }
    }
    pub fn apply(&mut self, r: &Value, offset: u64, baseline: bool) {
        let p = &r["payload"];
        let outer = r["type"].as_str().unwrap_or("");
        let kind = p["type"].as_str().unwrap_or(outer);
        let event_time = time_ms(&r["timestamp"]);
        let at = event_time.unwrap_or(0);
        let call = p["call_id"]
            .as_str()
            .or(p["item"]["id"].as_str())
            .or(p["id"].as_str())
            .or_else(|| {
                if matches!(
                    kind,
                    "task_started"
                        | "task_complete"
                        | "task_completed"
                        | "turn_aborted"
                        | "turn_failed"
                ) {
                    p["turn_id"].as_str()
                } else {
                    None
                }
            });
        let key = format!(
            "{}:{}:{}",
            p["turn_id"]
                .as_str()
                .or(self.turn_id.as_deref())
                .unwrap_or(""),
            kind,
            call.map(str::to_owned)
                .unwrap_or_else(|| format!("{offset}"))
        );
        if self.seen.contains(&key) {
            return;
        }
        self.seen.push_back(key);
        if self.seen.len() > 512 {
            self.seen.pop_front();
        }
        match outer {
            "session_meta" => {
                self.stamp("identity", "file", at, baseline);
                self.parent_thread_id = p["parent_thread_id"]
                    .as_str()
                    .or(p["source"]["subagent"]["thread_spawn"]["parent_thread_id"].as_str())
                    .map(str::to_owned);
            }
            "turn_context" => {
                if self.stamp("settings", "file", at, baseline) {
                    self.settings = Some(
                        json!({"model":p["model"],"effort":p["effort"],"serviceTier":p["service_tier"],"approvalPolicy":p["approval_policy"],"sandboxPolicy":p["sandbox_policy"]}),
                    );
                }
                self.turn_id = p["turn_id"].as_str().map(str::to_owned);
            }
            _ => {}
        }
        match kind {
            "task_started" => {
                if self
                    .provenance
                    .get("state")
                    .is_some_and(|v| v.observed_at > at)
                {
                    return;
                }
                self.turn_id = p["turn_id"].as_str().map(str::to_owned);
                self.stamp("turn", "file", at, baseline);
                self.turn_started_at = time_ms(&p["started_at"]).or(event_time);
                self.turn_ended_at = None;
                self.actions.clear();
                self.plan = None;
                self.set_state(
                    if baseline { "notLoaded" } else { "active" },
                    "file",
                    at,
                    baseline,
                );
            }
            "task_complete" | "task_completed" | "turn_aborted" | "turn_failed" => {
                if self
                    .provenance
                    .get("state")
                    .is_some_and(|v| v.observed_at > at)
                {
                    return;
                }
                self.stamp("turn", "file", at, baseline);
                self.turn_ended_at = time_ms(&p["completed_at"]).or(event_time);
                self.set_state(
                    if baseline {
                        "notLoaded"
                    } else if kind == "turn_failed" {
                        "error"
                    } else if kind == "turn_aborted" {
                        "idle"
                    } else {
                        "completed"
                    },
                    "file",
                    at,
                    baseline,
                );
                for a in &mut self.actions {
                    if a.status == "running" {
                        a.status = "unknown".into();
                    }
                }
            }
            "thread_settings_applied" => {
                if self.stamp("settings", "file", at, baseline) {
                    self.settings = Some(p["thread_settings"].clone());
                }
            }
            "token_count" => {
                if p["info"].is_object() && self.stamp("tokens", "file", at, baseline) {
                    self.token_usage = Some(
                        json!({"last":p["info"]["last_token_usage"],"total":p["info"]["total_token_usage"],"modelContextWindow":p["info"]["model_context_window"]}),
                    );
                }
            }
            "function_call" | "custom_tool_call" | "exec_command_begin" | "mcp_tool_call_begin" => {
                if let Some(id) = call {
                    let name = p["name"].as_str().or(p["tool"].as_str()).unwrap_or(kind);
                    if !self.actions.iter().any(|a| a.id == id) {
                        self.actions.push(Action {
                            id: id.into(),
                            name: name.into(),
                            status: "running".into(),
                            started_at: event_time,
                            ended_at: None,
                            result: None,
                        });
                    }
                    if name.ends_with("update_plan") {
                        if let Some(args) = p["arguments"]
                            .as_str()
                            .and_then(|s| serde_json::from_str::<Value>(s).ok())
                        {
                            if args["plan"].is_array() && self.stamp("plan", "file", at, baseline) {
                                self.plan = Some(args["plan"].clone());
                            }
                        }
                    }
                    self.stamp("actions", "file", at, baseline);
                    if !baseline && event_time.is_some() && !self.state.starts_with("waiting") {
                        self.set_state("active", "file", at, false);
                    }
                }
            }
            "function_call_output"
            | "custom_tool_call_output"
            | "exec_command_end"
            | "mcp_tool_call_end" => {
                if let Some(id) = call {
                    if let Some(a) = self.actions.iter_mut().find(|a| a.id == id) {
                        a.ended_at = event_time;
                        // Unstructured output is not proof of success or failure.
                        a.status = if p["exit_code"].as_i64().is_some_and(|c| c != 0)
                            || !p["error"].is_null()
                        {
                            "error"
                        } else {
                            "completed"
                        }
                        .into();
                        let output = p["output"].as_str().or(p["aggregated_output"].as_str());
                        a.result = output.map(|s| s.chars().take(2000).collect());
                    }
                    self.stamp("actions", "file", at, baseline);
                }
            }
            "item_started" | "item_completed" => {
                let item = &p["item"];
                let item_kind = item["type"].as_str().unwrap_or("");
                if matches!(
                    item_kind,
                    "CommandExecution"
                        | "commandExecution"
                        | "FileChange"
                        | "fileChange"
                        | "McpToolCall"
                        | "mcpToolCall"
                        | "DynamicToolCall"
                        | "dynamicToolCall"
                ) {
                    if let Some(id) = item["id"].as_str() {
                        let started = p["started_at_ms"].as_i64();
                        let ended = p["completed_at_ms"].as_i64();
                        let failed = item["exit_code"]
                            .as_i64()
                            .or(item["exitCode"].as_i64())
                            .is_some_and(|n| n != 0)
                            || matches!(item["status"].as_str(), Some("failed" | "Failed"))
                            || !item["error"].is_null();
                        let action = Action {
                            id: id.into(),
                            name: item["tool"].as_str().unwrap_or(item_kind).into(),
                            status: if failed {
                                "error"
                            } else if kind == "item_completed" {
                                "completed"
                            } else {
                                "running"
                            }
                            .into(),
                            started_at: started,
                            ended_at: ended,
                            result: item["aggregated_output"]
                                .as_str()
                                .or(item["aggregatedOutput"].as_str())
                                .or(item["stderr"].as_str())
                                .map(|s| s.chars().take(2000).collect()),
                        };
                        if let Some(old) = self.actions.iter_mut().find(|a| a.id == id) {
                            *old = Action {
                                started_at: started.or(old.started_at),
                                ..action
                            };
                        } else {
                            self.actions.push(action);
                        }
                        self.stamp("actions", "file", at, baseline);
                    }
                }
            }
            "plan_updated" => {
                if p["plan"].is_array() && self.stamp("plan", "file", at, baseline) {
                    self.plan = Some(p["plan"].clone());
                }
            }
            _ => {}
        }
        if self.actions.len() > 50 {
            self.actions.drain(..self.actions.len() - 50);
        }
    }
}
