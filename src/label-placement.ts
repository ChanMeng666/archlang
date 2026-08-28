/**
 * Obstacle-aware relocation of room labels — a **post-pass over the lowered Scene**.
 *
 * A room's label used to be placed at a purely geometric anchor (`roomLabelAnchor`:
 * the rectangle's centre, the circle's centre, the polygon's centroid or its pole of
 * inaccessibility) with **no knowledge of what else is drawn there**. That anchor is the
 * right answer for an empty room and the wrong one the moment a bed, a door swing, a
 * wall or a dimension number stands on it.
 *
 * ### Why this is a post-pass and not an element rule
 *
 * `RenderCtx` (`src/registry.ts`) hands an element its theme, sizes, bounds, `fmt` and
 * `openingsVoided` — and nothing about its siblings. That is deliberate: it is the
 * plugin contract for all eleven elements, and widening it so `room.render` could see
 * the rest of the drawing would make every element author reason about draw order.
 *
 * So the decision is made here instead, in `toScene`, **after** the walls are lowered and
 * **after** `dims auto` has been rendered. That ordering is the whole point: a dimension
 * number is not an element, it is text synthesized during lowering, and only a pass that
 * runs after it exists can keep a room label off it.
 *
 * ### Conservative by construction
 *
 * A label is relocated **only when its text box actually collides** — more than
 * {@link COLLIDE_MIN} of its own area buried in an obstacle or an already-placed label.
 * A plan whose labels are clear is not searched at all and its bytes are unchanged,
 * which is the property every drawing shipped before this pass relies on.
 *
 * ### Determinism
 *
 * Candidates are visited in one fixed order — the incumbent anchor **first**, then a 7×7
 * lattice of bounding-box fractions — and only a **strictly** better score displaces the
 * incumbent. Same rule as {@link import("./geometry/polygon.js").polygonLabelPoint}: no
 * float comparison picks a winner among equals, so a tie always keeps the label where it
 * was. Pure arithmetic, one pass, no iteration to a tolerance.
 *
 * Prior art: planscript-rust's `best_area_label_candidate` / `label_score`
 * (`src/exporters.rs`, MIT) — the candidate lattice, the distance-from-centre preference
 * and the three-tier penalty ladder are its shape. Two deliberate departures: its
 * `min_by` keeps the first minimum among *sorted-by-score* equals where ours keeps the
 * incumbent outright, and its overlap penalties are raw pixel areas where ours are
 * **fractions of the label's own area** — ArchLang draws in millimetres over plans
 * spanning 7 m to 60 m, so a raw-area weight would mean something different on every
 * drawing. Its `estimate_text_width` is not borrowed: widths here go through the one
 * shared {@link textWidth}, the same estimate `W_DIM_OVERLAP` and the `dims auto` number
 * stagger measure with, so all three agree about what collides.
 */

import type { Point } from "./ast.js";
import { segmentRectangle, segmentsOfWall } from "./geometry.js";
import { arcTessellate } from "./geometry/arc.js";
import type { BBox } from "./geometry/rect.js";
import { overlap1d } from "./geometry/rect.js";
import { pointInPolygon, polygonBounds, rectInsidePolygon, rectRing } from "./geometry/polygon.js";
import { roomLabelAnchor } from "./elements/room.js";
import { ROOF_LAYER } from "./elements/roof.js";
import { OUTDOOR_LAYERS } from "./elements/outdoor.js";
import type { ResolvedPlan, RRoom } from "./ir.js";
import type { RenderSizes, SceneNode, ScenePrim } from "./scene.js";
import { textWidth } from "./text-metrics.js";

/**
 * The node range one room element contributed to the Scene. `toScene` records it while
 * it lowers the elements — the exact, order-independent alternative to matching text
 * nodes back to rooms by coordinate (two rooms can share an anchor).
 */
export interface RoomLabelGroup {
  room: RRoom;
  /** Index of the room's first node in the Scene's node list. */
  from: number;
  /** Index one past its last. */
  to: number;
}

/**
 * Clearance added around every obstacle, as a fraction of the room-label size. At the
 * default `roomFont` this is ≈0.45% of the drawing's reference dimension — the same
 * relative breathing room planscript-rust's 2–3 px gives on an 800 px canvas.
 */
export const CLEARANCE = 0.15;

