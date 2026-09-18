// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use super::*;
use model::{select_display, Display, Rect, Target, WindowPreferences};
fn display(id: &str, primary: bool) -> Display {
    Display {
        id: id.into(),
        name: "Same Name".into(),
        legacy_name: format!("Monitor #{id}"),
        primary,
        scale_factor: 2.0,
        x: if primary { 0 } else { -3840 },
        y: 0,
        width: 3840,
        height: 1152,
        work: Rect {
            x: if primary { 0 } else { -3840 },
            y: 50,
            width: 3840,
            height: 1050,
        },
    }
}
fn model() -> Coordinator {
    let mut model = Coordinator::new(WindowPreferences::default(), true, None);
    model.state.displays = vec![display("main", true), display("side", false)];
    model.state.actual_display = Some("main".into());
    model
}
fn finish_immediate(model: &mut Coordinator, now: u64) -> Option<bool> {
    for _ in 0..8 {
        match model.next_action()? {
            Action::Top(top) => model.applied_top = Some(top),
            Action::MenuBar(policy) => model.applied_menu_bar_policy = Some(policy),
            Action::Place(display, fallback) => {
                model.state.actual_display = Some(display.id.clone());
                model.placed = Some((display, fallback));
            }
            action @ Action::Fullscreen(enter) => {
                model.begin(&action, now);
                return Some(enter);
            }
        }
    }
    panic!("coordinator did not settle")
}
#[test]
fn startup_position_then_enter_and_complete_only_on_native_did() {
    let mut m = model();
    m.state.preferences.fullscreen_wanted = true;
    assert_eq!(finish_immediate(&mut m, 10), Some(true));
    assert_eq!(m.placed.as_ref().unwrap().0.id, "side");
    assert!(!m.state.actual_fullscreen);
    assert!(m.next_action().is_none());
    m.native_event(1, 20);
    assert!(!m.state.actual_fullscreen);
    m.native_event(2, 700);
    assert!(m.state.actual_fullscreen);
    assert!(m.state.transition.is_none());
    assert_eq!(m.next_action(), Some(Action::MenuBar(0)));
}
#[test]
fn disconnect_during_enter_then_reconnect_retains_intent_and_clips_work_area() {
    let mut m = model();
    m.state.preferences.fullscreen_wanted = true;
    finish_immediate(&mut m, 0);
    m.state.displays.truncate(1);
    m.state.fallback_reason = select_display(&m.state.preferences.target, &m.state.displays).1;
    assert!(m.next_action().is_none());
    m.native_event(2, 700);
    assert_eq!(finish_immediate(&mut m, 710), Some(false));
    assert!(!m.native_event(4, 1400));
    assert!(m.state.preferences.fullscreen_wanted);
    finish_immediate(&mut m, 1410);
    let (primary, fallback) = m.placed.as_ref().unwrap();
    assert!(*fallback);
    let rect = primary.window_rect(true);
    assert_eq!((rect.width, rect.height), (1600, 800));
    assert!(
        rect.y >= primary.work.y
            && rect.y + rect.height as i32 <= primary.work.y + primary.work.height as i32
    );
    m.state.displays.push(display("side", false));
    m.state.fallback_reason = None;
    assert_eq!(finish_immediate(&mut m, 2000), Some(true));
}
#[test]
fn queued_exit_is_not_overwritten_by_enter_completion() {
    let mut m = model();
    m.state.preferences.fullscreen_wanted = true;
    finish_immediate(&mut m, 0);
    m.state.preferences.fullscreen_wanted = false;
    assert!(!m.native_event(2, 700));
    assert!(!m.state.preferences.fullscreen_wanted);
    assert_eq!(finish_immediate(&mut m, 710), Some(false));
}
#[test]
fn latest_display_choice_wins_when_switch_and_disconnect_compete() {
    let mut m = model();
    m.state.preferences.fullscreen_wanted = true;
    finish_immediate(&mut m, 0);
    m.state.preferences.target = Target::Display {
        id: Some("main".into()),
        name: "Same Name".into(),
    };
    m.state.displays.truncate(1);
    m.native_event(2, 700);
    assert_eq!(finish_immediate(&mut m, 800), Some(false));
    m.native_event(4, 1400);
    assert_eq!(finish_immediate(&mut m, 1500), Some(true));
    assert_eq!(m.placed.as_ref().unwrap().0.id, "main");
}
#[test]
fn explicit_system_exit_clears_wanted_and_restores_top_without_refocusing() {
    let mut m = model();
    m.state.preferences.fullscreen_wanted = true;
    m.state.preferences.always_on_top = true;
    finish_immediate(&mut m, 0);
    m.native_event(2, 700);
    assert_eq!(m.applied_top, Some(false));
    m.native_event(3, 800);
    assert!(m.native_event(4, 1400));
    assert!(!m.state.preferences.fullscreen_wanted);
    assert_eq!(m.next_action(), Some(Action::Top(true))); // No focus action exists.
}
#[test]
fn timeout_reports_actual_state_and_requires_explicit_bounded_retry() {
    let mut m = model();
    m.state.preferences.fullscreen_wanted = true;
    finish_immediate(&mut m, 100);
    assert!(!m.timeout_due(10099));
    assert!(m.timeout_due(10100));
    let mut snapshot = NativeSnapshot {
        displays: m.state.displays.clone(),
        actual_display: Some("side".into()),
        fullscreen: true,
        transitioning: true,
        menu_bar_policy: 0,
    };
    m.timeout(&snapshot);
    assert!(m.state.actual_fullscreen);
    assert!(m.state.error.is_some());
    assert!(m.state.transition.is_none());
    assert!(m.next_action().is_none());
    assert!(m.retry().is_err());
    snapshot.transitioning = false;
    m.observe(&snapshot);
    assert!(m.next_action().is_none());
    assert!(m.retry().is_ok());
}
#[test]
fn identity_survives_geometry_and_ambiguous_names_fail_safely() {
    let mut m = model();
    finish_immediate(&mut m, 0);
    m.state.preferences.target = Target::Display {
        id: None,
        name: "Same Name".into(),
    };
    let (chosen, error) = select_display(&m.state.preferences.target, &m.state.displays);
    assert_eq!(chosen.unwrap().id, "main");
    assert!(error.unwrap().contains("ambiguous"));
    m.state.preferences.target = Target::Display {
        id: Some("absent".into()),
        name: "Same Name".into(),
    };
    assert_eq!(
        select_display(&m.state.preferences.target, &m.state.displays)
            .0
            .unwrap()
            .id,
        "main"
    );
    m.state.preferences.target = Target::Display {
        id: Some("side".into()),
        name: "Same Name".into(),
    };
    m.state.displays[1].scale_factor = 1.5;
    m.state.displays[1].width = 2880;
    assert_eq!(
        select_display(&m.state.preferences.target, &m.state.displays)
            .0
            .unwrap()
            .id,
        "side"
    );
    assert!(matches!(m.next_action(), Some(Action::Place(_, false))));
}
#[test]
fn migration_is_once_atomic_and_preserves_legacy_files() {
    let dir = std::env::temp_dir().join(format!("sys-hud-prefs-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("display-config.json"),
        r#"{"name":"Monitor #side","x":0,"width":123}"#,
    )
    .unwrap();
    let (prefs, needs, error) = preferences::load(&dir, &model().state.displays);
    assert!(needs);
    assert!(error.is_none());
    assert!(matches!(prefs.target,Target::Display{id:Some(ref id),..} if id=="side"));
    let mut m = Coordinator::new(prefs, needs, error);
    apply_update(
        &mut m,
        PreferenceUpdate {
            import_legacy: true,
            legacy_always_on_top: Some(true),
            ..Default::default()
        },
        &dir,
    )
    .unwrap();
    assert!(m.state.preferences.always_on_top);
    assert!(!m.state.needs_legacy_import);
    apply_update(
        &mut m,
        PreferenceUpdate {
            always_on_top: Some(false),
            ..Default::default()
        },
        &dir,
    )
    .unwrap();
    apply_update(
        &mut m,
        PreferenceUpdate {
            import_legacy: true,
            legacy_always_on_top: Some(true),
            ..Default::default()
        },
        &dir,
    )
    .unwrap();
    assert!(!m.state.preferences.always_on_top);
    let (restored, needs, error) = preferences::load(&dir, &[]);
    assert!(!needs);
    assert!(error.is_none());
    assert!(!restored.always_on_top);
    assert!(dir.join("display-config.json").exists());
    assert!(!dir.join("window-preferences.json.tmp").exists());
    let blocker = dir.join("not-a-directory");
    std::fs::write(&blocker, "block").unwrap();
    apply_update(
        &mut m,
        PreferenceUpdate {
            always_on_top: Some(true),
            ..Default::default()
        },
        &blocker,
    )
    .unwrap();
    assert!(m.state.preferences.always_on_top);
    assert!(m.state.storage_error.is_some());
    std::fs::write(dir.join("window-preferences.json"), "broken").unwrap();
    let (_, needs, error) = preferences::load(&dir, &[]);
    assert!(!needs);
    assert!(error.is_some());
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn system_disconnect_exit_during_target_switch_is_temporary() {
    let mut m = model();
    m.state.preferences.fullscreen_wanted = true;
    finish_immediate(&mut m, 0);
    m.native_event(2, 700);
    m.state.preferences.target = Target::Display {
        id: Some("main".into()),
        name: "Same Name".into(),
    };
    m.observe(&NativeSnapshot {
        displays: vec![display("main", true)],
        actual_display: Some("main".into()),
        fullscreen: true,
        transitioning: true,
        menu_bar_policy: 0,
    });
    // The OS starts its own exit before the actor can issue an exit command.
    m.native_event(3, 800);
    assert!(!m.native_event(4, 1400));
    assert!(m.state.preferences.fullscreen_wanted);
    assert_eq!(finish_immediate(&mut m, 1500), Some(true));
    assert_eq!(m.placed.as_ref().unwrap().0.id, "main");
}

fn native_for(m: &Coordinator, fullscreen: bool) -> NativeSnapshot {
    NativeSnapshot {
        displays: m.state.displays.clone(),
        actual_display: m.state.actual_display.clone(),
        fullscreen,
        transitioning: false,
        menu_bar_policy: 0,
    }
}
#[test]
fn visible_menu_modes_to_always_reapply_without_fullscreen_cycle() {
    // 2 = Never; 3 = desktop-only. Both keep the menu visible in fullscreen.
    for visible_policy in [2, 3] {
        let mut m = model();
        m.state.preferences.fullscreen_wanted = true;
        finish_immediate(&mut m, 0);
        m.native_event(2, 700);
        finish_immediate(&mut m, 701);
        let mut native = native_for(&m, true);
        native.menu_bar_policy = visible_policy;
        m.observe(&native);
        assert_eq!(m.next_action(), Some(Action::MenuBar(visible_policy)));
        finish_immediate(&mut m, 800);
        native.menu_bar_policy = 1;
        m.observe(&native);
        assert_eq!(m.next_action(), Some(Action::MenuBar(1)));
        finish_immediate(&mut m, 900);
        assert!(m.state.actual_fullscreen);
        assert!(m.next_action().is_none());
    }
}
#[test]
fn wake_resets_stale_fullscreen_and_timeout_then_returns_to_saved_screen() {
    let mut m = model();
    m.state.preferences.fullscreen_wanted = true;
    finish_immediate(&mut m, 0);
    m.native_event(2, 700);
    finish_immediate(&mut m, 701);
    let target = m.state.preferences.target.clone();
    m.suspend();
    // macOS moved an actually-windowed window to the primary display while asleep.
    let mut native = native_for(&m, false);
    native.actual_display = Some("main".into());
    m.state.error = Some("Fullscreen transition timed out".into());
    m.state.transition = Some("exiting".into());
    m.resume(&native, 30_000);
    assert_eq!(m.state.preferences.target, target);
    assert!(m.state.preferences.fullscreen_wanted);
    assert!(!m.state.actual_fullscreen);
    assert!(m.state.error.is_none());
    assert_eq!(finish_immediate(&mut m, 30_001), Some(true));
    assert_eq!(m.placed.as_ref().unwrap().0.id, "side");
}
#[test]
fn sleep_exit_is_temporary_and_late_display_wake_restores_fullscreen() {
    let mut m = model();
    m.state.preferences.fullscreen_wanted = true;
    finish_immediate(&mut m, 0);
    m.native_event(2, 700);
    m.suspend();
    m.native_event(3, 800);
    assert!(!m.native_event(4, 900));
    assert!(m.state.preferences.fullscreen_wanted);
    assert!(m.next_action().is_none());
    let mut native = native_for(&m, false);
    native.displays.truncate(1);
    native.actual_display = Some("main".into());
    m.resume(&native, 20_000);
    finish_immediate(&mut m, 20_001);
    m.finish_wake_recovery();
    assert!(m.recovering_wake);
    assert!(m.placed.as_ref().unwrap().1);
    native.displays.push(display("side", false));
    m.observe(&native);
    assert_eq!(finish_immediate(&mut m, 21_000), Some(true));
    m.native_event(2, 21_700);
    finish_immediate(&mut m, 21_701);
    m.finish_wake_recovery();
    assert!(!m.recovering_wake);
    m.native_event(3, 22_000);
    assert!(m.native_event(4, 22_700));
    assert!(!m.state.preferences.fullscreen_wanted);
}
#[test]
fn duplicate_wake_does_not_cancel_pending_entry_or_restart_completed_entry() {
    let mut m = model();
    m.state.preferences.fullscreen_wanted = true;
    m.suspend();
    let native = native_for(&m, false);
    m.resume(&native, 100);
    assert_eq!(finish_immediate(&mut m, 101), Some(true));
    // The native will-enter notification may not have arrived yet.
    m.resume(&native, 110);
    assert!(m.state.transition.is_some());
    assert!(m.next_action().is_none());
    m.native_event(2, 700);
    finish_immediate(&mut m, 701);
    m.finish_wake_recovery();
    let native = native_for(&m, true);
    m.resume(&native, 800);
    m.finish_wake_recovery();
    assert!(m.next_action().is_none());
}
#[test]
fn sleep_pauses_timeout_and_explicit_cancel_during_recovery_still_wins() {
    let mut m = model();
    m.state.preferences.fullscreen_wanted = true;
    finish_immediate(&mut m, 0);
    m.suspend();
    assert!(!m.timeout_due(60_000));
    let mut native = native_for(&m, false);
    native.transitioning = true;
    m.resume(&native, 60_000);
    assert!(!m.timeout_due(60_001));
    assert!(m.timeout_due(70_000));
    m.state.preferences.fullscreen_wanted = false;
    m.recovering_wake = false;
    m.native_event(2, 60_700);
    assert!(!m.state.preferences.fullscreen_wanted);
    assert_eq!(finish_immediate(&mut m, 60_701), Some(false));
}

#[test]
fn wake_on_correct_display_does_not_cycle_fullscreen_or_take_focus() {
    let mut m = model();
    m.state.preferences.fullscreen_wanted = true;
    finish_immediate(&mut m, 0);
    m.native_event(2, 700);
    finish_immediate(&mut m, 701);
    m.suspend();
    let native = native_for(&m, true);
    m.resume(&native, 20_000);
    assert_eq!(finish_immediate(&mut m, 20_001), None);
    m.finish_wake_recovery();
    assert!(!m.recovering_wake);
    assert!(m.state.actual_fullscreen);
}
