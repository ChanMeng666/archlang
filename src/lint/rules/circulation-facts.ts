/**
 * Circulation quality as advisory warnings, built on the circulation nav-grid facts
 * (ADR 0008): a walk that squeezes below a passable width (`W_PATH_TOO_NARROW`), or
 * that wanders far from a straight line (`W_CIRCUITOUS_PATH`). Facts → advisory only,
 * never a layout change (ADR 0005/0006).
 *
 * `W_PATH_TOO_NARROW`'s domain is every room the modeled doors reach — **not** the rooms
 * the model happened to produce a measurement for. The distinction matters: a
 * sealed room has no `circulation.rooms[]` entry, so a rule that iterated that array would
 * go quiet exactly when the plan got worse — deepening one cabinet would take a plan from
 * "squeezes to 300 mm" to CLEAN. A
 * blocked route is the limit case of a narrow one — 0 mm of clear width — so it is the
 * same code, and `circulation.blocked` is what carries it — with the width of the best
 * way in MEASURED rather than printed as a zero, because a fabricated 0 mm is the same
 * defect 5.8 was filed over, one digit smaller.
 *
 * The models are built at most once per `lint()` run and
 * memoised on the (per-run) LintContext identity.
 *
 * `W_PATH_TOO_NARROW` judges the walk from the storey's MAIN entrance when it names one
 * (plan-soundness PS0.10, `src/analyze/entrance.ts`): its model, the door attribution and its
 * re-measures all read `LintContext.walkAccess()`, the access graph with only the ways in the
 * walk keeps, so a patio or balcony door no longer hides a route blocked from the front door.
 * `W_CIRCUITOUS_PATH` keeps the nearest-entrance model `describe().circulation` reports (backlog
 * C.3); the two are one model whenever the storey keeps every way in.
 */

import {
  type CirculationModel,
  computeCirculation,
  type NavCache,
  roomBottlenecks,
} from "../../analyze/circulation.js";
import { type AccessEdge, type AccessGraph, buildDoorAccessGraph, EXTERIOR_NODE, roomBox } from "../../analyze.js";
import { entranceInputs, entranceWays, walkAccessGraph } from "../../analyze/entrance.js";
import type { Diagnostic } from "../../diagnostics.js";
import { openingName } from "../element-phrases.js";
import type { LintContext, LintRule } from "../context.js";
import { openingClauseById } from "../../wall-ref.js";
import { mm, shortfall } from "../measure.js";
import { passableDoorWidthMm } from "./doors.js";

const modelCache = new WeakMap<LintContext, CirculationModel | null>();
const nearestCache = new WeakMap<LintContext, CirculationModel | null>();
/** The one nav grid both models of a storey share: they differ only in their seeds. */
const gridCache = new WeakMap<LintContext, NavCache>();

/**
 * Which access graph a judgement reads (PS0.10): the WALK view — the ways in the main entrance
 * keeps (`LintContext.walkAccess()`), judged from the front door — or the FULL view, every way
 * in, each room from its nearest. The full view is what a room that has its own door from
 * outside is judged by (that door is a way into it), and what `W_CIRCUITOUS_PATH` reads.
 */
interface View {
  from: "walk" | "nearest";
  access: AccessGraph;
  ways: ReadonlySet<string> | null;
}

const walkView = (ctx: LintContext): View => ({ from: "walk", access: ctx.walkAccess(), ways: ctx.walkWays() });
const fullView = (ctx: LintContext): View => ({ from: "nearest", access: ctx.access(), ways: null });

/**
 * {@link circulationOf} for a rule, declaring to the coverage report (PS2.13) a storey whose
 * walk is not measured because it has rooms and no way in. A plan with no room has nothing to
 * walk, which is not a skip.
 */
function measuredCirculationOf(ctx: LintContext, from: "walk" | "nearest" = "walk"): CirculationModel | null {
  const circ = circulationOf(ctx, from);
  if (!circ && ctx.rooms.length > 0 && !ctx.access().hasEntrance) ctx.skip("no-entrance");
  // TODO(coverage): the model is also null for a degenerate extent (zero-width or non-finite
  // room bounds, `navExtent` in `src/analyze/circulation.ts`) and when `buildGrid` returns null
  // (`buildNav`'s "none"). Neither is reached by a real plan; when one is, declare it here with
  // its own reason rather than leave it silent.
  return circ;
}

function shared(ctx: LintContext): NavCache {
  let c = gridCache.get(ctx);
  if (!c) {
    c = {};
    gridCache.set(ctx, c);
  }
  return c;
}

/**
 * The circulation model a view reads: `"walk"` judged from the ways in the walk keeps (the
 * main entrance's, PS0.10), which `W_PATH_TOO_NARROW` reads for every room without a door of its
 * own from outside; `"nearest"` from every entrance, each room from its nearest, which
 * `W_PATH_TOO_NARROW` reads for a room that has one and `W_CIRCUITOUS_PATH` reads throughout
 * (owner decision, backlog C.3: one record, one route, the ratio taken from the nearest
 * entrance, as `describe().circulation` reports it). One model when the storey keeps every way
 * in; otherwise two, sharing one nav grid.
 */
