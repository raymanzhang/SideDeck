// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useEffect, useState } from "react";
import {
  migrateOrder,
  normalizeOrder,
  PANEL_ORDER_KEY,
} from "../state/panelOrder";
export function usePanelOrder() {
  const [panelOrder, setPanelOrder] = useState(() => {
    try {
      return migrateOrder(localStorage);
    } catch {
      return normalizeOrder(null);
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        PANEL_ORDER_KEY,
        JSON.stringify({ version: 2, order: panelOrder }),
      );
    } catch {}
  }, [panelOrder]);
  const reorder = useCallback((from: number, to: number) => {
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to < 0 ||
      from > 1 ||
      to > 1 ||
      from === to
    )
      return;
    setPanelOrder((old) => {
      const next = [...old];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }, []);
  return { panelOrder, reorder };
}
