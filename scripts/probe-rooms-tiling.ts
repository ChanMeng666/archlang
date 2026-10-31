/**
 * The tiling-precondition probe for `walls from rooms` (ADR 0028 Acceptance, first bullet; plan
 * card PS3.0 part A) — MEASURES, NEVER BUILDS THE FORM.
 *
 * For every storey of every corpus `.arch`, and for each group in it (the root plan, and each
 * `place`d instance on its own, ADR 0028 "Scope across instances"), it takes the rooms the group
 * declares and decides, exactly on the resolved integer coordinates, the four preconditions of
 * ADR 0028 §3 that need no clause:
 *
 *  - `E_ROOMS_OVERLAP`        two rooms of the set overlap with positive area;
 *  - `E_ROOMS_NOT_TILING`     the union is more than one edge-connected component (a corner touch
 *                             does not connect), has a hole not covered exactly by `outdoor`
 *                             surfaces or by a `void` of the same group, or is pinched (touches
 *                             itself or its hole at a single vertex);
 *  - `E_PARTITION_TOO_SHORT`  a shared edge run is shorter than the partition thickness;
 *  - `E_ROOM_NOT_RECTANGLE`   a `polygon` or `circle` room is in the set. The form has since taken
 *                             rectilinear polygons in (card L1); the probe still counts every
 *                             polygon, so its totals stay the ones ADR 0028's Acceptance read.
 *
 * No tolerance anywhere: every comparison is `===`/`<` on the resolved coordinates.
 *
 * The decision runs on a compressed cell grid: the distinct x and y edge coordinates of the
 * group's rooms and covers cut the plane into cells, each cell is covered by a set of rooms, and
 * connectivity, holes and pinches are read off that grid (4-neighbour connectivity for floor;
 * a vertex whose four cells alternate covered/uncovered is a pinch). Every sweep is charged to the
 * evaluator's step meter (`withStepMeter`, `MAX_EVAL_STEPS`) BEFORE it allocates, so a group too
 * large to decide is reported as `budget` rather than hanging the test.
 *
 * Run: `npx tsx scripts/probe-rooms-tiling.ts [--json] [--no-except]` (prints the report).
 * The reviewed exclusion list is `scripts/probe-rooms-tiling.except.json`; figure (b) applies it.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePlan } from "../src/analyze.js";
import { makeNodeWorld } from "../src/cli/io.js";
import { chargeSteps, withStepMeter } from "../src/expr.js";
import type { ResolvedPlan, RRoom, RWall, RVoid, ROutdoor } from "../src/ir.js";
import type { Point } from "../src/ast.js";
import type { World } from "../src/world.js";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The corpus directories, in report order. Each is walked recursively. Every directory of
 * tracked `.arch` plans is here except the informational one below; `arch` fences in Markdown are
 * left out because they are the byte-identity baseline's corpus (fragments and `arch static` error
 * demos), not plans. The agent gallery's plans are left out too: they are deliberately outside the
 * language's pinned corpus, and `test/agent-gallery.test.ts` forbids any script or test reading
 * them (a compiler change may redraw them freely).
 */
export const CORPUS_DIRS = [
  "examples", // the shipped examples (minus `examples/lib`, see CORPUS_SKIPS)
  "test/defect-corpus", // audit defects and their clean twins, each a whole plan
  "test/recovery-corpus", // whole plans the recovery tests start from
  "test/fixtures", // whole-plan fixtures
  "docs/plans/plan-soundness/repro", // the plan-soundness reproductions (incl. the widening drill)
  "eval/goldens", // the eval golden plans
  "eval/fidelity-plans", // the eval fidelity plans
  "eval/faults", // seeded lint faults: still whole plans, so their rooms count
  "test/main-entrance-fixtures", // single-feature fixtures, but whole plans
  "test/callout-fixtures", // as above
  "test/finish-fixtures", // as above
  "test/resolve-order", // resolve-order law plans; those that do not resolve are skipped and listed
] as const;

/**
 * Directories probed for information only, never in the headline: the first-contact plans are
 * AI-written plans from an audit (the research note's caveat names them as the check that a new
 * author also writes tilings), outside the corpus list the Acceptance names.
 */
export const INFO_DIRS = ["docs/plans/plan-soundness/audits/first-contact-plans"] as const;

/** Paths under a corpus directory that are not plans, with the reason (reported). */
export const CORPUS_SKIPS: Record<string, string> = {
  "examples/lib": "component libraries imported by other examples, not plans (their rooms are probed where placed)",
};

/** Default partition thickness when a group draws no `partition` wall. */
export const DEFAULT_PARTITION_MM = 100;

export type Code = "E_ROOMS_OVERLAP" | "E_ROOMS_NOT_TILING" | "E_PARTITION_TOO_SHORT" | "E_ROOM_NOT_RECTANGLE";
export const CODES: readonly Code[] = [
  "E_ROOMS_OVERLAP",
  "E_ROOMS_NOT_TILING",
  "E_PARTITION_TOO_SHORT",
  "E_ROOM_NOT_RECTANGLE",
];

export interface ExceptEntry {
  /** Repo-relative path, `/`-separated. */
  file: string;
  /** The storey's level number; absent for a single-storey plan or "every storey". */
  level?: number;
  /** The `place` instance path; absent or "" for the root group. */
  group?: string;
  room: string;
  /** `no-use-outdoor`: the room declares no use kind, which ADR 0028 reads as outdoor (the
   *  probe checks the room really has no `uses`). `not-enclosed-floor`: the room is declared
   *  but is not part of the enclosed floor the walls would bound; `reason` says why. */
  rule: "no-use-outdoor" | "not-enclosed-floor";
  reason: string;
}

export interface Refusal {
  code: Code;
  rooms: string[];
  why: string;
}

