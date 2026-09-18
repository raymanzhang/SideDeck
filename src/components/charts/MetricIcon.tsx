// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

export type MetricKind = "cpu" | "memory" | "network" | "disk" | "temperature" | "battery";
const paths: Record<MetricKind, string> = {
  cpu: "M6 6h12v12H6z M9 9h6v6H9z M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4",
  memory: "M3 6h18v12H3z M6 9h3v5H6zm9 0h3v5h-3z M6 18v3m4-3v3m4-3v3m4-3v3",
  network: "M7 3v17m-4-4 4 4 4-4 M17 21V4m-4 4 4-4 4 4",
  disk: "M5 4h14l3 12v4H2v-4z M2 16h20 M16 18h3",
  temperature: "M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0 M12 7v10m6-10h3m-3 4h3",
  battery: "M2 6h17v12H2z M21 10v4 M6 9v6m4-6v6m4-6v6",
};
export function MetricIcon({ kind }: { kind: MetricKind }) {
  return <svg className="metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}
