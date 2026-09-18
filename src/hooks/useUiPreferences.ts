// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useLayoutEffect, useState } from "react";
import { readUiSize, saveUiSize, type UiSize } from "../state/uiPreferences";
export function useUiPreferences() {
  const [size, setSize] = useState<UiSize>(() => {
    try {
      return readUiSize(localStorage);
    } catch {
      return "large";
    }
  });
  const [animations, setAnimations] = useState(() => {
    try {
      return localStorage.getItem("sys-hud:animations:v1") !== "off";
    } catch {
      return true;
    }
  });
  useLayoutEffect(() => {
    document.documentElement.dataset.animations = animations ? "on" : "off";
    try {
      localStorage.setItem("sys-hud:animations:v1", animations ? "on" : "off");
    } catch {}
  }, [animations]);
  const [error, setError] = useState<string | null>(null);
  useLayoutEffect(() => {
    document.documentElement.dataset.size = size;
  }, [size]);
  return {
    size,
    error,
    animations,
    setAnimations,
    selectSize: (next: UiSize) => {
      setSize(next);
      try {
        setError(saveUiSize(localStorage, next));
      } catch {
        setError("Your size is applied, but could not be saved.");
      }
    },
  };
}
