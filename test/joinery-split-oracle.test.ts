/**
 * The joinery's speed-ups (`docs/backlog.md` 4.1) against the forms they replaced, kept here
 * VERBATIM as the oracles, compared BIT FOR BIT.
 *
 * Every change in that item is a constant-factor change inside the one algorithm, and the
 * gate is that it moves nothing - not "the same number", the same float. So each one is run
 * side by side with its predecessor over the inputs the compiler really builds (every
 * shipped example's bands and opening cuts, storey by storey) and over generated ones, and
 * every coordinate is compared with `Object.is`, which tells `-0` from `0` and an ulp from
 * none. Each block also counts the inputs that actually reached the new path, so a green run
 * cannot be a vacuous one.
 *
 *  - **The axis-aligned split shortcut** (`crossPoints`): a vertical x horizontal pair is
 *    answered before the general solve. The oracle is `crossPoints` as it was.
 *  - **Line grouping through nested maps** (`groupEdges`): the same partition as the one
 *    string-keyed map, without building `L|k1|k2`. The oracle is that map.
 *  - **The per-call point-key memo** (`keyMemo`): the same text as `pointKey`.
 *  - **The single-material fill** (`joinWalls`): a fill whose every side reads as the
 *    outline's reuses the outline's loops. The oracle is the general keep-and-chain pass,
 *    forced on the same geometry by a far-away decoy wall of another material.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Point } from "../src/ast.js";
import type { Arc } from "../src/geometry/arc.js";
import {
  type Edge,
  PointInterner,
  edgeEnd,
  edgeMid,
  edgeStart,
  loopBBox,
  openingCut,
  pointKey,
  wallBand,
} from "../src/geometry/band.js";
import { arcPointAt } from "../src/geometry/arc.js";
import {
  type EdgeGroup,
  type JoineryCut,
  type JoineryWall,
  bandBBox,
  crossPoints,
  groupEdges,
  joinWalls,
  keyMemo,
} from "../src/geometry/joinery.js";
import { circleCircle, lineCircleParams, meetLines, parallel, sub2 } from "../src/geometry/intersect.js";
import { hatchKey, hatchOf } from "../src/hatches.js";
import { resolveAll } from "../src/ir.js";
import type { RWall } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { makeVirtualWorld } from "../src/index.js";
import { angledWalls, rectilinearWalls, renderWalls } from "./arbitrary-joinery.js";

/* ---------------------------------------------------------------------------
 * The oracles: the replaced code, verbatim
 * ------------------------------------------------------------------------- */

function lineArcPointsBefore(line: { a: Point; b: Point }, arc: Arc): Point[] {
  const d = sub2(line.b, line.a);
  return lineCircleParams(line.a, d, arc.center, arc.r).map((s) => ({
    x: line.a.x + s * d.x,
    y: line.a.y + s * d.y,
  }));
}

/** `crossPoints` before the axis-aligned shortcut. */
function crossPointsBefore(a: Edge, b: Edge): Point[] {
  if (a.t === "line" && b.t === "line") {
    const d = sub2(a.b, a.a);
    const e = sub2(b.b, b.a);
    if (parallel(d, e)) {
      if (!parallel(d, sub2(b.a, a.a))) return [];
      return [b.a, b.b, a.a, a.b];
    }
    const m = meetLines(a.a, d, b.a, e);
    return m ? [m] : [];
  }
  if (a.t === "line" && b.t === "arc") return lineArcPointsBefore(a, b.arc);
  if (a.t === "arc" && b.t === "line") return lineArcPointsBefore(b, a.arc);
  if (a.t === "arc" && b.t === "arc") {
    const p = a.arc;
    const q = b.arc;
    const concentric =
      Math.hypot(p.center.x - q.center.x, p.center.y - q.center.y) < 1e-9 && Math.abs(p.r - q.r) < 1e-9;
    if (concentric) return [q.a, q.b, p.a, p.b];
    return circleCircle(p.center, p.r, q.center, q.r);
  }
  return [];
}

/** `undirectedKey` before the key memo and the array-free sort. */
function undirectedKeyBefore(e: Edge): string {
  const [k1, k2] = [pointKey(edgeStart(e)), pointKey(edgeEnd(e))].sort();
  if (e.t === "line") return `L|${k1}|${k2}`;
  const mid = pointKey(arcPointAt(e.arc, 0.5));
  return `A|${k1}|${k2}|${mid}|${pointKey(e.arc.center)}|${Math.round(e.arc.r * 1e6)}|${Math.round(Math.abs(e.arc.sweep) * 1e9)}`;
}