function circulationOf(ctx: LintContext, from: "walk" | "nearest" = "walk"): CirculationModel | null {
  const access = from === "walk" ? ctx.walkAccess() : ctx.access();
  if (from === "nearest" && access === ctx.walkAccess()) return circulationOf(ctx, "walk");
  const cache = from === "walk" ? modelCache : nearestCache;
  if (cache.has(ctx)) return cache.get(ctx) ?? null;
  const model = computeCirculation(
    ctx.rooms,
    ctx.ir.walls,
    ctx.doors,
    ctx.openings,
    ctx.furniture,
    access,
    ctx.rules.tolMm,
    undefined,
    ctx.verticals,
    ctx.voids,
    // A storey with no front door is walked from the shafts that arrive on it, so these
    // rules measure it instead of going silent while reachability already treats those
    // landings as the storey's way in.
    ctx.building.arrivalShafts,
    // The nearest-entrance model, when it is a second one, is read for its rooms alone.
    { navCache: shared(ctx), routes: from === "walk" },
  );
  cache.set(ctx, model);
  return model;
}

/** The doors from outside that open onto an `outdoor balcony`: no way in from the ground. */
function balconyDoors(ctx: LintContext): ReadonlySet<string> {
  const rects = new Map(ctx.rooms.map((r) => [r.id, roomBox(r)]));
  return new Set(
    entranceWays(ctx.access(), entranceInputs(ctx.ir, rects))
      .filter((w) => w.balcony)
      .map((w) => w.doorId),
  );
}

/**
 * The rooms with a door of their own from outside that the walk does not keep as a way in:
 * each is judged by the full view (its own door is a way into it), so no message tells a room
 * with its own front-of-house or back door that no route reaches it. A door onto an `outdoor
 * balcony` is no door from outside: a room sealed behind its balcony slider reads as blocked.
 * Empty when the walk keeps every way in.
 */
function ownDoorRooms(ctx: LintContext): ReadonlyMap<string, string[]> {
  const keep = ctx.walkWays();
  const out = new Map<string, string[]>();
  if (keep === null) return out;
  const balcony = balconyDoors(ctx);
  for (const e of ctx.access().edges) {
    if (!ctx.access().entrances.includes(e.doorId) || keep.has(e.doorId) || balcony.has(e.doorId)) continue;
    const room = e.between[0] === EXTERIOR_NODE ? e.between[1] : e.between[0];
    out.set(room, [...(out.get(room) ?? []), e.doorId]);
  }
  return out;
}

/**
 * The closed remedy set for `W_PATH_TOO_NARROW`, sized against the ruleset minimum.
 *
 * None of these is a machine-applicable fix: widening a door rewrites a width the author
 * chose. When doors set the limit the hints name each one and the `width` that, applied to
 * every named door, was re-measured to clear the minimum ({@link attributeBottlenecks});
 * otherwise the bottleneck is a nav-grid CELL the model cannot attribute to one element. `arch repair` is deliberately not named; it clears wall
 * intrusions, swings, doorway landings and overlaps, not a route pinch, and pointing at a
 * tool that would report "nothing to do" is worse than silence.
 */
const narrowHints = (
  min: number,
  doors: readonly AccessEdge[] | null,
  ctx: LintContext,
  view: View,
  unreached: ReadonlySet<string>,
): string[] => [...narrowRemedies(min, doors, ctx), ...mainEntranceHint(ctx, view, unreached)];

/**
 * The line saying where the walk was measured from (PS0.10, `src/analyze/entrance.ts`): on a
 * walk-view warning, the main entrance and the doors from outside left out. Nothing when the
 * storey names no main entrance (the coverage report's `no-main-entrance` says so), on a storey
 * with one entrance or none, nor on a room judged by its own door (the full view), so those
 * read exactly as before. Ids are hints-only. What it says of each door left out is what the
 * measured walk found (`unreached`: the rooms the walk from the main entrance does not reach),
 * so it never contradicts a warning on that room.
 */
function mainEntranceHint(ctx: LintContext, view: View, unreached: ReadonlySet<string>): string[] {
  const fact = ctx.mainEntrance();
  if (fact === null) return [];
  // A refused fact is declared to the coverage report (`no-main-entrance`), not here.
  if (fact.door === null) return [];
  if (view.from !== "walk" || view.ways === null) return [];
  const keep = view.ways;
  const dropped = ctx.access().entrances.filter((id) => !keep.has(id));
  if (dropped.length === 0) return [];
  const why =
    fact.basis === "street"
      ? "the hinged door on the `site` street side"
      : fact.basis === "entry-room"
        ? "the door into the entry, hall or circulation space"
        : "the only door from outside, garage and balcony doors aside";
  const roomOf = (id: string): string | undefined => {
    const e = ctx.access().edges.find((x) => x.doorId === id);
    return e ? (e.between[0] === EXTERIOR_NODE ? e.between[1] : e.between[0]) : undefined;
  };
  const onBalcony = balconyDoors(ctx);
  const bal = dropped.filter((id) => onBalcony.has(id));
  const lost = dropped.filter((id) => !onBalcony.has(id) && unreached.has(roomOf(id) ?? ""));
  const kept = dropped.filter((id) => !onBalcony.has(id) && !lost.includes(id));
  const list = (ids: readonly string[]) => ids.map((id) => `\`${id}\``).join(", ");
  const parts = [`Measured from the main entrance \`${fact.door}\` (${why}).`];
  if (kept.length > 0)
    parts.push(
      `${kept.length === 1 ? "The other door from outside" : "The other doors from outside"}, ${list(kept)}, ${kept.length === 1 ? "is a way into its own room" : "are ways into their own rooms"} only, since the main entrance reaches ${kept.length === 1 ? "that room" : "those rooms"} from inside.`,
    );
  if (lost.length > 0)
    parts.push(
      `${list(lost)} ${lost.length === 1 ? "opens into a room" : "open into rooms"} the walk from the main entrance does not reach: ${lost.length === 1 ? "its" : "their"} own way in, not the way the plan is entered.`,
    );
  if (bal.length > 0)
    parts.push(`${list(bal)} ${bal.length === 1 ? "opens" : "open"} onto a balcony, which is no way in.`);
  return [parts.join(" ")];
}

