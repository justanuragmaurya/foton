import type { Backend, EngineClient, Layer, Snapshot, ViewTransform } from "@foton/engine";
import { create } from "zustand";
import type { ToolId } from "./tools";
import type { Viewport } from "./view";

export type Rgb = [number, number, number];

interface EditorState {
  engine: EngineClient | null;
  backend: Backend | null;
  error: string | null;
  snapshot: Snapshot | null;
  view: ViewTransform;
  viewport: Viewport;
  tool: ToolId;
  /** Temporarily active tool while a key is held (e.g. Space → Hand). */
  springTool: ToolId | null;
  foreground: Rgb;
  background: Rgb;
}

export const useEditor = create<EditorState>(() => ({
  engine: null,
  backend: null,
  error: null,
  snapshot: null,
  view: { zoom: 1, originX: 0, originY: 0 },
  viewport: { width: 1, height: 1 },
  tool: "move",
  springTool: null,
  foreground: [0, 0, 0],
  background: [1, 1, 1],
}));

export const effectiveTool = (s: EditorState) => s.springTool ?? s.tool;

export function activeLayer(snapshot: Snapshot | null): Layer | undefined {
  if (!snapshot) return undefined;
  const { layers, activeLayer } = snapshot.document;
  return layers.find((l) => l.id === activeLayer);
}
