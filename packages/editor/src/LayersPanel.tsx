"use client";

import { BLEND_MODES, type BlendMode, type DocumentState, type Layer } from "@foton/engine";
import { Copy, Eye, EyeOff, FilePlus2, Trash2 } from "lucide-react";
import { useState } from "react";
import * as actions from "./actions";
import { shortcutLabel } from "./keymap";
import { activeLayer, useEditor } from "./store";

const BLEND_LABELS: Record<BlendMode, string> = {
  normal: "Normal",
  multiply: "Multiply",
  screen: "Screen",
  overlay: "Overlay",
  darken: "Darken",
  lighten: "Lighten",
  colorDodge: "Color Dodge",
  colorBurn: "Color Burn",
  hardLight: "Hard Light",
  softLight: "Soft Light",
  difference: "Difference",
  exclusion: "Exclusion",
};

export function LayersPanel() {
  const snapshot = useEditor((s) => s.snapshot);
  const active = activeLayer(snapshot);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  if (!snapshot) return <div className="p-3 text-ink-faint">No document</div>;
  const doc = snapshot.document;
  // Panels list top → bottom; the document stores bottom → top.
  const rows = [...doc.layers].reverse();
  const toDocIndex = (row: number) => doc.layers.length - 1 - row;

  const drop = (row: number) => {
    if (dragging !== null) {
      // Dropping above row `row` means taking that row's slot in top → bottom order.
      const from = doc.layers.findIndex((l) => l.id === dragging);
      let index = toDocIndex(row) + 1;
      if (from < index) index -= 1;
      if (index !== from) actions.run({ type: "layer.move", id: dragging, index });
    }
    setDragging(null);
    setDropIndex(null);
  };

  return (
    <div className="flex h-full flex-col bg-panel text-[12px]">
      <div className="flex items-center gap-2 border-b border-line p-2">
        <select
          aria-label="Blend mode"
          className="min-w-0 flex-1 rounded-sm border border-line bg-panel-raised px-1 py-0.5 outline-none focus:border-accent"
          value={active?.blendMode ?? "normal"}
          disabled={!active}
          onChange={(e) => active && actions.run({ type: "layer.setBlendMode", id: active.id, blendMode: e.target.value as BlendMode })}
        >
          {BLEND_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {BLEND_LABELS[mode]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-ink-muted">
          Opacity
          <input
            aria-label="Opacity"
            type="range"
            min={0}
            max={100}
            className="w-16 accent-accent"
            value={Math.round((active?.opacity ?? 1) * 100)}
            disabled={!active}
            onPointerDown={actions.beginGesture}
            onPointerUp={actions.endGesture}
            onChange={(e) => actions.setActiveOpacity(Number(e.target.value) / 100)}
          />
          <span className="w-8 text-right tabular-nums text-ink">{Math.round((active?.opacity ?? 1) * 100)}%</span>
        </label>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto py-1" role="listbox" aria-label="Layers">
        {rows.map((layer, row) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            doc={doc}
            active={layer.id === doc.activeLayer}
            dropTarget={dropIndex === row && dragging !== layer.id}
            onDragStart={() => setDragging(layer.id)}
            onDragOver={() => setDropIndex(row)}
            onDrop={() => drop(row)}
            onDragEnd={() => {
              setDragging(null);
              setDropIndex(null);
            }}
          />
        ))}
      </ul>

      <div className="flex justify-end gap-1 border-t border-line p-1">
        <IconButton label={`New Layer (${shortcutLabel("layer.new")})`} onClick={actions.newLayer}>
          <FilePlus2 size={15} />
        </IconButton>
        <IconButton label={`Duplicate Layer (${shortcutLabel("layer.duplicate")})`} onClick={actions.duplicateLayer} disabled={!active}>
          <Copy size={15} />
        </IconButton>
        <IconButton label="Delete Layer" onClick={actions.deleteLayer} disabled={doc.layers.length <= 1}>
          <Trash2 size={15} />
        </IconButton>
      </div>
    </div>
  );
}

interface LayerRowProps {
  layer: Layer;
  doc: DocumentState;
  active: boolean;
  dropTarget: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

function LayerRow({ layer, doc, active, dropTarget, onDragStart, onDragOver, onDrop, onDragEnd }: LayerRowProps) {
  const [editing, setEditing] = useState(false);

  return (
    <li
      role="option"
      aria-selected={active}
      data-testid="layer-row"
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      onPointerDown={() => !active && actions.run({ type: "layer.select", id: layer.id })}
      className={`flex h-10 items-center gap-2 border-t-2 px-1 ${dropTarget ? "border-accent" : "border-transparent"} ${
        active ? "bg-accent/25" : "hover:bg-panel-hover"
      }`}
    >
      <button
        aria-label={layer.visible ? "Hide layer" : "Show layer"}
        className="grid h-6 w-6 place-items-center rounded-sm text-ink-muted hover:text-ink"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => actions.run({ type: "layer.setVisible", id: layer.id, visible: !layer.visible })}
      >
        {layer.visible ? <Eye size={14} /> : <EyeOff size={14} className="opacity-50" />}
      </button>
      <Thumbnail layer={layer} doc={doc} />
      {editing ? (
        <input
          autoFocus
          aria-label="Layer name"
          defaultValue={layer.name}
          className="min-w-0 flex-1 rounded-sm border border-accent bg-chrome px-1 outline-none"
          onFocus={(e) => e.target.select()}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== layer.name) actions.run({ type: "layer.rename", id: layer.id, name });
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <span className={`min-w-0 flex-1 truncate ${layer.visible ? "" : "text-ink-faint"}`} onDoubleClick={() => setEditing(true)}>
          {layer.name}
        </span>
      )}
      {layer.opacity < 1 && <span className="pr-1 text-[10px] tabular-nums text-ink-faint">{Math.round(layer.opacity * 100)}%</span>}
    </li>
  );
}

function Thumbnail({ layer, doc }: { layer: Layer; doc: DocumentState }) {
  const { color, bounds } = layer.content;
  const [r, g, b, a] = color;
  const fill = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
  return (
    <svg viewBox={`0 0 ${doc.width} ${doc.height}`} className="h-7 w-12 shrink-0 border border-line" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="foton-checker" width={doc.width / 12} height={doc.width / 12} patternUnits="userSpaceOnUse">
          <rect width={doc.width / 12} height={doc.width / 12} fill="#fff" />
          <rect width={doc.width / 24} height={doc.width / 24} fill="#ccc" />
          <rect x={doc.width / 24} y={doc.width / 24} width={doc.width / 24} height={doc.width / 24} fill="#ccc" />
        </pattern>
      </defs>
      <rect width={doc.width} height={doc.height} fill="url(#foton-checker)" />
      <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill={fill} />
    </svg>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-6 w-6 place-items-center rounded-sm text-ink-muted hover:bg-panel-hover hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