const narrowRemedies = (min: number, doors: readonly AccessEdge[] | null, ctx: LintContext): string[] =>
  doors === null
    ? [
        `Widen the tightest door/opening on the way to at least ${mm(min)} mm.`,
        `Or move the furniture pinching the route so ${mm(min)} mm of clear width survives.`,
        "Or add a second way in (another door or a leafless `opening`) so the pinch is avoidable.",
      ]
    : [
        ...doors.map(
          (e) =>
            `Widen ${openingClauseById(ctx.ir.elements, e.doorId) ? `the opening ${openingClauseById(ctx.ir.elements, e.doorId)} derives (give it a \`width\`)` : `${e.kind} "${e.doorId}"`} to \`width ${mm(clearingWidth(e, ctx))}\` (now ${mm(e.nominalWidth)})${doors.length > 1 ? "" : `, which lets the walk clear the ${mm(min)} mm minimum`}.`,
        ),
        // A set is what was measured; that it needs every member is not claimed.
        ...(doors.length > 1 ? [`With these widened together the walk clears the ${mm(min)} mm minimum.`] : []),
        "Or add a second way in (another door or a leafless `opening`) so the pinch is avoidable.",
      ];

/**
 * The narrowest width, on the plan's `grid` module, at which this connector stops being a
 * pinch: a door must also clear `W_DOOR_CLEARANCE` ({@link passableDoorWidthMm}, the same
 * number the swing rule's narrowing hint is bounded by); an opening keeps its whole width.
 * Rounded UP to the module because the resolver snaps a written width to it.
 */
function clearingWidth(e: AccessEdge, ctx: LintContext): number {
  const need = e.kind === "door" ? passableDoorWidthMm(ctx.rules) : Math.ceil(ctx.rules.minPathClearWidthMm);
  const grid = ctx.ir.grid;
  return grid > 0 ? Math.ceil(need / grid) * grid : need;
}

/**
 * The door PATH a room's walk is attributed to (entrance first), or `null`. Never quoted on its
 * own: {@link attributeBottlenecks} takes candidate sets from it and verifies them first.
 *
 * Built on the DOOR graph: rooms joined by their connectors, each weighted by its clear width,
 * walked from exactly the sources the circulation model walks from (the exterior through the
 * front doors; ONLY on a storey with no front door, the rooms its shafts arrive in, at their
 * own measured width: `computeCirculation`'s `viaShaft`). A widest-path search gives each
 * room a door-only capacity and one path to it; ties keep the first label settled, so the path
 * is deterministic but not guaranteed to have the fewest doors (ranking by width then door
 * count is not isotone, `src/algebra/semiring.ts`). The path is returned only when:
 *   - the room's reading equals its door capacity (otherwise furniture inside it sets it), and
 *   - every room the path passes through either reads its own door capacity or reads wider
 *     than this room (otherwise furniture in a room on the way could be the pinch).
 */
function bottleneckDoors(
  ctx: LintContext,
  widthOf: ReadonlyMap<string, number>,
  edges: readonly AccessEdge[],
): (roomId: string) => AccessEdge[] | null {
  const order = new Map<string, number>([
    [EXTERIOR_NODE, -1],
    ...ctx.rooms.map((r, i) => [r.id, i] as [string, number]),
  ]);
  const cap = new Map<string, number>();
  const hops = new Map<string, number>();
  const via = new Map<string, AccessEdge>();
  const prev = new Map<string, string>();
  if (edges.some((e) => e.between.includes(EXTERIOR_NODE))) {
    cap.set(EXTERIOR_NODE, Number.POSITIVE_INFINITY);
    hops.set(EXTERIOR_NODE, 0);
  }
  // Arrival rooms are a source only where the circulation model makes them one.
  for (const id of ctx.access().hasEntrance ? [] : ctx.building.arrivalRooms) {
    const w = widthOf.get(id);
    if (w !== undefined && !cap.has(id)) {
      cap.set(id, w);
      hops.set(id, 0);
    }
  }
  const done = new Set<string>();
  for (;;) {
    let u: string | null = null;
    for (const [n, c] of cap) {
      if (done.has(n)) continue;
      if (
        u === null ||
        c > cap.get(u)! ||
        (c === cap.get(u)! &&
          (hops.get(n)! < hops.get(u)! || (hops.get(n) === hops.get(u) && (order.get(n) ?? 0) < (order.get(u) ?? 0))))
      )
        u = n;
    }
    if (u === null) break;
    done.add(u);
    for (const e of edges) {
      if (!e.between.includes(u)) continue;
      const v: string = e.between[0] === u ? e.between[1] : e.between[0];
      if (v === u || done.has(v) || v === EXTERIOR_NODE) continue;
      const nc = Math.min(cap.get(u)!, e.estimatedClearWidth);
      const nh = hops.get(u)! + 1;
      const oc = cap.get(v);
      if (oc === undefined || nc > oc || (nc === oc && nh < hops.get(v)!)) {
        cap.set(v, nc);
        hops.set(v, nh);
        via.set(v, e);
        prev.set(v, u);
      }
    }
  }
  return (roomId: string): AccessEdge[] | null => {
    const w = widthOf.get(roomId);
    const c = cap.get(roomId);
    if (w === undefined || c === undefined || Math.round(c) !== w) return null;
    const path: AccessEdge[] = [];
    for (let n = roomId; via.has(n); n = prev.get(n)!) {
      const e = via.get(n)!;
      path.push(e);
      const up = prev.get(n)!;
      if (up !== EXTERIOR_NODE) {
        const wu = widthOf.get(up);
        // A room on the way whose reading is under its door capacity has a furniture pinch;
        // it can only be THE pinch if it is no wider than the room's own reading.
        if (wu === undefined || (wu <= w && wu !== Math.round(cap.get(up)!))) return null;
      }
    }
    return path.reverse();
  };
}

