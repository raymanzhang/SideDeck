// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UseCommandResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  execute: (...args: unknown[]) => Promise<T | null>;
}

export function useCommand<T = unknown>(command: string): UseCommandResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = useCallback(
    async (...args: unknown[]): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<T>(command, args[0] as Record<string, unknown>);
        setData(result);
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [command]
  );

  return { data, error, loading, execute };
}
