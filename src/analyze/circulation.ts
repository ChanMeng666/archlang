/**
 * Circulation as FACTS: not just "can you reach this room?" (that is the door
 * access graph in analyze.ts and the per-room reachable-floor flood-fill in
 * occupancy.ts) but **how far, how wide and how direct** the walk is — from the
 * building's entrance to each room, and along a few key functional routes.
 *
 * The model is a whole-plan **navigation grid** with the same discipline as
 * occupancy.ts (one cell size for the whole plan — derived closed-form from its area by
 * {@link navCellSizeMm}, so RESOLUTION rather than cell count is what is held steady —
 * integer cell coordinates, source-ordered seeds, row-major iteration — never a float as
 * a key). Three things make it a *walking* model rather than a bare reachability one:
 *
 *   - WALLS BLOCK, DOORS CARVE. Walls are rasterised as blocked cells — every cell whose
 *     centre the band covers, and every cell the centreline passes through, so a wall
 *     thinner than a cell still blocks (room membership alone would let adjacent rooms leak
 *     into each other along their whole shared edge); each connector then carves a
 *     threshold slit between the two rooms' nearest free cells. Rooms connect only
 *     where a real door/opening is.
 *   - CLEARANCE EROSION. A cell is walkable only if its centre is farther than a body
 *     radius (default 300 mm) from every furniture footprint — obstacles are inflated
 *     by the space a person occupies, so a path is one a body actually fits through.
 *     An **underlay** (a rug) is not one of those footprints: you walk on it, so
 *     `solidFurniture` drops it before anything is inflated.
 *   - CLEARANCE IS DISTANCE TO FURNITURE, NOT WALLS. Inside a room you walk freely, so
 *     a cell's clear width comes from a distance transform seeded on the furniture-
 *     eroded cells; a doorway cell instead reads its connector's modeled clear width.
 *     Only doors and furniture pinches ever narrow the way — never a room wall. The
 *     transform measures how far a BODY'S CENTRE may move, because the cells it is
 *     seeded from are already inflated by the body radius, so the width a body actually
 *     passes through is that freedom **plus the body's own diameter** — see
 *     {@link centreFreedomToClearWidth}. Leaving the diameter off subtracted the body
 *     twice and reported a 900 mm corridor as 300 mm.
 *
 * Distances come from a deterministic 4-connected uniform-cost BFS (shortest walk).
 * The bottleneck is a widest-path (max-min clearance) — the *unavoidable* squeeze on
 * the best route into a room, the cell-grid analogue of the access graph's widest-path
 * clear width, not the min along one shortest path (which degenerates wherever the path
 * hugs a wall). These are honest **coarse** numbers, rounded deterministically; facts
 * for an agent to read, never a layout the compiler generates (ADR 0005/0006/0008).
 * Pure, synchronous, zero-dependency.
 */

import type { RRoom, RDoor, ROpening, RFurniture, RVoid, RWall } from "../ir.js";
import type { Point } from "../ast.js";
import {
  entryEdges,
  outsideOpenEdge,
  roomOfVertical,
  type RVertical,
  type VerticalObstacle,
  verticalObstacles,
  verticalRect,
} from "../vertical.js";
import {
  accessDigraph,
  reachFrom,
  rectOf,
  roomBox,
  roomUses,
  isBedroom,
  isKitchen,
  isWetRoom,
  EXTERIOR_NODE,
  type AccessGraph,
  type BBox,
  type RoomBox,
} from "../analyze.js";
import { pointInRect } from "../geometry/rect.js";
import { type Arc, arcContainsRay, arcExtremes, distPointToArc } from "../geometry/arc.js";
import {
  distToPolygonEdge,
  pointInPolygon,
  polygonCentroid,
  polygonEdges,
  polygonLabelPoint,
} from "../geometry/polygon.js";
import { matchesLivingDining } from "../vocabulary.js";
import { solidFurniture } from "../fixtures-catalog.js";
import { neighbours4 } from "./grid.js";

/** Radius (mm) of the walking body obstacles are inflated by (clearance erosion). */
export const DEFAULT_BODY_RADIUS_MM = 300;

/**
 * Nav-grid resolution. The knob is a **target cell SIZE bounded by a total cell
 * BUDGET**, not a fixed cell count: `cell = max(MIN_CELL_MM, ceil(sqrt(area /
 * MAX_CELLS)))`, so resolution scales with the plan's area instead of being divided
 * out of it (ADR 0008 addendum). A fixed count made every measurement scale-relative —
 * at 100 × 60 m the cell reached ~775 mm, so a 900 mm door was one cell, the 300 mm
 * body-radius erosion was a third of a cell, and every clear width quantised to the
 * same number: a compliant 1.8 m corridor and an illegal 0.9 m one read identically.
 *
 * `MIN_CELL_MM` keeps a dwelling at exactly the resolution it has always had (any plan
 * up to MAX_CELLS · MIN_CELL_MM² = 2500 m² sits on 100 mm cells), and `MAX_CELLS` caps
 * the work: total cells ≈ area / cell² ≤ MAX_CELLS whichever branch wins, so the budget
 * alone bounds the grid and **no per-axis clamp is needed** — a per-axis cap would
 * re-introduce exactly the scale-relative quantisation this replaces (it silently
 * coarsened one axis of a long building).
 */
const MIN_CELL_MM = 100;
const MAX_CELLS = 250_000;

/**
 * The nav-grid cell size (mm) for a plan of `areaMm2` — the one place the whole-plan
 * grid's resolution is decided. Closed-form, integral and monotonic in the area, so it
 * is deterministic and stable: the same plan always grids the same way.
 */
export function navCellSizeMm(areaMm2: number): number {
  return Math.max(MIN_CELL_MM, Math.ceil(Math.sqrt(areaMm2 / MAX_CELLS)));
}

/**
 * Convert a cell's **body-centre freedom** — `hops` 4-connected steps from the nearest
 * clearance-eroded cell — into the clear width a walking body passes through there.
 *
 * The erosion has already inflated every obstacle by `bodyRadius`, so a free cell marks
 * where a body's CENTRE may stand and `(2·hops − 1)·cell` is the width of that centre
 * band, not of the passage. The passage is wider by exactly one body diameter, which is
 * the term this adds. Closed form, exact by construction and monotone in `hops`: leaving
 * it off subtracted the body radius twice and reported a 900 mm corridor as 300 mm, a
 * number nothing in the corridor had.
 *
 * A corollary worth stating rather than discovering: under this model no walkable route
 * can be narrower than `2·bodyRadius`, because a narrower one has no free cell at all
 * and is *sealed* rather than tight — which is why a sealed room is a reported fact
 * ({@link CirculationModel.blocked}) carrying the width of the best way in, and not an omission.
 */
export function centreFreedomToClearWidth(hops: number, cellMm: number, bodyRadiusMm: number): number {
  return Math.max(0, 2 * hops - 1) * cellMm + 2 * bodyRadiusMm;
}

/** Circulation facts for one room, measured from its NEAREST building entrance. */
export interface RoomCirculation {
  roomId: string;
  /** Walking distance (mm) from the room's nearest entrance to the room's centre-nearest
   *  free cell, over the clearance-eroded nav grid — one multi-source walk seeded at
   *  every entrance at once. Grid-quantized to `cellSizeMm`; coarse. */
  walkDistanceMm: number;
  /** Narrowest unavoidable clear width (mm) on the widest route from ANY entrance into
   *  the room — a modeled door width, or a furniture pinch. Coarse and grid-quantized. */
  bottleneckClearWidthMm: number;
  /** walkDistance ÷ straight-line (the room's own entrance threshold → room target).
   *  ≥ ~1; 2 dp. */
  detourRatio: number;
  /** The entrance this room's walk is measured from: the nearest one, ties to the
   *  lowest entrance index. **Present only when the plan has more than one entrance**,
   *  so a single-entrance plan keeps the bytes it had (append-only). */
  entranceId?: string;
}

/** A key functional route between two rooms (e.g. kitchen → living). */
export interface CirculationRoute {
  fromRoomId: string;
  toRoomId: string;
  walkDistanceMm: number;
  bottleneckClearWidthMm: number;
  detourRatio: number;
}

/** The whole-plan circulation model. Null from {@link computeCirculation} when the
 *  plan has no modeled exterior entrance and no shaft arrives on it (nothing to measure
 *  a walk from). */
export interface CirculationModel {
  /** The first entrance in source order. With one entrance it is the door every walk
   *  is measured from; with several, each room carries its own
   *  ({@link RoomCirculation.entranceId}) — its nearest. On a storey with no front door
   *  that a shaft reaches, the entrances are the arriving runs, and this is a run's id. */
  entranceId: string;
  /** Nav-grid cell size (mm) — the quantum every distance is rounded to. */
  cellSizeMm: number;
  /** Body radius (mm) obstacles were inflated by. */
  bodyRadiusMm: number;
  /** One entry per room reachable from any entrance on the walkable grid (source order). */
  rooms: RoomCirculation[];
  /** Key functional routes (kitchen → nearest living/dining, bedroom → nearest bath). */
  routes: CirculationRoute[];
  /**
   * Rooms the modeled doors DO reach from an entrance but the WALKABLE grid does not —
   * furniture and its clearances leave no way in a body fits through, so the room has no
   * `rooms[]` entry. Source order; **present only when non-empty**, so a plan with
   * nothing sealed keeps the summary bytes it had.
   *
   * Without it the absence would be the whole report: a sealed room would simply fall
   * out of `rooms[]` and `W_PATH_TOO_NARROW`, whose domain is that array, would go
   * silent — a plan would get *cleaner* as an obstacle grew. A room
   * with no door path at all is NOT listed here; that is `W_ROOM_UNREACHABLE`'s fact.
   */
  blocked?: BlockedRoom[];
  /**
   * Rooms with no `rooms[]` entry that {@link CirculationModel.blocked} does NOT claim —
   * each with the reason the model could not measure a walk to it. Source order;
   * **present only when non-empty**, so a plan whose every room measures keeps the
   * summary bytes it had.
   *
   * This exists because the ABSENCE was the whole report. A consumer got circulation
   * facts for five of seven rooms and nothing telling it two were missing, and could
   * not tell "this room is fine, we just could not measure it" from "nothing can walk in
   * here". `blocked` cannot carry them:
   * that key means *sealed by furniture*, a real plan defect with a piece to move, and
   * widening it to mean "we did not measure this" would manufacture exactly the false
   * positive its furniture-free control exists to prevent.
   *
   * Together with `rooms[]` and `blocked[]` this is TOTAL: every room in the plan's
   * `rooms[]` appears in exactly one of the three whenever `circulation` is non-null.
   * (A plan with no modeled entrance has no `circulation` at all — nothing to attach a
   * reason to, and `W_NO_ENTRANCE` is the fact.)
   */
  unmeasured?: UnmeasuredRoom[];
}

/**
 * Why one room has no measured walk. A closed set — DIFFERENT facts, not shades of
 * "unknown", and each names the thing a reader would have to change:
 *
 *  - `no_door_route` — the modeled doors do not connect it to the exterior at all, so
 *    there is no walk to measure. `W_ROOM_UNREACHABLE`'s subject; `access.rooms[]`
 *    carries `reachable: false` for the same room.
 *  - `below_grid_resolution` — the room is smaller than one nav-grid cell, so it holds
 *    no cell centre and the grid cannot see it. A resolution limit, not a plan defect;
 *    `W_ROOM_TOO_SMALL`'s subject.
 *  - `other_entrance` — RETIRED, never emitted. It named a room walkable only from an
 *    entrance other than the first, back when every walk was measured from
 *    `entrances[0]`. Every walk is now measured from the room's NEAREST entrance (one
 *    multi-source search), so a room any entrance reaches is measured. Kept in the type
 *    so a consumer's exhaustive `switch` still compiles (append-only).
 *  - `no_threshold` — no doorway of this room ever became a carved opening in the
 *    walkable grid: every threshold across its connectors was refused because something
 *    stands in the run on one side or the other. `garden-house`'s study is the specimen
 *    — its one door opens onto the flank of a stair, whose clearance covers the hall
 *    side of the opening. Not `blocked`, because the obstruction is not furniture and
 *    the message would name the wrong element to move.
 *  - `unreachable` — thresholds exist and no entrance reaches it, and the same plan
 *    with its furniture removed does not reach it either, so furniture is not the cause
 *    and `blocked` would be a fiction.
 */
export type UnmeasuredReason =
  | "no_door_route"
  | "below_grid_resolution"
  | "other_entrance"
  | "no_threshold"
  | "unreachable";

/** One room the circulation model could not measure, and why. */
export interface UnmeasuredRoom {
  roomId: string;
  reason: UnmeasuredReason;
}

/** A room no route reaches, and the width of the best way in that does exist. */
export interface BlockedRoom {
  roomId: string;
  /**
   * The widest way in, in mm — the largest body that DOES reach the room, measured by
   * {@link CirculationModel.bodyRadiusMm}'s own ruler rather than asserted.
   *
   * A sealed room has no widest-path reading, because the widest path never arrives; the
   * temptation is then to print 0, and 0 is a fabrication whenever a real gap exists. So
   * the number is MEASURED: re-run the same grid with a smaller body and see which one gets there. The rungs are half a cell apart, so the
   * answer is a whole cell of width, and it is monotone in an obstacle's depth for the
   * same reason the reachable reading is — a deeper obstacle can only admit a smaller
   * body.
   *
   * **0 means what it says**: not even a point-sized body finds a gap at this grid's
   * resolution. That is the only case the diagnostic calls a seal.
   */
  widestWayInMm: number;
}

