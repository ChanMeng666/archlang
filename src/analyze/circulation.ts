/**
 * Circulation as FACTS: not just "can you reach this room?" (that is the door
 * access graph in analyze.ts and the per-room reachable-floor flood-fill in
 * occupancy.ts) but **how far, how wide and how direct** the walk is — from the
 * building's entrance to each room, and along a few key functional routes.
 *
 * The model is a whole-plan **navigation grid** with the same discipline as
 * occupancy.ts (fixed cell size, integer cell coordinates, source-ordered seeds,
 * row-major iteration — never a float as a key). Three things make it a *walking*
 * model rather than a bare reachability one:
 *
 *   - WALLS BLOCK, DOORS CARVE. Walls are rasterised as blocked cells (a wall thinner
 *     than a cell occupies no cell centre, so without this adjacent rooms would leak
 *     into each other along their whole shared edge); each connector then carves a
 *     threshold slit between the two rooms' nearest free cells. Rooms connect only
 *     where a real door/opening is.
 *   - CLEARANCE EROSION. A cell is walkable only if its centre is farther than a body
 *     radius (default 300 mm) from every furniture footprint — obstacles are inflated
 *     by the space a person occupies, so a path is one a body actually fits through.
 *   - CLEARANCE IS DISTANCE TO FURNITURE, NOT WALLS. Inside a room you walk freely, so
 *     a cell's clear width comes from a distance transform seeded on the furniture-
 *     eroded cells; a doorway cell instead reads its connector's modeled clear width.
 *     Only doors and furniture pinches ever narrow the way — never a room wall.
 *
 * Distances come from a deterministic 4-connected uniform-cost BFS (shortest walk).
 * The bottleneck is a widest-path (max-min clearance) — the *unavoidable* squeeze on
 * the best route into a room, the cell-grid analogue of the access graph's widest-path
 * clear width, not the min along one shortest path (which degenerates wherever the path
 * hugs a wall). These are honest **coarse** numbers, rounded deterministically; facts
 * for an agent to read, never a layout the compiler generates (ADR 0005/0006/0008).
 * Pure, synchronous, zero-dependency.
 */

import type { RRoom, RDoor, ROpening, RFurniture, RWall } from "../ir.js";
import type { Point } from "../ast.js";
import {
  rectOf,
  roomUses,
  isBedroom,
  isKitchen,
  isWetRoom,
  EXTERIOR_NODE,
  type AccessGraph,
  type BBox,
} from "../analyze.js";
import { pointInRect } from "../geometry/rect.js";

/** Radius (mm) of the walking body obstacles are inflated by (clearance erosion). */
export const DEFAULT_BODY_RADIUS_MM = 300;

/** Target cell count over the whole plan; the cell grows for a large plan so the
 *  grid stays bounded regardless of size. */
const TARGET_CELLS = 10_000;
const MIN_CELL_MM = 100;
const MAX_CELLS_PER_AXIS = 200;

