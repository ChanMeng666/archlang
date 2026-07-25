/**
 * Which way does a fixture face, and which of a rectangle's edges have a wall
 * behind them.
 *
 * Fixture glyphs are drawn with their **back** (the side that goes against the
 * wall) along the TOP edge of the footprint, and `rotate` quarter-turns the symbol
 * about its centre (`elements/fixtures-glyphs.ts`, `furniture.render`). So one
 * mapping — back edge ⇄ quarter-turn — decides everything about orientation, and
 * one geometric question — "is there a wall collinear with this edge?" — decides
 * what a fixture *should* face. Both live here once, so the four consumers agree
 * by construction:
 *
 *   * `elements/furniture.ts` — derives the rotation of a room-anchored fixture;
 *   * `lint/rules/furniture.ts` — `W_FIXTURE_BACK_TO_ROOM` (back facing the room);
 *   * `fix-producers.ts` — the `rotate <n>` text fix for that warning;
 *   * `repair.ts` — the `kind: "rotated"` correction.
 *
 * Pure, deterministic, zero-dep (rect + wall-segment arithmetic only). It sits
 * below `analyze.ts` — which re-exports it, and whose `isAgainstWall` is now the
 * boolean summary of {@link wallBackedEdges} — so an element module can import it
 * without a cycle through the registry.
 */

import type { WallLike, WallSegment } from "./geometry.js";
import { segmentsOfWall } from "./geometry.js";
import { type BBox, mergedLength, overlap1d } from "./geometry/rect.js";

/** An edge of an axis-aligned rectangle. `top` is −y (north); +y is down (SVG). */
export type RectEdge = "top" | "bottom" | "left" | "right";

/** The four edges, in the order the wall-backing scan has always used them. */
export const RECT_EDGES: readonly RectEdge[] = ["top", "bottom", "left", "right"];

/** The wall segment backing each edge (`null` = that edge has no wall behind it). */
export type EdgeBacking = Readonly<Record<RectEdge, WallSegment | null>>;

/**
 * How close (mm) a wall-requiring fixture's edge must be to a wall centerline to
 * count as backed by it. Single source of truth: the lint ruleset's
 * `fixtureWallTolMm` default *is* this constant, so what resolve derives and what
 * lint flags can never drift apart. Comfortably more than a wall's half-thickness
 * (a fixture backs onto the *face*) plus a small installation setback.
 */
export const FIXTURE_WALL_TOL_MM = 300;

/** Quarter-turn that puts the symbol's back on each edge of its footprint.
 *  `rotate 0` draws the back on top (north); the render rotation is clockwise in
 *  screen space, so a quarter-turn moves the back north → east → south → west. */
export const BACK_EDGE_ROTATE: Readonly<Record<RectEdge, 0 | 90 | 180 | 270>> = Object.freeze({
  top: 0,
  right: 90,
  bottom: 180,
  left: 270,
});

/** The quarter-turn that faces a fixture's back onto `edge` of its footprint. */
export function rotateForBackEdge(edge: RectEdge): 0 | 90 | 180 | 270 {
  return BACK_EDGE_ROTATE[edge];
}

/** Which footprint edge a fixture's back lands on at quarter-turn `rotate`
 *  (non-quarter/absent values normalize; anything unrecognized reads as `0`). */
export function backEdgeForRotate(rotate: number | undefined): RectEdge {
  const rot = (((rotate ?? 0) % 360) + 360) % 360;
  switch (rot) {
    case 90:
      return "right";
    case 180:
      return "bottom";
    case 270:
      return "left";
    default:
      return "top";
  }
}

/** The `rotate` value whose back faces the wall on `edge`, as the fixture's own
 *  footprint edge. (Alias of {@link rotateForBackEdge}, read at the call site as
 *  "turn the back onto this edge".) */
export const rotateToBackOnto = rotateForBackEdge;

/**
 * The footprint edges that can physically be this fixture's back, read off the
 * catalogued wall-relative footprint (`along` runs on the wall, `depth` projects
 * into the room). A WC is 400 along × 700 deep, so a piece drawn 400 wide × 700
 * tall can only back onto a **horizontal** edge (top/bottom) — backing it onto a
 * vertical one would draw a WC 700 wide and 400 deep, which is not a WC. The shape
 * is a second closed-form constraint on top of "which edge has a wall", not a
 * preference: intersecting the two is how a corner stops being ambiguous.
 *
 * Returns all four edges when the shape says nothing — a square catalogued
 * footprint (a 600×600 counter), a square piece, or an uncatalogued kind.
 */
export function backCandidateEdges(
  size: { w: number; h: number },
  footprint: { along: number; depth: number } | null,
): readonly RectEdge[] {
  if (!footprint || footprint.along === footprint.depth || size.w === size.h) return RECT_EDGES;
  // The piece's long axis must be the catalogued depth axis; that axis is the one
  // the back edge is perpendicular to.
  return size.h > size.w === footprint.depth > footprint.along ? ["top", "bottom"] : ["left", "right"];
}

