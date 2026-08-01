/**
 * Pan / zoom / fit for the SVG preview — a tiny zero-dependency controller.
 *
 * Why a CSS-transform wrapper instead of a library (e.g. svg-pan-zoom): the
 * preview SVG is replaced wholesale on every recompile (`stage.innerHTML = svg`),
 * and a library that owns the <svg> node would have to be torn down and
 * re-instantiated each keystroke. Driving a persistent wrapper's `transform`
 * keeps the view state (scale + translation) decoupled from the document, so it
 * survives re-renders for free and stays GPU-accelerated. Fits the no-CDN ethos.
 */

export const MIN_SCALE = 0.01;
export const MAX_SCALE = 40;
export const FIT_PAD = 0.94; // leave a little breathing room around a fitted plan

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// The view maths, extracted as pure functions.
//
// The controller below is a closure over live DOM + mutable view state, which is
// untestable outside a browser. These three functions are the whole of its
// arithmetic, so the closure is reduced to "read the DOM → call one of these →
// write the state back", and the geometry gets unit-tested in Node.
// ---------------------------------------------------------------------------

/** A CSS-transform view state: `translate(tx,ty) scale(scale)`. */
export interface ViewTransform {
  scale: number;
  tx: number;
  ty: number;
}

/** Clamp a scale into the controller's zoom range. */
export function clampScale(scale: number): number {
  return clamp(scale, MIN_SCALE, MAX_SCALE);
}

/**
 * The transform that centres `contentW × contentH` inside a `vw × vh` viewport at
 * the largest scale that fits (times {@link FIT_PAD}).
 *
 * Returns `null` for a degenerate input — a zero-size viewport or zero-size
 * content — which is what keeps a not-yet-laid-out container from writing
 * `NaN`/`Infinity` into the transform.
 */
export function fitTransform(vw: number, vh: number, contentW: number, contentH: number): ViewTransform | null {
  if (!contentW || !contentH || !vw || !vh) return null;
  const scale = clampScale(Math.min(vw / contentW, vh / contentH) * FIT_PAD);
  return { scale, tx: (vw - contentW * scale) / 2, ty: (vh - contentH * scale) / 2 };
}

/**
 * Zoom `view` to `nextScale` while keeping the viewport point `(px,py)` over the
 * same content point — the invariant every wheel/pinch zoom is judged by.
 */
export function zoomAtTransform(view: ViewTransform, nextScale: number, px: number, py: number): ViewTransform {
  const scale = clampScale(nextScale);
  const cx = (px - view.tx) / view.scale;
  const cy = (py - view.ty) / view.scale;
  return { scale, tx: px - cx * scale, ty: py - cy * scale };
}

/** The pan/zoom controller returned by {@link createPanZoom}. */
export interface PanZoom {
  fit(): void;
  reset(): void;
  setContent(w: number, h: number, refit: boolean): void;
  zoomIn(): void;
  zoomOut(): void;
}

/**
 * @param viewport  the clipping box (overflow:hidden, position:relative)
 * @param stage     the transformed wrapper holding the <svg>
 */
export function createPanZoom(viewport: HTMLElement, stage: HTMLElement): PanZoom {
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let contentW = 1;
  let contentH = 1;
  let userAdjusted = false; // once the user pans/zooms, don't auto-refit on resize

  const apply = () => {
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };

  const fit = () => {
    const next = fitTransform(viewport.clientWidth, viewport.clientHeight, contentW, contentH);
    if (!next) return;
    scale = next.scale;
    tx = next.tx;
    ty = next.ty;
    userAdjusted = false;
    apply();
  };

  // Zoom keeping the point (px,py) — in viewport pixels — fixed on screen.
  const zoomAt = (nextScale: number, px: number, py: number) => {
    const next = zoomAtTransform({ scale, tx, ty }, nextScale, px, py);
    scale = next.scale;
    tx = next.tx;
    ty = next.ty;
    userAdjusted = true;
    apply();
  };

  const zoomCenter = (factor: number) => {
    zoomAt(scale * factor, viewport.clientWidth / 2, viewport.clientHeight / 2);
  };

  // ---- wheel zoom (toward the cursor) ----
  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0015);
      zoomAt(scale * factor, e.clientX - rect.left, e.clientY - rect.top);
    },
    { passive: false },
  );

  // ---- pointer drag (pan) + two-pointer pinch (zoom) ----
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchPrev: { dist: number; mx: number; my: number } | null = null;

  const onDown = (e: PointerEvent) => {
    // Ignore clicks that originate on the floating toolbar buttons.
    if ((e.target as Element | null)?.closest(".pz-toolbar")) return;
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    viewport.classList.add("pz-grabbing");
    if (pointers.size === 2) pinchPrev = null;
  };

  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId)!;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      tx += e.clientX - prev.x;
      ty += e.clientY - prev.y;
      userAdjusted = true;
      apply();
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const rect = viewport.getBoundingClientRect();
      const mx = (pts[0].x + pts[1].x) / 2 - rect.left;
      const my = (pts[0].y + pts[1].y) / 2 - rect.top;
      if (pinchPrev) {
        if (pinchPrev.dist > 0) zoomAt(scale * (dist / pinchPrev.dist), mx, my);
        tx += mx - pinchPrev.mx;
        ty += my - pinchPrev.my;
        apply();
      }
      pinchPrev = { dist, mx, my };
    }
  };

  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchPrev = null;
    if (pointers.size === 0) viewport.classList.remove("pz-grabbing");
  };

  viewport.addEventListener("pointerdown", onDown);
  viewport.addEventListener("pointermove", onMove);
  viewport.addEventListener("pointerup", onUp);
  viewport.addEventListener("pointercancel", onUp);

  // Re-fit on container resize unless the user has taken manual control.
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => {
      if (!userAdjusted) fit();
    }).observe(viewport);
  }

  /** Set the content's natural size (px); `refit` re-centres, else preserves view. */
  const setContent = (w: number, h: number, refit: boolean) => {
    contentW = w || 1;
    contentH = h || 1;
    if (refit) fit();
    else apply();
  };

  return {
    fit,
    reset: fit,
    setContent,
    zoomIn: () => zoomCenter(1.25),
    zoomOut: () => zoomCenter(0.8),
  };
}