export interface GroupResult {
  group: string;
  rooms: number;
  excluded: string[];
  partitionMm: number;
  refusals: Refusal[];
  /** Present when the group passes: what the form would derive. */
  derived?: { partitionRuns: number; ringVertices: number; coexisting: number };
  /** Set when the sweep crossed the step budget (counted as refused, code-less). */
  budget?: true;
  /** A note that changes how to read the result (e.g. tiling undecided). */
  note?: string;
  /** Rooms that resolved `_unplaced`, dropped from the set (reported, never silent). */
  unplaced?: string[];
  /** Non-rectilinear `outdoor` polygons dropped from the covers (they cover no cell exactly). */
  droppedCovers?: number;
}

export interface StoreyResult {
  file: string;
  dir: string;
  level: number | null;
  groups: GroupResult[];
}

export interface FileFailure {
  file: string;
  dir: string;
  reason: string;
}

// ---------------------------------------------------------------------------------------------
// Corpus

function walk(abs: string, out: string[]): void {
  for (const name of readdirSync(abs).sort()) {
    const p = join(abs, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".arch")) out.push(p);
  }
}

export function corpusFiles(root = ROOT, dirs: readonly string[] = CORPUS_DIRS): Array<{ dir: string; file: string }> {
  const out: Array<{ dir: string; file: string }> = [];
  for (const dir of dirs) {
    const files: string[] = [];
    walk(join(root, dir), files);
    for (const f of files) {
      const rel = relative(root, f).split(sep).join("/");
      if (Object.keys(CORPUS_SKIPS).some((s) => rel.startsWith(s + "/"))) continue;
      out.push({ dir, file: rel });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Geometry

interface RoomIn {
  id: string;
  /** Rectangle, half-open on nothing: [x0,x1]×[y0,y1]. */
  rect?: { x0: number; y0: number; x1: number; y1: number };
  /** A polygon room's ring (rectilinear or not). */
  poly?: Point[];
  circle?: true;
  uses: boolean;
}

interface CoverIn {
  kind: "outdoor" | "void";
  rect?: { x0: number; y0: number; x1: number; y1: number };
  poly?: Point[];
}

interface Seg {
  a: Point;
  b: Point;
}

const rectilinear = (ring: Point[]): boolean =>
  ring.every((p, i) => {
    const q = ring[(i + 1) % ring.length]!;
    return p.x === q.x || p.y === q.y;
  });

/** Exact even-odd test of a point that never lies on an edge (cell centres vs grid-line edges). */
function inRing(px: number, py: number, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > py !== b.y > py) {
      const x = a.x + ((py - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (px < x) inside = !inside;
    }
  }
  return inside;
}

function lowerIndex(xs: number[], v: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The cells (flat indices) a rectangle or rectilinear ring covers on the grid. */
function rasterise(shape: { rect?: RoomIn["rect"]; poly?: Point[] }, xs: number[], ys: number[]): number[] {
  const nx = xs.length - 1;
  const box = shape.rect ?? {
    x0: Math.min(...shape.poly!.map((p) => p.x)),
    x1: Math.max(...shape.poly!.map((p) => p.x)),
    y0: Math.min(...shape.poly!.map((p) => p.y)),
    y1: Math.max(...shape.poly!.map((p) => p.y)),
  };
  const i0 = lowerIndex(xs, box.x0);
  const i1 = lowerIndex(xs, box.x1);
  const j0 = lowerIndex(ys, box.y0);
  const j1 = lowerIndex(ys, box.y1);
  chargeSteps((i1 - i0) * (j1 - j0) * (shape.rect ? 1 : 1 + (shape.poly?.length ?? 0)));
  const cells: number[] = [];
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) {
      if (shape.poly && !inRing((xs[i]! + xs[i + 1]!) / 2, (ys[j]! + ys[j + 1]!) / 2, shape.poly)) continue;
      cells.push(j * nx + i);
    }
  }
  return cells;
}

/** The authored straight wall segments of a group (arc segments are never collinear with a run). */
function wallSegments(walls: RWall[]): Seg[] {
  const out: Seg[] = [];
  for (const w of walls) {
    const n = w.points.length;
    const last = w.closed ? n : n - 1;
    for (let k = 0; k < last; k++) {
      if (w.arcs?.[k]) continue;
      out.push({ a: w.points[k]!, b: w.points[(k + 1) % n]! });
    }
  }
  return out;
}

/** True when two axis-aligned segments lie on one line and overlap with positive length. */
function collinearOverlap(s: Seg, t: Seg): boolean {
  if (s.a.y === s.b.y && t.a.y === t.b.y && s.a.y === t.a.y && s.a.x !== s.b.x && t.a.x !== t.b.x) {
    const lo = Math.max(Math.min(s.a.x, s.b.x), Math.min(t.a.x, t.b.x));
    const hi = Math.min(Math.max(s.a.x, s.b.x), Math.max(t.a.x, t.b.x));
    return hi > lo;
  }
  if (s.a.x === s.b.x && t.a.x === t.b.x && s.a.x === t.a.x && s.a.y !== s.b.y && t.a.y !== t.b.y) {
    const lo = Math.max(Math.min(s.a.y, s.b.y), Math.min(t.a.y, t.b.y));
    const hi = Math.min(Math.max(s.a.y, s.b.y), Math.max(t.a.y, t.b.y));
    return hi > lo;
  }
  return false;
}

/**
 * Decide the four preconditions for one group. Pure; charges the step meter before each sweep.
 */
export function decideGroup(
  rooms: RoomIn[],
  covers: CoverIn[],
  walls: Seg[],
  tInt: number,
): {
  refusals: Refusal[];
  derived?: { partitionRuns: number; ringVertices: number; coexisting: number };
  note?: string;
} {
  const refusals: Refusal[] = [];
  const n = rooms.length;
  const nonRect = rooms.filter((r) => !r.rect);
  if (nonRect.length > 0) {
    refusals.push({
      code: "E_ROOM_NOT_RECTANGLE",
      rooms: nonRect.map((r) => r.id),
      why: nonRect.map((r) => `${r.id} is a ${r.circle ? "circle" : "polygon"} room`).join("; "),
    });
  }
  // A non-rectilinear polygon or a circle covers no cell exactly, so tiling cannot be decided
  // around it; it is refused above on its own code either way.
  const rasterisable = rooms.filter((r) => r.rect || (r.poly && !r.circle && rectilinear(r.poly)));
  const tilingDecidable = rasterisable.length === n;

  // --- the compressed grid --------------------------------------------------------------------
  const xsSet = new Set<number>();
  const ysSet = new Set<number>();
  const addShape = (s: { rect?: RoomIn["rect"]; poly?: Point[] }): void => {
    if (s.rect) {
      xsSet.add(s.rect.x0).add(s.rect.x1);
      ysSet.add(s.rect.y0).add(s.rect.y1);
    } else {
      for (const p of s.poly!) {
        xsSet.add(p.x);
        ysSet.add(p.y);
      }
    }
  };
  const coverShapes = covers.filter((c) => c.rect || (c.poly && rectilinear(c.poly)));
  chargeSteps(4 * (rasterisable.length + coverShapes.length) + 1);
  for (const r of rasterisable) addShape(r);
  for (const c of coverShapes) addShape(c);
  const xs = [...xsSet].sort((a, b) => a - b);
  const ys = [...ysSet].sort((a, b) => a - b);
  chargeSteps(Math.ceil((xs.length + ys.length) * Math.log2(xs.length + ys.length + 2)));
  const nx = Math.max(0, xs.length - 1);
  const ny = Math.max(0, ys.length - 1);
  const N = nx * ny;
  chargeSteps(3 * N + 1); // owner + count + cover arrays
  const count = new Int32Array(N);
  const owner = new Int32Array(N).fill(-1);
  const coverMask = new Uint8Array(N);

  // --- overlap (positive area) ----------------------------------------------------------------
  const overlapPairs = new Map<string, [number, number]>();
  rasterisable.forEach((r, k) => {
    const cells = rasterise(r, xs, ys);
    for (const c of cells) {
      if (count[c]! > 0) {
        const o = owner[c]!;
        const key = `${o}:${k}`;
        if (!overlapPairs.has(key)) overlapPairs.set(key, [o, k]);
      } else owner[c] = k;
      count[c]!++;
    }
  });
  if (overlapPairs.size > 0) {
    const pairs = [...overlapPairs.values()];
    refusals.push({
      code: "E_ROOMS_OVERLAP",
      rooms: [...new Set(pairs.flat().map((k) => rasterisable[k]!.id))],
      why: pairs.map(([a, b]) => `${rasterisable[a]!.id} overlaps ${rasterisable[b]!.id}`).join("; "),
    });
  }

  // --- tiling: components, pinches, holes -----------------------------------------------------
  let ringVertices = 0;
  const ringEdges: Seg[] = [];
  if (tilingDecidable && N > 0) {
    const notTiling: string[] = [];
    const named = new Set<string>();
    const covered = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < nx && j < ny && count[j * nx + i]! > 0;
    chargeSteps(4 * N + (nx + 1) * (ny + 1));
    // floor components (4-neighbour)
    const comp = new Int32Array(N).fill(-1);
    const compRoom: number[] = [];
    const stack: number[] = [];
    for (let c = 0; c < N; c++) {
      if (count[c]! === 0 || comp[c]! !== -1) continue;
      const id = compRoom.length;
      compRoom.push(owner[c]!);
      comp[c] = id;
      stack.push(c);
      while (stack.length) {
        const cur = stack.pop()!;
        const i = cur % nx;
        const j = (cur - i) / nx;
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          if (!covered(i + di, j + dj)) continue;
          const nb = (j + dj) * nx + i + di;
          if (comp[nb]! === -1) {
            comp[nb] = id;
            stack.push(nb);
          }
        }
      }
    }
    if (compRoom.length > 1) {
      const ids = compRoom.map((k) => rasterisable[k]!.id);
      for (const x of ids) named.add(x);
      notTiling.push(`${compRoom.length} edge-connected components (one room each: ${ids.join(", ")})`);
    }
    // pinches: a vertex whose four cells alternate
    const pinches: string[] = [];
    for (let j = 1; j < ny; j++) {
      for (let i = 1; i < nx; i++) {
        const nw = covered(i - 1, j - 1);
        const ne = covered(i, j - 1);
        const sw = covered(i - 1, j);
        const se = covered(i, j);
        if (nw === se && ne === sw && nw !== ne) {
          pinches.push(`(${xs[i]},${ys[j]})`);
          for (const [a, b] of [
            [i - 1, j - 1],
            [i, j - 1],
            [i - 1, j],
            [i, j],
          ] as const) {
            if (covered(a, b)) named.add(rasterisable[owner[b * nx + a]!]!.id);
          }
        }
      }
    }
    if (pinches.length > 0)
      notTiling.push(`pinched at ${pinches.slice(0, 4).join(" ")}${pinches.length > 4 ? " …" : ""}`);
    // holes: empty cells not reachable from the outside through edge-adjacent empty cells
    const outside = new Uint8Array(N);
    for (let c = 0; c < N; c++) {
      const i = c % nx;
      const j = (c - i) / nx;
      if (count[c]! === 0 && (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) && !outside[c]) {
        outside[c] = 1;
        stack.push(c);
        while (stack.length) {
          const cur = stack.pop()!;
          const ci = cur % nx;
          const cj = (cur - ci) / nx;
          for (const [di, dj] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const a = ci + di;
            const b = cj + dj;
            if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
            const nb = b * nx + a;
            if (count[nb]! === 0 && !outside[nb]) {
              outside[nb] = 1;
              stack.push(nb);
            }
          }
        }
      }
    }
    // covers, rasterised; each cover is "exact" for a hole only if all its cells lie in that hole
    const coverCells = coverShapes.map((s) => rasterise(s, xs, ys));
    coverShapes.forEach((s, k) => {
      for (const c of coverCells[k]!) coverMask[c]! |= s.kind === "outdoor" ? 1 : 2;
    });
    const hole = new Int32Array(N).fill(-1);
    const holes: number[][] = [];
    for (let c = 0; c < N; c++) {
      if (count[c]! !== 0 || outside[c] || hole[c]! !== -1) continue;
      const id = holes.length;
      const cells: number[] = [c];
      hole[c] = id;
      stack.push(c);
      while (stack.length) {
        const cur = stack.pop()!;
        const ci = cur % nx;
        const cj = (cur - ci) / nx;
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const a = ci + di;
          const b = cj + dj;
          if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
          const nb = b * nx + a;
          if (count[nb]! === 0 && hole[nb]! === -1) {
            hole[nb] = id;
            cells.push(nb);
            stack.push(nb);
          }
        }
      }
      holes.push(cells);
    }
    const voidHoleCell = new Uint8Array(N);
    const coverCellTotal = coverCells.reduce((k, cs) => k + cs.length, 0);
    holes.forEach((cells, id) => {
      chargeSteps(cells.length + coverCellTotal + 1);
      const masks = new Set(cells.map((c) => coverMask[c]!));
      const allCovered = !masks.has(0);
      const oneKind = masks.size === 1 && (masks.has(1) || masks.has(2));
      const exact = coverShapes.every((_, k) => {
        const cs = coverCells[k]!;
        const inHole = cs.filter((c) => hole[c] === id).length;
        return inHole === 0 || inHole === cs.length;
      });
      if (allCovered && oneKind && exact) {
        if (masks.has(2)) for (const c of cells) voidHoleCell[c] = 1;
        return;
      }
      const bounding = new Set<string>();
      for (const c of cells) {
        const i = c % nx;
        const j = (c - i) / nx;
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          if (covered(i + di, j + dj)) bounding.add(rasterisable[owner[(j + dj) * nx + i + di]!]!.id);
        }
      }
      let x0 = Infinity,
        x1 = -Infinity,
        y0 = Infinity,
        y1 = -Infinity;
      for (const c of cells) {
        const i = c % nx;
        const j = (c - i) / nx;
        x0 = Math.min(x0, xs[i]!);
        x1 = Math.max(x1, xs[i + 1]!);
        y0 = Math.min(y0, ys[j]!);
        y1 = Math.max(y1, ys[j + 1]!);
      }
      for (const x of bounding) named.add(x);
      const state = !allCovered
        ? masks.size > 1
          ? "partly covered"
          : "uncovered"
        : !oneKind
          ? "covered by both outdoor and void"
          : "covered, but a cover spills past it";
      notTiling.push(`hole x ${x0}–${x1}, y ${y0}–${y1} ${state} (bounded by ${[...bounding].join(", ")})`);
    });
    if (notTiling.length > 0) {
      refusals.push({ code: "E_ROOMS_NOT_TILING", rooms: [...named], why: notTiling.join("; ") });
    } else {
      // ring vertices: a vertex whose four cells hold one or three floor cells (no pinch left);
      // a void counts as floor here, because no ring is derived round it
      const solid = (i: number, j: number): boolean =>
        covered(i, j) || (i >= 0 && j >= 0 && i < nx && j < ny && voidHoleCell[j * nx + i] === 1);
      for (let j = 0; j <= ny; j++) {
        for (let i = 0; i <= nx; i++) {
          const k = +solid(i - 1, j - 1) + +solid(i, j - 1) + +solid(i - 1, j) + +solid(i, j);
          if (k === 1 || k === 3) ringVertices++;
        }
      }
      // ring edges (unit cell edges between floor and non-floor, none round a void)
      const wall = (i: number, j: number): boolean =>
        !covered(i, j) && !(i >= 0 && j >= 0 && i < nx && j < ny && voidHoleCell[j * nx + i]);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i <= nx; i++) {
          if (covered(i - 1, j) !== covered(i, j) && (covered(i - 1, j) ? wall(i, j) : wall(i - 1, j))) {
            ringEdges.push({ a: { x: xs[i]!, y: ys[j]! }, b: { x: xs[i]!, y: ys[j + 1]! } });
          }
        }
      }
      for (let j = 0; j <= ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (covered(i, j - 1) !== covered(i, j) && (covered(i, j - 1) ? wall(i, j) : wall(i, j - 1))) {
            ringEdges.push({ a: { x: xs[i]!, y: ys[j]! }, b: { x: xs[i + 1]!, y: ys[j]! } });
          }
        }
      }
    }
  }

  // --- shared runs (rectangles only) ----------------------------------------------------------
  const rects = rooms.filter((r) => r.rect);
  chargeSteps(rects.length * rects.length + 1);
  const runs: Array<{ a: string; b: string; seg: Seg; len: number }> = [];
  for (let p = 0; p < rects.length; p++) {
    for (let q = p + 1; q < rects.length; q++) {
      const A = rects[p]!.rect!;
      const B = rects[q]!.rect!;
      for (const [line, lo, hi, vertical] of [
        ...(A.x1 === B.x0 ? [[A.x1, Math.max(A.y0, B.y0), Math.min(A.y1, B.y1), true] as const] : []),
        ...(A.x0 === B.x1 ? [[A.x0, Math.max(A.y0, B.y0), Math.min(A.y1, B.y1), true] as const] : []),
        ...(A.y1 === B.y0 ? [[A.y1, Math.max(A.x0, B.x0), Math.min(A.x1, B.x1), false] as const] : []),
        ...(A.y0 === B.y1 ? [[A.y0, Math.max(A.x0, B.x0), Math.min(A.x1, B.x1), false] as const] : []),
      ]) {
        if (hi <= lo) continue;
        const seg: Seg = vertical
          ? { a: { x: line, y: lo }, b: { x: line, y: hi } }
          : { a: { x: lo, y: line }, b: { x: hi, y: line } };
        runs.push({ a: rects[p]!.id, b: rects[q]!.id, seg, len: hi - lo });
      }
    }
  }
  const short = runs.filter((r) => r.len < tInt);
  if (short.length > 0) {
    refusals.push({
      code: "E_PARTITION_TOO_SHORT",
      rooms: [...new Set(short.flatMap((r) => [r.a, r.b]))],
      why: short
        .map(
          (r) =>
            `${r.a}|${r.b} run ${r.len} mm < ${tInt} mm at (${r.seg.a.x},${r.seg.a.y})–(${r.seg.b.x},${r.seg.b.y})`,
        )
        .join("; "),
    });
  }

  if (refusals.length > 0) {
    return {
      refusals,
      ...(tilingDecidable ? {} : { note: "tiling undecided: a non-rectilinear room covers no cell exactly" }),
    };
  }
  // --- coexistence: authored wall segments collinear with a derived segment -------------------
  const derivedSegs = [...runs.map((r) => r.seg), ...ringEdges];
  chargeSteps(walls.length * derivedSegs.length + 1);
  let coexisting = 0;
  for (const w of walls) if (derivedSegs.some((d) => collinearOverlap(w, d))) coexisting++;
  return { refusals, derived: { partitionRuns: runs.length, ringVertices, coexisting } };
}

