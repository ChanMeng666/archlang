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

const DRAG_SLOP = 6; // px of pointer travel that reclassifies a click as a pan

/** The subset of a describe() room this module hit-tests and labels. */
interface PreviewRoom {
  id: string;
  label?: string;
  area_m2: number;
  bbox: { x: number; y: number; w: number; h: number };
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

  function roomAt(u: DOMPoint): PreviewRoom | null {
    let hit: PreviewRoom | null = null;
    for (const r of getRooms()) {
      const b = r.bbox;
      if (u.x >= b.x && u.x <= b.x + b.w && u.y >= b.y && u.y <= b.y + b.h) {
        // Prefer the smallest containing room (handles nested/overlapping bboxes).
        if (!hit || b.w * b.h < hit.bbox.w * hit.bbox.h) hit = r;
      }
    }
    return hit;
  }

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
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_SLOP) return;
    const el = (e.target as Element | null)?.closest("[data-span]");
    if (!el) return;
    const start = Number(el.getAttribute("data-span")!.split(":")[0]);
    if (Number.isFinite(start)) jumpToOffset(start);
  });
}
