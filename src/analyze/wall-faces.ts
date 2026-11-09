/**
 * **Walled faces** — the closed regions of floor a storey's wall bodies enclose, and how much
 * of each one the rooms cover (plan-soundness PS2.4: `W_FLOOR_UNASSIGNED`,
 * `W_ROOM_OUTSIDE_SHELL`).
 *
 * A face is a HOLE of the union of every wall's band: the solid the drawing draws for a wall
 * before any opening is cut (`wallBand()` in `src/geometry/band.ts`), joined by the one wall
 * joinery the drawing uses (`joinWallSet` in `src/wall-lowering.ts`). Doors and windows do
 * not cut it, so a room with a door in its wall is still one closed face. The outline's
 * outer loops run with the solid on their right (positive area, clockwise on screen); a hole
 * runs the other way, so a face is an outline loop of negative area. A partition that stops
 * short of the wall it should meet leaves the two sides one face.
 *
 * Every area is measured from the shapes in closed form by the boundary integral of
 * `src/analyze/net-area.ts` ({@link regionBoundary}): wall faces with their true arcs, room
 * rings, and circle rooms as true circles. No tessellation, sampling or bounding box enters a
 * figure; a box only skips a curve that cannot meet the region.
 *
 * **The containment tree.** The outline's loops never cross, so they nest: each loop's parent
 * is the smallest loop around it (one containment pass, smallest candidate first). Walking
 * inward, outer loops and holes alternate, so a point is on a wall's solid exactly when the
 * innermost loop around it is an outer loop, and in face `k` exactly when that loop is hole
 * `k`. A point test therefore looks for the innermost loop holding the point, smallest
 * candidate first, and stops at the first winding test that succeeds. A face's boundary is its
 * hole and the hole's own children (the walls standing free inside it), never every loop inside
 * its box.
 *
 * **Budgets: counts, all charged before the work they bound** ({@link FaceBudget}). The joinery
 * runs only under {@link MAX_FACE_WALL_SEGMENTS} segments and {@link MAX_WALL_CONTACTS} wall
 * contacts. The holes are then counted ({@link MAX_ENCLOSURE_FACES}), and the loops per grid
 * cell (the candidates any point test can meet, {@link MAX_LOOPS_PER_CELL}). Once the tree is
 * built, the curves every measurement will read are counted, and from them an upper bound on
 * the point tests and the loop tests and room-ring vertex walks they cost; each is capped
 * ({@link FACE_BUDGET_CAPS}).
 * Past any cap the storey is refused whole, before any face or room is measured, and the face
 * rules say nothing about it. Under the caps {@link FaceWork} counts the work actually done.
 *
 * Pure, synchronous, deterministic: the joinery's own determinism, then loops in its output
 * order (sorted, canonical), the grid's own deterministic order, and rooms in source order.
 */

import type { Point } from "../ast.js";
import { arcExtremes, distPointToArc } from "../geometry/arc.js";
import { type EdgeLoop, edgeMid, loopArea, loopBBox, loopWinding } from "../geometry/band.js";
import { type GridBox, GridIndex } from "../geometry/grid-index.js";
import { segmentsOfWall } from "../geometry.js";
import { distPointToSegment, rectRing } from "../geometry/polygon.js";
import type { RRoom, RWall } from "../ir.js";
import { joinWallSet } from "../wall-lowering.js";
import {
  type BoundaryPiece,
  boxesMeet,
  type Curve,
  curvesOfLoop,
  MAX_NET_CURVES,
  type RoomRegion,
  regionBoundary,
  roomRegion,
} from "./net-area.js";

/**
 * The most wall segments a storey may have for its faces to be computed. The joinery splits
 * every band edge against every other it meets, so its work grows with the segment count;
 * the largest shipped plan has well under a tenth of this. A storey past it gets no face
 * rule at all.
 */
export const MAX_FACE_WALL_SEGMENTS = 2000;

/**
 * The most walled faces a storey may have for the face rules to measure it. Every face is
 * measured against the rooms near it, and a room against the faces near it, so the work grows
 * with the face count; the largest shipped storey has 31. Past it the storey is refused whole,
 * before any face is measured: a wall grid of hundreds of cells is a drawing of a lattice, not
 * of rooms, and no answer is better than a slow one.
 */
