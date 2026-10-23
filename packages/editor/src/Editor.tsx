"use client";

import { type DockviewReadyEvent, DockviewReact, themeDark } from "dockview-react";
import { useEffect } from "react";
import { DocumentPanel } from "./DocumentPanel";
import { HistoryPanel } from "./HistoryPanel";
import { chordOf, findShortcut, isTypingTarget } from "./keymap";
import { LayersPanel } from "./LayersPanel";
import { MenuBar } from "./MenuBar";
import { OptionsBar } from "./OptionsBar";
import { useEditor } from "./store";
import { Toolbar } from "./Toolbar";

const PANELS = {
  document: DocumentPanel,
  layers: LayersPanel,
  history: HistoryPanel,
};

function onReady({ api }: DockviewReadyEvent) {
  api.addPanel({ id: "document", component: "document", title: "Untitled-1" });
  api.addPanel({
    id: "history",
    component: "history",
    title: "History",
    position: { referencePanel: "document", direction: "right" },
    initialWidth: 280,
  });
  api.addPanel({ id: "layers", component: "layers", title: "Layers", position: { referencePanel: "history", direction: "below" } });
}

export function Editor() {
  useShortcuts();

  return (
    <div className="flex h-full flex-col bg-chrome font-ui text-[12px] text-ink select-none">
      <MenuBar />
      <OptionsBar />
      <div className="flex min-h-0 flex-1">
        <Toolbar />
        <div className="foton-dock min-w-0 flex-1">
          <DockviewReact className="h-full" theme={themeDark} components={PANELS} onReady={onReady} />
        </div>
      </div>
    </div>
  );
}

/** Global keyboard handling: keymap chords plus Space as the spring-loaded Hand tool. */
function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) useEditor.setState({ springTool: "hand" });
        return;
      }
      const chord = chordOf(event);
      const shortcut = chord && findShortcut(chord);
      if (!shortcut) return;
      event.preventDefault();
      if (!event.repeat || shortcut.id.startsWith("edit.")) shortcut.run();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") useEditor.setState({ springTool: null });
    };
    const onBlur = () => useEditor.setState({ springTool: null });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
