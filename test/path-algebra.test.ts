import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bestPaths, type Digraph } from "../src/algebra/paths.js";
import { BOOLEAN, lexicographic, MAX_MIN, MIN_PLUS, type OrderedSemiring } from "../src/algebra/semiring.js";
import {
  bfs,
  distanceTransform4,
  type NavGrid,
  reachableFromAny,
  widestBottleneck,
} from "../src/analyze/circulation.js";
import { neighbours4 } from "../src/analyze/grid.js";

/**
 * The path-algebra ORACLE: one engine, `bestPaths`, against every specialised search.
 *
 * The nav and occupancy grids keep their own hand-tuned searches (typed arrays, an
 * inlined heap), because they run on up to 250k cells. This file proves each of them
 * computes exactly what the engine computes on the same grid:
 *
 *  - `bfs`                 ≡ unit `MIN_PLUS`, constant rank: distance AND parent;
 *  - `reachableFromAny`    ≡ the `BOOLEAN` closure;
 *  - `widestBottleneck`    ≡ `MAX_MIN` values (a cell's clear width is its in-edge weight);
 *  - `distanceTransform4`  ≡ multi-source unit `MIN_PLUS`.
 *
 * The grid adapter below spells the neighbour order out (W, E, N, S) instead of calling
 * `neighbours4`, so a change to that order fails here: the overlay's drawn walk is
 * made of `bfs` parents, and a parent depends on which neighbour is discovered first.
 *
 * The first block checks the engine itself against brute force on random digraphs.
 */

// ---------------------------------------------------------------------------------------
// The engine against brute force.
// ---------------------------------------------------------------------------------------

interface RandomGraph {
  n: number;
  edges: Array<{ from: number; to: number; w: number }>;
  sources: number[];
}

const randomGraph: fc.Arbitrary<RandomGraph> = fc.integer({ min: 1, max: 9 }).chain((n) =>
  fc.record({
    n: fc.constant(n),
    edges: fc.array(
      fc.record({
        from: fc.integer({ min: 0, max: n - 1 }),
        to: fc.integer({ min: 0, max: n - 1 }),
        w: fc.integer({ min: 0, max: 20 }),
      }),
      { maxLength: 30 },
    ),
    sources: fc.array(fc.integer({ min: 0, max: n - 1 }), { minLength: 1, maxLength: 3 }),
  }),
);

const digraphOf = (r: RandomGraph): Digraph<number, number> => {
  const out: Array<Array<{ to: number; w: number }>> = Array.from({ length: r.n }, () => []);
  for (const e of r.edges) out[e.from]!.push({ to: e.to, w: e.w });
  return { nodes: Array.from({ length: r.n }, (_, i) => i), out: (k) => out[k]! };
};

/**
 * The best value per node by fixed-point iteration (Bellman–Ford over the semiring):
 * `plus` over every path, n rounds. Correct for any selective semiring whose cycles never
 * help, which monotonicity guarantees. Independent of settle order, so it is the oracle.
 */
function fixedPoint<T>(s: OrderedSemiring<T>, r: RandomGraph, w: (x: number) => T, seed: T): T[] {
  const v: T[] = Array.from({ length: r.n }, () => s.zero);
  for (const k of r.sources) v[k] = s.plus(v[k]!, seed);
  for (let round = 0; round < r.n; round++) {
    for (const e of r.edges) v[e.to] = s.plus(v[e.to]!, s.times(v[e.from]!, w(e.w)));
  }
  return v;
}

