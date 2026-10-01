/**
 * `PointInterner` against its previous implementation, kept here VERBATIM as the oracle.
 *
 * The interner was moved from a template-string cell key (`"cx|cy"`, nine lookups per point)
 * to nested integer maps. That is a constant-factor change and must be invisible: the same
 * point sequence has to return the same object-identity sequence, including at the cell
 * boundaries, for `-0`, for magnitudes beyond the exact-integer range, and for NaN.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PointInterner, SNAP_MM } from "../src/geometry/band.js";
import type { Point } from "../src/ast.js";

const KEY_SCALE = 1e2;

/** The old string-keyed interner, byte for byte. */
class OracleInterner {
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

/** Run one sequence through both; the first index where the identity sequence diverges, or -1. */
function diverges(points: readonly Point[]): number {
  const a = new PointInterner();
  const b = new OracleInterner();
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

describe("PointInterner agrees with its string-keyed predecessor", () => {
  it("returns the identical object sequence", () => {
    fc.assert(
      fc.property(sequence, (pts) => diverges(pts) === -1),
      { numRuns: 3000 },
    );
  });

  it("agrees on dense clusters straddling cell edges", () => {
    const step = fc.integer({ min: -30, max: 30 }).map((n) => n * 0.0025);
    const cluster = fc.array(fc.record({ x: step, y: step }), { minLength: 2, maxLength: 80 });
    fc.assert(
      fc.property(cluster, (pts) => diverges(pts) === -1),
      { numRuns: 1500 },
    );
  });

  it("fuses -0 with 0 and NaN with NaN exactly as before", () => {
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
});
