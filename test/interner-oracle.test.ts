/**
 * `PointInterner` against a brute-force reference of its documented contract.
 *
 * The contract (`src/geometry/band.ts`): `get(p)` returns the EARLIEST-registered point within
 * `SNAP_MM` of `p`, else registers `p` (with `-0` normalised) and returns it. "Within" is the
 * implementation's own comparison: a candidate is skipped only when `Math.hypot(dx, dy) > SNAP_MM`,
 * so for finite coordinates it is the Euclidean distance `<= SNAP_MM`. The reference below scans
 * EVERY registered point, so it has no cells to get wrong; the interner's key cells are a speed-up
 * and must be invisible: the same point sequence returns the same object-identity sequence,
 * including at cell boundaries, for `-0`, for magnitudes beyond the exact-integer range, and for
 * NaN.
 *
 * A non-finite coordinate has no distance (`Math.hypot` gives NaN, which `> SNAP_MM` reads as
 * false), so there the interner's answer is defined by its cells: such a point fuses with the
 * earliest registered point whose key cell it reaches (`SNAP_RING` cells either side on a finite
 * axis, the identical non-finite cell on the other) and whose distance is not provably over
 * `SNAP_MM`. The reference states that rule for those points only.
 *
 * Until RM8.1d the interner looked in a 3 x 3 block of cells, so two points up to `SNAP_MM` apart
 * whose coordinates rounded two cells apart never fused. That predecessor is kept below,
 * VERBATIM, only to pin what the change did: the two differ exactly where a registered point is
 * within `SNAP_MM` of the query but two key cells away on some axis, and nowhere else.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PointInterner, SNAP_MM } from "../src/geometry/band.js";
import type { Point } from "../src/ast.js";
import { runs } from "./setup/fast-check.js";

const KEY_SCALE = 1e2;
/** The interner's lookup ring: two coordinates `d` apart round to cells at most `floor(d · KEY_SCALE) + 1` apart. */
const RING = Math.floor(SNAP_MM * KEY_SCALE) + 1;
const cellOf = (v: number): number => Math.round(v * KEY_SCALE);

/** Does a lookup from cell `from` reach cell `to` on one axis, as `cx + dx` for `|dx| <= RING` does? */
function reaches(from: number, to: number): boolean {
  for (let d = -RING; d <= RING; d++) {
    const c = from + d;
    if (c === to || (Number.isNaN(c) && Number.isNaN(to))) return true;
  }
  return false;
}

/** The contract, by brute force over every registered point. */
class ReferenceInterner {
  /** Every registered point, in registration order. */
  readonly registered: Point[] = [];
  get(p: Point): Point {
    const finite = Number.isFinite(p.x) && Number.isFinite(p.y);
    for (const c of this.registered) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      const hit =
        finite && Number.isFinite(c.x) && Number.isFinite(c.y)
          ? d <= SNAP_MM
          : !(d > SNAP_MM) && reaches(cellOf(p.x), cellOf(c.x)) && reaches(cellOf(p.y), cellOf(c.y));
      // Registration order IS the scan order, so the first hit is the earliest-registered one.
      if (hit) return c;
    }
    const canon: Point = { x: p.x === 0 ? 0 : p.x, y: p.y === 0 ? 0 : p.y };
    this.registered.push(canon);
    return canon;
  }
  get size(): number {
    return this.registered.length;
  }
}

/** The 3 x 3 string-keyed interner before RM8.1d, byte for byte. */
class PredecessorInterner {
  private readonly cells = new Map<string, Array<{ p: Point; ord: number }>>();
  private next = 0;
  get(p: Point): Point {
    const cx = Math.round(p.x * KEY_SCALE);
    const cy = Math.round(p.y * KEY_SCALE);
    let best: { p: Point; ord: number } | null = null;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = this.cells.get(`${cx + dx}|${cy + dy}`);
        if (!list) continue;
        for (const c of list) {
          if (Math.hypot(c.p.x - p.x, c.p.y - p.y) > SNAP_MM) continue;
          if (!best || c.ord < best.ord) best = c;
        }
      }
    }
    if (best) return best.p;
    const canon: Point = { x: p.x === 0 ? 0 : p.x, y: p.y === 0 ? 0 : p.y };
    const key = `${cx === 0 ? 0 : cx}|${cy === 0 ? 0 : cy}`;
    const list = this.cells.get(key);
    const entry = { p: canon, ord: this.next++ };
    if (list) list.push(entry);
    else this.cells.set(key, [entry]);
    return canon;
  }
  get size(): number {
    return this.next;
  }
}

interface Interner {
  get(p: Point): Point;
  readonly size: number;
}

/** Run one sequence through both; the first index where the identity sequence diverges, or -1. */
function diverges(points: readonly Point[], b: Interner = new ReferenceInterner()): number {
  const a = new PointInterner();
  const firstA = new Map<Point, number>();
  const firstB = new Map<Point, number>();
  for (let i = 0; i < points.length; i++) {
    const pa = a.get(points[i]!);
    const pb = b.get(points[i]!);
    if (!firstA.has(pa)) firstA.set(pa, i);
    if (!firstB.has(pb)) firstB.set(pb, i);
    // Same object <=> same first-seen index, position by position.
    if (firstA.get(pa) !== firstB.get(pb)) return i;
    if (!Object.is(pa.x, pb.x) || !Object.is(pa.y, pb.y)) return i;
  }
  return a.size === b.size ? -1 : points.length;
}

/** A coordinate near a 0.01 mm cell boundary (x.xx5) or the snap radius of one. */
const nearBoundary = fc
  .tuple(
    fc.integer({ min: -40, max: 40 }),
    fc.constantFrom(0, 0.005, -0.005, 0.0049999, 0.0050001, 0.0149, 0.015, 0.0151, 0.01, 0.02),
  )
  .map(([n, f]) => n * 0.01 + f);

