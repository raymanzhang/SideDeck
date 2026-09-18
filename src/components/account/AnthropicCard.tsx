// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import type { AnthropicUsage, UsageWindow } from "../../types/account";
import { useCountdown } from "../../hooks/useCountdown";
import { ServiceCard } from "./ServiceCard";
import { UsageRing } from "./UsageRing";

function WindowUsage({ data, label }: { data: UsageWindow; label: string }) {
  const countdown = useCountdown(data.reset_at);
  return (
    <div className="flex min-w-0 flex-col items-center gap-control text-center">
      <span className="text-small text-hud-text-dim">{label}</span>
      <UsageRing percent={data.usage_percent} label={`${label} usage`} />
      {countdown && <span className="text-small leading-tight text-hud-text-dim tabular-nums">{countdown}</span>}
    </div>
  );
}

export function AnthropicCard({ data }: { data: AnthropicUsage | null }) {
  return (
    <ServiceCard name="Anthropic" status={data?.status ?? "loading"} plan={data?.plan} error={data?.error}>
      {data?.daily || data?.weekly ? (
        <div className="grid grid-cols-2 gap-2">
          {data.daily && <WindowUsage data={data.daily} label="5h" />}
          {data.weekly && <WindowUsage data={data.weekly} label="7d" />}
        </div>
      ) : <p className="text-small text-hud-text-dim">Usage unavailable</p>}
    </ServiceCard>
  );
}
