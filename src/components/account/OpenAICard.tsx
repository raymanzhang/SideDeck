// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import type { OpenaiUsage, QuotaWindow } from "../../types/account";
import { useCountdown } from "../../hooks/useCountdown";
function Window({ value }: { value: QuotaWindow }) {
  const countdown = useCountdown(
    value.resetsAt == null
      ? null
      : new Date(value.resetsAt * 1000).toISOString(),
  );
  const minutes = value.windowDurationMins;
  return (
    <p>
      {minutes === 300
        ? "5h"
        : minutes === 10080
          ? "7d"
          : minutes == null
            ? "Unknown window"
            : `${minutes} min`}
      : {value.usedPercent}% used ·{" "}
      {countdown || "Reset time unknown / awaiting update"}
    </p>
  );
}
export function OpenAICard({ data }: { data: OpenaiUsage | null }) {
  return (
    <section className="space-y-4" aria-label="OpenAI account">
      <h3 className="text-title">OpenAI · Current signed-in account</h3>
      <p className="text-small">Session account ownership is unknown.</p>
      <h4>Quota</h4>
      {data?.quota?.status === "ok" ? (
        <>
          {data.quota.ordinaryUsageAllowed === false && (
            <p className="text-amber-400">
              Included usage restricted · awaiting server confirmation of
              recovery
            </p>
          )}
          {data.quota.buckets.map((b, i) => (
            <section
              key={b.limitId ?? i}
              className="rounded border border-hud-border pad-card"
            >
              <h4>
                {b.snapshot.limitName ||
                  b.limitId ||
                  "Unidentified quota bucket"}
              </h4>
              {b.snapshot.primary && <Window value={b.snapshot.primary} />}
              {b.snapshot.secondary && <Window value={b.snapshot.secondary} />}
              {(b.snapshot.spendControlReached ||
                b.snapshot.rateLimitReachedType) && (
                <p>Server reports a limit reached</p>
              )}
              {b.snapshot.credits?.balance != null && (
                <p>
                  Credits: {b.snapshot.credits.balance} (no billing total
                  available)
                </p>
              )}
            </section>
          ))}
        </>
      ) : (
        <p>{data?.quota?.error || "Quota unavailable"}</p>
      )}
      <h4>Token activity</h4>
      {data?.activity?.status === "ok" ? (
        <>
          <dl>
            {Object.entries(data.activity.summary ?? {})
              .filter(([, v]) => v != null)
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v?.toLocaleString()}</dd>
                </div>
              ))}
          </dl>
          {data.activity.dailyUsageBuckets?.map((b) => (
            <p key={b.startDate}>
              {b.startDate}: {b.tokens.toLocaleString()} tokens
            </p>
          ))}
        </>
      ) : (
        <p>{data?.activity?.error || "Token activity unavailable"}</p>
      )}
      <p className="text-small">
        {data?.sampledAt
          ? `API snapshot · ${new Date(data.sampledAt).toLocaleString()}`
          : "No account snapshot"}
      </p>
    </section>
  );
}
