/**
 * `describe`'s room adjacency (`roomAdjacency`, `src/describe.ts`) against the loop it
 * replaced, kept here VERBATIM as the oracle (`docs/backlog.md` M.19).
 *
 * The old `summarize` asked `roomsAdjacent` of every ordered room pair: 25 million calls for
 * 5,000 coincident rooms, about two thirds of that `describe`. The new pass asks the same
 * predicate of the same boxes, but only of the pairs a broad phase cannot rule out: for two
 * rectangles, an edge coordinate within `tol` of the facing one (four sorted key lists); for a
 * pair with a polygon or circle side, ring bounds within `tol` (and a wide allowance) of each
 * other. The gate is that every `adjacent` list is the same strings in the same order, over
 * every storey of the corpus (at the default tolerance and others) and over generated room
 * sets: coincident, touching, near-touching (gaps at the tolerance and one ulp either side),
 * polygon and circle rooms, duplicate ids, negative and zero sizes, -0, non-finite tolerances
 * and coordinates, and differences that only ROUND onto the tolerance. Each block counts the
 * adjacent pairs it found and which path ran, so a green run cannot be a vacuous one.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_TOL, type RoomBox, roomBox, roomsAdjacent } from "../src/analyze.js";
import type { Point } from "../src/ast.js";
import { roomAdjacency } from "../src/describe.js";
import { link } from "../src/import.js";
import { type RRoom, resolveAll } from "../src/ir.js";
import { extractArchBlocks } from "../src/markdown.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import type { World } from "../src/world.js";
import { NULL_WORLD } from "../src/world.js";

const ROOT = resolvePath(__dirname, "..");

/* ---------------------------------------------------------------------------
 * The oracle: the replaced code, verbatim (the `adjacent` loop of `summarize`)
 * ------------------------------------------------------------------------- */

function adjacencyBefore(roomEls: RRoom[], roomRects: Map<string, RoomBox>, tol: number): string[][] {
  return roomEls.map((r) => {
    const rect = roomRects.get(r.id)!;
    const adjacent: string[] = [];
    for (const other of roomEls) {
      if (other.id === r.id) continue;
      if (roomsAdjacent(rect, roomRects.get(other.id)!, tol)) adjacent.push(other.id);
    }
    return adjacent;
  });
}

/* ---------------------------------------------------------------------------
 * Harness
 * ------------------------------------------------------------------------- */

/** Compare the two forms on `roomEls`, keyed as `summarize` keys them; returns the pair count. */
function compare(roomEls: RRoom[], tol: number = DEFAULT_TOL): number {
  const roomRects = new Map<string, RoomBox>(roomEls.map((r) => [r.id, roomBox(r)]));
  const now = roomAdjacency(roomEls, roomRects, tol);
  expect(now).toStrictEqual(adjacencyBefore(roomEls, roomRects, tol));
  return now.reduce((n, a) => n + a.length, 0);
}

let seq = 0;
function room(at: Point, size: { w: number; h: number }, poly?: Point[], id?: string): RRoom {
  const i = seq++;
  return {
    kind: "room",
    id: id ?? `r${i}`,
    span: { start: i, end: i + 1 },
    at,
    size,
    ...(poly ? { poly } : {}),
  } as RRoom;
}

/** A polygon room whose `at`/`size` is its ring's box, as the resolver records it. */
function polyRoom(ring: Point[], dx = 0, dy = 0, id?: string): RRoom {
  const pts = ring.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return room({ x, y }, { w: Math.max(...xs) - x, h: Math.max(...ys) - y }, pts, id);
}

const L_RING: Point[] = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 1500 },
  { x: 2000, y: 1500 },
  { x: 2000, y: 3000 },
  { x: 0, y: 3000 },
];
/** A circle room's 48-gon, centred on (r, r) — the tessellation the resolver attaches. */
const circleRing = (r: number): Point[] =>
  Array.from({ length: 48 }, (_, k) => ({
    x: r + r * Math.cos((2 * Math.PI * k) / 48),
    y: r + r * Math.sin((2 * Math.PI * k) / 48),
  }));

/** Every storey's rooms in the corpus (the room-overlap oracle's corpus). */
function corpusStoreys(): RRoom[][] {
  const worldFor = (dir: string): World => ({
    read: (p) => {
      try {
        return readFileSync(resolvePath(dir, p), "utf8");
      } catch {
        return null;
      }
    },
  });
  const walk = (dir: string, keep: (f: string) => boolean): string[] => {
    const files: string[] = [];
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) files.push(...walk(p, keep));
      else if (keep(f)) files.push(p);
    }
    return files;
  };
  const sources: { src: string; world: World }[] = [];
  for (const d of ["examples", "test/fixtures", "test/recovery-corpus", "eval"])
    for (const p of walk(join(ROOT, d), (f) => f.endsWith(".arch")))
      sources.push({ src: readFileSync(p, "utf8"), world: worldFor(dirname(p)) });
  const md = [
    ...walk(join(ROOT, "docs"), (f) => f.endsWith(".md")),
    ...readdirSync(ROOT)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(ROOT, f)),
  ];
  for (const p of md)
    for (const b of extractArchBlocks(readFileSync(p, "utf8"))) sources.push({ src: b.source, world: NULL_WORLD });
  const out: RRoom[][] = [];
  for (const s of sources) {
    const { plan: ast } = parse(s.src, BUILTIN_REGISTRY);
    if (!ast) continue;
    const res = resolveAll(link(ast, s.world, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, s.world);
    const irs = res.levels.length > 0 ? res.levels.map((l) => l.ir) : [res.ir];
    for (const ir of irs) if (ir) out.push(ir.elements.filter((e): e is RRoom => e.kind === "room"));
  }
  return out;
}

