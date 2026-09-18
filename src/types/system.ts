// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

export interface CpuMetrics {
  overall: number;
  cores: number[];
}

export interface MemoryMetrics {
  used: number;
  total: number;
  percent: number;
}

export interface DiskMetrics {
  used: number;
  total: number;
  percent: number;
}

export interface VolumeMetrics extends DiskMetrics {
  name: string;
  mount_point: string;
}

export interface NetworkMetrics {
  rx_rate: number | null;
  tx_rate: number | null;
}

export interface TemperatureMetrics {
  cpu: number | null;
  value?: number | null;
  sensor?: string | null;
  kind?: "cpu" | "other" | "unavailable";
}

export interface BatteryMetrics {
  percent: number;
  state: "charging" | "discharging" | "full" | "unknown";
}

export interface SystemMetrics {
  sample_id: number;
  sampled_at_ms: number;
  sample_gap: boolean;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics | null;
  disks?: VolumeMetrics[];
  network: NetworkMetrics;
  temperature: TemperatureMetrics;
  battery: BatteryMetrics | null;
}
