// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { UsageRing as Ring } from "../charts/UsageRing";
export function UsageRing({ percent, label = "Usage" }: { percent: number | null | undefined; label?: string }) {
  const color = typeof percent !== "number" || !Number.isFinite(percent) ? "text-hud-text-dim" : percent >= 100 ? "text-red-400" : percent >= 80 ? "text-amber-400" : "text-hud-accent";
  return <Ring percent={percent} label={label} color={color} />;
}
