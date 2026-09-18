// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { clampPercent } from "../../state/charts";
export function UsageRing({ percent, label, color = "text-hud-accent" }: {
  percent: number | null | undefined; label: string; color?: string;
}) {
  const value = clampPercent(percent);
  const circumference = 2 * Math.PI * 46;
  return <div className={`usage-ring ${color}`} role="img" aria-label={`${label}: ${value === null ? "unavailable" : `${value.toFixed(1)}%`}`}>
    <svg viewBox="0 0 104 104" aria-hidden="true">
      <circle cx="52" cy="52" r="46" fill="none" stroke="currentColor" strokeWidth="6" className="text-hud-border" />
      {value !== null && <circle cx="52" cy="52" r="46" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} transform="rotate(-90 52 52)" />}
    </svg>
    <span className="ring-value">{value === null ? "—" : `${Math.round(value)}%`}</span>
  </div>;
}
