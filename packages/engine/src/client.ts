import type { FromWorker, Request, ToWorker } from "./protocol";
import type { Backend, Command, Snapshot, ViewTransform } from "./types";

export interface EngineInfo {
  backend: Backend;
  maxTextureSize: number;
  snapshot: Snapshot;
}

export interface CreateEngineOptions {
  canvas: HTMLCanvasElement;
  docWidth: number;
  docHeight: number;
  view: ViewTransform;
}

/**
 * UI-thread handle to the engine worker. Every request resolves with the snapshot taken
 * right after it ran, so panels always render a state the engine actually reached.
 */
export class EngineClient {
  private nextId = 1;
  private readonly waiting = new Map<number, { resolve: (s: Snapshot) => void; reject: (e: Error) => void }>();
  private readonly listeners = new Set<(snapshot: Snapshot) => void>();

  private constructor(private readonly worker: Worker) {}

  static create({ canvas, docWidth, docHeight, view }: CreateEngineOptions): Promise<{ client: EngineClient; info: EngineInfo }> {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "foton-engine" });
    const client = new EngineClient(worker);
    const offscreen = canvas.transferControlToOffscreen();

    return new Promise((resolve, reject) => {
      worker.onerror = (event) => reject(new Error(event.message || "engine worker failed to load"));
      worker.onmessage = (event: MessageEvent<FromWorker>) => {
        const message = event.data;
        if (message.type === "ready") {
          worker.onmessage = (e: MessageEvent<FromWorker>) => client.receive(e.data);
          resolve({ client, info: message });
        } else if (message.type === "fatal") {
          reject(new Error(message.error));
        }
      };
      client.post({ type: "init", canvas: offscreen, docWidth, docHeight, view }, [offscreen]);
    });
  }

  dispatch(command: Command) {
    return this.request({ type: "dispatch", command });
  }

  /** Until {@link endGesture}, edits collapse into one history state (drags, strokes, slider scrubs). */
  beginGesture() {
    return this.request({ type: "beginGesture" });
  }

  endGesture() {
    return this.request({ type: "endGesture" });
  }

  undo() {
    return this.request({ type: "undo" });
  }

  redo() {
    return this.request({ type: "redo" });
  }

  jumpTo(index: number) {
    return this.request({ type: "jumpTo", index });
  }

  setView(view: ViewTransform) {
    this.post({ type: "view", ...view });
  }

  resize(width: number, height: number) {
    this.post({ type: "resize", width, height });
  }

  /** Called with every snapshot the engine produces, whoever caused it. */
  subscribe(listener: (snapshot: Snapshot) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose() {
    this.worker.terminate();
    for (const { reject } of this.waiting.values()) reject(new Error("engine disposed"));
    this.waiting.clear();
  }

  private request(request: Request): Promise<Snapshot> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.post({ id, ...request });
    });
  }

  private post(message: ToWorker, transfer: Transferable[] = []) {
    this.worker.postMessage(message, transfer);
  }

  private receive(message: FromWorker) {
    if (message.type !== "result") {
      if (message.type === "fatal") console.error("[foton-engine]", message.error);
      return;
    }
    const waiter = this.waiting.get(message.id);
    this.waiting.delete(message.id);
    if (message.snapshot) {
      for (const listener of this.listeners) listener(message.snapshot);
      waiter?.resolve(message.snapshot);
    } else {
      waiter?.reject(new Error(message.error));
    }
  }
}