export const MAX_ENCLOSURE_FACES = 400;

/**
 * The most pairs of wall segments whose bodies' boxes meet (crossings, tees, corners and
 * near-misses) a storey may have before the joinery is run for the face rules. Each such pair
 * is a place the joinery splits edges, and every face of a wall lattice is bounded by such
 * pairs, so this bounds the joinery's work BEFORE it runs: a lattice of more than
 * {@link MAX_ENCLOSURE_FACES} cells is refused here, by counting, without being joined. Four
 * contacts per face is a square cell's own corners; the largest shipped storey has 131.
 */
export const MAX_WALL_CONTACTS = 4 * MAX_ENCLOSURE_FACES;

/**
 * The most outline loops whose boxes may touch one grid cell: an upper bound on the candidates
 * one point test can meet. Loops that nest (rings within rings) all touch the cells at their
 * common centre, so this is the count that nesting raises; the largest shipped storey has 7.
 */
export const MAX_LOOPS_PER_CELL = 64;

/**
 * The caps on the counted work of one storey's face measurements ({@link FaceBudget}), each an
 * upper bound computed before the work. Every shipped plan stays under a tenth of each (the
 * corpus maxima are pinned beside them in `test/lint-space-enclosure.test.ts`).
 */
export const FACE_BUDGET_CAPS = {
  /**
   * Over every measurement: its probes (2 × an upper bound on the pieces it walks) × what one
   * probe costs (the candidate loops of its point tests, plus the ring vertices of every room
   * whose inside it asks). A room with hundreds of vertices crossed by many walls is charged
   * here, not only one with many loops.
   */
  candidateTests: 200_000_000,
  /** Σ over faces of the curves bounding the face (its hole and the hole's children). */
  faceCurves: 20_000,
  /** Σ over faces of the cover elements (rooms, surfaces, voids, runs) whose box meets it. */
  faceRooms: 10_000,
  /** Σ over rooms of the room's curves and the outline curves near it. */
  roomCurves: 50_000,
} as const;

/** The counted bounds a storey's face measurements were charged before they ran. */
export interface FaceBudget {
  /** The most loops whose boxes touch one grid cell (candidates per point test). */
  loopsPerCell: number;
  /** Upper bound on probes × (candidate loops + ring vertices) (see {@link FACE_BUDGET_CAPS}). */
  candidateTests: number;
  faceCurves: number;
  faceRooms: number;
  roomCurves: number;
}

/** One closed region of floor the walls enclose. */
export interface WallFace {
  /** The hole loop of the wall outline that bounds it. */
  loop: EdgeLoop;
  /** Its box (closed-form, arcs by their extremes) — a filter only. */
  box: GridBox;
  /** The face's floor area (mm²): the hole less any wall standing free inside it. */
  area: number;
  /** The face's boundary curves: its own loop and its children (free-standing walls inside). */
  curves: Curve[];
}

/**
 * The point tests performed so far: `probes` asks of {@link WallFaces.faceAt} and
 * {@link WallFaces.solid}, `loopTests` the winding numbers taken to answer them. A count, so a
 * test can pin that the work per probe stays flat as the faces multiply.
 */
export interface FaceWork {
  probes: number;
  loopTests: number;
}

/** A storey's walled faces, the joined outline they were read from, and its inside tests. */
export interface WallFaces {
  outline: EdgeLoop[];
  faces: WallFace[];
  /** Is `p` on a wall's solid (the innermost loop around it is an outer loop)? */
  solid(p: Point): boolean;
  /** The face whose floor holds `p` (the innermost loop around it is that face's hole), or -1. */
  faceAt(p: Point): number;
  /** The outline loops whose box meets `box`, in outline order (a filter, never an answer). */
  loopsNear(box: GridBox): EdgeLoop[];
  budget: FaceBudget;
  work: FaceWork;
}

/** Why a storey's faces were not measured: a count over its cap, charged before the work. */
export interface WallFacesRefused {
  refused:
    | "too-many-segments"
    | "too-many-wall-contacts"
    | "too-many-faces"
    | "too-many-loops-per-cell"
    | "too-many-candidate-tests"
    | "too-many-face-curves"
    | "too-many-face-rooms"
    | "too-many-room-curves";
  count: number;
}

