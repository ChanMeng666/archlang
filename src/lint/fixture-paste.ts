/**
 * A pasteable fixture statement for an empty wet room or kitchen (`W_ROOM_NO_FIXTURE`'s hint),
 * placed from the room's own shape and CHECKED before it is quoted.
 *
 * A hint that says "add `furniture wc in bath anchor top flush …`" and lands the WC in the
 * door's swing trades one warning for two. So each candidate is the footprint the resolver
 * would produce for that statement, measured against what the lint rules measure: on the
 * room's floor ({@link rectInRoomBox}, the room's own ring), no wall solid intruded past the
 * collision slack, clear of every door's swing ({@link sectorIntersectsRect}, with the active
 * ruleset's clearance) and doorway landing, clear of other furniture, and with its own frontal
 * use-space free of free-standing furniture. The first candidate that passes is quoted; when
 * none does, the caller says so rather than quote one.
 *
 * Candidates run along each walled edge of the room, back to the wall (so the catalogued depth
 * runs away from it, and the rotation is the one that faces the room):
 *   - a rectangular room uses the `in <room> anchor <a> flush` form, and its footprint is
 *     reproduced with `placeInRoom`'s own arithmetic (`elements/furniture.ts`): the anchored
 *     edge(s) on the inner wall face, the rotation derived from the one anchored edge the
 *     footprint's aspect allows;
 *   - a `polygon` or relational room cannot take `anchor` (E_PLACE_POLY / E_PLACE_REF), so it
 *     gets `at (x,y) … rotate … in <room>` with the coordinates on the plan grid, taken from
 *     the ring's axis-aligned edges and the wall face behind each.
 * Pure, bounded by the room's edge count times the plan's doors, walls and furniture.
 */

import {
  ANCHOR_BACK_EDGES,
  backCandidateEdges,
  backingWallForRoomEdge,
  FIXTURE_WALL_TOL_MM,
  frontClearanceRect,
  innerFaceOfRoomEdge,
  type RectEdge,
  rectInRoomBox,
  rectOf,
  rotateForBackEdge,
} from "../analyze.js";
import type { FurnitureAnchor } from "../ast.js";
import { defaultFootprint, frontClearanceMm, requiresWall } from "../fixtures-catalog.js";
import { doorLeaves, sectorIntersectsRect } from "../geometry.js";
import { pointInPolygon } from "../geometry/polygon.js";
import { type BBox, doorLandingRect, rectsOverlap, wallIntrusionDepth } from "../geometry/rect.js";
import type { RFurniture, RRoom } from "../ir.js";
import { fmt2 } from "../num-format.js";
import { clearancesClear } from "./clearance-measure.js";
import type { LintContext } from "./context.js";
import { WALL_COLLISION_SLACK_MM } from "./measure.js";

export { WALL_COLLISION_SLACK_MM } from "./measure.js";

/** The anchors tried on each edge: the edge's middle, then its two corners. */
const EDGE_ANCHORS: Readonly<Record<RectEdge, readonly FurnitureAnchor[]>> = {
  top: ["top", "top-left", "top-right"],
  bottom: ["bottom", "bottom-left", "bottom-right"],
  left: ["left", "top-left", "bottom-left"],
  right: ["right", "top-right", "bottom-right"],
};

/**
 * Is a piece of `category` with footprint `fr` and quarter-turn `rotate` clear of everything
 * the placement lint rules measure — the terms `W_FURNITURE_WALL_COLLISION`,
 * `W_FURNITURE_OVERLAP`, `W_SWING_OBSTRUCTED`, `W_DOORWAY_BLOCKED`, `W_FURN_CLEARANCE` (both
 * ways), `W_WC_SIDE_CLEARANCE` (both ways), `W_FURNITURE_OVER_WINDOW`, `W_HOB_UNDER_WINDOW` and
 * `W_HOB_FRIDGE_GAP` (both ways) test? `self` is the piece being moved, left out of its own overlap test. Room
 * containment and wall backing are the caller's, because only the caller knows which room
 * and which edge it means. Shared by this module's paste and the wall-collision `offset` hint,
 * so neither quotes a position that trades its warning for another.
 */
