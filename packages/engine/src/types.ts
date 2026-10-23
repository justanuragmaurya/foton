// Mirrors of the serde types in crates/foton-core. Keep in sync until these are generated.

export type LayerId = number;

export const BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "colorDodge",
  "colorBurn",
  "hardLight",
  "softLight",
  "difference",
  "exclusion",
] as const;

export type BlendMode = (typeof BLEND_MODES)[number];

export type Rgba = [number, number, number, number];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LayerContent = { kind: "solid"; color: Rgba; bounds: Rect };

export interface Layer {
  id: LayerId;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  content: LayerContent;
}

export interface DocumentState {
  width: number;
  height: number;
  /** Bottom → top. */
  layers: Layer[];
  activeLayer: LayerId | null;
}

export interface Snapshot {
  document: DocumentState;
  history: { label: string }[];
  historyIndex: number;
}

export type Command =
  | { type: "layer.add"; name?: string; color?: Rgba; bounds?: Rect }
  | { type: "layer.remove"; id: LayerId }
  | { type: "layer.duplicate"; id: LayerId }
  | { type: "layer.rename"; id: LayerId; name: string }
  | { type: "layer.setVisible"; id: LayerId; visible: boolean }
  | { type: "layer.setOpacity"; id: LayerId; opacity: number }
  | { type: "layer.setBlendMode"; id: LayerId; blendMode: BlendMode }
  | { type: "layer.translate"; id: LayerId; dx: number; dy: number }
  | { type: "layer.move"; id: LayerId; index: number }
  | { type: "layer.select"; id: LayerId };

/** Viewport transform in physical (device) pixels. */
export interface ViewTransform {
  zoom: number;
  originX: number;
  originY: number;
}

export type Backend = "webgpu" | "webgl2" | "unknown";
