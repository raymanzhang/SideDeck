// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

mod commands;
mod provider;
mod window;

use tauri::Manager;

pub use provider::{Provider, ProviderCategory, ProviderManager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::open_project_link,
            commands::get_window_state,
            commands::update_window_preferences,
            commands::enable_autostart,
            commands::disable_autostart,
            commands::is_autostart_enabled,
            commands::get_openai_account,
            commands::get_codex_thread_usage
        ])
        .setup(|app| {
            let main_window = app
                .get_webview_window("main")
                .expect("main window not found");

            let service = window::start(main_window).map_err(std::io::Error::other)?;
            app.manage(service);

            let mut manager = ProviderManager::new();
            manager.register(provider::system::SystemProvider::new());
            manager.register(provider::claude::ClaudeProvider::new());
            manager.register(provider::codex::CodexProvider::new());
            manager.register(provider::anthropic_usage::AnthropicUsageProvider::new()?);
            manager.register(provider::openai_usage::OpenaiUsageProvider::new());
            manager.start_polling(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