/**
 * A route's pinch is PROVABLY a connector of one of its end rooms when that room's widest
 * connector is exactly the route's width: a route leaves its origin's floor and enters its
 * destination's through one of their connectors, so it passes one at least that narrow. The
 * connectors of that width are the candidates. Used only to recognise a pinch already
 * reported, never to name one.
 */
function endConnectorsAt(ctx: LintContext, roomId: string, width: number): AccessEdge[] | null {
  if (ctx.building.arrivalRooms.includes(roomId)) return null;
  const mine = ctx.access().edges.filter((e) => !e.ambiguous && e.between.includes(roomId));
  if (mine.length === 0) return null;
  if (Math.round(Math.max(...mine.map((e) => e.estimatedClearWidth))) !== width) return null;
  return mine.filter((e) => Math.round(e.estimatedClearWidth) === width);
}

/**
 * How many re-measures (room readings on a plan variant, {@link roomBottlenecks}) one `lint()`
 * run may build to verify door attributions — union and exact alike, all storeys together
 * (`BuildingContext.attributionMeasures`); a count, never a time. A room still unverified when it is spent gets the unattributed hints. Small on purpose:
 * the playground lints on every keystroke, and on a tree-shaped door graph the first union
 * settles every room by itself.
 */
export const MAX_ATTRIBUTION_MEASURES = 2;

/** One candidate set's identity: its connector ids, sorted. The ONE key this module uses. */
const setKey = (set: readonly AccessEdge[]): string =>
  set
    .map((e) => e.doorId)
    .sort()
    .join("\u0000");

/**
 * The doors to name for each warned room's pinch, VERIFIED before any is quoted: a set is
 * named only if, with every door in it widened to the width its hint quotes
 * ({@link clearingWidth}), the room's walk clears the minimum on a rebuilt circulation model.
 *
 * Candidates per room, in order: the widest door path's connectors as narrow as the reading
 * ({@link bottleneckDoors}); those plus the room's own doors of that width (two tied ways in);
 * the room's own tied doors alone; and every connector on the path under the minimum, each at
 * its own clearing width (a front door at 840 mm before a 740 mm bedroom door, under the
 * accessibility profile, needs both).
 *
 * The cost is bounded by COUNTS. Widening is monotone (a wider door can only widen a walk), so:
 *   1. the door graph first: a room whose door-only capacity with every candidate widened stays
 *      under the minimum cannot clear, and costs no grid at all (and again per tier below);
 *   2. then tier by tier — every remaining room's first candidate set, then its second, … —
 *      ONE union model per tier with every door of that tier widened ({@link roomBottlenecks},
 *      the readings alone): a room that does not clear there does not clear with its own
 *      subset either, and moves on to its next tier;
 *   3. a room that does clear there is settled by that same model when its reading AVOIDING
 *      every other widened door's doorway and entrance still clears (`roomBottlenecks`'
 *      `avoiding`: the walk it took if that already avoids them, else one more search on the
 *      same grid) — a lower bound on its reading with only its own set widened;
 *   4. otherwise the rooms left are measured again together, and at last one alone.
 * Every model in 2 and 4 counts against {@link MAX_ATTRIBUTION_MEASURES} per run, and on a
 * multi-storey plan each later storey keeps one for its own first union; past it the remaining
 * rooms get the unattributed hints. Step 3 reads the walk the grid measured, not the door
 * graph: a walk can step into another doorway's carved band to pass furniture beside it, which
 * no door-graph path shows (`test/lint-fix-texts.test.ts`, "off-path bypass").
 */
