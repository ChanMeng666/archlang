/**
 * Shared SVG-into-stage helper for the pan/zoom preview. Injects an SVG string
 * into `stage`, gives it a definite pixel size from its `viewBox` (so the stage
 * has real dimensions to fit), and hands the size to the pan/zoom controller.
 * Used by both the main playground and the chrome-less embed page.
 */
import type { PanZoom } from "./pan-zoom.js";

/** Fallback stage size for an SVG with no usable `viewBox`. */
export const DEFAULT_STAGE_SIZE = { w: 800, h: 600 } as const;

/**
 * The explicit pixel size to stamp on a compiled SVG, read from its `viewBox`.
 *
 * A compiled plan carries a `viewBox` but no `width`/`height`, so without this it
 * would size itself to whatever the (transformed, zero-height) stage happens to
 * be. Anything that isn't four numbers with a positive width AND height —
 * missing, malformed, negative, `NaN` — falls back to
 * {@link DEFAULT_STAGE_SIZE} rather than propagating a bad number into the
 * pan/zoom transform.
 */
export function sizeFromViewBox(viewBox: string | null | undefined): { w: number; h: number } {
  if (viewBox) {
    const p = viewBox.split(/[\s,]+/).map(Number);
    if (p.length === 4 && p[2] > 0 && p[3] > 0) return { w: p[2], h: p[3] };
  }
  return { w: DEFAULT_STAGE_SIZE.w, h: DEFAULT_STAGE_SIZE.h };
}

export function showSvgInStage(stage: HTMLElement, pz: PanZoom, svg: string, refit: boolean): void {
  stage.innerHTML = svg;
  const el = stage.firstElementChild;
  const { w, h } = sizeFromViewBox(el?.getAttribute("viewBox"));
  if (el) {
    el.setAttribute("width", String(w));
    el.setAttribute("height", String(h));
  }
  pz.setContent(w, h, refit);
}
