import {
  Brush,
  Crop,
  Eraser,
  Hand,
  Lasso,
  type LucideIcon,
  Move,
  PaintBucket,
  Pipette,
  SquareDashed,
  Type,
  WandSparkles,
  ZoomIn,
} from "lucide-react";

export type ToolId =
  | "move"
  | "marquee"
  | "lasso"
  | "quickSelect"
  | "crop"
  | "eyedropper"
  | "brush"
  | "eraser"
  | "fill"
  | "type"
  | "hand"
  | "zoom";

export interface ToolDef {
  id: ToolId;
  name: string;
  key: string;
  icon: LucideIcon;
  /** Tools that are wired to the engine today; the rest land with the Phase 1 brush/selection work. */
  ready: boolean;
}

export const TOOLS: ToolDef[] = [
  { id: "move", name: "Move", key: "v", icon: Move, ready: true },
  { id: "marquee", name: "Rectangle Select", key: "m", icon: SquareDashed, ready: false },
  { id: "lasso", name: "Lasso", key: "l", icon: Lasso, ready: false },
  { id: "quickSelect", name: "Smart Select", key: "w", icon: WandSparkles, ready: false },
  { id: "crop", name: "Crop", key: "c", icon: Crop, ready: false },
  { id: "eyedropper", name: "Color Picker", key: "i", icon: Pipette, ready: false },
  { id: "brush", name: "Brush", key: "b", icon: Brush, ready: false },
  { id: "eraser", name: "Eraser", key: "e", icon: Eraser, ready: false },
  { id: "fill", name: "Fill", key: "g", icon: PaintBucket, ready: false },
  { id: "type", name: "Text", key: "t", icon: Type, ready: false },
  { id: "hand", name: "Hand", key: "h", icon: Hand, ready: true },
  { id: "zoom", name: "Zoom", key: "z", icon: ZoomIn, ready: true },
];

export const toolById = (id: ToolId) => TOOLS.find((t) => t.id === id)!;
