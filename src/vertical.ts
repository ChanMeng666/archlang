/**
 * **Vertical circulation** as facts: the one place the shared semantics of `stair`,
 * `elevator` and `escalator` live, so the three element modules, the nav grid, `lint`
 * and `describe()` can never disagree about them.
 *
 * Two questions are answered here, both **closed-form and pure** (ADR 0005 — the
 * compiler states facts, it never invents architecture):
 *
 *  1. **Which way does the run read?** A stair/escalator's flight lies along its
 *     footprint's LONG axis, and it is entered from the end of that axis with the
 *     LARGER coordinate — the bottom end of a portrait footprint, the right end of a
 *     landscape one. So the arrow's tail sits at that end and the arrow points north
 *     (or west), which is how a plan symbol is normally drawn. A lift car is entered
 *     from its south edge. This is a **fixed drafting convention, not a derivation from
 *     the surrounding doors**: it is the same answer in the renderer and in the analysis
 *     layer, on every storey, whatever else the plan contains. See
 *     {@link entryEdges} for the v1 limitation and how to work around it.
 *  2. **What does the footprint do to circulation?** It obstructs like a piece of
 *     furniture — you cannot walk over a lift shaft — EXCEPT that the body-radius halo
 *     is suppressed outside its entry edge(s), so the landing you approach the flight
 *     across stays walkable and the nav grid can still reach the threshold.
 *
 * The third question — **which storeys does a run join?** — is pure identity: the same
 * id on two `level` blocks is the same shaft ({@link verticalConnections}). Nothing is
 * inferred from geometry, so two unrelated stairs never fuse and a mis-typed id shows up
 * as `W_STAIR_UNMATCHED` instead of silently doing nothing.
 */

import type { Point, VerticalDir } from "./ast.js";
import type { RElevator, REscalator, ResolvedElement, ResolvedPlan, RRoom, RStair } from "./ir.js";
import type { BBox } from "./geometry/rect.js";
import type { RectEdge } from "./fixture-orientation.js";

/** The element kinds that model vertical circulation, in registration order. */
export const VERTICAL_KINDS = ["stair", "elevator", "escalator"] as const;
export type VerticalKind = (typeof VERTICAL_KINDS)[number];

/** Any resolved vertical-circulation element. */
export type RVertical = RStair | RElevator | REscalator;

const KIND_SET: ReadonlySet<string> = new Set<string>(VERTICAL_KINDS);

/** Is this resolved element a vertical-circulation run? */
export function isVertical(e: ResolvedElement): e is RVertical {
  return KIND_SET.has(e.kind);
}

/** The vertical-circulation elements of a resolved storey, in source order. */
export function verticalsOf(ir: ResolvedPlan): RVertical[] {
  return ir.elements.filter(isVertical);
}

/** The footprint rectangle of a vertical run. */
export function verticalRect(v: RVertical): BBox {
  return { x: v.at.x, y: v.at.y, w: v.size.w, h: v.size.h };
}

/**
 * The axis a flight runs along: `"y"` for a portrait footprint (the flight climbs up
 * and down the page), `"x"` for a landscape one. A square footprint is treated as
 * portrait, so the answer is total and stable.
 */
export function flightAxis(size: { w: number; h: number }): "x" | "y" {
  return size.w > size.h ? "x" : "y";
}

/**
 * The end of a run's long axis that a RISING flight starts from: the bottom of a portrait
 * footprint, the right of a landscape one. The fixed half of the convention — see
 * {@link tailEdge} for the half that depends on `dir`.
 */
function footEdge(size: { w: number; h: number }): RectEdge {
  return flightAxis(size) === "y" ? "bottom" : "right";
}

const OPPOSITE: Record<RectEdge, RectEdge> = { bottom: "top", top: "bottom", right: "left", left: "right" };

