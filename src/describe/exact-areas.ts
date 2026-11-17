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
 * An exact figure (mm², unrounded) is keyed by the very object `describe()` put the printed one
 * on (a `RoomSummary`, a storey's `totals`) and by the printed key's name, in a `WeakMap`, so the
 * JSON bytes are exactly what they were. It is kept with the printed figure it refines and
 * answered only while that key still prints it: an object that did not come from `describe()`
 * (a summary parsed back from JSON, a copy) or whose figure a caller has since replaced has no
 * exact figure, and every reader then falls back to the printed one.
 *
 * Pure; imports nothing at runtime.
 */

type Keyed = Record<string, unknown>;

/** Per object, per printed key: the exact mm² and the printed figure it was recorded beside. */
const EXACT = new WeakMap<object, Record<string, [mm2: number, printed: unknown]>>();

/** Record the exact mm² behind `o[key]`, the figure it prints now. */
export function recordExactMm2(o: object, key: string, mm2: number): void {
  const m = EXACT.get(o) ?? {};
  m[key] = [mm2, (o as Keyed)[key]];
  EXACT.set(o, m);
}

/** The exact mm² behind `o[key]`, or `undefined` (see the module header). */
export function exactMm2(o: object, key: string): number | undefined {
  const e = EXACT.get(o)?.[key];
  return e && e[1] === (o as Keyed)[key] ? e[0] : undefined;
}

/** The exact figures behind every `o[key]` summed, or `undefined` when any one has none (never a
 *  sum of the two kinds). */
export function sumExactMm2(os: readonly object[], key: string): number | undefined {
  let mm2 = 0;
  for (const o of os) {
    const x = exactMm2(o, key);
    if (x === undefined) return undefined;
    mm2 += x;
  }
  return mm2;
}

/** Carry every exact figure recorded on `from` to `to`, a rebuilt copy printing the same keys. */
export function carryExact(from: object, to: object): void {
  const m = EXACT.get(from);
  if (m) EXACT.set(to, { ...m });
}
