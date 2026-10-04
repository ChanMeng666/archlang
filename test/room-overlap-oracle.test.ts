/**
 * `W_ROOM_OVERLAP` (`checkRoomOverlaps`, `src/ir.ts`) against the two forms it replaced, kept
 * here VERBATIM as the oracles (`docs/backlog.md` M.19):
 *
 *  - **The double loop** over every pair `a < b`, the rule's first form and the definition.
 *  - **The grid pass** that restricted it to rooms sharing a grid cell: the same diagnostics,
 *    still O(n²) when every room shares one cell (5,000 coincident rooms: ~10 s).
 *
 * The new rule groups rooms with value-identical geometry into classes, tests each class pair
 * once, and past the listing cap COUNTS rectangle pairs by sorting
 * (`countOverlappingRectPairs`, `src/geometry/rect.ts`). The gate is that no diagnostic moves:
 * the same codes, messages, spans and order, compared over every storey of the corpus and over
 * generated piles of coincident, near-coincident and overlapping rooms. Each block counts what
 * actually reached the new paths (the listing cap, the count, polygon classes), so a green run
 * cannot be a vacuous one.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Point } from "../src/ast.js";
import type { Diagnostic } from "../src/diagnostics.js";
import type { GridBox } from "../src/geometry/grid-index.js";
import { GridIndex } from "../src/geometry/grid-index.js";
import { polygonsOverlap, rectRing } from "../src/geometry/polygon.js";
import { type BBox, countOverlappingRectPairs, rectsOverlap } from "../src/geometry/rect.js";
import {
  MAX_OVERLAP_PAIRS_LISTED,
  type RRoom,
  type ResolvedElement,
  checkRoomOverlaps,
  resolveAll,
} from "../src/ir.js";
import { link } from "../src/import.js";
import { extractArchBlocks } from "../src/markdown.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import type { World } from "../src/world.js";
import { NULL_WORLD } from "../src/world.js";

const ROOT = resolvePath(__dirname, "..");

/* ---------------------------------------------------------------------------
 * The oracles: the replaced code, verbatim
 * ------------------------------------------------------------------------- */

/** The grid pass, as it was on `main` before M.19. */
function checkRoomOverlapsGrid(elements: ResolvedElement[], diagnostics: Diagnostic[]): void {
  // A room left unplaced carries a (0,0) placeholder, not geometry: testing it would
  // report phantom overlaps (quadratic in a chain) on top of the layout error.
  const rooms = elements.filter((e): e is RRoom => e.kind === "room" && !e._unplaced);
  const roomBox = (r: RRoom): GridBox => ({
    minX: r.at.x,
    minY: r.at.y,
    maxX: r.at.x + r.size.w,
    maxY: r.at.y + r.size.h,
  });
  let rext = 0;
  for (const r of rooms) rext += r.size.w + r.size.h;
  const rgrid = new GridIndex<number>(rooms.length > 0 ? Math.max(rext / (rooms.length * 2), 1) : 1);
  rooms.forEach((r, i) => {
    rgrid.insert(roomBox(r), i);
  });
  // Memory is O(n): no global pair set, no global sort. Room `a` is handled in ascending
  // order and its partners `b > a` ascending, so the (a,b) emission order is exactly the
  // former sorted order. Past MAX_OVERLAP_PAIRS_LISTED a pair is only counted.
  let found = 0;
  rooms.forEach((r1, a) => {
    const partners = rgrid.queryBox(roomBox(r1)).filter((b) => b > a);
    partners.sort((p, q) => p - q);
    for (const b of partners) {
      const r2 = rooms[b]!;
      const b1 = { x: r1.at.x, y: r1.at.y, w: r1.size.w, h: r1.size.h };
      const b2 = { x: r2.at.x, y: r2.at.y, w: r2.size.w, h: r2.size.h };
      // A polygon room is tested EXACTLY (its own ring against the other's), never by
      // its bounding box — an L and the room tucked into its notch have overlapping
      // boxes and disjoint floors, and a bbox answer there would be a plain lie.
      const overlapping =
        r1.poly || r2.poly
          ? rectsOverlap(b1, b2) && polygonsOverlap(r1.poly ?? rectRing(b1), r2.poly ?? rectRing(b2))
          : rectsOverlap(b1, b2);
      if (!overlapping) continue;
      found++;
      if (found <= MAX_OVERLAP_PAIRS_LISTED) {
        diagnostics.push({
          severity: "warning",
          message: `Rooms "${r1.id}" and "${r2.id}" overlap`,
          code: "W_ROOM_OVERLAP",
          span: r2.span,
        });
      }
    }
  });
  if (found > MAX_OVERLAP_PAIRS_LISTED) {
    diagnostics.push({
      severity: "warning",
      message: `…and ${found - MAX_OVERLAP_PAIRS_LISTED} more room pairs overlap (first ${MAX_OVERLAP_PAIRS_LISTED} listed)`,
      code: "W_ROOM_OVERLAP",
    });
  }
}

