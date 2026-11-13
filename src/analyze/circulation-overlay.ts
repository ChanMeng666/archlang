/**
 * Circulation overlay geometry: the routes and room marks `--overlay circulation` draws, moved
 * verbatim from `src/analyze/circulation.ts`. Opt-in render only.
 *
 * Invariant: `describe()` never reads it. `circulation.ts` re-exports its types only, so no
 * module that imports the facts loads this one, and `describe.ts`'s runtime import closure does
 * not contain it (`test/describe-overlay-blind.test.ts`). It charges nothing to the step meter.
 */

import type { RRoom, RDoor, ROpening, RFurniture, RVoid, RWall } from "../ir.js";
import type { Point } from "../ast.js";
import type { ArrivingRun, RVertical } from "../vertical.js";
import { accessDigraph, isBedroom, isKitchen, isWetRoom, reachFrom, type AccessGraph } from "../analyze.js";
import type { NavGrid } from "./nav-grid.js";
import {
  DEFAULT_BODY_RADIUS_MM,
  landedOn,
  shaftsInFrame,
  isLivingOrDining,
  centreOf,
  bfsNearest,
  widestBottleneck,
  toExtentFrame,
  extentOrigin,
  buildNav,
  entranceAim,
  bboxCentre,
  roomRep,
  routeBetween,
} from "./nav-grid.js";

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
  /** The runs this storey is reached by — see {@link computeCirculation}: read only when `access`
   *  has no entrance, so a storey a shaft reaches is drawn walked from its landings, as its
   *  facts are measured (M.4). Append-only: omitting it changes nothing. */
  arrivals: readonly ArrivingRun[] = [],
): CirculationOverlay | null {
  // Measured in the nav extent's own frame, exactly as the facts are; every point drawn
  // is moved back by the same origin (`o + (i + ½)·cell` is the old absolute centre).
  const landed = access.hasEntrance ? [] : landedOn(arrivals, rooms);
  if (rooms.length === 0 || (!access.hasEntrance && landed.length === 0)) return null; // buildNav's "none", before any copy
  const o = extentOrigin(rooms);
  const doorAt = access.hasEntrance ? [...doors, ...openings].find((d) => d.id === access.entrances[0])?.at : null;
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
  const shafts = shaftsInFrame(o, landed);
  const nav = buildNav(rooms, walls, doors, openings, furniture, verticals, voids, access, tol, bodyRadiusMm, shafts);
  if (nav.kind !== "ok") return null;
  // A storey walked from its shafts is anchored at the first run's arrival edge, as its facts are.
  const entranceAt = doorAt === null ? back(nav.entrancePoint) : doorAt;
  if (entranceAt === undefined) return null;
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
  // The same door-route gate as the facts: a room `access` cannot reach draws no walk. On a
  // storey walked from its shafts, the doors are walked from the rooms the runs land in.
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
