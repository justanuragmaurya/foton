import * as actions from "./actions";
import { effectiveTool, useEditor } from "./store";
import { TOOLS } from "./tools";

/**
 * Key chords use layout-independent names built from `KeyboardEvent.code`:
 * "mod" is ⌘ on macOS and Ctrl elsewhere, followed by alt, shift, then the key.
 */
export interface Shortcut {
  id: string;
  keys: string[];
  run: () => void;
  /** Only fires when this returns true (e.g. tool-specific keys). */
  when?: () => boolean;
}

const moveToolActive = () => effectiveTool(useEditor.getState()) === "move";

export const SHORTCUTS: Shortcut[] = [
  { id: "edit.undo", keys: ["mod+z"], run: actions.undo },
  { id: "edit.redo", keys: ["mod+shift+z", "mod+y"], run: actions.redo },
  // Browsers reserve ⇧⌘N for private windows, so the no-dialog variant is the reliable one on the web.
  { id: "layer.new", keys: ["mod+shift+n", "mod+alt+shift+n"], run: actions.newLayer },
  { id: "layer.duplicate", keys: ["mod+j"], run: actions.duplicateLayer },
  { id: "layer.delete", keys: ["backspace", "delete"], run: actions.deleteLayer, when: moveToolActive },
  { id: "layer.bringForward", keys: ["mod+]"], run: () => actions.shiftLayer(1) },
  { id: "layer.sendBackward", keys: ["mod+["], run: () => actions.shiftLayer(-1) },
  { id: "view.zoomIn", keys: ["mod+=", "mod+shift+="], run: () => actions.zoomStep(1) },
  { id: "view.zoomOut", keys: ["mod+-"], run: () => actions.zoomStep(-1) },
  { id: "view.fit", keys: ["mod+0"], run: actions.fitOnScreen },
  { id: "view.actualPixels", keys: ["mod+1"], run: actions.actualPixels },
  { id: "color.swap", keys: ["x"], run: actions.swapColors },
  { id: "color.reset", keys: ["d"], run: actions.resetColors },
  ...TOOLS.map((tool) => ({ id: `tool.${tool.id}`, keys: [tool.key], run: () => actions.selectTool(tool.id) })),
  // Number keys set layer opacity with the Move tool: 1 → 10% … 9 → 90%, 0 → 100%.
  ...Array.from({ length: 10 }, (_, digit) => ({
    id: `layer.opacity${digit}`,
    keys: [String(digit)],
    run: () => actions.setActiveOpacity(digit === 0 ? 1 : digit / 10),
    when: moveToolActive,
  })),
];

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const CODE_NAMES: Record<string, string> = {
  BracketLeft: "[",
  BracketRight: "]",
  Equal: "=",
  Minus: "-",
  Backspace: "backspace",
  Delete: "delete",
  Space: "space",
  Escape: "escape",
};

export function chordOf(event: KeyboardEvent): string | null {
  const { code } = event;
  const key = code.startsWith("Key")
    ? code.slice(3).toLowerCase()
    : code.startsWith("Digit")
      ? code.slice(5)
      : CODE_NAMES[code];
  if (!key) return null;
  const mod = isMac ? event.metaKey : event.ctrlKey;
  return [mod && "mod", event.altKey && "alt", event.shiftKey && "shift", key].filter(Boolean).join("+");
}

const byChord = new Map<string, Shortcut[]>();
for (const shortcut of SHORTCUTS) {
  for (const key of shortcut.keys) byChord.set(key, [...(byChord.get(key) ?? []), shortcut]);
}

export function findShortcut(chord: string): Shortcut | undefined {
  return byChord.get(chord)?.find((s) => !s.when || s.when());
}

/** Human-readable label for a shortcut's primary chord, e.g. "⇧⌘Z" or "Ctrl+Shift+Z". */
export function shortcutLabel(id: string): string | undefined {
  const chord = SHORTCUTS.find((s) => s.id === id)?.keys[0];
  if (!chord) return undefined;
  const parts = chord.split("+");
  const key = parts.pop()!.toUpperCase();
  if (isMac) {
    const glyphs: Record<string, string> = { mod: "⌘", alt: "⌥", shift: "⇧" };
    const order = ["alt", "shift", "mod"];
    return order.filter((m) => parts.includes(m)).map((m) => glyphs[m]).join("") + key;
  }
  const names: Record<string, string> = { mod: "Ctrl", alt: "Alt", shift: "Shift" };
  return [...parts.map((p) => names[p]), key].join("+");
}

export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
