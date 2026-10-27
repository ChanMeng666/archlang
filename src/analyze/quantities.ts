/**
 * `describe --facts quantities` and `arch takeoff`: the geometric quantities of one storey, as an
 * estimator reads them. Geometry only, never a claim: every figure is a length, an area or a count
 * measured from the shapes, and its convention is in its field name (`_centreline_`, `_face_`,
 * `_net_`, `_before_openings_`). The definitions are `docs/analysis.md` § Quantities; in short:
 *
 * - `length_centreline_mm`: the sum of a wall's segment lengths along its centreline (an arc by
 *   its arc length; a closed run includes its closing segment).
 * - `length_face_mm`: the length of the OUTLINE of the storey's wall solid: the union of every
 *   wall's band (`wallBand()`, the solid the drawing draws before openings are cut: faces at ±
 *   half the thickness, square caps at a free end, mitred joints, true arcs). Both sides of a wall
 *   count, an exposed end cap counts, and a stretch of face inside another wall's solid (a
 *   partition's end in an exterior wall, the overlap of two caps at a corner) does not. Openings
 *   do not shorten a face. Each piece of the outline is credited to the wall whose band edge it
 *   lies on; where two walls' edges coincide, to the wall first in `ir.walls` (source) order.
 * - `perimeter_centreline_mm`: the room's own shape's perimeter (a rectangle, a polygon's ring, a
 *   circle's circumference). `perimeter_net_mm`: the perimeter of the room's NET floor, the room
 *   less every wall band (ADR 0027's region), so a wall on the edge moves it to the wall's face.
 * - `face_area_before_openings_m2`: per wall, its face length times its own height; reported only
 *   when the plan authors a height (`ResolvedPlan._heightsAuthored`).
 * - `floor_area_with_waste_m2`: the storey's net floor area times `1 + waste/100`, only when the
 *   caller passes a waste percentage. Never a default.
 *
 * Exact or omitted, as net area is (ADR 0027 §2): the outline is measured by the boundary walk of
 * `net-area.ts` ({@link regionBoundary}), every crossing in closed form, no sampling and no bounding
 * box in a figure. Past {@link MAX_FACE_CURVES} band edges, or {@link MAX_NET_PROBE_WORK} counted
 * probe work, a storey's face lengths are omitted with a reason; a room's net perimeter past the
 * per-room caps is omitted (its key absent). Pure, synchronous, deterministic; reads only.
 */

import type { Point } from "../ast.js";
import { arcLength } from "../geometry/arc.js";
import { type EdgeLoop, loopBBox, loopsContain, PointInterner, wallBand } from "../geometry/band.js";
import type { GridBox } from "../geometry/grid-index.js";
import { segmentsOfWall } from "../geometry.js";
import type { RDoor, ResolvedPlan, RRoom, RWall, RWindow } from "../ir.js";
import { fmt0 } from "../num-format.js";
import { memoRoomNetAreaMm2, storeyNetAreaBands } from "./net-area-memo.js";
import {
  boxesMeet,
  type Curve,
  curvesOfLoop,
  MAX_NET_CURVES,
  MAX_NET_PROBE_WORK,
  type NetAreaBand,
  netAreaProbeWork,
  pieceCount,
  regionBoundary,
  roomRegion,
  splitCurves,
} from "./net-area.js";

/**
 * The most band edges one storey's wall outline may read. The split is quadratic in them; past
 * it the storey's face lengths are omitted (`faces_omitted: "too-many-edges"`). The largest
 * shipped storey reads well under a tenth of it (pinned in `test/describe-quantities.test.ts`).
 */
export const MAX_FACE_CURVES = 8000;

/** One wall category on a storey. */
export interface WallQuantity {
  category: string;
  /** How many wall statements (or derived runs) of this category stand on the storey. */
  count: number;
  /** Sum of centreline lengths, whole mm. */
  length_centreline_mm: number;
  /** Length of the wall solid's exposed outline credited to this category, whole mm. Absent when
   *  the storey's faces are omitted ({@link QuantityFacts.faces_omitted}). */
  length_face_mm?: number;
  /** Σ face length × the wall's own height, m², openings not deducted. Present only when the plan
   *  authors a height, and the faces are measured. */
  face_area_before_openings_m2?: number;
}

/** One room's perimeters. */
export interface RoomQuantity {
  id: string;
  /** The room's own shape's perimeter, whole mm. */
  perimeter_centreline_mm: number;
  /** The perimeter of its net floor (the room less every wall band), whole mm; absent when omitted. */
  perimeter_net_mm?: number;
  /** The room's net area, as `rooms[].net_area_m2` reports it; absent when omitted. */
  area_net_m2?: number;
}