function attributeBottlenecks(
  ctx: LintContext,
  widthOf: ReadonlyMap<string, number>,
  warnedRooms: readonly string[],
  view: View,
  /** The run's measures, when the caller shares one count across two views (PS0.10). */
  measures?: { left: number; storeys: number },
): Map<string, AccessEdge[]> {
  const min = ctx.rules.minPathClearWidthMm;
  const edges = view.access.edges.filter((e) => !e.ambiguous && e.between[0] !== "" && e.between[1] !== "");
  const tree = bottleneckDoors(ctx, widthOf, edges);
  const candidates = new Map<string, AccessEdge[][]>();
  for (const roomId of warnedRooms) {
    const w = widthOf.get(roomId);
    if (w === undefined) continue;
    const path = tree(roomId);
    const atW = (path ?? []).filter((e) => Math.round(e.estimatedClearWidth) === w);
    const under = (path ?? []).filter((e) => e.estimatedClearWidth < min);
    const own = edges.filter((e) => e.between.includes(roomId) && Math.round(e.estimatedClearWidth) === w);
    const both = [...atW, ...own.filter((e) => !atW.includes(e))];
    const seen = new Set<string>();
    const sets: AccessEdge[][] = [];
    for (const set of [atW, both, own, under]) {
      const key = setKey(set);
      if (set.length === 0 || seen.has(key)) continue;
      seen.add(key);
      sets.push(set);
    }
    if (sets.length > 0) candidates.set(roomId, sets);
  }
  const named = new Map<string, AccessEdge[]>();
  if (candidates.size === 0) return named;

  const widen = (set: Iterable<AccessEdge>) => new Map([...set].map((e) => [e.doorId, clearingWidth(e, ctx)]));
  // 1. The door graph: drop rooms whose door-only capacity cannot reach the minimum.
  const all = new Set([...candidates.values()].flat(2));
  const capAll = doorCapacity(ctx, edges, widen(all));
  for (const roomId of [...candidates.keys()]) if ((capAll.get(roomId) ?? 0) < min) candidates.delete(roomId);
  if (candidates.size === 0) return named;

  // One re-measure: the readings with `wider` doors widened, and for each room of `own` the
  // reading AVOIDING every other widened door's doorway (`roomBottlenecks`' `avoiding`). That
  // second number is a lower bound on the room's reading with only its own set widened: the
  // cells it walks are free with the same clearance there (clearance comes from furniture; the
  // stamps on its own doors and on unwidened ones are the same).
  type Measured = { readings: ReadonlyMap<string, number>; own: ReadonlyMap<string, number> };
  const measure = (wider: ReadonlyMap<string, number>, own: ReadonlyMap<string, readonly AccessEdge[]>): Measured => {
    const doors = ctx.doors.map((d) => (wider.has(d.id) ? { ...d, width: wider.get(d.id)! } : d));
    const openings = ctx.openings.map((o) => (wider.has(o.id) ? { ...o, width: wider.get(o.id)! } : o));
    // Judged from the same ways in as the reading it re-measures (PS0.10).
    const access = walkAccessGraph(
      buildDoorAccessGraph(ctx.rooms, doors, ctx.rules.tolMm, undefined, openings),
      view.ways,
    );
    const request = new Map<string, Set<string>>();
    for (const [roomId, set] of own) {
      const mine = new Set(set.map((e) => e.doorId));
      request.set(roomId, new Set([...wider.keys()].filter((id) => !mine.has(id))));
    }
    const result = new Map<string, number>();
    const readings = roomBottlenecks(
      ctx.rooms,
      ctx.ir.walls,
      doors,
      openings,
      ctx.furniture,
      access,
      ctx.rules.tolMm,
      ctx.verticals,
      ctx.voids,
      ctx.building.arrivalShafts,
      { request, result },
    );
    return { readings, own: result };
  };
  const clearsIn = (m: Measured, roomId: string): boolean => (m.readings.get(roomId) ?? 0) >= min;
  const clearsAlone = (m: Measured, roomId: string): boolean => (m.own.get(roomId) ?? 0) >= min;
  // 2–4. Tier by tier (every remaining room's first candidate, then its second, …): ONE union
  // model per tier, with every door of that tier's sets widened, all within the count budget.
  // Shared by every storey of the run when there are several; this storey's own otherwise.
  const budget = measures ?? ctx.building.attributionMeasures ?? { left: MAX_ATTRIBUTION_MEASURES, storeys: 0 };
  // Each later storey keeps one measure for its own first union: only a first union may
  // spend into that reserve.
  const later = Math.max(0, budget.storeys);
  const tiers = Math.max(...[...candidates.values()].map((sets) => sets.length));
  for (let k = 0; k < tiers; k++) {
    if (budget.left - (k === 0 ? 0 : later) <= 0) break;
    const sets = new Map<string, AccessEdge[]>();
    for (const [roomId, list] of candidates) if (!named.has(roomId) && list[k]) sets.set(roomId, list[k]!);
    // The door graph again, per room for this tier: a set whose best way through it stays
    // under the minimum is dropped here (it would only widen the tier for the other rooms).
    for (const [roomId, set] of [...sets]) if (throughSet(ctx, edges, set, roomId) < min) sets.delete(roomId);
    if (sets.size === 0) continue;
    // 3. One model for the tier; 4. then for the rooms it could not prove, models for the
    // rest of them together, and at last one alone, while the budget lasts. A room whose set
    // does not clear in a model holding it does not clear with that set alone either.
    let group = [...sets.keys()];
    while (group.length > 0 && budget.left - (k === 0 && group.length === sets.size ? 0 : later) > 0) {
      budget.left--;
      const own = new Map(group.map((roomId) => [roomId, sets.get(roomId)!] as const));
      const model = measure(widen(new Set(group.flatMap((roomId) => sets.get(roomId)!))), own);
      const unproven: string[] = [];
      for (const roomId of group) {
        if (!clearsIn(model, roomId)) continue;
        if (clearsAlone(model, roomId)) named.set(roomId, sets.get(roomId)!);
        else unproven.push(roomId);
      }
      // Nothing proved and nothing dropped: measure the first room alone next.
      group = unproven.length === group.length ? unproven.slice(0, 1) : unproven;
    }
  }
  return named;
}

/** Door-only widest-path capacity of every room, with `wider` connectors at their new widths. */
function doorCapacity(
  ctx: LintContext,
  edges: readonly AccessEdge[],
  wider: ReadonlyMap<string, number>,
  from?: string,
): Map<string, number> {
  const cap = new Map<string, number>();
  if (from !== undefined) cap.set(from, Number.POSITIVE_INFINITY);
  else if (ctx.access().hasEntrance) cap.set(EXTERIOR_NODE, Number.POSITIVE_INFINITY);
  // An arrival room is a source at an unbounded width here: this is an UPPER bound.
  else for (const id of ctx.building.arrivalRooms) cap.set(id, Number.POSITIVE_INFINITY);
  const done = new Set<string>();
  for (;;) {
    let u: string | null = null;
    for (const [k, c] of cap) if (!done.has(k) && (u === null || c > cap.get(u)!)) u = k;
    if (u === null) break;
    done.add(u);
    for (const e of edges) {
      if (!e.between.includes(u)) continue;
      const v = e.between[0] === u ? e.between[1] : e.between[0];
      if (done.has(v)) continue;
      const nc = Math.min(cap.get(u)!, widenedClear(e, wider));
      if (nc > (cap.get(v) ?? Number.NEGATIVE_INFINITY)) cap.set(v, nc);
    }
  }
  return cap;
}

