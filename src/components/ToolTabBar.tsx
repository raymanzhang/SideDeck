// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

export type AiTool = "claude" | "codex" | "cursor";

const AI_TOOLS: { id: AiTool; label: string }[] = [
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
  { id: "cursor", label: "Cursor" },
];

export function ToolTabBar({
  active,
  onChange,
  sessionCounts,
  attentionLabel,
}: {
  active: AiTool;
  onChange: (tool: AiTool) => void;
  sessionCounts: Record<AiTool, number>;
  attentionLabel?: string;
}) {
  return (
    <div
      className="flex shrink-0 gap-control border-b border-hud-border px-3"
      aria-label="AI tools"
    >
      {AI_TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          aria-pressed={active === tool.id}
          onClick={() => onChange(tool.id)}
          className={`touch-target items-center gap-control border-b-2 px-3 py-2.5 text-body font-semibold uppercase tracking-wider transition-colors focus-visible:outline-hud-accent ${active === tool.id ? "border-hud-accent text-hud-text" : "border-transparent text-hud-text-dim hover:text-hud-text"}`}
        >
          {tool.label}
          {tool.id === "codex" && attentionLabel && (
            <span className="text-amber-400"> · {attentionLabel}</span>
          )}
          {tool.id !== "cursor" && sessionCounts[tool.id] > 0 && (
            <span
              className="rounded-full bg-hud-border px-1.5 py-0.5 tabular-nums"
              aria-label={`${sessionCounts[tool.id]} sessions`}
            >
              {sessionCounts[tool.id]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