/**
 * The footprint edge the direction arrow's TAIL sits on — the end of the run you are
 * standing at, on this storey.
 *
 * Two rules compose. First, geometry: the flight lies along the footprint's LONG axis and
 * a RISING flight starts at that axis's larger-coordinate end (bottom / right), so an `up`
 * arrow points north or west. Second, `dir`: you meet a descending flight at its HEAD, not
 * its foot, so a `down` run is entered from the OPPOSITE end and its arrow points the other
 * way. That is what makes one shaft read correctly on both storeys — the `UP` on the floor
 * below and the `DN` on the floor above point in opposite directions, as a drawing set
 * should, with no cross-level inference beyond the shared id.
 *
 * **v1 limitation (deliberate).** The geometric half is a fixed drafting convention, not a
 * search for the nearest door. That keeps the renderer and the analysis layer in exact
 * agreement with no extra resolve-order coupling, and keeps the answer independent of
 * unrelated edits elsewhere in the storey. A flight genuinely approached from the north or
 * the west therefore draws its arrow the wrong way round; swap the footprint's authored
 * coordinates, or wait for the `entry <edge>` clause a later release can add without
 * changing this default.
 */
export function tailEdge(v: RVertical): RectEdge {
  const foot = footEdge(v.size);
  if (v.kind === "elevator") return "bottom";
  return v.dir === "down" ? OPPOSITE[foot] : foot;
}

/**
 * The footprint edge(s) a run is entered across — the arrow's tail for a stair, BOTH
 * narrow ends for an escalator (you step on at one end and off at the other), the south
 * edge for a lift car. These are the sides on which the nav grid's body-radius halo is
 * suppressed, so the landing you cross to reach the run stays walkable.
 */
export function entryEdges(v: RVertical): RectEdge[] {
  const tail = tailEdge(v);
  if (v.kind === "escalator") return [tail, OPPOSITE[tail]];
  return [tail];
}

/**
 * The direction of travel in the PLAN, as a unit vector pointing from the entry edge
 * toward the far end of the run — the way the UP/DN arrow points. +y is down, so a
 * portrait flight's arrow points north (`{x: 0, y: -1}`).
 */
export function travelVector(v: RVertical): Point {
  switch (tailEdge(v)) {
    case "bottom":
      return { x: 0, y: -1 };
    case "top":
      return { x: 0, y: 1 };
    case "right":
      return { x: -1, y: 0 };
    default:
      return { x: 1, y: 0 };
  }
}

/** The text a run's arrow carries on the storey it is drawn on. */
export function dirLabel(dir: VerticalDir): "UP" | "DN" {
  return dir === "up" ? "UP" : "DN";
}

/**
 * One obstacle the nav grid must respect: the footprint, plus the edges outside which
 * the body-radius halo is **not** applied (so the approach in front of the entry stays
 * walkable). Cells inside the rectangle are always blocked.
 */
export interface VerticalObstacle {
  rect: BBox;
  open: RectEdge[];
}

/** The nav-grid obstacles a storey's vertical runs contribute, in source order. */
export function verticalObstacles(verticals: readonly RVertical[]): VerticalObstacle[] {
  return verticals.map((v) => ({ rect: verticalRect(v), open: entryEdges(v) }));
}

/**
 * Is the point `(px, py)` outside `rect` on one of its `open` sides? Such a point keeps
 * its walkability even when it falls inside the obstacle's inflated halo — it is the
 * landing you stand on before stepping onto the run.
 */
export function outsideOpenEdge(px: number, py: number, rect: BBox, open: readonly RectEdge[]): boolean {
  for (const e of open) {
    if (e === "bottom" && py > rect.y + rect.h) return true;
    if (e === "top" && py < rect.y) return true;
    if (e === "right" && px > rect.x + rect.w) return true;
    if (e === "left" && px < rect.x) return true;
  }
  return false;
}

/** The id of the room whose rectangle contains a run's footprint centre, or null. */
export function roomOfVertical(v: RVertical, rooms: readonly RRoom[]): string | null {
  const cx = v.at.x + v.size.w / 2;
  const cy = v.at.y + v.size.h / 2;
  for (const r of rooms) {
    if (cx >= r.at.x && cx <= r.at.x + r.size.w && cy >= r.at.y && cy <= r.at.y + r.size.h) return r.id;
  }
  return null;
}