/** A connector's clear width with `wider` applied (the leaf allowance kept for a door). */
const widenedClear = (e: AccessEdge, wider: ReadonlyMap<string, number>): number =>
  wider.has(e.doorId) ? wider.get(e.doorId)! - (e.nominalWidth - e.estimatedClearWidth) : e.estimatedClearWidth;

/**
 * The widest door-only way to `roomId` that USES a widened door of `set` — an upper bound on
 * what widening `set` can do for the room. Every other way is unchanged by it, and the room's
 * reading already shows none of those clears, so a set whose best way through it stays under
 * the minimum cannot clear the room (the door into a bedroom whose own door is fine but whose
 * bed blocks it). For each door of the set, either way round: the widest way to its near side
 * and from its far side to the room, each found without that door.
 */
function throughSet(
  ctx: LintContext,
  edges: readonly AccessEdge[],
  set: readonly AccessEdge[],
  roomId: string,
): number {
  const wider = new Map(set.map((e) => [e.doorId, clearingWidth(e, ctx)]));
  let best = Number.NEGATIVE_INFINITY;
  for (const e of set) {
    const others = edges.filter((x) => x !== e);
    const toNear = doorCapacity(ctx, others, wider);
    for (const [near, far] of [
      [e.between[0], e.between[1]],
      [e.between[1], e.between[0]],
    ] as const) {
      const reach = toNear.get(near) ?? Number.NEGATIVE_INFINITY;
      const onward =
        far === roomId
          ? Number.POSITIVE_INFINITY
          : (doorCapacity(ctx, others, wider, far).get(roomId) ?? Number.NEGATIVE_INFINITY);
      best = Math.max(best, Math.min(reach, widenedClear(e, wider), onward));
    }
  }
  return best;
}

const hopsCache = new WeakMap<LintContext, Map<AccessGraph, ReadonlyMap<string, number>>>();

/**
 * Door hops from where this storey's walks start, per room: the exterior through the front
 * doors, or, ONLY on a storey with no front door, the rooms its shafts arrive in — the same
 * sources {@link bottleneckDoors} and the circulation model walk from. A breadth-first search
 * over the non-ambiguous connectors; a room it never reaches is absent.
 */
function hopsOf(ctx: LintContext, view: View): ReadonlyMap<string, number> {
  let byView = hopsCache.get(ctx);
  if (!byView) {
    byView = new Map();
    hopsCache.set(ctx, byView);
  }
  const memo = byView.get(view.access);
  if (memo) return memo;
  const edges = view.access.edges.filter((e) => !e.ambiguous);
  const hops = new Map<string, number>();
  let frontier = ctx.access().hasEntrance ? [EXTERIOR_NODE] : [...ctx.building.arrivalRooms];
  for (const n of frontier) hops.set(n, 0);
  for (let d = 1; frontier.length > 0; d++) {
    const next: string[] = [];
    for (const u of frontier)
      for (const e of edges) {
        if (!e.between.includes(u)) continue;
        const v = e.between[0] === u ? e.between[1] : e.between[0];
        if (v === "" || hops.has(v)) continue;
        hops.set(v, d);
        next.push(v);
      }
    frontier = next;
  }
  byView.set(view.access, hops);
  return hops;
}

/**
 * A connector named as a reader would name it: by the rooms it joins (`the door between "Hall"
 * and "Bath"`, `the door from outside into "Hall"`), never by its id. A consumer may show the
 * message to someone who never sees the source; the id an agent edits by is in the hints
 * ({@link narrowHints}). The room fewer door hops from where the walk starts comes first
 * ({@link hopsOf}; source order on a tie), so the phrase reads in the walk's direction.
 */
function connectorPhrase(e: AccessEdge, ctx: LintContext, view: View): string {
  const byId = new Map(ctx.rooms.map((r, i) => [r.id, { r, i }] as const));
  const depth = hopsOf(ctx, view);
  const name = (id: string): string => {
    const hit = byId.get(id);
    return hit ? ctx.nameOf(hit.r) : "another room";
  };
  if (e.exterior) {
    const inside = e.between[0] === EXTERIOR_NODE ? e.between[1] : e.between[0];
    return `the ${e.kind} from outside into ${name(inside)}`;
  }
  const rank = (id: string): [number, number] => [depth.get(id) ?? Number.POSITIVE_INFINITY, byId.get(id)?.i ?? 0];
  const [a, b] = e.between;
  const [ra, rb] = [rank(a), rank(b)];
  const [first, second] = ra[0] < rb[0] || (ra[0] === rb[0] && ra[1] <= rb[1]) ? [a, b] : [b, a];
  return `the ${e.kind} between ${name(first)} and ${name(second)}`;
}

