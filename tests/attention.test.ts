// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyAttention,
  reconcileAttention,
  counts,
  loadSeen,
  pruneSeen,
  MAX_AGE,
  hysteresis,
} from "../src/state/attention.ts";
import type { CodexProviderData, Telemetry } from "../src/types/codex.ts";
const telemetry = (state = "waitingOnUserInput", ids = ["a"]): Telemetry => ({
  threadId: "one",
  parentThreadId: null,
  state: state as Telemetry["state"],
  turnId: "turn",
  turnStartedAt: 1,
  turnEndedAt: null,
  waitingSince: 1,
  actions: [],
  plan: null,
  tokenUsage: null,
  settings: null,
  episodes: ids.map((id) => ({ id, kind: "waitingOnUserInput", startedAt: 1 })),
  provenance: {
    state: { source: "ipc", observedAt: 1, availability: "available" },
  },
  baseline: false,
});
const data = (t: Telemetry, now = 1000): CodexProviderData => ({
  status: "ok",
  dataSource: "ipc",
  sampledAt: now,
  connection: "polling",
  sources: { ipc: true, file: true },
  threads: [],
  recentEvents: {},
  config: { model: "", modelProvider: "", sandboxMode: "", approvalPolicy: "" },
  telemetry: { one: t },
});
test("viewing does not resolve; new requests, reconnect and real resolution", () => {
  let a = reconcileAttention(emptyAttention(), data(telemetry()), 1000);
  assert.equal(counts(a, {}).unseen, 1);
  assert.equal(counts(a, { a: 1000 }).pending, 1);
  assert.equal(counts(a, { a: 1000 }).unseen, 0);
  a = reconcileAttention(
    a,
    data(telemetry("waitingOnUserInput", ["a", "b"])),
    1000,
  );
  assert.equal(counts(a, { a: 1000 }).unseen, 1);
  a = reconcileAttention(
    a,
    data(telemetry("waitingOnUserInput", ["a", "b"])),
    17000,
  );
  assert.equal(counts(a, {}).pending, 0);
  assert.equal(counts(a, {}).unknown, 2);
  a = reconcileAttention(
    a,
    data(telemetry("waitingOnUserInput", ["a", "b"]), 18000),
    18000,
  );
  assert.equal(counts(a, { a: 1000 }).unseen, 1);
  a = reconcileAttention(a, data(telemetry("active", []), 19000), 19000);
  assert.equal(counts(a, {}).pending, 0);
  assert.equal(counts(a, {}).unknown, 0);
});
test("quiet provider, historical baseline and transitions", () => {
  let t = telemetry("active", []);
  let a = reconcileAttention(emptyAttention(), data(t), 1000);
  a = reconcileAttention(a, data({ ...t, state: "completed" }, 2000), 2000);
  assert.equal(a.flashes.one.until, 6000);
  a = reconcileAttention(a, data({ ...t, state: "completed" }, 3000), 3000);
  assert.equal(a.flashes.one.until, 6000);
  a = reconcileAttention(a, data({ ...t, state: "completed" }, 6001), 6001);
  assert.equal(a.flashes.one, undefined);
  assert.deepEqual(
    reconcileAttention(
      emptyAttention(),
      data({ ...t, state: "error", baseline: true }),
      1000,
    ).flashes,
    {},
  );
  assert.equal(
    counts(
      reconcileAttention(emptyAttention(), data(telemetry("idle", [])), 1000),
      {},
    ).pending,
    0,
  );
  assert.equal(
    counts(
      reconcileAttention(emptyAttention(), data(telemetry(), 50000), 50000),
      {},
    ).pending,
    1,
  );
});
test("bounded persistence tolerates corrupt and expired cache", () => {
  const entries = Object.fromEntries(
    Array.from({ length: 250 }, (_, i) => [String(i), 1000 + i]),
  );
  assert.equal(Object.keys(pruneSeen(entries, 2000)).length, 200);
  assert.deepEqual(pruneSeen({ old: 1, future: MAX_AGE * 2 }, MAX_AGE + 1), {});
  assert.deepEqual(loadSeen({ getItem: () => "{bad" }, 10), {});
  assert.deepEqual(
    loadSeen(
      {
        getItem: () => {
          throw Error();
        },
      },
      10,
    ),
    {},
  );
  assert.equal(hysteresis(false, 92, 90, 85), true);
  assert.equal(hysteresis(true, 87, 90, 85), true);
  assert.equal(hysteresis(true, 84, 90, 85), false);
});
test("multiple viewed requests persist despite timer tick lag and storage failure", () => {
  const viewed = { a: 1050, b: 1070 };
  assert.deepEqual(pruneSeen(viewed, 1000), viewed);
  const a = reconcileAttention(
    emptyAttention(),
    data(telemetry("waitingOnUserInput", ["a", "b"])),
    1000,
  );
  assert.deepEqual(counts(a, viewed), { pending: 2, unseen: 0, unknown: 0 });
});
test("reconnect does not replay a completion missed during disconnect", () => {
  const t = telemetry("active", []);
  let a = reconcileAttention(emptyAttention(), data(t), 1000);
  a = reconcileAttention(
    a,
    { ...data(t, 2000), sources: { ipc: false, file: true } },
    2000,
  );
  a = reconcileAttention(a, data({ ...t, state: "completed" }, 3000), 3000);
  assert.deepEqual(a.flashes, {});
});
