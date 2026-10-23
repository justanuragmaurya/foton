"use client";

import * as actions from "./actions";
import { effectiveTool, useEditor } from "./store";
import { toolById } from "./tools";

/** Context-sensitive controls for the current tool. */
export function OptionsBar() {
  const tool = toolById(useEditor(effectiveTool));
  const Icon = tool.icon;

  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 text-[12px]">
      <span className="flex items-center gap-2 pr-3 text-ink">
        <Icon size={16} strokeWidth={1.75} />
        {tool.name}
      </span>
      <span className="h-5 w-px bg-line" />
      {tool.id === "hand" || tool.id === "zoom" ? (
        <>
          <OptionButton onClick={actions.actualPixels}>100%</OptionButton>
          <OptionButton onClick={actions.fitOnScreen}>Fit Screen</OptionButton>
          {tool.id === "zoom" && <span className="text-ink-faint">Click to zoom in · ⌥-click to zoom out</span>}
        </>
      ) : tool.id === "move" ? (
        <span className="text-ink-faint">Drag to move the active layer · 0–9 set opacity</span>
      ) : (
        <span className="text-ink-faint">This tool arrives with the Phase 1 pixel engine.</span>
      )}
    </div>
  );
}

function OptionButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-sm border border-line bg-panel-raised px-2 py-0.5 text-ink hover:bg-panel-hover">
      {children}
    </button>
  );
}
