# Foton

Foton is a layered image editor that runs in the browser. It renders with a Rust/WASM engine on WebGPU, falling back to WebGL2, and its AI features run on the device.

## Layout

```
apps/web          Next.js 16 app: landing page and /edit (client-only editor mount)
packages/editor   React editor shell: menus, options bar, tools, dockable panels, shortcuts
packages/engine   Typed client for the engine worker (commands in, snapshots out)
packages/ui       Design tokens (Tailwind @theme)
packages/config   Shared tsconfig
crates/foton-core     Document model, Command enum, undo history with gestures
crates/foton-render   wgpu compositor (all blend modes in WGSL) and viewport presenter
crates/foton-wasm     wasm-bindgen entry that runs inside the worker on an OffscreenCanvas
scripts/build-wasm.mjs  Builds the engine and emits content-hashed glue and .wasm into apps/web/public/engine
e2e/              Playwright tests
```

## How an edit flows

1. A tool, menu or shortcut calls an action in `packages/editor/src/actions.ts`.
2. The action sends a serializable `Command` (for example `{ type: "layer.add" }`) through `EngineClient`.
3. The engine worker applies it in Rust (`Editor::dispatch`), records history, re-composites on the GPU, and posts back a `Snapshot`.
4. The panels re-render from that snapshot.

Commands are the single source of truth, so the same mechanism will drive actions recording, the AI agent and collaboration. Drags and slider scrubs are wrapped in `beginGesture`/`endGesture`, so each one becomes a single history state.

## Development

You need Node 24 with pnpm, Rust (pinned by `rust-toolchain.toml`, wasm32 target included), and the `wasm-bindgen` CLI at the same version as the crate:

```sh
cargo install wasm-bindgen-cli --version 0.2.129 --locked
pnpm install
pnpm dev              # builds the engine (release), then starts Next on :3000
```

After changing Rust code, run `pnpm build:wasm` (add `--dev` for a fast debug build) and reload the page.

| Check | Command |
| --- | --- |
| Rust unit and GPU tests (the compositor runs on your real GPU) | `pnpm test:rust` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| End-to-end (Playwright, headless WebGPU) | `pnpm test:e2e` |

The app is served with COOP/COEP headers (`apps/web/next.config.ts`), so `crossOriginIsolated` is true. Any cross-origin asset, such as a model CDN, must send CORP/CORS headers.

The full product plan and roadmap are tracked separately. Phase 0 (foundations) is what's in this repository today.
