// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";

export function formatCountdown(resetAt: string | null | undefined, now: number): string | null {
  if (!resetAt) return null;
  const reset = Date.parse(resetAt);
  if (!Number.isFinite(reset)) return null;
  const minutes = Math.max(0, Math.ceil((reset - now) / 60_000));
  if (minutes >= 1440) {
    return `Resets in ${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
  }
  return `Resets in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function useCountdown(resetAt: string | null | undefined): string | null {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!resetAt || !Number.isFinite(Date.parse(resetAt))) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [resetAt]);
  return formatCountdown(resetAt, now);
}
