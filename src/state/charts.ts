// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

export interface ChartPoint { time: number; value: number | null; gap?: boolean; }
export const clampPercent = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
export function networkCeiling(values: (number | null)[]): number {
  const peak = Math.max(0, ...values.filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0));
  if (!peak) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  return ([1, 2, 5, 10].find(step => step * magnitude >= peak) ?? 10) * magnitude;
}
/** Null values and gaps break the path; no zero samples or interpolated points are invented. */
export function chartSegments(points: ChartPoint[], endTime: number, ceiling: number): { x: number; y: number }[][] {
  if (!Number.isFinite(endTime) || !Number.isFinite(ceiling) || ceiling <= 0) return [];
  const segments: { x: number; y: number }[][] = [];
  let segment: { x: number; y: number }[] = [];
  let previous: number | undefined;
  const flush = () => { if (segment.length) segments.push(segment); segment = []; };
  for (const point of points) {
    if (point.gap || (previous !== undefined && (point.time < previous || point.time - previous > 6000))) flush();
    previous = point.time;
    if (!Number.isFinite(point.time) || point.time < endTime - 60000 || point.time > endTime || point.value === null || !Number.isFinite(point.value) || point.value < 0) { flush(); continue; }
    segment.push({ x: 2 + (point.time - (endTime - 60000)) / 60000 * 296, y: 78 - Math.min(1, point.value / ceiling) * 76 });
  }
  flush(); return segments;
}