/** Rooms that read as a living or dining space (declared use, else a label match —
 *  analyze.roomUses only infers bedroom/bath/kitchen/hall/entry from a label, so the
 *  living/dining label check is the shared `living` use vocabulary). */
const isLivingOrDining = (r: RRoom): boolean => {
  const u = roomUses(r);
  return u.has("living") || u.has("dining") || matchesLivingDining(r.label ?? r.id);
};

const r2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Euclidean distance from a point to the nearest edge of an axis-aligned rect
 *  (0 inside). Used to inflate furniture footprints by the body radius. */
function distPointToRect(px: number, py: number, r: BBox): number {
  const dx = Math.max(r.x - px, px - (r.x + r.w), 0);
  const dy = Math.max(r.y - py, py - (r.y + r.h), 0);
  return Math.hypot(dx, dy);
}

/** @internal The whole-plan nav grid; exported only so the grid searches' signatures can be. */
export interface NavGrid {
  minX: number;
  minY: number;
  cell: number;
  nx: number;
  ny: number;
  /** 1 when the cell centre is walkable (in a room, clear of eroded obstacles, or a
   *  carved threshold). */
  free: Uint8Array;
  /** Room index containing the cell centre, or −1 (walls / carved thresholds). */
  roomIdx: Int32Array;
  /** Clear width (mm) at the cell — coarse, from the distance-to-obstacle field. */
  clearMm: Float64Array;
  /** Room indices that got at least one CARVED threshold: a connector between two rooms
   *  whose Manhattan run through the wall band was actually opened. A room absent here
   *  has no modeled way in on this grid at all — every threshold across its doorways was
   *  refused, obstructed on one side or the other. Read only to give an unmeasured room
   *  an honest reason ({@link UnmeasuredRoom}); never by the routing itself. */
  carved: Set<number>;
}

/**
 * The cells along one axis whose CLOSED span holds coordinate `v` (relative to the grid's
 * origin), as an inclusive index range, clamped into the grid: one cell, or the two either
 * side of a lattice line `v` lies exactly on. Flooring alone would put a point on a line on
 * its +x/+y side — a page-order choice a turn or a flip does not preserve.
 */
function axisCells(v: number, cell: number, n: number): [number, number] {
  const f = Math.floor(v / cell);
  const hi = clamp(f, 0, n - 1);
  return [f * cell === v ? clamp(f - 1, 0, n - 1) : hi, hi];
}

/**
 * Step inward from a connector on a room edge to the first free cells of that room
 * (mirrors occupancy.ts' inward seeding), as a sorted set of cell indices. Empty when the
 * doorway's inward run is sealed by furniture, so a blocked doorway simply yields no seed.
 *
 * The walk starts from EVERY cell whose closed square holds `at` ({@link axisCells}): one
 * cell for a point strictly inside a cell, and then the set is the single cell the walk
 * reaches; two for a point on a lattice line (four at a crossing), and then it holds what
 * each side's walk reaches. Flooring the point to one cell put a doorway on a line on its
 * +x/+y side, so a turned or flipped plan seeded the other side — the same doorway, a walk
 * origin a cell (or, past eroded cells, several) away. The set is the same however the plan
 * is turned or flipped (backlog E.6/E.7/E.10).
 *
 * A POLYGON room's doorway need not sit on a bounding-box side, so the "step inward
 * perpendicular to that side" walk has no direction to take. Take the room's nearest free
 * cells to the doorway instead — scanned by increasing Chebyshev ring about the cells that
 * hold `at`, keeping EVERY cell at the nearest distance in the first ring that has one (a
 * row-major first would be a page-order pick among equidistant cells).
 *
 * `bandMm` is how far the search may look BEYOND the adjacency tolerance: a connector
 * sits on its host wall's CENTRELINE, so a room's floor begins half a wall thickness
 * away from it and a thick host puts every free cell out of a tolerance-sized reach.
 * The rectangle branch never noticed — it walks perpendicular until it leaves the grid
 * — but the polygon branch is a bounded ring scan, and at `tol` alone it gave up 200 mm
 * short of a 1200 mm drum's floor. Widening a bound that is only consulted when the
 * narrower one found NOTHING is strictly additive: every seed that already resolved
 * resolves to the same cells, because the scan is by increasing ring.
 */
