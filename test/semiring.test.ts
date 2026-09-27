import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BOOLEAN, lexicographic, MAX_MIN, MIN_PLUS, type OrderedSemiring } from "../src/algebra/semiring.js";

/**
 * The semiring laws `bestPaths` relies on, checked by property over each semiring
 * `src/algebra/semiring.ts` exports.
 *
 * A label-setting search is only correct on a SELECTIVE, ISOTONE, MONOTONE semiring
 * (Mohri 2002; Sobrinho 2002). Selectivity makes a node's value one path's value;
 * isotonicity makes a best path out of best prefixes; monotonicity makes a settled value
 * final. The last block pins the textbook case that fails: shortest-widest.
 *
 * `MIN_PLUS` is generated over small integers. Floating-point `+` is not associative, and
 * every caller in this repository uses unit weights, so integers are the domain that
 * matters.
 */

const eq = <T>(s: OrderedSemiring<T>, a: T, b: T): boolean => s.compare(a, b) === 0;
/** `a` is at least as good as `b`. */
const le = <T>(s: OrderedSemiring<T>, a: T, b: T): boolean => s.compare(a, b) <= 0;

const minPlusValue = fc.oneof(
  { weight: 9, arbitrary: fc.integer({ min: 0, max: 1000 }) },
  { weight: 1, arbitrary: fc.constant(Number.POSITIVE_INFINITY) },
);
const maxMinValue = fc.oneof(
  { weight: 8, arbitrary: fc.integer({ min: -1000, max: 1000 }) },
  { weight: 1, arbitrary: fc.constant(Number.NEGATIVE_INFINITY) },
  { weight: 1, arbitrary: fc.constant(Number.POSITIVE_INFINITY) },
);
/** A pair is either a real path (first component not `zero`) or exactly `zero`. */
const pairOf = <A, B>(s: OrderedSemiring<A>, t: OrderedSemiring<B>, a: fc.Arbitrary<A>, b: fc.Arbitrary<B>) =>
  fc.tuple(a, b).map(([x, y]): readonly [A, B] => (s.compare(x, s.zero) === 0 ? [s.zero, t.zero] : [x, y]));

const WIDEST_SHORTEST = lexicographic(MIN_PLUS, MAX_MIN);
const SHORTEST_WIDEST = lexicographic(MAX_MIN, MIN_PLUS);

// Non-negative distances: MIN_PLUS is monotone only there, which is the domain the
// engine's precondition names.
const CASES: Array<{ name: string; s: OrderedSemiring<any>; v: fc.Arbitrary<any> }> = [
  { name: "BOOLEAN", s: BOOLEAN, v: fc.boolean() },
  { name: "MIN_PLUS", s: MIN_PLUS, v: minPlusValue },
  { name: "MAX_MIN", s: MAX_MIN, v: maxMinValue },
  {
    name: "lexicographic(MIN_PLUS, MAX_MIN)",
    s: WIDEST_SHORTEST,
    v: pairOf(MIN_PLUS, MAX_MIN, minPlusValue, maxMinValue),
  },
];

const RUNS = { numRuns: 500 };

