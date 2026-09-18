// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { useWindowPrefs } from "../hooks/useWindowPrefs";
import type { useUiPreferences } from "../hooks/useUiPreferences";
import type { UiSize } from "../state/uiPreferences";
import { AboutPage } from "./AboutPage";
export function SettingsBar({
  prefs,
  ui,
  editing,
  onEdit,
}: {
  prefs: ReturnType<typeof useWindowPrefs>;
  ui: ReturnType<typeof useUiPreferences>;
  editing: boolean;
  onEdit: (value: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    if (!prefs.available) return;
    let disposed = false;
    invoke<boolean>("is_autostart_enabled")
      .then((value) => {
        if (!disposed) setAutostart(value);
      })
      .catch((reason) => {
        if (!disposed) setError(String(reason));
      });
    return () => {
      disposed = true;
    };
  }, [prefs.available]);
  const toggleAutostart = async () => {
    if (busy.current || autostart === null) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await invoke(autostart ? "disable_autostart" : "enable_autostart");
      setAutostart(await invoke<boolean>("is_autostart_enabled"));
    } catch (reason) {
      setError(String(reason));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  const close = () => {
    dialog.current?.close();
    trigger.current?.focus({ preventScroll: true });
  };
  return (
    <>
      <footer className="settings-bar" aria-label="Dashboard controls">
        {editing && (
          <button className="control" onClick={() => onEdit(false)}>
            Done editing
          </button>
        )}
        <button
          className="control"
          disabled={!prefs.available || prefs.pending || !prefs.state}
          onClick={prefs.toggleFullscreen}
        >
          {prefs.state?.transition
            ? prefs.state.transition === "entering"
              ? "Entering fullscreen…"
              : "Exiting fullscreen…"
            : prefs.state?.actualFullscreen
              ? "Exit fullscreen"
              : prefs.state?.preferences.fullscreenWanted
                ? "Cancel fullscreen restore"
                : "Enter fullscreen"}
        </button>
        <span className="text-small text-neon-amber" role="status">
          {prefs.error ? "Window error — open Settings" : ""}
        </span>
        <button
          ref={trigger}
          type="button"
          className="control ml-auto"
          onClick={() => dialog.current?.showModal()}
        >
          Settings
        </button>
      </footer>
      <dialog
        ref={dialog}
        className="settings-dialog"
        aria-labelledby="settings-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <div className="page-nav">
          <h2 id="settings-title" className="text-title mr-auto">
            Settings
          </h2>
          <button className="control" onClick={close}>
            Close
          </button>
        </div>
        <div className="settings-content">
          <section><AboutPage /></section>
          <fieldset>
            <legend className="text-title mb-2">Interface size</legend>
            <div className="control-row">
              {(["standard", "large", "extra-large"] as UiSize[]).map(
                (size) => (
                  <button
                    key={size}
                    className="control"
                    aria-pressed={ui.size === size}
                    onClick={() => ui.selectSize(size)}
                  >
                    {size === "extra-large"
                      ? "Extra large"
                      : size === "large"
                        ? "Large"
                        : "Standard"}
                  </button>
                ),
              )}
            </div>
            {ui.error && (
              <p role="status" className="text-neon-amber">
                {ui.error}
              </p>
            )}
          </fieldset>
          <section>
            <button
              className="control"
              aria-pressed={ui.animations}
              onClick={() => ui.setAnimations(!ui.animations)}
            >
              Attention animations: {ui.animations ? "On" : "Off"}
            </button>
          </section>
          <section>
            <h3 className="text-title mb-2">Layout</h3>
            <button
              className="control"
              aria-pressed={editing}
              onClick={() => {
                onEdit(!editing);
                close();
              }}
            >
              {editing ? "Finish editing layout" : "Edit layout"}
            </button>
            <p className="text-small text-hud-text-dim">
              Use earlier / later buttons in each panel header, or drag its
              handle.
            </p>
          </section>
          <section>
            <h3 className="text-title mb-2">Window</h3>
            {!prefs.available && (
              <p className="text-small text-hud-text-dim">
                Desktop settings unavailable in browser preview.
              </p>
            )}
            <div className="control-row">
              <button
                className="control"
                aria-pressed={prefs.alwaysOnTop}
                disabled={!prefs.available || prefs.pending}
                onClick={prefs.toggle}
              >
                Always on top: {prefs.alwaysOnTop ? "On" : "Off"}
              </button>
              <button
                className="control"
                aria-pressed={autostart ?? false}
                disabled={!prefs.available || pending || autostart === null}
                onClick={toggleAutostart}
              >
                Launch at login:{" "}
                {autostart === null ? "Unavailable" : autostart ? "On" : "Off"}
              </button>
            </div>
            <label className="block mt-3">
              Target display
              <select
                className="control block w-full mt-2 bg-hud-panel"
                disabled={!prefs.available || prefs.pending || !prefs.state}
                value={
                  prefs.state?.preferences.target.mode === "display"
                    ? (prefs.state.preferences.target.id ??
                      `name:${prefs.state.preferences.target.name}`)
                    : "auto"
                }
                onChange={(event) => {
                  if (event.target.value === "auto") {
                    void prefs.update({ target: { mode: "auto" } });
                    return;
                  }
                  const display = prefs.state?.displays.find(
                    (display) => display.id === event.target.value,
                  );
                  if (display)
                    void prefs.update({
                      target: {
                        mode: "display",
                        id: display.id || null,
                        name: display.name,
                      },
                    });
                }}
              >
                <option value="auto">Automatic secondary display</option>
                {prefs.state?.preferences.target.mode === "display" &&
                  !prefs.state.displays.some(
                    (display) =>
                      display.id ===
                      (prefs.state!.preferences.target as { id: string | null })
                        .id,
                  ) && (
                    <option
                      value={
                        prefs.state.preferences.target.id ??
                        `name:${prefs.state.preferences.target.name}`
                      }
                    >
                      {prefs.state.preferences.target.name} — unavailable or
                      needs selection
                    </option>
                  )}
                {prefs.state?.displays.map((display, index) => (
                  <option key={`${display.id}-${index}`} value={display.id}>
                    {display.name}
                    {display.primary ? " (Primary)" : ""} ·{" "}
                    {Math.round(display.width / display.scaleFactor)} ×{" "}
                    {Math.round(display.height / display.scaleFactor)} ·{" "}
                    {index + 1}
                  </option>
                ))}
              </select>
            </label>
            <div className="control-row mt-3">
              <button
                className="control"
                disabled={!prefs.available || prefs.pending || !prefs.state}
                onClick={prefs.toggleFullscreen}
              >
                {prefs.state?.actualFullscreen
                  ? "Exit native fullscreen"
                  : prefs.state?.preferences.fullscreenWanted
                    ? "Cancel fullscreen restore"
                    : "Enter native fullscreen"}
              </button>
            </div>
            <p
              className="text-small mt-2"
              role="status"
              aria-label="Window state"
            >
              {prefs.state?.transition
                ? `Window is ${prefs.state.transition} fullscreen…`
                : prefs.state?.actualFullscreen
                  ? "Native fullscreen"
                  : "Windowed"}
              {prefs.state?.actualDisplay &&
                ` · ${prefs.state.displays.find((display) => display.id === prefs.state?.actualDisplay)?.name ?? "Display unavailable"}`}
            </p>
            {prefs.state?.fallbackReason && (
              <p className="text-small text-neon-amber">
                {prefs.state.fallbackReason}
                {prefs.state.preferences.fullscreenWanted
                  ? ". Fullscreen will resume when the selected display returns."
                  : ""}
              </p>
            )}
            {prefs.state?.actualFullscreen && prefs.alwaysOnTop && (
              <p className="text-small text-hud-text-dim">
                Always on top is suspended during fullscreen and restored on
                exit.
              </p>
            )}
            <p className="text-small text-hud-text-dim">
              Menu-bar visibility follows macOS settings. Independent
              main-screen work was tested with “Displays have separate Spaces”
              enabled.
            </p>
            {prefs.error && (
              <button
                className="control"
                disabled={!prefs.available || prefs.pending}
                onClick={prefs.retry}
              >
                Retry window settings
              </button>
            )}
            {(error || prefs.error) && (
              <p role="alert" className="text-neon-red">
                {error || prefs.error}
              </p>
            )}
          </section>
        </div>
      </dialog>
    </>
  );
}
