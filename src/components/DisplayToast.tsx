// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
export function DisplayToast() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let unlisten: (() => void) | undefined;
    let previous: boolean | undefined;
    listen<{ secondary_connected: boolean }>("sys-hud://display-change", ({ payload }) => {
      if (disposed || previous === payload.secondary_connected) return;
      previous = payload.secondary_connected;
      clearTimeout(timer);
      setMessage(payload.secondary_connected ? "副屏已恢复" : "副屏已断开");
      timer = setTimeout(() => setMessage(null), payload.secondary_connected ? 2000 : 3000);
    }).then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(console.error);
    return () => { disposed = true; clearTimeout(timer); unlisten?.(); };
  }, []);
  return message ? <div role="status" className="pointer-events-none fixed bottom-16 left-1/2 z-50 -translate-x-1/2 rounded border border-hud-border bg-hud-panel px-4 py-3 text-small text-hud-text">{message}</div> : null;
}