/** The grouping loop before nested maps: one map on the whole key, first member = rep. */
function groupBefore(edges: readonly Edge[]): EdgeGroup[] {
  const edgeGroups: EdgeGroup[] = [];
  const byKey = new Map<string, EdgeGroup>();
  const pieceKeys = edges.map((e) => undirectedKeyBefore(e));
  for (let pi = 0; pi < edges.length; pi++) {
    const t = edges[pi]!;
    const key = pieceKeys[pi]!;
    let g = byKey.get(key);
    if (!g) {
      g = { rep: t, mid: edgeMid(t) };
      byKey.set(key, g);
      edgeGroups.push(g);
    }
  }
  return edgeGroups;
}

/* ---------------------------------------------------------------------------
 * Bit-level comparison
 * ------------------------------------------------------------------------- */

/** The first path at which two values differ, comparing every number with `Object.is`. */
function bitDiff(a: unknown, b: unknown, path = "$"): string | null {
  if (typeof a === "number" || typeof b === "number") return Object.is(a, b) ? null : `${path}: ${a} vs ${b}`;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return a === b ? null : `${path}: ${String(a)} vs ${String(b)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array vs object`;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.join() !== kb.join()) return `${path}: keys [${ka.join()}] vs [${kb.join()}]`;
  for (const k of ka) {
    const d = bitDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

/** Would the NEW `crossPoints` answer this pair from its axis-aligned shortcut? */
const takesShortcut = (a: Edge, b: Edge): boolean => {
  if (a.t !== "line" || b.t !== "line") return false;
  const d = sub2(a.b, a.a);
  const e = sub2(b.b, b.a);
  return (d.x === 0 && d.y !== 0 && e.y === 0 && e.x !== 0) || (d.y === 0 && d.x !== 0 && e.x === 0 && e.y !== 0);
};

/* ---------------------------------------------------------------------------
 * The corpus: every shipped example, storey by storey, as `joinWalls` receives it
 * ------------------------------------------------------------------------- */

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), "..", "examples");
const files: Record<string, string> = {};
const walk = (dir: string, prefix: string): void => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(dir, e.name), `${prefix}${e.name}/`);
    else if (e.name.endsWith(".arch")) files[`${prefix}${e.name}`] = readFileSync(join(dir, e.name), "utf8");
  }
};
walk(EXAMPLES, "");
const world = makeVirtualWorld(files);

interface Input {
  name: string;
  walls: JoineryWall[];
  cuts: JoineryCut[];
  groups: string[];
}

/** One storey's wall set as `joinWallSet` (src/wall-lowering.ts) builds it. */
function inputOf(name: string, walls: readonly RWall[]): Input {
  const intern = new PointInterner();
  const jwalls: JoineryWall[] = [];
  const cuts: JoineryCut[] = [];
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i]!;
    const loops = wallBand(w, intern);
    if (loops.length > 0) {
      jwalls.push({
        index: i,
        id: w.id,
        thickness: w.thickness,
        group: hatchKey(hatchOf(w)),
        loops,
        bbox: bandBBox(loops),
      });
    }
    for (const op of w.openings) {
      const loop = openingCut(w, op, intern);
      if (loop) cuts.push({ index: cuts.length, loop, bbox: loopBBox(loop) });
    }
  }
  return { name, walls: jwalls, cuts, groups: [...new Set(jwalls.map((w) => w.group))].sort() };
}

const CORPUS: Input[] = Object.keys(files)
  .sort()
  .flatMap((name) => {
    const { plan } = parse(files[name]!);
    const res = resolveAll(plan!, undefined, world);
    // A multi-storey plan joins each storey on its own, as the compiler draws one page per level.
    const storeys =
      res.levels.length > 0 ? res.levels.map((l) => ({ lv: l.level, ir: l.ir })) : [{ lv: 0, ir: res.ir }];
    return storeys.map(({ lv, ir }) => inputOf(`${name} L${lv}`, ir.walls));
  })
  .filter((inp) => inp.walls.length > 0);

const edgesOf = (inp: Input): Edge[] => [
  ...inp.walls.flatMap((w) => w.loops.flat()),
  ...inp.cuts.flatMap((c) => c.loop),
];

const boxesOverlap = (a: Edge, b: Edge): boolean => {
  const p = loopBBox([a]);
  const q = loopBBox([b]);
  return p.minX <= q.maxX && q.minX <= p.maxX && p.minY <= q.maxY && q.minY <= p.maxY;
};

const generated = (seed: number): Input[] =>
  [rectilinearWalls, angledWalls].flatMap((arb, k) =>
    fc
      .sample(arb, { numRuns: 300, seed: seed + k })
      .map((specs, i) => ({ name: `gen ${k}:${i}`, ...renderWalls(specs) })),
  );
const GENERATED = generated(41);

