// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use super::{
    ipc::{proxy_call, ProxyError},
    Provider, ProviderCategory,
};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    future::Future,
    pin::Pin,
    sync::OnceLock,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;
pub struct OpenaiUsageProvider;
impl OpenaiUsageProvider {
    pub fn new() -> Self {
        Self
    }
}
fn error(e: ProxyError) -> Value {
    json!({"status":match e{ProxyError::Unavailable=>"unavailable",ProxyError::Unsupported=>"unsupported",ProxyError::Auth=>"auth_error",_=>"error"},"error":e.to_string()})
}
fn quota(v: Value) -> Value {
    let buckets: Vec<Value> = if let Some(map) = v["rateLimitsByLimitId"].as_object() {
        map.iter()
            .map(|(id, b)| json!({"limitId":id,"snapshot":b}))
            .collect()
    } else if v["rateLimits"].is_object() {
        vec![json!({"limitId":v["rateLimits"]["limitId"],"snapshot":v["rateLimits"]})]
    } else {
        vec![]
    };
    json!({"status":if buckets.is_empty(){"unavailable"}else{"ok"},"accountId":v["accountId"],"ordinaryUsageAllowed":v["ordinaryUsageAllowed"],"buckets":buckets,"source":"ipc"})
}
fn activity(v: Value) -> Value {
    json!({"status":if v["summary"].is_object(){"ok"}else{"unavailable"},"summary":v["summary"],"dailyUsageBuckets":v["dailyUsageBuckets"],"threadUsage":v["threadUsage"],"source":"ipc"})
}
#[derive(Default)]
struct Cache {
    account: Option<(Instant, Value)>,
    threads: HashMap<String, (Instant, Value)>,
}
fn cache() -> &'static Mutex<Cache> {
    static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(Cache::default()))
}
pub async fn account() -> Value {
    let mut c = cache().lock().await;
    if let Some((at, v)) = &c.account {
        if at.elapsed() < Duration::from_secs(30) {
            return v.clone();
        }
    }
    let (q, a) = tokio::join!(
        proxy_call("account/rateLimits/read", json!({})),
        proxy_call("account/usage/read", json!({}))
    );
    let q = q.map(quota).unwrap_or_else(error);
    let a = a.map(activity).unwrap_or_else(error);
    let value = json!({"status":"ok","service":"openai","display_name":"OpenAI","quota":q,"activity":a,"sampledAt":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64,"scope":"Current signed-in account"});
    // Account identity changed: estimated thread usage cannot be reused across identities.
    if c.account
        .as_ref()
        .is_some_and(|(_, old)| old["quota"]["accountId"] != value["quota"]["accountId"])
    {
        c.threads.clear();
    }
    c.account = Some((Instant::now(), value.clone()));
    value
}
pub async fn thread_usage(id: String) -> Value {
    let mut c = cache().lock().await;
    if let Some((at, v)) = c.threads.get(&id) {
        if at.elapsed() < Duration::from_secs(30) {
            return v.clone();
        }
    }
    let v = match proxy_call("account/usage/read", json!({"threadId":id})).await {
        Ok(v) => {
            json!({"status":"ok","threadUsage":v["threadUsage"],"sampledAt":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64})
        }
        Err(e) => error(e),
    };
    c.threads
        .retain(|_, (at, _)| at.elapsed() < Duration::from_secs(30));
    if c.threads.len() >= 100 {
        c.threads.clear();
    }
    c.threads.insert(id, (Instant::now(), v.clone()));
    v
}
impl Provider for OpenaiUsageProvider {
    fn id(&self) -> &str {
        "openai-usage"
    }
    fn display_name(&self) -> &str {
        "OpenAI"
    }
    fn category(&self) -> ProviderCategory {
        ProviderCategory::AIAccount
    }
    fn poll_interval(&self) -> Duration {
        Duration::from_secs(30)
    }
    fn poll(
        &self,
    ) -> Pin<
        Box<
            dyn Future<Output = Result<Value, Box<dyn std::error::Error + Send + Sync>>>
                + Send
                + '_,
        >,
    > {
        Box::pin(async { Ok(account().await) })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn token_only_never_becomes_balance() {
        let v = activity(
            json!({"summary":{"lifetimeTokens":120},"dailyUsageBuckets":[],"threadUsage":null}),
        );
        assert_eq!(v["summary"]["lifetimeTokens"], 120);
        assert!(v.get("balance").is_none());
        assert!(v["threadUsage"].is_null());
    }
    #[test]
    fn buckets_and_missing_windows_are_isolated() {
        let v = quota(
            json!({"accountId":null,"ordinaryUsageAllowed":false,"rateLimitsByLimitId":{"codex":{"primary":{"usedPercent":95,"windowDurationMins":null,"resetsAt":0}},"other":{"secondary":{"usedPercent":5,"windowDurationMins":10080}}}}),
        );
        assert_eq!(v["buckets"].as_array().unwrap().len(), 2);
        assert!(v["buckets"][0]["snapshot"]["secondary"].is_null());
        assert_eq!(v["ordinaryUsageAllowed"], false);
        assert!(v["accountId"].is_null());
    }
    #[test]
    fn missing_contract_is_unavailable() {
        assert_eq!(quota(json!({}))["status"], "unavailable");
        assert_eq!(activity(json!({}))["status"], "unavailable");
        assert_eq!(error(ProxyError::Unsupported)["status"], "unsupported");
    }
}
