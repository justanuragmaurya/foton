/// <reference lib="webworker" />
import { gluePath, wasmPath } from "../pkg/asset.js";
import type { Engine } from "../pkg/foton_wasm";
import type { FromWorker, Request, ToWorker } from "./protocol";
import type { Backend, Snapshot } from "./types";

declare const self: DedicatedWorkerGlobalScope;

type Glue = typeof import("../pkg/foton_wasm");

async function loadGlue(): Promise<Glue> {
  // Served untouched from /engine; see scripts/build-wasm.mjs for why it is not bundled.
  return import(/* webpackIgnore: true */ /* turbopackIgnore: true */ gluePath);
}

let engine: Engine | undefined;
let frameRequested = false;
// Messages that arrive while the engine is still initialising are replayed once it is ready.
const pending: ToWorker[] = [];

const post = (message: FromWorker) => self.postMessage(message);

function requestFrame() {
  if (frameRequested) return;
  frameRequested = true;
  const draw = () => {
    frameRequested = false;
    engine?.render();
  };
  if (typeof self.requestAnimationFrame === "function") self.requestAnimationFrame(draw);
  else setTimeout(draw, 16);
}

function perform(engine: Engine, request: Request) {
  switch (request.type) {
    case "dispatch":
      engine.dispatch(request.command);
      break;
    case "beginGesture":
      engine.beginGesture();
      break;
    case "endGesture":
      engine.endGesture();
      break;
    case "undo":
      engine.undo();
      break;
    case "redo":
      engine.redo();
      break;
    case "jumpTo":
      engine.jumpTo(request.index);
      break;
  }
}

function handle(engine: Engine, message: ToWorker) {
  switch (message.type) {
    case "init":
      return;
    case "view":
      engine.setView(message.zoom, message.originX, message.originY);
      break;
    case "resize":
      engine.resize(message.width, message.height);
      break;
    default:
      try {
        perform(engine, message);
        post({ type: "result", id: message.id, snapshot: engine.snapshot() as Snapshot });
      } catch (error) {
        post({ type: "result", id: message.id, error: String(error) });
      }
  }
  requestFrame();
}

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  if (message.type !== "init") {
    if (engine) handle(engine, message);
    else pending.push(message);
    return;
  }

  try {
    const glue = await loadGlue();
    await glue.default({ module_or_path: wasmPath });
    const created = await glue.Engine.create(message.canvas, message.docWidth, message.docHeight);
    const { zoom, originX, originY } = message.view;
    created.setView(zoom, originX, originY);
    engine = created;
    post({
      type: "ready",
      backend: created.backend as Backend,
      maxTextureSize: created.maxTextureSize,
      snapshot: created.snapshot() as Snapshot,
    });
    for (const queued of pending.splice(0)) handle(created, queued);
    requestFrame();
  } catch (error) {
    post({ type: "fatal", error: String(error) });
  }
};
