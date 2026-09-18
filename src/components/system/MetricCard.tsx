// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

interface MetricCardProps {
  tone?: "green" | "blue" | "amber" | "red";
  label: string;
  value: string;
  percent?: number;
  subValue?: string;
}

export function MetricCard({
  tone = "blue",
  label,
  value,
  percent,
  subValue,
}: MetricCardProps) {
  const colors = { green: "text-neon-green", blue: "text-neon-blue", amber: "text-neon-amber", red: "text-neon-red" };
  return (
    <div className="rounded border border-hud-border bg-hud-panel px-3 py-2">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-small font-semibold uppercase tracking-wider text-hud-text-dim">
          {label}
        </span>
        <span className={`metric-value text-body font-medium tabular-nums ${colors[tone]}`}>
          {value}
        </span>
      </div>
      {percent != null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-hud-border">
          <div
            className="metric-progress h-full rounded-full"
            style={{ backgroundColor: `var(--color-neon-${tone})`, width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      )}
      {subValue && (
        <p className="mt-1 text-small tabular-nums text-hud-text-dim">
          {subValue}
        </p>
      )}
    </div>
  );
}