/** The double loop over every pair: the grid pass's own oracle, and the rule's definition. */
function checkRoomOverlapsPairs(elements: ResolvedElement[], diagnostics: Diagnostic[]): void {
  const rooms = elements.filter((e): e is RRoom => e.kind === "room" && !e._unplaced);
  let found = 0;
  for (let a = 0; a < rooms.length; a++) {
    for (let b = a + 1; b < rooms.length; b++) {
      const r1 = rooms[a]!;
      const r2 = rooms[b]!;
      const b1 = { x: r1.at.x, y: r1.at.y, w: r1.size.w, h: r1.size.h };
      const b2 = { x: r2.at.x, y: r2.at.y, w: r2.size.w, h: r2.size.h };
      const overlapping =
        r1.poly || r2.poly
          ? rectsOverlap(b1, b2) && polygonsOverlap(r1.poly ?? rectRing(b1), r2.poly ?? rectRing(b2))
          : rectsOverlap(b1, b2);
      if (!overlapping) continue;
      found++;
      if (found <= MAX_OVERLAP_PAIRS_LISTED) {
        diagnostics.push({
          severity: "warning",
          message: `Rooms "${r1.id}" and "${r2.id}" overlap`,
          code: "W_ROOM_OVERLAP",
          span: r2.span,
        });
      }
    }
  }
  if (found > MAX_OVERLAP_PAIRS_LISTED) {
    diagnostics.push({
      severity: "warning",
      message: `…and ${found - MAX_OVERLAP_PAIRS_LISTED} more room pairs overlap (first ${MAX_OVERLAP_PAIRS_LISTED} listed)`,
      code: "W_ROOM_OVERLAP",
    });
  }
}

/** The count the double loop makes, without the cap. */
function countPairsBefore(boxes: readonly BBox[]): number {
  let n = 0;
  for (let a = 0; a < boxes.length; a++)
    for (let b = a + 1; b < boxes.length; b++) if (rectsOverlap(boxes[a]!, boxes[b]!)) n++;
  return n;
}

/* ---------------------------------------------------------------------------
 * Harness
 * ------------------------------------------------------------------------- */

/** What the three forms say about `elements`, and how much of the new path it reached. */
interface Outcome {
  same: boolean;
  diagnostics: number;
  counted: boolean;
}

const run = (rule: (e: ResolvedElement[], d: Diagnostic[]) => void, elements: ResolvedElement[]): Diagnostic[] => {
  const d: Diagnostic[] = [];
  rule(elements, d);
  return d;
};

/** Compare the three forms; `pairs` false skips the double loop (too slow for a large pile). */
function compare(elements: ResolvedElement[], pairs = true): Outcome {
  const now = run(checkRoomOverlaps, elements);
  const grid = run(checkRoomOverlapsGrid, elements);
  expect(now).toStrictEqual(grid);
  if (pairs) expect(grid).toStrictEqual(run(checkRoomOverlapsPairs, elements));
  return {
    same: true,
    diagnostics: now.length,
    counted: now.length > MAX_OVERLAP_PAIRS_LISTED,
  };
}

let seq = 0;
/** A resolved room as the rule reads it: id, span, the box and (optionally) a ring. */
function room(at: Point, size: { w: number; h: number }, poly?: Point[], unplaced = false): RRoom {
  const i = seq++;
  return {
    kind: "room",
    id: `r${i}`,
    span: { start: i, end: i + 1 },
    at,
    size,
    ...(poly ? { poly } : {}),
    ...(unplaced ? { _unplaced: true as const } : {}),
  } as RRoom;
}

/** A polygon room whose `at`/`size` is its ring's box, as the resolver records it. */
function polyRoom(ring: Point[], dx = 0, dy = 0): RRoom {
  const pts = ring.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return room({ x, y }, { w: Math.max(...xs) - x, h: Math.max(...ys) - y }, pts);
}