describe("bestPaths equals brute force on random digraphs", () => {
  const check = <T>(s: OrderedSemiring<T>, w: (x: number) => T, seed: T) => {
    fc.assert(
      fc.property(randomGraph, (r) => {
        const { value } = bestPaths(digraphOf(r), {
          s,
          weight: w,
          sources: r.sources.map((k) => [k, seed] as const),
          rank: () => 0,
        });
        const want = fixedPoint(s, r, w, seed);
        for (let k = 0; k < r.n; k++) {
          const got = value.get(k) ?? s.zero;
          expect(s.compare(got, want[k]!)).toBe(0);
        }
      }),
      { numRuns: 400 },
    );
  };
  it("BOOLEAN: reachability", () => check(BOOLEAN, () => true, true));
  it("MIN_PLUS: shortest distance", () => check(MIN_PLUS, (x) => x, 0));
  it("MAX_MIN: widest bottleneck", () => check(MAX_MIN, (x) => x, Number.POSITIVE_INFINITY));
  it("lexicographic(MIN_PLUS, MAX_MIN): widest among the shortest", () =>
    check(lexicographic(MIN_PLUS, MAX_MIN), (x) => [x % 4, x] as const, [0, Number.POSITIVE_INFINITY] as const));

  it("unit MIN_PLUS with a constant rank IS FIFO breadth-first search, parent for parent", () => {
    fc.assert(
      fc.property(randomGraph, (r) => {
        const g = digraphOf(r);
        // Reference FIFO BFS, sources in order, neighbours in out() order.
        const dist = new Map<number, number>();
        const parent = new Map<number, number>();
        const queue: number[] = [];
        for (const s of r.sources) {
          if (dist.has(s)) continue;
          dist.set(s, 0);
          queue.push(s);
        }
        for (let h = 0; h < queue.length; h++) {
          const u = queue[h]!;
          for (const { to } of g.out(u)) {
            if (dist.has(to)) continue;
            dist.set(to, dist.get(u)! + 1);
            parent.set(to, u);
            queue.push(to);
          }
        }
        const got = bestPaths(g, {
          s: MIN_PLUS,
          weight: () => 1,
          sources: r.sources.map((k) => [k, 0] as const),
          rank: () => 0,
        });
        expect([...got.value]).toEqual([...dist]);
        expect(new Map([...got.parent].sort((a, b) => a[0] - b[0]))).toEqual(
          new Map([...parent].sort((a, b) => a[0] - b[0])),
        );
      }),
      { numRuns: 400 },
    );
  });

  it("rank breaks ties between equal values: the lowest settles first", () => {
    // Two routes of equal width into node 3, through 1 and through 2. Whichever of 1 and 2
    // settles first becomes 3's parent, and rank decides that.
    const out: Record<number, Array<{ to: number; w: number }>> = {
      0: [
        { to: 1, w: 5 },
        { to: 2, w: 5 },
      ],
      1: [{ to: 3, w: 5 }],
      2: [{ to: 3, w: 5 }],
      3: [],
    };
    const g: Digraph<number, number> = { nodes: [0, 1, 2, 3], out: (k) => out[k]! };
    const run = (rank: (n: number) => number) =>
      bestPaths(g, { s: MAX_MIN, weight: (w) => w, sources: [[0, Number.POSITIVE_INFINITY]], rank }).parent.get(3);
    expect(run((n) => n)).toBe(1);
    expect(run((n) => -n)).toBe(2);
    expect(run(() => 0)).toBe(1); // equal rank: discovery order
  });

  it("admit gates entry by an edge, never a source; a value equal to zero is no path", () => {
    const g: Digraph<string, number> = {
      nodes: ["a", "b", "c"],
      out: (k) => (k === "a" ? [{ to: "b", w: 1 }] : k === "b" ? [{ to: "c", w: 1 }] : []),
    };
    const q = { s: BOOLEAN, weight: () => true, rank: () => 0 } as const;
    expect([...bestPaths(g, { ...q, sources: [["a", true]], admit: (n) => n !== "b" }).value.keys()]).toEqual(["a"]);
    expect([...bestPaths(g, { ...q, sources: [["b", true]], admit: (n) => n !== "b" }).value.keys()]).toEqual([
      "b",
      "c",
    ]);
    expect(bestPaths(g, { ...q, sources: [["a", false]] }).value.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------
// The specialised grid searches against the engine.
// ---------------------------------------------------------------------------------------

describe("neighbours4 lists W, E, N, S and stays in bounds", () => {
  const nbrs = (k: number, nx: number, ny: number): number[] => {
    const out = new Int32Array(4).fill(-7);
    const n = neighbours4(k, nx, ny, out);
    // Slots past the count are untouched: the caller reads only the first `n`.
    expect([...out.slice(n)].every((x) => x === -7)).toBe(true);
    return [...out.slice(0, n)];
  };
  it("pinned order", () => {
    expect(nbrs(4, 3, 3)).toEqual([3, 5, 1, 7]);
    expect(nbrs(0, 3, 3)).toEqual([1, 3]);
    expect(nbrs(8, 3, 3)).toEqual([7, 5]);
    expect(nbrs(0, 1, 1)).toEqual([]);
    expect(nbrs(2, 4, 1)).toEqual([1, 3]);
    expect(nbrs(1, 1, 3)).toEqual([0, 2]);
  });
});

interface RandomGrid {
  nx: number;
  ny: number;
  free: number[];
  clear: number[];
  sources: number[];
}

const randomGrid: fc.Arbitrary<RandomGrid> = fc
  .record({ nx: fc.integer({ min: 1, max: 12 }), ny: fc.integer({ min: 1, max: 12 }) })
  .chain(({ nx, ny }) =>
    fc.record({
      nx: fc.constant(nx),
      ny: fc.constant(ny),
      // ~70% walkable, so the searches meet walls, pockets and several components.
      free: fc.array(
        fc.integer({ min: 0, max: 9 }).map((x) => (x < 7 ? 1 : 0)),
        {
          minLength: nx * ny,
          maxLength: nx * ny,
        },
      ),
      // Few distinct widths, so equal bottlenecks (ties) are common.
      clear: fc.array(fc.constantFrom(0, 300, 600, 900, 1200, 2000), { minLength: nx * ny, maxLength: nx * ny }),
      sources: fc.array(fc.integer({ min: 0, max: nx * ny - 1 }), { minLength: 1, maxLength: 4 }),
    }),
  );

const navOf = (r: RandomGrid): NavGrid => ({
  minX: 0,
  minY: 0,
  cell: 100,
  nx: r.nx,
  ny: r.ny,
  free: Uint8Array.from(r.free),
  roomIdx: new Int32Array(r.nx * r.ny),
  clearMm: Float64Array.from(r.clear),
  carved: new Set(),
});

/** The grid as a digraph, neighbours spelled W, E, N, S; an edge's weight is the clear
 *  width of the cell it enters. */
const gridDigraph = (r: RandomGrid): Digraph<number, number> => ({
  nodes: Array.from({ length: r.nx * r.ny }, (_, i) => i),
  out: (k) => {
    const ix = k % r.nx;
    const iy = (k - ix) / r.nx;
    const to = [
      ix > 0 ? k - 1 : -1, // W
      ix < r.nx - 1 ? k + 1 : -1, // E
      iy > 0 ? k - r.nx : -1, // N
      iy < r.ny - 1 ? k + r.nx : -1, // S
    ].filter((nb) => nb >= 0);
    return to.map((nb) => ({ to: nb, w: r.clear[nb]! }));
  },
});

const GRID_RUNS = { numRuns: 300 };

describe("the nav-grid searches equal the engine on random grids up to 12 × 12", () => {
  it("bfs: distance and parent ≡ unit MIN_PLUS, constant rank, W,E,N,S", () => {
    fc.assert(
      fc.property(randomGrid, (r) => {
        const source = r.sources[0]!;
        const { dist, parent } = bfs(navOf(r), source);
        const e = bestPaths(gridDigraph(r), {
          s: MIN_PLUS,
          weight: () => 1,
          sources: [[source, 0]],
          admit: (k) => r.free[k] === 1,
          rank: () => 0,
        });
        for (let k = 0; k < r.nx * r.ny; k++) {
          expect(dist[k]).toBe(e.value.get(k) ?? -1);
          expect(parent[k]).toBe(e.parent.get(k) ?? -1);
        }
      }),
      GRID_RUNS,
    );
  });

  it("reachableFromAny ≡ the BOOLEAN closure", () => {
    fc.assert(
      fc.property(randomGrid, (r) => {
        const seen = reachableFromAny(navOf(r), r.sources);
        const e = bestPaths(gridDigraph(r), {
          s: BOOLEAN,
          weight: () => true,
          // reachableFromAny seeds only walkable sources.
          sources: r.sources.filter((s) => r.free[s] === 1).map((s) => [s, true] as const),
          admit: (k) => r.free[k] === 1,
          rank: () => 0,
        });
        for (let k = 0; k < r.nx * r.ny; k++) expect(seen[k] === 1).toBe(e.value.has(k));
      }),
      GRID_RUNS,
    );
  });

  it("widestBottleneck values ≡ MAX_MIN", () => {
    fc.assert(
      fc.property(randomGrid, fc.constantFrom(Number.POSITIVE_INFINITY, 0, 450, 900), (r, seed) => {
        const best = widestBottleneck(navOf(r), r.sources, seed);
        const e = bestPaths(gridDigraph(r), {
          s: MAX_MIN,
          weight: (w) => w,
          sources: r.sources.map((s) => [s, seed] as const),
          admit: (k) => r.free[k] === 1,
          rank: () => 0,
        });
        for (let k = 0; k < r.nx * r.ny; k++) expect(best[k]).toBe(e.value.get(k) ?? Number.NEGATIVE_INFINITY);
      }),
      GRID_RUNS,
    );
  });

  it("distanceTransform4 ≡ multi-source unit MIN_PLUS over every cell", () => {
    fc.assert(
      fc.property(randomGrid, (r) => {
        // The nav grid seeds it with each furniture-eroded cell once, row-major.
        const seeds = [...new Set(r.sources)].sort((a, b) => a - b);
        const D = distanceTransform4(r.nx, r.ny, seeds);
        const e = bestPaths(gridDigraph(r), {
          s: MIN_PLUS,
          weight: () => 1,
          sources: seeds.map((s) => [s, 0] as const),
          rank: () => 0,
        });
        for (let k = 0; k < r.nx * r.ny; k++) expect(D[k]).toBe(e.value.get(k) ?? -1);
      }),
      GRID_RUNS,
    );
  });
});
