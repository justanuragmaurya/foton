// Builds crates/foton-wasm and lays the output out for the web app:
//   packages/engine/pkg/          .d.ts types + asset.js (the runtime URLs below)
//   apps/web/public/engine/       content-hashed .wasm and wasm-bindgen JS glue
//
// The glue is served as-is and loaded with an ignored dynamic import rather than bundled:
// bundler transforms (React Refresh mistakes `gl.useProgram()` for a hook) corrupt it.
//
// Usage: node scripts/build-wasm.mjs [--dev]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dev = process.argv.includes("--dev");
const profile = dev ? "debug" : "release";

const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit" });

run("cargo", ["build", "-p", "foton-wasm", "--target", "wasm32-unknown-unknown", ...(dev ? [] : ["--release"])]);

const out = join(root, "target/wasm-bindgen");
rmSync(out, { recursive: true, force: true });
run("wasm-bindgen", [
  join(root, `target/wasm32-unknown-unknown/${profile}/foton_wasm.wasm`),
  "--target", "web",
  "--omit-default-module-path",
  "--out-dir", out,
  ...(dev ? ["--debug", "--keep-debug"] : []),
]);

const wasm = readFileSync(join(out, "foton_wasm_bg.wasm"));
const glue = readFileSync(join(out, "foton_wasm.js"));
const hash = createHash("sha256").update(wasm).update(glue).digest("hex").slice(0, 12);

const publicDir = join(root, "apps/web/public/engine");
rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });
writeFileSync(join(publicDir, `foton_wasm.${hash}.wasm`), wasm);
writeFileSync(join(publicDir, `foton_wasm.${hash}.js`), glue);

// Write pkg/ in place rather than deleting it, so a running dev server's watcher stays happy.
const pkg = join(root, "packages/engine/pkg");
mkdirSync(pkg, { recursive: true });
writeFileSync(join(pkg, "foton_wasm.d.ts"), readFileSync(join(out, "foton_wasm.d.ts")));
writeFileSync(
  join(pkg, "asset.js"),
  `export const wasmPath = "/engine/foton_wasm.${hash}.wasm";\nexport const gluePath = "/engine/foton_wasm.${hash}.js";\n`,
);
writeFileSync(join(pkg, "asset.d.ts"), "export declare const wasmPath: string;\nexport declare const gluePath: string;\n");

console.log(`engine: ${hash} (${(wasm.length / 1024).toFixed(0)} KiB wasm, ${profile})`);