export function placementClear(
  ctx: LintContext,
  fr: BBox,
  category: string,
  rotate: number,
  self?: RFurniture,
): boolean {
  if (ctx.wallSegs.some((s) => wallIntrusionDepth(fr, s, ctx.wallOpenings) > WALL_COLLISION_SLACK_MM)) return false;
  const others = ctx.furniture.filter((f) => f !== self);
  if (others.some((f) => rectsOverlap(fr, rectOf(f)))) return false;
  for (const d of ctx.doors) {
    if (doorLeaves(d).some((s) => sectorIntersectsRect(s, fr, ctx.rules.swingClearanceMm))) return false;
    const landing = doorLandingRect(d, ctx.rules.doorwayLandingMm);
    if (landing && rectsOverlap(landing, fr)) return false;
  }
  // A cased opening's approach (PS2.11e). `W_DOORWAY_BLOCKED` reads a door-wide one as a door's
  // and a wider one only once no doorway's width of it stays clear (`openingBlock`); a quoted
  // position keeps out of every opening's approach, wide or not, so a hint never parks a piece in
  // an open-plan join it narrows (the walk through it is `W_PATH_TOO_NARROW`'s, judged later).
  for (const o of ctx.openings) {
    const landing = doorLandingRect(o, ctx.rules.doorwayLandingMm);
    if (landing && rectsOverlap(landing, fr)) return false;
  }
  // Its own use-space must be free of free-standing furniture, and a free-standing piece must
  // not stand in another fixture's.
  const clearance = frontClearanceMm(category);
  if (clearance > 0) {
    const front = frontClearanceRect({ at: { x: fr.x, y: fr.y }, size: { w: fr.w, h: fr.h }, rotate }, clearance);
    if (others.some((f) => !requiresWall(f.category) && rectsOverlap(front, rectOf(f)))) return false;
  }
  if (!requiresWall(category)) {
    for (const f of others) {
      const c = frontClearanceMm(f.category);
      if (c > 0 && rectsOverlap(frontClearanceRect(f, c), fr)) return false;
    }
  }
  // The clearance family (PS2.11a/b/e, PS2.46): a WC's sides, a piece beside a WC, a tall unit or a
  // hob over a window, a hob with a tall unit beside it.
  return clearancesClear(ctx, fr, category, rotate, self);
}

/** Why no statement could be quoted, for the hint to say so truthfully. */
/**
 * Why no statement could be quoted, for the hint to say so truthfully: no straight walled
 * edge to back onto; no clear run on any; the grid snaps the footprint to nothing; or a run
 * that IS clear at exact coordinates, which the grid only lets `at` reach off the wall face.
 */
export type PasteFailure = "no-wall" | "no-room" | "grid" | "grid-offset" | "squeeze" | "raises" | "unverified";

/**
 * The statement that places one `category` fixture clear in `room`, or why there is none.
 * `along`/`depth` are the catalogued footprint, and the statement quotes them as they are; the
 * geometry is checked at the size the resolver will actually draw (snapped to the plan grid),
 * and a grid so coarse that it snaps the footprint away quotes nothing.
 */