// ---------------------------------------------------------------------------------------------
// Plans

function roomIn(r: RRoom): RoomIn {
  const uses = !!r.uses && r.uses.length > 0;
  if (r.circle) return { id: r.id, circle: true, poly: r.poly, uses };
  if (r.poly) return { id: r.id, poly: r.poly, uses };
  return { id: r.id, rect: { x0: r.at.x, y0: r.at.y, x1: r.at.x + r.size.w, y1: r.at.y + r.size.h }, uses };
}

function coverIn(e: RVoid | ROutdoor): CoverIn {
  if (e.kind === "outdoor" && e.poly) return { kind: "outdoor", poly: e.poly };
  return { kind: e.kind, rect: { x0: e.at.x, y0: e.at.y, x1: e.at.x + e.size.w, y1: e.at.y + e.size.h } };
}

/** The partition thickness a group's own partition walls say (most frequent; ties → thinner). */
function partitionThickness(walls: RWall[]): number {
  const freq = new Map<number, number>();
  for (const w of walls) if (w.category === "partition") freq.set(w.thickness, (freq.get(w.thickness) ?? 0) + 1);
  if (freq.size === 0) return DEFAULT_PARTITION_MM;
  return [...freq].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
}

function probeStorey(
  ir: ResolvedPlan,
  file: string,
  level: number | null,
  excepts: ExceptEntry[] | null,
  stale: Set<ExceptEntry>,
): GroupResult[] {
  const groups = new Map<
    string,
    { rooms: RRoom[]; covers: Array<RVoid | ROutdoor>; walls: RWall[]; unplaced: string[]; dropped: number }
  >();
  const get = (g: string) => {
    let v = groups.get(g);
    if (!v) {
      v = { rooms: [], covers: [], walls: [], unplaced: [], dropped: 0 };
      groups.set(g, v);
    }
    return v;
  };
  for (const e of ir.elements) {
    const g = e._instance ?? "";
    if (e.kind === "room") {
      // A room that ended unplaced has no position to tile with: dropped from the set, reported.
      if (e._unplaced) get(g).unplaced.push(e.id);
      else get(g).rooms.push(e);
    } else if (e.kind === "void" || e.kind === "outdoor") {
      // A non-rectilinear `outdoor` polygon covers no cell exactly: dropped from the covers, reported.
      if (e.kind === "outdoor" && e.poly && !rectilinear(e.poly)) get(g).dropped++;
      else get(g).covers.push(e);
    } else if (e.kind === "wall") get(g).walls.push(e);
  }
  const out: GroupResult[] = [];
  for (const [group, g] of [...groups].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    if (g.rooms.length === 0) continue;
    const mine = (excepts ?? []).filter(
      (x) => x.file === file && (x.level === undefined || x.level === level) && (x.group ?? "") === group,
    );
    const excluded: string[] = [];
    const set: RoomIn[] = [];
    for (const r of g.rooms) {
      const x = mine.find((m) => m.room === r.id);
      if (x) {
        stale.delete(x);
        if (x.rule === "no-use-outdoor" && r.uses && r.uses.length > 0) {
          throw new Error(
            `except list: ${file} ${r.id} has uses ${r.uses.join(" ")}, so "no-use-outdoor" does not apply`,
          );
        }
        excluded.push(r.id);
      } else set.push(roomIn(r));
    }
    const tInt = partitionThickness(g.walls);
    const base: GroupResult = {
      group,
      rooms: g.rooms.length,
      excluded,
      partitionMm: tInt,
      refusals: [],
      ...(g.unplaced.length ? { unplaced: g.unplaced } : {}),
      ...(g.dropped ? { droppedCovers: g.dropped } : {}),
    };
    if (set.length === 0) {
      out.push({ ...base, note: "every room excluded" });
      continue;
    }
    const run = withStepMeter(0, () => decideGroup(set, g.covers.map(coverIn), wallSegments(g.walls), tInt));
    if ("signal" in run) out.push({ ...base, budget: true, note: "step budget crossed" });
    else out.push({ ...base, ...run.value });
  }
  return out;
}