for (const { name, s, v } of CASES) {
  describe(`${name} is a selective, isotone, monotone commutative semiring`, () => {
    it("plus: associative, commutative, identity zero", () => {
      fc.assert(
        fc.property(v, v, v, (a, b, c) => {
          expect(eq(s, s.plus(s.plus(a, b), c), s.plus(a, s.plus(b, c)))).toBe(true);
          expect(eq(s, s.plus(a, b), s.plus(b, a))).toBe(true);
          expect(eq(s, s.plus(a, s.zero), a)).toBe(true);
        }),
        RUNS,
      );
    });

    it("times: associative, commutative, identity one, annihilated by zero", () => {
      fc.assert(
        fc.property(v, v, v, (a, b, c) => {
          expect(eq(s, s.times(s.times(a, b), c), s.times(a, s.times(b, c)))).toBe(true);
          expect(eq(s, s.times(a, b), s.times(b, a))).toBe(true);
          expect(eq(s, s.times(a, s.one), a)).toBe(true);
          expect(eq(s, s.times(a, s.zero), s.zero)).toBe(true);
        }),
        RUNS,
      );
    });

    it("times distributes over plus", () => {
      fc.assert(
        fc.property(v, v, v, (a, b, c) => {
          expect(eq(s, s.times(a, s.plus(b, c)), s.plus(s.times(a, b), s.times(a, c)))).toBe(true);
        }),
        RUNS,
      );
    });

    it("selective: plus returns the better argument under compare", () => {
      fc.assert(
        fc.property(v, v, (a, b) => {
          const p = s.plus(a, b);
          expect(p === a || p === b).toBe(true);
          expect(eq(s, p, le(s, a, b) ? a : b)).toBe(true);
          // compare is a total order: antisymmetric in sign.
          expect(Math.sign(s.compare(a, b))).toBe(-Math.sign(s.compare(b, a)) || 0);
        }),
        RUNS,
      );
    });

    it("isotone: a ≤ b ⇒ c·a ≤ c·b", () => {
      fc.assert(
        fc.property(v, v, v, (a, b, c) => {
          fc.pre(le(s, a, b));
          expect(le(s, s.times(c, a), s.times(c, b))).toBe(true);
        }),
        RUNS,
      );
    });

    it("monotone: extending a path never improves it (a ≤ a·c)", () => {
      fc.assert(
        fc.property(v, v, (a, c) => {
          expect(le(s, a, s.times(a, c))).toBe(true);
        }),
        RUNS,
      );
    });
  });
}

describe("shortest-widest is NOT isotone, so bestPaths must not be used for it", () => {
  /**
   * `lexicographic(MAX_MIN, MIN_PLUS)`: widest first, then shortest. Path `a` (width 10,
   * length 5) beats path `b` (width 5, length 1). Prefix both with an edge `c` of width 3:
   * both become width 3, and now the SHORTER one wins. The preference flipped, so the best
   * path to a node is not built from the best path to its predecessor, and a label-setting
   * search settles the wrong prefix. It needs two phases (the widest bottleneck first, then
   * the shortest path over edges at least that wide).
   */
  const a = [10, 5] as const;
  const b = [5, 1] as const;
  const c = [3, 0] as const;

  it("the pinned counterexample: a < b but c·a > c·b", () => {
    expect(SHORTEST_WIDEST.compare(a, b)).toBeLessThan(0);
    expect(SHORTEST_WIDEST.times(c, a)).toEqual([3, 5]);
    expect(SHORTEST_WIDEST.times(c, b)).toEqual([3, 1]);
    expect(SHORTEST_WIDEST.compare(SHORTEST_WIDEST.times(c, a), SHORTEST_WIDEST.times(c, b))).toBeGreaterThan(0);
  });

  it("so distributivity fails on the same three values", () => {
    const lhs = SHORTEST_WIDEST.times(c, SHORTEST_WIDEST.plus(a, b));
    const rhs = SHORTEST_WIDEST.plus(SHORTEST_WIDEST.times(c, a), SHORTEST_WIDEST.times(c, b));
    expect(lhs).toEqual([3, 5]);
    expect(rhs).toEqual([3, 1]);
  });

  it("while widest-shortest on the same values stays isotone", () => {
    // Same numbers read as (length, width): the order is decided by length, which `+`
    // preserves strictly.
    const x = [5, 10] as const;
    const y = [1, 5] as const;
    const z = [0, 3] as const;
    const before = Math.sign(WIDEST_SHORTEST.compare(x, y));
    const after = Math.sign(WIDEST_SHORTEST.compare(WIDEST_SHORTEST.times(z, x), WIDEST_SHORTEST.times(z, y)));
    expect(after).toBe(before);
  });
});
