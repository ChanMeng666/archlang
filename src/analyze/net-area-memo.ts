/**
 * Net internal area, computed once per storey and once per room (ADR 0027's figures, unchanged).
 *
 * One compile reads a room's net area on up to four paths: the resolver's margin-table row count
 * (`planTableRows`, which builds the ROOM SCHEDULE), the drawn schedule (`toScene`), and
 * `describe()`'s `rooms[]` and `schedule[]`. Each used to rebuild the storey's wall bands and
 * redo the exact closed-form integral, so a `schedule rooms` plan paid for the same numbers up to
 * four times. Both are pure functions of their inputs, so they are memoised here.
 *
 * The key is the INPUT itself, never an object's identity: every field `netAreaBands` reads of a
 * wall (`thickness`, `closed`, `points`, each arc) and every field `roomNetAreaMm2` reads of a
 * room (`at`, `size`, `poly`, `circle`), serialised exactly — JSON writes a finite double in its
 * shortest round-tripping form, and `-0` is written apart from `0`. Identity would not do: a
 * multi-storey plan resolves each storey again once the shared sheet is known, with new wall and
 * room objects, so the drawing and `describe()` never see the objects the resolver's row count
 * saw. Equal inputs give the same result, so a hit returns exactly what a miss would compute.
 *
 * No step-meter or drawing-budget charge lives in the core (`draw-budget.ts` counts
 * `netAreaWorkUnits` separately), so a hit changes no budget. The band cache is bounded
 * ({@link BANDS_MAX}, oldest out first, like the compile cache); each storey's room areas hang
 * off its bands in a weak map and go with them.
 *
 * The output is byte-identical to the unmemoised figures; `clearCache()` empties it.
 */

import type { BandWall } from "../geometry/band.js";
import { type NetAreaBand, type NetAreaRoom, netAreaBands, roomNetAreaMm2 } from "./net-area.js";

/** Band sets kept: a few storeys of a few recent plans. */
const BANDS_MAX = 64;

const bandsMemo = new Map<string, NetAreaBand[]>();
const roomMemo = new WeakMap<readonly NetAreaBand[], Map<string, number | undefined>>();

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
  return bands;
}

/** {@link roomNetAreaMm2}, once per distinct room shape on one storey's bands. */
export function memoRoomNetAreaMm2(r: NetAreaRoom, bands: readonly NetAreaBand[]): number | undefined {
  let byRoom = roomMemo.get(bands);
  if (!byRoom) {
    byRoom = new Map();
    roomMemo.set(bands, byRoom);
  }
  const key = roomKey(r);
  if (byRoom.has(key)) return byRoom.get(key);
  const net = roomNetAreaMm2(r, bands);
  byRoom.set(key, net);
  return net;
}

/** Drop every memoised band set (and with them their rooms' areas); `clearCache()` calls it. */
export function clearNetAreaMemo(): void {
  bandsMemo.clear();
}
