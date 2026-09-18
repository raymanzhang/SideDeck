// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { formatElapsed } from "../hooks/useSessionClock";
import { DetailPage } from "./DetailPage";
export function SessionCardFrame({ project, cwd, status, elapsed, activity, expanded, onToggle, history, metadata, now }: {
  project: string; cwd: string; status: "idle" | "thinking" | "tool calling" | "error";
  elapsed: string; activity: string; expanded: boolean; onToggle: () => void;
  history: { name: string; timestamp: string | null }[]; metadata: ReactNode; now: number;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setHost(card.current?.closest<HTMLElement>(".panel-body") ?? null); }, []);
  const color = status === "thinking" ? "bg-neon-blue" : status === "tool calling" ? "bg-neon-amber" : status === "error" ? "bg-neon-red" : "bg-neon-green";
  return <div ref={card} className="shrink-0 rounded border border-hud-border bg-hud-panel">
    <button type="button" aria-expanded={expanded} onClick={event => { event.currentTarget.focus({ preventScroll: true }); onToggle(); }} className="block w-full min-w-0 pad-card text-left">
      <span className="flex flex-wrap items-center justify-between gap-control">
        <span className="min-w-0 break-words text-title font-semibold">{project}</span>
        <span className="flex items-center gap-control text-small text-hud-text-dim"><span className={`h-2 w-2 rounded-full ${color}`} />{status}<span aria-hidden="true">↗</span></span>
      </span>
      <span className="mt-2 block text-body break-words">{activity}</span>
      <span className="mt-2 block text-small text-hud-text-dim">Uptime {elapsed}</span>
    </button>
    {expanded && host && <DetailPage host={host} title={project} onClose={onToggle}>
      <div className="session-details">
        <p className="text-title">{status} · {elapsed}</p><p>{activity}</p>
        <h4 className="text-title">Working directory</h4><p className="technical">{cwd}</p>
        <h4 className="text-title">Tool calls</h4>
        {history.length === 0 ? <p className="text-hud-text-dim">No tool calls yet</p> : <ul className="grid gap-control">{history.map((event, index) => {
          const age = formatElapsed(Date.parse(event.timestamp ?? ""), now);
          return <li key={index} className="flex flex-wrap justify-between gap-control"><span className="break-words">{event.name}</span><span className="text-small text-hud-text-dim">{age === "—" ? age : `${age} ago`}</span></li>;
        })}</ul>}
        {metadata}
      </div>
    </DetailPage>}
  </div>;
}
