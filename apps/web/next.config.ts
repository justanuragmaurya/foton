import type { NextConfig } from "next";

// Cross-origin isolation unlocks SharedArrayBuffer, which WASM threads and multi-threaded
// ONNX Runtime need. It also means every cross-origin subresource (model CDN, fonts) must
// opt in with CORP/CORS headers.
const isolationHeaders = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@foton/editor", "@foton/engine"],
  async headers() {
    return [
      { source: "/:path*", headers: isolationHeaders },
      {
        source: "/engine/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