/** The message clause naming the connectors a walk squeezes through, or nothing. */
function namedClause(doors: readonly AccessEdge[] | null, width: number, ctx: LintContext, view: View): string {
  if (doors === null) return "";
  const same = doors.every((e) => Math.round(e.estimatedClearWidth) === width);
  const list = doors.map(
    (e) => `${connectorPhrase(e, ctx, view)}${same ? "" : ` (${mm(Math.round(e.estimatedClearWidth))} mm clear)`}`,
  );
  if (list.length === 1) return ` — the bottleneck is ${list[0]}, ${mm(width)} mm clear`;
  // Each item already says "between X and Y", so the list takes a comma before its last "and".
  const joined = `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
  return ` — the bottlenecks are ${joined}${same ? `, each ${mm(width)} mm clear` : ""}: widen them together`;
}

export const pathTooNarrow: LintRule = {
  name: "path-too-narrow",
  family: "circulation",
  layer: "validity",
  stage: "openings",
  codes: ["W_PATH_TOO_NARROW"],
  readsFurniture: "walk",
  check(ctx: LintContext): Diagnostic[] {
    // This storey has started: it no longer needs a measure kept back for it.
    if (ctx.building.attributionMeasures) ctx.building.attributionMeasures.storeys--;
    const circ = measuredCirculationOf(ctx);
    if (!circ) return [];
    // PS0.10: with no main entrance named, the walk starts from every exterior door.
    if (ctx.mainEntrance()?.door === null) ctx.skip("no-main-entrance");
    // PS0.10: a room with a door of its own from outside that the walk does not keep is judged by
    // the full view (that door is a way into it); every other room by the walk from the main
    // entrance. One view, and one model, when the walk keeps every way in.
    const own = ownDoorRooms(ctx);
    const walk = walkView(ctx);
    const full = fullView(ctx);
    const circFull = own.size > 0 ? (circulationOf(ctx, "nearest") ?? circ) : circ;
    const viewOf = (id: string): View => (own.has(id) ? full : walk);
    const { rooms, nameOf, at } = ctx;
    const min = ctx.rules.minPathClearWidthMm;
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    const out: Diagnostic[] = [];
    // One warning per room: entrance-walk pinches first, then a key route's pinch on a
    // from-room not already flagged (dedupe deterministically — rooms, then routes).
    const warned = new Set<string>();
    // One warning per bottleneck OPENING too. A walk or route whose pinch is connectors that
    // an earlier warning already named is the same defect and is withdrawn; it still counts
    // as warned, so the set of warnings is always a subset of the one-per-room set above.
    const reported = new Set<string>();
    const already = (doors: readonly AccessEdge[] | null): boolean =>
      doors?.every((e) => reported.has(e.doorId)) ?? false;
    // Walk the rooms in SOURCE order rather than walking `circ.rooms`, so a blocked room
    // — which by construction has no `circ.rooms` entry — lands where it belongs instead
    // of nowhere. `circ.rooms` is itself in source order, so a plan with nothing blocked
    // emits exactly the diagnostics, in exactly the order, it emitted before.
    const factIn = (c: CirculationModel) => new Map(c.rooms.map((rc) => [rc.roomId, rc]));
    const blockedIn = (c: CirculationModel) => new Map((c.blocked ?? []).map((b) => [b.roomId, b.widestWayInMm]));
    const facts = { walk: factIn(circ), full: factIn(circFull) };
    const seals = { walk: blockedIn(circ), full: blockedIn(circFull) };
    const factOf = (id: string) => (own.has(id) ? facts.full : facts.walk).get(id);
    // What the measured walk from the main entrance does not reach (a seal, or no route at all).
    const unreached = new Set(rooms.filter((r) => !facts.walk.has(r.id)).map((r) => r.id));
    const blockedOf = (id: string) => (own.has(id) ? seals.full : seals.walk).get(id);
    const warnedIn = (fs: ReadonlyMap<string, { bottleneckClearWidthMm: number }>, seal: ReadonlyMap<string, number>) =>
      rooms.filter((r) => !seal.has(r.id) && (fs.get(r.id)?.bottleneckClearWidthMm ?? min) < min).map((r) => r.id);
    const widths = (c: CirculationModel) => new Map(c.rooms.map((rc) => [rc.roomId, rc.bottleneckClearWidthMm]));
    // ONE count of re-measures for both views (MAX_ATTRIBUTION_MEASURES per run). The walk from the
    // main entrance is attributed first: its pinches are what PS0.10 judges. The rooms judged by
    // their own door alone take what is left in the full view, and a room neither can afford gets
    // the unattributed hints.
    const measures = ctx.building.attributionMeasures ?? { left: MAX_ATTRIBUTION_MEASURES, storeys: 0 };
    const namedWalk = attributeBottlenecks(
      ctx,
      widths(circ),
      warnedIn(facts.walk, seals.walk).filter((id) => !own.has(id)),
      walk,
      measures,
    );
    const namedFull =
      own.size > 0
        ? attributeBottlenecks(
            ctx,
            widths(circFull),
            warnedIn(facts.full, seals.full).filter((id) => own.has(id)),
            full,
            measures,
          )
        : null;
    const named = {
      get: (id: string): AccessEdge[] | undefined => (own.has(id) ? namedFull?.get(id) : namedWalk.get(id)),
    };
    // The warning for a room judged by its own door whose walk from the main entrance fails.
    const maskedByOwnDoor = (r: (typeof rooms)[number]): Diagnostic | null => {
      // Only a SEAL from the main entrance is reported: the room is then reached only through its
      // own door. A walk from the main entrance that does reach it, narrowly, is a room with two
      // ways in, one of them wide, which is not the masking PS0.10 removes.
      const sealed = seals.walk.get(r.id);
      if (sealed === undefined) return null;
      const tail = "the room is reached only through its own door from outside";
      const message =
        sealed > 0
          ? `From the main entrance the walk to ${nameOf(r)} squeezes to ${mm(sealed)} mm and stops there (${mm(shortfall(min, sealed))} mm below the ${mm(min)} mm minimum); ${tail}.`
          : `From the main entrance the walk to ${nameOf(r)} is blocked: furniture and its clearances leave no gap at all (0 mm against the ${mm(min)} mm minimum); ${tail}.`;
      const ids = (own.get(r.id) ?? []).map((id) => `\`${id}\``).join(", ");
      return {
        severity: "warning",
        code: "W_PATH_TOO_NARROW",
        ...at(r),
        message,
        hints: [
          ...narrowRemedies(min, null, ctx),
          `Measured from the main entrance \`${ctx.mainEntrance()?.door ?? ""}\`. The room's own door from outside, ${ids}, is a way into it, but not the way the plan is entered.`,
        ],
      };
    };
    for (const r of rooms) {
      const wayIn = blockedOf(r.id);
      if (wayIn !== undefined) {
        warned.add(r.id);
        // Two different claims, and saying the stronger one when the weaker is true is
        // the whole of 5.8. A room with a real but too-narrow way in gets that width, in
        // the same measured-deficit style as every other rule; only a room with no gap
        // at all is called a seal.
        const message =
          wayIn > 0
            ? `The walk from the entrance to ${nameOf(r)} squeezes to ${mm(wayIn)} mm and stops there — no way in is wider, so no route reaches the room (${mm(shortfall(min, wayIn))} mm below the ${mm(min)} mm minimum).`
            : `The walk from the entrance to ${nameOf(r)} is blocked: furniture and its clearances leave no gap at all (0 mm against the ${mm(min)} mm minimum).`;
        out.push({
          severity: "warning",
          code: "W_PATH_TOO_NARROW",
          ...at(r),
          message,
          hints: narrowHints(min, null, ctx, viewOf(r.id), unreached),
        });
        continue;
      }
      const rc = factOf(r.id);
      if (!rc || rc.bottleneckClearWidthMm >= min) {
        // PS0.10: a room its own door from outside serves well, but the walk from the main
        // entrance does not reach (or reaches too narrowly), is the masking PS0.10 removes: say so.
        const masked = own.has(r.id) ? maskedByOwnDoor(r) : null;
        if (masked) {
          warned.add(r.id);
          out.push(masked);
        }
        continue;
      }
      warned.add(r.id);
      const doors = named.get(r.id) ?? null;
      if (already(doors)) continue;
      for (const e of doors ?? []) reported.add(e.doorId);
      out.push({
        severity: "warning",
        code: "W_PATH_TOO_NARROW",
        ...at(r),
        message: `The walk from the entrance to ${nameOf(r)} squeezes to ${mm(rc.bottleneckClearWidthMm)} mm (${mm(shortfall(min, rc.bottleneckClearWidthMm))} mm below the ${mm(min)} mm minimum)${namedClause(doors, rc.bottleneckClearWidthMm, ctx, viewOf(r.id))}.`,
        hints: narrowHints(min, doors, ctx, viewOf(r.id), unreached),
      });
    }
    for (const rt of circ.routes) {
      if (rt.bottleneckClearWidthMm >= min || warned.has(rt.fromRoomId)) continue;
      const from = roomById.get(rt.fromRoomId);
      if (!from) continue;
      const to = roomById.get(rt.toRoomId);
      warned.add(rt.fromRoomId);
      // A route through an end room's connectors that an earlier warning already named.
      const w = rt.bottleneckClearWidthMm;
      if (already(endConnectorsAt(ctx, rt.toRoomId, w)) || already(endConnectorsAt(ctx, rt.fromRoomId, w))) continue;
      out.push({
        severity: "warning",
        code: "W_PATH_TOO_NARROW",
        ...at(from),
        message: `The route from ${nameOf(from)} to ${to ? nameOf(to) : "another room"} squeezes to ${mm(w)} mm (${mm(shortfall(min, w))} mm below the ${mm(min)} mm minimum).`,
        // A route runs room to room: where the walk starts says nothing about it.
        hints: narrowRemedies(min, null, ctx),
      });
    }
    return out;
  },
};

