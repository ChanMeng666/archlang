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

import type { RRoom, RDoor, ROpening, RFurniture, RVoid, RWall } from "../ir.js";
import type { Point } from "../ast.js";
import { outsideOpenEdge, type RVertical, type VerticalObstacle, verticalObstacles } from "../vertical.js";
import {
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
import { pointInPolygon, polygonEdges, polygonLabelPoint } from "../geometry/polygon.js";
import { matchesLivingDining } from "../vocabulary.js";

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
function seedCell(g: NavGrid, at: Point, rb: RoomBox, roomIndex: number, tol: number): number {
  const { ix, iy } = cellOf(g, at.x, at.y);
  // A POLYGON room's doorway need not sit on a bounding-box side, so the "step inward
  // perpendicular to that side" walk has no direction to take. Take the room's nearest
  // free cell to the doorway instead — scanned by increasing Chebyshev ring, row-major
  // inside each ring, so the answer is deterministic and local.
  if (rb.poly) {
    const reach = Math.ceil(tol / g.cell) + 2;
    for (let rad = 0; rad <= reach; rad++) {
      let best = -1;
      let bestD = Infinity;
      for (let sy = Math.max(0, iy - rad); sy <= Math.min(g.ny - 1, iy + rad); sy++) {
        for (let sx = Math.max(0, ix - rad); sx <= Math.min(g.nx - 1, ix + rad); sx++) {
          if (Math.max(Math.abs(sx - ix), Math.abs(sy - iy)) !== rad) continue;
          const k = sy * g.nx + sx;
          if (g.roomIdx[k] !== roomIndex || !g.free[k]) continue;
          const c = centreOf(g, k);
          const d = (c.x - at.x) ** 2 + (c.y - at.y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
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
 * The cells a Manhattan carve from seed `a` to seed `b` would open through the wall band
 * that separates them — or null when the run meets a furniture-eroded cell, since we
 * never carve through furniture. Pure: the caller applies the result, so a blocked
 * attempt leaves no half-open slit behind and another threshold point can be tried.
 */
function carvePath(g: NavGrid, eroded: Uint8Array, a: number, b: number): number[] | null {
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
  while (ax !== bx) {
    ax += ax < bx ? 1 : -1;
    if (!step(ax, ay)) return null;
  }
  while (ay !== by) {
    ay += ay < by ? 1 : -1;
    if (!step(ax, ay)) return null;
  }
  return cells;
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
function thresholdPoints(g: NavGrid, at: Point, rb: RoomBox, clear: number, tol: number): Point[] {
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
  const spansX = Math.abs(at.y - rb.y) <= tol || Math.abs(at.y - (rb.y + rb.h)) <= tol;
  for (let i = 1; i <= steps; i++) {
    const d = i * g.cell;
    out.push(spansX ? { x: at.x + d, y: at.y } : { x: at.x, y: at.y + d });
    out.push(spansX ? { x: at.x - d, y: at.y } : { x: at.x, y: at.y - d });
  }
  return out;
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
 * affect the result. When `pinch` is supplied it is filled with, per cell, the index
 * of the limiting (narrowest) cell on that cell's widest route — used to place the
 * overlay's bottleneck marker.
 */
function widestBottleneck(g: NavGrid, sources: number[], seed: number, pinch?: Int32Array): Float64Array {
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

  for (const s of sources) {
    if (seed > best[s]!) {
      best[s] = seed;
      if (pinch) pinch[s] = s;
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
        // The limiting cell is nb when it is the new narrowest, else u's limiter.
        if (pinch) pinch[nb] = g.clearMm[nb]! < best[u]! ? nb : pinch[u]!;
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
  verticals: RVertical[],
  voids: RVoid[],
  roomIndexById: Map<string, number>,
  tol: number,
  bodyRadius: number,
): NavGrid | null {
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

  // Obstacles: furniture footprints (halo on every side) plus each vertical run's
  // footprint, whose halo is suppressed outside its entry edge(s) — you have to be able
  // to stand at the foot of a flight to use it (see `src/vertical.ts`).
  const obstacles: VerticalObstacle[] = [
    ...furniture.map((f) => ({ rect: rectOf(f), open: [] as VerticalObstacle["open"] })),
    ...verticalObstacles(verticals),
    // A floor void blocks the cells inside it — you cannot walk across a hole — with the
    // body-radius halo suppressed on EVERY edge: you can stand at the railing. Same
    // mechanism a stair's entry edge uses, with the whole rectangle "open".
    ...voids.map((v) => ({ rect: rectOf(v), open: ["top", "bottom", "left", "right"] as VerticalObstacle["open"] })),
  ];
  const free = new Uint8Array(nx * ny);
  const roomIdx = new Int32Array(nx * ny).fill(-1);
  const eroded = new Uint8Array(nx * ny); // in-room cell blocked by furniture (never carved)
  const g: NavGrid = { minX, minY, cell, nx, ny, free, roomIdx, clearMm: new Float64Array(nx * ny) };
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
    const pathAt = (at: Point): number[] | null => {
      const a = seedCell(g, at, rects[ai]!, ai, tol);
      const b = seedCell(g, at, rects[bi]!, bi, tol);
      return a < 0 || b < 0 ? null : carvePath(g, eroded, a, b);
    };
    const apply = (path: number[]): void => {
      for (const k of path) {
        g.free[k] = 1;
        clearAt.set(k, Math.min(clearAt.get(k) ?? Infinity, c.clear));
      }
    };
    const points = thresholdPoints(g, c.at, rects[ai]!, c.clear, tol);
    const centre = pathAt(points[0]!);
    if (centre) {
      apply(centre); // the canonical one-cell threshold slit at the opening's centre
      continue;
    }
    // The centre of the opening is sealed by furniture. Carve every part of the rest of
    // its width that IS walkable, so a fixture across half a wide threshold narrows the
    // way (the widest path then finds the clear half) instead of closing the room off.
    for (let i = 1; i < points.length; i++) {
      const p = pathAt(points[i]!);
      if (p) apply(p);
    }
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

/** Shared nav-grid setup for both the facts and overlay entry points: the grid, each
 *  room's anchor + free-cell list, and the entrance seed cell (with its clear width
 *  stamped). `none` → no entrance/rooms (null circulation); `empty` → an entrance but
 *  nothing walkable from it (facts return an empty model). */
type Nav =
  | { kind: "none" }
  | { kind: "empty"; entranceId: string; cellSizeMm: number }
  | {
      kind: "ok";
      g: NavGrid;
      anchor: Int32Array;
      roomCells: number[][];
      source: number;
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
): Nav {
  if (rooms.length === 0 || !access.hasEntrance) return { kind: "none" };

  const roomIndexById = new Map<string, number>(rooms.map((r, i) => [r.id, i]));
  const rects = rooms.map((r) => roomBox(r));
  const atById = new Map<string, Point>();
  for (const d of doors) atById.set(d.id, d.at);
  for (const o of openings) atById.set(o.id, o.at);

  // Internal connectors (two real room endpoints) become carved thresholds, tagged
  // with the door/opening clear width the access graph already estimated.
  const connectors = access.edges
    .filter((e) => !e.ambiguous && roomIndexById.has(e.between[0]) && roomIndexById.has(e.between[1]))
    .map((e) => ({ at: atById.get(e.doorId)!, between: e.between, clear: e.estimatedClearWidth }))
    .filter((c) => c.at !== undefined);

  const g = buildGrid(rooms, walls, connectors, furniture, verticals, voids, roomIndexById, tol, bodyRadius);
  if (!g) return { kind: "none" };

  // In one pass: each room's anchor (free cell nearest its seed point, row-major so ties
  // resolve deterministically) and its full free-cell list (route bottlenecks seed the
  // whole source room so its internal crowding can't cap the route).
  //
  // The seed is where you would stand in the room: its centroid — but a concave (L, U, C)
  // ring can put its exact centroid in its own notch, OFF the floor, and the nearest free
  // cell to an off-floor point is pinned to the lip of the notch rather than sitting in
  // the room's body. `polygonLabelPoint` is the same closed-form centroid whenever the
  // centroid is legal (so nothing that already measured correctly moves) and the ring's
  // pole of inaccessibility — the middle of the widest part of the floor — only when it
  // is not. Same rule the label text uses, so the drawn walk ends where the name is.
  const anchor = new Int32Array(rooms.length).fill(-1);
  const anchorDist = new Float64Array(rooms.length).fill(Infinity);
  const roomCells: number[][] = rooms.map(() => []);
  const seed = rects.map((rb) => (rb.poly ? polygonLabelPoint(rb.poly) : { x: rb.x + rb.w / 2, y: rb.y + rb.h / 2 }));
  for (let k = 0; k < g.free.length; k++) {
    const ri = g.roomIdx[k]!;
    if (!g.free[k] || ri < 0) continue;
    roomCells[ri]!.push(k);
    const c = centreOf(g, k);
    const cen = seed[ri]!;
    const dsq = (c.x - cen.x) ** 2 + (c.y - cen.y) ** 2;
    if (dsq < anchorDist[ri]!) {
      anchorDist[ri] = dsq;
      anchor[ri] = k;
    }
  }

  const entranceId = access.entrances[0]!;
  const entranceEdge = access.edges.find((e) => e.doorId === entranceId);
  const entranceRoomId = entranceEdge?.between.find((s) => s !== EXTERIOR_NODE && s !== "");
  const entranceRoomIdx = entranceRoomId !== undefined ? roomIndexById.get(entranceRoomId) : undefined;
  const entrancePoint = atById.get(entranceId);
  if (entranceRoomIdx === undefined || entrancePoint === undefined) {
    return { kind: "empty", entranceId, cellSizeMm: g.cell };
  }

  const source = seedCell(g, entrancePoint, rects[entranceRoomIdx]!, entranceRoomIdx, tol);
  if (source < 0) return { kind: "empty", entranceId, cellSizeMm: g.cell }; // sealed doorway

  // The entrance sits in the outer wall (no exterior cells to carve), so its inner
  // seed reads a degenerate 1-cell width; stamp the entrance's own clear width there.
  const entranceClear = entranceEdge?.estimatedClearWidth;
  if (entranceClear !== undefined) g.clearMm[source] = entranceClear;

  return { kind: "ok", g, anchor, roomCells, source, entranceId, entrancePoint };
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
  /** Vertical runs on this storey — obstacles with a walkable entry side. Append-only:
   *  omitting it is exactly the pre-v1.21 behaviour. */
  verticals: RVertical[] = [],
  /** Floor voids on this storey — blocked cells with a walkable edge on all four sides.
   *  Append-only: omitting it is exactly the pre-v1.29 behaviour. */
  voids: RVoid[] = [],
): CirculationModel | null {
  const nav = buildNav(rooms, walls, doors, openings, furniture, verticals, voids, access, tol, bodyRadiusMm);
  if (nav.kind === "none") return null;
  if (nav.kind === "empty") {
    return { entranceId: nav.entranceId, cellSizeMm: nav.cellSizeMm, bodyRadiusMm, rooms: [], routes: [] };
  }
  const { g, anchor, roomCells, source, entranceId } = nav;
  const cellSizeMm = g.cell;

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

// ---- overlay geometry (opt-in render only; describe()'s JSON is unaffected) ----

/** The entrance walk into one room, for the render overlay. */
export interface OverlayRoom {
  roomId: string;
  /** Shortest-walk polyline (mm, collinear-merged) from the entrance to the room target. */
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
  entranceAt: Point;
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

/** Reconstruct a BFS shortest path (source→target) as simplified mm points. */
function reconstructPath(g: NavGrid, parent: Int32Array, target: number): Point[] {
  const cells: number[] = [];
  for (let k = target; k >= 0; k = parent[k]!) cells.push(k);
  cells.reverse();
  return simplifyPolyline(cells.map((c) => centreOf(g, c)));
}

/**
 * Geometry for the opt-in circulation overlay: per reachable room the shortest walk
 * from the entrance (the {@link RoomCirculation.walkDistanceMm} route) plus the pinch
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
  const nav = buildNav(rooms, walls, doors, openings, furniture, verticals, voids, access, tol, bodyRadiusMm);
  if (nav.kind !== "ok") return null;
  const { g, anchor, source, entrancePoint } = nav;

  const { dist, parent } = bfs(g, source);
  const pinchOf = new Int32Array(g.nx * g.ny).fill(-1);
  const widest = widestBottleneck(g, [source], g.clearMm[source]!, pinchOf);

  const overlayRooms: OverlayRoom[] = [];
  for (let ri = 0; ri < rooms.length; ri++) {
    const a = anchor[ri]!;
    if (a < 0 || dist[a]! < 0) continue;
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
      path: reconstructPath(g, parent, a),
      pinch: pinchCell >= 0 ? { at: centreOf(g, pinchCell), clearMm: Math.round(bestVal) } : null,
    });
  }

  const overlayRoutes: OverlayRoute[] = [];
  const addRoute = (fromIdx: number, targetIdxs: number[]): void => {
    const a = anchor[fromIdx]!;
    if (a < 0) return;
    const r = bfs(g, a);
    let best = -1;
    let bestDist = Infinity;
    for (const tj of targetIdxs) {
      if (tj === fromIdx) continue;
      const ta = anchor[tj]!;
      if (ta < 0 || r.dist[ta]! < 0) continue;
      if (r.dist[ta]! < bestDist) {
        bestDist = r.dist[ta]!;
        best = tj;
      }
    }
    if (best < 0) return;
    overlayRoutes.push({
      fromRoomId: rooms[fromIdx]!.id,
      toRoomId: rooms[best]!.id,
      path: reconstructPath(g, r.parent, anchor[best]!),
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

  return { cellSizeMm: g.cell, entranceAt: entrancePoint, rooms: overlayRooms, routes: overlayRoutes };
}
