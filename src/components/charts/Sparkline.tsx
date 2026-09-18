// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { chartSegments, type ChartPoint } from "../../state/charts";
export function Sparkline({ points, endTime, ceiling, label, dashed = false }: {
  points: ChartPoint[]; endTime: number; ceiling: number; label: string; dashed?: boolean;
}) {
  const segments = chartSegments(points, endTime, ceiling);
  return <svg className="sparkline" viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label={label}>
    <path d="M2 2H298 M2 40H298 M2 78H298" fill="none" stroke="currentColor" opacity=".18" />
    {segments.map((segment, index) => segment.length === 1
      ? <circle key={index} cx={segment[0].x} cy={segment[0].y} r="2" fill="currentColor" />
      : <path key={index} d={segment.map((point, i) => `${i ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={dashed ? "6 4" : undefined} vectorEffect="non-scaling-stroke" />)}
  </svg>;
}
