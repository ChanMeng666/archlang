/**
 * The EXACT areas behind `describe()`'s rounded figures, held in a side table and never
 * serialised (card RM9.1).
 *
 * `describe()` prints every area to 2 dp, and every total is the sum of the rounded parts, so
 * the list and the total always agree (`docs/analysis.md`, `totals`). That is a display
 * convention. A brief's band is a limit, and it is judged on the exact floor area
 * (`src/intent.ts`): five rooms of exactly 40.000 m² list as 40.01 m², and a `max` of 40 must
 * still pass.
 *
 * The figures are keyed by the very summary objects `describe()` returns (a `RoomSummary`, a
 * storey's `totals`), in `WeakMap`s, so the JSON bytes are exactly what they were: no key is
 * added, none changes. An object that did not come from `describe()` (a summary parsed back
 * from JSON, a copy) has no entry, and every reader then falls back to the printed figure.
 *
 * Pure; imports nothing at runtime.
 */

/** `RoomSummary` → its exact floor area, mm² (`roomAreaMm2`, before any rounding). */
const ROOM_MM2 = new WeakMap<object, number>();

/** A storey's `totals` → its exact gross internal area, mm² (`grossInternalArea(…).mm2`). */
const GROSS_MM2 = new WeakMap<object, number>();

/** A top-level `totals` → the building's exact gross internal area, mm² (the storeys' sum). */
const GROSS_ALL_LEVELS_MM2 = new WeakMap<object, number>();

/** Record `room`'s exact floor area in mm². */
export function recordRoomAreaMm2(room: object, mm2: number): void {
  ROOM_MM2.set(room, mm2);
}

/** The exact floor area of a room `describe()` produced, mm², or `undefined` for any other object. */
export function exactRoomAreaMm2(room: object): number | undefined {
  return ROOM_MM2.get(room);
}

/** Record a storey's exact gross internal area (mm²) on its `totals` object. */
export function recordGrossAreaMm2(totals: object, mm2: number): void {
  GROSS_MM2.set(totals, mm2);
}

/** A storey's exact gross internal area, mm², or `undefined` when none was recorded on `totals`. */
export function exactGrossAreaMm2(totals: object): number | undefined {
  return GROSS_MM2.get(totals);
}

/** Record the building's exact gross internal area (mm²) on the top-level `totals` object. */
export function recordGrossAllLevelsMm2(totals: object, mm2: number): void {
  GROSS_ALL_LEVELS_MM2.set(totals, mm2);
}

/** The building's exact gross internal area, mm², or `undefined` when none was recorded on `totals`. */
export function exactGrossAllLevelsMm2(totals: object): number | undefined {
  return GROSS_ALL_LEVELS_MM2.get(totals);
}