/** Circulation facts for one room, measured from the building entrance. */
export interface RoomCirculation {
  roomId: string;
  /** Walking distance (mm) from the entrance to the room's centre-nearest free cell,
   *  over the clearance-eroded nav grid. Grid-quantized to `cellSizeMm`; coarse. */
  walkDistanceMm: number;
  /** Narrowest unavoidable clear width (mm) on the widest route from the entrance into
   *  the room — a modeled door width, or a furniture pinch. Coarse and grid-quantized. */
  bottleneckClearWidthMm: number;
  /** walkDistance ÷ straight-line (entrance threshold → room target). ≥ ~1; 2 dp. */
  detourRatio: number;
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
 *  plan has no modeled exterior entrance (nothing to measure a walk from). */
export interface CirculationModel {
  /** Door id the walk is measured from — the first entrance in source order. */
  entranceId: string;
  /** Nav-grid cell size (mm) — the quantum every distance is rounded to. */
  cellSizeMm: number;
  /** Body radius (mm) obstacles were inflated by. */
  bodyRadiusMm: number;
  /** One entry per room reachable from the entrance on the walkable grid (source order). */
  rooms: RoomCirculation[];
  /** Key functional routes (kitchen → nearest living/dining, bedroom → nearest bath). */
  routes: CirculationRoute[];
}

/** Rooms that read as a living or dining space (declared use, else a label match —
 *  analyze.roomUses only infers bedroom/bath/kitchen/hall/entry from a label). */
const LIVING_DINING_RE = /living|lounge|sitting|family|dining/i;
const isLivingOrDining = (r: RRoom): boolean => {
  const u = roomUses(r);
  return u.has("living") || u.has("dining") || LIVING_DINING_RE.test(r.label ?? r.id);
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

interface NavGrid {
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
}

/** Cell index of a point, clamped into the grid. */
function cellOf(g: NavGrid, x: number, y: number): { ix: number; iy: number } {
  return {
    ix: clamp(Math.floor((x - g.minX) / g.cell), 0, g.nx - 1),
    iy: clamp(Math.floor((y - g.minY) / g.cell), 0, g.ny - 1),
  };
}

/** Centre of a cell in mm. */
function centreOf(g: NavGrid, k: number): { x: number; y: number } {
  const ix = k % g.nx;
  const iy = (k - ix) / g.nx;
  return { x: g.minX + (ix + 0.5) * g.cell, y: g.minY + (iy + 0.5) * g.cell };
}

/**
 * Step inward from a connector on a room edge to the first free cell of that room
 * (mirrors occupancy.ts' inward seeding). Returns −1 when the doorway's inward run
 * is sealed by furniture, so a blocked doorway simply yields no seed.
 */
function seedCell(g: NavGrid, at: Point, rb: BBox, roomIndex: number, tol: number): number {
  const { ix, iy } = cellOf(g, at.x, at.y);
  const dx = Math.abs(at.x - rb.x) <= tol ? 1 : Math.abs(at.x - (rb.x + rb.w)) <= tol ? -1 : 0;
  const dy = Math.abs(at.y - rb.y) <= tol ? 1 : Math.abs(at.y - (rb.y + rb.h)) <= tol ? -1 : 0;
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

/**
 * Carve a walkable Manhattan path between two seeds through the wall band that
 * separates them, and record each carved cell's connector clear width in `clearAt`
 * (min when connectors overlap). Opens any cell that is not furniture-eroded (so it
 * reconnects rasterised wall cells) — the carved threshold is a ~1-cell slit whose
 * grid clearance is degenerate, so the recorded connector width is the honest number.
 */
function carve(
  g: NavGrid,
  eroded: Uint8Array,
  a: number,
  b: number,
  clear: number,
  clearAt: Map<number, number>,
): void {
  let ax = a % g.nx;
  let ay = (a - ax) / g.nx;
  const bx = b % g.nx;
  const by = (b - bx) / g.nx;
  const open = (x: number, y: number): void => {
    const k = y * g.nx + x;
    if (eroded[k]) return; // never carve through furniture
    g.free[k] = 1;
    clearAt.set(k, Math.min(clearAt.get(k) ?? Infinity, clear));
  };
  while (ax !== bx) {
    ax += ax < bx ? 1 : -1;
    open(ax, ay);
  }
  while (ay !== by) {
    ay += ay < by ? 1 : -1;
    open(ax, ay);
  }
}

/** 4-connected uniform-cost BFS from `source`; returns hop distance + parent. */
function bfs(g: NavGrid, source: number): { dist: Int32Array; parent: Int32Array } {
  const dist = new Int32Array(g.nx * g.ny).fill(-1);
  const parent = new Int32Array(g.nx * g.ny).fill(-1);
  dist[source] = 0;
  const queue = [source];
  for (let h = 0; h < queue.length; h++) {
    const k = queue[h]!;
    const ix = k % g.nx;
    const iy = (k - ix) / g.nx;
    const nbrs = [
      ix > 0 ? k - 1 : -1,
      ix < g.nx - 1 ? k + 1 : -1,
      iy > 0 ? k - g.nx : -1,
      iy < g.ny - 1 ? k + g.nx : -1,
    ];
    for (const nb of nbrs) {
      if (nb >= 0 && g.free[nb] && dist[nb]! < 0) {
        dist[nb] = dist[k]! + 1;
        parent[nb] = k;
        queue.push(nb);
      }
    }
  }
  return { dist, parent };
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
 * `seed` (the entrance's own clear width for the entrance walk; `+Infinity` for a
 * room→room route, so the source room's internal furniture-crowding never caps it).
 * Deterministic: the best value per cell is unique, so the heap's tie order does not
 * affect the result.
 */
function widestBottleneck(g: NavGrid, sources: number[], seed: number): Float64Array {
  const n = g.nx * g.ny;
  const best = new Float64Array(n).fill(-Infinity);
  const done = new Uint8Array(n);

  // Binary max-heap over (key = bottleneck-so-far, cell), on parallel arrays.
  const hk: number[] = [];
  const hv: number[] = [];
  const swap = (i: number, j: number): void => {
    [hk[i], hk[j]] = [hk[j]!, hk[i]!];
    [hv[i], hv[j]] = [hv[j]!, hv[i]!];
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

  for (const s of sources) {
    if (seed > best[s]!) {
      best[s] = seed;
      push(seed, s);
    }
  }

  while (hk.length > 0) {
    const u = pop();
    if (done[u]) continue;
    done[u] = 1;
    const ix = u % g.nx;
    const iy = (u - ix) / g.nx;
    const nbrs = [
      ix > 0 ? u - 1 : -1,
      ix < g.nx - 1 ? u + 1 : -1,
      iy > 0 ? u - g.nx : -1,
      iy < g.ny - 1 ? u + g.nx : -1,
    ];
    for (const nb of nbrs) {
      if (nb < 0 || !g.free[nb] || done[nb]) continue;
      const cand = Math.min(best[u]!, g.clearMm[nb]!);
      if (cand > best[nb]!) {
        best[nb] = cand;
        push(cand, nb);
      }
    }
  }
  return best;
}

/** Euclidean distance from a point to a segment. */
function distPointToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Build the clearance-eroded nav grid, then stitch it through the connectors. */
function buildGrid(
  rooms: RRoom[],
  walls: RWall[],
  connectors: Array<{ at: Point; between: [string, string]; clear: number }>,
  furniture: RFurniture[],
  roomIndexById: Map<string, number>,
  tol: number,
  bodyRadius: number,
): NavGrid | null {
  const rects = rooms.map((r) => rectOf(r));
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

  const cell = Math.max(
    MIN_CELL_MM,
    Math.ceil(Math.sqrt((W * H) / TARGET_CELLS)),
    Math.ceil(W / MAX_CELLS_PER_AXIS),
    Math.ceil(H / MAX_CELLS_PER_AXIS),
  );
  const nx = Math.max(1, Math.ceil(W / cell));
  const ny = Math.max(1, Math.ceil(H / cell));

  const furnRects = furniture.map((f) => rectOf(f));
  const free = new Uint8Array(nx * ny);
  const roomIdx = new Int32Array(nx * ny).fill(-1);
  const eroded = new Uint8Array(nx * ny); // in-room cell blocked by furniture (never carved)
  const g: NavGrid = { minX, minY, cell, nx, ny, free, roomIdx, clearMm: new Float64Array(nx * ny) };
  const furnObstacle: number[] = []; // in-room cells eroded by furniture (clearance seeds)

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const cx = minX + (ix + 0.5) * cell;
      const cy = minY + (iy + 0.5) * cell;
      let ri = -1;
      for (let j = 0; j < rects.length; j++) {
        if (pointInRect(cx, cy, rects[j]!)) {
          ri = j;
          break; // first room in source order wins (rooms normally do not overlap)
        }
      }
      const k = iy * nx + ix;
      roomIdx[k] = ri;
      if (ri < 0) continue; // outside every room → wall / exterior, blocked
      let blocked = false;
      for (const fr of furnRects) {
        if (distPointToRect(cx, cy, fr) <= bodyRadius) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        eroded[k] = 1;
        furnObstacle.push(k); // in-room, eroded by furniture — a real squeeze
      } else {
        free[k] = 1;
      }
    }
  }

  // Rasterise walls as blocked cells so adjacent rooms don't leak into each other
  // across a shared partition (a wall thinner than a cell occupies no cell centre);
  // a cell within half the wall thickness of a segment is blocked. Doors carve back
  // through below. Furniture-eroded cells stay eroded (never reopened).
  for (const w of walls) {
    const half = w.thickness / 2;
    const pts = w.points;
    const segCount = w.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segCount; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const loX = Math.min(a.x, b.x) - half;
      const hiX = Math.max(a.x, b.x) + half;
      const loY = Math.min(a.y, b.y) - half;
      const hiY = Math.max(a.y, b.y) + half;
      const ix0 = clamp(Math.floor((loX - minX) / cell), 0, nx - 1);
      const ix1 = clamp(Math.floor((hiX - minX) / cell), 0, nx - 1);
      const iy0 = clamp(Math.floor((loY - minY) / cell), 0, ny - 1);
      const iy1 = clamp(Math.floor((hiY - minY) / cell), 0, ny - 1);
      for (let iy = iy0; iy <= iy1; iy++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const cx = minX + (ix + 0.5) * cell;
          const cy = minY + (iy + 0.5) * cell;
          if (distPointToSeg(cx, cy, a.x, a.y, b.x, b.y) <= half) free[iy * nx + ix] = 0;
        }
      }
    }
  }

  // Stitch: carve a threshold through the wall band at each internal connector,
  // recording the connector's clear width at the (grid-degenerate) carved cells.
  const clearAt = new Map<number, number>();
  for (const c of connectors) {
    const ai = roomIndexById.get(c.between[0]);
    const bi = roomIndexById.get(c.between[1]);
    if (ai === undefined || bi === undefined) continue; // exterior / unknown endpoint
    const a = seedCell(g, c.at, rects[ai]!, ai, tol);
    const b = seedCell(g, c.at, rects[bi]!, bi, tol);
    if (a >= 0 && b >= 0) carve(g, eroded, a, b, c.clear, clearAt);
  }

  // Clearance comes from distance to FURNITURE, not to walls: inside a room you walk
  // freely, so only a furniture pinch (or a doorway) narrows the way. Seed a
  // 4-connected distance transform from the furniture-eroded cells; clear width at a
  // free cell ≈ (2·hops − 1)·cell. A cell with no furniture in reach reads BIG (an
  // open room), so it never sets the bottleneck — only doors and furniture gaps do.
  const BIG = W + H;
  const D = new Int32Array(nx * ny).fill(-1);
  const q: number[] = [];
  for (const k of furnObstacle) {
    D[k] = 0;
    q.push(k);
  }
  for (let h = 0; h < q.length; h++) {
    const k = q[h]!;
    const ix = k % nx;
    const iy = (k - ix) / nx;
    const nbrs = [ix > 0 ? k - 1 : -1, ix < nx - 1 ? k + 1 : -1, iy > 0 ? k - nx : -1, iy < ny - 1 ? k + nx : -1];
    for (const nb of nbrs) {
      if (nb >= 0 && D[nb]! < 0) {
        D[nb] = D[k]! + 1;
        q.push(nb);
      }
    }
  }
  for (let k = 0; k < free.length; k++) {
    g.clearMm[k] = free[k] ? (D[k]! >= 0 ? Math.max(0, 2 * D[k]! - 1) * cell : BIG) : 0;
  }
  // A carved doorway is a 1-cell slit the whole path must cross; its real clearance
  // is the connector's modeled clear width, so stamp that over the slit cells.
  for (const [k, cw] of clearAt) g.clearMm[k] = cw;

  return g;
}

/**
 * Whole-plan circulation facts. Deterministic; returns null when the plan has no
 * modeled exterior entrance (there is nothing to measure a walk from — mirrors how
 * the access graph reports `hasEntrance: false`).
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
): CirculationModel | null {
  if (rooms.length === 0 || !access.hasEntrance) return null;

  const roomIndexById = new Map<string, number>(rooms.map((r, i) => [r.id, i]));
  const rects = rooms.map((r) => rectOf(r));
  const atById = new Map<string, Point>();
  for (const d of doors) atById.set(d.id, d.at);
  for (const o of openings) atById.set(o.id, o.at);

  // Internal connectors (two real room endpoints) become carved thresholds, tagged
  // with the door/opening clear width the access graph already estimated.
  const connectors = access.edges
    .filter((e) => !e.ambiguous && roomIndexById.has(e.between[0]) && roomIndexById.has(e.between[1]))
    .map((e) => ({ at: atById.get(e.doorId)!, between: e.between, clear: e.estimatedClearWidth }))
    .filter((c) => c.at !== undefined);

  const g = buildGrid(rooms, walls, connectors, furniture, roomIndexById, tol, bodyRadiusMm);
  if (!g) return null;

  // In one pass: each room's anchor (free cell nearest its centroid, row-major so ties
  // resolve deterministically) and its full free-cell list (route bottlenecks seed the
  // whole source room so its internal crowding can't cap the route).
  const anchor = new Int32Array(rooms.length).fill(-1);
  const anchorDist = new Float64Array(rooms.length).fill(Infinity);
  const roomCells: number[][] = rooms.map(() => []);
  const centroid = rects.map((rb) => ({ x: rb.x + rb.w / 2, y: rb.y + rb.h / 2 }));
  for (let k = 0; k < g.free.length; k++) {
    const ri = g.roomIdx[k]!;
    if (!g.free[k] || ri < 0) continue;
    roomCells[ri]!.push(k);
    const c = centreOf(g, k);
    const cen = centroid[ri]!;
    const dsq = (c.x - cen.x) ** 2 + (c.y - cen.y) ** 2;
    if (dsq < anchorDist[ri]!) {
      anchorDist[ri] = dsq;
      anchor[ri] = k;
    }
  }

  const cellSizeMm = g.cell;
  const empty: CirculationModel = { entranceId: "", cellSizeMm, bodyRadiusMm, rooms: [], routes: [] };

  const entranceId = access.entrances[0]!;
  const entranceEdge = access.edges.find((e) => e.doorId === entranceId);
  const entranceRoomId = entranceEdge?.between.find((s) => s !== EXTERIOR_NODE && s !== "");
  const entranceRoomIdx = entranceRoomId !== undefined ? roomIndexById.get(entranceRoomId) : undefined;
  const entrancePoint = atById.get(entranceId);
  if (entranceRoomIdx === undefined || entrancePoint === undefined) return { ...empty, entranceId };

  const source = seedCell(g, entrancePoint, rects[entranceRoomIdx]!, entranceRoomIdx, tol);
  if (source < 0) return { ...empty, entranceId }; // sealed doorway → nothing walkable

  // The entrance sits in the outer wall (no exterior cells to carve), so its inner
  // seed reads a degenerate 1-cell width; stamp the entrance's own clear width there.
  const entranceClear = entranceEdge?.estimatedClearWidth;
  if (entranceClear !== undefined) g.clearMm[source] = entranceClear;

  const { dist } = bfs(g, source);
  const widest = widestBottleneck(g, [source], g.clearMm[source]!); // seeded with the entrance width
  const roomWidest = perRoomMax(g, widest, rooms.length); // widest route *into* each room
  const origin = centreOf(g, source); // walk & straight-line share the threshold origin

  const roomFacts: RoomCirculation[] = [];
  for (let ri = 0; ri < rooms.length; ri++) {
    const a = anchor[ri]!;
    if (a < 0 || dist[a]! < 0) continue; // no free cell, or unreachable on the grid
    const walkExact = dist[a]! * g.cell;
    const centre = centreOf(g, a);
    const straight = Math.hypot(centre.x - origin.x, centre.y - origin.y);
    roomFacts.push({
      roomId: rooms[ri]!.id,
      walkDistanceMm: Math.round(walkExact),
      bottleneckClearWidthMm: Math.round(roomWidest[ri]!),
      detourRatio: straight > 0 ? r2(walkExact / straight) : 1,
    });
  }

  // Key functional routes: kitchen → nearest living/dining, bedroom → nearest bath.
  const routes: CirculationRoute[] = [];
  const addNearestRoute = (fromIdx: number, targetIdxs: number[]): void => {
    const a = anchor[fromIdx]!;
    if (a < 0) return;
    const r = bfs(g, a);
    let best = -1;
    let bestDist = Infinity;
    for (const tj of targetIdxs) {
      if (tj === fromIdx) continue;
      const ta = anchor[tj]!;
      if (ta < 0 || r.dist[ta]! < 0) continue;
      const d = r.dist[ta]!;
      if (d < bestDist) {
        bestDist = d;
        best = tj;
      }
    }
    if (best < 0) return;
    const ta = anchor[best]!;
    const walkExact = r.dist[ta]! * g.cell;
    // Seed from every cell of room A with no cap: you start inside room A, so its own
    // furniture-crowding must not limit the route — only the doors/corridors between A
    // and B should.
    const wide = perRoomMax(g, widestBottleneck(g, roomCells[fromIdx]!, Number.POSITIVE_INFINITY), rooms.length);
    const from = centreOf(g, a);
    const to = centreOf(g, ta);
    const straight = Math.hypot(to.x - from.x, to.y - from.y);
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

  return { entranceId, cellSizeMm, bodyRadiusMm, rooms: roomFacts, routes };
}
