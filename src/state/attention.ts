// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import type { CodexProviderData, Telemetry } from "../types/codex.ts";
export const SEEN_KEY = "sys-hud:attention:v1";
export const MAX_AGE = 7 * 86400_000;
export type Seen = Record<string, number>;
export interface Attention {
  episodes: Record<
    string,
    { threadId: string; kind: string; confirmed: boolean }
  >;
  flashes: Record<string, { kind: "error" | "completed"; until: number }>;
  previous: Record<string, Telemetry>;
  sampledAt: number;
  confirmed: Record<string, boolean>;
}
export const emptyAttention = (): Attention => ({
  episodes: {},
  flashes: {},
  previous: {},
  sampledAt: 0,
  confirmed: {},
});
export function pruneSeen(seen: Seen, now: number): Seen {
  return Object.fromEntries(
    Object.entries(seen)
      .filter(
        ([, at]) =>
          Number.isFinite(at) && at <= now + 300_000 && now - at < MAX_AGE,
      )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200),
  );
}
export function loadSeen(storage: Pick<Storage, "getItem">, now: number): Seen {
  try {
    const v = JSON.parse(storage.getItem(SEEN_KEY) ?? "null");
    return v?.version === 1 && v.keys && typeof v.keys === "object"
      ? pruneSeen(v.keys, now)
      : {};
  } catch {
    return {};
  }
}
export function saveSeen(
  storage: Pick<Storage, "setItem">,
  seen: Seen,
  now: number,
) {
  try {
    storage.setItem(
      SEEN_KEY,
      JSON.stringify({ version: 1, keys: pruneSeen(seen, now) }),
    );
  } catch {
    /* Memory state remains authoritative. */
  }
}
export function isFresh(
  data: CodexProviderData | null,
  t: Telemetry | undefined,
  now: number,
) {
  if (
    !data?.sampledAt ||
    now - data.sampledAt > 15000 ||
    data.connection === "disconnected" ||
    !t
  )
    return false;
  const source = t.provenance.state?.source;
  return (
    !!source &&
    data.sources?.[source] === true &&
    t.provenance.state.availability === "available"
  );
}
export function reconcileAttention(
  previous: Attention,
  data: CodexProviderData | null,
  now: number,
): Attention {
  if (!data || (data.sampledAt ?? 0) < previous.sampledAt) return previous;
  const episodes = { ...previous.episodes };
  const flashes = { ...previous.flashes };
  const confirmed: Record<string, boolean> = {};
  for (const [key, e] of Object.entries(episodes))
    episodes[key] = { ...e, confirmed: false };
  for (const [id, t] of Object.entries(data.telemetry ?? {})) {
    const fresh = isFresh(data, t, now);
    confirmed[id] = fresh;
    if (fresh) {
      const current = new Set(t.episodes.map((e) => e.id));
      for (const [key, e] of Object.entries(episodes))
        if (e.threadId === id && !current.has(key)) delete episodes[key];
    }
    for (const e of t.episodes)
      episodes[e.id] = { threadId: id, kind: e.kind, confirmed: fresh };
    const old = previous.previous[id];
    if (
      fresh &&
      previous.confirmed[id] &&
      !t.baseline &&
      old &&
      !old.baseline &&
      old.turnId === t.turnId &&
      old.state !== t.state &&
      ["active", "waitingOnApproval", "waitingOnUserInput"].includes(
        old.state,
      ) &&
      (t.state === "completed" || t.state === "error")
    ) {
      flashes[id] = {
        kind: t.state,
        until: now + (t.state === "error" ? 6000 : 4000),
      };
    }
    if (!fresh || t.state !== flashes[id]?.kind || flashes[id]?.until <= now)
      delete flashes[id];
  }
  return {
    episodes,
    flashes,
    previous: data.telemetry ?? {},
    sampledAt: data.sampledAt ?? 0,
    confirmed,
  };
}
export function counts(attention: Attention, seen: Seen, threadId?: string) {
  const entries = Object.entries(attention.episodes).filter(
    ([, e]) => e.confirmed && (!threadId || e.threadId === threadId),
  );
  return {
    pending: entries.length,
    unseen: entries.filter(([key]) => !seen[key]).length,
    unknown: Object.values(attention.episodes).filter(
      (e) => !e.confirmed && (!threadId || e.threadId === threadId),
    ).length,
  };
}
export function hysteresis(
  active: boolean,
  value: number | null | undefined,
  high: number,
  low: number,
) {
  return value == null ? active : active ? value >= low : value >= high;
}
