/**
 * Semirings for path problems.
 *
 * A path problem is two operations on path values: `times` extends a path by an edge,
 * `plus` chooses between two paths. Reachability, hop distance and clear-width bottleneck
 * are the same search over three different pairs:
 *
 * | semiring   | carrier            | plus | times | zero      | one       |
 * |------------|--------------------|------|-------|-----------|-----------|
 * | `BOOLEAN`  | reached?           | or   | and   | false     | true      |
 * | `MIN_PLUS` | distance           | min  | +     | +Infinity | 0         |
 * | `MAX_MIN`  | bottleneck width   | max  | min   | -Infinity | +Infinity |
 *
 * `zero` is "no path" (the annihilator of `times`, the identity of `plus`); `one` is the
 * empty path. All three are SELECTIVE: `plus` returns one of its arguments, the better one
 * under `compare`. That is what lets {@link import("./paths.js").bestPaths} settle nodes one
 * at a time instead of summing over every path.
 *
 * `MIN_PLUS` is exact only on integers below 2^53. Floating-point addition is not
 * associative, so the laws in `test/semiring.test.ts` are stated over integer weights, and
 * every caller in this repository uses unit weights.
 *
 * A leaf module: it imports nothing.
 */

/** A commutative semiring: `plus` chooses, `times` extends. */
export interface Semiring<T> {
  /** No path: the identity of `plus` and the annihilator of `times`. */
  readonly zero: T;
  /** The empty path: the identity of `times`. */
  readonly one: T;
  plus(a: T, b: T): T;
  times(a: T, b: T): T;
}

/**
 * A semiring with a total preference order. `compare(a, b) < 0` means `a` is the better
 * path value, `0` means equal.
 *
 * The order must agree with `plus`: the semiring is SELECTIVE, so
 * `plus(a, b) === (compare(a, b) <= 0 ? a : b)`.
 */
export interface OrderedSemiring<T> extends Semiring<T> {
  compare(a: T, b: T): number;
}

const numCompare = (a: number, b: number): number => (a < b ? -1 : a > b ? 1 : 0);

/** Reachability: is there a path at all? */
export const BOOLEAN: OrderedSemiring<boolean> = {
  zero: false,
  one: true,
  plus: (a, b) => a || b,
  times: (a, b) => a && b,
  compare: (a, b) => (a === b ? 0 : a ? -1 : 1),
};

/** Shortest distance: the least total weight over all paths. */
export const MIN_PLUS: OrderedSemiring<number> = {
  zero: Number.POSITIVE_INFINITY,
  one: 0,
  plus: (a, b) => Math.min(a, b),
  times: (a, b) => a + b,
  compare: numCompare,
};

/** Widest path: the greatest bottleneck (least edge weight on the path) over all paths. */
export const MAX_MIN: OrderedSemiring<number> = {
  zero: Number.NEGATIVE_INFINITY,
  one: Number.POSITIVE_INFINITY,
  plus: (a, b) => Math.max(a, b),
  times: (a, b) => Math.min(a, b),
  compare: (a, b) => numCompare(b, a),
};

/**
 * The lexicographic product: rank by `s`, break ties by `t`. `times` works on each
 * component; `plus` picks the better pair.
 *
 * A pair whose first component is `s.zero` is not a path, so `times` returns `zero` for it.
 * That rule keeps `zero` an annihilator.
 *
 * The product is a semiring only when `s`'s `times` preserves strict order, which
 * `MIN_PLUS` does on finite values. `lexicographic(MIN_PLUS, MAX_MIN)` (shortest, then
 * widest) is therefore isotone and {@link import("./paths.js").bestPaths} solves it.
 * `lexicographic(MAX_MIN, MIN_PLUS)` (widest, then shortest) is NOT: `min` ties unequal
 * widths, so a longer path can win after an edge is appended. `test/semiring.test.ts`
 * pins a counterexample. That problem needs two passes (the widest value first, then the
 * shortest path among edges at least that wide), not this engine.
 */
export function lexicographic<A, B>(s: OrderedSemiring<A>, t: OrderedSemiring<B>): OrderedSemiring<readonly [A, B]> {
  const zero: readonly [A, B] = [s.zero, t.zero];
  const compare = (a: readonly [A, B], b: readonly [A, B]): number => s.compare(a[0], b[0]) || t.compare(a[1], b[1]);
  return {
    zero,
    one: [s.one, t.one],
    plus: (a, b) => (compare(a, b) <= 0 ? a : b),
    times: (a, b) => {
      const first = s.times(a[0], b[0]);
      return s.compare(first, s.zero) === 0 ? zero : [first, t.times(a[1], b[1])];
    },
    compare,
  };
}
