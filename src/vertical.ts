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
import { oppositeSide, SIDE_NORMAL } from "./algebra/d4.js";
import { pointInPolygon } from "./geometry/polygon.js";
import { pointInRect } from "./geometry/rect.js";

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
 * The axis a run's flight lies along, as DRAWN: read off its tail edge once a `place`
 * frame has carried one ({@link RStair._tail} — a top/bottom tail runs along `"y"`), else
 * {@link flightAxis} of its footprint. The two agree except on a SQUARE footprint, whose
 * `flightAxis` tie reads `"y"` whichever way the frame turned it.
 */
export function runAxis(v: RVertical): "x" | "y" {
  if (v._tail !== undefined) return v._tail === "left" || v._tail === "right" ? "x" : "y";
  return flightAxis(v.size);
}

/**
 * The end of a run's long axis that a RISING flight starts from: the bottom of a portrait
 * footprint, the right of a landscape one. The fixed half of the convention — see
 * {@link tailEdge} for the half that depends on `dir`.
 */
function footEdge(size: { w: number; h: number }): RectEdge {
  return flightAxis(size) === "y" ? "bottom" : "right";
}

/**
 * The footprint edge the direction arrow's TAIL sits on — the end of the run you are
 * standing at, on this storey. A run inside a `place` carries its own ({@link RStair._tail}:
 * the rule below applied in the component's LOCAL frame, then acted on by the frame), so a
 * turned or mirrored flight is entered from the image of its authored end.
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
  if (v._tail !== undefined) return v._tail;
  const foot = footEdge(v.size);
  if (v.kind === "elevator") return "bottom";
  return v.dir === "down" ? oppositeSide(foot) : foot;
}

/**
 * The footprint edge(s) a run is entered across — the arrow's tail for a stair, BOTH
 * narrow ends for an escalator (you step on at one end and off at the other), the south
 * edge for a lift car. These are the sides on which the nav grid's body-radius halo is
 * suppressed, so the landing you cross to reach the run stays walkable.
 */
export function entryEdges(v: RVertical): RectEdge[] {
  const tail = tailEdge(v);
  if (v.kind === "escalator") return [tail, oppositeSide(tail)];
  return [tail];
}

/**
 * The direction of travel in the PLAN, as a unit vector pointing from the entry edge
 * toward the far end of the run — the way the UP/DN arrow points. +y is down, so a
 * portrait flight's arrow points north (`{x: 0, y: -1}`) — the outward normal of the side
 * OPPOSITE the tail. A fresh object, so a caller may keep it.
 */
