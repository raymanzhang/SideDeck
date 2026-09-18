// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

export interface ClaudeSession {
  session_id: string;
  cwd: string;
  session_type: string;
  started_at: string | null;
  status: string;
}

export interface ClaudeEvent {
  session_id: string;
  event_type: string;
  timestamp: string | null;
  tool_name: string | null;
  uuid: string | null;
}

export interface SessionMetadata {
  cwd: string | null;
  version: string | null;
  git_branch: string | null;
  entrypoint: string | null;
}

export interface ClaudeProviderData {
  status: "ok" | "unavailable";
  sessions: ClaudeSession[];
  recent_events: Record<string, ClaudeEvent[]>;
  metadata?: Record<string, SessionMetadata>;
  error?: string;
}
