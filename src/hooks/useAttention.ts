// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react";
import type { CodexProviderData } from "../types/codex";
import {
  counts,
  emptyAttention,
  loadSeen,
  pruneSeen,
  reconcileAttention,
  saveSeen,
} from "../state/attention";
export function useAttention(data: CodexProviderData | null) {
  const [now, setNow] = useState(Date.now);
  const [attention, setAttention] = useState(emptyAttention);
  const [seen, setSeen] = useState(() => {
    try {
      return loadSeen(localStorage, Date.now());
    } catch {
      return {};
    }
  });
  const announced = useRef(new Set<string>());
  const [announcement, setAnnouncement] = useState<{
    key: string;
    text: string;
  } | null>(null);
  useEffect(() => {
    const fresh = Object.entries(attention.episodes).filter(
      ([id, e]) => e.confirmed && !announced.current.has(id),
    );
    fresh.forEach(([id]) => announced.current.add(id));
    if (fresh.length)
      setAnnouncement({
        key: fresh.map(([id]) => id).join("/"),
        text: `${fresh.length} new Codex request${fresh.length === 1 ? "" : "s"} need attention`,
      });
    if (announced.current.size > 512)
      announced.current = new Set(Object.keys(attention.episodes));
  }, [attention]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(
    () => setAttention((old) => reconcileAttention(old, data, now)),
    [data, now],
  );
  useEffect(() => {
    try {
      saveSeen(localStorage, seen, Date.now());
    } catch {
      /* storage blocked */
    }
  }, [seen]);
  return {
    attention,
    seen,
    now,
    announcement,
    counts: counts(attention, seen),
    view: (ids: string[]) =>
      setSeen((old) =>
        pruneSeen(
          { ...old, ...Object.fromEntries(ids.map((id) => [id, Date.now()])) },
          Date.now(),
        ),
      ),
  };
}
export type AttentionController = ReturnType<typeof useAttention>;
