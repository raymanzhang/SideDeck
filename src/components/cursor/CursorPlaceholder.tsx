// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

export function CursorPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-control p-4 text-hud-text-dim">
      <span aria-hidden="true" className="flex metric-icon items-center justify-center rounded-full border border-hud-border text-title">↖</span>
      <p className="text-small font-medium">Coming Soon</p>
      <p className="text-center text-small leading-relaxed">Cursor session monitoring will be available in a future update.</p>
    </div>
  );
}
