// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

export interface CodexThreadStatus {
  type: "active" | "idle" | "notLoaded" | "systemError";
  activeFlags?: string[];
}

export interface CodexThread {
  id: string;
  name: string | null;
  cwd: string;
  status: CodexThreadStatus;
  model: string | null;
  modelProvider: string;
  source: string;
  createdAt: number;
  updatedAt: number;
  preview: string;
}

export interface CodexEvent {
  sessionId: string;
  eventType: string;
  timestamp: string | null;
  ordinal: number | null;
  toolName: string | null;
  summary: string | null;
}

export interface CodexConfig {
  model: string;
  modelProvider: string;
  sandboxMode: string;
  approvalPolicy: string;
}

export interface CodexProviderData {
  status: "ok" | "unavailable" | "fallback";
  dataSource: "ipc" | "file" | "none";
  threads: CodexThread[];
  recentEvents: Record<string, CodexEvent[]>;
  config: CodexConfig;
  sampledAt?: number;
  connection?: "polling" | "file" | "disconnected";
  sources?: { ipc: boolean; file: boolean };
  telemetry?: Record<string, Telemetry>;
  capability?: string;
  error?: string;
}

export type ActivityState =
  | "active"
  | "idle"
  | "notLoaded"
  | "error"
  | "completed"
  | "waitingOnApproval"
  | "waitingOnUserInput"
  | "unknown";
export interface Observed {
  source: "ipc" | "file";
  observedAt: number;
  availability: "available" | "historical" | "unknown";
}
export interface Action {
  id: string;
  name: string;
  status: string;
  startedAt: number | null;
  endedAt: number | null;
  result: string | null;
}
export interface Episode {
  id: string;
  kind: string;
  startedAt: number | null;
}
export interface Telemetry {
  threadId: string;
  parentThreadId: string | null;
  state: ActivityState;
  turnId: string | null;
  turnStartedAt: number | null;
  turnEndedAt: number | null;
  waitingSince: number | null;
  actions: Action[];
  plan: { step: string; status: string }[] | null;
  tokenUsage: {
    last: Record<string, number | null> | null;
    total: Record<string, number | null> | null;
    modelContextWindow: number | null;
  } | null;
  settings: Record<string, unknown> | null;
  episodes: Episode[];
  provenance: Record<string, Observed>;
  baseline: boolean;
}