/** Probe one source: every storey's groups, or why it could not be probed. */
export function probeSource(
  src: string,
  opts: { file?: string; dir?: string; world?: World; excepts?: ExceptEntry[] | null; stale?: Set<ExceptEntry> } = {},
): StoreyResult[] | FileFailure {
  const file = opts.file ?? "<source>";
  const dir = opts.dir ?? "";
  const res = resolvePlan(src, opts.world ? { world: opts.world } : {});
  if (!res.ir) {
    const first = res.diagnostics.find((d) => d.severity === "error");
    return { file, dir, reason: `does not resolve (${first?.code ?? "error"})` };
  }
  const levels =
    res.levels.length > 0
      ? res.levels.map((l) => ({ level: l.level as number | null, ir: l.ir }))
      : [{ level: null, ir: res.ir }];
  return levels.map(({ level, ir }) => ({
    file,
    dir,
    level,
    groups: probeStorey(ir, file, level, opts.excepts ?? null, opts.stale ?? new Set()),
  }));
}

export interface ProbeReport {
  storeys: StoreyResult[];
  failures: FileFailure[];
}

/** Probe the whole corpus once, with (`excepts`) or without (`null`) the reviewed except list. */
export function probeCorpus(
  excepts: ExceptEntry[] | null,
  root = ROOT,
  dirs: readonly string[] = CORPUS_DIRS,
): ProbeReport {
  const storeys: StoreyResult[] = [];
  const failures: FileFailure[] = [];
  const stale = new Set(excepts ?? []);
  for (const { dir, file } of corpusFiles(root, dirs)) {
    const abs = join(root, file);
    const out = probeSource(readFileSync(abs, "utf8"), {
      file,
      dir,
      world: makeNodeWorld(dirname(abs)),
      excepts,
      stale,
    });
    if ("reason" in out) failures.push(out);
    else storeys.push(...out);
  }
  if (stale.size > 0) {
    throw new Error(`except list: ${[...stale].map((x) => `${x.file} ${x.room}`).join(", ")} matched no room`);
  }
  return { storeys, failures };
}

