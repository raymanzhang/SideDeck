// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use super::traits::{Provider, ProviderCategory};
use serde_json::json;
use std::pin::Pin;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

pub struct DemoTickProvider {
    counter: AtomicU64,
}

impl DemoTickProvider {
    pub fn new() -> Self {
        Self {
            counter: AtomicU64::new(0),
        }
    }
}

impl Provider for DemoTickProvider {
    fn id(&self) -> &str {
        "demo-tick"
    }

    fn display_name(&self) -> &str {
        "Demo Tick Counter"
    }

    fn category(&self) -> ProviderCategory {
        ProviderCategory::System
    }

    fn poll_interval(&self) -> Duration {
        Duration::from_secs(2)
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
            let count = self.counter.fetch_add(1, Ordering::Relaxed) + 1;
            Ok(json!({
                "tick": count,
                "message": format!("Tick #{}", count)
            }))
        })
    }
}