/**
 * How much of a label's own area must be buried before the label is moved at all: 2% of
 * its own box. This is the **trigger**, and it is the only thing standing between a
 * shipped drawing and churn — a plan whose labels clear this bar is never searched and
 * keeps its exact bytes.
 *
 * Why 2%: {@link textWidth} is a deliberately generous estimate (over-estimating costs a
 * millimetre of clearance, under-estimating costs overprinted ink), so the outer few
 * percent of a label's box is the estimate's own slack, not glyphs. Below 2% there is
 * very likely no ink overlap at all, and moving the name would be a bigger change to the
 * drawing than the thing it claims to fix. Above it there is real overprint: every
 * relocation this threshold admits across the shipped examples is a room name sitting on
 * a furniture rectangle or inside a door's swing.
 *
 * The threshold decides only **whether** to move. Where to move is then the ordinary
 * continuous score, in which fully clear beats nearly clear — otherwise a label could
 * settle a hair off the bed it was told to get off.
 */
export const COLLIDE_MIN = 0.02;

/** Bounding-box fractions the candidate lattice samples, in visit order. */
export const FRACTIONS = [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9] as const;

/** Score weight: the text box does not fit wholly on its own floor. */
const W_OUTSIDE = 100;
/** Score weight per unit of area-fraction buried in drawn geometry. */
const W_OBSTACLE = 250;
/** Score weight per unit of area-fraction buried in an already-placed room label. */
const W_PLACED = 10_000;
/** How far a candidate may be preferred away from the anchor (planscript's `·4`). */
const W_DISTANCE = 4;

