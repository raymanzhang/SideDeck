// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use super::traits::Provider;
use tauri::{AppHandle, Emitter, Runtime};

pub struct ProviderManager {
    providers: Vec<Box<dyn Provider>>,
}

impl ProviderManager {
    pub fn new() -> Self {
        Self {
            providers: Vec::new(),
        }
    }

    pub fn register(&mut self, provider: impl Provider) {
        self.providers.push(Box::new(provider));
    }

    pub fn start_polling<R: Runtime>(self, app_handle: AppHandle<R>) {
        for provider in self.providers {
            let handle = app_handle.clone();
            let id = provider.id().to_string();
            let interval = provider.poll_interval();

            tauri::async_runtime::spawn(async move {
                let mut tick = tokio::time::interval(interval);
                loop {
                    tick.tick().await;
                    match provider.poll().await {
                        Ok(data) => {
                            let event_name = format!("provider:{}", id);
                            let _ = handle.emit(&event_name, &data);
                        }
                        Err(e) => {
                            eprintln!("[{}] poll error: {}", id, e);
                        }
                    }
                }
            });
        }
    }
}