const segmentCount = (walls: readonly RWall[]): number =>
  walls.reduce((n, w) => n + (w.closed && w.points.length > 2 ? w.points.length : Math.max(0, w.points.length - 1)), 0);

const inBox = (b: GridBox, p: Point): boolean => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;

/**
 * How many pairs of wall segments have bodies whose boxes meet, counted up to `limit + 1` and
 * no further. A box is the segment's own extent grown by half its thickness: a straight run's
 * ends, an arc's ends and the axis extremes inside its sweep (never its whole circle).
 */
export function wallContacts(walls: readonly RWall[], limit: number): number {
  const boxes: GridBox[] = [];
  for (const w of walls)
    for (const s of segmentsOfWall(w)) {
      const h = s.thickness / 2;
      const pts = s.arc ? arcExtremes(s.arc) : [s.a, s.b];
      boxes.push({
        minX: Math.min(...pts.map((p) => p.x)) - h,
        minY: Math.min(...pts.map((p) => p.y)) - h,
        maxX: Math.max(...pts.map((p) => p.x)) + h,
        maxY: Math.max(...pts.map((p) => p.y)) + h,
      });
    }
  let n = 0;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) if (boxesMeet(boxes[i]!, boxes[j]!, 0) && ++n > limit) return n;
  return n;
}

/** The grid cell for the loops: the median of their boxes' longer sides (deterministic). */
function cellFor(boxes: readonly GridBox[]): number {
  const sides = boxes.map((b) => Math.max(b.maxX - b.minX, b.maxY - b.minY)).sort((a, b) => a - b);
  const m = sides[Math.floor(sides.length / 2)] ?? 1;
  return Number.isFinite(m) && m > 0 ? m : 1;
}

/**
 * The most boxes touching any one cell of a `cell`-sized grid, counted up to `limit + 1`. A box
 * spanning more cells than the index buckets it into is counted against every cell it spans
 * only up to the index's own overflow rule (it is then a candidate everywhere, counted once).
 */
function maxPerCell(boxes: readonly GridBox[], cell: number, limit: number): number {
  const counts = new Map<number, Map<number, number>>();
  let everywhere = 0;
  let best = 0;
  for (const b of boxes) {
    const x0 = Math.floor(b.minX / cell);
    const x1 = Math.floor(b.maxX / cell);
    const y0 = Math.floor(b.minY / cell);
    const y1 = Math.floor(b.maxY / cell);
    if (!((x1 - x0 + 1) * (y1 - y0 + 1) <= 1 << 14)) {
      everywhere++;
      continue;
    }
    for (let cx = x0; cx <= x1; cx++) {
      let col = counts.get(cx);
      if (!col) {
        col = new Map();
        counts.set(cx, col);
      }
      for (let cy = y0; cy <= y1; cy++) {
        const n = (col.get(cy) ?? 0) + 1;
        col.set(cy, n);
        if (n + everywhere > best) best = n + everywhere;
        if (best > limit) return best;
      }
    }
  }
  return Math.max(best, everywhere);
}

/** Upper bound on the pieces a measurement over `c` curves walks (each pair crosses at most twice). */
const piecesBound = (c: number): number => c + 2 * c * Math.max(0, c - 1);

/** The cover elements a face is measured against: anything with a room's shape fields. */
export type FaceRoom = Pick<RRoom, "id" | "at" | "size" | "poly" | "circle">;

const roomCurveCount = (r: FaceRoom): number => (r.circle ? 1 : r.poly ? r.poly.length : 4);

const roomBoxOf = (r: FaceRoom): GridBox =>
  r.circle
    ? {
        minX: r.circle.c.x - r.circle.r,
        minY: r.circle.c.y - r.circle.r,
        maxX: r.circle.c.x + r.circle.r,
        maxY: r.circle.c.y + r.circle.r,
      }
    : r.poly
      ? {
          minX: Math.min(...r.poly.map((p) => p.x)),
          minY: Math.min(...r.poly.map((p) => p.y)),
          maxX: Math.max(...r.poly.map((p) => p.x)),
          maxY: Math.max(...r.poly.map((p) => p.y)),
        }
      : { minX: r.at.x, minY: r.at.y, maxX: r.at.x + r.size.w, maxY: r.at.y + r.size.h };

