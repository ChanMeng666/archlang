/**
 * One best-path engine over any selective semiring.
 *
 * {@link bestPaths} is a label-setting search (generalised Dijkstra). Each step settles
 * the unsettled node with the best value, then relaxes its out-edges. That is correct when
 * the semiring is:
 *
 *  - SELECTIVE: `plus` returns the better of its arguments, so a node's value is the
 *    value of one path, not a sum over many;
 *  - ISOTONE: `a ≤ b ⇒ c·a ≤ c·b` and `a·c ≤ b·c`, so a best path is made of best
 *    prefixes;
 *  - MONOTONE: `a ≤ a·c`, so appending an edge never improves a path, and a settled
 *    node's value is final.
 *
 * See Mohri 2002 (semiring frameworks for shortest distance) and Sobrinho 2002 (algebra
 * and algorithms for QoS path computation). `BOOLEAN`, `MIN_PLUS` on non-negative weights,
 * `MAX_MIN` and `lexicographic(MIN_PLUS, MAX_MIN)` satisfy all three. Shortest-widest,
 * `lexicographic(MAX_MIN, MIN_PLUS)`, is not isotone; do not solve it here.
 *
 * A leaf module: it imports only `./semiring.js`.
 */

import type { OrderedSemiring } from "./semiring.js";

/** A directed graph by adjacency. `out(n)`'s order is the relaxation order. */
export interface Digraph<N, W> {
  /** Every node, for consumers that enumerate. The search itself discovers nodes by `out`. */
  readonly nodes: readonly N[];
  out(n: N): readonly { readonly to: N; readonly w: W }[];
}

/** One best-path question over a {@link Digraph}. */
export interface PathQuery<N, T, W> {
  s: OrderedSemiring<T>;
  /** An edge's value in `s`. */
  weight(w: W): T;
  /** Start nodes and their initial values, seeded in this order. They are seeded as
   *  given: `admit` does not filter them. */
  sources: readonly (readonly [N, T])[];
  /** May the search enter `n` through an edge? Omitted: every node. */
  admit?(n: N): boolean;
  /** Tie-break between unsettled nodes of equal value: the lowest rank settles first. */
  rank(n: N): number;
}

/** The answer: each reached node's best value, and the node it was reached from. A
 *  source has no parent. Both maps iterate in discovery order. */
export interface BestPaths<N, T> {
  value: ReadonlyMap<N, T>;
  parent: ReadonlyMap<N, N>;
}

interface Entry<N, T> {
  n: N;
  v: T;
  r: number;
  seq: number;
}

/**
 * Best path values from `q.sources` to every node they reach.
 *
 * Settle order is total and deterministic: better value first, then lower `rank`, then
 * DISCOVERY order (sources in array order, then each relaxation in `out()` order). A label
 * changes only on a strict improvement, so the first node to offer a value keeps the
 * parent. With a constant `rank` and unit `MIN_PLUS` weights this is FIFO breadth-first
 * search, parent for parent. A value equal to `s.zero` is no path and is never recorded.
 */
export function bestPaths<N, T, W>(g: Digraph<N, W>, q: PathQuery<N, T, W>): BestPaths<N, T> {
  const { s } = q;
  const value = new Map<N, T>();
  const parent = new Map<N, N>();
  const settled = new Set<N>();
  const heap: Entry<N, T>[] = [];
  let seq = 0;

  const before = (a: Entry<N, T>, b: Entry<N, T>): boolean => {
    const c = s.compare(a.v, b.v);
    if (c !== 0) return c < 0;
    if (a.r !== b.r) return a.r < b.r;
    return a.seq < b.seq;
  };
  const push = (e: Entry<N, T>): void => {
    heap.push(e);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!before(heap[i]!, heap[p]!)) break;
      const t = heap[i]!;
      heap[i] = heap[p]!;
      heap[p] = t;
      i = p;
    }
  };
  const pop = (): Entry<N, T> => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && before(heap[l]!, heap[m]!)) m = l;
        if (r < heap.length && before(heap[r]!, heap[m]!)) m = r;
        if (m === i) break;
        const t = heap[i]!;
        heap[i] = heap[m]!;
        heap[m] = t;
        i = m;
      }
    }
    return top;
  };
  /** Record `v` at `n` when it strictly beats what `n` holds (or `zero`, if nothing). */
  const offer = (n: N, v: T, from: N | undefined): void => {
    const cur = value.get(n);
    if (s.compare(v, cur === undefined ? s.zero : cur) >= 0) return;
    value.set(n, v);
    if (from === undefined) parent.delete(n);
    else parent.set(n, from);
    push({ n, v, r: q.rank(n), seq: seq++ });
  };

  for (const [n, v] of q.sources) offer(n, v, undefined);
  while (heap.length > 0) {
    const { n: u, v: vu } = pop();
    // A node is settled once, by its best entry; any other entry for it is stale.
    if (settled.has(u)) continue;
    settled.add(u);
    for (const { to, w } of g.out(u)) {
      if (settled.has(to) || (q.admit !== undefined && !q.admit(to))) continue;
      offer(to, s.times(vu, q.weight(w)), u);
    }
  }
  return { value, parent };
}
