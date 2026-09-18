// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { CapacityBar } from "../charts/CapacityBar";
import { clampPercent } from "../../state/charts";
export function CpuCores({ cores }: { cores: number[] }) {
  return <div className="core-grid">{cores.map((usage, index) => <div key={index} className="core-row">
    <div className="flex justify-between gap-control"><span>Core {index + 1}</span><span>{clampPercent(usage)?.toFixed(1) ?? "—"}%</span></div>
    <CapacityBar percent={usage} label={`Core ${index + 1}`} />
  </div>)}</div>;
}
