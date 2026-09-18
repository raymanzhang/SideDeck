// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef, useState } from "react";
import type { ClaudeProviderData, ClaudeSession } from "../../types/claude";
import type { AnthropicUsage } from "../../types/account";
import { DetailPage } from "../DetailPage";
import { AnthropicCard } from "../account/AnthropicCard";
import { EventFeed } from "./EventFeed";
export function ClaudePanel({
  data,
  account,
}: {
  data: ClaudeProviderData | null;
  account: AnthropicUsage | null;
}) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [route, setRoute] = useState<"overview" | "session" | "account">(
    "overview",
  );
  const [selected, setSelected] = useState<ClaudeSession | null>(null);
  const snapshot = useRef<{
    session: ClaudeSession;
    events: ClaudeProviderData["recent_events"][string];
    metadata: unknown;
  } | null>(null);
  const current = data?.sessions.find(
    (s) => s.session_id === selected?.session_id,
  );
  if (current)
    snapshot.current = {
      session: current,
      events: data?.recent_events[current.session_id] ?? [],
      metadata: data?.metadata?.[current.session_id],
    };
  return (
    <div ref={setHost} className="tool-view page-stack">
      <div className="page-scroll pad-card space-y-3">
        <div className="control-row">
          <h3 data-list-heading tabIndex={-1} className="text-title mr-auto">
            Claude activity
          </h3>
          <button className="control" onClick={() => setRoute("account")}>
            Anthropic account
          </button>
        </div>
        <p className="text-small text-hud-text-dim">
          Activity inferred from existing process/log data. Waiting, model,
          token and plan telemetry unavailable.
        </p>
        {data?.sessions.map((session) => (
          <button
            key={session.session_id}
            className="activity-card"
            onClick={(e) => {
              e.currentTarget.focus({ preventScroll: true });
              setSelected(session);
              snapshot.current = {
                session,
                events: data.recent_events[session.session_id] ?? [],
                metadata: data.metadata?.[session.session_id],
              };
              setRoute("session");
            }}
          >
            <span className="text-title">
              {session.cwd.split("/").filter(Boolean).pop() ||
                "Project unknown"}{" "}
              · {session.session_id.slice(0, 8)}
            </span>
            <span>
              {session.status === "running"
                ? "Process running (inferred)"
                : "Activity unknown"}
            </span>
          </button>
        ))}
        {!data ? (
          <p>Waiting for Claude provider…</p>
        ) : !data.sessions.length ? (
          <p>No sessions available</p>
        ) : null}
      </div>
      {host && route === "account" && (
        <DetailPage
          host={host}
          title="Anthropic account"
          onClose={() => setRoute("overview")}
        >
          <AnthropicCard data={account} />
        </DetailPage>
      )}
      {host && route === "session" && snapshot.current && (
        <DetailPage
          host={host}
          title={`Claude · ${snapshot.current.session.session_id.slice(0, 8)}`}
          onClose={() => setRoute("overview")}
        >
          <div className="session-details">
            {!current && <p>Session unavailable · last snapshot</p>}
            <p className="technical">{snapshot.current.session.cwd}</p>
            <p>Activity inferred · explicit lifecycle unknown</p>
            {snapshot.current.session.started_at && (
              <p>Session created {snapshot.current.session.started_at}</p>
            )}
            <pre className="technical whitespace-pre-wrap">
              {JSON.stringify(snapshot.current.metadata ?? {}, null, 2)}
            </pre>
            <EventFeed
              events={{
                [snapshot.current.session.session_id]: snapshot.current.events,
              }}
            />
          </div>
        </DetailPage>
      )}
    </div>
  );
}