/**
 * The walled faces of a storey, or `null` when there is nothing to read (no wall, or no wall
 * body that bands), or a {@link WallFacesRefused} when a count is over its cap. `cover` is what
 * {@link faceCover} will measure each face against and `rooms` what {@link roomOutside} will
 * measure; both enter the budget, which is charged before any face or room is measured. A
 * storey whose walls close no region returns an empty `faces`.
 */
export function wallFaces(
  walls: readonly RWall[],
  cover: readonly FaceRoom[] = [],
  rooms: readonly FaceRoom[] = [],
): WallFaces | WallFacesRefused | null {
  if (walls.length === 0) return null;
  const segs = segmentCount(walls);
  if (segs > MAX_FACE_WALL_SEGMENTS) return { refused: "too-many-segments", count: segs };
  // Charged before the joinery: a lattice's crossings are counted, never joined.
  const contacts = wallContacts(walls, MAX_WALL_CONTACTS);
  if (contacts > MAX_WALL_CONTACTS) return { refused: "too-many-wall-contacts", count: contacts };
  // The band before any opening is cut: a door in a wall leaves the face closed.
  const joined = joinWallSet(
    walls.map((w) => ({ ...w, openings: [] })),
    [],
  );
  if (!joined) return null;
  const outline = joined.result.outline;
  const signed = outline.map(loopArea);
  // Charged before any face is measured: one signed area per loop is all this costs.
  const holeCount = signed.filter((a) => a < 0).length;
  if (holeCount > MAX_ENCLOSURE_FACES) return { refused: "too-many-faces", count: holeCount };

  const boxes = outline.map(loopBBox);
  const cell = cellFor(boxes);
  const loopsPerCell = maxPerCell(boxes, cell, MAX_LOOPS_PER_CELL);
  if (loopsPerCell > MAX_LOOPS_PER_CELL) return { refused: "too-many-loops-per-cell", count: loopsPerCell };
  const loopIndex = new GridIndex<number>(cell);
  for (let i = 0; i < outline.length; i++) loopIndex.insert(boxes[i]!, i);
  // Every loop by size, smallest first: the first candidate around a point is the innermost.
  const rank = outline.map((_, i) => i).sort((a, b) => Math.abs(signed[a]!) - Math.abs(signed[b]!) || a - b);
  const rankOf = new Int32Array(outline.length);
  rank.forEach((i, r) => {
    rankOf[i] = r;
  });
  const work: FaceWork = { probes: 0, loopTests: 0 };
  const pointBox = (p: Point): GridBox => ({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y });

  /** The innermost loop around `p` (smallest first, first winding hit), or -1. */
  const innermost = (p: Point, skip = -1): number => {
    work.probes++;
    const cands: number[] = [];
    loopIndex.forEach(pointBox(p), (i) => {
      if (i !== skip && inBox(boxes[i]!, p)) cands.push(i);
    });
    cands.sort((a, b) => rankOf[a]! - rankOf[b]!);
    for (const i of cands) {
      work.loopTests++;
      if (loopWinding(outline[i]!, p) !== 0) return i;
    }
    return -1;
  };

  // The containment tree: a loop's parent is the innermost OTHER loop around a point of it.
  // The loops never cross, so any point on a loop (here its first edge's middle) has the same
  // parent; a point on a shared pinch vertex is avoided by taking an edge's middle.
  const parent = outline.map((l, i) => {
    const first = l[0];
    if (!first) return -1;
    const p = edgeMid(first);
    const cands: number[] = [];
    loopIndex.forEach(pointBox(p), (j) => {
      if (j !== i && rankOf[j]! > rankOf[i]! && inBox(boxes[j]!, p)) cands.push(j);
    });
    cands.sort((a, b) => rankOf[a]! - rankOf[b]!);
    for (const j of cands) if (loopWinding(outline[j]!, p) !== 0) return j;
    return -1;
  });
  const children = outline.map(() => [] as number[]);
  parent.forEach((pj, i) => {
    if (pj >= 0) children[pj]!.push(i);
  });

  // Holes, smallest first.
  const holes = rank.filter((i) => signed[i]! < 0);
  const holeOf = new Int32Array(outline.length).fill(-1);
  holes.forEach((i, k) => {
    holeOf[i] = k;
  });

  const solid = (p: Point): boolean => {
    const i = innermost(p);
    return i >= 0 && signed[i]! > 0;
  };
  const faceAt = (p: Point): number => {
    const i = innermost(p);
    return i >= 0 ? holeOf[i]! : -1;
  };
  const loopsNear = (box: GridBox): EdgeLoop[] =>
    loopIndex
      .queryBox(box)
      .filter((i) => boxesMeet(boxes[i]!, box, 0))
      .sort((a, b) => a - b)
      .map((i) => outline[i]!);

  // ── The budget, charged before any face or room is measured. ──
  const faceCurveCounts = holes.map(
    (i) => outline[i]!.length + children[i]!.reduce((n, c) => n + outline[c]!.length, 0),
  );
  const faceCurves = faceCurveCounts.reduce((a, b) => a + b, 0);
  if (faceCurves > FACE_BUDGET_CAPS.faceCurves) return { refused: "too-many-face-curves", count: faceCurves };
  const coverBoxes = cover.map(roomBoxOf);
  let faceRooms = 0;
  // Each measurement probes both sides of every piece it walks (2 × pieces), and each probe
  // costs the loops it can meet (`loopsPerCell`, per point test) plus a walk over the ring
  // vertices of every room it asks about. Charged as that product, before any of it runs.
  const L = Math.max(1, loopsPerCell);
  let candidateTests = 0;
  holes.forEach((i, k) => {
    let meet = 0;
    let curves = faceCurveCounts[k]!;
    let vertices = 0;
    cover.forEach((r, q) => {
      if (boxesMeet(coverBoxes[q]!, boxes[i]!, 0)) {
        meet++;
        curves += roomCurveCount(r);
        vertices += roomCurveCount(r);
      }
    });
    faceRooms += meet;
    // The face's own area (one point test per probe), then its cover (a point test and every
    // nearby room's inside test per probe).
    candidateTests += 2 * piecesBound(faceCurveCounts[k]!) * L + 2 * piecesBound(curves) * (L + vertices);
  });
  if (faceRooms > FACE_BUDGET_CAPS.faceRooms) return { refused: "too-many-face-rooms", count: faceRooms };
  let roomCurves = 0;
  for (const r of rooms) {
    const b = roomBoxOf(r);
    let c = roomCurveCount(r);
    for (const i of loopIndex.queryBox(b)) if (boxesMeet(boxes[i]!, b, 0)) c += outline[i]!.length;
    roomCurves += c;
    // Two measurements per room (outside, and inside faces), each probe two point tests and
    // the room's own inside test.
    candidateTests += 2 * 2 * piecesBound(c) * (2 * L + roomCurveCount(r));
  }
  if (roomCurves > FACE_BUDGET_CAPS.roomCurves) return { refused: "too-many-room-curves", count: roomCurves };
  if (candidateTests > FACE_BUDGET_CAPS.candidateTests)
    return { refused: "too-many-candidate-tests", count: candidateTests };
  const budget: FaceBudget = { loopsPerCell, candidateTests, faceCurves, faceRooms, roomCurves };

  const faces: WallFace[] = [];
  holes.forEach((i, k) => {
    const curves = [...curvesOfLoop(outline[i]!), ...children[i]!.flatMap((c) => curvesOfLoop(outline[c]!))];
    const box = boxes[i]!;
    const area =
      curves.length > MAX_NET_CURVES
        ? Number.NaN
        : regionBoundary(curves, (p) => faceAt(p) === k, { x: box.minX, y: box.minY });
    faces.push({ loop: outline[i]!, box, area, curves });
  });
  return { outline, faces, solid, faceAt, loopsNear, budget, work };
}