const L_RING: Point[] = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 1500 },
  { x: 2000, y: 1500 },
  { x: 2000, y: 3000 },
  { x: 0, y: 3000 },
];
/** The L mirrored left to right: the same bounding box, the notch on the other side. */
const L_MIRROR: Point[] = L_RING.map((p) => ({ x: 4000 - p.x, y: p.y }));
const circleRing = (r: number): Point[] =>
  Array.from({ length: 48 }, (_, k) => ({
    x: r + r * Math.cos((2 * Math.PI * k) / 48),
    y: r + r * Math.sin((2 * Math.PI * k) / 48),
  }));

/* ---------------------------------------------------------------------------
 * The corpus
 * ------------------------------------------------------------------------- */

function corpus(): { name: string; src: string; world: World }[] {
  const out: { name: string; src: string; world: World }[] = [];
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
  for (const d of [
    "examples",
    "test/fixtures",
    "test/recovery-corpus",
    "eval/goldens",
    "eval/faults",
    "eval/fidelity-plans",
  ])
    for (const p of walk(join(ROOT, d), (f) => f.endsWith(".arch")))
      out.push({ name: p, src: readFileSync(p, "utf8"), world: worldFor(dirname(p)) });
  const md = [
    ...walk(join(ROOT, "docs"), (f) => f.endsWith(".md")),
    ...readdirSync(ROOT)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(ROOT, f)),
  ];
  for (const p of md)
    for (const b of extractArchBlocks(readFileSync(p, "utf8")))
      out.push({ name: `${p}#${b.index}`, src: b.source, world: NULL_WORLD });
  return out;
}