function seedCells(g: NavGrid, at: Point, rb: RoomBox, roomIndex: number, tol: number, bandMm = 0): number[] {
  const [x0, x1] = axisCells(at.x - g.minX, g.cell, g.nx);
  const [y0, y1] = axisCells(at.y - g.minY, g.cell, g.ny);
  if (rb.poly) {
    // Ring 0 is the cells holding `at`, so a point on a line is equidistant, in rings,
    // from both sides of it.
    const ring = (s: number, lo: number, hi: number): number => (s < lo ? lo - s : s > hi ? s - hi : 0);
    const reach = Math.ceil((tol + bandMm) / g.cell) + 2;
    for (let rad = 0; rad <= reach; rad++) {
      let best: number[] = [];
      let bestD = Infinity;
      for (let sy = Math.max(0, y0 - rad); sy <= Math.min(g.ny - 1, y1 + rad); sy++) {
        for (let sx = Math.max(0, x0 - rad); sx <= Math.min(g.nx - 1, x1 + rad); sx++) {
          if (Math.max(ring(sx, x0, x1), ring(sy, y0, y1)) !== rad) continue;
          const k = sy * g.nx + sx;
          if (g.roomIdx[k] !== roomIndex || !g.free[k]) continue;
          const c = centreOf(g, k);
          const d = (c.x - at.x) ** 2 + (c.y - at.y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = [k];
          } else if (d === bestD) best.push(k);
        }
      }
      if (best.length > 0) return best;
    }
    return [];
  }
  const dx = Math.abs(at.x - rb.x) <= tol ? 1 : Math.abs(at.x - (rb.x + rb.w)) <= tol ? -1 : 0;
  const dy = Math.abs(at.y - rb.y) <= tol ? 1 : Math.abs(at.y - (rb.y + rb.h)) <= tol ? -1 : 0;
  const out = new Set<number>();
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) {
      const k = walkInward(g, ix, iy, dx, dy, roomIndex);
      if (k >= 0) out.add(k);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** {@link seedCells}' rectangle walk from one start cell: step (dx, dy) until the first
 *  free cell of the room, or −1 at the grid's edge. */
function walkInward(g: NavGrid, ix: number, iy: number, dx: number, dy: number, roomIndex: number): number {
  for (let step = 0; step < g.nx + g.ny; step++) {
    const sx = clamp(ix + dx * step, 0, g.nx - 1);
    const sy = clamp(iy + dy * step, 0, g.ny - 1);
    const k = sy * g.nx + sx;
    if (g.roomIdx[k] === roomIndex && g.free[k]) return k;
    const atX = dx === 0 || sx === (dx > 0 ? g.nx - 1 : 0);
    const atY = dy === 0 || sy === (dy > 0 ? g.ny - 1 : 0);
    if (atX && atY) break;
  }
  return -1;
}

/** Centre of a cell in mm. */
function centreOf(g: NavGrid, k: number): { x: number; y: number } {
  const ix = k % g.nx;
  const iy = (k - ix) / g.nx;
  return { x: g.minX + (ix + 0.5) * g.cell, y: g.minY + (iy + 0.5) * g.cell };
}

/**
 * Where a person steps off an arriving shaft: the free cells of room `roomIndex` in the ONE
 * row (or column) of cells directly in front of each of the run's entry edges
 * ({@link entryEdges} — a placed run's own `_tail`, so a turned or mirrored flight is
 * stepped off at the image of its authored end). The nav grid already keeps that strip
 * walkable: the run's body-radius halo is lifted outside its entry edges.
 *
 * "In front of" is a predicate on cell centres, so it is the same set however the plan is
 * turned or flipped on a lattice-aligned grid: beyond a `bottom` edge at `y1`, the centres
 * with `y1 < cy ≤ y1 + cell` (`top` mirrors it, `y0 − cell ≤ cy < y0`), and along the edge
 * the centres within its CLOSED span. A cell in that strip that is not free — another
 * obstacle stands on the landing — is no seed, and a run whose whole strip is covered seeds
 * nothing: its landing is sealed, exactly as a front door whose doorway is sealed seeds
 * nothing. Sorted by cell index.
 */
function landingCells(g: NavGrid, v: RVertical, roomIndex: number): number[] {
  const r = verticalRect(v);
  const cx = (ix: number): number => g.minX + (ix + 0.5) * g.cell;
  const cy = (iy: number): number => g.minY + (iy + 0.5) * g.cell;
  /** The cell indices along one axis whose centres satisfy `ok`, scanned over the window
   *  the mm range [lo, hi] covers widened by one cell (the exact test runs per index). */
  const span = (
    lo: number,
    hi: number,
    origin: number,
    n: number,
    c: (i: number) => number,
    ok: (v: number) => boolean,
  ) => {
    const out: number[] = [];
    const i0 = Math.max(0, Math.floor((lo - origin) / g.cell) - 1);
    const i1 = Math.min(n - 1, Math.ceil((hi - origin) / g.cell) + 1);
    for (let i = i0; i <= i1; i++) if (ok(c(i))) out.push(i);
    return out;
  };
  const x0 = r.x;
  const x1 = r.x + r.w;
  const y0 = r.y;
  const y1 = r.y + r.h;
  const along = (a: number, b: number) => (t: number) => t >= a && t <= b;
  const out = new Set<number>();
  for (const e of entryEdges(v)) {
    let xs: number[];
    let ys: number[];
    if (e === "bottom" || e === "top") {
      xs = span(x0, x1, g.minX, g.nx, cx, along(x0, x1));
      ys =
        e === "bottom"
          ? span(y1, y1 + g.cell, g.minY, g.ny, cy, (t) => t > y1 && t <= y1 + g.cell)
          : span(y0 - g.cell, y0, g.minY, g.ny, cy, (t) => t >= y0 - g.cell && t < y0);
    } else {
      ys = span(y0, y1, g.minY, g.ny, cy, along(y0, y1));
      xs =
        e === "right"
          ? span(x1, x1 + g.cell, g.minX, g.nx, cx, (t) => t > x1 && t <= x1 + g.cell)
          : span(x0 - g.cell, x0, g.minX, g.nx, cx, (t) => t >= x0 - g.cell && t < x0);
    }
    for (const iy of ys) {
      for (const ix of xs) {
        const k = iy * g.nx + ix;
        if (g.roomIdx[k] === roomIndex && g.free[k]) out.add(k);
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** The width of a run across the edge(s) it is entered by — the flight a person arrives
 *  over, as a doorway's clear width is the opening they come in through. */
function runWidth(v: RVertical): number {
  const e = entryEdges(v)[0]!;
  return e === "top" || e === "bottom" ? v.size.w : v.size.h;
}

/** The midpoint of a run's first entry edge — the model header's point for a storey walked
 *  from a shaft, as a front door's `at` is for one walked from the street. */
function entryMidpoint(v: RVertical): Point {
  const r = verticalRect(v);
  const e = entryEdges(v)[0]!;
  if (e === "top") return { x: r.x + r.w / 2, y: r.y };
  if (e === "bottom") return { x: r.x + r.w / 2, y: r.y + r.h };
  if (e === "left") return { x: r.x, y: r.y + r.h / 2 };
  return { x: r.x + r.w, y: r.y + r.h / 2 };
}

/** A shaft a storey with no exterior entrance is reached by, and the room it lands in
 *  ({@link roomOfVertical} — the room `verticalReach` names as an arrival room). */
interface ShaftArrival {
  run: RVertical;
  roomId: string;
}

/**
 * The cells a Manhattan carve from seed `a` to seed `b` would open through the wall band
 * that separates them — or null when the run meets a furniture-eroded cell, since we
 * never carve through furniture. Pure: the caller applies the result, so a blocked
 * attempt leaves no half-open slit behind and another threshold point can be tried.
 */
function carvePath(g: NavGrid, eroded: Uint8Array, a: number, b: number, xFirst = true): number[] | null {
  let ax = a % g.nx;
  let ay = (a - ax) / g.nx;
  const bx = b % g.nx;
  const by = (b - bx) / g.nx;
  const cells: number[] = [];
  const step = (x: number, y: number): boolean => {
    const k = y * g.nx + x;
    if (eroded[k]) return false;
    cells.push(k);
    return true;
  };
  const alongX = (): boolean => {
    while (ax !== bx) {
      ax += ax < bx ? 1 : -1;
      if (!step(ax, ay)) return false;
    }
    return true;
  };
  const alongY = (): boolean => {
    while (ay !== by) {
      ay += ay < by ? 1 : -1;
      if (!step(ax, ay)) return false;
    }
    return true;
  };
  const ok = xFirst ? alongX() && alongY() : alongY() && alongX();
  return ok ? cells : null;
}

/**
 * The seed pairs a threshold carves between: every `a` with each `b` at the least Manhattan
 * (cell) distance from it, and every `b` with each `a` nearest it — a relation defined by
 * distance alone, so the pairs of a turned or flipped plan are the images of these. A
 * doorway straight across a wall pairs each column with the column facing it.
 */
function nearestPairs(g: NavGrid, as: readonly number[], bs: readonly number[]): Array<[number, number]> {
  const man = (p: number, q: number): number =>
    Math.abs((p % g.nx) - (q % g.nx)) + Math.abs(Math.floor(p / g.nx) - Math.floor(q / g.nx));
  const keep = new Set<string>();
  const out: Array<[number, number]> = [];
  const add = (a: number, b: number): void => {
    const k = `${a},${b}`;
    if (keep.has(k)) return;
    keep.add(k);
    out.push([a, b]);
  };
  for (const a of as) {
    const d = Math.min(...bs.map((b) => man(a, b)));
    for (const b of bs) if (man(a, b) === d) add(a, b);
  }
  for (const b of bs) {
    const d = Math.min(...as.map((a) => man(a, b)));
    for (const a of as) if (man(a, b) === d) add(a, b);
  }
  return out;
}

/**
 * Threshold points to try across one connector's opening: its centre **first** (so any
 * plan whose thresholds already carve is unaffected), then alternating outward along the
 * wall in whole cells, bounded by the connector's own clear width.
 *
 * A connector is a WIDTH, not a point. While the cell was scale-relative that made no
 * difference — the opening was about one cell wide — but at a real resolution a 4 m
 * opening spans a couple of dozen cells, and a fixture parked across one half of it must
 * not read as sealing the whole of it (the museum's servery covers 6 m of the cafe's 4 m
 * threshold; the other half is walkable and now measures that way).
 */
function thresholdPoints(
  g: NavGrid,
  at: Point,
  rb: RoomBox,
  clear: number,
  tol: number,
  /** The host wall runs along x (`true`) or y (`false`); unknown for a slanted or curved host. */
  hostAlongX?: boolean,
): Point[] {
  const steps = Math.floor(Math.max(0, clear / 2 - g.cell / 2) / g.cell);
  const out: Point[] = [at];
  // A polygon room's opening runs along whichever of ITS edges the connector sits on —
  // at any angle — so the walk direction is that edge's unit vector rather than a
  // choice between the two bbox axes.
  if (rb.poly) {
    let ux = 1;
    let uy = 0;
    let bestD = Infinity;
    for (const [a, b] of polygonEdges(rb.poly)) {
      const d = distPointToSeg(at.x, at.y, a.x, a.y, b.x, b.y);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < bestD && len > 0) {
        bestD = d;
        ux = (b.x - a.x) / len;
        uy = (b.y - a.y) / len;
      }
    }
    for (let i = 1; i <= steps; i++) {
      const d = i * g.cell;
      out.push({ x: at.x + ux * d, y: at.y + uy * d });
      out.push({ x: at.x - ux * d, y: at.y - uy * d });
    }
    return out;
  }
  // The connector lies on a shared room edge; a horizontal edge means it spans in x.
  const spansX =
    hostAlongX !== undefined ? hostAlongX : Math.abs(at.y - rb.y) <= tol || Math.abs(at.y - (rb.y + rb.h)) <= tol;
  for (let i = 1; i <= steps; i++) {
    const d = i * g.cell;
    out.push(spansX ? { x: at.x + d, y: at.y } : { x: at.x, y: at.y + d });
    out.push(spansX ? { x: at.x - d, y: at.y } : { x: at.x, y: at.y - d });
  }
  return out;
}

/**
 * 4-connected uniform-cost BFS from `source`; returns hop distance + parent.
 *
 * @internal Exported for `test/path-algebra.test.ts`, which proves it equals the
 * `bestPaths` engine (unit `MIN_PLUS`, constant rank). Not re-exported by `src/index.ts`.
 */
export function bfs(g: NavGrid, source: number): { dist: Int32Array; parent: Int32Array } {
  const dist = new Int32Array(g.nx * g.ny).fill(-1);
  const parent = new Int32Array(g.nx * g.ny).fill(-1);
  dist[source] = 0;
  const queue = [source];
  const nb4 = new Int32Array(4);
  for (let h = 0; h < queue.length; h++) {
    const k = queue[h]!;
    for (let i = 0, m = neighbours4(k, g.nx, g.ny, nb4); i < m; i++) {
      const nb = nb4[i]!;
      if (g.free[nb] && dist[nb]! < 0) {
        dist[nb] = dist[k]! + 1;
        parent[nb] = k;
        queue.push(nb);
      }
    }
  }
  return { dist, parent };
}

/**
 * {@link bfs} from SEVERAL sources at once: the `MIN_PLUS` sum over the entrances, in one
 * pass. `dist` is the hop distance to the NEAREST source, `parent` the BFS tree toward it,
 * and `from[k]` the index (into `sources`) of the source cell `k` was reached from.
 *
 * Ties go to the LOWEST source index, and exactly so: the queue starts with the sources in
 * index order, so every BFS layer is ordered by `from`, and a cell first reached at
 * distance d is reached from the smallest-index source among its nearest ones. A source
 * repeated in the list keeps its first index. With one source this is {@link bfs} — same
 * queue, same neighbour order, same `dist` and `parent` — which is what keeps a
 * single-entrance plan byte-identical.
 */
export function bfsNearest(
  g: NavGrid,
  sources: readonly number[],
): { dist: Int32Array; parent: Int32Array; from: Int32Array } {
  const dist = new Int32Array(g.nx * g.ny).fill(-1);
  const parent = new Int32Array(g.nx * g.ny).fill(-1);
  const from = new Int32Array(g.nx * g.ny).fill(-1);
  const queue: number[] = [];
  sources.forEach((s, i) => {
    if (dist[s]! >= 0) return;
    dist[s] = 0;
    from[s] = i;
    queue.push(s);
  });
  const nb4 = new Int32Array(4);
  for (let h = 0; h < queue.length; h++) {
    const k = queue[h]!;
    for (let i = 0, m = neighbours4(k, g.nx, g.ny, nb4); i < m; i++) {
      const nb = nb4[i]!;
      if (g.free[nb] && dist[nb]! < 0) {
        dist[nb] = dist[k]! + 1;
        parent[nb] = k;
        from[nb] = from[k]!;
        queue.push(nb);
      }
    }
  }
  return { dist, parent, from };
}

/**
 * Cells reachable on the walkable grid from ANY of `sources` — one 4-connected
 * multi-source flood, not `sources.length` separate BFSs — the `BOOLEAN` closure of
 * {@link bfsNearest}. Used for the blocked/unmeasured verdicts: is this room
 * walkable-into from some front door?
 *
 * @internal Exported for `test/path-algebra.test.ts` (the `BOOLEAN` closure).
 */
export function reachableFromAny(g: NavGrid, sources: number[]): Uint8Array {
  const seen = new Uint8Array(g.nx * g.ny);
  const queue: number[] = [];
  for (const s of sources) {
    if (s >= 0 && g.free[s] && !seen[s]) {
      seen[s] = 1;
      queue.push(s);
    }
  }
  const nb4 = new Int32Array(4);
  for (let h = 0; h < queue.length; h++) {
    for (let i = 0, m = neighbours4(queue[h]!, g.nx, g.ny, nb4); i < m; i++) {
      const nb = nb4[i]!;
      if (g.free[nb] && !seen[nb]) {
        seen[nb] = 1;
        queue.push(nb);
      }
    }
  }
  return seen;
}

/** Per-room maximum of a per-cell value over the room's free cells (−Infinity when a
 *  room has no reached cell). Reads a room's *best* (widest) route in. */
function perRoomMax(g: NavGrid, vals: Float64Array, nRooms: number): Float64Array {
  const out = new Float64Array(nRooms).fill(-Infinity);
  for (let k = 0; k < vals.length; k++) {
    const ri = g.roomIdx[k]!;
    if (ri >= 0 && g.free[k] && vals[k]! > out[ri]!) out[ri] = vals[k]!;
  }
  return out;
}

/**
 * Widest-path bottleneck from one or more `sources` to every cell: the maximum over
 * all routes of the minimum clear width along the route. This is the *unavoidable*
 * squeeze between the sources and a cell (e.g. the narrowest door you must pass), not
 * an artifact of the shortest path hugging a wall — a max-min Dijkstra, the cell-grid
 * analogue of the access graph's widest-path clear-width. Each source is seeded with
 * `seed` — one value for all (`+Infinity` for a room→room route, so the source room's
 * internal furniture-crowding never caps it), or one per source (the entrance walk: each
 * entrance at its OWN clear width, so the widest route from any entrance wins; a cell two
 * entrances share keeps the wider).
 * Deterministic: the best value per cell is unique, so the heap's tie order does not
 * affect the result. When `pinch` is supplied it is filled with, per cell, the index
 * of the limiting (narrowest) cell on that cell's widest route — used to place the
 * overlay's bottleneck marker.
 *
 * @internal Exported for `test/path-algebra.test.ts` (values equal the `MAX_MIN` engine).
 */
export function widestBottleneck(
  g: NavGrid,
  sources: readonly number[],
  seed: number | readonly number[],
  pinch?: Int32Array,
): Float64Array {
  const n = g.nx * g.ny;
  const best = new Float64Array(n).fill(-Infinity);
  const done = new Uint8Array(n);

  // Binary max-heap over (key = bottleneck-so-far, cell), on parallel arrays.
  const hk: number[] = [];
  const hv: number[] = [];
  // Plain temp swaps, not destructuring: a `[a,b]=[b,a]` here allocates an array per
  // swap, which at the grid's cell budget is the single hottest allocation in analysis.
  const swap = (i: number, j: number): void => {
    const tk = hk[i]!;
    hk[i] = hk[j]!;
    hk[j] = tk;
    const tv = hv[i]!;
    hv[i] = hv[j]!;
    hv[j] = tv;
  };
  const push = (key: number, cell: number): void => {
    hk.push(key);
    hv.push(cell);
    let i = hk.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p]! >= hk[i]!) break;
      swap(i, p);
      i = p;
    }
  };
  const pop = (): number => {
    const top = hv[0]!;
    const lastK = hk.pop()!;
    const lastV = hv.pop()!;
    if (hk.length > 0) {
      hk[0] = lastK;
      hv[0] = lastV;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let big = i;
        if (l < hk.length && hk[l]! > hk[big]!) big = l;
        if (r < hk.length && hk[r]! > hk[big]!) big = r;
        if (big === i) break;
        swap(i, big);
        i = big;
      }
    }
    return top;
  };

  sources.forEach((s, i) => {
    const v = typeof seed === "number" ? seed : seed[i]!;
    if (v > best[s]!) {
      best[s] = v;
      if (pinch) pinch[s] = s;
      push(v, s);
    }
  });

  const nb4 = new Int32Array(4);
  while (hk.length > 0) {
    const u = pop();
    if (done[u]) continue;
    done[u] = 1;
    for (let i = 0, m = neighbours4(u, g.nx, g.ny, nb4); i < m; i++) {
      const nb = nb4[i]!;
      if (!g.free[nb] || done[nb]) continue;
      const cand = Math.min(best[u]!, g.clearMm[nb]!);
      if (cand > best[nb]!) {
        best[nb] = cand;
        // The limiting cell is nb when it is the new narrowest, else u's limiter.
        if (pinch) pinch[nb] = g.clearMm[nb]! < best[u]! ? nb : pinch[u]!;
        push(cand, nb);
      }
    }
  }
  return best;
}

/**
 * 4-connected hop distance from the nearest of `seeds` to every cell of an `nx` × `ny`
 * grid, walls and all (−1 when there is no seed). A multi-source BFS, so the result does
 * not depend on the seeds' order.
 *
 * @internal Exported for `test/path-algebra.test.ts` (multi-source `MIN_PLUS`).
 */
export function distanceTransform4(nx: number, ny: number, seeds: readonly number[]): Int32Array {
  const D = new Int32Array(nx * ny).fill(-1);
  const q: number[] = [];
  for (const k of seeds) {
    D[k] = 0;
    q.push(k);
  }
  const nb4 = new Int32Array(4);
  for (let h = 0; h < q.length; h++) {
    const k = q[h]!;
    for (let i = 0, m = neighbours4(k, nx, ny, nb4); i < m; i++) {
      const nb = nb4[i]!;
      if (D[nb]! < 0) {
        D[nb] = D[k]! + 1;
        q.push(nb);
      }
    }
  }
  return D;
}

/** Euclidean distance from a point to a segment. */
function distPointToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * The nav grid's EXTENT and resolution: the union of the room boxes, and the closed-form
 * cell size {@link navCellSizeMm} derives from its area. `null` for a plan with no room,
 * or one whose rooms span no area — the two cases that have no grid at all.
 *
 * Split out of {@link buildGrid} (which is its only production caller, and passes the
 * result straight back into the same locals it used to compute) so that
 * {@link rasteriseWallSegments} can be handed the same extent OUTSIDE a full grid build.
 * `test/nav-grid-residual.test.ts` is what needs that: it compares the wall mask against
 * the drawn wall solid, and must therefore see the whole mask — including the parts of
 * every wall that fall outside a room box, where `NavGrid.free` is `0` for a completely
 * unrelated reason. Not part of the public surface;
 * `src/index.ts` does not re-export it.
 */