/** What {@link faceCover} measures for one face. */
export interface FaceCover {
  /** The face's floor area (mm²). */
  area: number;
  /** The part of it no room covers (mm²). */
  unassigned: number;
  /** Indices (into the `rooms` given) of the rooms whose edge bounds the unassigned floor. */
  bordering: number[];
}

/**
 * How much of face `fi` no room covers, and which rooms border what is left — or `null`
 * when the face is not measured (too many curves, or a figure out of range).
 */
export function faceCover(wf: WallFaces, fi: number, rooms: readonly FaceRoom[]): FaceCover | null {
  const f = wf.faces[fi]!;
  if (!(f.area > 0)) return null;
  const regions: Array<{ k: number; reg: RoomRegion }> = [];
  rooms.forEach((r, k) => {
    const reg = roomRegion(r);
    if (reg.gross > 0 && boxesMeet(reg.box, f.box, 0)) regions.push({ k, reg });
  });
  const curves = [...f.curves];
  const owner: number[] = f.curves.map(() => -1);
  for (const { k, reg } of regions) {
    for (const c of reg.curves) {
      curves.push(c);
      owner.push(k);
    }
  }
  if (curves.length > MAX_NET_CURVES) return null;
  const bordering = new Set<number>();
  const unassigned = regionBoundary(
    curves,
    (p) => wf.faceAt(p) === fi && !regions.some(({ reg }) => reg.inside(p)),
    { x: f.box.minX, y: f.box.minY },
    (piece: BoundaryPiece) => {
      const k = owner[piece.curve]!;
      if (k >= 0) bordering.add(k);
    },
  );
  const eps = 1e-9 * f.area + 1e-3;
  if (!Number.isFinite(unassigned) || unassigned < -eps || unassigned > f.area + eps) return null;
  return {
    area: f.area,
    unassigned: Math.min(f.area, Math.max(0, unassigned)),
    bordering: [...bordering].sort((a, b) => a - b),
  };
}

