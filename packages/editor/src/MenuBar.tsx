"use client";

import { useEffect, useRef, useState } from "react";
import * as actions from "./actions";
import { shortcutLabel } from "./keymap";
import { activeLayer, useEditor } from "./store";

interface MenuItem {
  label: string;
  /** Shortcut id from the keymap, used for the right-aligned hint. */
  shortcut?: string;
  run?: () => void;
  enabled?: () => boolean;
}

type MenuEntry = MenuItem | "separator";

const hasLayer = () => activeLayer(useEditor.getState().snapshot) !== undefined;
const canUndo = () => (useEditor.getState().snapshot?.historyIndex ?? 0) > 0;
const canRedo = () => {
  const s = useEditor.getState().snapshot;
  return !!s && s.historyIndex < s.history.length - 1;
};

const MENUS: { title: string; items: MenuEntry[] }[] = [
  { title: "File", items: [{ label: "New…" }, { label: "Open…" }, "separator", { label: "Save" }, { label: "Export As…" }] },
  {
    title: "Edit",
    items: [
      { label: "Undo", shortcut: "edit.undo", run: actions.undo, enabled: canUndo },
      { label: "Redo", shortcut: "edit.redo", run: actions.redo, enabled: canRedo },
      "separator",
      { label: "Cut" },
      { label: "Copy" },
      { label: "Paste" },
      "separator",
      { label: "Keyboard Shortcuts…" },
    ],
  },
  { title: "Image", items: [{ label: "Adjustments" }, "separator", { label: "Image Size…" }, { label: "Canvas Size…" }] },
  {
    title: "Layer",
    items: [
      { label: "New Layer", shortcut: "layer.new", run: actions.newLayer },
      { label: "Duplicate Layer", shortcut: "layer.duplicate", run: actions.duplicateLayer, enabled: hasLayer },
      { label: "Delete Layer", run: actions.deleteLayer, enabled: () => (useEditor.getState().snapshot?.document.layers.length ?? 0) > 1 },
      "separator",
      { label: "Bring Forward", shortcut: "layer.bringForward", run: () => actions.shiftLayer(1), enabled: hasLayer },
      { label: "Send Backward", shortcut: "layer.sendBackward", run: () => actions.shiftLayer(-1), enabled: hasLayer },
    ],
  },
  { title: "Select", items: [{ label: "All" }, { label: "Deselect" }, { label: "Inverse" }, "separator", { label: "Subject" }] },
  { title: "Filter", items: [{ label: "Blur" }, { label: "Sharpen" }] },
  {
    title: "View",
    items: [
      { label: "Zoom In", shortcut: "view.zoomIn", run: () => actions.zoomStep(1) },
      { label: "Zoom Out", shortcut: "view.zoomOut", run: () => actions.zoomStep(-1) },
      { label: "Fit on Screen", shortcut: "view.fit", run: actions.fitOnScreen },
      { label: "100%", shortcut: "view.actualPixels", run: actions.actualPixels },
    ],
  },
  { title: "Window", items: [{ label: "Workspace" }] },
  { title: "Help", items: [{ label: "About Foton" }] },
];

/** Desktop-style menu bar: click to open, then hover moves between menus. */
export function MenuBar() {
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  // Re-render while open so enabled() states reflect the latest snapshot.
  useEditor((s) => (open === null ? null : s.snapshot));

  useEffect(() => {
    if (open === null) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={ref} role="menubar" className="flex h-7 shrink-0 items-center gap-0.5 border-b border-line bg-chrome px-2 text-[12px]">
      <span className="mr-3 font-semibold tracking-wide text-accent">Foton</span>
      {MENUS.map((menu, i) => (
        <div key={menu.title} className="relative">
          <button
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            className={`rounded-sm px-2 py-0.5 ${open === i ? "bg-panel-hover text-ink" : "text-ink-muted hover:text-ink"}`}
            onClick={() => setOpen(open === i ? null : i)}
            onPointerEnter={() => open !== null && setOpen(i)}
          >
            {menu.title}
          </button>
          {open === i && (
            <div role="menu" className="absolute left-0 top-full z-50 mt-0.5 min-w-56 rounded border border-line bg-panel-raised py-1 shadow-xl shadow-black/40">
              {menu.items.map((item, j) =>
                item === "separator" ? (
                  <div key={j} className="my-1 h-px bg-line" />
                ) : (
                  <MenuRow key={item.label} item={item} onDone={() => setOpen(null)} />
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MenuRow({ item, onDone }: { item: MenuItem; onDone: () => void }) {
  const enabled = !!item.run && (item.enabled?.() ?? true);
  return (
    <button
      role="menuitem"
      disabled={!enabled}
      onClick={() => {
        item.run?.();
        onDone();
      }}
      className="flex w-full items-center justify-between gap-6 px-3 py-1 text-left text-ink enabled:hover:bg-accent-strong disabled:text-ink-faint"
    >
      <span>{item.label}</span>
      {item.shortcut && <span className="text-[11px] text-ink-muted">{shortcutLabel(item.shortcut)}</span>}
    </button>
  );
}
