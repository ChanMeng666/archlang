/**
 * Net internal area, computed once per storey and once per room (ADR 0027's figures, unchanged),
 * and held to a total per storey read (U.22).
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
 * ## The total per storey read (U.22, PS0.15)
 *
 * One room's measurement is capped (`MAX_NET_CURVES`, `MAX_NET_PROBE_WORK`), but nothing capped
 * rooms times that: 200 rooms each just under the caps cost `describe()` minutes. So each read
 * of one storey's rooms runs inside {@link withNetAreaBudget}: one meter for that storey, charged
 * each room's counts (the split's pair tests, then the walk's probe work, `netAreaDetail`)
 * BEFORE the work they pay for. Past {@link MAX_NET_PLAN_WORK} the meter closes: that room and
 * every later one on the storey omit the figure (`plan-budget`), exactly as a room past its own
 * cap does, and no further split or walk runs for that storey's net areas (finding which bands
 * meet a room, linear in the walls, still does). Counts, never time.
 *
 * The meter is per storey, and every reader opens one per storey and asks the rooms in element
 * order first: `describe()` per storey summary (`summarize`, so the top level repeating the lowest
 * storey decides alike) and per storey's quantities (areas first, then the net perimeters), `lint()`
 * per storey (`lintStorey`), and `compile()` per storey drawn (`drawScene`). So a storey's
 * `describe()` figures, its drawn ROOM SCHEDULE and lint's net reading omit the same rooms, on a
 * storey of any building, and a figure never depends on what another storey holds.
 *
 * A memo hit charges what the miss charged (the counts are stored with the figure and replayed in
 * order), so whether an earlier call warmed the memo never changes a decision: the output is a
 * function of the input alone. Within one meter a room asked twice (`describe()`'s `rooms[]` and
 * `schedule[]`) is decided once and charged once, so the two can never disagree. A read outside
 * any meter (the public `roomSchedule`, a test) is held to no total, as before.
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
 * The most net-area work one storey read may charge, summed over every room it measures (pair
 * tests plus probe work, `netAreaDetail`). Twice one room's probe cap, so a single room that meets
 * its own caps always fits; the corpus's largest storey is pinned far inside it in
 * `test/net-area-budget.test.ts`.
 */
export const MAX_NET_PLAN_WORK = 2 * 20_000_000;

/** One figure's decision under a meter: the figure, and whether the total refused it. */
interface Decision {
  value: number | undefined;
  byBudget: boolean;
}

/** One storey read's meter: what it charged, whether it closed, and what it decided. */
interface NetAreaMeter {
  used: number;
  closed: boolean;
  /** A storey's wall key → a short id, so a decision's key stays short. */
  storeys: Map<string, number>;
  decided: Map<string, Decision>;
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
 * Run `fn` under a fresh net-area total (see the module header), restoring whatever meter was
 * active before: a read made inside another (the accessible caption inside a drawing) decides
 * exactly as it does alone. Returns `fn`'s value.
 */
export function withNetAreaBudget<T>(fn: () => T): T {
  const outer = meter;
  const m: NetAreaMeter = { used: 0, closed: false, storeys: new Map(), decided: new Map() };
  meter = m;
  try {
    return fn();
  } finally {
    meter = outer;
    useLog.push({ used: m.used, closed: m.closed });
    if (useLog.length > USE_LOG_MAX) useLog.shift();
  }
}

const USE_LOG_MAX = 256;
const useLog: Array<{ used: number; closed: boolean }> = [];

/**
 * What each meter finished since the last call charged, and whether it closed, oldest first, and
 * forget them: read by the pinned corpus maximum and the per-storey tests
 * (`test/net-area-budget.test.ts`). Never read by the core.
 *
 * @internal Not part of the package surface.
 */
export function takeNetAreaUses(): Array<{ used: number; closed: boolean }> {
  return useLog.splice(0);
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
 * once per meter under the active one (`compute` is handed its admit), or outright, held to no
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
  const had = m.decided.get(key);
  if (had) return had.value;
  let refused = false;
  const value = compute((u) => {
    if (!admitTo(m, u)) refused = true;
    return !refused;
  });
  m.decided.set(key, { value, byBudget: refused });
  return value;
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
  const had = m?.decided.get(dkey);
  if (had) return had.value;
  let net: number | undefined;
  let refused = false;
  const hit = byRoom.get(key);
  if (hit) {
    net = hit.net;
    if (m !== null) {
      for (const u of hit.charges) {
        if (!admitTo(m, u)) {
          net = undefined;
          refused = true;
          break;
        }
      }
    }
  } else {
    const charges: number[] = [];
    net = roomNetAreaMm2(r, bands, (u) => {
      charges.push(u);
      if (m !== null && !admitTo(m, u)) refused = true;
      return !refused;
    });
    // A figure the meter refused is no figure of the room's: it is not memoised.
    if (!refused) byRoom.set(key, { net, charges });
  }
  if (m !== null) m.decided.set(dkey, { value: net, byBudget: refused });
  return net;
}

/**
 * Why room `r`'s net area is omitted under the active meter, once {@link memoRoomNetAreaMm2} has
 * read it: `"budget"` when the storey's total refused it, `"cap"` when its own measurement did
 * (`MAX_NET_CURVES`, `MAX_NET_PROBE_WORK`, the consistency guard), `null` when it is measured or
 * was never read under this meter.
 */
export function netAreaOmission(r: NetAreaRoom, bands: readonly NetAreaBand[]): "budget" | "cap" | null {
  const m = meter;
  if (m === null) return null;
  const d = m.decided.get(decisionKey(m, bands, `room|${roomKey(r)}`));
  if (!d || d.value !== undefined) return null;
  return d.byBudget ? "budget" : "cap";
}

/** Drop every memoised band set (and with them their rooms' areas); `clearCache()` calls it. */
export function clearNetAreaMemo(): void {
  bandsMemo.clear();
}
