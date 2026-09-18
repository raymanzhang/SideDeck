// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { WindowState, WindowPreferenceUpdate } from "../types/window";
export function useWindowPrefs() {
  const [state, setState] = useState<WindowState | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const busy = useRef(false);
  const accept = useCallback((next: WindowState) => {
    setState(previous => !previous || next.revision >= previous.revision ? next : previous);
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false; let stop: (() => void) | undefined; let stopEscape: (() => void) | undefined;
    void (async () => {
      const unlisten = await listen<WindowState>("sys-hud://window-state", ({ payload }) => { if (!disposed) accept(payload); });
      if (disposed) { unlisten(); return; } stop = unlisten;
      const unlistenEscape = await listen("sys-hud://escape", () => {
        if (!disposed) (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      });
      if (disposed) { unlistenEscape(); return; } stopEscape = unlistenEscape;
      const initial = await invoke<WindowState>("get_window_state");
      if (disposed) return;
      accept(initial);
      if (initial.needsLegacyImport) {
        let alwaysOnTop = false;
        try { alwaysOnTop = JSON.parse(localStorage.getItem("sys-hud:window-prefs") ?? "null")?.alwaysOnTop === true; } catch { /* Missing/corrupt legacy value defaults to false. */ }
        const imported = await invoke<WindowState>("update_window_preferences", { update: { importLegacy: true, legacyAlwaysOnTop: alwaysOnTop } });
        if (!disposed) accept(imported);
      }
    })().catch(reason => { if (!disposed) setCommandError(String(reason)); });
    return () => { disposed = true; stop?.(); stopEscape?.(); };
  }, [accept]);
  const update = useCallback(async (update: WindowPreferenceUpdate) => {
    if (busy.current || !isTauri()) return;
    busy.current = true; setRequesting(true); setCommandError(null);
    try { accept(await invoke<WindowState>("update_window_preferences", { update })); }
    catch (reason) { setCommandError(String(reason)); }
    finally { busy.current = false; setRequesting(false); }
  }, [accept]);
  const pending = requesting || (!!state?.transition) || (isTauri() && !state && !commandError);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const dialog = document.activeElement?.closest<HTMLDialogElement>("dialog[open]") ?? Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]")).slice(-1)[0];
      if (dialog) {
        event.preventDefault();
        const cancel = new Event("cancel", { cancelable: true });
        if (dialog.dispatchEvent(cancel)) dialog.close();
        return;
      }
      if (pending || !state?.actualFullscreen || Array.from(document.querySelectorAll(".detail-page")).some(node => node.getClientRects().length)) return;
      event.preventDefault(); void update({ fullscreenWanted: false });
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [state?.actualFullscreen, pending, update]);
  return {
    state, pending, available: isTauri(),
    alwaysOnTop: state?.preferences.alwaysOnTop ?? false,
    error: commandError || state?.error || state?.storageError || null,
    toggle: () => update({ alwaysOnTop: !state?.preferences.alwaysOnTop }),
    toggleFullscreen: () => update({ fullscreenWanted: !(state?.actualFullscreen || state?.preferences.fullscreenWanted) }),
    retry: () => update({ retry: true }), update,
  };
}
