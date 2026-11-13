/**
 * Net internal area, computed once per storey and once per room (ADR 0027's figures, unchanged),
 * and held to a per-call total (U.22).
 *
 * One compile reads a room's net area on up to three paths: the drawn schedule (`toScene`), and
 * `describe()`'s `rooms[]` and `schedule[]`. (The resolver's margin-table row count,
 * `planTableRows`, counts the ROOM SCHEDULE's rows without measuring a net area: the count never
 * depended on one.) Each used to rebuild the storey's wall bands and redo the exact closed-form
 * integral, so a `schedule rooms` plan paid for the same numbers several times. Both are pure
 * functions of their inputs, so they are memoised here.
 *
 * The key is the INPUT itself, never an object's identity: every field `netAreaBands` reads of a
 * wall (`thickness`, `closed`, `points`, each arc) and every field `roomNetAreaMm2` reads of a
 * room (`at`, `size`, `poly`, `circle`), serialised exactly — JSON writes a finite double in its
 * shortest round-tripping form, and `-0` is written apart from `0`. Identity would not do: a
 * multi-storey plan resolves each storey again once the shared sheet is known, with new wall and
 * room objects, so the drawing and `describe()` never see the objects the resolver saw. Equal
 * inputs give the same result, so a hit returns exactly what a miss would compute.
 *
 * ## The per-call total (U.22, PS0.15)
 *
 * One room's measurement is capped (`MAX_NET_CURVES`, `MAX_NET_PROBE_WORK`), but nothing capped
 * rooms times that: 200 rooms each just under the caps cost `describe()` minutes. So a call that
 * reads many rooms runs inside {@link withNetAreaBudget}: one meter for the whole call, charged
 * each room's counts (the split's pair tests, then the walk's probe work, `netAreaDetail`)
 * BEFORE the work they pay for. Past {@link MAX_NET_PLAN_WORK} the meter closes: that room and
 * every later one omit the figure (`plan-budget`), exactly as a room past its own cap does, and
 * no more net-area work runs in the call. Counts, never time.
 *
 * A memo hit charges what the miss charged (the counts are stored with the figure and replayed in
 * order), so whether an earlier call warmed the memo never changes a decision: the call's output
 * is a function of its input alone. Within one call a room asked twice (`describe()`'s `rooms[]`
 * and `schedule[]`, the top level repeating the lowest storey) is decided once and charged once,
 * so the two can never disagree. A read outside any meter (the public `roomSchedule`, a test) is
 * not held to a total, as before. `describe()`, `lint()` and the drawing stage of `compile()`
 * each open one meter, after the resolution, and each reads rooms storey by storey in element
 * order, so on a plan with no demolished wall the three omit the same rooms.
 *
 * The band cache is bounded ({@link BANDS_MAX}, oldest out first, like the compile cache); each
 * storey's room areas hang off its bands in a weak map and go with them. Below the total the
 * output is byte-identical to the unmemoised figures; `clearCache()` empties the memo.
 */

import type { BandWall } from "../geometry/band.js";
import { type NetAreaAdmit, type NetAreaBand, type NetAreaRoom, netAreaBands, roomNetAreaMm2 } from "./net-area.js";

/** Band sets kept: a few storeys of a few recent plans. */
const BANDS_MAX = 64;

/** A room's memoised figure, with the counts its measurement charged, in charge order. */
interface RoomEntry {
  net: number | undefined;
  charges: readonly number[];
}

const bandsMemo = new Map<string, NetAreaBand[]>();
const roomMemo = new WeakMap<readonly NetAreaBand[], Map<string, RoomEntry>>();
/** The wall key each memoised band set was built from, so a meter can name a storey by content. */
const bandsKeyOf = new WeakMap<readonly NetAreaBand[], string>();
/** A band set built outside {@link storeyNetAreaBands} is named by identity instead. */
const anonKeyOf = new WeakMap<readonly NetAreaBand[], string>();
let anonCount = 0;

/** Exact serialisation: finite doubles round-trip through JSON; `-0` is kept distinct. */
const exact = (v: unknown): string => JSON.stringify(v, (_k, x) => (Object.is(x, -0) ? "-0" : x));

const wallKey = (walls: readonly BandWall[]): string =>
  exact(
    walls.map((w) => [
      w.thickness,
      w.closed,
      w.points.map((p) => [p.x, p.y]),
      w.arcs?.map((a) => (a ? [a.center.x, a.center.y, a.r, a.a.x, a.a.y, a.b.x, a.b.y, a.sweep, a.start] : null)) ??
        null,
    ]),
  );

const roomKey = (r: NetAreaRoom): string =>
  exact([
    r.at.x,
    r.at.y,
    r.size.w,
    r.size.h,
    r.poly?.map((p) => [p.x, p.y]) ?? null,
    r.circle ? [r.circle.c.x, r.circle.c.y, r.circle.r] : null,
  ]);

/**
 * The most net-area work one call may charge, summed over every room it measures (pair tests
 * plus probe work, `netAreaDetail`). Twice one room's probe cap, so a single room that meets its
 * own caps always fits; the corpus's largest call is pinned far inside it in
 * `test/net-area-budget.test.ts`.
 */
export const MAX_NET_PLAN_WORK = 2 * 20_000_000;