export interface NavExtent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Cell size (mm) — `navCellSizeMm` of the extent's area. */
  cell: number;
  nx: number;
  ny: number;
}

/** {@link NavExtent} for a plan's rooms — see that interface for why it is separable. */
export function navExtent(rooms: readonly RRoom[]): NavExtent | null {
  const rects = rooms.map((r) => roomBox(r));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rb of rects) {
    minX = Math.min(minX, rb.x);
    minY = Math.min(minY, rb.y);
    maxX = Math.max(maxX, rb.x + rb.w);
    maxY = Math.max(maxY, rb.y + rb.h);
  }
  if (!Number.isFinite(minX)) return null;
  const W = maxX - minX;
  const H = maxY - minY;
  if (W <= 0 || H <= 0) return null;

  const cell = navCellSizeMm(W * H);
  const nx = Math.max(1, Math.ceil(W / cell));
  const ny = Math.max(1, Math.ceil(H / cell));
  return { minX, minY, maxX, maxY, cell, nx, ny };
}

/**
 * Rasterise walls as blocked cells so adjacent rooms don't leak into each other
 * across a shared partition: a cell is blocked when its CENTRE lies within half the wall
 * thickness of the centreline, or when the centreline itself passes through it (touches
 * its closed square). The centre test alone blocked nothing for a partition thinner than
 * a cell — an 80 mm wall on a lattice line of 100 mm cells has no cell centre within 40 mm
 * of it — so the walk leaked through a wall the drawing has (backlog C.1).
 *
 * The centreline cover closes that leak: the cells a continuous centreline touches form a
 * chain in which consecutive cells share an edge, or — where the line passes exactly
 * through a lattice corner — all four cells round that corner are touched, so a
 * 4-connected step (the walk's own neighbourhood, `neighbours4`) cannot slip between two
 * of them. It adds nothing for a wall of at least `cell·√2` (~142 mm on 100 mm cells): a
 * touched cell's centre is within `cell·√2/2` of the line, which the centre test already
 * blocks — so every such wall rasterises exactly as before, and only a thinner one takes
 * the cover. (The alternative, blocking every cell the whole BAND passes through, was
 * rejected: it puts a curved wall's faces tangent to lattice lines, where a 1 mm nudge
 * moves a hand-derived walk — `test/circulation-hand-derived.test.ts`.) Doors carve back
 * through afterwards, in {@link buildGrid}. Furniture-eroded cells stay eroded (never
 * reopened) — which is the caller's business, not this pass's: it only ever says
 * "block this cell", through `block`, and never reads what is already blocked.
 *
 * A CURVED segment is blocked against the arc, not against its chord. Taking the chord
 * is not a coarser approximation of the same shape, it is a different wall in a
 * different place: a closed drum — two semicircular `arc` edges sharing endpoints —
 * rasterises to a bar along its own DIAMETER, so the nav grid let a route walk through
 * 1200 mm of masonry while severing the round room inside it into two caps. That is
 * what dropped `hexagon-pavilion`'s three northern galleries and `aquarium`'s plant
 * room out of the facts with nothing said. `arcs[i]` is the
 * solve resolve already did for segment `i`, and `distPointToArc` is the exact
 * analogue of the segment distance used beside it — no tessellation either side.
 *
 * Separated from {@link buildGrid} for `test/nav-grid-residual.test.ts`, which runs this
 * exact pass into a mask of its own and compares it against the DRAWN wall solid. The
 * callback (rather than an out-array) is what keeps `buildGrid`'s allocation profile
 * unchanged: it passes `(k) => { free[k] = 0; }`, exactly the assignment that was here.
 */
export function rasteriseWallSegments(ex: NavExtent, walls: readonly RWall[], block: (k: number) => void): void {
  const { minX, minY, cell, nx, ny } = ex;
  for (const w of walls) {
    const half = w.thickness / 2;
    // A cell the centreline touches has its centre within cell·√2/2 of it, so the centre
    // test already blocks it unless the wall is thinner than that (< ~142 mm on 100 mm
    // cells) — only then is the centreline cover consulted, and a thicker wall runs the
    // centre test alone, exactly as it always has.
    const thin = half < cell * Math.SQRT1_2;
    const pts = w.points;
    const segCount = w.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segCount; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const arc = w.arcs?.[i];
      // The band's extent: a straight run spans its endpoints, a curve its endpoints
      // plus whichever axis extremes its sweep actually reaches (closed form).
      const span = arc ? arcExtremes(arc) : [a, b];
      const loX = Math.min(...span.map((p) => p.x)) - half;
      const hiX = Math.max(...span.map((p) => p.x)) + half;
      const loY = Math.min(...span.map((p) => p.y)) - half;
      const hiY = Math.max(...span.map((p) => p.y)) + half;
      const ix0 = clamp(Math.floor((loX - minX) / cell), 0, nx - 1);
      const ix1 = clamp(Math.floor((hiX - minX) / cell), 0, nx - 1);
      const iy0 = clamp(Math.floor((loY - minY) / cell), 0, ny - 1);
      const iy1 = clamp(Math.floor((hiY - minY) / cell), 0, ny - 1);
      for (let iy = iy0; iy <= iy1; iy++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const cx = minX + (ix + 0.5) * cell;
          const cy = minY + (iy + 0.5) * cell;
          const d = arc ? distPointToArc({ x: cx, y: cy }, arc) : distPointToSeg(cx, cy, a.x, a.y, b.x, b.y);
          if (d <= half) block(iy * nx + ix);
          else if (thin) {
            // The centreline itself passes through this cell (touches its closed square).
            const x0 = minX + ix * cell;
            const y0 = minY + iy * cell;
            const sq = { x0, y0, x1: x0 + cell, y1: y0 + cell };
            if (arc ? arcMeetsBox(arc, sq) : segMeetsBox(a, b, sq)) block(iy * nx + ix);
          }
        }
      }
    }
  }
}

/** A closed axis-aligned box (a nav-grid cell's square). */
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const inBox = (p: Point, s: Box): boolean => p.x >= s.x0 && p.x <= s.x1 && p.y >= s.y0 && p.y <= s.y1;

/** Does segment ab meet the CLOSED box? (Liang–Barsky clip.) */
function segMeetsBox(a: Point, b: Point, s: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return clip(-dx, a.x - s.x0) && clip(dx, s.x1 - a.x) && clip(-dy, a.y - s.y0) && clip(dy, s.y1 - a.y) && t0 <= t1;
}

/**
 * Does an arc meet the CLOSED box? An end inside it, or its circle crossing one of the
 * box's edges, within that edge, at a radial inside the sweep — an arc that enters the box
 * with both ends outside must cross its boundary to do so.
 */
function arcMeetsBox(arc: Arc, s: Box): boolean {
  if (inBox(arc.a, s) || inBox(arc.b, s)) return true;
  const c = arc.center;
  const edges: Array<{ horizontal: boolean; fixed: number; lo: number; hi: number }> = [
    { horizontal: true, fixed: s.y0, lo: s.x0, hi: s.x1 },
    { horizontal: true, fixed: s.y1, lo: s.x0, hi: s.x1 },
    { horizontal: false, fixed: s.x0, lo: s.y0, hi: s.y1 },
    { horizontal: false, fixed: s.x1, lo: s.y0, hi: s.y1 },
  ];
  for (const e of edges) {
    const off = e.fixed - (e.horizontal ? c.y : c.x);
    const h = arc.r * arc.r - off * off;
    if (h < 0) continue;
    const mid = e.horizontal ? c.x : c.y;
    const root = Math.sqrt(h);
    for (const along of [mid - root, mid + root]) {
      if (along < e.lo || along > e.hi) continue;
      if (arcContainsRay(arc, e.horizontal ? { x: along, y: e.fixed } : { x: e.fixed, y: along })) return true;
    }
  }
  return false;
}

/** Build the clearance-eroded nav grid, then stitch it through the connectors. */
function buildGrid(
  rooms: RRoom[],
  walls: RWall[],
  connectors: Array<{ at: Point; between: [string, string]; clear: number; bandMm: number; hostAlongX?: boolean }>,
  furniture: RFurniture[],
  verticals: RVertical[],
  voids: RVoid[],
  roomIndexById: Map<string, number>,
  tol: number,
  bodyRadius: number,
): NavGrid | null {
  const rects = rooms.map((r) => roomBox(r));
  const ex = navExtent(rooms);
  if (!ex) return null;
  const { minX, minY, cell, nx, ny } = ex;
  const W = ex.maxX - minX;
  const H = ex.maxY - minY;

  // Obstacles: furniture footprints (halo on every side) plus each vertical run's
  // footprint, whose halo is suppressed outside its entry edge(s) — you have to be able
  // to stand at the foot of a flight to use it (see `src/vertical.ts`).
  const obstacles: VerticalObstacle[] = [
    ...solidFurniture(furniture).map((f) => ({ rect: rectOf(f), open: [] as VerticalObstacle["open"] })),
    ...verticalObstacles(verticals),
    // A floor void blocks the cells inside it — you cannot walk across a hole — with the
    // body-radius halo suppressed on EVERY edge: you can stand at the railing. Same
    // mechanism a stair's entry edge uses, with the whole rectangle "open".
    ...voids.map((v) => ({ rect: rectOf(v), open: ["top", "bottom", "left", "right"] as VerticalObstacle["open"] })),
  ];
  const free = new Uint8Array(nx * ny);
  const roomIdx = new Int32Array(nx * ny).fill(-1);
  const eroded = new Uint8Array(nx * ny); // in-room cell blocked by furniture (never carved)
  const carved = new Set<number>();
  const g: NavGrid = { minX, minY, cell, nx, ny, free, roomIdx, clearMm: new Float64Array(nx * ny), carved };
  const furnObstacle: number[] = []; // in-room cells eroded by furniture (clearance seeds)

  /** Cell-index window covering an mm range, widened by one so a boundary cell centre
   *  is never missed — the exact containment test still runs per cell. */
  const window = (lo: number, hi: number, origin: number, n: number): [number, number] => [
    Math.max(0, Math.floor((lo - origin) / cell) - 1),
    Math.min(n - 1, Math.ceil((hi - origin) / cell)),
  ];

  // Each cell takes the FIRST room (source order) whose closed rect holds its centre.
  // Filling per-rect in REVERSE source order — so an earlier room overwrites a later
  // one where they touch — is equivalent to the per-cell "first match wins" scan, but
  // costs O(sum of room areas) instead of O(cells × rooms). At the grid's cell budget
  // that is the difference between usable and unusable.
  for (let j = rects.length - 1; j >= 0; j--) {
    const rb = rects[j]!;
    const [ix0, ix1] = window(rb.x, rb.x + rb.w, minX, nx);
    const [iy0, iy1] = window(rb.y, rb.y + rb.h, minY, ny);
    for (let iy = iy0; iy <= iy1; iy++) {
      const cy = minY + (iy + 0.5) * cell;
      for (let ix = ix0; ix <= ix1; ix++) {
        // Membership is "is the cell CENTRE inside the room?" — the polygon ring when the
        // room has one, the rectangle otherwise. Same predicate, same cells.
        const cx = minX + (ix + 0.5) * cell;
        const inside = rb.poly ? pointInPolygon(cx, cy, rb.poly) : pointInRect(cx, cy, rb);
        if (inside) roomIdx[iy * nx + ix] = j;
      }
    }
  }
  // Every in-room cell starts walkable; the erosion below takes cells back.
  for (let k = 0; k < roomIdx.length; k++) if (roomIdx[k]! >= 0) free[k] = 1;

  // Clearance erosion, scanned per furniture piece over its body-radius-inflated bbox
  // rather than per cell over every piece — the same predicate on the same cells.
  for (const ob of obstacles) {
    const fr = ob.rect;
    const [ix0, ix1] = window(fr.x - bodyRadius, fr.x + fr.w + bodyRadius, minX, nx);
    const [iy0, iy1] = window(fr.y - bodyRadius, fr.y + fr.h + bodyRadius, minY, ny);
    for (let iy = iy0; iy <= iy1; iy++) {
      const cy = minY + (iy + 0.5) * cell;
      for (let ix = ix0; ix <= ix1; ix++) {
        const k = iy * nx + ix;
        if (roomIdx[k]! < 0 || eroded[k]) continue; // outside every room, or already eroded
        const cx = minX + (ix + 0.5) * cell;
        // The halo (but never the footprint itself) is lifted on an entry side.
        if (ob.open.length > 0 && outsideOpenEdge(cx, cy, fr, ob.open)) continue;
        if (distPointToRect(cx, cy, fr) <= bodyRadius) {
          eroded[k] = 1;
          free[k] = 0;
        }
      }
    }
  }
  // Row-major, exactly as the old single pass collected them. The distance transform
  // below is a multi-source BFS, so its result is seed-order independent anyway.
  for (let k = 0; k < eroded.length; k++) if (eroded[k]) furnObstacle.push(k);

  // Walls block (see `rasteriseWallSegments`, which is this pass verbatim and is shared
  // with the residual gate). Doors carve back through below; the furniture-eroded cells
  // collected above stay eroded, because the carve — not this pass — is what reopens.
  rasteriseWallSegments(ex, walls, (k) => {
    free[k] = 0;
  });

  // Stitch: carve a threshold through the wall band at each internal connector,
  // recording the connector's clear width at the (grid-degenerate) carved cells.
  const clearAt = new Map<number, number>();
  // Walkable before any threshold is carved: a carve stamps its connector's width on the
  // cells it OPENS (and on its far seed, as it always has) — never on a room cell it only
  // runs along, whose clearance is the room's own (a furniture pinch must stay a pinch).
  const wasFree = free.slice();
  for (const c of connectors) {
    const ai = roomIndexById.get(c.between[0]);
    const bi = roomIndexById.get(c.between[1]);
    if (ai === undefined || bi === undefined) continue; // exterior / unknown endpoint
    // Every carve a threshold point opens: each seed on one side to its NEAREST seed on the
    // other (and back), by both L-shaped runs (x-then-y and y-then-x), each kept only if it
    // meets no furniture. Nearest, not every pair: a doorway on a lattice line seeds a
    // column either side of it, and pairing a column with the OTHER side's other column
    // would run an L along a row inside a room, stamping the doorway's width over cells
    // whose clearance is a furniture pinch.
    const pathsAt = (at: Point): number[][] => {
      const as = seedCells(g, at, rects[ai]!, ai, tol, c.bandMm);
      const bs = seedCells(g, at, rects[bi]!, bi, tol, c.bandMm);
      const out: number[][] = [];
      for (const [a, b] of nearestPairs(g, as, bs)) {
        const xy = carvePath(g, eroded, a, b, true);
        if (xy) out.push(xy);
        // The two runs coincide when the seeds share a row or a column.
        if (a % g.nx === b % g.nx || Math.floor(a / g.nx) === Math.floor(b / g.nx)) continue;
        const yx = carvePath(g, eroded, a, b, false);
        if (yx) out.push(yx);
      }
      return out;
    };
    const apply = (path: number[]): void => {
      const far = path[path.length - 1];
      for (const k of path) {
        g.free[k] = 1;
        if (!wasFree[k] || k === far) clearAt.set(k, Math.min(clearAt.get(k) ?? Infinity, c.clear));
      }
    };
    // Carve EVERY walkable part of the connector's width, the centre included. Stopping
    // at the centre when the centre happened to be walkable is what made the reported
    // width non-monotone in an obstacle's depth: a cabinet whose halo just misses the
    // opening's midpoint left a ONE-CELL doorway pinned at the cabinet's own corner,
    // while a deeper cabinet — one whose halo covered the midpoint — fell through to
    // this loop and opened the whole metre of threshold still walkable beside it. So the
    // plan with MORE furniture measured WIDER (1500 mm of gap
    // read 700 mm and 1100 mm of gap read 840). A connector is a width, not a point, and
    // which part of it a route may use cannot depend on the phase of its midpoint.
    const points = thresholdPoints(g, c.at, rects[ai]!, c.clear, tol, c.hostAlongX);
    for (const pt of points) {
      const ps = pathsAt(pt);
      for (const p of ps) apply(p);
      if (ps.length > 0) {
        carved.add(ai);
        carved.add(bi);
      }
    }
  }

  // Clearance comes from distance to FURNITURE, not to walls: inside a room you walk
  // freely, so only a furniture pinch (or a doorway) narrows the way. Seed a
  // 4-connected distance transform from the furniture-eroded cells; the hop count is a
  // body CENTRE's freedom and `centreFreedomToClearWidth` adds back the body diameter
  // the erosion took out. A cell with no furniture in reach reads BIG (an open room),
  // so it never sets the bottleneck — only doors and furniture gaps do.
  const BIG = W + H;
  const D = distanceTransform4(nx, ny, furnObstacle);
  for (let k = 0; k < free.length; k++) {
    g.clearMm[k] = free[k] ? (D[k]! >= 0 ? centreFreedomToClearWidth(D[k]!, cell, bodyRadius) : BIG) : 0;
  }
  // A carved doorway is a 1-cell slit the whole path must cross; its real clearance
  // is the connector's modeled clear width, so stamp that over the slit cells.
  for (const [k, cw] of clearAt) g.clearMm[k] = cw;

  return g;
}

