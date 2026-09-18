// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useSystemMetrics } from "./hooks/useSystemMetrics";
import { useUiPreferences } from "./hooks/useUiPreferences";
import { SettingsBar } from "./components/SettingsBar";
import { useWindowPrefs } from "./hooks/useWindowPrefs";
import { DisplayToast } from "./components/DisplayToast";
import { usePanelOrder } from "./hooks/usePanelOrder";
import { useState } from "react";
import { HudLayout } from "./components/HudLayout";
import { Panel } from "./components/Panel";
import { SystemPanel } from "./components/system/SystemPanel";
import { ClaudePanel } from "./components/claude/ClaudePanel";
import { CodexPanel } from "./components/codex/CodexPanel";

import { useAttention } from "./hooks/useAttention";
import type { AnthropicUsage, OpenaiUsage } from "./types/account";
import { migrateActive } from "./state/panelOrder";

import { ToolTabBar, type AiTool } from "./components/ToolTabBar";
import { CursorPlaceholder } from "./components/cursor/CursorPlaceholder";
import { useProvider } from "./hooks/useProvider";
import type { ClaudeProviderData } from "./types/claude";
import type { CodexProviderData } from "./types/codex";

export type { PanelId } from "./state/panelOrder";
import type { PanelId } from "./state/panelOrder";

function App() {
  const history = useSystemMetrics();
  const prefs = useWindowPrefs();
  const ui = useUiPreferences();
  const [editing, setEditing] = useState(false);
  const { panelOrder, reorder } = usePanelOrder();
  const [activeTab, setActiveTab] = useState<PanelId>(() => {
    try {
      return migrateActive(localStorage.getItem("sys-hud:active-panel"));
    } catch {
      return "system";
    }
  });
  const [activeTool, setActiveTool] = useState<AiTool>("claude");

  const claude = useProvider<ClaudeProviderData>("claude");
  const codex = useProvider<CodexProviderData>("codex");

  const openai = useProvider<OpenaiUsage>("openai-usage");
  const anthropic = useProvider<AnthropicUsage>("anthropic-usage");
  const attention = useAttention(codex);
  const attentionLabel = [
    attention.counts.pending ? `${attention.counts.pending} pending` : "",
    attention.counts.unseen ? "● New" : "",
    attention.counts.unknown ? "Status unknown" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <DisplayToast />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {attention.announcement && (
          <span key={attention.announcement.key}>
            {attention.announcement.text}
          </span>
        )}
      </div>
      <HudLayout
        attentionLabel={attentionLabel}
        size={ui.size}
        editing={editing}
        settings={
          <SettingsBar
            prefs={prefs}
            ui={ui}
            editing={editing}
            onEdit={setEditing}
          />
        }
        panelOrder={panelOrder}
        reorder={reorder}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        <Panel
          id="system"
          title="System"
          editing={editing}
          index={panelOrder.indexOf("system")}
          onMove={reorder}
        >
          <SystemPanel history={history} size={ui.size} />
        </Panel>
        <Panel
          id="ai-tools"
          title="AI Tools"
          editing={editing}
          index={panelOrder.indexOf("ai-tools")}
          onMove={reorder}
        >
          <div className="page-stack">
            <ToolTabBar
              attentionLabel={attentionLabel}
              active={activeTool}
              onChange={setActiveTool}
              sessionCounts={{
                claude: claude?.sessions.length ?? 0,
                codex: Object.values(codex?.telemetry ?? {}).filter(
                  (t) => t.state === "active",
                ).length,
                cursor: 0,
              }}
            />
            <div className="min-h-0 flex-1">
              <div className="page-stack" hidden={activeTool !== "claude"}>
                <ClaudePanel data={claude} account={anthropic} />
              </div>
              <div className="page-stack" hidden={activeTool !== "codex"}>
                <CodexPanel
                  data={codex}
                  account={openai}
                  attention={attention}
                />
              </div>
              <div className="page-scroll" hidden={activeTool !== "cursor"}>
                <CursorPlaceholder />
              </div>
            </div>
          </div>
        </Panel>
      </HudLayout>
    </>
  );
}

export default App;
