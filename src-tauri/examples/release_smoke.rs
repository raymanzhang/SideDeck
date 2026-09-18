// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

//! Current-host WKWebView smoke test using the real UI/window/system code.
//! No account/session providers, no production preference directory.
#![allow(dead_code)]
#[link(name = "hud_window_native", kind = "static")]
extern "C" {}
#[path = "../src/commands.rs"]
mod commands;
#[path = "../src/provider/mod.rs"]
mod provider;
#[path = "../src/window.rs"]
mod window;
use tauri::Manager;

#[tauri::command]
fn smoke_report(app: tauri::AppHandle, mut report: serde_json::Value) {
    report["cliDiscovery"] = serde_json::json!({"claude":provider::cli::resolve("claude").is_some(), "codex":provider::cli::resolve("codex").is_some()});
    println!("NATIVE_SMOKE {}", report);
    if let Ok(path) = std::env::var("SIDEDECK_SMOKE_OUTPUT") {
        std::fs::write(path, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
    }
    app.exit(if report["passed"] == true { 0 } else { 1 });
}

fn main() {
    let mut context = tauri::generate_context!();
    context.config_mut().identifier = "com.syshud.release-smoke".into();
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![smoke_report, commands::get_window_state,
            commands::update_window_preferences, commands::is_autostart_enabled,
            commands::enable_autostart, commands::disable_autostart, commands::open_project_link])
        .on_page_load(|webview, payload| {
            if payload.event() != tauri::webview::PageLoadEvent::Finished { return; }
            let _ = webview.eval(include_str!("../../tests/native/release-smoke.js"));
        })
        .setup(|app| {
            let main = app.get_webview_window("main").unwrap();
            main.set_title("SideDeck — Release smoke test")?;
            app.manage(window::start(main).map_err(std::io::Error::other)?);
            let mut manager = provider::ProviderManager::new();
            manager.register(provider::system::SystemProvider::new());
            manager.start_polling(app.handle().clone());
            let components = sysinfo::Components::new_with_refreshed_list();
            let sensors: Vec<_> = components.iter().map(|c| serde_json::json!({"label":c.label(),"temperature":c.temperature()})).collect();
            println!("SENSORS {}", serde_json::json!(sensors));
            let handle = app.handle().clone();
            std::thread::spawn(move || { std::thread::sleep(std::time::Duration::from_secs(30)); handle.exit(2); });
            Ok(())
        })
        .run(context).expect("native release smoke failed");
}