describe("room adjacency: the broad-phase pass against every ordered pair", () => {
  it("every storey of the corpus, at the default tolerance and at others", () => {
    let storeys = 0;
    let rooms = 0;
    let pairs = 0;
    let withRing = 0;
    let ringPairs = 0;
    for (const els of corpusStoreys()) {
      storeys++;
      rooms += els.length;
      pairs += compare(els);
      if (els.some((r) => r.poly)) {
        withRing++;
        ringPairs += compare(els);
      }
      for (const tol of [0, 1, 250, 5000]) compare(els, tol);
    }
    // Not vacuous (when this was written: 283 storeys, 499 rooms, 1,118 adjacent ordered
    // pairs, 13 storeys with a polygon or circle room and 162 pairs on them).
    expect(storeys).toBeGreaterThan(250);
    expect(rooms).toBeGreaterThan(400);
    expect(pairs).toBeGreaterThan(900);
    expect(withRing).toBeGreaterThanOrEqual(10);
    expect(ringPairs).toBeGreaterThan(120);
  }, 120_000);

  it("coincident piles: rectangles (no shared edge), L-shapes and circles (all adjacent)", () => {
    for (const n of [0, 1, 2, 3, 40, 300]) {
      expect(compare(Array.from({ length: n }, () => room({ x: 0, y: 0 }, { w: 4000, h: 3000 })))).toBe(0);
      const ls = Array.from({ length: Math.min(n, 120) }, () => polyRoom(L_RING));
      expect(compare(ls)).toBe(ls.length * Math.max(0, ls.length - 1));
      const cs = Array.from({ length: Math.min(n, 60) }, () => polyRoom(circleRing(1500)));
      expect(compare(cs)).toBe(cs.length * Math.max(0, cs.length - 1));
    }
  }, 120_000);

  it("touching grids, gaps at the tolerance and one ulp either side, shared corners only", () => {
    let pairs = 0;
    // A 12 x 12 grid of 3000 x 2500 rooms, then the same with a gap of exactly `tol` and
    // of the doubles just inside and just outside it.
    const grid = (gap: number): RRoom[] => {
      const out: RRoom[] = [];
      for (let i = 0; i < 12; i++)
        for (let j = 0; j < 12; j++) out.push(room({ x: i * (3000 + gap), y: j * (2500 + gap) }, { w: 3000, h: 2500 }));
      return out;
    };
    for (const tol of [0, DEFAULT_TOL, 200])
      for (const gap of [0, tol, tol + 2 ** -40, Math.max(0, tol - 2 ** -40), tol * 2 + 1])
        pairs += compare(grid(gap), tol);
    // A diagonal chain: corners touch, edges never overlap.
    pairs += compare(
      Array.from({ length: 50 }, (_, k) => room({ x: k * 1000, y: k * 1000 }, { w: 1000, h: 1000 })),
      0,
    );
    expect(pairs).toBeGreaterThan(2000);
  }, 120_000);

  it("polygon and circle rooms beside rectangles, in and out of the tolerance", () => {
    let pairs = 0;
    for (const tol of [0, DEFAULT_TOL, 200]) {
      const els: RRoom[] = [];
      for (let k = 0; k < 20; k++) {
        els.push(polyRoom(L_RING, k * 4000, 0));
        // In the L's notch: shares two edges with it.
        els.push(room({ x: k * 4000 + 2000, y: 1500 }, { w: 2000, h: 1500 }));
        // Below, at gaps of tol, just inside and just outside it.
        els.push(
          room({ x: k * 4000, y: 3000 + (k % 3 === 0 ? tol : k % 3 === 1 ? tol / 2 : tol + 1) }, { w: 1000, h: 800 }),
        );
        els.push(polyRoom(circleRing(1000), k * 4000 + 1000, -2000 - (k % 2) * tol));
      }
      pairs += compare(els, tol);
    }
    expect(pairs).toBeGreaterThan(150);
  }, 120_000);

  it("duplicate ids, negative and zero sizes, -0, non-finite tolerances and coordinates", () => {
    const dup = [
      room({ x: 0, y: 0 }, { w: 1000, h: 1000 }, undefined, "a"),
      room({ x: 1000, y: 0 }, { w: 1000, h: 1000 }, undefined, "b"),
      room({ x: 2000, y: 0 }, { w: 1000, h: 1000 }, undefined, "a"),
      room({ x: 3000, y: 0 }, { w: 1000, h: 1000 }, undefined, "b"),
      polyRoom(L_RING, 4000, 0, "a"),
    ];
    expect(compare(dup)).toBeGreaterThan(0);
    const odd = [
      room({ x: -0, y: 0 }, { w: 1000, h: 1000 }),
      room({ x: 1000, y: -0 }, { w: -1000, h: 1000 }),
      room({ x: 1000, y: 0 }, { w: 0, h: 0 }),
      room({ x: 0, y: 1000 }, { w: 1000, h: -0 }),
      polyRoom([]),
      polyRoom([{ x: 0, y: 0 }]),
      polyRoom(L_RING, -0, 1000),
    ];
    for (const tol of [0, -0, DEFAULT_TOL]) compare(odd, tol);
    // A non-finite or negative tolerance, and a non-finite coordinate, take the definition.
    // With a NaN tolerance `ringsAdjacent` accepts parallel edges at any distance.
    let nanPairs = 0;
    for (const tol of [Number.NaN, -1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
      nanPairs += compare([...dup, polyRoom(L_RING, 0, 90_000), polyRoom(L_RING, 50_000, 0)], tol);
    expect(nanPairs).toBeGreaterThan(0);
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY])
      compare([room({ x: v, y: 0 }, { w: 1000, h: 1000 }), ...dup, polyRoom([{ x: v, y: 0 }, ...L_RING])]);
  });

  it("a difference that only rounds onto the tolerance is still found", () => {
    // |a.x + a.w − b.x| = 2^30 + 2^-24 exactly, which rounds to 2^30 = tol: adjacent. The
    // unwidened interval [R − tol, R + tol] = [0, 2^31] would miss b.x = −2^-24, and no other
    // edge of the pair is within tol, so only the widening finds it.
    const a = room({ x: 0, y: 0 }, { w: 2 ** 30, h: 2 ** 32 });
    const b = room({ x: -(2 ** -24), y: 2 ** 31 }, { w: -(2 ** 31), h: 2 ** 33 });
    expect(compare([a, b], 2 ** 30)).toBe(2);
    // The same in y.
    const c = room({ x: 0, y: 0 }, { w: 2 ** 32, h: 2 ** 30 });
    const d = room({ x: 2 ** 31, y: -(2 ** -24) }, { w: 2 ** 33, h: -(2 ** 31) });
    expect(compare([c, d], 2 ** 30)).toBe(2);
  });

  it("property: rooms drawn from a few recipes (ties, -0, ulps, rounding at the tolerance)", () => {
    const coord = fc.constantFrom(-0, 0, 0.1, 0.2, 0.3, 1, 1 + 2 ** -52, 2, 3, 1000, 1000.5, 3000, 1e15, 1e15 + 2);
    const ext = fc.constantFrom(0, 0.1, 0.2, 1, 1 + 2 ** -52, 2, 1000, 2000, 3000, -1000, 1e15);
    const tol = fc.constantFrom(0, 2 ** -54, 5.551115123125783e-17, 0.1, 1, DEFAULT_TOL, 1000, 1e15);
    const ring = fc.constantFrom(L_RING, circleRing(500), [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 0, y: 1000 },
    ]);
    const recipe = fc.oneof(
      {
        weight: 4,
        arbitrary: fc.tuple(coord, coord, ext, ext).map(
          ([x, y, w, h]) =>
            () =>
              room({ x, y }, { w, h }),
        ),
      },
      {
        weight: 1,
        arbitrary: fc.tuple(ring, coord, coord).map(
          ([r, dx, dy]) =>
            () =>
              polyRoom(r, dx, dy),
        ),
      },
    );
    const pile = fc
      .tuple(fc.array(recipe, { minLength: 1, maxLength: 6 }), fc.array(fc.nat(), { maxLength: 40, size: "max" }))
      .map(([palette, picks]) => picks.map((k) => palette[k % palette.length]!()));
    let withPairs = 0;
    fc.assert(
      fc.property(pile, tol, (rooms, t) => {
        if (compare(rooms, t) > 0) withPairs++;
      }),
      { numRuns: 600, seed: 1923 },
    );
    expect(withPairs).toBeGreaterThan(150);
  }, 120_000);

  it("5,000 coincident rooms: no pair asked, none adjacent", () => {
    const els = Array.from({ length: 5000 }, () => room({ x: 0, y: 0 }, { w: 4000, h: 3000 }));
    const roomRects = new Map<string, RoomBox>(els.map((r) => [r.id, roomBox(r)]));
    expect(roomAdjacency(els, roomRects, DEFAULT_TOL).every((a) => a.length === 0)).toBe(true);
  });
});