/** Doors of one kind and one width. */
export interface DoorQuantity {
  kind: string;
  width_mm: number;
  count: number;
}

/** Windows of one width. */
export interface WindowQuantity {
  width_mm: number;
  count: number;
}

/** One storey's quantities (`describe().quantities`, and each `levels[].quantities`). */
export interface QuantityFacts {
  /** Per wall category, sorted by category name. */
  walls: WallQuantity[];
  /** Why no `length_face_mm` is reported on this storey; absent when the faces are measured. */
  faces_omitted?: "too-many-edges" | "too-much-work";
  /** Per room, in source order. */
  rooms: RoomQuantity[];
  /** `totals.net_floor_area_m2`; absent when that is. */
  floor_area_net_m2?: number;
  /** The waste percentage the caller passed; absent when none was. */
  waste_pct?: number;
  /** `floor_area_net_m2 × (1 + waste_pct / 100)`, rounded to 2 dp; only with a waste percentage. */
  floor_area_with_waste_m2?: number;
  /** Per door kind and width, sorted by kind, then width. */
  doors: DoorQuantity[];
  /** Per window width, ascending. */
  windows: WindowQuantity[];
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
/** Whole millimetres, through the one number formatter. */
const mm = (n: number): number => Number(fmt0(n));
/** Plain code-unit order, never locale-dependent. */
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A wall's centreline length (mm): its segments, arcs by their arc length. */
export function wallCentrelineLength(w: RWall): number {
  let n = 0;
  for (const s of segmentsOfWall(w)) n += s.arc ? arcLength(s.arc) : Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
  return n;
}

/**
 * Each wall's share of the storey's wall-solid outline (mm), by index into `walls`, or why it is
 * omitted. See the module header for the definition.
 */
export function wallFaceLengths(
  walls: readonly RWall[],
): { ok: true; byWall: number[] } | { ok: false; reason: "too-many-edges" | "too-much-work" } {
  const intern = new PointInterner();
  const bands: Array<{ loops: EdgeLoop[]; box: GridBox }> = [];
  const curves: Curve[] = [];
  const owner: number[] = [];
  walls.forEach((w, i) => {
    const loops = wallBand(w, intern);
    if (loops.length === 0) return;
    const boxes = loops.map(loopBBox);
    bands.push({
      loops,
      box: {
        minX: Math.min(...boxes.map((b) => b.minX)),
        minY: Math.min(...boxes.map((b) => b.minY)),
        maxX: Math.max(...boxes.map((b) => b.maxX)),
        maxY: Math.max(...boxes.map((b) => b.maxY)),
      },
    });
    for (const l of loops)
      for (const c of curvesOfLoop(l)) {
        curves.push(c);
        owner.push(i);
      }
  });
  const byWall = walls.map(() => 0);
  if (curves.length === 0) return { ok: true, byWall };
  if (curves.length > MAX_FACE_CURVES) return { ok: false, reason: "too-many-edges" };
  const splits = splitCurves(curves);
  // Every probe may ask every band (its box, then its edges); charged before the walk.
  if (netAreaProbeWork(pieceCount(splits), bands.length + curves.length, 0) > MAX_NET_PROBE_WORK)
    return { ok: false, reason: "too-much-work" };
  const inSolid = (p: Point): boolean =>
    bands.some(
      (b) =>
        p.x >= b.box.minX && p.x <= b.box.maxX && p.y >= b.box.minY && p.y <= b.box.maxY && loopsContain(b.loops, p),
    );
  regionBoundary(
    curves,
    inSolid,
    { x: 0, y: 0 },
    (piece) => {
      byWall[owner[piece.curve]!]! += piece.length;
    },
    splits,
  );
  return { ok: true, byWall };
}

/** A room's centreline perimeter (mm): the length of its own boundary curves. */
function curvesLength(curves: readonly Curve[]): number {
  let n = 0;
  for (const c of curves) n += c.t === "line" ? Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y) : arcLength(c.arc);
  return n;
}

/**
 * The perimeter (mm) of a room's net floor — the room less every wall band — or `undefined` when
 * it is omitted under net area's own caps ({@link MAX_NET_CURVES}, {@link MAX_NET_PROBE_WORK}).
 */