/** The dyadic lattice (mm) {@link toExtentFrame} snaps relative coordinates to: 2⁻¹⁰. */
const FRAME_QUANTUM_MM = 1 / 1024;

/** A coordinate, and a point, snapped to {@link FRAME_QUANTUM_MM}. */
const snapToFrame = (v: number): number => Math.round(v / FRAME_QUANTUM_MM) * FRAME_QUANTUM_MM;
const snapPoint = (p: Point): Point => ({ x: snapToFrame(p.x), y: snapToFrame(p.y) });

/**
 * The circulation inputs moved into the nav extent's OWN frame: every coordinate minus the
 * extent's min corner, so the grid is anchored at (0, 0) and every sample — a cell centre,
 * a room's seed point, a threshold point, a distance to a wall or a footprint — is taken in
 * coordinates relative to it.
 *
 * Why: the grid used to sample in ABSOLUTE float coordinates, and a curve's tessellated
 * vertices do not survive a translation bit for bit — `9071.796769724491` placed 20 m out
 * is stored as `29071.79676972449`, one ulp of the larger number coarser — so the ring's
 * label point, a point-to-edge distance or a membership test resolved an exact tie the
 * other way, and a pure translation moved a walk (`library`'s reading room 25 500 →
 * 25 300 mm) or a detour (`aquarium`'s rotunda 1.01 → 1).
 *
 * So each coordinate is taken relative to the min corner and then snapped to a dyadic
 * lattice of {@link FRAME_QUANTUM_MM} — far coarser than any ulp a translation can cost
 * (≈ 1e-10 mm at a kilometre), far finer than anything a 100 mm grid can see. Both sides
 * of a translation then read the same number, so every fact is invariant EXCEPT when a
 * relative coordinate's residue lies within about an ulp of a half-quantum — the one place
 * a rounding still depends on the ulp (measured: 0 moves over 69 non-integer translations
 * of 8 examples; `test/circulation-translation.test.ts`). An integer or dyadic coordinate —
 * every rectangle, every authored point — is unchanged by the snap, and so is every plan
 * whose extent starts at (0, 0) and draws no curve.
 *
 * Translated, exactly: `rooms[].at`, `.poly`, `.circle.c`; `walls[].points` and each arc's
 * `center`, `a`, `b`; `at` of every door, opening, furniture, vertical and void. Left in
 * ABSOLUTE coordinates because nothing on the nav grid reads them: `door.host`/
 * `opening.host` (the wall segment — the grid reads the wall list, and only `hostWallId`
 * through the access graph), `room.labelAt`, `_placement` and every span.
 */
function toExtentFrame(
  origin: Point,
  plan: {
    rooms: RRoom[];
    walls: RWall[];
    doors: RDoor[];
    openings: ROpening[];
    furniture: RFurniture[];
    verticals: RVertical[];
    voids: RVoid[];
  },
): typeof plan {
  const snap = snapToFrame;
  const p = (q: Point): Point => ({ x: snap(q.x - origin.x), y: snap(q.y - origin.y) });
  const at = <T extends { at: Point }>(e: T): T => ({ ...e, at: p(e.at) });
  return {
    rooms: plan.rooms.map((r) => ({
      ...at(r),
      ...(r.poly ? { poly: r.poly.map(p) } : {}),
      ...(r.circle ? { circle: { ...r.circle, c: p(r.circle.c) } } : {}),
    })),
    walls: plan.walls.map((w) => ({
      ...w,
      points: w.points.map(p),
      ...(w.arcs ? { arcs: w.arcs.map((a) => (a ? { ...a, center: p(a.center), a: p(a.a), b: p(a.b) } : a)) } : {}),
    })),
    doors: plan.doors.map(at),
    openings: plan.openings.map(at),
    furniture: plan.furniture.map(at),
    verticals: plan.verticals.map(at),
    voids: plan.voids.map(at),
  };
}

/** An empty {@link toExtentFrame} input, to move one list of elements on its own. */
const NO_ELEMENTS: Parameters<typeof toExtentFrame>[1] = {
  rooms: [],
  walls: [],
  doors: [],
  openings: [],
  furniture: [],
  verticals: [],
  voids: [],
};

/** The nav extent's min corner — the origin {@link toExtentFrame} moves a plan to. */
function extentOrigin(rooms: readonly RRoom[]): Point {
  const ex = navExtent(rooms);
  return ex ? { x: ex.minX, y: ex.minY } : { x: 0, y: 0 };
}

/** Shared nav-grid setup for both the facts and overlay entry points: the grid, each
 *  room's free-cell list and seed point, and every entrance's seed cells (each with its
 *  clear width stamped). `none` → no entrance/rooms (null circulation); `empty` → entrances, but not
 *  one with a walkable cell behind it (facts return an empty model). */
type Nav =
  | { kind: "none" }
  /** ALL entrances are sealed — not one has a walkable cell behind it — so there is no walk
   *  to measure. (One sealed entrance among several is `ok`: the others seed the walk.) The
   *  grid still comes back, because "nothing can be measured from a front door" is not the
   *  same as "nothing can be said". */
  | { kind: "empty"; entranceId: string; cellSizeMm: number; g: NavGrid; roomCells: number[][]; sources: number[] }
  | {
      kind: "ok";
      g: NavGrid;
      roomCells: number[][];
      /** Per room, the point its facts are measured to — the same label point the room's
       *  name is drawn at (poly-aware); `roomRep` measures to its nearest REACHABLE cell. */
      seed: Point[];
      /** Per room, the widest poles of inaccessibility its label-point scan finds on the
       *  ring turned and flipped ({@link labelPointOrbit}); empty unless the room is
       *  concave with its centroid off its floor. */
      poles: Point[][];
      /**
       * Every entrance's seed cell whose doorway is not sealed, in entrance (source)
       * order — the walk's sources, all at once: each room is measured from its NEAREST
       * one. A plan may have several front doors serving disjoint parts of the drawing
       * (`examples/terrace-row.arch` is four dwellings on one sheet), and a room is
       * walked to from its own.
       */
      sources: number[];
      /** Per source, its entrance's id and its connector's clear width (the walk's seed). */
      sourceIds: string[];
      sourceClear: number[];
      /** Per source, the ordinal (into `entranceSeeds`) of the entrance it seeds. */
      sourceEntrance: number[];
      /** Per seeding entrance, in entrance order, every seed cell it contributes. */
      entranceSeeds: number[][];
      /** The first entrance's id and point (the model's header; the overlay's anchor). */
      entranceId: string;
      entrancePoint: Point;
    };

