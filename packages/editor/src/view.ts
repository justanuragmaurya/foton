import type { ViewTransform } from "@foton/engine";

/** Zoom presets stepped through by Zoom In / Zoom Out (1 = 100%, one document pixel per device pixel). */
export const ZOOM_STEPS = [
  0.01, 0.02, 0.03, 0.04, 0.05, 0.0625, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667,
  1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 32,
];
export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

/** Canvas viewport size in device pixels. */
export interface Viewport {
  width: number;
  height: number;
}

const FIT_MARGIN = 0.92;

export function fitView(viewport: Viewport, docWidth: number, docHeight: number, allowUpscale: boolean): ViewTransform {
  let zoom = Math.min((viewport.width * FIT_MARGIN) / docWidth, (viewport.height * FIT_MARGIN) / docHeight);
  if (!allowUpscale) zoom = Math.min(zoom, 1);
  return centered(viewport, docWidth, docHeight, clampZoom(zoom));
}

export function centered(viewport: Viewport, docWidth: number, docHeight: number, zoom: number): ViewTransform {
  return {
    zoom,
    originX: Math.round((viewport.width - docWidth * zoom) / 2),
    originY: Math.round((viewport.height - docHeight * zoom) / 2),
  };
}

/** Zooms to `zoom` while keeping the document point under `anchor` (device px) fixed. */
export function zoomAround(view: ViewTransform, zoom: number, anchorX: number, anchorY: number): ViewTransform {
  const next = clampZoom(zoom);
  const ratio = next / view.zoom;
  return {
    zoom: next,
    originX: anchorX - (anchorX - view.originX) * ratio,
    originY: anchorY - (anchorY - view.originY) * ratio,
  };
}

export function nextZoomStep(zoom: number, direction: 1 | -1): number {
  const epsilon = 1e-4;
  if (direction > 0) return ZOOM_STEPS.find((z) => z > zoom + epsilon) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((z) => z < zoom - epsilon) ?? MIN_ZOOM;
}

export function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function formatZoom(zoom: number) {
  const percent = zoom * 100;
  return `${percent >= 10 ? Math.round(percent * 10) / 10 : Math.round(percent * 100) / 100}%`;
}
