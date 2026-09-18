// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export function useProvider<T = unknown>(providerId: string): T | null {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: UnlistenFn | undefined;

    listen<T>(`provider:${providerId}`, (event) => {
      if (!disposed) setData(event.payload);
    }).then((fn) => {
      if (disposed) fn(); else unlisten = fn;
    }).catch(error => console.error(`Provider ${providerId} subscription failed`, error));

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [providerId]);

  return data;
}
