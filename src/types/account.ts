// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

export type AccountStatus =
  | "ok"
  | "unavailable"
  | "no_auth"
  | "auth_error"
  | "auth_expired"
  | "error"
  | "unsupported";

export interface AccountData {
  status: AccountStatus;
  service: string;
  display_name: string;
  plan?: string | null;
  error?: string;
}

export interface UsageWindow {
  usage_percent: number | null;
  reset_at: string | null;
  label: string;
}

export interface AnthropicUsage extends AccountData {
  daily?: UsageWindow | null;
  weekly?: UsageWindow | null;
}

export interface QuotaWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}
export interface QuotaBucket {
  limitId: string | null;
  snapshot: {
    primary?: QuotaWindow | null;
    secondary?: QuotaWindow | null;
    limitName?: string | null;
    credits?: { balance: string | null; unlimited: boolean } | null;
    spendControlReached?: boolean | null;
    rateLimitReachedType?: string | null;
  };
}
export interface ThreadUsage {
  threadId: string;
  estimatedUsageCreditsMicros: number;
  estimatedUsageUsdMicros: number | null;
}
export interface OpenaiUsage extends AccountData {
  sampledAt?: number;
  scope?: string;
  quota?: {
    status: AccountStatus;
    error?: string;
    accountId: string | null;
    ordinaryUsageAllowed: boolean | null;
    buckets: QuotaBucket[];
    source: string;
  };
  activity?: {
    status: AccountStatus;
    error?: string;
    summary: Record<string, number | null> | null;
    dailyUsageBuckets: { startDate: string; tokens: number }[] | null;
    threadUsage?: ThreadUsage | null;
    source: string;
  };
}
