import type { Command, ViewTransform } from "@foton/engine";
import { activeLayer, useEditor } from "./store";
import type { ToolId } from "./tools";
import { centered, fitView, nextZoomStep, zoomAround } from "./view";

// Every user-facing operation lives here so menus, shortcuts and (later) the agent share one path.

export async function run(command: Command) {
  const { engine } = useEditor.getState();
  if (!engine) return;
  try {
    await engine.dispatch(command);
  } catch (error) {
    console.warn(`[foton] ${command.type} failed:`, error);
  }
}

export const undo = () => useEditor.getState().engine?.undo();
export const redo = () => useEditor.getState().engine?.redo();
export const jumpToHistory = (index: number) => useEditor.getState().engine?.jumpTo(index);

function withActiveLayer(fn: (id: number) => Command) {
  const layer = activeLayer(useEditor.getState().snapshot);
  if (layer) return run(fn(layer.id));
}

export const newLayer = () => run({ type: "layer.add" });
export const duplicateLayer = () => withActiveLayer((id) => ({ type: "layer.duplicate", id }));
export const deleteLayer = () => withActiveLayer((id) => ({ type: "layer.remove", id }));
export const setActiveOpacity = (opacity: number) => withActiveLayer((id) => ({ type: "layer.setOpacity", id, opacity }));

/** Moves the active layer up (+1) or down (-1) the stack. */
export function shiftLayer(delta: 1 | -1) {
  const { snapshot } = useEditor.getState();
  const layer = activeLayer(snapshot);
  if (!snapshot || !layer) return;
  const index = snapshot.document.layers.indexOf(layer) + delta;
  if (index < 0 || index >= snapshot.document.layers.length) return;
  return run({ type: "layer.move", id: layer.id, index });
}

export function setView(view: ViewTransform) {
  useEditor.setState({ view });
  useEditor.getState().engine?.setView(view);
}

function docSize() {
  const doc = useEditor.getState().snapshot?.document;
  return doc ? { w: doc.width, h: doc.height } : null;
}

export function fitOnScreen() {
  const size = docSize();
  if (size) setView(fitView(useEditor.getState().viewport, size.w, size.h, true));
}

export function actualPixels() {
  const size = docSize();
  if (size) setView(centered(useEditor.getState().viewport, size.w, size.h, 1));
}

/** Steps through zoom presets, anchored on a device-pixel point (viewport centre by default). */
export function zoomStep(direction: 1 | -1, anchor?: { x: number; y: number }) {
  const { view, viewport } = useEditor.getState();
  const x = anchor?.x ?? viewport.width / 2;
  const y = anchor?.y ?? viewport.height / 2;
  setView(zoomAround(view, nextZoomStep(view.zoom, direction), x, y));
}

export const selectTool = (tool: ToolId) => useEditor.setState({ tool });

export const swapColors = () => useEditor.setState((s) => ({ foreground: s.background, background: s.foreground }));
export const resetColors = () => useEditor.setState({ foreground: [0, 0, 0], background: [1, 1, 1] });

export const beginGesture = () => useEditor.getState().engine?.beginGesture();
export const endGesture = () => useEditor.getState().engine?.endGesture();
