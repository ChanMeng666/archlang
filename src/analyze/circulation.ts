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
 *
 * This module keeps the facts: the {@link CirculationModel} types, {@link computeCirculation}
 * and {@link roomBottlenecks}. The grid and the walking primitives live in `nav-grid.ts`,
 * re-exported from here. The overlay geometry lives in `circulation-overlay.ts`, which this
 * module re-exports as types only, so nothing that imports the facts loads the overlay. Nothing
 * here charges the step meter.
 */

import type { RRoom, RDoor, ROpening, RFurniture, RVoid, RWall } from "../ir.js";
import type { ArrivingRun, RVertical } from "../vertical.js";
import { accessDigraph, reachFrom, isBedroom, isKitchen, isWetRoom, type AccessGraph } from "../analyze.js";
import type { NavCache, Nav, NavStats } from "./nav-grid.js";
import {
  DEFAULT_BODY_RADIUS_MM,
  isLivingOrDining,
  r2,
  landedOn,
  shaftsInFrame,
  bfsNearest,
  reachableFromAny,
  perRoomMax,
  widestBottleneck,
  toExtentFrame,
  extentOrigin,
  buildNav,
  entranceAim,
  bboxCentre,
  roomRep,
  routeBetween,
} from "./nav-grid.js";

export type { NavCache, NavGrid, NavExtent, NavStats } from "./nav-grid.js";
export {
  DEFAULT_BODY_RADIUS_MM,
  navCellSizeMm,
  centreFreedomToClearWidth,
  bfs,
  bfsNearest,
  reachableFromAny,
  widestBottleneck,
  distanceTransform4,
  navExtent,
  rasteriseWallSegments,
} from "./nav-grid.js";
export type { OverlayRoom, OverlayRoute, CirculationOverlay } from "./circulation-overlay.js";

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

/**
 * The access graph a storey's walk starts from, given the runs that arrive on it (PS0.3).
 * `arrivals` are passed only for a storey a shaft reaches and no door from the ground does
 * (`arrivalRuns`, `src/vertical.ts`), so every exterior door it has opens onto a balcony: a
 * slab off a room, not a way anyone arrives. When a run lands in a room there, the walk starts
 * from the runs, and those doors are no entrance to it: `access` with no entrances, every edge
 * kept, so a room reached only by crossing a balcony is still door-reachable and is reported as
 * a room the walk does not reach, not as one no door leads to. `access` itself otherwise, so a
 * storey with a door from the ground, or one no shaft lands on, is walked exactly as before.
 */
function walkedFrom(access: AccessGraph, arrivals: readonly ArrivingRun[], rooms: readonly RRoom[]): AccessGraph {
  if (!access.hasEntrance || landedOn(arrivals, rooms).length === 0) return access;
  return { ...access, entrances: [], hasEntrance: false };
}

/**
 * Each door-reachable room's `bottleneckClearWidthMm` and nothing else: the opening steps of
 * {@link computeCirculation} (the same arrivals, extent frame, nav grid and widest-route
 * search, written out the same way) without the walks, routes, sealed-room controls or the
 * blocked-room width ladder, each of which builds more grids. For a caller that re-measures a
 * plan VARIANT (a lint rule checking that widening a door would clear a room) and reads only
 * the reading. A room with no reading here has no `rooms[]` fact there either, or a reading
 * of 0. `test/circulation-room-bottlenecks.test.ts` pins it equal to `computeCirculation` on
 * every corpus room, so the two cannot drift apart.
 *
 * With `avoiding`, it also reads each requested room AVOIDING a set of connectors: the widest
 * route into it that crosses no cell those connectors' carves opened and starts from none of
 * those entrances (a cell any of them opened, or seeds, is left out whole). That is a lower
 * bound on the room's reading in the variant where those connectors are NOT widened, because
 * every cell left is free there with the same clearance (clearance is the furniture distance;
 * the stamps on the other connectors are the same). The walk the main search took is tried
 * first and costs nothing when it already avoids them; otherwise one more search runs on this
 * grid, shared by rooms avoiding the same set — never another grid build.
 */
