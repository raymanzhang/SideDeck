// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import type { PanelId } from "../App";

interface Tab {
  id: PanelId;
  label: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: PanelId;
  onTabChange: (tab: PanelId) => void;
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="flex shrink-0 flex-wrap gap-control rounded border border-hud-border bg-hud-panel p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          aria-pressed={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`touch-target rounded px-3 py-2 text-body font-medium transition-colors ${
            activeTab === tab.id
              ? "bg-[#214366] text-hud-text"
              : "text-hud-text-dim hover:text-hud-text"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
