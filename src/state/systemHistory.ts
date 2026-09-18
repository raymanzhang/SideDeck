// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import type { SystemMetrics } from "../types/system";
export const HISTORY_MS = 60_000;
export const GAP_MS = 6_000;
export interface SystemHistory {
  samples: SystemMetrics[];
  receivedAt: number | null;
  receivedWallAt: number | null;
  paused: boolean;
}
export function emptyHistory(): SystemHistory {
  return { samples: [], receivedAt: null, receivedWallAt: null, paused: false };
}
export function isPaused(state: SystemHistory, monotonicNow: number, wallNow: number): boolean {
  return state.receivedAt !== null && (monotonicNow - state.receivedAt > GAP_MS || (state.receivedWallAt !== null && wallNow - state.receivedWallAt > GAP_MS));
}
export function appendSample(state: SystemHistory, sample: SystemMetrics, receivedAt: number, wallNow: number): SystemHistory {
  if (!Number.isSafeInteger(sample.sample_id) || !Number.isFinite(sample.sampled_at_ms)) return state;
  const last = state.samples[state.samples.length - 1];
  // Late or duplicated delivery must not extend the freshness deadline.
  if (last && sample.sample_id <= last.sample_id) return state;
  const reversed = !!last && sample.sampled_at_ms < last.sampled_at_ms;
  const gap = sample.sample_gap || reversed || isPaused(state, receivedAt, wallNow) || (!!last && sample.sampled_at_ms - last.sampled_at_ms > GAP_MS);
  const samples = reversed ? [] : state.samples.filter(point => point.sampled_at_ms >= sample.sampled_at_ms - HISTORY_MS);
  return { samples: [...samples, { ...sample, sample_gap: gap }].slice(-64), receivedAt, receivedWallAt: wallNow, paused: false };
}
export function checkFreshness(state: SystemHistory, monotonicNow: number, wallNow: number): SystemHistory {
  const paused = isPaused(state, monotonicNow, wallNow);
  return state.paused === paused ? state : { ...state, paused };
}