export function roomNetPerimeter(r: RRoom, bands: readonly NetAreaBand[]): number | undefined {
  const region = roomRegion(r);
  if (!(region.gross > 0)) return 0;
  const near = bands.filter((b) => boxesMeet(b.box, region.box, 0));
  if (near.length === 0) return curvesLength(region.curves);
  const inBands = (p: Point): boolean =>
    near.some(
      (b) =>
        p.x >= b.box.minX && p.x <= b.box.maxX && p.y >= b.box.minY && p.y <= b.box.maxY && loopsContain(b.loops, p),
    );
  const curves: Curve[] = [...region.curves, ...near.flatMap((b) => b.loops.flatMap(curvesOfLoop))];
  if (curves.length > MAX_NET_CURVES) return undefined;
  const splits = splitCurves(curves);
  const bandEdges = near.reduce((n, b) => n + b.loops.reduce((m, l) => m + l.length, 0), 0);
  if (netAreaProbeWork(pieceCount(splits), near.length + bandEdges, region.insideCost) > MAX_NET_PROBE_WORK)
    return undefined;
  let len = 0;
  regionBoundary(
    curves,
    (p) => region.inside(p) && !inBands(p),
    { x: region.box.minX, y: region.box.minY },
    (piece) => {
      len += piece.length;
    },
    splits,
  );
  return Number.isFinite(len) ? len : undefined;
}

/**
 * `floor × (1 + pct/100)` to 2 dp, decided on the floor's hundredths so an integer percentage of a
 * printed figure gives the figure a reader computes by hand.
 */
export function withWaste(floorM2: number, pct: number): number {
  return Math.round((Math.round(floorM2 * 100) * (100 + pct)) / 100) / 100;
}

/** One storey's quantities. `wastePct`, when given, is a finite, non-negative percentage. */
export function quantityFacts(ir: ResolvedPlan, wastePct?: number): QuantityFacts {
  // Walls by category.
  const faces = wallFaceLengths(ir.walls);
  const heights = ir._heightsAuthored === true;
  const cats = new Map<string, { count: number; centre: number; face: number; area: number }>();
  ir.walls.forEach((w, i) => {
    const c = cats.get(w.category) ?? { count: 0, centre: 0, face: 0, area: 0 };
    c.count++;
    c.centre += wallCentrelineLength(w);
    if (faces.ok) {
      c.face += faces.byWall[i]!;
      c.area += faces.byWall[i]! * w.height;
    }
    cats.set(w.category, c);
  });
  const walls: WallQuantity[] = [...cats.entries()]
    .sort(([a], [b]) => byText(a, b))
    .map(([category, c]) => ({
      category,
      count: c.count,
      length_centreline_mm: mm(c.centre),
      ...(faces.ok ? { length_face_mm: mm(c.face) } : {}),
      ...(faces.ok && heights ? { face_area_before_openings_m2: r2(c.area / 1_000_000) } : {}),
    }));

  // Rooms: the same rooms, bands and rounding `describe().rooms[]` reads.
  const bands = storeyNetAreaBands(ir.walls);
  const roomEls = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const rooms: RoomQuantity[] = roomEls.map((r) => {
    const net = memoRoomNetAreaMm2(r, bands);
    const per = roomNetPerimeter(r, bands);
    return {
      id: r.id,
      perimeter_centreline_mm: mm(curvesLength(roomRegion(r).curves)),
      ...(per !== undefined ? { perimeter_net_mm: mm(per) } : {}),
      ...(net !== undefined ? { area_net_m2: r2(net / 1_000_000) } : {}),
    };
  });
  const floor = rooms.every((r) => r.area_net_m2 !== undefined)
    ? r2(rooms.reduce((s, r) => s + (r.area_net_m2 ?? 0), 0))
    : undefined;

  // Openings: doors by kind and width, windows by width.
  const doorRows = new Map<string, DoorQuantity>();
  const windowRows = new Map<number, WindowQuantity>();
  for (const e of ir.elements) {
    if (e.kind === "door") {
      const d = e as RDoor;
      const kind = d.doorKind ?? "hinged";
      const width_mm = mm(d.width);
      const key = `${kind}|${width_mm}`;
      const row = doorRows.get(key) ?? { kind, width_mm, count: 0 };
      row.count++;
      doorRows.set(key, row);
    } else if (e.kind === "window") {
      const width_mm = mm((e as RWindow).width);
      const row = windowRows.get(width_mm) ?? { width_mm, count: 0 };
      row.count++;
      windowRows.set(width_mm, row);
    }
  }
  const doors = [...doorRows.values()].sort((a, b) => byText(a.kind, b.kind) || a.width_mm - b.width_mm);
  const windows = [...windowRows.values()].sort((a, b) => a.width_mm - b.width_mm);

  return {
    walls,
    ...(faces.ok ? {} : { faces_omitted: faces.reason }),
    rooms,
    ...(floor !== undefined ? { floor_area_net_m2: floor } : {}),
    ...(wastePct !== undefined ? { waste_pct: wastePct } : {}),
    ...(wastePct !== undefined && floor !== undefined ? { floor_area_with_waste_m2: withWaste(floor, wastePct) } : {}),
    doors,
    windows,
  };
}