/** The per-group notes for rooms and covers the probe dropped (never silent). */
function droppedNotes(g: GroupResult): string[] {
  const at = g.group ? `[${g.group}] ` : "";
  return [
    ...(g.unplaced ? [`  - ${at}note: unplaced rooms dropped from the set: ${g.unplaced.join(", ")}`] : []),
    ...(g.droppedCovers
      ? [`  - ${at}note: ${g.droppedCovers} non-rectilinear outdoor polygon(s) dropped from the covers`]
      : []),
  ];
}

/**
 * The LITERAL reading of ADR 0028's "no use kind means outdoor": an except entry for every room
 * of the corpus that declares no use kind (informational figure only — the reviewed list applies
 * the rule per plan, because 70 of these rooms are enclosed floor).
 */
export function noUseExcepts(root = ROOT, dirs: readonly string[] = CORPUS_DIRS): ExceptEntry[] {
  const out: ExceptEntry[] = [];
  for (const { file } of corpusFiles(root, dirs)) {
    const abs = join(root, file);
    const res = resolvePlan(readFileSync(abs, "utf8"), { world: makeNodeWorld(dirname(abs)) });
    if (!res.ir) continue;
    const levels = res.levels.length
      ? res.levels.map((l) => ({ level: l.level as number | null, ir: l.ir }))
      : [{ level: null, ir: res.ir }];
    for (const { level, ir } of levels) {
      for (const e of ir.elements) {
        if (e.kind !== "room" || e._unplaced || (e.uses && e.uses.length > 0)) continue;
        out.push({
          file,
          ...(level === null ? {} : { level }),
          ...(e._instance ? { group: e._instance } : {}),
          room: e.id,
          rule: "no-use-outdoor",
          reason: "informational only: the literal reading",
        });
      }
    }
  }
  return out;
}

