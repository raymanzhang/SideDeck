// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import type { CodexEvent } from "../../types/codex";

interface EventFeedProps {
  events: Record<string, CodexEvent[]>;
}

const EVENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  session_meta: { label: "META", color: "text-hud-text-dim" },
  task_started: { label: "START", color: "text-sky-400" },
  task_completed: { label: "DONE", color: "text-emerald-400" },
  assistant_message: { label: "AST", color: "text-emerald-400" },
  developer_message: { label: "DEV", color: "text-violet-400" },
  function_call_output: { label: "TOOL", color: "text-amber-400" },
  command_execution: { label: "CMD", color: "text-amber-400" },
};

export function EventFeed({ events }: EventFeedProps) {
  const allEvents = Object.values(events)
    .flat()
    .filter((e) => e.eventType !== "session_meta")
    .sort((a, b) => {
      if (!a.timestamp || !b.timestamp) return 0;
      return b.timestamp.localeCompare(a.timestamp);
    })
    .slice(0, 15);

  if (allEvents.length === 0) return null;

  return (
    <div className="mt-1">
      <p className="mb-1 text-small font-semibold uppercase tracking-wider text-hud-text-dim">
        Recent Activity
      </p>
      <div className="flex flex-col gap-control">
        {allEvents.map((event, i) => (
          <EventRow
            key={`${event.sessionId}-${event.ordinal ?? i}`}
            event={event}
          />
        ))}
      </div>
    </div>
  );
}

function EventRow({ event }: { event: CodexEvent }) {
  const info = EVENT_TYPE_LABELS[event.eventType] ?? {
    label: event.eventType.slice(0, 4).toUpperCase(),
    color: "text-hud-text-dim",
  };

  const time = event.timestamp ? formatTime(event.timestamp) : "";

  return (
    <div className="flex items-center gap-control px-1 py-0.5 text-small">
      <span className="tabular-nums text-hud-text-dim">{time}</span>
      <span className={`shrink-0 font-semibold ${info.color}`}>
        {info.label}
      </span>
      <span className="min-w-0 break-words text-hud-text-dim">
        {event.summary ?? event.toolName ?? ""}
      </span>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}
