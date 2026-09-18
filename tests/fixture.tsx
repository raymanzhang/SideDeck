// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { mockIPC } from "@tauri-apps/api/mocks";
import { accountFixture } from "./fixtures/activity";
import { emit } from "@tauri-apps/api/event";
import type { WindowState, WindowPreferenceUpdate } from "../src/types/window";
Object.assign(window, { isTauri: true });
let windowState: WindowState = {
  revision: 1,
  preferences: {
    version: 1,
    target: { mode: "auto" },
    fullscreenWanted: false,
    alwaysOnTop: false,
  },
  displays: [
    {
      id: "main",
      name: "Primary",
      legacyName: "Main",
      primary: true,
      scaleFactor: 2,
      x: 0,
      y: 0,
      width: 3840,
      height: 2560,
      work: { x: 0, y: 50, width: 3840, height: 2450 },
    },
    {
      id: "side",
      name: "Secondary",
      legacyName: "Side",
      primary: false,
      scaleFactor: 2,
      x: -3840,
      y: 0,
      width: 3840,
      height: 1152,
      work: { x: -3840, y: 50, width: 3840, height: 1102 },
    },
  ],
  actualDisplay: "side",
  actualFullscreen: false,
  transition: null,
  fallbackReason: null,
  error: null,
  storageError: null,
  needsLegacyImport: true,
};
const windowUpdates: WindowPreferenceUpdate[] = [];
mockIPC(
  async (command, args) => {
    if (command === "get_openai_account") return accountFixture;
    if (command === "get_codex_thread_usage")
      return { status: "ok", threadUsage: null };
    if (command === "is_autostart_enabled") return false;
    if (command === "get_window_state") return structuredClone(windowState);
    if (command === "update_window_preferences") {
      const update = args.update as WindowPreferenceUpdate;
      windowUpdates.push(update);
      if (update.importLegacy) {
        if (windowState.needsLegacyImport)
          windowState.preferences.alwaysOnTop =
            update.legacyAlwaysOnTop ?? false;
        windowState.needsLegacyImport = false;
      } else {
        if (update.alwaysOnTop !== undefined)
          windowState.preferences.alwaysOnTop = update.alwaysOnTop;
        if (update.target) windowState.preferences.target = update.target;
        if (update.fullscreenWanted !== undefined) {
          windowState.preferences.fullscreenWanted = update.fullscreenWanted;
          windowState.transition = update.fullscreenWanted
            ? "entering"
            : "exiting";
        }
        if (update.retry) windowState.error = null;
      }
      windowState.revision++;
      return structuredClone(windowState);
    }
  },
  { shouldMockEvents: true },
);
const original = window.__TAURI_INTERNALS__.invoke;
const listeners = new Set<number>();
window.__TAURI_INTERNALS__.invoke = async (command, args, options) => {
  const result = await original(command, args, options);
  if (command === "plugin:event|listen" && args?.event === "provider:system")
    listeners.add(result as number);
  if (command === "plugin:event|unlisten" && args?.event === "provider:system")
    listeners.delete(args.eventId as number);
  return result;
};
Object.assign(window, {
  pushMetrics: (payload: unknown) => emit("provider:system", payload),
  pushProvider: (id: string, payload: unknown) =>
    emit(`provider:${id}`, payload),
  systemListenerCount: () => listeners.size,
  windowUpdates: () => windowUpdates,
  nativeEscape: () => emit("sys-hud://escape"),
  pushWindow: async (patch: Partial<WindowState>) => {
    windowState = {
      ...windowState,
      ...patch,
      revision: windowState.revision + 1,
    };
    await emit("sys-hud://window-state", structuredClone(windowState));
  },
});
await import("../src/main");
