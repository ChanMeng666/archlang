/**
 * Preview interactions on top of the SVG:
 *   - hover a room → tooltip with its label, area and bounding size (C2), hit-tested
 *     geometrically against describe()'s room bboxes;
 *   - click any drawn element → jump the editor caret to the source that produced it
 *     (C3), using the `data-span` attributes emitted by `compile(..., { annotate:true })`.
 *
 * Coordinate mapping uses the SVG's own `getScreenCTM().inverse()`, which folds in
 * the pan/zoom CSS transform and the viewBox — so screen px map straight to plan mm
 * (the SVG user space), matching the bbox coordinates.
 */

/** px of pointer travel that reclassifies a click as a pan (inclusive: exactly
 *  DRAG_SLOP px of travel is still a click). */
export const DRAG_SLOP = 6;

/** An axis-aligned box in SVG user space (= plan mm). */
export interface HitBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The subset of a describe() room this module hit-tests and labels. */
interface PreviewRoom {
  id: string;
  label?: string;
  area_m2: number;
  bbox: HitBox;
}

/**
 * Hit-test `(x,y)` against `items` and return the SMALLEST box containing it, or
 * null. Rooms can nest (a bathroom inside a suite) or overlap, and the innermost
 * one is the one the pointer means.
 *
 * Ties (two containing boxes of equal area) resolve to the EARLIER item — the
 * comparison is a strict `<`, so nothing later can displace an equal-area
 * incumbent. That makes the result a deterministic function of describe()'s room
 * order, not of floating-point luck.
 */
export function pickSmallestContaining<T extends { bbox: HitBox }>(
  items: readonly T[],
  x: number,
  y: number,
): T | null {
  let hit: T | null = null;
  for (const item of items) {
    const b = item.bbox;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      // Prefer the smallest containing room (handles nested/overlapping bboxes).
      if (!hit || b.w * b.h < hit.bbox.w * hit.bbox.h) hit = item;
    }
  }
  return hit;
}

/**
 * Did the pointer travel far enough between `down` and `(x,y)` that the click
 * should be read as the end of a pan rather than a click-to-source? Travel of
 * exactly {@link DRAG_SLOP} px is still a click — the threshold is exclusive.
 */
export function isDragNotClick(down: { x: number; y: number } | null, x: number, y: number): boolean {
  return down != null && Math.hypot(x - down.x, y - down.y) > DRAG_SLOP;
}

interface InteractOpts {
  viewport: HTMLElement;
  stage: HTMLElement;
  getRooms: () => readonly PreviewRoom[];
  jumpToOffset: (offset: number) => void;
}

export function mountInteract({ viewport, stage, getRooms, jumpToOffset }: InteractOpts): void {
  const tip = document.createElement("div");
  tip.className = "room-tip";
  tip.hidden = true;
  viewport.appendChild(tip);

  const svgEl = () => stage.querySelector("svg");

  // Map a screen point to SVG user space (= plan mm). Returns null if unavailable.
  function toUser(clientX: number, clientY: number): DOMPoint | null {
    const svg = svgEl();
    const ctm = svg?.getScreenCTM();
    if (!ctm || !svg) return null;
    const p = svg.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    return p.matrixTransform(ctm.inverse());
  }

  const roomAt = (u: DOMPoint): PreviewRoom | null => pickSmallestContaining(getRooms(), u.x, u.y);

  const hide = () => {
    tip.hidden = true;
  };

  viewport.addEventListener("pointermove", (e) => {
    if (e.buttons) return hide(); // a button is down → panning/pinching, not hovering
    const u = toUser(e.clientX, e.clientY);
    const room = u && roomAt(u);
    if (!room) return hide();
    const b = room.bbox;
    const name = room.label || room.id;
    tip.textContent = `${name} · ${room.area_m2} m² · ${Math.round(b.w)}×${Math.round(b.h)} mm`;
    const vp = viewport.getBoundingClientRect();
    let x = e.clientX - vp.left + 14;
    let y = e.clientY - vp.top + 14;
    tip.hidden = false;
    // Clamp inside the viewport (measure after unhiding).
    x = Math.min(x, viewport.clientWidth - tip.offsetWidth - 6);
    y = Math.min(y, viewport.clientHeight - tip.offsetHeight - 6);
    tip.style.left = `${Math.max(6, x)}px`;
    tip.style.top = `${Math.max(6, y)}px`;
  });
  viewport.addEventListener("pointerleave", hide);

  // Click-to-source: ignore clicks that were really pans, then read the nearest
  // annotated element's span.
  let down: { x: number; y: number } | null = null;
  viewport.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY };
  });
  viewport.addEventListener("click", (e) => {
    if (isDragNotClick(down, e.clientX, e.clientY)) return;
    // Hit-test the POINT, not `e.target`.
    //
    // The pan/zoom controller calls `viewport.setPointerCapture()` on
    // pointerdown, which retargets the pointerup to the viewport — and a click's
    // target is the nearest common ancestor of its pointerdown/pointerup targets,
    // so `e.target` was ALWAYS the viewport <div> and `closest("[data-span]")`
    // ALWAYS null. Click-to-source silently never fired with a real mouse; a
    // Playwright spec caught it (`panels.spec.ts`). `elementFromPoint` is
    // capture-independent, and `.room-tip` is `pointer-events: none`, so the
    // tooltip can never shadow the drawing.
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-span]");
    if (!el) return;
    const start = Number(el.getAttribute("data-span")!.split(":")[0]);
    if (Number.isFinite(start)) jumpToOffset(start);
  });
}
