// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react";

export function useSessionClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function formatElapsed(start: number, now: number): string {
  if (!Number.isFinite(start) || start <= 0) return "—";
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

export function newestFirst<T>(events: T[], timestamp: (event: T) => string | null): T[] {
  const time = (event: T) => Date.parse(timestamp(event) ?? "") || 0;
  return [...events].reverse().sort((a, b) => time(b) - time(a));
}
