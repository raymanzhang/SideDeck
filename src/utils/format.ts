// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "Unavailable";
  if (bytes === 0) return "0 B";

  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return unitIndex === 0
    ? `${Math.round(value)} ${UNITS[unitIndex]}`
    : `${value.toFixed(1)} ${UNITS[unitIndex]}`;
}

export function formatRate(bytesPerSec: number | null | undefined): string {
  if (bytesPerSec == null || !Number.isFinite(bytesPerSec) || bytesPerSec < 0) return "Unavailable";
  if (bytesPerSec === 0) return "0 B/s";

  let unitIndex = 0;
  let value = bytesPerSec;

  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return unitIndex === 0
    ? `${Math.round(value)} B/s`
    : `${value.toFixed(1)} ${UNITS[unitIndex]}/s`;
}
