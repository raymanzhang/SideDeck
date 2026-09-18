// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

#[path = "window/model.rs"]
mod model;
#[path = "window/preferences.rs"]
mod preferences;
use model::{Action, Coordinator, NativeSnapshot, Target};
pub use model::{PreferenceUpdate, WindowState};
use std::ffi::{c_char, c_void, CStr};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager, WebviewWindow};
use tokio::sync::{mpsc, oneshot};

extern "C" {
    fn hud_observe_window(
        window: *mut c_void,
        callback: extern "C" fn(*mut c_void, i32),
        context: *mut c_void,
    ) -> *mut c_void;
    fn hud_stop_observing(observer: *mut c_void);
    fn hud_window_snapshot(window: *mut c_void, observer: *mut c_void) -> *mut c_char;
    fn hud_free_string(value: *mut c_char);
    fn hud_refresh_menu_bar(window: *mut c_void, policy: i32) -> i32;
    fn hud_place_outer_frame(window: *mut c_void, x: f64, y: f64, width: f64, height: f64);
}
#[derive(Clone)]
pub struct WindowService {
    tx: mpsc::UnboundedSender<Event>,
    snapshot: Arc<Mutex<WindowState>>,
}
enum Event {
    Native(i32),
    Refresh,
    Closed,
    Update(
        PreferenceUpdate,
        oneshot::Sender<Result<WindowState, String>>,
    ),
}
impl WindowService {
    pub fn get(&self) -> Result<WindowState, String> {
        self.snapshot
            .lock()
            .map(|state| state.clone())
            .map_err(|e| e.to_string())
    }
    pub async fn update(&self, update: PreferenceUpdate) -> Result<WindowState, String> {
        let (reply, response) = oneshot::channel();
        self.tx
            .send(Event::Update(update, reply))
            .map_err(|_| "Window coordinator has stopped")?;
        response
            .await
            .map_err(|_| "Window coordinator has stopped")?
    }
}
extern "C" fn native_callback(context: *mut c_void, kind: i32) {
    // Context is retained until the main-thread observers have been removed.
    let tx = unsafe { &*(context as *const mpsc::UnboundedSender<Event>) };
    let _ = tx.send(Event::Native(kind));
}
fn native_snapshot(window: &WebviewWindow, observer: usize) -> Result<NativeSnapshot, String> {
    let raw = unsafe {
        hud_window_snapshot(
            window.ns_window().map_err(|e| e.to_string())?,
            observer as *mut c_void,
        )
    };
    if raw.is_null() {
        return Err("Cannot query native window state".into());
    }
    let parsed = unsafe {
        serde_json::from_slice(CStr::from_ptr(raw).to_bytes()).map_err(|e| e.to_string())
    };
    unsafe { hud_free_string(raw) };
    parsed
}
async fn on_main<T: Send + 'static>(
    window: &WebviewWindow,
    action: impl FnOnce(WebviewWindow) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let (send, receive) = oneshot::channel();
    let win = window.clone();
    window
        .run_on_main_thread(move || {
            let _ = send.send(action(win));
        })
        .map_err(|e| e.to_string())?;
    receive
        .await
        .map_err(|_| "Native window action was cancelled".to_string())?
}
async fn inspect(window: &WebviewWindow, observer: usize) -> Result<NativeSnapshot, String> {
    on_main(window, move |window| native_snapshot(&window, observer)).await
}
/// Called during Tauri setup on the main thread. The actor owns all transitions;
/// no state lock is held while calling AppKit or waiting for its notification.
pub fn start(window: WebviewWindow) -> Result<WindowService, String> {
    let (tx, rx) = mpsc::unbounded_channel();
    let context = Box::into_raw(Box::new(tx.clone())) as usize;
    let observer = unsafe {
        hud_observe_window(
            window.ns_window().map_err(|e| e.to_string())?,
            native_callback,
            context as *mut c_void,
        )
    } as usize;
    let native = native_snapshot(&window, observer)?;
    let dir = window
        .app_handle()
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let (prefs, needs_import, storage_error) = preferences::load(&dir, &native.displays);
    let mut coordinator = Coordinator::new(prefs, needs_import, storage_error);
    coordinator.observe(&native);
    coordinator.state.actual_fullscreen = native.fullscreen;
    let snapshot = Arc::new(Mutex::new(coordinator.state.clone()));
    let service = WindowService {
        tx: tx.clone(),
        snapshot: snapshot.clone(),
    };
    let events = tx.clone();
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::Destroyed => {
            // Tauri delivers window events on the event-loop/main thread.
            unsafe {
                hud_stop_observing(observer as *mut c_void);
                drop(Box::from_raw(context as *mut mpsc::UnboundedSender<Event>));
            }
            let _ = events.send(Event::Closed);
        }
        tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. } => {
            let _ = events.send(Event::Refresh);
        }
        _ => {}
    });
    tauri::async_runtime::spawn(run(window, observer, dir, coordinator, snapshot, rx));
    let _ = tx.send(Event::Refresh);
    Ok(service)
}
fn persist(model: &mut Coordinator, dir: &std::path::Path) {
    match preferences::save(dir, &model.state.preferences) {
        Ok(()) => {
            model.state.storage_error = None;
            model.state.needs_legacy_import = false;
        }
        Err(error) => {
            model.state.storage_error = Some(format!(
                "Window updated for this session, but preferences could not be saved: {error}"
            ))
        }
    }
}
fn apply_update(
    model: &mut Coordinator,
    update: PreferenceUpdate,
    dir: &std::path::Path,
) -> Result<(), String> {
    if update.import_legacy {
        if !model.state.needs_legacy_import {
            return Ok(());
        }
        model.state.preferences.always_on_top = update.legacy_always_on_top.unwrap_or(false);
        persist(model, dir);
        return Ok(());
    }
    if update.retry {
        model.retry()?;
        persist(model, dir);
    }
    if let Some(target) = update.target {
        if let Target::Display { ref id, ref name } = target {
            if name.trim().is_empty() || id.as_ref().is_some_and(|id| id.is_empty()) {
                return Err("Invalid display selection".into());
            }
        }
        model.state.preferences.target = target;
    }
    if let Some(wanted) = update.fullscreen_wanted {
        model.state.preferences.fullscreen_wanted = wanted;
        model.recovering_wake = false;
    }
    if let Some(top) = update.always_on_top {
        model.state.preferences.always_on_top = top;
    }
    // A user update takes precedence over a late legacy import, even if saving fails.
    model.state.needs_legacy_import = false;
    persist(model, dir);
    Ok(())
}
fn publish(window: &WebviewWindow, model: &mut Coordinator, shared: &Mutex<WindowState>) {
    if let Ok(mut snapshot) = shared.lock() {
        model.state.revision = snapshot.revision;
        if *snapshot == model.state {
            return;
        }
        model.state.revision += 1;
        *snapshot = model.state.clone();
        if cfg!(debug_assertions) && std::env::var_os("SYSHUD_WINDOW_TRACE").is_some() {
            eprintln!(
                "WINDOW_STATE {}",
                serde_json::to_string(&model.state).unwrap_or_default()
            );
        }
        let _ = window.emit("sys-hud://window-state", &model.state);
    }
}
async fn reconcile(
    window: &WebviewWindow,
    observer: usize,
    model: &mut Coordinator,
    start: Instant,
    shared: &Mutex<WindowState>,
) {
    // At most top + position + fullscreen; native completion resumes the actor.
    for _ in 0..4 {
        let Some(action) = model.next_action() else {
            break;
        };
        // An external system transition may have started since the last queued event.
        let native = match inspect(window, observer).await {
            Ok(value) => value,
            Err(error) => {
                model.state.error = Some(error);
                break;
            }
        };
        model.observe(&native);
        if native.transitioning {
            break;
        }
        // Refresh can change the target. Recompute before issuing a dependent action.
        if model.next_action().as_ref() != Some(&action) {
            continue;
        }
        if cfg!(debug_assertions) && std::env::var_os("SYSHUD_WINDOW_TRACE").is_some() {
            eprintln!("WINDOW_ACTION {action:?}");
        }
        model.begin(&action, start.elapsed().as_millis() as u64);
        publish(window, model, shared);
        let effect = action.clone();
        let result = on_main(window, move |window| {
            match effect {
                Action::Fullscreen(value) => {
                    window.set_fullscreen(value).map_err(|e| e.to_string())
                }
                Action::Top(value) => window.set_always_on_top(value).map_err(|e| e.to_string()),
                Action::Place(display, fallback) => {
                    let rect = display.window_rect(fallback);
                    // Primary/fallback windows need a real, draggable title bar.
                    // Fit the outer frame, not a 400px client area plus decorations.
                    window
                        .set_decorations(display.primary)
                        .map_err(|e| e.to_string())?;
                    let scale = display.scale_factor;
                    unsafe {
                        hud_place_outer_frame(
                            window.ns_window().map_err(|e| e.to_string())?,
                            f64::from(rect.x) / scale,
                            f64::from(rect.y) / scale,
                            f64::from(rect.width) / scale,
                            f64::from(rect.height) / scale,
                        );
                    }
                    Ok(())
                }
                Action::MenuBar(policy) => {
                    let result = unsafe {
                        hud_refresh_menu_bar(
                            window.ns_window().map_err(|e| e.to_string())?,
                            i32::from(policy),
                        )
                    };
                    if result < 0 {
                        Err("Cannot refresh fullscreen menu-bar presentation".into())
                    } else {
                        Ok(())
                    }
                }
            }
        })
        .await;
        if let Err(error) = result {
            model.state.error = Some(error);
            model.state.transition = None;
            model.transition_started = None;
            break;
        }
        match action {
            Action::Place(display, fallback) => {
                model.state.actual_display = Some(display.id.clone());
                model.placed = Some((display, fallback));
            }
            Action::Top(value) => model.applied_top = Some(value),
            Action::MenuBar(policy) => model.applied_menu_bar_policy = Some(policy),
            Action::Fullscreen(_) => break,
        }
    }
}
async fn run(
    window: WebviewWindow,
    observer: usize,
    dir: PathBuf,
    mut model: Coordinator,
    shared: Arc<Mutex<WindowState>>,
    mut rx: mpsc::UnboundedReceiver<Event>,
) {
    let start = Instant::now();
    let mut last_scan = Instant::now();
    let mut timer = tokio::time::interval(Duration::from_millis(250));
    timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        let event = tokio::select! {
            event = rx.recv() => match event { Some(event) => event, None => break },
            _ = timer.tick() => {
                let now = start.elapsed().as_millis() as u64;
                if model.timeout_due(now) {
                    match inspect(&window, observer).await { Ok(native) => model.timeout(&native), Err(error) => { model.state.error = Some(error); model.state.transition = None; model.transition_started = None; } }
                    publish(&window, &mut model, &shared);
                }
                if last_scan.elapsed() < Duration::from_secs(3) { continue; }
                last_scan = Instant::now(); Event::Refresh
            }
        };
        if matches!(event, Event::Closed) {
            break;
        }
        if matches!(event, Event::Native(6)) {
            model.suspend();
        }
        let previous_displays = model.state.displays.clone();
        let observed = match inspect(&window, observer).await {
            Ok(native) => {
                model.observe(&native);
                Some(native)
            }
            Err(error) => {
                model.state.error = Some(error);
                None
            }
        };
        if previous_displays != model.state.displays {
            let _ = window.emit("sys-hud://display-change", serde_json::json!({ "secondary_connected": model.state.displays.iter().any(|display| !display.primary) }));
        }
        let mut reply = None;
        match event {
            Event::Native(kind) => {
                if cfg!(debug_assertions) && std::env::var_os("SYSHUD_WINDOW_TRACE").is_some() {
                    eprintln!("WINDOW_NATIVE_EVENT {kind}");
                }
                if kind == 5 {
                    let _ = window.emit("sys-hud://escape", ());
                }
                if kind == 7 || kind == 8 {
                    if let Some(native) = &observed {
                        model.resume(native, start.elapsed().as_millis() as u64);
                    }
                }
                if kind == 4 {
                    model.placed = None;
                }
                if model.native_event(kind, start.elapsed().as_millis() as u64) {
                    persist(&mut model, &dir);
                }
            }
            Event::Update(update, sender) => match apply_update(&mut model, update, &dir) {
                Ok(()) => reply = Some(sender),
                Err(error) => {
                    let _ = sender.send(Err(error));
                }
            },
            _ => {}
        }
        reconcile(&window, observer, &mut model, start, &shared).await;
        model.finish_wake_recovery();
        publish(&window, &mut model, &shared);
        if let Some(reply) = reply {
            let _ = reply.send(Ok(model.state.clone()));
        }
    }
}

#[cfg(test)]
#[path = "window/tests.rs"]
mod tests;