function buildNav(
  rooms: RRoom[],
  walls: RWall[],
  doors: RDoor[],
  openings: ROpening[],
  furniture: RFurniture[],
  verticals: RVertical[],
  voids: RVoid[],
  access: AccessGraph,
  tol: number,
  bodyRadius: number,
  /** The shafts this storey is reached by, each with the room it lands in — read ONLY
   *  when the storey has no exterior entrance of its own ({@link ShaftArrival}). */
  arrivals: readonly ShaftArrival[] = [],
): Nav {
  // A storey with an exterior entrance walks from it, whatever shafts land here; one
  // without walks from where its shafts land, or not at all.
  const viaShaft = !access.hasEntrance;
  if (rooms.length === 0 || (viaShaft && arrivals.length === 0)) return { kind: "none" };

  const roomIndexById = new Map<string, number>(rooms.map((r, i) => [r.id, i]));
  const rects = rooms.map((r) => roomBox(r));
  const atById = new Map<string, Point>();
  for (const d of doors) atById.set(d.id, d.at);
  for (const o of openings) atById.set(o.id, o.at);
  /** Which axis a connector's straight host runs along — the axis its threshold spans. */
  const alongXById = new Map<string, boolean>();
  for (const e of [...doors, ...openings]) {
    const h = e.host;
    if (!h || h.arc) continue;
    if (h.a.y === h.b.y && h.a.x !== h.b.x) alongXById.set(e.id, true);
    else if (h.a.x === h.b.x && h.a.y !== h.b.y) alongXById.set(e.id, false);
  }

  // Internal connectors (two real room endpoints) become carved thresholds, tagged
  // with the door/opening clear width the access graph already estimated.
  const halfThicknessById = new Map<string, number>(walls.map((w) => [w.id, w.thickness / 2]));
  /** How far a seed may look past the adjacency tolerance for this connector's room:
   *  the connector sits on its host's centreline, so the floor starts half a thickness
   *  off. Unknown host → 0, i.e. exactly the pre-existing reach. */
  const bandOf = (wallId: string | undefined): number =>
    (wallId !== undefined ? halfThicknessById.get(wallId) : undefined) ?? 0;

  const connectors = access.edges
    .filter((e) => !e.ambiguous && roomIndexById.has(e.between[0]) && roomIndexById.has(e.between[1]))
    .map((e) => ({
      at: atById.get(e.doorId)!,
      between: e.between,
      clear: e.estimatedClearWidth,
      bandMm: bandOf(e.hostWallId),
      hostAlongX: alongXById.get(e.doorId),
    }))
    .filter((c) => c.at !== undefined);

  const g = buildGrid(rooms, walls, connectors, furniture, verticals, voids, roomIndexById, tol, bodyRadius);
  if (!g) return { kind: "none" };

  // Each room's full free-cell list, row-major (route bottlenecks seed the whole source
  // room so its internal crowding can't cap the route), and the point it is measured to.
  //
  // The seed is where you would stand in the room: its centroid — but a concave (L, U, C)
  // ring can put its exact centroid in its own notch, OFF the floor, and the nearest free
  // cell to an off-floor point is pinned to the lip of the notch rather than sitting in
  // the room's body. `polygonLabelPoint` is the same closed-form centroid whenever the
  // centroid is legal (so nothing that already measured correctly moves) and the ring's
  // pole of inaccessibility — the middle of the widest part of the floor — only when it
  // is not. Same rule the label text uses, so the drawn walk ends where the name is.
  //
  // Snapped to the frame's dyadic lattice, like every input coordinate: a ring's centroid
  // is a float sum, and a curved room's tessellated centroid lands an ulp or two off its
  // exact centre — `library`'s drum read (25000.000000000004, 15999.999999999995) — which
  // decided a tie between the four cells round a lattice corner by rounding noise instead
  // of by `roomRep`'s key, and the noise does not turn with the plan.
  const roomCells: number[][] = rooms.map(() => []);
  const seed = rects.map((rb) =>
    snapPoint(rb.poly ? polygonLabelPoint(rb.poly) : { x: rb.x + rb.w / 2, y: rb.y + rb.h / 2 }),
  );
  // A pole of inaccessibility is found by a scan that keeps the FIRST of equally wide arms
  // (a page-order tie), so such a room is measured to every widest pole the same scan finds
  // on the ring turned or flipped — the orbit — and its walk is the shortest of them.
  const poles = rects.map((rb) => (rb.poly ? labelPointOrbit(rb.poly).map(snapPoint) : []));
  for (let k = 0; k < g.free.length; k++) {
    const ri = g.roomIdx[k]!;
    if (!g.free[k] || ri < 0) continue;
    roomCells[ri]!.push(k);
  }

  const entranceId = viaShaft ? arrivals[0]!.run.id : access.entrances[0]!;
  const entrancePoint = viaShaft ? entryMidpoint(arrivals[0]!.run) : atById.get(entranceId);

  // Every entrance's inner seed cells, source order: the walk's sources, all at once. An
  // entrance on a lattice line seeds BOTH sides of it (`seedCells`), so one entrance may
  // contribute two sources; `sourceEntrance` maps each back to its entrance's ordinal.
  const sources: number[] = [];
  const sourceIds: string[] = [];
  const sourceClear: number[] = [];
  const sourceEntrance: number[] = [];
  const entranceSeeds: number[][] = [];
  // A storey reached only by a shaft: each arriving run is an entrance whose seeds are the
  // landing in front of its entry edge(s), multi-source exactly as front doors are, each
  // seed carrying the run's width the way a doorway's seed carries its clear width.
  for (const a of viaShaft ? arrivals : []) {
    const ri = roomIndexById.get(a.roomId);
    if (ri === undefined) continue;
    const ks = landingCells(g, a.run, ri);
    if (ks.length === 0) continue; // that landing is covered; another run's may not be
    const ordinal = entranceSeeds.length;
    entranceSeeds.push(ks);
    const clear = runWidth(a.run);
    for (const k of ks) {
      g.clearMm[k] = clear;
      sources.push(k);
      sourceIds.push(a.run.id);
      sourceEntrance.push(ordinal);
      sourceClear.push(clear);
    }
  }
  for (const id of viaShaft ? [] : access.entrances) {
    const edge = access.edges.find((e) => e.doorId === id);
    const roomId = edge?.between.find((x) => x !== EXTERIOR_NODE && x !== "");
    const ri = roomId !== undefined ? roomIndexById.get(roomId) : undefined;
    const at = atById.get(id);
    if (ri === undefined || at === undefined) continue;
    const ks = seedCells(g, at, rects[ri]!, ri, tol, bandOf(edge?.hostWallId));
    if (ks.length === 0) continue; // that doorway is sealed by furniture; the others may not be
    const ordinal = entranceSeeds.length;
    entranceSeeds.push(ks);
    for (const k of ks) {
      // A doorway in the outer wall has no exterior cells to carve, so its inner seed
      // reads a degenerate 1-cell width; stamp the connector's own clear width there.
      const clear = edge?.estimatedClearWidth;
      if (clear !== undefined) g.clearMm[k] = clear;
      sources.push(k);
      sourceIds.push(id);
      sourceEntrance.push(ordinal);
      // The seed a widest-path search starts this entrance at. A single entrance reads the
      // cell's stamped width, exactly as its seed always did.
      sourceClear.push(clear ?? g.clearMm[k]!);
    }
  }

  // Sealed front doors are not "no information": the grid still has something to say
  // about which rooms can be walked into at all.
  if (sources.length === 0 || entrancePoint === undefined) {
    return { kind: "empty", entranceId, cellSizeMm: g.cell, g, roomCells, sources };
  }

  return {
    kind: "ok",
    g,
    roomCells,
    seed,
    poles,
    sources,
    sourceIds,
    sourceClear,
    sourceEntrance,
    entranceSeeds,
    entranceId,
    entrancePoint,
  };
}

/** The eight signed permutations of D4 as `[a, b, c, d]`: `(x, y) ↦ (a·x + b·y, c·x + d·y)`. */
const D4_MATS: readonly (readonly [number, number, number, number])[] = [
  [1, 0, 0, 1],
  [0, -1, 1, 0],
  [-1, 0, 0, -1],
  [0, 1, -1, 0],
  [-1, 0, 0, 1],
  [0, 1, 1, 0],
  [1, 0, 0, -1],
  [0, -1, -1, 0],
];

/**
 * The poles of inaccessibility a concave ring whose centroid is off its floor is measured
 * to: `polygonLabelPoint` run on the ring turned and flipped by each element of D4 about
 * its bounding-box centre and carried back, keeping the WIDEST of them — or `[]` when the
 * centroid is on the floor (the label point is then the centroid, and nothing is scanned).
 *
 * The label-point scan keeps the first of equally wide arms, which is a page-order
 * choice: a U-shaped gallery turned 180° is measured in its other arm. The ORBIT is not a
 * choice — it is the same set however the ring is drawn, because turning the ring first
 * only permutes the eight scans. Centring on the bounding box keeps every transformed
 * coordinate exact (a signed permutation of values that are already on the snapped
 * lattice), so the orbit of a turned ring is exactly the turned orbit.
 */
function labelPointOrbit(poly: readonly Point[]): Point[] {
  // The centroid is the scan's answer whenever it is on the floor: no scan, no tie.
  const centroid = polygonCentroid(poly);
  if (pointInPolygon(centroid.x, centroid.y, poly)) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const centred = poly.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  // The scan is a coarse grid search refined locally, so on some turns it settles on a
  // worse local maximum; only the widest poles found (to a micron) are genuine ties.
  const found = D4_MATS.map(([a, b, c, d]) => {
    const ring = centred.map((p) => ({ x: a * p.x + b * p.y, y: c * p.x + d * p.y }));
    const l = polygonLabelPoint(ring);
    // The inverse of a signed permutation is its transpose.
    return { at: { x: a * l.x + c * l.y + cx, y: b * l.x + d * l.y + cy }, width: distToPolygonEdge(l, ring) };
  });
  const widest = Math.max(...found.map((f) => f.width));
  const out: Point[] = [];
  const seen = new Set<string>();
  for (const f of found) {
    const key = `${f.at.x},${f.at.y}`;
    if (f.width < widest - 1e-3 || seen.has(key)) continue;
    seen.add(key);
    out.push(f.at);
  }
  return out;
}

/**
 * Where a walk starts, as the straight line sees it: from a cell to the NEAREST seed cell of
 * the entrance the walk to it came from (source `s` of the multi-source search). An entrance
 * that seeds one cell reads exactly that cell's centre, as it always did; one on a lattice
 * line seeds both sides, and which side the search reached a cell from first is a queue
 * order, so the straight line takes the nearer side — the same number however the plan is
 * turned or flipped.
 */
function entranceAim(nav: Extract<Nav, { kind: "ok" }>): {
  straightSq(k: number, s: number): number;
  straight(k: number, s: number): number;
  entranceOf(s: number): number;
} {
  const { g, sourceEntrance, entranceSeeds } = nav;
  const seedsOf = (s: number): number[] => entranceSeeds[sourceEntrance[s]!]!;
  return {
    straightSq(k, s) {
      const c = centreOf(g, k);
      let best = Infinity;
      for (const e of seedsOf(s)) {
        const o = centreOf(g, e);
        best = Math.min(best, (c.x - o.x) ** 2 + (c.y - o.y) ** 2);
      }
      return best;
    },
    straight(k, s) {
      const c = centreOf(g, k);
      let best = Infinity;
      for (const e of seedsOf(s)) {
        const o = centreOf(g, e);
        best = Math.min(best, Math.hypot(c.x - o.x, c.y - o.y));
      }
      return best;
    },
    entranceOf: (s) => sourceEntrance[s]!,
  };
}

/** A room's bounding-box centre (exact: a half-sum of snapped coordinates). Not a derived
 *  position (so no `r.poly` branch): only `roomRep`'s D4-symmetric tie-break key is taken
 *  about it, and a plan symmetry maps a box centre to its image's, so the key is invariant. */
const bboxCentre = (r: RRoom): Point => ({ x: r.at.x + r.size.w / 2, y: r.at.y + r.size.h / 2 });

/**
 * The cell a room's facts are measured AT, and the point it was chosen for: the
 * **reachable** free cell nearest the room's seed point (the label point its name is drawn
 * at) — or, for a concave room with {@link labelPointOrbit} poles, nearest any pole.
 *
 * Reachable, because the plain nearest free cell is not enough, and the difference is not
 * academic. Furniture can leave the label point's own neighbourhood in a pocket the
 * entrance cannot reach — the gap behind a kitchen island, the strip beside a bath — while
 * the rest of the room is perfectly walkable. Measuring "is the nearest cell reachable?"
 * then answers a question about one derived POINT and reports it as a fact about the ROOM,
 * and the room used to drop out of the facts entirely on the strength of it: silently,
 * because nothing looked at what was missing. Two of `examples/furnished-flat.arch`'s seven
 * rooms were in exactly that state. −1 only when NO free cell of the room can be reached —
 * the honest "you cannot walk in here at all".
 *
 * Among EQUIDISTANT nearest cells — a room whose seed point sits on a lattice line or a
 * crossing (every even-celled rectangle), or whose seed is covered by furniture so the
 * nearest free cells form a ring round it — the pick is D4-symmetric, not the row-major
 * first: the one the walk reaches first, then the key below (backlog E.6, E.8, E.9).
 */
function roomRep(
  g: NavGrid,
  cells: number[],
  seed: Point,
  poles: readonly Point[],
  dist: Int32Array,
  /** Squared straight line from cell `k` to the nearest seed cell of the entrance its walk
   *  starts at. */
  straightSq: (k: number) => number,
  /** The ordinal (entrance order) of the entrance the walk to cell `k` starts at. */
  entranceOf: (k: number) => number,
  /** The room's bounding-box centre — the point the D4-invariant key is taken about. */
  centre: Point,
): { k: number; seed: Point; ties: number[] } {
  const points = poles.length > 0 ? poles : [seed];
  // Every reachable cell nearest to the seed point (or to ANY pole of the orbit) — the
  // whole tie set, not the row-major first — so the candidates are the same set however
  // the plan is drawn.
  const cand: Array<{ k: number; seed: Point }> = [];
  for (const p of points) {
    let bestD = Infinity;
    const at: number[] = [];
    for (const k of cells) {
      if (dist[k]! < 0) continue;
      const c = centreOf(g, k);
      const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        at.length = 0;
      }
      if (d === bestD) at.push(k);
    }
    for (const k of at) cand.push({ k, seed: p });
  }
  if (cand.length === 0) return { k: -1, seed: points[0]!, ties: [] };
  // Then a D4-symmetric order: fewest hops, then nearest (straight line) to the walk's own
  // entrance, then the candidate's offsets from the room's centre as a sorted multiset of
  // magnitudes (what a turn or flip about that centre preserves), then the entrance's
  // source order. Candidates that tie on all of them read the same room facts (walk,
  // entrance, detour) but need not sit where a symmetry of the plan maps one onto the other
  // — two cells mirrored about the entrance's own axis tie with the rest of the plan
  // asymmetric — so they are ALL returned (`ties`): a key route measures from the whole set
  // (`routeBetween`), never from the one the cell index picks. `k` is that page-order pick,
  // kept only to draw the overlay's walk.
  const key = (k: number): [number, number, number, number, number] => {
    const c = centreOf(g, k);
    const [lo, hi] = [Math.abs(c.x - centre.x), Math.abs(c.y - centre.y)].sort((a, b) => a - b);
    return [dist[k]!, straightSq(k), lo!, hi!, entranceOf(k)];
  };
  const cmpKey = (x: readonly number[], y: readonly number[]): number => {
    let cmp = 0;
    for (let i = 0; i < 5 && cmp === 0; i++) cmp = x[i]! - y[i]!;
    return cmp;
  };
  let best = cand[0]!;
  let bk = key(best.k);
  for (const c of cand.slice(1)) {
    const cmp = cmpKey(key(c.k), bk);
    if (cmp < 0 || (cmp === 0 && c.k < best.k)) {
      best = c;
      bk = key(c.k);
    }
  }
  const ties = [...new Set(cand.filter((c) => cmpKey(key(c.k), bk) === 0).map((c) => c.k))].sort((a, b) => a - b);
  return { ...best, ties };
}

