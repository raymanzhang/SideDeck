// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

export type UiSize = "standard" | "large" | "extra-large";
export const UI_PREFS_KEY = "sys-hud:ui-prefs";
export function readUiSize(storage: Pick<Storage, "getItem">): UiSize {
  try {
    const value = JSON.parse(storage.getItem(UI_PREFS_KEY) ?? "null");
    if (value?.version === 1 && ["standard", "large", "extra-large"].includes(value.size)) return value.size;
  } catch { /* Bad or unavailable storage uses the readable default. */ }
  return "large";
}
export function saveUiSize(storage: Pick<Storage, "setItem">, size: UiSize): string | null {
  try { storage.setItem(UI_PREFS_KEY, JSON.stringify({ version: 1, size })); return null; }
  catch { return "Your size is applied, but could not be saved. Try selecting it again."; }
}
