/**
 * Pan / zoom / fit for the SVG preview — a tiny zero-dependency controller.
 *
 * Why a CSS-transform wrapper instead of a library (e.g. svg-pan-zoom): the
 * preview SVG is replaced wholesale on every recompile (`showSvgInStage` swaps the stage's child),
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

/**
 * The transform that draws `contentW`-wide content on the screen rect `was` (its left, top and
 * width), for a viewport whose screen origin is `(vx, vy)`: where the drawing WAS, in the viewport's
 * new box. The FLIP start of a glide after the stage changed size (pan-zoom `refitFrom`).
 */
export function transformForRect(
  was: { left: number; top: number; width: number },
  vx: number,
  vy: number,
  contentW: number,
): ViewTransform | null {
  if (!contentW || !(was.width > 0)) return null;
  return { scale: clampScale(was.width / contentW), tx: was.left - vx, ty: was.top - vy };
}

/** The pan/zoom controller returned by {@link createPanZoom}. */
export interface PanZoom {
  fit(): void;
  reset(): void;
  setContent(w: number, h: number, refit: boolean): void;
  zoomIn(): void;
  zoomOut(): void;
  /** The buttons' zoom and fit: the same moves, glided (`.pz-glide-*`, panels.css). */
  glideIn(): void;
  glideOut(): void;
  glideFit(): void;
  /** The stage is about to change size (Source, the shared strip): where the drawing is now. */
  rectBefore(): DOMRect | null;
  /** After it did: start the drawing where it was (`rectBefore`) and glide it to its fitted place
   *  (or, once the visitor has panned or zoomed, keep it where it was on screen). */
  refitFrom(was: DOMRect | null): void;
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

  // ---- glides (the buttons, a stage that changed size) ----
  // A glide is a CSS transition on the stage's transform (`.pz-glide-fast` / `.pz-glide-base`).
  // The hand always wins: a wheel or a press mid-glide reads where the drawing is on screen into
  // the view state and drops the class, so the pan or zoom goes on from there. Wheel, drag and
  // pinch themselves never glide. No glide under reduced motion.
  const GLIDES = ["pz-glide-fast", "pz-glide-base"];
  const reduced = () =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches === true;
  let gliding = false;
  const glide = (cls: string) => {
    if (reduced()) return;
    stage.classList.remove(...GLIDES);
    stage.classList.add(cls);
    gliding = true;
  };
  const settle = () => {
    if (!gliding) return;
    gliding = false;
    if (typeof getComputedStyle === "function" && typeof DOMMatrix === "function") {
      const m = new DOMMatrix(getComputedStyle(stage).transform);
      if (m.a > 0) {
        scale = m.a;
        tx = m.e;
        ty = m.f;
      }
    }
    stage.classList.remove(...GLIDES);
    apply();
  };
  stage.addEventListener?.("transitionend", (e) => {
    if (e.target !== stage || e.propertyName !== "transform") return;
    gliding = false;
    stage.classList.remove(...GLIDES);
  });

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
      // The knobs and Checks panels scroll their own lists; the drawing does not zoom under them.
      if ((e.target as Element | null)?.closest(".knobs, .checks")) return;
      e.preventDefault();
      settle();
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
    if ((e.target as Element | null)?.closest(".pz-toolbar, .room-card, .room-index, .knobs, .checks")) return;
    settle();
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
    if (refit) {
      // A new plan lands in its place at once: settle any glide first (no move from the old one).
      settle();
      fit();
    } else apply();
  };

  const svgRect = (): DOMRect | null => {
    const r = stage.querySelector?.("svg")?.getBoundingClientRect();
    return r && r.width > 0 ? r : null;
  };

  return {
    fit,
    reset: fit,
    setContent,
    zoomIn: () => zoomCenter(1.25),
    zoomOut: () => zoomCenter(0.8),
    glideIn: () => {
      glide("pz-glide-fast");
      zoomCenter(1.25);
    },
    glideOut: () => {
      glide("pz-glide-fast");
      zoomCenter(0.8);
    },
    glideFit: () => {
      glide("pz-glide-base");
      fit();
    },
    rectBefore: () => (reduced() ? null : svgRect()),
    refitFrom(was) {
      if (!was || !viewport.clientWidth || !viewport.clientHeight) return;
      settle();
      const vr = viewport.getBoundingClientRect();
      const start = transformForRect(was, vr.left, vr.top, contentW);
      if (!start) return;
      const keep = userAdjusted;
      scale = start.scale;
      tx = start.tx;
      ty = start.ty;
      apply(); // where it was, with no transition
      if (keep) return; // a panned or zoomed view stays where the visitor put it on screen
      void stage.offsetWidth; // the start is drawn before the glide begins
      glide("pz-glide-base");
      fit();
    },
  };
}