export const circuitousPath: LintRule = {
  name: "circuitous-path",
  family: "circulation",
  layer: "validity",
  stage: "openings",
  codes: ["W_CIRCUITOUS_PATH"],
  // Reads the same nav grid as the walk: a quoted set that closes a way through a room sends
  // the walk round (measured on multi-room fuzz, `test/lint-hint-paste.test.ts`).
  readsFurniture: "walk",
  check(ctx: LintContext): Diagnostic[] {
    const circ = measuredCirculationOf(ctx, "nearest");
    if (!circ) return [];
    const { rooms, nameOf, at } = ctx;
    const max = ctx.rules.maxDetourRatio;
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    const out: Diagnostic[] = [];
    for (const rc of circ.rooms) {
      if (rc.detourRatio <= max) continue;
      const r = roomById.get(rc.roomId);
      if (!r) continue;
      // One record is one route (owner decision, backlog C.3): the ratio is the walk from
      // the room's NEAREST entrance by walk, over the straight line from that SAME entrance —
      // not the least ratio over every entrance. So the message names the door it measures
      // from; a single-entrance plan's model carries it in the header.
      const entrance = rc.entranceId ?? circ.entranceId;
      // Named by the rooms it joins (an id is for the hint); an id that is no door or opening here
      // (a stair arrival) is just "the entrance".
      const door = ctx.connectors.find((c) => c.id === entrance);
      const from = door ? `the entrance (${openingName(ctx, door)})` : "the entrance";
      out.push({
        severity: "warning",
        code: "W_CIRCUITOUS_PATH",
        ...at(r),
        message: `The walk from ${from} to ${nameOf(r)} is ${rc.detourRatio}× the straight-line distance from that entrance (over ${max}×).`,
        hints: [
          "Add a more direct connection — a door or a hall — so the room isn't reached the long way round.",
          `The entrance it is measured from is \`${entrance}\`.`,
        ],
      });
    }
    return out;
  },
};
