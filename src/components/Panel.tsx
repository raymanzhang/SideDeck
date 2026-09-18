// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactNode } from "react";
interface PanelProps {
  id: string;
  title: string;
  children: ReactNode;
  editing?: boolean;
  index?: number;
  onMove?: (from: number, to: number) => void;
}
export function Panel({
  id,
  title,
  children,
  editing = false,
  index = 0,
  onMove,
}: PanelProps) {
  return (
    <section className="panel" aria-label={title}>
      <header className="panel-header">
        <h2>{title}</h2>
        {editing && (
          <div className="control-row">
            <button
              className="edit-handle control"
              draggable
              aria-label={`Drag ${title}`}
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", id);
                event.dataTransfer.effectAllowed = "move";
              }}
            >
              ⠿
            </button>
            <button
              className="control"
              disabled={index === 0}
              onClick={() => onMove?.(index, index - 1)}
              aria-label={`Move ${title} earlier`}
            >
              ←
            </button>
            <button
              className="control"
              disabled={index === 1}
              onClick={() => onMove?.(index, index + 1)}
              aria-label={`Move ${title} later`}
            >
              →
            </button>
          </div>
        )}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
