// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef } from "react";
import type { CodexThread, Telemetry } from "../../types/codex";
import { formatElapsed } from "../../hooks/useSessionClock";
import { hysteresis } from "../../state/attention";
export const labels: Record<string, string> = {
  active: "Running",
  idle: "Idle",
  notLoaded: "History",
  error: "Failed",
  completed: "Completed",
  waitingOnApproval: "Waiting for approval",
  waitingOnUserInput: "Waiting for answer",
  unknown: "Unknown",
};
export function contextPercent(t?: Telemetry) {
  const last = t?.tokenUsage?.last;
  const total = last?.total_tokens ?? last?.totalTokens;
  const window = t?.tokenUsage?.modelContextWindow;
  return total != null && window != null && window > 0
    ? (total / window) * 100
    : null;
}
export function SessionCard({
  thread,
  telemetry: t,
  now,
  fresh,
  unseen,
  flash,
  childrenCount,
  onOpen,
}: {
  thread: CodexThread;
  telemetry?: Telemetry;
  now: number;
  fresh: boolean;
  unseen: boolean;
  flash?: string;
  childrenCount: number | null;
  onOpen: () => void;
}) {
  const state = t?.state ?? "unknown";
  const waiting = state.startsWith("waiting");
  const start = waiting ? t?.waitingSince : t?.turnStartedAt;
  const elapsed =
    start == null ? "Unknown" : formatElapsed(start, t?.turnEndedAt ?? now);
  const percent = contextPercent(t);
  const warning = useRef(false);
  warning.current = hysteresis(warning.current, percent, 85, 80);
  const actions = t?.actions.filter((a) => a.status === "running") ?? [];
  return (
    <button
      className="activity-card"
      data-session={thread.id}
      onClick={(e) => {
        e.currentTarget.focus({ preventScroll: true });
        onOpen();
      }}
    >
      <span className="text-title">
        {thread.cwd.split("/").filter(Boolean).pop() || "Project unknown"} ·{" "}
        {thread.name || thread.id.slice(0, 8)}
      </span>
      <span
        className={`activity-status ${waiting ? "waiting" : state === "error" ? "failed" : ""} ${unseen && fresh ? "attention-breathe" : ""} ${fresh && flash ? `attention-${flash}` : ""}`}
      >
        {!fresh && state !== "notLoaded" ? "Last known: " : ""}
        {labels[state]}
        {unseen && fresh ? " · New" : ""}
      </span>
      <span>
        {actions.length
          ? actions.map((a) => a.name).join(" · ")
          : state === "active"
            ? "Working · action unknown"
            : "No current action reported"}
      </span>
      {state !== "notLoaded" && (
        <span className="text-small">
          {waiting ? "Waiting" : "Turn"} {elapsed}
          {!fresh ? " · Data paused / unconfirmed" : ""}
        </span>
      )}
      <span
        className={`text-small ${warning.current ? "text-amber-400" : "text-hud-text-dim"}`}
      >
        {percent != null ? `Context ${Math.round(percent)}% · ` : ""}
        {t?.plan
          ? `Plan ${t.plan.filter((p) => p.status === "completed").length}/${t.plan.length} · ${t.plan.find((p) => p.status === "in_progress")?.step ?? ""}`
          : ""}
        {childrenCount != null ? ` · ${childrenCount} active subagents` : ""}
      </span>
    </button>
  );
}