export function travelVector(v: RVertical): Point {
  const n = SIDE_NORMAL[oppositeSide(tailEdge(v))];
  return { x: n.x, y: n.y };
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

/**
 * The id of the first room whose FLOOR contains a run's footprint centre, or null. The
 * floor is the room's shape — its ring for a `polygon`/`circle` room, so a stair in the
 * notch of an L is not claimed by the L — and its rectangle otherwise, closed bounds.
 *
 * This is `pointInRoomBox(centre, roomBox(r))` from `analyze.ts`, spelled with the two leaf
 * predicates it is made of: `vertical.ts` is loaded by `elements/stair.ts` while the element
 * registry is still initialising, and importing `analyze.ts` from here would close that cycle.
 */
export function roomOfVertical(v: RVertical, rooms: readonly RRoom[]): string | null {
  const cx = v.at.x + v.size.w / 2;
  const cy = v.at.y + v.size.h / 2;
  for (const r of rooms) {
    const inside = r.poly
      ? pointInPolygon(cx, cy, r.poly)
      : pointInRect(cx, cy, { x: r.at.x, y: r.at.y, w: r.size.w, h: r.size.h });
    if (inside) return r.id;
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

/**
 * What one storey's rooms can be walked to from, for {@link verticalReach}'s room-aware
 * fixpoint: the exterior (when the storey is grounded) and the rooms that live shafts land
 * in on it. Room ids, source order of first arrival.
 */
export interface StoreySeeds {
  exterior: boolean;
  rooms: string[];
}

/**
 * The rooms of storey `level` a person can walk into from `seeds` — injected by the
 * caller (`storeyRoomReach` in `analyze.ts`, the probe access graph), because this module
 * cannot import `analyze.ts` (see {@link roomOfVertical}). Must be monotone in `seeds`
 * (more seeds never reach fewer rooms), which any graph search is; the fixpoint relies on it.
 */
export type StoreyRoomReach = (level: number, seeds: StoreySeeds) => ReadonlySet<string>;

/**
 * Which storeys are reachable, and where you arrive on them — see {@link VerticalReach}.
 *
 * Without `roomReach` a shaft joins its storeys as soon as ANY of them is reachable,
 * wherever on that storey it stands (the original storey-level fixpoint, unchanged). With
 * it, the fixpoint runs over `(storey, room)`: a shaft is live only when one of its stops is
 * ACTIVE — its storey is reachable and the room it stands in is walkable from that storey's
 * seeds (the exterior if grounded, plus the rooms live shafts land in; a grounded storey
 * relays too, so a hillside ground floor can carry a shaft on upward). A stair in a
 * door-less store therefore joins nothing. A stop whose footprint lies in no room
 * (`room === null`) keeps the storey-level answer: active once its storey is reachable.
 *
 * `arrivalRooms` keeps its historical meaning in both modes: rooms on UNGROUNDED storeys
 * only, so a grounded storey's lint sources never change.
 */
export function verticalReach(
  levels: readonly VerticalLevelInput[],
  grounded: (level: number) => boolean,
  roomReach?: StoreyRoomReach,
): VerticalReach {
  const { reachable, arrivalRooms } = reachOver(levels, verticalConnections(levels), grounded, roomReach);
  return { reachable, arrivalRooms };
}

/** {@link VerticalReach}, plus whether a stop is ACTIVE at the fixpoint — the predicate
 *  {@link arrivalRuns} asks of a neighbouring stop on a building with one storey taken out. */
interface ReachState extends VerticalReach {
  active(stop: VerticalStop): boolean;
}

/**
 * The fixpoint behind {@link verticalReach}, over a GIVEN set of connections (the shafts
 * `verticalConnections` finds, or {@link arrivalRuns}' shafts cut at a removed storey).
 * Without `roomReach` it is the original storey-level loop and a stop is active once its
 * storey is reachable; with it, the room-aware `(storey, room)` fixpoint.
 */
function reachOver(
  levels: readonly VerticalLevelInput[],
  connections: readonly VerticalConnection[],
  grounded: (level: number) => boolean,
  roomReach?: StoreyRoomReach,
): ReachState {
  if (roomReach) return roomAwareReach(levels, connections, grounded, roomReach);
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
  return { reachable, arrivalRooms, active: (stop) => reachable.has(stop.level) };
}

/**
 * The `(storey, room)` Kleene fixpoint behind {@link verticalReach} when a `roomReach` is
 * given. Same pass structure as the storey-level loop (connections in first-seen order,
 * stops ascending), so when every stop is active the two produce the same `reachable` and
 * the same `arrivalRooms`, element for element. Every set only grows — reachable storeys,
 * per-storey seed rooms, and (by `roomReach`'s monotonicity) the rooms walkable from them —
 * so the loop terminates at the least fixpoint.
 */
function roomAwareReach(
  levels: readonly VerticalLevelInput[],
  connections: readonly VerticalConnection[],
  isGrounded: (level: number) => boolean,
  roomReach: StoreyRoomReach,
): ReachState {
  // `grounded` is pure but not cheap (the callers build an access graph per call), and the
  // loop below asks it once per stop per pass — ask each storey once.
  const groundedMemo = new Map<number, boolean>();
  const grounded = (level: number): boolean => {
    let g = groundedMemo.get(level);
    if (g === undefined) {
      g = isGrounded(level);
      groundedMemo.set(level, g);
    }
    return g;
  };
  const reachable = new Set<number>();
  for (const l of levels) if (grounded(l.level)) reachable.add(l.level);
  const arrivalRooms = new Map<number, string[]>();
  // Rooms live shafts land in, on EVERY storey (grounded ones relay too).
  const seedRooms = new Map<number, string[]>();
  // `roomReach` answers, invalidated whenever a storey's seeds grow.
  const live = new Map<number, ReadonlySet<string>>();
  const liveOn = (level: number): ReadonlySet<string> => {
    let s = live.get(level);
    if (!s) {
      s = roomReach(level, { exterior: grounded(level), rooms: [...(seedRooms.get(level) ?? [])] });
      live.set(level, s);
    }
    return s;
  };
  const active = (stop: VerticalStop): boolean =>
    reachable.has(stop.level) && (stop.room === null || liveOn(stop.level).has(stop.room));

  for (;;) {
    let grew = false;
    for (const c of connections) {
      if (!c.stops.some(active)) continue;
      for (const stop of c.stops) {
        if (!reachable.has(stop.level)) {
          reachable.add(stop.level);
          grew = true;
        }
        if (stop.room === null) continue;
        const seeds = seedRooms.get(stop.level) ?? [];
        if (!seeds.includes(stop.room)) {
          seeds.push(stop.room);
          seedRooms.set(stop.level, seeds);
          live.delete(stop.level);
          grew = true;
        }
        if (grounded(stop.level)) continue;
        const list = arrivalRooms.get(stop.level) ?? [];
        if (!list.includes(stop.room)) {
          list.push(stop.room);
          arrivalRooms.set(stop.level, list);
        }
      }
    }
    if (!grew) break;
  }
  return { reachable, arrivalRooms, active };
}

/**
 * One run a person arrives by on a storey, and the edge(s) of its footprint they step off
 * across — where the circulation model starts that storey's walks.
 */
export interface ArrivingRun {
  /** The run as drawn on THIS storey. */
  run: RVertical;
  /** The footprint edge(s) a person arriving by it steps off across — see {@link arrivalRuns}. */
  edges: RectEdge[];
}

/**
 * Per UNGROUNDED, reachable storey, the runs (that storey's own elements, source order) a
 * person ARRIVES by, each with the edge they step off across: what `computeCirculation`
 * walks a storey with no front door from. `describe`, `lint` and `repair` all build theirs
 * here, so they read one answer. Pure and order-independent: a property of the building's
 * connectivity, never of declaration order or of the fixpoint's iteration.
 *
 * **Arrival sides.** For a run r standing in a room on storey L, a neighbouring stop of r's
 * shaft (the stop on the storey below L, or above it) is an arrival side when it is ACTIVE
 * in the building with L REMOVED — the same room-aware `(storey, room)` reachability
 * {@link verticalReach} computes, with every shaft cut at L so no shaft relays through it.
 * So the side is where a person can come FROM without having been on L first. A run with
 * no arrival side is not an arrival on L — nobody arrives by it: a flight leaving L for a
 * floor reachable only through L (`s1` up to L, `s2` on up from L) is boarded on L, not
 * stepped off. `arrivalRooms` is untouched by this; it keeps its own definition.
 *
 * **The arrival edge is the HEAD of the flight from that side.** Arriving from the stop
 * below, a person climbed the flight boarded at that stop's tail ({@link tailEdge}) and
 * steps off at the opposite end: `oppositeSide(tailEdge(run on the storey below))`, read on
 * L's footprint; from above, likewise. It is never L's OWN tail, where a flight continuing
 * onward is boarded (`townhouse`'s middle storey). An escalator is stepped off at that one
 * end only; a lift car at its door side, {@link entryEdges}.
 *
 * Where the end cannot be told — arrival sides both below AND above (a storey reachable
 * independently from either), or the neighbouring stop not drawn as the same kind of run —
 * the edges fall back to the run's own {@link entryEdges} on L.
 */
export function arrivalRuns(
  levels: readonly VerticalLevelInput[],
  isGrounded: (level: number) => boolean,
  roomReach?: StoreyRoomReach,
): Map<number, ArrivingRun[]> {
  const groundedMemo = new Map<number, boolean>();
  const grounded = (level: number): boolean => {
    let g = groundedMemo.get(level);
    if (g === undefined) {
      g = isGrounded(level);
      groundedMemo.set(level, g);
    }
    return g;
  };
  const connections = verticalConnections(levels);
  const byId = new Map(connections.map((c) => [c.id, c]));
  const full = reachOver(levels, connections, grounded, roomReach);
  const runOn = (level: number, id: string): RVertical | undefined =>
    levels.find((l) => l.level === level)?.ir.elements.find((e): e is RVertical => isVertical(e) && e.id === id);
  const out = new Map<number, ArrivingRun[]>();
  for (const l of levels) {
    if (grounded(l.level) || !full.reachable.has(l.level)) continue;
    let without: ReachState | undefined;
    const runs: ArrivingRun[] = [];
    const seen = new Set<string>();
    for (const run of verticalsOf(l.ir)) {
      if (seen.has(run.id)) continue; // one stop per storey, as `verticalConnections` reads it
      seen.add(run.id);
      const c = byId.get(run.id);
      const at = c ? c.levels.indexOf(l.level) : -1;
      if (!c || at < 0 || c.stops[at]!.room === null) continue;
      without ??= reachOver(
        levels.filter((x) => x.level !== l.level),
        cutAt(connections, l.level),
        grounded,
        roomReach,
      );
      const below = at > 0 && without.active(c.stops[at - 1]!);
      const above = at < c.stops.length - 1 && without.active(c.stops[at + 1]!);
      if (!below && !above) continue; // nobody arrives by it: it is boarded here
      runs.push({ run, edges: arrivalEdges(run, below, above, runOn(c.levels[below ? at - 1 : at + 1]!, run.id)) });
    }
    if (runs.length > 0) out.set(l.level, runs);
  }
  return out;
}

/** Every shaft that stops on `level`, cut there: its stops below and its stops above become
 *  two shafts (each kept only when it still joins two storeys), so none relays through
 *  `level`. A shaft with no stop on `level` is kept whole. */
function cutAt(connections: readonly VerticalConnection[], level: number): VerticalConnection[] {
  const out: VerticalConnection[] = [];
  for (const c of connections) {
    // A shaft with no stop on `level` (a lift serving 1 and 3 only) does not pass through it.
    if (!c.levels.includes(level)) {
      out.push(c);
      continue;
    }
    for (const part of [c.stops.filter((s) => s.level < level), c.stops.filter((s) => s.level > level)]) {
      if (part.length >= 2) out.push({ id: c.id, kind: c.kind, levels: part.map((s) => s.level), stops: part });
    }
  }
  return out;
}

/** {@link arrivalRuns}' edge rule for one arriving run; `src` is the run on the arriving side. */
function arrivalEdges(run: RVertical, below: boolean, above: boolean, src: RVertical | undefined): RectEdge[] {
  if (run.kind === "elevator" || below === above) return entryEdges(run);
  if (!src || src.kind !== run.kind) return entryEdges(run);
  return [oppositeSide(tailEdge(src))];
}
