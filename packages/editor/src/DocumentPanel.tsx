"use client";

import { EngineClient } from "@foton/engine";
import type { IDockviewPanelProps } from "dockview-react";
import { useEffect, useRef } from "react";
import * as actions from "./actions";
import { activeLayer, effectiveTool, useEditor } from "./store";
import { StatusBar } from "./StatusBar";
import { fitView, formatZoom, zoomAround } from "./view";

const DOC_WIDTH = 1920;
const DOC_HEIGHT = 1080;

const CURSORS: Partial<Record<string, string>> = { hand: "grab", zoom: "zoom-in", move: "default" };

type Drag =
  | { kind: "pan"; startX: number; startY: number; originX: number; originY: number }
  | { kind: "move"; id: number; startX: number; startY: number; sentX: number; sentY: number };

export function DocumentPanel({ api }: IDockviewPanelProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tool = useEditor(effectiveTool);
  const zoom = useEditor((s) => s.view.zoom);
  const layerName = useEditor((s) => activeLayer(s.snapshot)?.name);

  useEffect(() => {
    api.setTitle(`Untitled-1 @ ${formatZoom(zoom)}${layerName ? ` (${layerName}, RGB/8)` : ""}`);
  }, [api, zoom, layerName]);

  useEffect(() => {
    const host = hostRef.current!;
    // The canvas is created here rather than rendered by React: control can be transferred
    // to the worker only once, and StrictMode re-runs effects on the same DOM node.
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 h-full w-full";
    canvas.dataset.testid = "document-canvas";
    host.prepend(canvas);

    const dpr = window.devicePixelRatio || 1;
    const viewport = { width: Math.max(1, Math.round(host.clientWidth * dpr)), height: Math.max(1, Math.round(host.clientHeight * dpr)) };
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const view = fitView(viewport, DOC_WIDTH, DOC_HEIGHT, false);
    useEditor.setState({ viewport, view, error: null });

    let disposed = false;
    let client: EngineClient | undefined;
    EngineClient.create({ canvas, docWidth: DOC_WIDTH, docHeight: DOC_HEIGHT, view })
      .then(({ client: created, info }) => {
        if (disposed) return created.dispose();
        client = created;
        created.subscribe((snapshot) => useEditor.setState({ snapshot }));
        useEditor.setState({ engine: created, backend: info.backend, snapshot: info.snapshot });
        // The viewport may have changed while the engine was starting.
        const { viewport: current, view: currentView } = useEditor.getState();
        created.resize(current.width, current.height);
        created.setView(currentView);
      })
      .catch((error: unknown) => {
        if (!disposed) useEditor.setState({ error: error instanceof Error ? error.message : String(error) });
      });

    const observer = new ResizeObserver(([entry]) => {
      const box = entry.devicePixelContentBoxSize?.[0];
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, box ? box.inlineSize : Math.round(entry.contentRect.width * ratio));
      const height = Math.max(1, box ? box.blockSize : Math.round(entry.contentRect.height * ratio));
      const { viewport: previous, view: currentView, engine } = useEditor.getState();
      if (width === previous.width && height === previous.height) return;
      useEditor.setState({ viewport: { width, height } });
      engine?.resize(width, height);
      // Keep the document centred in the panel as it resizes.
      actions.setView({
        ...currentView,
        originX: currentView.originX + (width - previous.width) / 2,
        originY: currentView.originY + (height - previous.height) / 2,
      });
    });
    try {
      observer.observe(canvas, { box: "device-pixel-content-box" });
    } catch {
      observer.observe(canvas);
    }

    return () => {
      disposed = true;
      observer.disconnect();
      client?.dispose();
      canvas.remove();
      useEditor.setState({ engine: null, backend: null, snapshot: null });
    };
  }, []);

  // Wheel: scroll pans; ⌘/Ctrl (and trackpad pinch, which arrives as ctrl+wheel) or ⌥ zooms at the cursor.
  useEffect(() => {
    const host = hostRef.current!;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { view } = useEditor.getState();
      const dpr = window.devicePixelRatio || 1;
      const rect = host.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey || event.altKey) {
        const factor = Math.exp(-event.deltaY * (event.ctrlKey && !event.metaKey ? 0.01 : 0.002));
        const x = (event.clientX - rect.left) * dpr;
        const y = (event.clientY - rect.top) * dpr;
        actions.setView(zoomAround(view, view.zoom * factor, x, y));
      } else {
        const dx = event.shiftKey ? event.deltaY : event.deltaX;
        const dy = event.shiftKey ? 0 : event.deltaY;
        actions.setView({ ...view, originX: view.originX - dx * dpr, originY: view.originY - dy * dpr });
      }
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, []);

  const drag = useRef<Drag | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = useEditor.getState();
    const current = effectiveTool(state);
    const dpr = window.devicePixelRatio || 1;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) * dpr;
    const y = (event.clientY - rect.top) * dpr;

    if (current === "hand" || event.button === 1) {
      drag.current = { kind: "pan", startX: x, startY: y, originX: state.view.originX, originY: state.view.originY };
    } else if (current === "zoom" && event.button === 0) {
      actions.zoomStep(event.altKey ? -1 : 1, { x, y });
      return;
    } else if (current === "move" && event.button === 0) {
      const layer = activeLayer(state.snapshot);
      if (!layer) return;
      drag.current = { kind: "move", id: layer.id, startX: x, startY: y, sentX: 0, sentY: 0 };
      actions.beginGesture();
    } else {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) * dpr;
    const y = (event.clientY - rect.top) * dpr;
    if (active.kind === "pan") {
      const { view } = useEditor.getState();
      actions.setView({ ...view, originX: active.originX + x - active.startX, originY: active.originY + y - active.startY });
    } else {
      // Convert the screen delta to whole document pixels and send only what is new.
      const { zoom: z } = useEditor.getState().view;
      const totalX = Math.round((x - active.startX) / z);
      const totalY = Math.round((y - active.startY) / z);
      const dx = totalX - active.sentX;
      const dy = totalY - active.sentY;
      if (dx === 0 && dy === 0) return;
      active.sentX = totalX;
      active.sentY = totalY;
      actions.run({ type: "layer.translate", id: active.id, dx, dy });
    }
  };

  const endDrag = () => {
    if (drag.current?.kind === "move") actions.endGesture();
    drag.current = null;
  };

  const error = useEditor((s) => s.error);
  const ready = useEditor((s) => s.engine !== null);

  return (
    <div className="flex h-full flex-col bg-[#282828]">
      <div
        ref={hostRef}
        className="relative min-h-0 flex-1 overflow-hidden touch-none"
        style={{ cursor: CURSORS[tool] ?? "crosshair" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onContextMenu={(e) => e.preventDefault()}
      >
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center text-ink-muted">Starting engine…</div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="max-w-md rounded border border-danger/40 bg-panel p-4">
              <p className="mb-1 font-medium text-danger">The rendering engine could not start</p>
              <p className="text-ink-muted">{error}</p>
            </div>
          </div>
        )}
      </div>
      <StatusBar />
    </div>
  );
}
