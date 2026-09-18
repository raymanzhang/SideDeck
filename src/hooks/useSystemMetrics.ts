// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useSyncExternalStore } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SystemMetrics } from "../types/system";
import { appendSample, checkFreshness, emptyHistory, type SystemHistory } from "../state/systemHistory";

let history = emptyHistory();
const subscribers = new Set<() => void>();
let disconnect: (() => void) | undefined;
function publish(next: SystemHistory) {
  if (next === history) return;
  history = next; subscribers.forEach(notify => notify());
}
function connect() {
  let disposed = false;
  let unlisten: (() => void) | undefined;
  const check = () => publish(checkFreshness(history, performance.now(), Date.now()));
  if (isTauri()) {
    void listen<SystemMetrics>("provider:system", event => {
      if (!disposed) publish(appendSample(history, event.payload, performance.now(), Date.now()));
    }).then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(error => console.error("System subscription failed", error));
  }
  const timer = setInterval(check, 500);
  document.addEventListener("visibilitychange", check);
  window.addEventListener("pageshow", check);
  check();
  return () => {
    disposed = true; unlisten?.(); clearInterval(timer);
    document.removeEventListener("visibilitychange", check); window.removeEventListener("pageshow", check);
  };
}
function subscribe(notify: () => void) {
  subscribers.add(notify);
  if (subscribers.size === 1) disconnect = connect();
  return () => { subscribers.delete(notify); if (!subscribers.size) { disconnect?.(); disconnect = undefined; } };
}
const snapshot = () => history;
/** App-level singleton: navigation never resets history or adds another listener. */
export function useSystemMetrics() { return useSyncExternalStore(subscribe, snapshot); }