export function pasteFixture(
  ctx: LintContext,
  room: RRoom,
  category: string,
  along: number,
  depth: number,
): { stmt: string; rect: BBox; rotate: number } | { failure: PasteFailure } {
  const g = ctx.ir.grid;
  const snap = (v: number) => (g > 0 ? Math.round(v / g) * g : v);
  const A = snap(along);
  const D = snap(depth);
  if (A <= 0 || D <= 0) return { failure: "grid" };
  const sizeOn = (edge: RectEdge) => (edge === "top" || edge === "bottom" ? { w: A, h: D } : { w: D, h: A });
  const printed = (edge: RectEdge) =>
    edge === "top" || edge === "bottom" ? `${fmt2(along)}x${fmt2(depth)}` : `${fmt2(depth)}x${fmt2(along)}`;
  const face = (rect: BBox, edge: RectEdge) =>
    innerFaceOfRoomEdge(rect, edge, ctx.ir.walls, FIXTURE_WALL_TOL_MM, ctx.wallSegs);
  const box = ctx.roomRects.get(room.id);
  // On the room's floor, its back on a wall (what `W_FIXTURE_FLOATING`/`_BACK_TO_ROOM` read),
  // and clear of everything else.
  const fits = (fr: BBox, edge: RectEdge) =>
    box !== undefined &&
    rectInRoomBox(fr, box) &&
    backingWallForRoomEdge(fr, edge, ctx.ir.walls, ctx.rules.fixtureWallTolMm, ctx.wallSegs) !== null &&
    placementClear(ctx, fr, category, rotateForBackEdge(edge));
  let walled = false;
  let offGrid = false;

  if (!room.poly && room._unplaced !== true) {
    const rect = { x: room.at.x, y: room.at.y, w: room.size.w, h: room.size.h };
    for (const edge of ["top", "bottom", "left", "right"] as const) {
      if (face(rect, edge) === null) continue;
      walled = true;
      const { w, h } = sizeOn(edge);
      for (const a of EDGE_ANCHORS[edge]) {
        // The quoted footprint's aspect must make this edge the one anchored, walled edge it
        // can back onto. The resolver derives the rotation the same way, but reads the
        // CATALOGUE footprint, not the size quoted (`placeInRoom`): a 400 × 600 worktop is a
        // square `counter` to it, so in a corner with both walls standing it derives no
        // rotation and the piece stands with its back to the room (`W_FIXTURE_BACK_TO_ROOM`).
        // Where the two readings differ, the statement quotes the rotation explicitly.
        const backedBy = (shape: readonly RectEdge[]) =>
          ANCHOR_BACK_EDGES[a].filter((e) => shape.includes(e) && face(rect, e) !== null);
        const backed = backedBy(backCandidateEdges({ w, h }, { along, depth }));
        if (backed.length !== 1 || backed[0] !== edge) continue;
        const derived = backedBy(backCandidateEdges({ w, h }, defaultFootprint(category)));
        // A piece the resolver derives no turn for stands at rotate 0 (back on the top edge), so
        // that turn goes unsaid; any other is written out.
        const turn =
          (derived.length === 1 && derived[0] === edge) || (derived.length !== 1 && rotateForBackEdge(edge) === 0)
            ? ""
            : ` rotate ${rotateForBackEdge(edge)}`;
        const f = (e: RectEdge) => (ANCHOR_BACK_EDGES[a].includes(e) ? face(rect, e) : null);
        const x =
          a === "top-left" || a === "left" || a === "bottom-left"
            ? (f("left") ?? rect.x)
            : a === "top-right" || a === "right" || a === "bottom-right"
              ? (f("right") ?? rect.x + rect.w) - w
              : rect.x + rect.w / 2 - w / 2;
        const y =
          a === "top-left" || a === "top" || a === "top-right"
            ? (f("top") ?? rect.y)
            : a === "bottom-left" || a === "bottom" || a === "bottom-right"
              ? (f("bottom") ?? rect.y + rect.h) - h
              : rect.y + rect.h / 2 - h / 2;
        if (fits({ x, y, w, h }, edge))
          return {
            stmt: `furniture ${category} in ${room.id} anchor ${a} flush size ${printed(edge)}${turn}`,
            rect: { x, y, w, h },
            rotate: rotateForBackEdge(edge),
          };
      }
    }
    return { failure: walled ? "no-room" : "no-wall" };
  }

  // A ring the room's own: a polygon's vertices, or a relational room's resolved rectangle.
  const ring = room.poly ?? [
    { x: room.at.x, y: room.at.y },
    { x: room.at.x + room.size.w, y: room.at.y },
    { x: room.at.x + room.size.w, y: room.at.y + room.size.h },
    { x: room.at.x, y: room.at.y + room.size.h },
  ];
  // `at` is snapped by the resolver; try the face rounded to the nearest module and then
  // rounded into the room, and let the checks pick.
  const onGrid = (v: number, mode: "near" | "up" | "down") =>
    g > 0 ? (mode === "near" ? Math.round(v / g) : mode === "up" ? Math.ceil(v / g) : Math.floor(v / g)) * g : v;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const horizontal = p.y === q.y && p.x !== q.x;
    if (!horizontal && !(p.x === q.x && p.y !== q.y)) continue;
    const lo = horizontal ? Math.min(p.x, q.x) : Math.min(p.y, q.y);
    const hi = horizontal ? Math.max(p.x, q.x) : Math.max(p.y, q.y);
    const line = horizontal ? p.y : p.x;
    const mid = (lo + hi) / 2;
    // Which side the floor is on, probed 1 mm off the edge's middle.
    const inward = horizontal
      ? pointInPolygon(mid, line + 1, ring)
        ? 1
        : -1
      : pointInPolygon(line + 1, mid, ring)
        ? 1
        : -1;
    const edge: RectEdge = horizontal ? (inward > 0 ? "top" : "bottom") : inward > 0 ? "left" : "right";
    // A one-millimetre strip with this edge as its `edge` side: the face behind the ring edge.
    const strip = horizontal
      ? { x: lo, y: inward > 0 ? line : line - 1, w: hi - lo, h: 1 }
      : { x: inward > 0 ? line : line - 1, y: lo, w: 1, h: hi - lo };
    const fc = face(strip, edge);
    if (fc === null) continue;
    walled = true;
    const { w, h } = sizeOn(edge);
    const span = horizontal ? w : h;
    if (hi - lo < span) continue;
    const back = inward > 0 ? fc : fc - (horizontal ? h : w);
    for (const c of [mid, lo + (hi - lo) / 4, hi - (hi - lo) / 4]) {
      const start = onGrid(c - span / 2, "near");
      for (const mode of ["near", inward > 0 ? "up" : "down"] as const) {
        const b = onGrid(back, mode);
        const fr = horizontal ? { x: start, y: b, w, h } : { x: b, y: start, w, h };
        const rot = rotateForBackEdge(edge);
        if (fits(fr, edge))
          return {
            stmt: `furniture ${category} at (${fmt2(fr.x)},${fmt2(fr.y)}) size ${printed(edge)}${rot === 0 ? "" : ` rotate ${rot}`} in ${room.id}`,
            rect: fr,
            rotate: rot,
          };
      }
      // The same run at exact coordinates: if it fits there, the grid is what refused it.
      const exact = horizontal ? { x: c - span / 2, y: back, w, h } : { x: back, y: c - span / 2, w, h };
      if (g > 0 && fits(exact, edge)) offGrid = true;
    }
  }
  return { failure: offGrid ? "grid-offset" : walled ? "no-room" : "no-wall" };
}