/** Bounding box of a point set (empty → null). */
function bboxOfPoints(pts: readonly Point[]): BBox | null {
  if (pts.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** The rect grown by `d` on every side. */
function inflate(b: BBox, d: number): BBox {
  return { x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d };
}

/** The smallest rect containing both. */
function unionBBox(a: BBox, b: BBox): BBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** The rect translated by (dx, dy). */
function shiftBBox(b: BBox, dx: number, dy: number): BBox {
  return { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h };
}

/** Overlapping area of two axis-aligned rects (mm²; 0 when disjoint). */
function overlapArea(a: BBox, b: BBox): number {
  return overlap1d(a.x, a.x + a.w, b.x, b.x + b.w) * overlap1d(a.y, a.y + a.h, b.y, b.y + b.h);
}

/**
 * Axis-aligned extent of one drawn primitive — what a label has to stay off — or `null`
 * for a primitive this pass deliberately does not treat as an obstacle.
 *
 * **A `line` is not an obstacle.** It encloses no area, so the area-overlap metric this
 * pass is built on cannot say anything true about one: all it can offer is the line's
 * bounding box, which for a diagonal is enormously bigger than the ink (the aquarium's
 * `R12000` leader boxes 8.5 × 8.5 m of empty cafe floor). Nothing is lost by declining,
 * because every line in a drawing is either backed by an area obstacle that IS measured
 * — a wall face by its wall band, a door leaf by its swing arc, a window pane by its
 * host wall — or is a hairline annotation (a dimension line, an axis datum) a room name
 * may legitimately cross.
 *
 * A `region`/`hatch` is the unioned wall solid, whose bounding box is the whole
 * building; those are never asked about here (the caller substitutes per-segment wall
 * rectangles instead). An `arc` is bounded by its endpoints, its centre and its
 * midpoint, which is exactly a door swing's quarter-disc box. Rotated text is boxed by
 * the exact axis-aligned extent of the turned rectangle.
 */
function primBBox(prim: ScenePrim): BBox | null {
  switch (prim.t) {
    case "polygon":
      return bboxOfPoints(prim.pts);
    case "line":
      return null;
    case "region":
      return bboxOfPoints(prim.loops.flat());
    // Like `region`, a `path` is the unioned wall solid and is never asked about here
    // (the caller substitutes per-segment wall rectangles). Boxed by its vertices plus
    // each arc's MIDPOINT, so a bulge is not lost if it ever is asked.
    case "path": {
      const pts: Point[] = [];
      for (const lp of prim.loops) {
        let from = lp.start;
        pts.push(from);
        for (const e of lp.edges) {
          pts.push(e.to);
          if (e.t === "arc") {
            const mx = from.x + e.to.x - 2 * e.center.x;
            const my = from.y + e.to.y - 2 * e.center.y;
            const len = Math.hypot(mx, my);
            if (len > 0) pts.push({ x: e.center.x + (mx / len) * e.r, y: e.center.y + (my / len) * e.r });
          }
          from = e.to;
        }
      }
      return bboxOfPoints(pts);
    }
    case "hatch":
      return bboxOfPoints(prim.region.flat());
    case "circle":
      return { x: prim.center.x - prim.r, y: prim.center.y - prim.r, w: 2 * prim.r, h: 2 * prim.r };
    case "arc": {
      const ax = prim.start.x - prim.center.x;
      const ay = prim.start.y - prim.center.y;
      const bx = prim.end.x - prim.center.x;
      const by = prim.end.y - prim.center.y;
      const mx = ax + bx;
      const my = ay + by;
      const len = Math.hypot(mx, my);
      const mid: Point =
        len === 0 ? prim.start : { x: prim.center.x + (mx / len) * prim.r, y: prim.center.y + (my / len) * prim.r };
      return bboxOfPoints([prim.start, prim.end, prim.center, mid]);
    }
    case "text": {
      const w = textWidth(prim.value, prim.size);
      const h = prim.size;
      const rot = ((prim.rotate ?? 0) * Math.PI) / 180;
      const c = Math.abs(Math.cos(rot));
      const s = Math.abs(Math.sin(rot));
      const bw = w * c + h * s;
      const bh = w * s + h * c;
      return { x: prim.at.x - bw / 2, y: prim.at.y - bh / 2, w: bw, h: bh };
    }
  }
}

/** Fraction of `rect`'s own area buried in any of `boxes` (summed, so a doubly-covered
 *  patch counts twice — exactly what makes a crowded spot score worse than a busy one). */
function buried(rect: BBox, boxes: readonly BBox[]): number {
  const area = rect.w * rect.h;
  if (!(area > 0)) return 0;
  let sum = 0;
  for (const b of boxes) sum += overlapArea(rect, b);
  return sum / area;
}

/** How badly a text box at `rect` is crowded: what it is buried in, weighted. Drawn
 *  geometry is bad; another room's already-placed name is 40× worse, because two names
 *  on top of each other is the one failure a reader cannot decode. */
function crowding(rect: BBox, obstacles: readonly BBox[], placed: readonly BBox[]): number {
  return W_OBSTACLE * buried(rect, obstacles) + W_PLACED * buried(rect, placed);
}

/** The ring a room's label must sit on: its own polygon, or its rectangle's corners. */
function roomRing(r: RRoom): Point[] {
  return r.poly ?? rectRing({ x: r.at.x, y: r.at.y, w: r.size.w, h: r.size.h });
}

/**
 * Move each room's label + area text off whatever is drawn under it.
 *
 * Mutates `nodes` in place (replacing, never editing, the text nodes it moves), which is
 * safe: every node in the list was freshly built by this `toScene` call. Rooms are
 * visited in element order and each placed label becomes an obstacle for the next, so
 * two labels can never be relocated onto each other.
 */
export function relocateRoomLabels(
  nodes: SceneNode[],
  groups: readonly RoomLabelGroup[],
  ir: ResolvedPlan,
  sizes: RenderSizes,
): void {
  if (groups.length === 0) return;
  const clear = sizes.roomFont * CLEARANCE;

  // Nodes a room contributed are not obstacles to their own room; the label text is
  // tracked as a sequentially-placed rect below, and the floor fill is what the label
  // sits ON.
  const own = new Set<number>();
  for (const g of groups) for (let i = g.from; i < g.to; i++) own.add(i);

  const obstacles: BBox[] = [];
  // Walls come from the IR, per segment. The lowered wall nodes are a UNIONED region
  // whose bounding box is the entire building — true, useless, and it would make every
  // label in the plan read as colliding.
  for (const w of ir.walls) {
    for (const s of segmentsOfWall(w)) {
      // A CURVED edge is banded along its own tessellation rather than boxed whole: one
      // box round a quarter arc would claim the entire square it turns through, most of
      // which is the room the label is trying to sit in.
      const run = s.arc ? arcTessellate(s.arc) : [s.a, s.b];
      for (let k = 0; k + 1 < run.length; k++) {
        const b = bboxOfPoints(segmentRectangle(run[k]!, run[k + 1]!, s.thickness));
        if (b) obstacles.push(inflate(b, clear));
      }
    }
  }
  // Everything else that is already drawn: furniture and its labels, door leaves and
  // swings, window panes, opening covers, stair/elevator symbols, axis bubbles and —
  // the reason this pass runs where it does — the `dims auto` numbers. `floor` is what
  // a label sits on, and the wall passes were handled above.
  for (let i = 0; i < nodes.length; i++) {
    if (own.has(i)) continue;
    const n = nodes[i]!;
    if (n.layer === "floor" || n.layer === "wallFill" || n.layer === "wallFace") continue;
    // A roof outline is the same trap as the unioned wall region above: its bounding box
    // is the whole building plus the eaves, so treating it as an obstacle would bury every
    // label in the plan at once and set the relocation pass loose on all of them. It is
    // also nothing a label collides WITH — an overhang is drawn above the plane the names
    // are written on.
    if (n.layerName === ROOF_LAYER) continue;
    // The same argument, for the same reason, for the ground (v1.31). A `fence` node's
    // bounding box is its whole run — often the entire site — and a balcony's rail ticks
    // sit outside the building; neither is something a room name can collide with, and
    // treating either as an obstacle would set the relocation pass loose on every label
    // in the plan. The surfaces themselves ride the `floor` pass and are already skipped
    // above; this catches the rails and the fences, which ride `furniture`.
    //
    // Note what is NOT skipped: an `outdoor` LABEL, which rides `labels` like a room's.
    // Two names printed on top of each other is exactly the collision this pass exists
    // for, so a room label does move off a terrace's name.
    if (n.layer !== "labels" && n.layerName !== undefined && OUTDOOR_LAYERS.includes(n.layerName)) continue;
    const b = primBBox(n.prim);
    if (b) obstacles.push(inflate(b, clear));
  }

  const placed: BBox[] = [];
  for (const g of groups) {
    const texts: number[] = [];
    for (let i = g.from; i < g.to; i++) {
      const n = nodes[i]!;
      if (n.layer === "labels" && n.prim.t === "text") texts.push(i);
    }
    if (texts.length === 0) continue;
    let rect0: BBox | null = null;
    for (const i of texts) {
      const b = primBBox(nodes[i]!.prim);
      if (b) rect0 = rect0 ? unionBBox(rect0, b) : b;
    }
    if (!rect0) continue;

    // An explicit `label "…" at (x,y)` is the author's decision and is never overruled —
    // it is also the anchor `W_ROOM_LABEL_OUTSIDE` reports on, so moving it would make
    // that diagnostic describe a position nothing is drawn at.
    if (g.room.labelAt) {
      placed.push(rect0);
      continue;
    }

    if (buried(rect0, obstacles) + buried(rect0, placed) <= COLLIDE_MIN) {
      placed.push(rect0);
      continue;
    }

    const ring = roomRing(g.room);
    const anchor = roomLabelAnchor(g.room);
    const bb = polygonBounds(ring);
    const diag = Math.max(1, Math.hypot(bb.w, bb.h));
    const score = (p: Point, preference: number): number => {
      const rect = shiftBBox(rect0, p.x - anchor.x, p.y - anchor.y);
      return preference + (rectInsidePolygon(rect, ring) ? 0 : W_OUTSIDE) + crowding(rect, obstacles, placed);
    };

    // The incumbent is candidate zero and carries preference 0, so it wins every tie.
    let best = anchor;
    let bestScore = score(anchor, 0);
    for (const fy of FRACTIONS) {
      for (const fx of FRACTIONS) {
        const p: Point = { x: bb.x + bb.w * fx, y: bb.y + bb.h * fy };
        if (!pointInPolygon(p.x, p.y, ring)) continue;
        const s = score(p, 1 + (Math.hypot(p.x - anchor.x, p.y - anchor.y) / diag) * W_DISTANCE);
        if (s < bestScore) {
          bestScore = s;
          best = p;
        }
      }
    }

    const dx = best.x - anchor.x;
    const dy = best.y - anchor.y;
    if (dx !== 0 || dy !== 0) {
      for (const i of texts) {
        const n = nodes[i]!;
        if (n.prim.t !== "text") continue;
        nodes[i] = { ...n, prim: { ...n.prim, at: { x: n.prim.at.x + dx, y: n.prim.at.y + dy } } };
      }
    }
    placed.push(shiftBBox(rect0, dx, dy));
  }
}