export function roomBottlenecks(
  rooms: RRoom[],
  walls: RWall[],
  doors: RDoor[],
  openings: ROpening[],
  furniture: RFurniture[],
  access: AccessGraph,
  tol: number,
  verticals: RVertical[] = [],
  voids: RVoid[] = [],
  arrivals: readonly ArrivingRun[] = [],
  avoiding?: { request: ReadonlyMap<string, ReadonlySet<string>>; result: Map<string, number> },
  /** Counts the cells of the grid this builds ({@link NavStats}). Out only; append-only. */
  stats?: NavStats,
): Map<string, number> {
  const out = new Map<string, number>();
  access = walkedFrom(access, arrivals, rooms);
  const landed = access.hasEntrance ? [] : landedOn(arrivals, rooms);
  if (rooms.length === 0 || (!access.hasEntrance && landed.length === 0)) return out;
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
  const shafts = shaftsInFrame(origin, landed);
  const nav = buildNav(
    rooms,
    walls,
    doors,
    openings,
    furniture,
    verticals,
    voids,
    access,
    tol,
    DEFAULT_BODY_RADIUS_MM,
    shafts,
    undefined,
    stats,
  );
  if (nav.kind !== "ok") return out;
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
  const pred = avoiding ? new Int32Array(nav.g.nx * nav.g.ny).fill(-1) : undefined;
  const widest = widestBottleneck(nav.g, nav.sources, nav.sourceClear, undefined, pred);
  const roomWidest = perRoomMax(nav.roomCells, widest);
  const indexOf = new Map<string, number>();
  rooms.forEach((r, ri) => {
    if (!doorReachable.has(r.id)) return;
    out.set(r.id, Math.round(roomWidest[ri]!));
    indexOf.set(r.id, ri);
  });
  if (!avoiding || !pred) return out;
  const g = nav.g;
  const touches = (k: number, ex: ReadonlySet<string>): boolean =>
    (g.openedBy?.get(k) ?? []).some((id) => ex.has(id)) ||
    nav.sources.some((src, i) => src === k && ex.has(nav.sourceIds[i]!));
  const searched = new Map<string, Float64Array>();
  for (const [roomId, ex] of avoiding.request) {
    const ri = indexOf.get(roomId);
    if (ri === undefined) continue;
    const cells = nav.roomCells[ri]!;
    // 1. The walk the reading took, back from the room's best cell: if it avoids them, it stands.
    let at = -1;
    for (const k of cells) if (at < 0 || widest[k]! > widest[at]!) at = k;
    let clean = at >= 0;
    for (let k = at; clean && k >= 0; k = pred[k]!) if (touches(k, ex)) clean = false;
    if (clean) {
      avoiding.result.set(roomId, out.get(roomId)!);
      continue;
    }
    // 2. Otherwise a search on this grid with those doorways and entrances left out.
    const key = [...ex].sort().join("\u0000");
    let w = searched.get(key);
    if (!w) {
      const free = g.free.slice();
      for (const [k, ids] of g.openedBy ?? []) if (ids.some((id) => ex.has(id))) free[k] = 0;
      const srcs: number[] = [];
      const seeds: number[] = [];
      nav.sources.forEach((src, i) => {
        if (ex.has(nav.sourceIds[i]!)) free[src] = 0;
      });
      nav.sources.forEach((src, i) => {
        if (free[src]) {
          srcs.push(src);
          seeds.push(nav.sourceClear[i]!);
        }
      });
      w = widestBottleneck({ ...g, free }, srcs, seeds);
      searched.set(key, w);
    }
    let best = Number.NEGATIVE_INFINITY;
    for (const k of cells) best = Math.max(best, w[k]!);
    avoiding.result.set(roomId, Math.round(Math.max(0, best)));
  }
  return out;
}

