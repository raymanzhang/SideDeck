// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  Children,
  useRef,
  useState,
} from "react";
import type { PanelId } from "../App";
import type { UiSize } from "../state/uiPreferences";
import { visiblePanels } from "../state/dashboardLayout";
import { useDashboardLayout } from "../hooks/useDashboardLayout";
import { TabBar } from "./TabBar";
interface HudLayoutProps {
  activeTab: PanelId;
  onTabChange: (tab: PanelId) => void;
  panelOrder: PanelId[];
  reorder: (from: number, to: number) => void;
  settings?: ReactNode;
  children: ReactElement[];
  size: UiSize;
  editing: boolean;
  attentionLabel?: string;
}
const LABELS = { system: "System", "ai-tools": "AI Tools" };
export function HudLayout({
  activeTab,
  onTabChange,
  panelOrder,
  reorder,
  settings,
  children,
  size,
  editing,
  attentionLabel,
}: HudLayoutProps) {
  const panels = Children.toArray(children) as ReactElement<{ id: PanelId }>[];
  const { container, columns } = useDashboardLayout(size);
  const [dropTarget, setDropTarget] = useState<PanelId | null>(null);
  const secondary = useRef<PanelId>();
  if (activeTab !== panelOrder[0]) secondary.current = activeTab;
  const visible = visiblePanels(
    panelOrder,
    activeTab,
    columns,
    secondary.current,
  );
  const touch = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      ref={container}
      className="dashboard"
      data-columns={columns}
      style={{ "--columns": columns } as CSSProperties}
    >
      {columns < panelOrder.length && (
        <TabBar
          tabs={panelOrder.map((id) => ({
            id,
            label:
              LABELS[id] +
              (id === "ai-tools" && attentionLabel
                ? ` · ${attentionLabel}`
                : ""),
          }))}
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
      )}
      <div
        className="panel-strip"
        onDragEnd={() => setDropTarget(null)}
        onTouchStart={(event) => {
          touch.current =
            columns === 1 && !editing && event.touches.length === 1
              ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
              : null;
        }}
        onTouchMove={(event) => {
          if (
            touch.current &&
            (event.touches.length !== 1 ||
              Math.abs(event.touches[0].clientY - touch.current.y) > 24)
          )
            touch.current = null;
        }}
        onTouchEnd={(event) => {
          const start = touch.current;
          touch.current = null;
          if (!start || !event.changedTouches.length) return;
          const dx = event.changedTouches[0].clientX - start.x;
          const dy = event.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) {
            const next =
              panelOrder[panelOrder.indexOf(activeTab) + (dx < 0 ? 1 : -1)];
            if (next) onTabChange(next);
          }
        }}
        onTouchCancel={() => {
          touch.current = null;
        }}
      >
        {panelOrder.map((id, index) => (
          <div
            key={id}
            data-panel={id}
            data-visible={visible.includes(id)}
            className={`panel-slot ${dropTarget === id ? "ring-2 ring-inset ring-hud-accent" : ""}`}
            onFocusCapture={() => onTabChange(id)}
            onPointerDownCapture={() => onTabChange(id)}
            onDragEnter={(event) => {
              if (editing) {
                event.preventDefault();
                setDropTarget(id);
              }
            }}
            onDragOver={(event) => {
              if (editing) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }
            }}
            onDragLeave={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              )
                setDropTarget(null);
            }}
            onDrop={(event) => {
              if (editing) {
                event.preventDefault();
                reorder(
                  panelOrder.indexOf(
                    event.dataTransfer.getData("text/plain") as PanelId,
                  ),
                  index,
                );
                setDropTarget(null);
              }
            }}
          >
            {panels.find((panel) => panel.props.id === id)}
          </div>
        ))}
      </div>
      {settings}
    </div>
  );
}
