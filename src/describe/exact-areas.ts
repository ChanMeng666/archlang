/**
 * The EXACT areas behind `describe()`'s rounded figures, held in a side table and never
 * serialised (card RM9.1).
 *
 * `describe()` prints every area to 2 dp, and every total is the sum of the rounded parts, so
 * the list and the total always agree (`docs/analysis.md`, `totals`). That is a display
 * convention. A brief's band is a limit, and it is judged on the exact floor area
 * (`src/intent.ts`): five rooms of exactly 40.000 m² print 40.01 m², and a `max` of 40 must
 * still pass.
 *
 * Each exact figure is keyed by the very object `describe()` put the printed one on (a
 * `RoomSummary`, a storey's `totals`), in a `WeakMap`, so the JSON bytes are exactly what they
 * were: no key is added, none changes. It is kept with the printed figure it refines and
 * answered only while that object still prints it: an object that did not come from `describe()`
 * (a summary parsed back from JSON, a copy) or whose figure a caller has since replaced has no
 * exact figure, and every reader then falls back to the printed one.
 *
 * Pure; imports nothing at runtime.
 */

/** An exact area in mm², and the printed m² figure it was recorded beside. */
interface Exact {
  mm2: number;
  printed: number | undefined;
}

const ROOM = new WeakMap<object, Exact>();
const FLOOR = new WeakMap<object, Exact>();
const GROSS = new WeakMap<object, Exact>();
const GROSS_ALL_LEVELS = new WeakMap<object, Exact>();

const read = (table: WeakMap<object, Exact>, key: object, printed: number | undefined): number | undefined => {
  const e = table.get(key);
  return e !== undefined && e.printed === printed ? e.mm2 : undefined;
};

/** A room as `describe()` prints it. */
type PrintedRoom = { area_m2: number };
/** A storey's `totals` as `describe()` prints them. */
type PrintedTotals = {
  floor_area_m2: number;
  gross_internal_area_m2?: number;
  gross_internal_area_all_levels_m2?: number;
};

/** Record `room`'s exact floor area (mm²) beside its printed `area_m2`. */
export function recordRoomAreaMm2(room: PrintedRoom, mm2: number): void {
  ROOM.set(room, { mm2, printed: room.area_m2 });
}

/** The exact floor area (mm²) behind `room.area_m2`, or `undefined` (see the module header). */
export function exactRoomAreaMm2(room: PrintedRoom): number | undefined {
  return read(ROOM, room, room.area_m2);
}

/** Record a storey's exact floor area (mm², its rooms summed unrounded) beside `floor_area_m2`. */
export function recordFloorAreaMm2(totals: PrintedTotals, mm2: number): void {
  FLOOR.set(totals, { mm2, printed: totals.floor_area_m2 });
}

/** The exact floor area (mm²) behind `totals.floor_area_m2`, or `undefined`. */
export function exactFloorAreaMm2(totals: PrintedTotals): number | undefined {
  return read(FLOOR, totals, totals.floor_area_m2);
}

/** Record a storey's exact gross internal area (mm²) beside `gross_internal_area_m2`. */
export function recordGrossAreaMm2(totals: PrintedTotals, mm2: number): void {
  GROSS.set(totals, { mm2, printed: totals.gross_internal_area_m2 });
}

/** The exact gross internal area (mm²) behind `totals.gross_internal_area_m2`, or `undefined`. */
export function exactGrossAreaMm2(totals: PrintedTotals): number | undefined {
  return read(GROSS, totals, totals.gross_internal_area_m2);
}

/** Record the building's exact gross internal area (mm²) beside `gross_internal_area_all_levels_m2`. */
export function recordGrossAllLevelsMm2(totals: PrintedTotals, mm2: number): void {
  GROSS_ALL_LEVELS.set(totals, { mm2, printed: totals.gross_internal_area_all_levels_m2 });
}

/** The building's exact gross internal area (mm²) behind `gross_internal_area_all_levels_m2`, or `undefined`. */
export function exactGrossAllLevelsMm2(totals: PrintedTotals): number | undefined {
  return read(GROSS_ALL_LEVELS, totals, totals.gross_internal_area_all_levels_m2);
}
