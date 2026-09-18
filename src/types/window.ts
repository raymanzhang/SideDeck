// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

export type DisplayTarget = { mode: "auto" } | { mode: "display"; id: string | null; name: string };
export interface DisplayInfo {
  id: string; name: string; legacyName: string; primary: boolean; scaleFactor: number;
  x: number; y: number; width: number; height: number;
  work: { x: number; y: number; width: number; height: number };
}
export interface WindowPreferences { version: 1; target: DisplayTarget; fullscreenWanted: boolean; alwaysOnTop: boolean; }
export interface WindowState {
  revision: number; preferences: WindowPreferences; displays: DisplayInfo[];
  actualDisplay: string | null; actualFullscreen: boolean;
  transition: "entering" | "exiting" | null; fallbackReason: string | null;
  error: string | null; storageError: string | null; needsLegacyImport: boolean;
}
export interface WindowPreferenceUpdate {
  target?: DisplayTarget; fullscreenWanted?: boolean; alwaysOnTop?: boolean; retry?: boolean;
  importLegacy?: boolean; legacyAlwaysOnTop?: boolean;
}