/** An except entry for every polygon/circle room a report refused (informational figure only). */
export function nonRectExcepts(r: ProbeReport): ExceptEntry[] {
  return r.storeys.flatMap((s) =>
    s.groups.flatMap((g) =>
      g.refusals
        .filter((x) => x.code === "E_ROOM_NOT_RECTANGLE")
        .flatMap((x) =>
          x.rooms.map((room) => ({
            file: s.file,
            ...(s.level === null ? {} : { level: s.level }),
            ...(g.group ? { group: g.group } : {}),
            room,
            rule: "not-enclosed-floor" as const,
            reason: "informational only: a polygon/circle room",
          })),
        ),
    ),
  );
}

export function loadExcepts(root = ROOT): ExceptEntry[] {
  const raw = JSON.parse(readFileSync(join(root, "scripts/probe-rooms-tiling.except.json"), "utf8")) as {
    entries: ExceptEntry[];
  };
  for (const e of raw.entries) {
    if (!e.reason || e.reason.trim().length < 10) throw new Error(`except list: ${e.file} ${e.room} has no reason`);
  }
  return raw.entries;
}

// ---------------------------------------------------------------------------------------------
// Summary

export const isRefused = (s: StoreyResult): boolean => s.groups.some((g) => g.refusals.length > 0 || g.budget);
/** A storey with at least one room in some group: the denominator. */
export const hasRooms = (s: StoreyResult): boolean => s.groups.length > 0;
export const storeyCodes = (s: StoreyResult): Set<Code> =>
  new Set(s.groups.flatMap((g) => g.refusals.map((r) => r.code)));

export interface DirRow {
  dir: string;
  storeys: number;
  noRooms: number;
  refusedA: number;
  refusedB: number;
  byCodeA: Record<Code, number>;
  byCodeB: Record<Code, number>;
}

const zero = (): Record<Code, number> => ({
  E_ROOMS_OVERLAP: 0,
  E_ROOMS_NOT_TILING: 0,
  E_PARTITION_TOO_SHORT: 0,
  E_ROOM_NOT_RECTANGLE: 0,
});

export function summarise(
  a: ProbeReport,
  b: ProbeReport,
): {
  rows: DirRow[];
  total: DirRow;
  shareA: { refused: number; storeys: number };
  shareB: { refused: number; storeys: number };
} {
  const rows: DirRow[] = CORPUS_DIRS.map((dir) => {
    const sa = a.storeys.filter((s) => s.dir === dir);
    const sb = b.storeys.filter((s) => s.dir === dir);
    const row: DirRow = {
      dir,
      storeys: sa.filter(hasRooms).length,
      noRooms: sa.filter((s) => !hasRooms(s)).length,
      refusedA: sa.filter(isRefused).length,
      refusedB: sb.filter(isRefused).length,
      byCodeA: zero(),
      byCodeB: zero(),
    };
    for (const s of sa) for (const c of storeyCodes(s)) row.byCodeA[c]++;
    for (const s of sb) for (const c of storeyCodes(s)) row.byCodeB[c]++;
    return row;
  });
  const total: DirRow = {
    dir: "total",
    storeys: 0,
    noRooms: 0,
    refusedA: 0,
    refusedB: 0,
    byCodeA: zero(),
    byCodeB: zero(),
  };
  for (const r of rows) {
    total.storeys += r.storeys;
    total.noRooms += r.noRooms;
    total.refusedA += r.refusedA;
    total.refusedB += r.refusedB;
    for (const c of CODES) {
      total.byCodeA[c] += r.byCodeA[c];
      total.byCodeB[c] += r.byCodeB[c];
    }
  }
  return {
    rows,
    total,
    shareA: { refused: total.refusedA, storeys: total.storeys },
    shareB: { refused: total.refusedB, storeys: total.storeys },
  };
}

