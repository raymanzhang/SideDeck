// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Display {
    pub id: String,
    pub name: String,
    pub legacy_name: String,
    pub primary: bool,
    pub scale_factor: f64,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub work: Rect,
}
impl Display {
    pub fn same_geometry(&self, other: &Self) -> bool {
        self.id == other.id
            && self.x == other.x
            && self.y == other.y
            && self.width == other.width
            && self.height == other.height
            && self.scale_factor == other.scale_factor
    }
    pub fn window_rect(&self, fallback: bool) -> Rect {
        if !fallback {
            // Windowed mode fills the usable work area. Only native fullscreen
            // owns the menu-bar/Dock area; controls must remain on screen.
            return self.work.clone();
        }
        let width = ((800.0 * self.scale_factor).round() as u32).min(self.work.width);
        let height = ((400.0 * self.scale_factor).round() as u32).min(self.work.height);
        Rect {
            x: self.work.x + ((self.work.width - width) / 2) as i32,
            y: self.work.y + ((self.work.height - height) / 2) as i32,
            width,
            height,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum Target {
    #[default]
    Auto,
    Display {
        id: Option<String>,
        name: String,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WindowPreferences {
    pub version: u8,
    pub target: Target,
    pub fullscreen_wanted: bool,
    pub always_on_top: bool,
}
impl Default for WindowPreferences {
    fn default() -> Self {
        Self {
            version: 1,
            target: Target::Auto,
            fullscreen_wanted: false,
            always_on_top: false,
        }
    }
}
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreferenceUpdate {
    pub target: Option<Target>,
    pub fullscreen_wanted: Option<bool>,
    pub always_on_top: Option<bool>,
    #[serde(default)]
    pub import_legacy: bool,
    pub legacy_always_on_top: Option<bool>,
    #[serde(default)]
    pub retry: bool,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub revision: u64,
    pub preferences: WindowPreferences,
    pub displays: Vec<Display>,
    pub actual_display: Option<String>,
    pub actual_fullscreen: bool,
    pub transition: Option<String>,
    pub fallback_reason: Option<String>,
    pub error: Option<String>,
    pub storage_error: Option<String>,
    pub needs_legacy_import: bool,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSnapshot {
    pub displays: Vec<Display>,
    pub actual_display: Option<String>,
    pub fullscreen: bool,
    pub transitioning: bool,
    #[serde(default)]
    pub menu_bar_policy: u8,
}
pub fn select_display<'a>(
    target: &Target,
    displays: &'a [Display],
) -> (Option<&'a Display>, Option<String>) {
    let primary = displays.iter().find(|d| d.primary).or(displays.first());
    match target {
        Target::Auto => match displays.iter().find(|d| !d.primary) {
            Some(d) => (Some(d), None),
            None => (primary, Some("No secondary display connected".into())),
        },
        Target::Display { id, name } => {
            let matches: Vec<_> = displays
                .iter()
                .filter(|d| match id {
                    Some(id) => !id.is_empty() && &d.id == id,
                    None => &d.name == name || &d.legacy_name == name,
                })
                .collect();
            match matches.as_slice() {
                [display] => (Some(*display), None),
                [] => (primary, Some("Selected display is disconnected".into())),
                _ => (
                    primary,
                    Some("Display identity is ambiguous; select a display again".into()),
                ),
            }
        }
    }
}
#[derive(Clone, Debug, PartialEq)]
pub enum Action {
    Fullscreen(bool),
    Place(Display, bool),
    Top(bool),
    MenuBar(u8),
}
pub struct Coordinator {
    pub state: WindowState,
    pub transition_started: Option<u64>,
    pub native_busy: bool,
    pub internal_exit: bool,
    pub internal_entry: bool,
    pub display_lost: bool,
    pub placed: Option<(Display, bool)>,
    pub applied_top: Option<bool>,
    pub sleeping: bool,
    pub recovering_wake: bool,
    pub menu_bar_policy: u8,
    pub applied_menu_bar_policy: Option<u8>,
}
impl Coordinator {
    pub fn new(
        preferences: WindowPreferences,
        needs_legacy_import: bool,
        storage_error: Option<String>,
    ) -> Self {
        Self {
            state: WindowState {
                revision: 0,
                preferences,
                displays: vec![],
                actual_display: None,
                actual_fullscreen: false,
                transition: None,
                fallback_reason: None,
                error: None,
                storage_error,
                needs_legacy_import,
            },
            transition_started: None,
            native_busy: false,
            internal_exit: false,
            internal_entry: false,
            display_lost: false,
            placed: None,
            applied_top: None,
            sleeping: false,
            recovering_wake: false,
            menu_bar_policy: 0,
            applied_menu_bar_policy: None,
        }
    }
    pub fn observe(&mut self, snapshot: &NativeSnapshot) {
        // macOS can exit fullscreen on disconnect before our queued relocation
        // runs, even when the user has already selected another connected screen.
        if (self.state.actual_fullscreen || self.internal_entry || self.native_busy)
            && self
                .state
                .actual_display
                .as_ref()
                .is_some_and(|id| !snapshot.displays.iter().any(|display| &display.id == id))
        {
            self.display_lost = true;
        }
        self.menu_bar_policy = snapshot.menu_bar_policy;
        self.state.displays = snapshot.displays.clone();
        self.state.actual_display = snapshot.actual_display.clone();
        self.native_busy = snapshot.transitioning;
        self.state.fallback_reason =
            select_display(&self.state.preferences.target, &self.state.displays).1;
        // Normal completion only comes from native did notifications. The snapshot
        // is used for timeout reporting, not to finish an in-progress animation.
    }
    pub fn next_action(&self) -> Option<Action> {
        if self.sleeping
            || self.state.error.is_some()
            || self.state.transition.is_some()
            || self.native_busy
        {
            return None;
        }
        let (target, fallback) =
            select_display(&self.state.preferences.target, &self.state.displays);
        let target = target?;
        let fallback = fallback.is_some();
        let wanted = self.state.preferences.fullscreen_wanted && !fallback;
        let move_needed = self.placed.as_ref().is_none_or(|(placed, was_fallback)| {
            !placed.same_geometry(target) || *was_fallback != fallback
        }) || self
            .state
            .actual_display
            .as_ref()
            .is_some_and(|id| id != &target.id);
        if self.state.actual_fullscreen && (!wanted || move_needed) {
            return Some(Action::Fullscreen(false));
        }
        let top = self.state.preferences.always_on_top && !self.state.actual_fullscreen && !wanted;
        if self.applied_top != Some(top) {
            return Some(Action::Top(top));
        }
        if move_needed {
            return Some(Action::Place(target.clone(), fallback));
        }
        if wanted && !self.state.actual_fullscreen {
            return Some(Action::Fullscreen(true));
        }
        if self.state.actual_fullscreen
            && self.applied_menu_bar_policy != Some(self.menu_bar_policy)
        {
            return Some(Action::MenuBar(self.menu_bar_policy));
        }
        None
    }
    pub fn begin(&mut self, action: &Action, now: u64) {
        if let Action::Fullscreen(enter) = action {
            self.state.transition = Some(if *enter { "entering" } else { "exiting" }.into());
            self.transition_started = Some(now);
            self.internal_exit = !enter;
            self.internal_entry = *enter;
        }
    }
    /// Returns true only when a system/user exit should update persistent intent.
    pub fn native_event(&mut self, kind: i32, now: u64) -> bool {
        match kind {
            1 | 3 => {
                self.native_busy = true;
                if self.state.transition.is_none() && self.state.error.is_none() {
                    self.state.transition =
                        Some(if kind == 1 { "entering" } else { "exiting" }.into());
                    self.transition_started = Some(now);
                }
            }
            2 | 4 => {
                let external_entry = kind == 2 && !self.internal_entry;
                let external_exit = kind == 4
                    && !self.internal_exit
                    && !self.display_lost
                    && !self.sleeping
                    && !self.recovering_wake
                    && self.state.fallback_reason.is_none();
                self.state.actual_fullscreen = kind == 2;
                self.applied_menu_bar_policy = None;
                self.native_busy = false;
                self.state.transition = None;
                self.transition_started = None;
                self.internal_exit = false;
                self.internal_entry = false;
                if kind == 4 {
                    self.display_lost = false;
                }
                if external_exit {
                    self.state.preferences.fullscreen_wanted = false;
                    return true;
                }
                // An external native entry is also a user choice worth retaining.
                if external_entry
                    && !self.sleeping
                    && !self.recovering_wake
                    && !self.state.preferences.fullscreen_wanted
                {
                    self.state.preferences.fullscreen_wanted = true;
                    return true;
                }
            }
            _ => {}
        }
        false
    }
    pub fn timeout_due(&self, now: u64) -> bool {
        !self.sleeping
            && self
                .transition_started
                .is_some_and(|start| now.saturating_sub(start) >= 10_000)
    }
    pub fn timeout(&mut self, snapshot: &NativeSnapshot) {
        self.observe(snapshot);
        self.state.actual_fullscreen = snapshot.fullscreen;
        self.state.transition = None;
        self.transition_started = None;
        self.state.error = Some("Fullscreen transition timed out. Actual window state was queried; retry when macOS finishes the transition.".into());
    }
    pub fn suspend(&mut self) {
        self.sleeping = true;
        self.recovering_wake = true;
    }
    pub fn resume(&mut self, snapshot: &NativeSnapshot, now: u64) {
        let failed = self.state.error.is_some();
        let stale_idle = self.state.transition.is_none()
            && !snapshot.transitioning
            && self.state.actual_fullscreen != snapshot.fullscreen;
        let reset = self.sleeping || failed || stale_idle;
        self.sleeping = false;
        self.recovering_wake = true;
        self.observe(snapshot);
        // didWake and screensDidWake can both arrive in one wake cycle. Do not
        // cancel a fresh entry request or restart an already-completed recovery.
        if !reset {
            return;
        }
        self.state.error = None;
        // Keep a still-correct placement. The fresh actual display and geometry
        // drive relocation when needed; otherwise waking must not exit/re-enter
        // an intact fullscreen Space and take focus from the primary application.
        if snapshot.actual_display.is_none() {
            self.placed = None;
        }
        self.applied_top = None;
        self.applied_menu_bar_policy = None;
        if snapshot.transitioning || (self.state.transition.is_some() && !failed) {
            self.transition_started = Some(now);
        } else {
            // Sleep can remove a native fullscreen Space without delivering did-exit.
            self.state.actual_fullscreen = snapshot.fullscreen;
            self.state.transition = None;
            self.transition_started = None;
            self.internal_entry = false;
            self.internal_exit = false;
        }
    }
    pub fn finish_wake_recovery(&mut self) {
        if !self.recovering_wake
            || self.sleeping
            || self.native_busy
            || self.state.transition.is_some()
            || self.state.error.is_some()
        {
            return;
        }
        let (target, fallback) =
            select_display(&self.state.preferences.target, &self.state.displays);
        if !self.state.preferences.fullscreen_wanted
            || (fallback.is_none()
                && target.is_some_and(|d| self.state.actual_display.as_ref() == Some(&d.id))
                && self.state.actual_fullscreen)
        {
            self.recovering_wake = false;
        }
    }
    pub fn retry(&mut self) -> Result<(), String> {
        if self.native_busy {
            return Err("macOS is still transitioning; retry after the animation finishes".into());
        }
        self.state.error = None;
        self.transition_started = None;
        self.state.transition = None;
        self.internal_exit = false;
        self.internal_entry = false;
        self.display_lost = false;
        self.placed = None;
        self.applied_top = None;
        Ok(())
    }
}
