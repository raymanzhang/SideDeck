// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import type { PanelId } from "../App";
import type { UiSize } from "./uiPreferences";
export const PANEL_WIDTH = { standard: 420, large: 480, "extra-large": 540 };
export const SHORT_HEIGHT = { standard: 380, large: 420, "extra-large": 460 };
export type Columns = 1 | 2;
/** Width includes the dashboard's two 16px outer margins, in CSS pixels. */
export function calculateLayout(
  width: number,
  bodyHeight: number,
  size: UiSize,
  previous?: Columns,
) {
  const minimum = PANEL_WIDTH[size];
  let columns = Math.max(
    1,
    Math.min(2, Math.floor((Math.max(0, width) - 32 + 12) / (minimum + 12))),
  ) as Columns;
  if (previous && columns > previous) {
    while (
      columns > previous &&
      width < 32 + columns * minimum + (columns - 1) * 12 + 16
    )
      columns--;
  }
  return { columns, shortHeight: bodyHeight < SHORT_HEIGHT[size] };
}
export function visiblePanels(
  order: PanelId[],
  active: PanelId,
  columns: Columns,
  secondary?: PanelId,
): PanelId[] {
  if (columns >= order.length) return order;
  if (columns === 1) return [active];
  return [
    order[0],
    active !== order[0]
      ? active
      : secondary && secondary !== order[0]
        ? secondary
        : order[1],
  ];
}