/** One call's meter: what it charged, whether it closed, and what it decided. */
interface NetAreaMeter {
  used: number;
  closed: boolean;
  /** A storey's wall key → a short id, so a decision's key stays short. */
  storeys: Map<string, number>;
  decided: Map<string, number | undefined>;
}
let meter: NetAreaMeter | null = null;

/** Charge `units` to `m`, or close it when they would take it past {@link MAX_NET_PLAN_WORK}. */
function admitTo(m: NetAreaMeter, units: number): boolean {
  if (m.closed) return false;
  if (m.used + units > MAX_NET_PLAN_WORK) {
    m.closed = true;
    return false;
  }
  m.used += units;
  return true;
}

/**
 * Run `fn` under a fresh per-call net-area total (see the module header), restoring whatever
 * meter was active before: a call made inside another (a `describe()` inside a `finish()` step)
 * decides exactly as it does alone. Returns `fn`'s value.
 */
export function withNetAreaBudget<T>(fn: () => T): T {
  return meteredNetArea(fn).value;
}

/** {@link withNetAreaBudget}, also returning the units the call charged. */
export function meteredNetArea<T>(fn: () => T): { value: T; used: number } {
  const outer = meter;
  const m: NetAreaMeter = { used: 0, closed: false, storeys: new Map(), decided: new Map() };
  meter = m;
  try {
    return { value: fn(), used: m.used };
  } finally {
    meter = outer;
    lastUse = { used: m.used, closed: m.closed };
  }
}

let lastUse = { used: 0, closed: false };

/**
 * What the most recently finished meter charged, and whether it closed: read by the pinned corpus
 * maximum (`test/net-area-budget.test.ts`) after a `describe()` or `lint()`. Never read by the core.
 *
 * @internal Not part of the package surface.
 */
export function lastNetAreaUse(): { used: number; closed: boolean } {
  return lastUse;
}

/** The key one decision of `m` is held under: the storey's bands, by content when known, and `what`. */
function decisionKey(m: NetAreaMeter, bands: readonly NetAreaBand[], what: string): string {
  let storey = bandsKeyOf.get(bands) ?? anonKeyOf.get(bands);
  if (storey === undefined) {
    storey = `#${anonCount++}`;
    anonKeyOf.set(bands, storey);
  }
  let id = m.storeys.get(storey);
  if (id === undefined) {
    id = m.storeys.size;
    m.storeys.set(storey, id);
  }
  return `${id}|${what}`;
}

/**
 * A figure of room `r` that the memo does not hold (the takeoff's net perimeter, `tag`), computed
 * once per call under the active meter (`compute` is handed its admit), or outright, held to no
 * total, outside one.
 */
export function meteredRoomFigure(
  r: NetAreaRoom,
  bands: readonly NetAreaBand[],
  tag: string,
  compute: (admit: NetAreaAdmit | undefined) => number | undefined,
): number | undefined {
  const m = meter;
  if (m === null) return compute(undefined);
  const key = decisionKey(m, bands, `${tag}|${roomKey(r)}`);
  if (m.decided.has(key)) return m.decided.get(key);
  const v = compute((u) => admitTo(m, u));
  m.decided.set(key, v);
  return v;
}

/** {@link netAreaBands}, once per distinct set of walls. */
export function storeyNetAreaBands(walls: readonly BandWall[]): NetAreaBand[] {
  const key = wallKey(walls);
  const hit = bandsMemo.get(key);
  if (hit) return hit;
  const bands = netAreaBands(walls);
  if (bandsMemo.size >= BANDS_MAX) {
    const oldest = bandsMemo.keys().next().value;
    if (oldest !== undefined) bandsMemo.delete(oldest);
  }
  bandsMemo.set(key, bands);
  bandsKeyOf.set(bands, key);
  return bands;
}

/**
 * {@link roomNetAreaMm2}, once per distinct room shape on one storey's bands, and under the active
 * meter charged as the measurement charges (a hit replays the miss's counts, in order).
 */
export function memoRoomNetAreaMm2(r: NetAreaRoom, bands: readonly NetAreaBand[]): number | undefined {
  let byRoom = roomMemo.get(bands);
  if (!byRoom) {
    byRoom = new Map();
    roomMemo.set(bands, byRoom);
  }
  const key = roomKey(r);
  const m = meter;
  const dkey = m === null ? "" : decisionKey(m, bands, `room|${key}`);
  if (m?.decided.has(dkey)) return m.decided.get(dkey);
  let net: number | undefined;
  const hit = byRoom.get(key);
  if (hit) {
    net = hit.net;
    if (m !== null) {
      for (const u of hit.charges) {
        if (!admitTo(m, u)) {
          net = undefined;
          break;
        }
      }
    }
  } else {
    const charges: number[] = [];
    let refused = false;
    net = roomNetAreaMm2(r, bands, (u) => {
      charges.push(u);
      if (m !== null && !admitTo(m, u)) refused = true;
      return !refused;
    });
    // A figure the meter refused is no figure of the room's: it is not memoised.
    if (!refused) byRoom.set(key, { net, charges });
  }
  if (m !== null) m.decided.set(dkey, net);
  return net;
}

/** Drop every memoised band set (and with them their rooms' areas); `clearCache()` calls it. */
export function clearNetAreaMemo(): void {
  bandsMemo.clear();
}