/**
 * A key route from one room to the nearest of `targets`, measured between TIE SETS: the walk
 * is the fewest hops from any of the source room's tied cells to any of a target's
 * ({@link roomRep}'s `ties`), the target is the nearest by that walk (ties to the one
 * written first), and the straight line a detour divides by is the shortest between a pair
 * that realises the walk. Every term is a minimum over sets a turn or flip of the plan maps
 * onto their images, so no page-order pick inside a tie set can move a route's numbers. A
 * room with one tied cell (the usual case) is measured exactly as from that one cell.
 *
 * Also returns the realising pair and its BFS parents (the first such pair in cell order)
 * for the overlay to draw.
 */
function routeBetween(
  g: NavGrid,
  fromTies: readonly number[],
  targets: ReadonlyArray<{ idx: number; ties: readonly number[] }>,
): { idx: number; hops: number; straight: number; a: number; b: number; parent: Int32Array } | null {
  const searches = fromTies.map((a) => ({ a, r: bfs(g, a) }));
  let best: { idx: number; hops: number; straight: number; a: number; b: number; parent: Int32Array } | null = null;
  for (const t of targets) {
    let hops = Number.POSITIVE_INFINITY;
    for (const { r } of searches) for (const b of t.ties) if (r.dist[b]! >= 0) hops = Math.min(hops, r.dist[b]!);
    if (!Number.isFinite(hops) || (best && hops >= best.hops)) continue;
    let straight = Number.POSITIVE_INFINITY;
    let pick: { a: number; b: number; parent: Int32Array } | null = null;
    for (const { a, r } of searches) {
      for (const b of t.ties) {
        if (r.dist[b] !== hops) continue;
        const ca = centreOf(g, a);
        const cb = centreOf(g, b);
        straight = Math.min(straight, Math.hypot(cb.x - ca.x, cb.y - ca.y));
        pick ??= { a, b, parent: r.parent };
      }
    }
    best = { idx: t.idx, hops, straight, ...pick! };
  }
  return best;
}

/**
 * Whole-plan circulation facts. Deterministic; returns null when the plan has no
 * modeled exterior entrance AND no shaft arrives on it (there is nothing to measure a walk
 * from — mirrors how the access graph reports `hasEntrance: false`).
 *
 * A storey with no front door that a shaft reaches (`arrivals`) is walked from where the
 * shafts land: each arriving run is an entrance (its id is `entranceId`), seeded at the
 * landing in front of its entry edge(s) at the run's width, and the rooms the doors reach
 * are those walkable from the rooms the runs stand in — the same arrival rooms lint's
 * reachability rule starts from, so the two rules agree on what an entrance is upstairs.
 *
 * @param access the door access graph already built by describe (source of the
 *   canonical entrance list and each connector's resolved room endpoints).
 */
export function computeCirculation(
  rooms: RRoom[],
  walls: RWall[],
  doors: RDoor[],
  openings: ROpening[],
  furniture: RFurniture[],
  access: AccessGraph,
  tol: number,
  bodyRadiusMm: number = DEFAULT_BODY_RADIUS_MM,
  /** Vertical runs on this storey — obstacles with a walkable entry side. Append-only:
   *  omitting it means a storey with no vertical runs. */
  verticals: RVertical[] = [],
  /** Floor voids on this storey — blocked cells with a walkable edge on all four sides.
   *  Append-only: omitting it means a storey with no voids. */
  voids: RVoid[] = [],
  /** The vertical runs this storey is REACHED by — shafts arriving from a storey that is
   *  itself reachable (`verticalReach`'s arrivals). Read only when the storey has no
   *  exterior entrance of its own: each run is then an entrance, walked from the landing in
   *  front of its entry edge, and the model is measured from there instead of being null.
   *  Append-only: omitting it (or a storey with a front door) changes nothing. */
  arrivals: readonly RVertical[] = [],
): CirculationModel | null {
  // The room each arriving run lands in, read off the plan as given — the same
  // `roomOfVertical` that names `verticalReach`'s arrival rooms. A run standing in no room
  // lands nowhere a walk could start.
  const landed: ShaftArrival[] = [];
  if (!access.hasEntrance) {
    for (const run of arrivals) {
      const roomId = roomOfVertical(run, rooms);
      if (roomId !== null) landed.push({ run, roomId });
    }
  }
  if (rooms.length === 0 || (!access.hasEntrance && landed.length === 0)) return null; // buildNav's "none", before any copy
  // Every sample in the nav extent's own frame, so a translation moves no fact (see
  // `toExtentFrame` for the one ulp-level exception).
  const origin = extentOrigin(rooms);
  ({ rooms, walls, doors, openings, furniture, verticals, voids } = toExtentFrame(origin, {
    rooms,
    walls,
    doors,
    openings,
    furniture,
    verticals,
    voids,
  }));
  const shafts: ShaftArrival[] = landed.map((a) => ({
    run: toExtentFrame(origin, { ...NO_ELEMENTS, verticals: [a.run] }).verticals[0]!,
    roomId: a.roomId,
  }));
  const nav = buildNav(rooms, walls, doors, openings, furniture, verticals, voids, access, tol, bodyRadiusMm, shafts);
  if (nav.kind === "none") return null;
  // Rooms the modeled doors reach: the only ones a walkability verdict is meaningful
  // for. A room with no door path is W_ROOM_UNREACHABLE's business, not this model's. On a
  // storey reached by a shaft, the doors are walked from the rooms the shafts land in —
  // the search lint's reachability rule runs on the same storey.
  const doorReachable = access.hasEntrance
    ? new Set(access.rooms.filter((n) => n.reachable).map((n) => n.id))
    : new Set(
        reachFrom(
          accessDigraph(
            rooms.map((r) => r.id),
            access.edges,
          ),
          { exterior: false, extraSources: shafts.map((a) => a.roomId) },
        ),
      );

  /**
   * The rooms no front door can be walked into — the raw candidate set behind
   * `blocked`, before the furniture control below confirms it.
   *
   * Three conditions, and each one is load-bearing: the doors must SAY you can get there
   * (else it is `W_ROOM_UNREACHABLE`), the grid must be able to SEE the room at all (a
   * room smaller than a cell occupies no cell centre — a resolution limit, and
   * `W_ROOM_TOO_SMALL`'s subject), and not one of its cells may be reachable from ANY
   * entrance (a terrace's other houses are not sealed, they are other houses).
   */
  const blockedCandidates = (nv: Nav): number[] => {
    if (nv.kind === "none") return [];
    const reach = reachableFromAny(nv.g, nv.sources);
    const out: number[] = [];
    for (let ri = 0; ri < rooms.length; ri++) {
      if (!doorReachable.has(rooms[ri]!.id)) continue;
      if (nv.roomCells[ri]!.some((k) => reach[k])) continue;
      if (!nv.g.roomIdx.includes(ri)) continue;
      out.push(ri);
    }
    return out;
  };

  /**
   * Confirm a blocked candidate against a FURNITURE-FREE control of the same plan, and
   * keep only the rooms the furniture is actually responsible for.
   *
   * The rule this feeds says "furniture and its clearances seal every way in", and that
   * sentence has to be earned. A nav grid can fail to route a plan for reasons that have
   * nothing to do with furniture — a threshold that never carves (a stair's flank over a
   * doorway, `garden-house`'s study), or a connector whose wall-face probe cannot decide
   * which rooms it joins — and reporting those as sealed rooms would be handing the user
   * a fiction. The differential is the proof: the route exists on the
   * empty plan and dies once the furniture is in, or the claim is not made.
   *
   * Paid for only when something is blocked, so a plan with nothing sealed builds one grid
   * exactly as before. Deliberately scoped to FURNITURE: a `stair` footprint or a floor
   * `void` sealing a room stays out, because the message would then be false about which
   * element to move.
   */
  const furnitureSealed = (cand: number[]): string[] => {
    if (cand.length === 0) return [];
    const control = buildNav(rooms, walls, doors, openings, [], verticals, voids, access, tol, bodyRadiusMm, shafts);
    if (control.kind === "none") return [];
    const reach = reachableFromAny(control.g, control.sources);
    return cand.filter((ri) => control.roomCells[ri]!.some((k) => reach[k])).map((ri) => rooms[ri]!.id);
  };

  /**
   * The widest way in to each sealed room — see {@link BlockedRoom.widestWayInMm}.
   * One descending ladder shared by every blocked room, so the cost is bounded by the
   * ladder (≤ `bodyRadius / (cell/2)` grid builds) rather than multiplied by the rooms,
   * and it is paid only on a plan that has something sealed.
   */
  const measureWaysIn = (ids: string[], cell: number): BlockedRoom[] => {
    if (ids.length === 0) return [];
    const indexOf = new Map(rooms.map((r, i) => [r.id, i]));
    const pending = new Set(ids);
    const found = new Map<string, number>();
    const step = Math.max(1, Math.round(cell / 2));
    for (let r = bodyRadiusMm - step; r > 0 && pending.size > 0; r -= step) {
      const nv = buildNav(rooms, walls, doors, openings, furniture, verticals, voids, access, tol, r, shafts);
      if (nv.kind === "none") break;
      const reach = reachableFromAny(nv.g, nv.sources);
      for (const id of ids) {
        if (!pending.has(id)) continue;
        const ri = indexOf.get(id);
        if (ri !== undefined && nv.roomCells[ri]!.some((k) => reach[k])) {
          found.set(id, 2 * r);
          pending.delete(id);
        }
      }
    }
    return ids.map((roomId) => ({ roomId, widestWayInMm: found.get(roomId) ?? 0 }));
  };

  /**
   * Why each room with no `rooms[]` entry has none — see {@link UnmeasuredReason}. The
   * order of the tests IS the classification, and it is chosen so the reason names the
   * operative fact rather than the first true one. A room any entrance reaches is
   * measured (every walk starts at the nearest entrance), so no reason here needs `reach`.
   *
   * `measured` and `sealed` are excluded by the caller, so the three lists partition the
   * plan's rooms. Source order, so the output is deterministic.
   */
  const classifyUnmeasured = (nv: Nav, measured: Set<string>, sealed: Set<string>): UnmeasuredRoom[] => {
    if (nv.kind === "none") return [];
    // One pass instead of a scan per room: which room indices the grid can see at all.
    const inGrid = new Uint8Array(rooms.length);
    for (let k = 0; k < nv.g.roomIdx.length; k++) {
      const ri = nv.g.roomIdx[k]!;
      if (ri >= 0) inGrid[ri] = 1;
    }
    const out: UnmeasuredRoom[] = [];
    for (let ri = 0; ri < rooms.length; ri++) {
      const id = rooms[ri]!.id;
      if (measured.has(id) || sealed.has(id)) continue;
      const reason: UnmeasuredReason = !doorReachable.has(id)
        ? "no_door_route"
        : !inGrid[ri]
          ? "below_grid_resolution"
          : !nv.g.carved.has(ri)
            ? "no_threshold"
            : "unreachable";
      out.push({ roomId: id, reason });
    }
    return out;
  };

  if (nav.kind === "empty") {
    const allBlocked = furnitureSealed(blockedCandidates(nav));
    const unmeasured = classifyUnmeasured(nav, new Set(), new Set(allBlocked));
    return {
      entranceId: nav.entranceId,
      cellSizeMm: nav.cellSizeMm,
      bodyRadiusMm,
      rooms: [],
      routes: [],
      ...(allBlocked.length > 0 ? { blocked: measureWaysIn(allBlocked, nav.cellSizeMm) } : {}),
      ...(unmeasured.length > 0 ? { unmeasured } : {}),
    };
  }
  const { g, roomCells, seed, poles, sources, sourceIds, sourceClear, entranceId } = nav;
  const cellSizeMm = g.cell;
  const aim = entranceAim(nav);

  // One multi-source walk: every room is measured from its NEAREST entrance.
  const { dist, from } = bfsNearest(g, sources);
  // Widest route from ANY entrance, each seeded at its own clear width.
  const widest = widestBottleneck(g, sources, sourceClear);
  const roomWidest = perRoomMax(g, widest, rooms.length); // widest route *into* each room
  // Name each room's entrance only when there is a choice, so a single-entrance plan's
  // facts keep their bytes.
  const perRoomEntrance = (access.hasEntrance ? access.entrances.length : shafts.length) > 1;

  // One representative cell per room, reachability-aware (see `roomRep`). Computed
  // once: the room facts, the key routes and the render overlay must all measure to the
  // same point or the drawing and the numbers disagree.
  const rep = new Int32Array(rooms.length);
  const repTies: number[][] = [];
  for (let ri = 0; ri < rooms.length; ri++) {
    // A room the modeled doors do not reach has no walk, whatever the raster says (a gap
    // the grid cannot see — a wall missing from the drawing, a door the access graph
    // refuses — can still leak into it). It is `no_door_route`, as `access` and lint say.
    const r = doorReachable.has(rooms[ri]!.id)
      ? roomRep(
          g,
          roomCells[ri]!,
          seed[ri]!,
          poles[ri]!,
          dist,
          (k) => aim.straightSq(k, from[k]!),
          (k) => aim.entranceOf(from[k]!),
          bboxCentre(rooms[ri]!),
        )
      : { k: -1, ties: [] };
    rep[ri] = r.k;
    repTies.push(r.ties);
  }

  const blocked = furnitureSealed(blockedCandidates(nav));
  const roomFacts: RoomCirculation[] = [];
  for (let ri = 0; ri < rooms.length; ri++) {
    const a = rep[ri]!;
    if (a < 0) continue; // nothing reachable from any entrance; `blocked` says whether that is a defect
    const walkExact = dist[a]! * g.cell;
    // Walk & straight-line share the threshold origin: this room's own entrance (the
    // nearest of its seed cells, when it seeds both sides of a lattice line).
    const straight = aim.straight(a, from[a]!);
    roomFacts.push({
      roomId: rooms[ri]!.id,
      walkDistanceMm: Math.round(walkExact),
      bottleneckClearWidthMm: Math.round(roomWidest[ri]!),
      detourRatio: straight > 0 ? r2(walkExact / straight) : 1,
      ...(perRoomEntrance ? { entranceId: sourceIds[from[a]!]! } : {}),
    });
  }

  // Key functional routes: kitchen → nearest living/dining, bedroom → nearest bath.
  const routes: CirculationRoute[] = [];
  const addNearestRoute = (fromIdx: number, targetIdxs: number[]): void => {
    if (rep[fromIdx]! < 0) return;
    const targets = targetIdxs.filter((tj) => tj !== fromIdx).map((tj) => ({ idx: tj, ties: repTies[tj]! }));
    const found = routeBetween(g, repTies[fromIdx]!, targets);
    if (!found) return;
    const best = found.idx;
    const walkExact = found.hops * g.cell;
    // Seed from every cell of room A with no cap: you start inside room A, so its own
    // furniture-crowding must not limit the route — only the doors/corridors between A
    // and B should.
    const wide = perRoomMax(g, widestBottleneck(g, roomCells[fromIdx]!, Number.POSITIVE_INFINITY), rooms.length);
    const straight = found.straight;
    routes.push({
      fromRoomId: rooms[fromIdx]!.id,
      toRoomId: rooms[best]!.id,
      walkDistanceMm: Math.round(walkExact),
      bottleneckClearWidthMm: Math.round(wide[best]!),
      detourRatio: straight > 0 ? r2(walkExact / straight) : 1,
    });
  };

  const livingDining = rooms.map((r, i) => (isLivingOrDining(r) ? i : -1)).filter((i) => i >= 0);
  const wetRooms = rooms.map((r, i) => (isWetRoom(r) ? i : -1)).filter((i) => i >= 0);
  for (let i = 0; i < rooms.length; i++) {
    if (isKitchen(rooms[i]!)) addNearestRoute(i, livingDining);
  }
  for (let i = 0; i < rooms.length; i++) {
    if (isBedroom(rooms[i]!)) addNearestRoute(i, wetRooms);
  }

  const unmeasured = classifyUnmeasured(nav, new Set(roomFacts.map((r) => r.roomId)), new Set(blocked));

  return {
    entranceId,
    cellSizeMm,
    bodyRadiusMm,
    rooms: roomFacts,
    routes,
    // Absent rather than empty: a plan with nothing sealed keeps the bytes it had.
    ...(blocked.length > 0 ? { blocked: measureWaysIn(blocked, cellSizeMm) } : {}),
    // Same rule, same reason: a plan whose every room measures emits no key at all.
    ...(unmeasured.length > 0 ? { unmeasured } : {}),
  };
}

