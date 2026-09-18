// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use super::types::{CodexThread, CodexThreadStatus};
use crate::provider::ipc::{proxy_call, ProxyError};
use serde_json::{json, Value};
use std::collections::HashSet;

pub async fn try_ipc_thread_list() -> Result<Vec<(CodexThread, Value)>, ProxyError> {
    let mut threads = vec![];
    let mut cursor = Value::Null;
    let mut cursors = HashSet::new();
    for _ in 0..10 {
        let result=proxy_call("thread/list",json!({"limit":50,"useStateDbOnly":true,"cursor":cursor,"sourceKinds":["cli","vscode","exec","appServer","subAgent","subAgentReview","subAgentCompact","subAgentThreadSpawn","subAgentOther","unknown"]})).await?;
        let rows = result["data"]
            .as_array()
            .ok_or(ProxyError::InvalidResponse)?;
        threads.extend(
            rows.iter()
                .filter(|v| v["id"].as_str().is_some())
                .map(|v| (parse_thread(v), v.clone())),
        );
        cursor = result["nextCursor"].clone();
        if cursor.is_null() {
            break;
        }
        if !cursors.insert(cursor.to_string()) {
            return Err(ProxyError::InvalidResponse);
        }
    }
    if !cursor.is_null() {
        return Err(ProxyError::InvalidResponse);
    }
    // Loaded IDs can include threads not yet represented in the persisted list.
    let mut cursor = Value::Null;
    let mut cursors = HashSet::new();
    for _ in 0..10 {
        let result =
            match proxy_call("thread/loaded/list", json!({"limit":50,"cursor":cursor})).await {
                Ok(v) => v,
                Err(ProxyError::Unsupported) => return Ok(threads),
                Err(e) => return Err(e),
            };
        for id in result["data"]
            .as_array()
            .ok_or(ProxyError::InvalidResponse)?
            .iter()
            .filter_map(Value::as_str)
        {
            if !threads.iter().any(|(t, _)| t.id == id) {
                let read =
                    proxy_call("thread/read", json!({"threadId":id,"includeTurns":false})).await?;
                if read["thread"]["id"].as_str() != Some(id) {
                    return Err(ProxyError::InvalidResponse);
                }
                threads.push((parse_thread(&read["thread"]), read["thread"].clone()));
            }
        }
        cursor = result["nextCursor"].clone();
        if cursor.is_null() {
            return Ok(threads);
        }
        if !cursors.insert(cursor.to_string()) {
            return Err(ProxyError::InvalidResponse);
        }
    }
    Err(ProxyError::InvalidResponse)
}
fn parse_thread(v: &Value) -> CodexThread {
    CodexThread {
        id: v["id"].as_str().unwrap_or("").into(),
        name: v["name"].as_str().map(str::to_owned),
        cwd: v["cwd"].as_str().unwrap_or("").into(),
        status: serde_json::from_value(v["status"].clone()).unwrap_or(CodexThreadStatus::NotLoaded),
        model: v["model"].as_str().map(str::to_owned),
        model_provider: v["modelProvider"].as_str().unwrap_or("").into(),
        source: v["source"].as_str().unwrap_or("unknown").into(),
        created_at: v["createdAt"].as_i64().unwrap_or(0),
        updated_at: v["updatedAt"].as_i64().unwrap_or(0),
        preview: v["preview"].as_str().unwrap_or("").into(),
    }
}
