// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { clampPercent } from "../../state/charts";
export function CapacityBar({ percent, label }: { percent: number | null | undefined; label: string }) {
  const value = clampPercent(percent);
  return <div role="img" aria-label={`${label}: ${value === null ? "unavailable" : `${value.toFixed(1)}%`}`} className="capacity-bar">
    {value !== null && <span style={{ width: `${value}%` }} />}
  </div>;
}