const SHORT: Record<Code, string> = {
  E_ROOMS_OVERLAP: "overlap",
  E_ROOMS_NOT_TILING: "not tiling",
  E_PARTITION_TOO_SHORT: "short run",
  E_ROOM_NOT_RECTANGLE: "not rect",
};

const pct = (n: number, d: number): string => `${((100 * n) / d).toFixed(1)} %`;
const median = (xs: number[]): number => {
  const s = [...xs].sort((p, q) => p - q);
  if (s.length === 0) return 0;
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** The Markdown report (the PR body's tables). */
export function renderReport(a: ProbeReport, b: ProbeReport, excepts: ExceptEntry[]): string {
  const { rows, total, shareA, shareB } = summarise(a, b);
  const L: string[] = [];
  L.push(`| Directory | Storeys | Refused (a) | Refused (b) | ${CODES.map((c) => `${SHORT[c]} (a/b)`).join(" | ")} |`);
  L.push(`|---|---|---|---|${CODES.map(() => "---").join("|")}|`);
  for (const r of [...rows, total]) {
    L.push(
      `| ${r.dir === "total" ? "**total**" : `\`${r.dir}\``} | ${r.storeys} | ${r.refusedA} | ${r.refusedB} | ${CODES.map((c) => `${r.byCodeA[c]}/${r.byCodeB[c]}`).join(" | ")} |`,
    );
  }
  L.push("");
  L.push(`- Share (a), no exclusions: ${shareA.refused}/${shareA.storeys} = ${pct(shareA.refused, shareA.storeys)}`);
  L.push(
    `- Share (b), reviewed except list: ${shareB.refused}/${shareB.storeys} = ${pct(shareB.refused, shareB.storeys)}`,
  );
  L.push(`- (b) above a quarter (D5 reversal condition): ${shareB.refused * 4 > shareB.storeys ? "YES" : "no"}`);
  // §8 question 4 input: storeys refused ONLY for rectilinear polygon rooms (no circle, no
  // angled edge) whose tiling, overlap and run checks all passed with those rooms in the grid.
  const rectilinearOnly = b.storeys.filter(
    (s) =>
      isRefused(s) &&
      s.groups.every((g) => !g.budget && !g.note && g.refusals.every((r) => r.code === "E_ROOM_NOT_RECTANGLE")),
  );
  L.push(
    `- Of the (b) refusals, refused only for rectilinear polygon rooms that otherwise tile: ${rectilinearOnly.length}${rectilinearOnly.length ? ` (${rectilinearOnly.map((s) => s.file + (s.level === null ? "" : ` @${s.level}`)).join(", ")})` : ""}`,
  );
  const undecided = b.storeys.filter((s) => isRefused(s) && s.groups.some((g) => g.note && !g.budget));
  L.push(
    `- Of the (b) refusals, tiling undecided (a non-rectilinear polygon or circle room covers no cell exactly): ${undecided.length}`,
  );
  const groupsAll = a.storeys.flatMap((s) => s.groups);
  const withUnplaced = a.storeys.filter((s) => s.groups.some((g) => g.unplaced));
  const withDropped = a.storeys.filter((s) => s.groups.some((g) => g.droppedCovers));
  L.push(
    `- Unplaced rooms dropped from the set: ${groupsAll.reduce((k, g) => k + (g.unplaced?.length ?? 0), 0)} in ${withUnplaced.length} storeys${withUnplaced.length ? ` (${withUnplaced.map((s) => s.file + (s.level === null ? "" : ` @${s.level}`)).join(", ")})` : ""}`,
  );
  L.push(
    `- Non-rectilinear \`outdoor\` polygons dropped from the covers: ${groupsAll.reduce((k, g) => k + (g.droppedCovers ?? 0), 0)} in ${withDropped.length} storeys${withDropped.length ? ` (${withDropped.map((s) => s.file + (s.level === null ? "" : ` @${s.level}`)).join(", ")})` : ""}`,
  );
  const noRooms = a.storeys.filter((s) => !hasRooms(s));
  L.push(
    `- Storeys with no room in any group (not counted): ${noRooms.length}${noRooms.length ? ` (${noRooms.map((s) => s.file + (s.level === null ? "" : `@${s.level}`)).join(", ")})` : ""}`,
  );
  L.push(
    `- Files that do not resolve (not counted): ${a.failures.length}${a.failures.length ? ` (${a.failures.map((f) => `${f.file}: ${f.reason}`).join("; ")})` : ""}`,
  );
  const groupsA = a.storeys.flatMap((s) => s.groups);
  L.push(`- Groups probed: ${groupsA.length} (${groupsA.filter((g) => g.group !== "").length} \`place\`d instances)`);
  const tDist = new Map<number, number>();
  for (const g of groupsA) tDist.set(g.partitionMm, (tDist.get(g.partitionMm) ?? 0) + 1);
  L.push(
    `- Partition thickness used per group: ${[...tDist]
      .sort((p, q) => p[0] - q[0])
      .map(([t, k]) => `${t} mm × ${k}`)
      .join(", ")}`,
  );
  L.push("");
  // derived counts over storeys passing (b)
  const passing = b.storeys.filter((s) => hasRooms(s) && !isRefused(s));
  const perStorey = passing.map((s) => {
    const gs = s.groups.filter((g) => g.derived);
    const n = s.groups.reduce((k, g) => k + g.rooms - g.excluded.length, 0);
    return {
      runs: gs.reduce((k, g) => k + g.derived!.partitionRuns, 0),
      verts: gs.reduce((k, g) => k + g.derived!.ringVertices, 0),
      coexist: gs.reduce((k, g) => k + g.derived!.coexisting, 0),
      n,
    };
  });
  L.push(`Derived by the form on the ${passing.length} storeys that pass (b):`);
  L.push("");
  L.push("| Measure | Max | Median | Max ÷ ADR bound |");
  L.push("|---|---|---|---|");
  const runs = perStorey.map((p) => p.runs);
  const verts = perStorey.map((p) => p.verts);
  L.push(
    `| Partition runs (bound 6n) | ${Math.max(0, ...runs)} | ${median(runs)} | ${Math.max(0, ...perStorey.map((p) => p.runs / (6 * p.n))).toFixed(2)} |`,
  );
  L.push(
    `| Ring vertices (bound 4n) | ${Math.max(0, ...verts)} | ${median(verts)} | ${Math.max(0, ...perStorey.map((p) => p.verts / (4 * p.n))).toFixed(2)} |`,
  );
  L.push("");
  const co = perStorey.filter((p) => p.coexist > 0);
  L.push(
    `Coexistence: ${co.length} of ${passing.length} passing storeys have authored wall segments exactly collinear with a derived segment (${perStorey.reduce((k, p) => k + p.coexist, 0)} segments in all).`,
  );
  L.push("");
  L.push(`Except list (b): ${excepts.length} rooms.`);
  L.push("");
  if (excepts.length) {
    L.push("| File | Room | Rule | Reason |");
    L.push("|---|---|---|---|");
    for (const x of excepts)
      L.push(
        `| \`${x.file}\`${x.level === undefined ? "" : ` @${x.level}`}${x.group ? ` ${x.group}` : ""} | \`${x.room}\` | ${x.rule} | ${x.reason} |`,
      );
    L.push("");
  }
  L.push("Refused storeys (b), then the storeys only (a) refuses:");
  L.push("");
  const name = (s: StoreyResult) => `\`${s.file}\`${s.level === null ? "" : ` @${s.level}`}`;
  const lines = (s: StoreyResult): string[] =>
    s.groups.flatMap((g) => [
      ...g.refusals.map((r) => `  - ${g.group ? `[${g.group}] ` : ""}${r.code} (${r.rooms.join(", ")}): ${r.why}`),
      ...(g.budget ? [`  - ${g.group ? `[${g.group}] ` : ""}budget: step budget crossed`] : []),
      ...(g.note && !g.budget ? [`  - ${g.group ? `[${g.group}] ` : ""}note: ${g.note}`] : []),
      ...droppedNotes(g),
    ]);
  for (const s of b.storeys.filter(isRefused)) L.push(`- ${name(s)}`, ...lines(s));
  const bKeys = new Set(b.storeys.filter(isRefused).map((s) => `${s.file}@${s.level}`));
  const onlyA = a.storeys.filter((s) => isRefused(s) && !bKeys.has(`${s.file}@${s.level}`));
  if (onlyA.length) {
    L.push("");
    L.push("Refused by (a) only (cleared by the except list):");
    L.push("");
    for (const s of onlyA) L.push(`- ${name(s)}`, ...lines(s));
  }
  return L.join("\n") + "\n";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const excepts = process.argv.includes("--no-except") ? [] : loadExcepts();
  const a = probeCorpus(null);
  const b = probeCorpus(excepts);
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify({ a, b, summary: summarise(a, b) }, null, 2) + "\n");
  } else {
    process.stdout.write(renderReport(a, b, excepts));
    // Informational, never in the headline: (c) every non-rectangle room excepted as well,
    // which no reviewed reason allows (they are enclosed floor), to show what the remainder does.
    const c = probeCorpus([...excepts, ...nonRectExcepts(b)]);
    const refusedC = c.storeys.filter(isRefused);
    process.stdout.write(
      `\nInformational (c), every polygon/circle room also excepted: ${refusedC.length}/${c.storeys.filter(hasRooms).length} refused\n`,
    );
    for (const s of refusedC) {
      process.stdout.write(`- ${s.file}${s.level === null ? "" : ` @${s.level}`}: ${[...storeyCodes(s)].join(", ")}\n`);
      for (const g of s.groups)
        for (const r of g.refusals) process.stdout.write(`  - ${r.code} (${r.rooms.join(", ")}): ${r.why}\n`);
    }
    const lit = probeCorpus(noUseExcepts());
    const refusedLit = lit.storeys.filter(isRefused);
    const litCodes = new Map<Code, number>();
    for (const s of refusedLit) for (const k of storeyCodes(s)) litCodes.set(k, (litCodes.get(k) ?? 0) + 1);
    process.stdout.write(
      `\nInformational, the literal reading (every no-use room excepted): ${refusedLit.length}/${lit.storeys.filter(hasRooms).length} refused (${[...litCodes].map(([k, n]) => `${k} ${n}`).join(", ")})\n`,
    );
    for (const s of refusedLit.filter((s) => !storeyCodes(s).has("E_ROOM_NOT_RECTANGLE"))) {
      process.stdout.write(`- ${s.file}${s.level === null ? "" : ` @${s.level}`}\n`);
      for (const g of s.groups)
        for (const r of g.refusals) process.stdout.write(`  - ${r.code} (${r.rooms.join(", ")}): ${r.why}\n`);
    }
    for (const dir of INFO_DIRS) {
      const x = probeCorpus(null, ROOT, [dir]);
      const refused = x.storeys.filter(isRefused);
      process.stdout.write(
        `\nInformational, \`${dir}\` (not in the headline): ${refused.length}/${x.storeys.filter(hasRooms).length} storeys refused (a); ${x.failures.length} unresolvable\n`,
      );
      for (const s of refused) {
        process.stdout.write(`- ${s.file}${s.level === null ? "" : ` @${s.level}`}\n`);
        for (const g of s.groups)
          for (const r of g.refusals)
            process.stdout.write(`  - ${g.group ? `[${g.group}] ` : ""}${r.code} (${r.rooms.join(", ")}): ${r.why}\n`);
      }
    }
  }
}
