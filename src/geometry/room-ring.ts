/**
 * The room-ring seam: what a room's FLOOR is, read through one place (card ARC2-seam,
 * `docs/plans/arc2-room-arcs.md`).
 *
 * A room carries up to three views of one floor (the circle precedent, `resolveCircle` in
 * `src/elements/room.ts`): its exact shape (`circle`, the authored ring), the DISCRETISED ring
 * `poly` (the literal vertices of a straight-edged ring, the fixed-step tessellation of a curved
 * one, `ARC_STEP_DEG`), and `at`/`size` (the bounding box). A consumer whose answer is right on
 * the discretisation (a grid, a flood-fill, adjacency, containment within a tolerance) reads
 * {@link roomRing}; one whose answer would be wrong on a chord (an area, a boundary integral, an
 * extent, a vertex chain a reader sees) reads the exact function here instead, so a curved edge
 * is added in this module and not at every consumer.
 *
 * Every function keeps the expression, and the float order, its consumers used before the seam:
 * the corpus's SVG, `describe()`, `lint()`, Plan JSON and steps are byte-identical through it.
 * Pure and deterministic; charges the step meter: none. Structural over {@link RoomShape}, so a
 * resolved room, a wall-face cover and a net-area room all pass.
 */

import type { Point } from "../ast.js";
import { fullCircleArc } from "./arc.js";
import { type EdgeLoop, edgeStart, loopArea, loopBBox } from "./band.js";
import type { GridBox } from "./grid-index.js";
import { polygonArea, rectRing } from "./polygon.js";

/** The shape fields of a room's floor (the ones `RRoom` carries). */
export interface RoomShape {
  at: Point;
  size: { w: number; h: number };
  /** The discretised ring: a polygon's vertices, a circle's tessellation. */
  poly?: readonly Point[];
  /** A circular floor's exact centre and radius. */
  circle?: { c: Point; r: number };
  /** An arc-edged ring's exact boundary (card ARC2); `poly` is then its tessellation. */
  edges?: EdgeLoop;
}

/**
 * The floor's discretised ring: its `poly` (the same array, not a copy), or its rectangle's four
 * corners (`rectRing` order). Takes a room's own shape fields (`at`/`size`/`poly`). Not the
 * analysis layer's `roomRing` (`src/analyze/rooms.ts`, re-exported by `analyze.ts`), which takes
 * a `RoomBox` (`x`/`y`/`w`/`h` plus `poly`) and returns the same ring for the same room; import
 * this one from `geometry/room-ring.js` when holding a room, that one when holding a box.
 */
export function roomRing(r: RoomShape & { poly?: Point[] }): Point[];
export function roomRing(r: RoomShape): readonly Point[];
export function roomRing(r: RoomShape): readonly Point[] {
  return r.poly ?? rectRing({ x: r.at.x, y: r.at.y, w: r.size.w, h: r.size.h });
}

/**
 * The floor's EXACT boundary, one edge per boundary edge: a circle's one full-circle arc (never
 * its tessellation), else a line per edge of {@link roomRing}, in ring order, closing edge last.
 * A zero-length edge (a repeated vertex) is kept; a reader that cannot take one filters it.
 */
export function roomEdges(r: RoomShape): EdgeLoop {
  if (r.circle) return [{ t: "arc", arc: fullCircleArc(r.circle.c, r.circle.r) }];
  if (r.edges) return r.edges;
  const ring = roomRing(r);
  return ring.map((a, i) => ({ t: "line", a, b: ring[(i + 1) % ring.length]! }));
}

/** How many edges {@link roomEdges} returns, without building them: 1, the ring's length, or 4. */
export function roomCurveCount(r: RoomShape): number {
  return r.circle ? 1 : r.edges ? r.edges.length : r.poly ? r.poly.length : 4;
}

/**
 * A room's floor area in mm² — the ONE expression every area reader shares
 * (`describe().rooms[].area_m2`, the room schedule, Plan JSON, the too-small lint, the
 * drawn area label). A rectangle keeps the exact historical product; a polygon is
 * measured by the shoelace formula, which is exact (not sampled) for any simple ring; a
 * circle by πR², exact.
 */
export function roomAreaMm2(r: Omit<RoomShape, "at">): number {
  // A CIRCLE is measured in closed form (πR²) — never from the 48-gon tessellation it
  // also carries for the grid layer, which understates the area by 0.29%. See the
  // exact-vs-chordal note in docs/analysis.md.
  if (r.circle) return Math.PI * r.circle.r * r.circle.r;
  // An arc-edged ring: the shoelace of its vertices plus each arc's circular segment, in closed
  // form (`loopArea`, ADR 0027's ½∮(x dy − y dx)), never its tessellation's chordal figure.
  if (r.edges) return Math.abs(loopArea(r.edges));
  return r.poly ? polygonArea(r.poly) : r.size.w * r.size.h;
}

/** The floor's exact extent: a circle's centre ± radius, the ring's extreme coordinates, or `at`/`size`. */
export function roomExtent(r: RoomShape): GridBox {
  if (r.circle) {
    const { c, r: rad } = r.circle;
    return { minX: c.x - rad, minY: c.y - rad, maxX: c.x + rad, maxY: c.y + rad };
  }
  // An arc-edged ring reaches each bulge's closed-form extremes (`arcExtremes`), past its chord.
  if (r.edges) return loopBBox(r.edges);
  if (r.poly) {
    const pts = r.poly;
    return {
      minX: Math.min(...pts.map((p) => p.x)),
      minY: Math.min(...pts.map((p) => p.y)),
      maxX: Math.max(...pts.map((p) => p.x)),
      maxY: Math.max(...pts.map((p) => p.y)),
    };
  }
  return { minX: r.at.x, minY: r.at.y, maxX: r.at.x + r.size.w, maxY: r.at.y + r.size.h };
}

/**
 * The floor's authored vertex chain, as a reader is shown it (`describe().rooms[].floor_polygon`):
 * none for a circle (its tessellation is no vertex anyone wrote), else {@link roomRing}.
 */
export function roomCorners(r: RoomShape): readonly Point[] {
  return r.circle ? [] : r.edges ? r.edges.map(edgeStart) : roomRing(r);
}
