// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import type { CodexProviderData, Telemetry } from "../../src/types/codex";
export function activityFixture(now = Date.now()): CodexProviderData {
  const make = (
    id: string,
    state: Telemetry["state"],
    episodes: string[] = [],
  ): Telemetry => ({
    threadId: id,
    parentThreadId: null,
    state,
    turnId: `turn-${id}`,
    turnStartedAt: now - 10000,
    turnEndedAt: null,
    waitingSince: episodes.length ? now - 5000 : null,
    actions: [],
    plan: null,
    tokenUsage: null,
    settings: null,
    episodes: episodes.map((id) => ({
      id,
      kind: "waitingOnUserInput",
      startedAt: now - 5000,
    })),
    provenance: {
      state: {
        source: "ipc",
        observedAt: now - 5000,
        availability: "available",
      },
    },
    baseline: false,
  });
  const telemetry = {
    alpha: make("alpha", "waitingOnUserInput", ["request-1"]),
    beta: make("beta", "active"),
    gamma: make("gamma", "notLoaded"),
  };
  return {
    status: "ok",
    connection: "polling",
    dataSource: "ipc",
    sources: { ipc: true, file: true },
    sampledAt: now,
    config: {
      model: "global-config-only",
      modelProvider: "",
      sandboxMode: "",
      approvalPolicy: "",
    },
    telemetry,
    threads: Object.keys(telemetry).map((id) => ({
      id,
      name: `Task ${id}`,
      cwd: "/example/same-project",
      status: { type: id === "gamma" ? "notLoaded" : "active" },
      model: null,
      modelProvider: "openai",
      source: "cli",
      createdAt: now / 1000 - 86400,
      updatedAt: now / 1000,
      preview: "",
    })),
    recentEvents: {},
  };
}
export const accountFixture = {
  status: "ok",
  service: "openai",
  display_name: "OpenAI",
  sampledAt: Date.now(),
  quota: {
    status: "ok",
    accountId: null,
    ordinaryUsageAllowed: true,
    source: "ipc",
    buckets: [
      {
        limitId: "codex",
        snapshot: {
          primary: {
            usedPercent: 92,
            windowDurationMins: 300,
            resetsAt: Math.floor(Date.now() / 1000) - 1,
          },
          secondary: null,
        },
      },
    ],
  },
  activity: {
    status: "ok",
    summary: { lifetimeTokens: 12345 },
    dailyUsageBuckets: [{ startDate: "2026-09-17", tokens: 100 }],
    threadUsage: null,
    source: "ipc",
  },
};
