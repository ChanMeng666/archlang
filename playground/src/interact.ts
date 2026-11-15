/**
 * Preview interactions on top of the SVG:
 *   - hover a room → tooltip with its name, area and size (C2, room-facts.ts `roomTip`),
 *     hit-tested against describe()'s room shapes (`floor_circle`, `floor_polygon`);
 *   - click a room → its facts card (room-card.ts), or close it on a click off every room;
 *   - click any drawn element → jump the editor caret to the source that produced it
 *     (C3), using the `data-span` attributes emitted by `compile(..., { annotate:true })`.
 *
 * Coordinate mapping uses the SVG's own `getScreenCTM().inverse()`, which folds in
 * the pan/zoom CSS transform and the viewBox — so screen px map straight to plan mm
 * (the SVG user space), matching describe()'s coordinates.
 */
import { type FactsRoom, roomTip } from "./room-facts.js";

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
type PreviewRoom = FactsRoom;

/** What the hit test reads of a room: describe()'s shape, with the box as the fallback. */
export interface HitShape {
  bbox: HitBox;
  /** The floor ring (describe()'s `floor_polygon`); `[]` for a circular room. */
  floor_polygon?: readonly { x: number; y: number }[];
  /** A circular room's exact circle (describe()'s `floor_circle`). */
  floor_circle?: { cx: number; cy: number; r: number };
}

/** On-edge slack in plan mm, so a ring vertex computed in floating point still counts as on its edge. */
const EDGE_EPS = 1e-6;

/** Is `(x,y)` on the segment `a`–`b` (within {@link EDGE_EPS})? */
function onSegment(a: { x: number; y: number }, b: { x: number; y: number }, x: number, y: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(x - a.x, y - a.y) <= EDGE_EPS;
  // Distance from the line, then the projection inside the segment.
  if (Math.abs(dx * (y - a.y) - dy * (x - a.x)) / len > EDGE_EPS) return false;
  const t = ((x - a.x) * dx + (y - a.y) * dy) / (len * len);
  return t >= -EDGE_EPS / len && t <= 1 + EDGE_EPS / len;
}

/** Is `(x,y)` inside the ring or on its boundary (even-odd rule)? */
function inRing(ring: readonly { x: number; y: number }[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!;
    const b = ring[i]!;
    if (onSegment(a, b, x, y)) return true;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Does the room's shape (its circle, else its ring, else its box) contain `(x,y)`, boundary inclusive? */
function contains(s: HitShape, x: number, y: number): boolean {
  const b = s.bbox;
  if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) return false;
  const c = s.floor_circle;
  if (c) return (x - c.cx) ** 2 + (y - c.cy) ** 2 <= c.r ** 2;
  const ring = s.floor_polygon;
  if (ring && ring.length >= 3) return inRing(ring, x, y);
  return true;
}

/** The size the smallest-room rule compares: the shape's area, else the box's. */
function sizeOf(s: HitShape): number {
  const c = s.floor_circle;
  if (c) return Math.PI * c.r * c.r;
  const ring = s.floor_polygon;
  if (ring && ring.length >= 3) {
    let twice = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      twice += ring[j]!.x * ring[i]!.y - ring[i]!.x * ring[j]!.y;
    }
    return Math.abs(twice) / 2;
  }
  return s.bbox.w * s.bbox.h;
}

/**
 * Hit-test `(x,y)` against `items` and return the SMALLEST room whose SHAPE
 * contains it, or null. The shape is describe()'s `floor_circle`, else its
 * `floor_polygon` ring, else (an item carrying neither) its `bbox`; the boundary
 * is inside, so a wall-edge hover still hits its room. A point inside an L's or a
 * trapezoid's box but outside the room picks nothing of it. Rooms can nest (a
 * bathroom inside a suite) or overlap, and the innermost one — the smallest by
 * shape area — is the one the pointer means.
 *
 * Ties (two containing rooms of equal area) resolve to the EARLIER item — the
 * comparison is a strict `<`, so nothing later can displace an equal-area
 * incumbent. That makes the result a deterministic function of describe()'s room
 * order, not of floating-point luck.
 */
export function pickSmallestContaining<T extends HitShape>(items: readonly T[], x: number, y: number): T | null {
  let hit: T | null = null;
  let hitSize = 0;
  for (const item of items) {
    if (!contains(item, x, y)) continue;
    const size = sizeOf(item);
    if (!hit || size < hitSize) {
      hit = item;
      hitSize = size;
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
  /** A click on the drawing: the room under it, or `null` off every room (the facts card). */
  onRoomClick: (room: PreviewRoom | null) => void;
}

/** Floating controls over the drawing that are not the drawing: no tooltip, no click-through. */
const OVERLAY = ".pz-toolbar, .room-card, .knobs, .checks";

export function mountInteract({ viewport, stage, getRooms, jumpToOffset, onRoomClick }: InteractOpts): void {
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
    if ((e.target as Element | null)?.closest(OVERLAY)) return hide();
    const u = toUser(e.clientX, e.clientY);
    const room = u && roomAt(u);
    if (!room) return hide();
    tip.textContent = roomTip(room);
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
    // The toolbar and the card are not the drawing. (Their pointerdown is not captured by the
    // pan/zoom controller, so the click's target is theirs.)
    if ((e.target as Element | null)?.closest(OVERLAY)) return;
    const u = toUser(e.clientX, e.clientY);
    onRoomClick(u && roomAt(u));
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
