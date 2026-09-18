// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  CodexProviderData,
  CodexThread,
  Telemetry,
  CodexEvent,
} from "../../types/codex";
import type { OpenaiUsage, ThreadUsage } from "../../types/account";
import type { AttentionController } from "../../hooks/useAttention";
import { counts, hysteresis, isFresh } from "../../state/attention";
import { SessionCard, labels, contextPercent } from "./SessionCard";
import { DetailPage } from "../DetailPage";
import { OpenAICard } from "../account/OpenAICard";
import { EventFeed } from "./EventFeed";
type Selection = {
  thread: CodexThread;
  telemetry?: Telemetry;
  events: CodexEvent[];
};
function group(t?: Telemetry) {
  return !t
    ? 3
    : t.state.startsWith("waiting") || t.state === "error"
      ? 0
      : t.state === "active"
        ? 1
        : t.state === "idle" || t.state === "completed"
          ? 2
          : 3;
}
export function CodexPanel({
  data,
  account,
  attention: a,
}: {
  data: CodexProviderData | null;
  account: OpenaiUsage | null;
  attention: AttentionController;
}) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [route, setRoute] = useState<"overview" | "session" | "account">(
    "overview",
  );
  const [selected, setSelected] = useState<Selection | null>(null);
  const [accountCache, setAccountCache] = useState(account);
  const last = useRef<Selection | null>(null);
  const order = useRef<string[]>([]);
  const warnings = useRef<Record<string, boolean>>({});
  const restrictions = useRef<Record<string, boolean>>({});
  const [history, setHistory] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (account) setAccountCache(account);
  }, [account]);
  const current =
    selected && data?.threads.find((t) => t.id === selected.thread.id);
  if (current)
    last.current = {
      thread: current,
      telemetry: data?.telemetry?.[current.id],
      events: data?.recentEvents[current.id] ?? [],
    };
  const detail = current
    ? last.current
    : selected && last.current?.thread.id === selected.thread.id
      ? last.current
      : selected;
  const openAccount = () => {
    setRoute("account");
    if (isTauri())
      void invoke<OpenaiUsage>("get_openai_account")
        .then(setAccountCache)
        .catch(() => {});
  };
  const threads = data?.threads ?? [];
  const ids = new Set(threads.map((t) => t.id));
  order.current = order.current.filter((id) => ids.has(id));
  for (const t of threads)
    if (!order.current.includes(t.id)) order.current.push(t.id);
  const sorted = [...threads].sort(
    (x, y) =>
      group(data?.telemetry?.[x.id]) - group(data?.telemetry?.[y.id]) ||
      order.current.indexOf(x.id) - order.current.indexOf(y.id),
  );
  const groups = [0, 1, 2, 3].map((g) =>
    sorted.filter((t) => group(data?.telemetry?.[t.id]) === g),
  );
  const q = account?.quota;
  const quotaKey = q?.accountId ?? "unknown";
  if (q?.ordinaryUsageAllowed != null)
    restrictions.current[quotaKey] = !q.ordinaryUsageAllowed;
  let quotaWarning = restrictions.current[quotaKey] ?? false;
  for (const b of q?.buckets ?? []) {
    const key = `${quotaKey}/${b.limitId}`;
    const values = [
      b.snapshot.primary?.usedPercent,
      b.snapshot.secondary?.usedPercent,
    ].filter((v): v is number => v != null);
    warnings.current[key] = hysteresis(
      warnings.current[key] ?? false,
      values.length ? Math.max(...values) : null,
      90,
      85,
    );
    if (
      b.snapshot.spendControlReached === true ||
      b.snapshot.rateLimitReachedType
    )
      restrictions.current[key] = true;
    else if (
      b.snapshot.spendControlReached === false ||
      q?.ordinaryUsageAllowed === true
    )
      restrictions.current[key] = false;
    quotaWarning ||=
      warnings.current[key] || restrictions.current[key] === true;
  }
  return (
    <div ref={setHost} className="tool-view page-stack">
      <div className="page-scroll pad-card space-y-3">
        <div className="control-row">
          <div className="mr-auto">
            <h3 data-list-heading tabIndex={-1} className="text-title">
              Codex activity
            </h3>
            <p className="text-small text-hud-text-dim">
              {data
                ? `${data.dataSource.toUpperCase()} · ${groups[1].filter((t) => isFresh(data, data.telemetry?.[t.id], a.now)).length} running`
                : "Waiting for Codex provider…"}
            </p>
          </div>
          <button className="control" onClick={openAccount}>
            OpenAI account
          </button>
        </div>
        {quotaWarning && (
          <button className="control text-amber-400" onClick={openAccount}>
            Current signed-in account · quota warning
          </button>
        )}
        {groups.map(
          (list, g) =>
            list.length > 0 && (
              <section key={g} className="space-y-2">
                <h4 className="text-small text-hud-text-dim">
                  {["Needs attention", "Running", "Recent", "History"][g]}
                  {g === 3 && (
                    <button
                      className="control ml-2"
                      aria-expanded={history}
                      onClick={() => setHistory(!history)}
                    >
                      {history ? "Hide" : "Show"} history ({list.length})
                    </button>
                  )}
                </h4>
                {(g === 3 && !history
                  ? []
                  : g === 2 && !more
                    ? list.slice(0, 5)
                    : list
                ).map((thread) => {
                  const t = data?.telemetry?.[thread.id];
                  const c = counts(a.attention, a.seen, thread.id);
                  const children = Object.values(data?.telemetry ?? {}).filter(
                    (x) => x.parentThreadId === thread.id,
                  );
                  return (
                    <SessionCard
                      key={thread.id}
                      thread={thread}
                      telemetry={t}
                      now={a.now}
                      fresh={isFresh(data, t, a.now)}
                      unseen={c.unseen > 0}
                      flash={a.attention.flashes[thread.id]?.kind}
                      childrenCount={
                        children.length
                          ? children.filter(
                              (x) =>
                                x.state === "active" && isFresh(data, x, a.now),
                            ).length
                          : null
                      }
                      onOpen={() => {
                        const snapshot = {
                          thread,
                          telemetry: t,
                          events: data?.recentEvents[thread.id] ?? [],
                        };
                        setSelected(snapshot);
                        last.current = snapshot;
                        setRoute("session");
                        a.view(t?.episodes.map((e) => e.id) ?? []);
                      }}
                    />
                  );
                })}
                {g === 2 && list.length > 5 && (
                  <button className="control" onClick={() => setMore(!more)}>
                    {more ? "Show fewer" : "Show all recent"}
                  </button>
                )}
              </section>
            ),
        )}
        {data && threads.length === 0 && <p>No sessions available</p>}
      </div>
      {host && route === "account" && (
        <DetailPage
          host={host}
          title="OpenAI account"
          onClose={() => setRoute("overview")}
        >
          <OpenAICard data={accountCache} />
        </DetailPage>
      )}
      {host && route === "session" && detail && (
        <DetailPage
          host={host}
          title={detail.thread.name || detail.thread.id.slice(0, 8)}
          onClose={() => setRoute("overview")}
        >
          {!current && <p role="status">Session unavailable · last snapshot</p>}
          <SessionDetails selection={detail} data={data} attention={a} />
        </DetailPage>
      )}
    </div>
  );
}
function SessionDetails({
  selection: s,
  data,
  attention: a,
}: {
  selection: Selection;
  data: CodexProviderData | null;
  attention: AttentionController;
}) {
  const t = s.telemetry;
  const percent = contextPercent(t);
  const pending = t?.episodes.filter((e) => !a.seen[e.id]) ?? [];
  const [usage, setUsage] = useState<{
    threadUsage?: ThreadUsage | null;
    sampledAt?: number;
    error?: string;
  } | null>(null);
  return (
    <div className="session-details">
      <p className="text-title">
        {labels[t?.state ?? "unknown"]}
        {!isFresh(data, t, a.now) ? " · Last known / unconfirmed" : ""}
      </p>
      {pending.length > 0 && (
        <button
          className="control"
          onClick={() => a.view(pending.map((e) => e.id))}
        >
          Mark {pending.length} request(s) viewed
        </button>
      )}
      {t?.episodes.length ? (
        <p>Viewing does not approve or answer the CLI request.</p>
      ) : null}
      <p className="technical">{s.thread.cwd || "Directory unknown"}</p>
      <p>Thread {s.thread.id}</p>
      {t?.turnStartedAt != null && (
        <p>Turn started {new Date(t.turnStartedAt).toLocaleString()}</p>
      )}
      {s.thread.createdAt > 0 && (
        <p>
          Session created {new Date(s.thread.createdAt * 1000).toLocaleString()}
        </p>
      )}
      <h4>Tools</h4>
      {t?.actions.length ? (
        t.actions.map((action) => (
          <section
            key={action.id}
            className="rounded border border-hud-border pad-card"
          >
            <p>
              {action.name} · {action.status}
              {action.startedAt != null && action.endedAt != null
                ? ` · ${Math.max(0, action.endedAt - action.startedAt) / 1000}s`
                : ""}
            </p>
            {action.result && (
              <pre className="technical whitespace-pre-wrap">
                {action.result}
              </pre>
            )}
          </section>
        ))
      ) : (
        <p>No tool results available</p>
      )}
      {t?.plan && (
        <>
          <h4>Plan</h4>
          <ol>
            {t.plan.map((p, i) => (
              <li key={i}>
                {p.status} · {p.step}
              </li>
            ))}
          </ol>
        </>
      )}
      <h4>Subagents</h4>
      {Object.values(data?.telemetry ?? {})
        .filter((c) => c.parentThreadId === s.thread.id)
        .map((c) => (
          <p key={c.threadId}>
            {c.threadId.slice(0, 8)} · {labels[c.state]}
          </p>
        ))}
      <h4>Tokens and context</h4>
      <p>
        {percent == null
          ? "Context unknown"
          : `Context ${percent.toFixed(1)}% (latest snapshot)`}
      </p>
      {t?.tokenUsage?.total ? (
        <dl>
          {Object.entries(t.tokenUsage.total)
            .filter(([, v]) => v != null)
            .map(([k, v]) => (
              <div key={k}>
                {k}: {v?.toLocaleString()}
              </div>
            ))}
        </dl>
      ) : (
        <p>Cumulative tokens unknown</p>
      )}
      <h4>Session settings</h4>
      <pre className="technical whitespace-pre-wrap">
        {t?.settings ? JSON.stringify(t.settings, null, 2) : "Unknown"}
      </pre>
      {s.thread.model && <p>Thread configured model: {s.thread.model}</p>}
      {data?.config.model && (
        <p>
          Global configuration fallback: {data.config.model} (not session
          telemetry)
        </p>
      )}
      <h4>Data sources</h4>
      {data?.capability && <p>{data.capability}</p>}
      {Object.entries(t?.provenance ?? {}).map(([field, p]) => (
        <p key={field}>
          {field}: {p.source} · {p.availability} ·{" "}
          {p.observedAt
            ? new Date(p.observedAt).toLocaleString()
            : "Time unknown"}
        </p>
      ))}
      <button
        className="control"
        onClick={() => {
          if (isTauri())
            void invoke<{
              threadUsage: ThreadUsage | null;
              sampledAt?: number;
            }>("get_codex_thread_usage", { threadId: s.thread.id })
              .then(setUsage)
              .catch(() => setUsage({ error: "Estimated usage unavailable" }));
          else setUsage({ error: "Estimated usage unavailable" });
        }}
      >
        Read estimated session usage
      </button>
      {usage?.threadUsage ? (
        <p>
          Estimated usage: {usage.threadUsage.estimatedUsageCreditsMicros / 1e6}{" "}
          credits
          {usage.threadUsage.estimatedUsageUsdMicros != null
            ? ` · ${usage.threadUsage.estimatedUsageUsdMicros / 1e6} USD`
            : ""}
          . Not an actual bill.
          {usage.sampledAt
            ? ` Snapshot: ${new Date(usage.sampledAt).toLocaleString()}`
            : ""}
        </p>
      ) : (
        usage && <p>{usage.error || "No session estimate available"}</p>
      )}
      <EventFeed events={{ [s.thread.id]: s.events }} />
    </div>
  );
}
