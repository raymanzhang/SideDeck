// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

export type PanelId = "system" | "ai-tools";
export const PANEL_ORDER_KEY = "sys-hud:panel-order:v2";
const LEGACY = "sys-hud:panel-order";
export function normalizeOrder(value: unknown): PanelId[] {
  const valid = Array.isArray(value)
    ? value.filter((v): v is PanelId => v === "system" || v === "ai-tools")
    : [];
  return [...new Set([...valid, "system", "ai-tools"])] as PanelId[];
}
export function migrateOrder(
  storage: Pick<Storage, "getItem" | "setItem">,
): PanelId[] {
  let order = normalizeOrder(null);
  try {
    const current = storage.getItem(PANEL_ORDER_KEY);
    if (current) {
      const value = JSON.parse(current);
      if (value.version === 2) return normalizeOrder(value.order);
    }
  } catch {
    /* Try legacy if corrupt. */
  }
  try {
    const raw = storage.getItem(LEGACY);
    if (raw) {
      try {
        order = normalizeOrder(JSON.parse(raw));
      } catch {
        /* preserve malformed backup too */
      }
      try {
        if (!storage.getItem(`${LEGACY}:backup`))
          storage.setItem(`${LEGACY}:backup`, raw);
      } catch {}
    }
  } catch {}
  try {
    storage.setItem(PANEL_ORDER_KEY, JSON.stringify({ version: 2, order }));
  } catch {}
  return order;
}
export function migrateActive(value: unknown): PanelId {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      /* Plain legacy IDs are valid. */
    }
  }
  return value === "ai-account" || value === "ai-tools" ? "ai-tools" : "system";
}