/** One storey's contribution to the building's vertical graph. */
export interface VerticalLevelInput {
  level: number;
  ir: ResolvedPlan;
}

/** Where a run lands on one storey. */
export interface VerticalStop {
  level: number;
  /** The run's own direction on that storey (`up`/`down`); absent for a lift. */
  dir?: VerticalDir;
  /** The room the footprint sits in on that storey, or `null` when it sits in none. */
  room: string | null;
}

/**
 * A shaft joining two or more storeys: one id, present on each of `levels`. `levels` is
 * ascending; `stops` carries the per-storey facts in the same order.
 */
export interface VerticalConnection {
  id: string;
  kind: VerticalKind;
  /** The storeys the run appears on, ascending. Always ≥ 2 for a connection. */
  levels: number[];
  stops: VerticalStop[];
}

/**
 * The building's vertical connections: every id that appears as a `stair`/`elevator`/
 * `escalator` on **two or more** storeys. Identity only — nothing is inferred from
 * geometry, and a run appearing on exactly one storey is not a connection (it is what
 * `W_STAIR_UNMATCHED` reports).
 *
 * Deterministic: ids are emitted in the order they are first seen, scanning storeys in
 * ascending level order and elements in source order. A run whose id appears with two
 * different kinds on two storeys keeps the FIRST kind seen and still connects — the ids
 * are what declare identity.
 */
export function verticalConnections(levels: readonly VerticalLevelInput[]): VerticalConnection[] {
  const byId = new Map<string, VerticalConnection>();
  for (const l of levels) {
    const rooms = l.ir.elements.filter((e): e is RRoom => e.kind === "room");
    for (const v of verticalsOf(l.ir)) {
      let c = byId.get(v.id);
      if (!c) {
        c = { id: v.id, kind: v.kind as VerticalKind, levels: [], stops: [] };
        byId.set(v.id, c);
      }
      if (c.levels.includes(l.level)) continue; // one stop per storey
      c.levels.push(l.level);
      c.stops.push({
        level: l.level,
        ...(v.kind === "elevator" ? {} : { dir: (v as RStair | REscalator).dir }),
        room: roomOfVertical(v, rooms),
      });
    }
  }
  return [...byId.values()].filter((c) => c.levels.length >= 2);
}

/**
 * Which storeys are reachable from the outside once vertical connections are counted,
 * and — for a storey with no exterior door of its own — the rooms a person arrives in.
 *
 * A storey is **grounded** when it has its own exterior entrance. Reachability then
 * spreads along vertical connections: a storey joined by a shaft to a reachable storey is
 * itself reachable, and the room holding that shaft's footprint becomes an arrival point.
 * This is exactly what makes an upper floor with a stair but no front door legitimate.
 * Iterated to a fixpoint over ascending levels, so the result is order-independent.
 */
export interface VerticalReach {
  /** Level numbers reachable from the exterior (directly or via a shaft). */
  reachable: Set<number>;
  /** Per level: room ids you can arrive in by coming up/down a shaft. Source order. */
  arrivalRooms: Map<number, string[]>;
}

export function verticalReach(
  levels: readonly VerticalLevelInput[],
  grounded: (level: number) => boolean,
): VerticalReach {
  const connections = verticalConnections(levels);
  const reachable = new Set<number>();
  for (const l of levels) if (grounded(l.level)) reachable.add(l.level);
  const arrivalRooms = new Map<number, string[]>();

  for (let pass = 0; pass < levels.length + 1; pass++) {
    let grew = false;
    for (const c of connections) {
      const anyReachable = c.levels.some((n) => reachable.has(n));
      if (!anyReachable) continue;
      for (const stop of c.stops) {
        if (!reachable.has(stop.level)) {
          reachable.add(stop.level);
          grew = true;
        }
        if (grounded(stop.level) || stop.room === null) continue;
        const list = arrivalRooms.get(stop.level) ?? [];
        if (!list.includes(stop.room)) {
          list.push(stop.room);
          arrivalRooms.set(stop.level, list);
        }
      }
    }
    if (!grew) break;
  }
  return { reachable, arrivalRooms };
}