describe("the corpus this file reads", () => {
  it("covers every example, straight and curved, single- and multi-material", () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(29);
    expect(CORPUS.some((inp) => edgesOf(inp).some((e) => e.t === "arc"))).toBe(true);
    expect(CORPUS.some((inp) => inp.groups.length > 1)).toBe(true);
    expect(CORPUS.some((inp) => inp.groups.length === 1)).toBe(true);
  });
});

/* ---------------------------------------------------------------------------
 * The axis-aligned split shortcut
 * ------------------------------------------------------------------------- */

describe("crossPoints with the axis-aligned shortcut equals crossPoints without it, bit for bit", () => {
  const check = (pairs: Iterable<[Edge, Edge]>): { pairs: number; shortcut: number } => {
    let n = 0;
    let shortcut = 0;
    for (const [a, b] of pairs) {
      n++;
      if (takesShortcut(a, b)) shortcut++;
      const d = bitDiff(crossPoints(a, b), crossPointsBefore(a, b));
      if (d) throw new Error(`${JSON.stringify([a, b])}: ${d}`);
    }
    return { pairs: n, shortcut };
  };

  it("on every box-overlapping edge pair of every example and generated wall set (the pairs the split meets)", () => {
    let total = { pairs: 0, shortcut: 0 };
    for (const inp of [...CORPUS, ...GENERATED]) {
      const edges = edgesOf(inp);
      const pairs: Array<[Edge, Edge]> = [];
      for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
          if (boxesOverlap(edges[i]!, edges[j]!)) pairs.push([edges[i]!, edges[j]!], [edges[j]!, edges[i]!]);
        }
      }
      const r = check(pairs);
      total = { pairs: total.pairs + r.pairs, shortcut: total.shortcut + r.shortcut };
    }
    // Non-vacuity: the shortcut ran, and so did everything it does not cover.
    expect(total.shortcut).toBeGreaterThan(1000);
    expect(total.pairs - total.shortcut).toBeGreaterThan(1000);
  });

  // The edges of the number line the corpus never reaches: signed zeros, subnormals,
  // magnitudes past the model range, overflow to infinity, NaN.
  const special = [
    0, -0, 5e-324, -5e-324, 1e-300, 1, -1, 0.1, 4100, 33_554_432, 1e15, 1e300, -1e300, 1.7e308, -1.7e308,
  ];
  const coord = fc.oneof(
    fc.integer({ min: -40_000, max: 40_000 }),
    fc.constantFrom(...special, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN),
    fc.double({ noNaN: false }),
  );
  const pt = fc.record({ x: coord, y: coord });
  // Axis-aligned segments by construction, so the shortcut's population is dense.
  const vertical = fc
    .tuple(coord, coord, coord)
    .map(([x, y0, y1]): Edge => ({ t: "line", a: { x, y: y0 }, b: { x, y: y1 } }));
  const horizontal = fc
    .tuple(coord, coord, coord)
    .map(([y, x0, x1]): Edge => ({ t: "line", a: { x: x0, y }, b: { x: x1, y } }));
  const anyLine = fc.tuple(pt, pt).map(([a, b]): Edge => ({ t: "line", a, b }));
  const line = fc.oneof(vertical, horizontal, anyLine);

  it("on generated line pairs, including signed zeros, subnormals, overflow and NaN", () => {
    let shortcut = 0;
    fc.assert(
      fc.property(line, line, (a, b) => {
        if (takesShortcut(a, b)) shortcut++;
        expect(bitDiff(crossPoints(a, b), crossPointsBefore(a, b))).toBeNull();
      }),
      { numRuns: 20_000, seed: 7 },
    );
    expect(shortcut).toBeGreaterThan(2000);
  });
});

/* ---------------------------------------------------------------------------
 * The point-key memo and the nested-map grouping
 * ------------------------------------------------------------------------- */

