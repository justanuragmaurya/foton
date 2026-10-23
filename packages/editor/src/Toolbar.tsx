"use client";

import { ArrowLeftRight } from "lucide-react";
import * as actions from "./actions";
import { shortcutLabel } from "./keymap";
import { type Rgb, useEditor } from "./store";
import { TOOLS } from "./tools";

const css = ([r, g, b]: Rgb) => `rgb(${r * 255}, ${g * 255}, ${b * 255})`;

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const spring = useEditor((s) => s.springTool);
  const foreground = useEditor((s) => s.foreground);
  const background = useEditor((s) => s.background);

  return (
    <nav aria-label="Tools" className="flex w-10 shrink-0 flex-col items-center gap-0.5 border-r border-line bg-panel py-2">
      {TOOLS.map(({ id, name, key, icon: Icon, ready }) => {
        const selected = (spring ?? tool) === id;
        return (
          <button
            key={id}
            aria-label={name}
            aria-pressed={selected}
            title={`${name} (${key.toUpperCase()})${ready ? "" : " · coming soon"}`}
            onClick={() => actions.selectTool(id)}
            className={`grid h-8 w-8 place-items-center rounded ${
              selected ? "bg-panel-hover text-ink" : "text-ink-muted hover:bg-panel-hover hover:text-ink"
            } ${ready ? "" : "opacity-60"}`}
          >
            <Icon size={17} strokeWidth={1.75} />
          </button>
        );
      })}

      <div className="relative mt-3 h-9 w-9" aria-label="Foreground and background colours">
        <div
          title="Background colour"
          className="absolute bottom-0 right-0 h-5 w-5 rounded-sm border border-ink-faint"
          style={{ background: css(background) }}
        />
        <div
          title="Foreground colour"
          className="absolute left-0 top-0 h-5 w-5 rounded-sm border border-ink-faint"
          style={{ background: css(foreground) }}
        />
        <button
          title={`Swap colours (${shortcutLabel("color.swap")})`}
          aria-label="Swap colours"
          onClick={actions.swapColors}
          className="absolute -right-1 -top-1 text-ink-muted hover:text-ink"
        >
          <ArrowLeftRight size={10} />
        </button>
      </div>
    </nav>
  );
}