describe("W_ROOM_OVERLAP: the class pass against the grid pass and the double loop", () => {
  it("every storey of the corpus: the same diagnostics, byte for byte", () => {
    let storeys = 0;
    let rooms = 0;
    let withOverlap = 0;
    let withPoly = 0;
    for (const c of corpus()) {
      const { plan: ast } = parse(c.src, BUILTIN_REGISTRY);
      if (!ast) continue;
      const res = resolveAll(link(ast, c.world, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, c.world);
      const irs = res.levels.length > 0 ? res.levels.map((l) => l.ir) : [res.ir];
      for (const ir of irs) {
        const o = compare(ir.elements);
        storeys++;
        const rs = ir.elements.filter((e) => e.kind === "room");
        rooms += rs.length;
        if (rs.some((r) => (r as RRoom).poly)) withPoly++;
        if (o.diagnostics > 0) withOverlap++;
      }
    }
    // Not vacuous: the corpus is there (283 storeys, 499 rooms when this was written), one
    // storey of it overlaps and 13 have polygon rooms. The piles below are what crosses the cap.
    expect(storeys).toBeGreaterThan(250);
    expect(rooms).toBeGreaterThan(400);
    expect(withOverlap).toBeGreaterThanOrEqual(1);
    expect(withPoly).toBeGreaterThan(10);
  }, 120_000);

  it("piles of coincident rooms on both sides of the listing cap", () => {
    let counted = 0;
    // 20 coincident rooms are 190 pairs (all listed), 21 are 210 (the cap, then the count).
    for (const n of [0, 1, 2, 19, 20, 21, 22, 40, 80]) {
      const rect = Array.from({ length: n }, () => room({ x: 0, y: 0 }, { w: 4000, h: 3000 }));
      if (compare(rect).counted) counted++;
      // Coincident L-shapes do not overlap one another (no ring point lies strictly inside the
      // other), so the class is tested once and nothing is listed; circles do.
      compare(Array.from({ length: n }, () => polyRoom(L_RING)));
      if (compare(Array.from({ length: n }, () => polyRoom(circleRing(1500)))).counted) counted++;
      // A rectangle in an L's notch, piled: polygon–rectangle classes, both directions.
      const mixed: RRoom[] = [];
      for (let k = 0; k < n; k++) {
        mixed.push(polyRoom(L_RING));
        // Same box as the L, other ring: only the ring tells their answers apart.
        mixed.push(polyRoom(L_MIRROR));
        mixed.push(room({ x: 2000, y: 1500 }, { w: 2000, h: 1500 }));
        mixed.push(room({ x: 1000, y: 1000 }, { w: 2000, h: 1500 }));
      }
      if (compare(mixed).counted) counted++;
    }
    expect(counted).toBeGreaterThanOrEqual(10);
  }, 120_000);

  it("near-coincident and overlapping rooms: distinct boxes, all in one cell", () => {
    const shifted = Array.from({ length: 300 }, (_, i) => room({ x: i, y: i / 4 }, { w: 4000, h: 3000 }));
    expect(compare(shifted).counted).toBe(true);
    const slivers = Array.from({ length: 300 }, (_, i) => room({ x: i * 1.5, y: 0 }, { w: 2, h: 3000 }));
    compare(slivers);
    const polys = Array.from({ length: 120 }, (_, i) => polyRoom(L_RING, i * 7, i * 3));
    expect(compare(polys).counted).toBe(true);
    // Unplaced rooms are skipped by every form.
    const unplaced = Array.from({ length: 40 }, (_, i) =>
      room({ x: 0, y: 0 }, { w: 4000, h: 3000 }, undefined, i % 2 === 0),
    );
    compare(unplaced);
  }, 120_000);

  it("a large pile against the grid pass only (the double loop is the slow part)", () => {
    const pile = Array.from({ length: 450 }, (_, i) =>
      i % 3 === 0 ? polyRoom(circleRing(1500)) : room({ x: i % 7, y: 0 }, { w: 4000, h: 3000 }),
    );
    expect(compare(pile, false).counted).toBe(true);
  }, 120_000);

  it("property: piles drawn from a few random rooms (ties, -0, the 1 mm threshold)", () => {
    const coord = fc.constantFrom(-0, 0, 0.1, 0.5, 1, 1 + 2 ** -52, 1.5, 2, 2.1, 3, 1000, 1e15, 1e15 + 2);
    const ext = fc.constantFrom(0, 0.5, 1, 1 + 2 ** -52, 1.1, 2, 3, 1000, 4000, 4000, 4000);
    const ring = fc.constantFrom(L_RING, L_MIRROR, circleRing(500), rectRing({ x: 0, y: 0, w: 1000, h: 1000 }));
    // A room is a recipe, so the same recipe drawn twice is two rooms with equal geometry.
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
      .tuple(fc.array(recipe, { minLength: 1, maxLength: 6 }), fc.array(fc.nat(), { maxLength: 70, size: "max" }))
      .map(([palette, picks]) => picks.map((k) => palette[k % palette.length]!()));
    let counted = 0;
    let listed = 0;
    fc.assert(
      fc.property(pile, (rooms) => {
        const o = compare(rooms);
        if (o.counted) counted++;
        if (o.diagnostics > 0) listed++;
      }),
      { numRuns: 400, seed: 19 },
    );
    expect(counted).toBeGreaterThan(20);
    expect(listed).toBeGreaterThan(100);
  }, 120_000);
});

describe("countOverlappingRectPairs against the double loop", () => {
  it("property: the same count, including ties, -0 and a difference rounding to exactly 1", () => {
    const coord = fc.constantFrom(-0, 0, 0.1, 0.2, 0.3, 1, 1 + 2 ** -52, 1.1, 2, 1e15, 1e15 + 1, 1e15 + 2, -1e15);
    const ext = fc.constantFrom(0, 0.9, 1, 1 + 2 ** -52, 1.1, 1.2, 2, 3, 1e15);
    const box = fc.tuple(coord, coord, ext, ext).map(([x, y, w, h]) => ({ x, y, w, h }));
    // Drawn from a small palette, so that equal boxes and near-misses are common.
    const boxes = fc
      .tuple(fc.array(box, { minLength: 1, maxLength: 8 }), fc.array(fc.nat(), { maxLength: 80, size: "max" }))
      .map(([palette, picks]) => picks.map((k) => palette[k % palette.length]!));
    let nonzero = 0;
    fc.assert(
      fc.property(boxes, (bs) => {
        const n = countPairsBefore(bs);
        expect(countOverlappingRectPairs(bs)).toBe(n);
        if (n > 0) nonzero++;
      }),
      { numRuns: 1000, seed: 1915 },
    );
    expect(nonzero).toBeGreaterThan(300);
  });

  it("refuses a non-finite box rather than answering", () => {
    expect(countOverlappingRectPairs([{ x: 0, y: 0, w: Number.POSITIVE_INFINITY, h: 1 }])).toBeUndefined();
    expect(countOverlappingRectPairs([{ x: Number.NaN, y: 0, w: 2, h: 2 }])).toBeUndefined();
  });

  it("5,000 coincident boxes: every one of the 12,497,500 pairs", () => {
    const boxes = Array.from({ length: 5000 }, () => ({ x: 0, y: 0, w: 4000, h: 3000 }));
    expect(countOverlappingRectPairs(boxes)).toBe((5000 * 4999) / 2);
  });
});