describe("the memoised point key and the nested-map grouping equal what they replaced", () => {
  it("keyMemo gives pointKey's text for every vertex, including -0", () => {
    const key = keyMemo();
    const pts: Point[] = [
      { x: -0, y: 0 },
      { x: 0.004, y: -0.004 },
      { x: 1e300, y: -1e300 },
    ];
    for (const inp of [...CORPUS, ...GENERATED]) {
      for (const e of edgesOf(inp)) pts.push(edgeStart(e), edgeEnd(e), ...(e.t === "arc" ? [e.arc.center] : []));
    }
    for (const p of pts) {
      expect(key(p)).toBe(pointKey(p));
      expect(key(p)).toBe(pointKey(p)); // the second read is the memo's
    }
  });

  /**
   * An edge list with coincident members, the way the split leaves one: every edge, then
   * every edge reversed (same endpoints, so it must join the first one's group), then
   * every edge again. A reversed ARC has the opposite sweep sign but the same undirected
   * key - the same curve, run the other way round - so it must join its original's group.
   */
  const withCoincident = (edges: readonly Edge[]): Edge[] => {
    const rev = (e: Edge): Edge =>
      e.t === "line"
        ? { t: "line", a: e.b, b: e.a }
        : {
            t: "arc",
            arc: { ...e.arc, a: e.arc.b, b: e.arc.a, sweep: -e.arc.sweep, start: e.arc.start + e.arc.sweep },
          };
    return [...edges, ...edges.map(rev), ...edges];
  };

  it("groupEdges partitions every example's and generated set's edges exactly as the string-keyed map did", () => {
    let merged = 0;
    let arcs = 0;
    for (const inp of [...CORPUS, ...GENERATED]) {
      const edges = withCoincident(edgesOf(inp));
      const before = groupBefore(edges);
      const after = groupEdges(edges, keyMemo());
      expect(after.length, inp.name).toBe(before.length);
      for (let i = 0; i < before.length; i++) {
        // Same representative OBJECT, and its midpoint to the bit.
        expect(after[i]!.rep, `${inp.name} group ${i}`).toBe(before[i]!.rep);
        expect(bitDiff(after[i]!.mid, before[i]!.mid), `${inp.name} group ${i}`).toBeNull();
        if (before[i]!.rep.t === "arc") arcs++;
      }
      merged += edges.length - before.length;
    }
    // Non-vacuity: coincident members were really merged, and arcs were really grouped.
    expect(merged).toBeGreaterThan(1000);
    expect(arcs).toBeGreaterThan(10);
  });
});

/* ---------------------------------------------------------------------------
 * The single-material fill
 * ------------------------------------------------------------------------- */

describe("a fill that reads as the outline reuses its loops, and they are the general pass's, bit for bit", () => {
  /**
   * The same input plus one short wall of another material, far beyond everything else.
   * It shares no box with any other edge and is the highest index, so it changes nothing
   * the original edges meet - but it gives some sides an owner outside `group`, so every
   * fill takes the general keep-and-chain pass. Its own loop is a separate fill entry.
   */
  const withDecoy = (inp: Input): Input => {
    const box = inp.walls.reduce(
      (b, w) => ({ maxX: Math.max(b.maxX, w.bbox.maxX), maxY: Math.max(b.maxY, w.bbox.maxY) }),
      { maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY },
    );
    const x = Math.ceil(box.maxX) + 100_000;
    const y = Math.ceil(box.maxY) + 100_000;
    const loops = wallBand(
      {
        thickness: 100,
        points: [
          { x, y },
          { x: x + 1000, y },
        ],
        closed: false,
      },
      new PointInterner(),
    );
    const index = Math.max(...inp.walls.map((w) => w.index)) + 1;
    const decoy: JoineryWall = {
      index,
      id: "decoy",
      thickness: 100,
      group: "\u0000decoy",
      loops,
      bbox: bandBBox(loops),
    };
    return { ...inp, walls: [...inp.walls, decoy] };
  };

  it("on every single-material example storey and generated set", () => {
    let reused = 0;
    for (const inp of [...CORPUS, ...GENERATED]) {
      if (inp.groups.length !== 1) continue;
      const group = inp.groups[0]!;
      const fast = joinWalls(inp.walls, inp.cuts, [group]);
      const general = joinWalls(withDecoy(inp).walls, inp.cuts, [group, "\u0000decoy"]);
      // The control: the decoy's own fill exists, so the general pass really ran beside it.
      expect(general.fills[1]!.loops.length, inp.name).toBe(1);
      expect(bitDiff(fast.fills[0]!.loops, general.fills[0]!.loops), inp.name).toBeNull();
      // And the reuse really happened: the fill is the outline, in fresh arrays.
      expect(bitDiff(fast.fills[0]!.loops, fast.outline), inp.name).toBeNull();
      if (fast.fills[0]!.loops.length > 0) {
        expect(fast.fills[0]!.loops[0]).not.toBe(fast.outline[0]);
        reused++;
      }
    }
    expect(reused).toBeGreaterThan(100);
  });

  it("leaves a multi-material plan's fills on the general pass", () => {
    const multi = CORPUS.filter((inp) => inp.groups.length > 1);
    expect(multi.length).toBeGreaterThan(0);
    for (const inp of multi) {
      const r = joinWalls(inp.walls, inp.cuts, inp.groups);
      // No group's fill is the whole outline when another group owns part of it.
      for (const f of r.fills) expect(bitDiff(f.loops, r.outline) === null && f.loops.length > 0, inp.name).toBe(false);
    }
  });
});
