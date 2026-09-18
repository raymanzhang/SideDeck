// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use tauri::command;

#[command]
pub fn open_project_link(kind: &str) -> Result<(), String> {
    let repository = env!("CARGO_PKG_REPOSITORY");
    let url = match kind {
        "repository" => repository.to_owned(),
        "source" => format!("{repository}/tree/v{}", env!("CARGO_PKG_VERSION")),
        _ => return Err("Unknown project link".into()),
    };
    let status = std::process::Command::new("/usr/bin/open")
        .arg(url)
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() { Ok(()) } else { Err("Could not open the system browser".into()) }
}

#[command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! SideDeck is running.", name)
}

#[command]
pub fn get_window_state(
    service: tauri::State<'_, crate::window::WindowService>,
) -> Result<crate::window::WindowState, String> {
    service.get()
}
#[command]
pub async fn update_window_preferences(
    service: tauri::State<'_, crate::window::WindowService>,
    update: crate::window::PreferenceUpdate,
) -> Result<crate::window::WindowState, String> {
    service.update(update).await
}

use tauri_plugin_autostart::ManagerExt;

#[command]
pub fn enable_autostart(app: tauri::AppHandle) -> Result<(), String> {
    app.autolaunch().enable().map_err(|e| e.to_string())
}
#[command]
pub fn disable_autostart(app: tauri::AppHandle) -> Result<(), String> {
    app.autolaunch().disable().map_err(|e| e.to_string())
}
#[command]
pub fn is_autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[command]
pub async fn get_openai_account() -> serde_json::Value {
    crate::provider::openai_usage::account().await
}
#[command]
pub async fn get_codex_thread_usage(thread_id: String) -> serde_json::Value {
    crate::provider::openai_usage::thread_usage(thread_id).await
}