/** Geometry of one rectangle edge as a 1-D run on a fixed orthogonal line. */
function edgeRun(rect: BBox, edge: RectEdge): { axis: "h" | "v"; fixed: number; lo: number; hi: number } {
  switch (edge) {
    case "top":
      return { axis: "h", fixed: rect.y, lo: rect.x, hi: rect.x + rect.w };
    case "bottom":
      return { axis: "h", fixed: rect.y + rect.h, lo: rect.x, hi: rect.x + rect.w };
    case "left":
      return { axis: "v", fixed: rect.x, lo: rect.y, hi: rect.y + rect.h };
    case "right":
      return { axis: "v", fixed: rect.x + rect.w, lo: rect.y, hi: rect.y + rect.h };
  }
}

/**
 * The wall segment backing one edge of `rect` — the segment collinear with that
 * edge (within `tol` of its centerline) that covers the most of it — or `null`
 * when the edge's merged wall coverage is under half its length (or the edge is
 * degenerate). `rect` is any room or fixture rectangle.
 *
 * The half-length threshold and the tolerance idiom are exactly the ones
 * {@link import("./analyze.js").isAgainstWall} has always used (it is now this
 * function over the four edges), so no lint verdict changes. On an exact coverage
 * tie the first segment in `segs` order wins, keeping the result deterministic —
 * callers use the segment to answer "which wall?", never to measure.
 */
export function backingWallForRoomEdge(
  rect: BBox,
  edge: RectEdge,
  walls: WallLike[],
  tol: number = FIXTURE_WALL_TOL_MM,
  // Callers looping over many rooms/fixtures hoist the segment list once and pass it in.
  segs: readonly WallSegment[] = walls.flatMap((w) => segmentsOfWall(w)),
): WallSegment | null {
  const e = edgeRun(rect, edge);
  const len = e.hi - e.lo;
  if (len <= 0) return null;
  const covered: Array<[number, number]> = [];
  let best: { seg: WallSegment; overlap: number } | null = null;
  for (const s of segs) {
    const isH = Math.abs(s.a.y - s.b.y) < 1e-6;
    const isV = Math.abs(s.a.x - s.b.x) < 1e-6;
    let slo: number;
    let shi: number;
    if (e.axis === "h") {
      if (!isH || Math.abs((s.a.y + s.b.y) / 2 - e.fixed) > tol) continue;
      slo = Math.min(s.a.x, s.b.x);
      shi = Math.max(s.a.x, s.b.x);
    } else {
      if (!isV || Math.abs((s.a.x + s.b.x) / 2 - e.fixed) > tol) continue;
      slo = Math.min(s.a.y, s.b.y);
      shi = Math.max(s.a.y, s.b.y);
    }
    const ov = overlap1d(slo, shi, e.lo, e.hi);
    if (ov <= 0) continue;
    covered.push([Math.max(slo, e.lo), Math.min(shi, e.hi)]);
    if (!best || ov > best.overlap) best = { seg: s, overlap: ov };
  }
  return mergedLength(covered) >= len * 0.5 ? (best?.seg ?? null) : null;
}

/**
 * Where the **inner face** of the wall backing `edge` sits, as a coordinate on that
 * edge's fixed axis (`y` for `top`/`bottom`, `x` for `left`/`right`), or `null` when
 * the edge has no wall behind it.
 *
 * A room rectangle's edges are wall CENTERLINES, so the solid reaches half a
 * thickness into the room. The face is that centerline pushed `thickness / 2` in the
 * direction the room lies — `+` for `top`/`left`, `−` for `bottom`/`right`, read off
 * the edge alone (the room is always on the inward side of its own edge). Taken from
 * the backing segment's own centerline rather than the rect edge, so the answer is the
 * real wall's face — exactly the plane `W_FURNITURE_WALL_COLLISION` measures against.
 *
 * This is the geometry behind `furniture … in <room> anchor <a> flush`: with it,
 * `inset` starts at the plaster instead of inside the wall.
 */
export function innerFaceOfRoomEdge(
  rect: BBox,
  edge: RectEdge,
  walls: WallLike[],
  tol: number = FIXTURE_WALL_TOL_MM,
  segs: readonly WallSegment[] = walls.flatMap((w) => segmentsOfWall(w)),
): number | null {
  const seg = backingWallForRoomEdge(rect, edge, walls, tol, segs);
  if (!seg) return null;
  const half = seg.thickness / 2;
  switch (edge) {
    case "top":
      return (seg.a.y + seg.b.y) / 2 + half;
    case "bottom":
      return (seg.a.y + seg.b.y) / 2 - half;
    case "left":
      return (seg.a.x + seg.b.x) / 2 + half;
    case "right":
      return (seg.a.x + seg.b.x) / 2 - half;
  }
}

/** {@link backingWallForRoomEdge} for all four edges of `rect` at once. */
export function wallBackedEdges(
  rect: BBox,
  walls: WallLike[],
  tol: number = FIXTURE_WALL_TOL_MM,
  segs: readonly WallSegment[] = walls.flatMap((w) => segmentsOfWall(w)),
): EdgeBacking {
  return {
    top: backingWallForRoomEdge(rect, "top", walls, tol, segs),
    bottom: backingWallForRoomEdge(rect, "bottom", walls, tol, segs),
    left: backingWallForRoomEdge(rect, "left", walls, tol, segs),
    right: backingWallForRoomEdge(rect, "right", walls, tol, segs),
  };
}

/** The edges of `rect` that have a wall behind them, in {@link RECT_EDGES} order. */
export function backedEdgeList(backing: EdgeBacking): RectEdge[] {
  return RECT_EDGES.filter((e) => backing[e] !== null);
}
