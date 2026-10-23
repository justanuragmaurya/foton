"use client";

import { useState } from "react";
import * as actions from "./actions";
import { useEditor } from "./store";
import { clampZoom, formatZoom, zoomAround } from "./view";

const BACKEND_LABELS = { webgpu: "WebGPU", webgl2: "WebGL2 fallback", unknown: "Unknown GPU" } as const;

export function StatusBar() {
  const zoom = useEditor((s) => s.view.zoom);
  const doc = useEditor((s) => s.snapshot?.document);
  const backend = useEditor((s) => s.backend);
  const [draft, setDraft] = useState<string | null>(null);

  const commitZoom = () => {
    const percent = parseFloat(draft ?? "");
    setDraft(null);
    if (!Number.isFinite(percent) || percent <= 0) return;
    const { view, viewport } = useEditor.getState();
    actions.setView(zoomAround(view, clampZoom(percent / 100), viewport.width / 2, viewport.height / 2));
  };

  return (
    <div className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-panel px-2 text-[11px] text-ink-muted">
      <input
        aria-label="Zoom level"
        className="w-16 rounded-sm bg-transparent px-1 text-ink outline-none focus:bg-chrome"
        value={draft ?? formatZoom(zoom)}
        onFocus={(e) => {
          setDraft(String(Math.round(zoom * 10000) / 100));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitZoom}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
      {doc && (
        <span>
          {doc.width} × {doc.height} px · RGB/8
        </span>
      )}
      <span className="ml-auto flex items-center gap-3">
        {backend && <span data-testid="backend">{BACKEND_LABELS[backend]}</span>}
        <span title="Cross-origin isolation enables WASM threads and SharedArrayBuffer">
          {typeof window !== "undefined" && window.crossOriginIsolated ? "Isolated" : "Not isolated"}
        </span>
      </span>
    </div>
  );
}
