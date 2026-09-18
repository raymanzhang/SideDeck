// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use super::*;
use serde_json::json;
use std::{fs, io::Write};
fn temp(name: &str) -> std::path::PathBuf {
    let p = std::env::temp_dir().join(format!(
        "sys-hud-{}-{}-{}",
        std::process::id(),
        telemetry::now_ms(),
        name
    ));
    fs::create_dir_all(&p).unwrap();
    p
}
#[test]
fn incremental_identity_partial_line_replacement_and_history() {
    let dir = temp("reader");
    let p = dir.join("rollout.jsonl");
    fs::write(&p,"{\"type\":\"session_meta\",\"payload\":{\"id\":\"one\",\"cwd\":\"/same\"}}\n{\"type\":\"event_msg\",\"payload\":{\"type\":\"task_started\",\"turn_id\":\"t1\"}}\n").unwrap();
    let mut c = parser::FileCursor::default();
    let rows = parser::read_rollout(&p, &mut c).unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(c.telemetry.as_ref().unwrap().state, "notLoaded");
    let before = c.offset;
    let mut f = fs::OpenOptions::new().append(true).open(&p).unwrap();
    write!(
        f,
        "{{\"type\":\"response_item\",\"payload\":{{\"type\":\"function_call\","
    )
    .unwrap();
    assert!(parser::read_rollout(&p, &mut c).unwrap().is_empty());
    assert_eq!(c.offset, before);
    writeln!(f, "\"call_id\":\"call\",\"name\":\"test\"}}}}").unwrap();
    let rows = parser::read_rollout(&p, &mut c).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].session_id, "one");
    assert!(parser::read_rollout(&p, &mut c).unwrap().is_empty());
    let replacement = dir.join("new");
    fs::write(
        &replacement,
        "{\"type\":\"session_meta\",\"payload\":{\"id\":\"two\"}}\n",
    )
    .unwrap();
    fs::rename(replacement, &p).unwrap();
    parser::read_rollout(&p, &mut c).unwrap();
    assert_eq!(c.metadata.as_ref().unwrap().session_id, "two");
    fs::remove_dir_all(dir).unwrap();
}
#[test]
fn tokens_compaction_actions_and_old_state() {
    let mut t = telemetry::Telemetry::new("one");
    let record = |kind: &str, p: serde_json::Value| json!({"timestamp":"2026-09-17T10:00:00Z","type":kind,"payload":p});
    t.apply(
        &record("event_msg", json!({"type":"task_started","turn_id":"turn"})),
        0,
        false,
    );
    t.apply(
        &record(
            "response_item",
            json!({"type":"function_call","call_id":"a","name":"shell"}),
        ),
        1,
        false,
    );
    t.apply(
        &record(
            "response_item",
            json!({"type":"function_call_output","call_id":"a","exit_code":1,"output":"failed"}),
        ),
        2,
        false,
    );
    t.apply(
        &record(
            "response_item",
            json!({"type":"function_call","call_id":"b","name":"shell"}),
        ),
        3,
        false,
    );
    t.apply(
        &record(
            "response_item",
            json!({"type":"function_call","call_id":"b","name":"shell"}),
        ),
        3,
        false,
    );
    assert_eq!(t.actions.len(), 2);
    assert_eq!(t.actions[0].status, "error");
    assert_eq!(t.state, "active");
    for (n, last, total) in [(4, 80, 100), (5, 20, 120)] {
        t.apply(&record("event_msg",json!({"type":"token_count","info":{"last_token_usage":{"total_tokens":last},"total_token_usage":{"total_tokens":total},"model_context_window":100}})),n,false);
    }
    assert_eq!(t.token_usage.as_ref().unwrap()["last"]["total_tokens"], 20);
    assert_eq!(
        t.token_usage.as_ref().unwrap()["total"]["total_tokens"],
        120
    );
    t.set_state("waitingOnApproval", "ipc", i64::MAX - 1, false);
    let id = t.episodes[0].id.clone();
    t.set_state("waitingOnApproval", "ipc", i64::MAX, false);
    assert_eq!(t.episodes[0].id, id);
    t.set_state("idle", "file", 1, true);
    assert_eq!(t.state, "waitingOnApproval");
}
#[test]
fn retry_caps_and_wire_flags() {
    let mut r = Retry::default();
    for delay in [5, 10, 20, 30, 30] {
        r.failed(100);
        assert_eq!(r.next, 100 + delay * 1000);
    }
    let s: types::CodexThreadStatus =
        serde_json::from_value(json!({"type":"active","activeFlags":["waitingOnUserInput"]}))
            .unwrap();
    assert_eq!(
        serde_json::to_value(s).unwrap()["activeFlags"][0],
        "waitingOnUserInput"
    );
}
#[test]
fn compatibility_fixtures_keep_same_project_threads_separate() {
    let dir = temp("fixtures");
    fs::create_dir_all(dir.join("sessions/2026/09/17")).unwrap();
    for (name, content) in [
        (
            "a",
            include_str!("../../../../tests/fixtures/codex/rollout-current.jsonl"),
        ),
        (
            "b",
            include_str!("../../../../tests/fixtures/codex/rollout-compatibility.jsonl"),
        ),
    ] {
        fs::write(
            dir.join(format!("sessions/2026/09/17/{name}.jsonl")),
            content,
        )
        .unwrap();
    }
    let mut collector = watcher::FileCollector::default();
    collector.refresh(&dir).unwrap();
    assert_eq!(collector.files.len(), 2);
    let a = collector
        .files
        .values()
        .find_map(|f| f.telemetry.as_ref().filter(|t| t.thread_id == "thread-a"))
        .unwrap();
    assert_eq!(a.parent_thread_id.as_deref(), Some("parent"));
    assert_eq!(a.plan.as_ref().unwrap()[0]["status"], "in_progress");
    assert_eq!(a.token_usage.as_ref().unwrap()["last"]["total_tokens"], 200);
    assert_eq!(a.state, "notLoaded");
    let offsets: Vec<_> = collector.files.values().map(|f| f.offset).collect();
    collector.refresh(&dir).unwrap();
    assert_eq!(
        offsets,
        collector
            .files
            .values()
            .map(|f| f.offset)
            .collect::<Vec<_>>()
    );
    fs::create_dir_all(dir.join("sessions/2026/09/18")).unwrap();
    fs::write(
        dir.join("sessions/2026/09/18/c.jsonl"),
        "{\"type\":\"session_meta\",\"payload\":{\"id\":\"new-day\"}}\n",
    )
    .unwrap();
    collector.refresh(&dir).unwrap();
    assert_eq!(collector.files.len(), 3);
    fs::remove_dir_all(dir).unwrap();
}
#[tokio::test]
#[ignore = "Read-only host integration; reports counts only, requires local Codex logs"]
async fn native_readonly_probe() {
    let p = CodexProvider {
        files: Mutex::new(FileCollector::default()),
        retry: Mutex::new(Retry::default()),
        snapshots: Mutex::new(HashMap::new()),
        known_threads: Mutex::new(HashMap::new()),
        config: CodexConfig::default(),
    };
    for pass in 0..2 {
        let began = std::time::Instant::now();
        let value = p.poll().await.unwrap();
        let threads = value["threads"].as_array().unwrap();
        let telemetry = value["telemetry"].as_object().unwrap();
        let missing_identity = threads
            .iter()
            .filter(|t| t["id"].as_str().unwrap_or("").is_empty())
            .count();
        println!("native pass={pass} status={} source={} threads={} telemetry={} missing_identity={} elapsed_ms={}",value["status"],value["dataSource"],threads.len(),telemetry.len(),missing_identity,began.elapsed().as_millis());
        assert_eq!(missing_identity, 0);
        assert!(!threads.is_empty());
        let state = p.files.lock().unwrap();
        println!(
            "tracked_files={} captured_events={}",
            state.files.len(),
            state
                .events
                .values()
                .map(|r| r.iter().count())
                .sum::<usize>()
        );
    }
}
#[test]
fn same_inode_rewrite_and_oversized_record_recover() {
    let dir = temp("rewrite");
    let p = dir.join("r.jsonl");
    let meta = "{\"type\":\"session_meta\",\"payload\":{\"id\":\"one\"}}\n";
    fs::write(&p, meta).unwrap();
    let mut c = parser::FileCursor::default();
    parser::read_rollout(&p, &mut c).unwrap();
    fs::write(&p, meta.replace("one", "two")).unwrap();
    parser::read_rollout(&p, &mut c).unwrap();
    assert_eq!(c.metadata.as_ref().unwrap().session_id, "two");
    let mut f = fs::OpenOptions::new().append(true).open(&p).unwrap();
    f.write_all(&vec![b'x'; 600_000]).unwrap();
    f.write_all(
        b"\n{\"type\":\"event_msg\",\"payload\":{\"type\":\"task_started\",\"turn_id\":\"new\"}}\n",
    )
    .unwrap();
    parser::read_rollout(&p, &mut c).unwrap();
    parser::read_rollout(&p, &mut c).unwrap();
    assert_eq!(
        c.telemetry.as_ref().unwrap().turn_id.as_deref(),
        Some("new")
    );
    assert!(c.telemetry.as_ref().unwrap().turn_started_at.is_none());
    fs::remove_dir_all(dir).unwrap();
}