const coord = fc.oneof(
  { weight: 5, arbitrary: nearBoundary },
  { weight: 2, arbitrary: fc.integer({ min: -5, max: 5 }) },
  { weight: 1, arbitrary: fc.constantFrom(0, -0, 1e-9, -1e-9) },
  { weight: 1, arbitrary: fc.double({ min: -1e6, max: 1e6, noNaN: true }) },
  {
    weight: 1,
    arbitrary: fc.constantFrom(1e15, 9e15, -9e15, 1e17, 1e21, -1e300, Number.MAX_VALUE, Infinity, -Infinity),
  },
  { weight: 1, arbitrary: fc.constant(NaN) },
);
const point = fc.record({ x: coord, y: coord });
// Draw indices into a small pool so sequences revisit earlier registrations and their neighbours.
const sequence = fc
  .array(point, { minLength: 1, maxLength: 12 })
  .chain((pool) =>
    fc
      .array(fc.integer({ min: 0, max: pool.length - 1 }), { minLength: 1, maxLength: 60 })
      .map((ix) => ix.map((i) => ({ ...pool[i]! }))),
  );
const step = fc.integer({ min: -30, max: 30 }).map((n) => n * 0.0025);
const cluster = fc.array(fc.record({ x: step, y: step }), { minLength: 2, maxLength: 80 });

describe("PointInterner keeps its contract: the earliest-registered point within SNAP_MM", () => {
  it("returns the identical object sequence", () => {
    fc.assert(
      fc.property(sequence, (pts) => diverges(pts) === -1),
      { numRuns: runs(3000) },
    );
  });

  it("agrees on dense clusters straddling cell edges", () => {
    fc.assert(
      fc.property(cluster, (pts) => diverges(pts) === -1),
      { numRuns: runs(1500) },
    );
  });

  it("fuses -0 with 0 and NaN with NaN as the contract says", () => {
    expect(
      diverges([
        { x: 0, y: 0 },
        { x: -0, y: -0 },
        { x: -0.004, y: 0.004 },
      ]),
    ).toBe(-1);
    expect(
      diverges([
        { x: NaN, y: 1 },
        { x: NaN, y: 1 },
        { x: 1, y: NaN },
        { x: NaN, y: NaN },
      ]),
    ).toBe(-1);
    const i = new PointInterner();
    const z = i.get({ x: 0, y: 0 });
    expect(i.get({ x: -0, y: -0 })).toBe(z);
    const n = i.get({ x: NaN, y: NaN });
    expect(i.get({ x: NaN, y: NaN })).toBe(n);
  });

  it("fuses the pairs the 3 x 3 block missed, and picks the earliest, not the nearest (RM8.1d)", () => {
    // 0.0101 mm apart, rounding to cells 9 and 11: the old block never saw the first point.
    const i = new PointInterner();
    const a = i.get({ x: 0, y: 0.0949 });
    expect(i.get({ x: 0, y: 0.105 })).toBe(a);
    // A then B; the query is within SNAP_MM of both and returns A, the farther, registered first.
    const j = new PointInterner();
    const A = j.get({ x: 0.0049, y: 0 });
    j.get({ x: 0.0205, y: 0 });
    expect(j.size).toBe(2);
    expect(j.get({ x: 0.015, y: 0 })).toBe(A);
  });
});

describe("the RM8.1d change, against the 3 x 3 predecessor", () => {
  /**
   * Where the predecessor and the interner first part ways in a sequence, the point queried there
   * has a registered point within SNAP_MM of it (in the contract's sense) two key cells away on
   * some axis: the only pairs the wider ring adds. Before that index both made the same calls, so
   * they hold the same registrations.
   */
  function differsOnlyAtTwoCells(points: readonly Point[]): boolean {
    const i = diverges(points, new PredecessorInterner());
    if (i === -1) return true;
    if (i >= points.length) return false;
    const p = points[i]!;
    const before = new ReferenceInterner();
    for (let k = 0; k < i; k++) before.get(points[k]!);
    // "Within" as the contract reads it: not provably over SNAP_MM (a non-finite coordinate gives a
    // NaN distance, e.g. (0, NaN) and (0.02, NaN)) and in a cell the ring reaches; "two cells away":
    // exactly two on an axis where both cells are finite, which the 3 x 3 block could not reach.
    const twoApart = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) === 2;
    return before.registered.some(
      (c) =>
        !(Math.hypot(c.x - p.x, c.y - p.y) > SNAP_MM) &&
        reaches(cellOf(p.x), cellOf(c.x)) &&
        reaches(cellOf(p.y), cellOf(c.y)) &&
        (twoApart(cellOf(p.x), cellOf(c.x)) || twoApart(cellOf(p.y), cellOf(c.y))),
    );
  }

  it("differs only when two points within SNAP_MM are two key cells apart", () => {
    fc.assert(
      fc.property(sequence, (pts) => differsOnlyAtTwoCells(pts)),
      { numRuns: runs(3000) },
    );
    fc.assert(
      fc.property(cluster, (pts) => differsOnlyAtTwoCells(pts)),
      { numRuns: runs(1500) },
    );
  });

  it("the CI counterexample is one: 0.0101 mm apart, cells 9 and 11", () => {
    const pts = [
      { x: 0, y: 0.0949 },
      { x: 0, y: 0.105 },
    ];
    expect(diverges(pts, new PredecessorInterner())).toBe(1);
    expect(differsOnlyAtTwoCells(pts)).toBe(true);
    expect(diverges(pts)).toBe(-1);
  });
});