/**
 * Whole-plan circulation facts. Deterministic; returns null when the plan has no
 * modeled exterior entrance AND no shaft arrives on it (there is nothing to measure a walk
 * from — mirrors how the access graph reports `hasEntrance: false`).
 *
 * A storey with no front door that a shaft reaches (`arrivals`) is walked from where the
 * shafts land: each arriving run is an entrance (its id is `entranceId`), seeded at the
 * landing in front of the edge a person steps off at (the head of the flight from the
 * arriving side; its own entry edge(s) only when it is arrived by from both sides or from a
 * different kind of run) at the run's width, and the rooms the doors reach
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
  /** The vertical runs this storey is REACHED by, each with the edge a person steps off
   *  across (`arrivalRuns` in `vertical.ts`: the head of the flight they came by). Given only
   *  for a storey with no door from the ground: each run is then an entrance, walked from the
   *  landing in front of that edge, and the model is measured from there instead of being
   *  null, or instead of from the storey's balcony doors ({@link walkedFrom}, PS0.3).
   *  Append-only: omitting it (or a storey with a front door) changes nothing. */
  arrivals: readonly ArrivingRun[] = [],
  /**
   * Shared by two models of ONE storey that differ only in which entrances seed the walk
   * (`src/lint/rules/circulation-facts.ts`: the main entrance's walk and the nearest-entrance
   * one, PS0.10): the nav grid depends on the rooms, walls, connectors between rooms, furniture,
   * runs, voids and body radius, never on the entrances, so the second model reuses the first
   * one's grid. `routes: false`: the caller reads no key route from this model (the second of
   * the two reads its rooms only), so the routes are not walked and `routes` is empty.
   * Append-only: omitting it builds the grid and walks the routes as before. `stats` counts the
   * cells of every grid the model builds ({@link NavStats}); an out-parameter only.
   */
  share: { navCache?: NavCache; routes?: boolean; stats?: NavStats } = {},
): CirculationModel | null {
  const navCache = share.navCache;
  const stats = share.stats;
  const walkRoutes = share.routes !== false;
  access = walkedFrom(access, arrivals, rooms);
  // The room each arriving run lands in, read off the plan as given — the same
  // `roomOfVertical` that names `verticalReach`'s arrival rooms. A run standing in no room
  // lands nowhere a walk could start.
  const landed = access.hasEntrance ? [] : landedOn(arrivals, rooms);
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
  const shafts = shaftsInFrame(origin, landed);
  const nav = buildNav(
    rooms,
    walls,
    doors,
    openings,
    furniture,
    verticals,
    voids,
    access,
    tol,
    bodyRadiusMm,
    shafts,
    navCache,
    stats,
  );
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
    const control = buildNav(
      rooms,
      walls,
      doors,
      openings,
      [],
      verticals,
      voids,
      access,
      tol,
      bodyRadiusMm,
      shafts,
      undefined,
      stats,
    );
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
      const nv = buildNav(
        rooms,
        walls,
        doors,
        openings,
        furniture,
        verticals,
        voids,
        access,
        tol,
        r,
        shafts,
        undefined,
        stats,
      );
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
  const roomWidest = perRoomMax(roomCells, widest); // widest route *into* each room's floor
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
    // Seed from every FLOOR cell of room A (`roomCells`) with no cap: you start inside room
    // A, so its own furniture-crowding must not limit the route — only the doors/corridors
    // between A and B should — and arrive on B's floor. A doorway's opened wall cells can lie
    // in A's rectangle, and the widest search never reads a source's own clearance: seeded at
    // +Infinity they stepped the route past every cell its door stamped (14000 through a
    // 740 mm door, or 740, by which room was written first). Not seeded, they are the way out,
    // and the door caps the route.
    const wide = perRoomMax(roomCells, widestBottleneck(g, roomCells[fromIdx]!, Number.POSITIVE_INFINITY));
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
  for (let i = 0; i < rooms.length && walkRoutes; i++) {
    if (isKitchen(rooms[i]!)) addNearestRoute(i, livingDining);
  }
  for (let i = 0; i < rooms.length && walkRoutes; i++) {
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