/** What {@link roomOutside} measures for one room. */
export interface RoomOutside {
  /** The room's floor area (mm²), from its own shape. */
  gross: number;
  /** The part of it inside some walled face (mm²). */
  inFaces: number;
  /** The part of it off every face and every wall body: outside the building (mm²). */
  area: number;
  /** The farthest room-ring vertex outside, from the nearest wall face (mm); 0 for a circle. */
  depth: number;
}

/**
 * Where a room's floor lies against the walls: how much is inside walled faces and how much is
 * off every face and every wall body (outside the building) — or `null` when it is not
 * measured (too many curves, or a figure out of range).
 */
export function roomOutside(wf: WallFaces, r: FaceRoom): RoomOutside | null {
  const reg = roomRegion(r);
  if (!(reg.gross > 0)) return { gross: 0, inFaces: 0, area: 0, depth: 0 };
  const near = wf.loopsNear(reg.box);
  const curves = [...reg.curves, ...near.flatMap(curvesOfLoop)];
  if (curves.length > MAX_NET_CURVES) return null;
  const off = (p: Point): boolean => !wf.solid(p) && wf.faceAt(p) < 0;
  const origin = { x: reg.box.minX, y: reg.box.minY };
  const area = regionBoundary(curves, (p) => reg.inside(p) && off(p), origin);
  const inFaces = regionBoundary(curves, (p) => reg.inside(p) && wf.faceAt(p) >= 0, origin);
  const eps = 1e-9 * reg.gross + 1e-3;
  for (const v of [area, inFaces]) if (!Number.isFinite(v) || v < -eps || v > reg.gross + eps) return null;
  let depth = 0;
  if (!r.circle) {
    const ring = r.poly ?? rectRing({ x: r.at.x, y: r.at.y, w: r.size.w, h: r.size.h });
    for (const v of ring) {
      if (!off(v)) continue;
      let d = Number.POSITIVE_INFINITY;
      for (const l of near)
        for (const e of l) d = Math.min(d, e.t === "line" ? distPointToSegment(v, e.a, e.b) : distPointToArc(v, e.arc));
      if (Number.isFinite(d)) depth = Math.max(depth, d);
    }
  }
  const clamp = (v: number): number => Math.min(reg.gross, Math.max(0, v));
  return { gross: reg.gross, inFaces: clamp(inFaces), area: clamp(area), depth };
}
