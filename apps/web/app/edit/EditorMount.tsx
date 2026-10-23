"use client";

import dynamic from "next/dynamic";

// The editor drives a GPU worker and OffscreenCanvas, so it only ever renders in the browser.
const Editor = dynamic(() => import("@foton/editor").then((m) => m.Editor), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-ink-muted">Loading Foton…</div>,
});

export function EditorMount() {
  return <Editor />;
}
