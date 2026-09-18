// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import type { ClaudeEvent, ClaudeSession, SessionMetadata } from "../../types/claude";
import { formatElapsed, newestFirst, useSessionClock } from "../../hooks/useSessionClock";
import { SessionCardFrame } from "../SessionCardFrame";

export function SessionCard({ session, metadata, events, expanded, onToggle }: {
  session: ClaudeSession; metadata?: SessionMetadata; events: ClaudeEvent[];
  expanded: boolean; onToggle: () => void;
}) {
  const now = useSessionClock();
  const sorted = newestFirst(events, (event) => event.timestamp);
  const latest = sorted[0];
  const status = session.status === "running"
    ? latest?.event_type === "tool_use" ? "tool calling" : latest?.event_type === "assistant" ? "thinking" : "idle"
    : "idle";
  const details = metadata && [
    ["Version", metadata.version], ["Branch", metadata.git_branch], ["Entrypoint", metadata.entrypoint],
  ].filter(([, value]) => value);
  return <SessionCardFrame
    project={session.cwd.split("/").filter(Boolean).pop() || session.session_id}
    cwd={session.cwd} status={status} now={now}
    elapsed={formatElapsed(Date.parse(session.started_at ?? ""), now)}
    activity={latest ? latest.tool_name ? `Tool: ${latest.tool_name}` : latest.event_type : "—"}
    expanded={expanded} onToggle={onToggle}
    history={sorted.filter((event) => event.event_type === "tool_use").slice(0, 10).map((event) => ({ name: event.tool_name ?? "Tool", timestamp: event.timestamp }))}
    metadata={details && details.length > 0 ? <dl>{details.map(([label, value]) => <div key={label} className="flex gap-control break-all"><dt>{label}</dt><dd className="text-hud-text">{value}</dd></div>)}</dl> : null}
  />;
}
