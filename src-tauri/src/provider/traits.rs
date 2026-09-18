// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use serde::{Deserialize, Serialize};
use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProviderCategory {
    System,
    #[serde(rename = "ai_account")]
    AIAccount,
    #[serde(rename = "ai_tool")]
    AITool,
}

pub trait Provider: Send + Sync + 'static {
    fn id(&self) -> &str;
    fn display_name(&self) -> &str;
    fn category(&self) -> ProviderCategory;
    fn poll_interval(&self) -> Duration;
    fn poll(
        &self,
    ) -> Pin<
        Box<
            dyn Future<Output = Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>>>
                + Send
                + '_,
        >,
    >;
}
