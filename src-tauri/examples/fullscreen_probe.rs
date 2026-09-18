// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

//! Interactive native test harness, independent of production preferences/providers.
//! Build the test observer as documented in tests/native/README.md.
use std::ffi::{c_char, c_int, c_void, CString};
use std::io::{self, BufRead};
use std::sync::OnceLock;
use std::time::Instant;
use tauri::{Manager, PhysicalPosition, PhysicalSize};

#[link(name = "System")]
extern "C" {
    fn dlopen(path: *const c_char, mode: c_int) -> *mut c_void;
    fn dlsym(handle: *mut c_void, name: *const c_char) -> *mut c_void;
}
static START: OnceLock<Instant> = OnceLock::new();
fn log(message: &str) {
    println!(
        "PROBE {:.6} {message}",
        START.get_or_init(Instant::now).elapsed().as_secs_f64()
    );
}
fn locate(window: &tauri::WebviewWindow, secondary: bool) -> Result<(), String> {
    if window.is_fullscreen().map_err(|e| e.to_string())? {
        return Err("Exit and wait for NSWindowDidExitFullScreenNotification before moving".into());
    }
    let primary = window
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No primary")?;
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let target = if secondary {
        monitors
            .iter()
            .find(|m| m.position() != primary.position())
            .ok_or("No secondary")?
    } else {
        &primary
    };
    window
        .set_size(PhysicalSize::new(
            (800.0 * target.scale_factor()) as u32,
            (400.0 * target.scale_factor()) as u32,
        ))
        .map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition::new(
            target.position().x + 40,
            target.position().y + 80,
        ))
        .map_err(|e| e.to_string())?;
    log(&format!(
        "positioned {:?} scale={}",
        target.name(),
        target.scale_factor()
    ));
    Ok(())
}
fn main() {
    START.get_or_init(Instant::now);
    let path =
        CString::new(std::env::var("T8_OBSERVER_DYLIB").expect("Set T8_OBSERVER_DYLIB")).unwrap();
    let (observe, stop): (
        unsafe extern "C" fn(*mut c_void) -> *mut c_void,
        unsafe extern "C" fn(*mut c_void),
    ) = unsafe {
        let handle = dlopen(path.as_ptr(), 2);
        assert!(!handle.is_null(), "Cannot load observer dylib");
        let observe = dlsym(handle, c"probe_observe".as_ptr());
        let stop = dlsym(handle, c"probe_stop".as_ptr());
        assert!(
            !observe.is_null() && !stop.is_null(),
            "Observer symbols missing"
        );
        (std::mem::transmute(observe), std::mem::transmute(stop))
    };
    tauri::Builder::default()
        .setup(move |app| {
            let window = app.get_webview_window("main").unwrap();
            window.set_title("SideDeck — Native Fullscreen Probe")?;
            let observer = unsafe { observe(window.ns_window()?) } as usize;
            locate(&window, true).map_err(io::Error::other)?;
            window.set_focus()?;
            log("ready: enter | exit | state | primary | secondary | quit");
            let events = window.clone();
            window.on_window_event(move |event| {
                if matches!(
                    event,
                    tauri::WindowEvent::Resized(_)
                        | tauri::WindowEvent::ScaleFactorChanged { .. }
                        | tauri::WindowEvent::Focused(_)
                ) {
                    log(&format!(
                        "window_event={event:?} is_fullscreen={:?}",
                        events.is_fullscreen()
                    ));
                }
            });
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                for line in io::stdin().lock().lines() {
                    let Ok(command) = line else { break };
                    let win = window.clone();
                    let app = handle.clone();
                    handle
                        .run_on_main_thread(move || {
                            log(&format!("command={command}"));
                            let result = match command.trim() {
                                "enter" => {
                                    log("before set_fullscreen(true)");
                                    let result =
                                        win.set_fullscreen(true).map_err(|e| e.to_string());
                                    log(&format!(
                                        "set_fullscreen returned {result:?}; queried={:?}",
                                        win.is_fullscreen()
                                    ));
                                    result
                                }
                                "exit" => {
                                    let result =
                                        win.set_fullscreen(false).map_err(|e| e.to_string());
                                    log(&format!(
                                        "set_fullscreen(false) returned {result:?}; queried={:?}",
                                        win.is_fullscreen()
                                    ));
                                    result
                                }
                                "state" => {
                                    log(&format!(
                                        "fullscreen={:?} focused={:?} position={:?} size={:?}",
                                        win.is_fullscreen(),
                                        win.is_focused(),
                                        win.outer_position(),
                                        win.inner_size()
                                    ));
                                    Ok(())
                                }
                                "primary" => locate(&win, false),
                                "secondary" => locate(&win, true),
                                "quit" => {
                                    unsafe { stop(observer as *mut c_void) };
                                    app.exit(0);
                                    Ok(())
                                }
                                _ => Err("Unknown command".into()),
                            };
                            if let Err(error) = result {
                                log(&format!("ERROR {error}"));
                            }
                        })
                        .unwrap();
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("native probe failed");
}
