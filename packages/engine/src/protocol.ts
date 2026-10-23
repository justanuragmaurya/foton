import type { Backend, Command, Snapshot, ViewTransform } from "./types";

export type Request =
  | { type: "dispatch"; command: Command }
  | { type: "beginGesture" }
  | { type: "endGesture" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "jumpTo"; index: number };

export type ToWorker =
  | {
      type: "init";
      canvas: OffscreenCanvas;
      docWidth: number;
      docHeight: number;
      view: ViewTransform;
    }
  | ({ id: number } & Request)
  | ({ type: "view" } & ViewTransform)
  | { type: "resize"; width: number; height: number };

export type FromWorker =
  | { type: "ready"; backend: Backend; maxTextureSize: number; snapshot: Snapshot }
  | { type: "result"; id: number; snapshot?: Snapshot; error?: string }
  | { type: "fatal"; error: string };