// ---- overlay geometry (opt-in render only; describe()'s JSON is unaffected) ----

/** The entrance walk into one room, for the render overlay. */
export interface OverlayRoom {
  roomId: string;
  /** The entrance the walk starts at: the room's nearest (ties to the lowest index). */
  entranceId: string;
  /** The point the room is measured to: its label point, or the {@link labelPointOrbit} pole
   *  whose cell the walk reaches first. */
  seed: Point;
  /** No free cell nearest `seed` is reachable (a pocket), so the walk ends at the nearest
   *  reachable cell instead — see `roomRep`. */
  fallback: boolean;
  /** Shortest-walk polyline (mm, collinear-merged) from the room's nearest entrance to the room target. */
  path: Point[];
  /** The tightest unavoidable squeeze on the widest route in, or null if none. */
  pinch: { at: Point; clearMm: number } | null;
}

/** A key functional route's walk, for the render overlay. */
export interface OverlayRoute {
  fromRoomId: string;
  toRoomId: string;
  path: Point[];
}

/** Geometry for the opt-in circulation render overlay (ADR 0008). */
export interface CirculationOverlay {
  cellSizeMm: number;
  /** The first entrance's point; each room's path starts at its own nearest entrance. */
  entranceAt: Point;
  /** One row per SEED CELL of every entrance whose doorway seeds the walk, in entrance
   *  order, with the cell's centre — where a room walked from it starts. An entrance on a
   *  lattice line seeds both sides of it, so its id appears twice. Geometry for readers of
   *  the overlay (the equivariance oracle); nothing draws it. */
  entrances: Array<{ entranceId: string; seed: Point }>;
  rooms: OverlayRoom[];
  routes: OverlayRoute[];
}

/** Drop collinear interior points from a polyline (grid paths run axis-aligned). */
function simplifyPolyline(pts: Array<{ x: number; y: number }>): Point[] {
  if (pts.length <= 2) return pts.map((p) => ({ x: p.x, y: p.y }));
  const out: Point[] = [{ x: pts[0]!.x, y: pts[0]!.y }];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) !== 0) out.push({ x: b.x, y: b.y });
  }
  out.push({ x: pts[pts.length - 1]!.x, y: pts[pts.length - 1]!.y });
  return out;
}

/** Squared distance (mm²) from cell `k`'s centre to `p`. */
function sqDistTo(g: NavGrid, k: number, p: Point): number {
  const c = centreOf(g, k);
  return (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
}

/** The smallest {@link sqDistTo} over `cells` (Infinity for none). */
function nearestFreeSq(g: NavGrid, cells: readonly number[], p: Point): number {
  let best = Infinity;
  for (const k of cells) best = Math.min(best, sqDistTo(g, k, p));
  return best;
}

/** Reconstruct a BFS shortest path (source→target) as simplified mm points. */
function reconstructPath(g: NavGrid, parent: Int32Array, target: number): Point[] {
  const cells: number[] = [];
  for (let k = target; k >= 0; k = parent[k]!) cells.push(k);
  cells.reverse();
  return simplifyPolyline(cells.map((c) => centreOf(g, c)));
}

/**
 * Geometry for the opt-in circulation overlay: per reachable room the shortest walk
 * from its nearest entrance (the {@link RoomCirculation.walkDistanceMm} route) plus the pinch
 * cell of its widest route in (the {@link RoomCirculation.bottleneckClearWidthMm}
 * point); and the same key routes as the facts. Rebuilds the same nav grid as
 * {@link computeCirculation} via the shared {@link buildNav}, so the drawing matches
 * the reported numbers. Null when there is no walkable entrance. Pure & deterministic;
 * never called on the default compile path.
 */
export function computeCirculationOverlay(
  rooms: RRoom[],
  walls: RWall[],
  doors: RDoor[],
  openings: ROpening[],
  furniture: RFurniture[],
  access: AccessGraph,
  tol: number,
  bodyRadiusMm: number = DEFAULT_BODY_RADIUS_MM,
  /** Vertical runs on this storey — see {@link computeCirculation}. */
  verticals: RVertical[] = [],
  /** Floor voids on this storey — see {@link computeCirculation}. */
  voids: RVoid[] = [],
): CirculationOverlay | null {
  // Measured in the nav extent's own frame, exactly as the facts are; every point drawn
  // is moved back by the same origin (`o + (i + ½)·cell` is the old absolute centre).
  if (rooms.length === 0 || !access.hasEntrance) return null; // buildNav's "none", before any copy
  const o = extentOrigin(rooms);
  const entranceAt = [...doors, ...openings].find((d) => d.id === access.entrances[0])?.at;
  ({ rooms, walls, doors, openings, furniture, verticals, voids } = toExtentFrame(o, {
    rooms,
    walls,
    doors,
    openings,
    furniture,
    verticals,
    voids,
  }));
  const back = (p: Point): Point => ({ x: o.x + p.x, y: o.y + p.y });
  const nav = buildNav(rooms, walls, doors, openings, furniture, verticals, voids, access, tol, bodyRadiusMm);
  if (nav.kind !== "ok" || entranceAt === undefined) return null;
  const { g, seed, sources, sourceIds, sourceClear } = nav;

  // The same multi-source walk the facts measure: each room's path starts at its own
  // nearest entrance, and each pinch lies on the widest route from any entrance.
  const { dist, parent, from } = bfsNearest(g, sources);
  const pinchOf = new Int32Array(g.nx * g.ny).fill(-1);
  const widest = widestBottleneck(g, sources, sourceClear, pinchOf);

  // The same reachability-aware representative the facts measure to — a drawing that
  // ends somewhere else from the number it illustrates is worse than no drawing.
  const aim = entranceAim(nav);
  const rep = new Int32Array(rooms.length);
  const repTies: number[][] = [];
  const repSeed: Point[] = [];
  // The same door-route gate as the facts: a room `access` cannot reach draws no walk.
  const doorReachable = new Set(access.rooms.filter((n) => n.reachable).map((n) => n.id));
  for (let ri = 0; ri < rooms.length; ri++) {
    const r = roomRep(
      g,
      nav.roomCells[ri]!,
      seed[ri]!,
      nav.poles[ri]!,
      dist,
      (k) => aim.straightSq(k, from[k]!),
      (k) => aim.entranceOf(from[k]!),
      bboxCentre(rooms[ri]!),
    );
    rep[ri] = doorReachable.has(rooms[ri]!.id) ? r.k : -1;
    repTies.push(doorReachable.has(rooms[ri]!.id) ? r.ties : []);
    repSeed.push(r.seed);
  }

  const overlayRooms: OverlayRoom[] = [];
  for (let ri = 0; ri < rooms.length; ri++) {
    const a = rep[ri]!;
    if (a < 0) continue;
    // Pinch: the narrowest cell on the widest route into the room's best (widest) cell.
    let bestCell = -1;
    let bestVal = -Infinity;
    for (const k of nav.roomCells[ri]!) {
      if (widest[k]! > bestVal) {
        bestVal = widest[k]!;
        bestCell = k;
      }
    }
    const pinchCell = bestCell >= 0 ? pinchOf[bestCell]! : -1;
    overlayRooms.push({
      roomId: rooms[ri]!.id,
      entranceId: sourceIds[from[a]!]!,
      path: reconstructPath(g, parent, a).map(back),
      seed: back(repSeed[ri]!),
      // Farther from the seed than the room's nearest free cell, reachable or not — so it
      // is not one of the (possibly several, equidistant) cells a free walk would end at.
      fallback: sqDistTo(g, a, repSeed[ri]!) > nearestFreeSq(g, nav.roomCells[ri]!, repSeed[ri]!),
      pinch: pinchCell >= 0 ? { at: back(centreOf(g, pinchCell)), clearMm: Math.round(bestVal) } : null,
    });
  }

  const overlayRoutes: OverlayRoute[] = [];
  const addRoute = (fromIdx: number, targetIdxs: number[]): void => {
    if (rep[fromIdx]! < 0) return;
    // The same tie-set route the facts measure, drawn between the first pair realising it.
    const targets = targetIdxs.filter((tj) => tj !== fromIdx).map((tj) => ({ idx: tj, ties: repTies[tj]! }));
    const found = routeBetween(g, repTies[fromIdx]!, targets);
    if (!found) return;
    overlayRoutes.push({
      fromRoomId: rooms[fromIdx]!.id,
      toRoomId: rooms[found.idx]!.id,
      path: reconstructPath(g, found.parent, found.b).map(back),
    });
  };
  const livingDining = rooms.map((r, i) => (isLivingOrDining(r) ? i : -1)).filter((i) => i >= 0);
  const wetRooms = rooms.map((r, i) => (isWetRoom(r) ? i : -1)).filter((i) => i >= 0);
  for (let i = 0; i < rooms.length; i++) {
    if (isKitchen(rooms[i]!)) addRoute(i, livingDining);
  }
  for (let i = 0; i < rooms.length; i++) {
    if (isBedroom(rooms[i]!)) addRoute(i, wetRooms);
  }

  return {
    cellSizeMm: g.cell,
    entranceAt,
    entrances: sources.map((k, i) => ({ entranceId: sourceIds[i]!, seed: back(centreOf(g, k)) })),
    rooms: overlayRooms,
    routes: overlayRoutes,
  };
}
