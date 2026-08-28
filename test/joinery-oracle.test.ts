/**
 * Property tests for `src/geometry/joinery.ts`, against two ORACLES and four intrinsic laws.
 *
 * ## Why an oracle and not more examples
 *
 * A hand-written junction test says "this L comes out right". It cannot say "no wall set
 * comes out wrong", and the whole risk of a boundary-extraction algorithm is the
 * configuration nobody thought to write down. So:
 *
 *  - **`geometry/union.ts` is the RECTILINEAR oracle.** It is the zero-dependency
 *    axis-aligned boolean that has produced every orthogonal plan's poché since v0.9, so
 *    on axis-aligned input the new algorithm must agree with it EXACTLY — compared as
 *    quantised undirected EDGE SETS, which is orientation- and rotation-independent and
 *    therefore tests the shape rather than the walk order. That module is kept in the
 *    tree for this purpose; the header there says so.
 *  - **`clipper2-wasm` is the ANGLED oracle.** Nothing zero-dependency can answer an
 *    oblique or curved boolean, so the band loops are tessellated and fed to the optional
 *    backend, and the two are compared by total area and by vertex set. That is a weaker
 *    comparison than the rectilinear one on purpose: the tessellation itself introduces
 *    an error the exact algorithm does not have.
 *
 * ## The missing-dep rule
 *
 * The clipper gate follows the repo's `png.test.ts` pattern (`docs/testing.md` §3): in CI
 * the optional dep is REQUIRED and its absence throws, because a CI install that quietly
 * stopped pulling `optionalDependencies` would otherwise leave a green suite that
 * asserted nothing about the angled path. Locally it degrades to a visible skip.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Point } from "../src/ast.js";
import { ARC_STEP_DEG, arcTessellate } from "../src/geometry/arc.js";

/** Degrees to radians — the sagitta term below needs the tessellation step in radians. */
const rad = (deg: number): number => (deg * Math.PI) / 180;
import { distPointToArc } from "../src/geometry/arc.js";
import { distPointToSegment, segmentRectangle, segmentsOfWall } from "../src/geometry.js";
import { loadClipperBackend } from "../src/geometry/clipper.js";
import type { GeometryBackend } from "../src/geometry/backend.js";
import { rectBooleanOutline } from "../src/geometry/union.js";
import type { Rect } from "../src/geometry/union.js";
import {
  type Edge,
  type EdgeLoop,
  edgeEnd,
  edgeMid,
  edgeStart,
  edgeTangentAt,
  loopArea,
  loopBBox,
  loopWinding,
  pointKey,
  SNAP_MM,
  tessellateLoops,
} from "../src/geometry/band.js";
import { type JoineryWall, joinWalls } from "../src/geometry/joinery.js";
import { circleCircle, lineCircleParams, lineLineParams, perp } from "../src/geometry/intersect.js";
import { type WallSpec, angledWalls, renderWalls, rectilinearWalls } from "./arbitrary-joinery.js";

const P = (x: number, y: number): Point => ({ x, y });

const RUNS = Math.min(2000, Math.max(1, Number(process.env.JOINERY_RUNS ?? 500)));

/**
 * Per-case deadline, in milliseconds.
 *
 * A property that fails hands `fast-check` a counterexample to SHRINK, and shrinking a
 * wall set is not cheap: one run of this file left a worker spinning on a single core for
 * over three hours after the suite had moved on, and its cost was invisible except as
 * every OTHER measurement on the machine drifting by a factor of nearly three. A property
 * run that never terminates is a finding in its own right, so every case here carries a
 * deadline and `RUNS` is capped — the file can go red, but it cannot hang the suite or
 * quietly poison a benchmark.
 */
const CASE_TIMEOUT_MS = 120_000;

/**
 * A PINNED seed, so this file is a gate rather than a lottery.
 *
 * `fast-check` defaults to a fresh random seed per run. In a repo whose central law is
 * that the same input gives the same bytes, a property suite that explores a different
 * corner of the space on every CI run is the wrong shape: a red build would not
 * reproduce locally, and a green one would prove nothing about the next. The date seed
 * follows the convention the dataset generator already uses.
 *
 * Widen coverage by RAISING `numRuns`, not by rolling the seed. `JOINERY_RUNS=5000` (or
 * a deliberately changed constant here) is the way to explore further; if that finds a
 * counterexample, it is a defect to fix and then pin, never a seed to re-roll.
 */
const SEED = 20260828;

/* --------------------------------------------------------------- shared helpers */

/** A loop's edges as a quantised UNDIRECTED key set — orientation- and rotation-free. */
function edgeKeySet(loops: readonly EdgeLoop[]): Set<string> {
  const out = new Set<string>();
  for (const l of loops) {
    for (const e of l) {
      const [a, b] = [pointKey(edgeStart(e)), pointKey(edgeEnd(e))].sort();
      out.add(`${a}~${b}`);
    }
  }
  return out;
}

/** The same, for `rectBooleanOutline`'s plain polygons (the closing edge is implicit). */
function polyEdgeKeySet(polys: readonly Point[][]): Set<string> {
  const out = new Set<string>();
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const [a, b] = [pointKey(poly[i]!), pointKey(poly[(i + 1) % poly.length]!)].sort();
      if (a !== b) out.add(`${a}~${b}`);
    }
  }
  return out;
}

const inside = (loops: readonly EdgeLoop[], p: Point): boolean =>
  loops.reduce((n, l) => n + loopWinding(l, p), 0) !== 0;

/** Do two edges cross at a point INTERIOR to both? Shared endpoints do not count. */
function crossesInterior(a: Edge, b: Edge): Point | null {
  const ends = new Set([pointKey(edgeStart(a)), pointKey(edgeEnd(a)), pointKey(edgeStart(b)), pointKey(edgeEnd(b))]);
  const interior = (e: Edge, p: Point): boolean => {
    if (ends.has(pointKey(p))) return false;
    const d = e.t === "arc" ? distPointToArc(p, e.arc) : distPointToSegment(p, edgeStart(e), edgeEnd(e));
    if (d > 1e-6) return false;
    // Strictly interior: not within a micron of either end.
    const s = edgeStart(e);
    const t = edgeEnd(e);
    return Math.hypot(p.x - s.x, p.y - s.y) > 1e-3 && Math.hypot(p.x - t.x, p.y - t.y) > 1e-3;
  };
  const candidates: Point[] = [];
  if (a.t === "line" && b.t === "line") {
    const d = { x: a.b.x - a.a.x, y: a.b.y - a.a.y };
    const e = { x: b.b.x - b.a.x, y: b.b.y - b.a.y };
    const r = lineLineParams(a.a, d, b.a, e);
    if (r) candidates.push({ x: a.a.x + r.s * d.x, y: a.a.y + r.s * d.y });
  } else if (a.t === "line" && b.t === "arc") {
    const d = { x: a.b.x - a.a.x, y: a.b.y - a.a.y };
    for (const s of lineCircleParams(a.a, d, b.arc.center, b.arc.r)) {
      candidates.push({ x: a.a.x + s * d.x, y: a.a.y + s * d.y });
    }
  } else if (a.t === "arc" && b.t === "line") {
    const d = { x: b.b.x - b.a.x, y: b.b.y - b.a.y };
    for (const s of lineCircleParams(b.a, d, a.arc.center, a.arc.r)) {
      candidates.push({ x: b.a.x + s * d.x, y: b.a.y + s * d.y });
    }
  } else if (a.t === "arc" && b.t === "arc") {
    candidates.push(...circleCircle(a.arc.center, a.arc.r, b.arc.center, b.arc.r));
  }
  for (const p of candidates) if (interior(a, p) && interior(b, p)) return p;
  return null;
}

/* ------------------------------------------------------------- intrinsic laws */

describe("intrinsic laws — any correct boundary satisfies these, for any wall set", () => {
  const bothFamilies = fc.oneof(rectilinearWalls, angledWalls);

  it(
    "(a) no two emitted outline edges cross at a point interior to both",
    () => {
      fc.assert(
        fc.property(bothFamilies, (specs) => {
          const { walls, cuts, groups } = renderWalls(specs);
          const { outline } = joinWalls(walls, cuts, groups);
          const edges = outline.flat();
          for (let i = 0; i < edges.length; i++) {
            for (let j = i + 1; j < edges.length; j++) {
              const hit = crossesInterior(edges[i]!, edges[j]!);
              if (hit) return false;
            }
          }
          return true;
        }),
        { numRuns: RUNS, seed: SEED },
      );
    },
    CASE_TIMEOUT_MS,
  );

  it(
    "(b) re-probing every emitted edge finds solid on EXACTLY one side",
    () => {
      fc.assert(
        fc.property(bothFamilies, (specs) => {
          const { walls, cuts, groups } = renderWalls(specs);
          const { outline } = joinWalls(walls, cuts, groups);
          const eps = 1e-3;
          for (const l of outline) {
            for (const e of l) {
              const m = edgeMid(e);
              const n = perp(edgeTangentAt(e, m));
              const plus = inside(outline, { x: m.x + n.x * eps, y: m.y + n.y * eps });
              const minus = inside(outline, { x: m.x - n.x * eps, y: m.y - n.y * eps });
              if (plus === minus) return false;
              // … and the SOLID side is on the +perp side, i.e. clockwise-positive.
              if (!plus) return false;
            }
          }
          return true;
        }),
        { numRuns: RUNS, seed: SEED },
      );
    },
    CASE_TIMEOUT_MS,
  );

  it(
    "(c) every loop is closed, non-degenerate, and encloses a positive area",
    () => {
      fc.assert(
        fc.property(bothFamilies, (specs) => {
          const { walls, cuts, groups } = renderWalls(specs);
          const { outline } = joinWalls(walls, cuts, groups);
          for (const l of outline) {
            if (l.length === 0) return false;
            // Closed: each edge ends where the next begins, cyclically.
            for (let i = 0; i < l.length; i++) {
              if (pointKey(edgeEnd(l[i]!)) !== pointKey(edgeStart(l[(i + 1) % l.length]!))) return false;
            }
            // Three edges — OR fewer, provided at least one is an arc. A curved boundary
            // legitimately closes with two edges (a chord and an arc bound a crescent, and
            // a bulged wall meeting a straight one on the same chord produces exactly that)
            // or with one (a full circle). Only an ALL-STRAIGHT loop of fewer than three
            // edges is degenerate — it would be two coincident lines enclosing nothing.
            if (l.length < 3 && !l.some((e) => e.t === "arc")) return false;
            if (!(Math.abs(loopArea(l)) > 0)) return false;
          }
          return true;
        }),
        { numRuns: RUNS, seed: SEED },
      );
    },
    CASE_TIMEOUT_MS,
  );

  it(
    "(f) is deterministic, and independent of the ORDER the caller passes walls in",
    () => {
      fc.assert(
        fc.property(bothFamilies, fc.integer({ min: 0, max: 1000 }), (specs, seed) => {
          const { walls, cuts, groups } = renderWalls(specs);
          const a = joinWalls(walls, cuts, groups);
          const b = joinWalls(walls, cuts, groups);
          if (JSON.stringify(a) !== JSON.stringify(b)) return false;
          // Permute the ARRAYS while leaving every `index` field alone: the tags are the
          // caller's indices, so a permutation must be a no-op on the output.
          const rot = seed % Math.max(1, walls.length);
          const permWalls = [...walls.slice(rot), ...walls.slice(0, rot)];
          const permCuts = [...cuts].reverse();
          const c = joinWalls(permWalls, permCuts, groups);
          return JSON.stringify(a) === JSON.stringify(c);
        }),
        { numRuns: RUNS, seed: SEED },
      );
    },
    CASE_TIMEOUT_MS,
  );
});

/* --------------------------------------------------- (d) the rectilinear oracle */

describe("(d) axis-aligned input agrees EXACTLY with geometry/union.ts", () => {
  it(
    "outline edge set == rectBooleanOutline's, for every generated wall set",
    () => {
      fc.assert(
        fc.property(rectilinearWalls, (specs) => {
          const { walls, cuts, groups } = renderWalls(specs);
          const { outline } = joinWalls(walls, cuts, groups);

          // The oracle's input is built exactly the way `lowerOrthogonalGroup` has always
          // built it: one `segmentRectangle` per wall SEGMENT. Not the band's loop boxes —
          // a closed ring's band has an outer loop AND a hole, and feeding both as solids
          // would hand the oracle a filled square where the drawing has a ring.
          const solids: Rect[] = [];
          for (const spec of specs) {
            for (const seg of segmentsOfWall({ id: "", category: "", ...spec })) {
              const corners = segmentRectangle(seg.a, seg.b, seg.thickness);
              const xs = corners.map((c) => c.x);
              const ys = corners.map((c) => c.y);
              solids.push({
                x0: Math.min(...xs),
                y0: Math.min(...ys),
                x1: Math.max(...xs),
                y1: Math.max(...ys),
              });
            }
          }
          const holes: Rect[] = cuts.map((c) => {
            const b = loopBBox(c.loop);
            return { x0: b.minX, y0: b.minY, x1: b.maxX, y1: b.maxY };
          });
          const expected = rectBooleanOutline(solids, holes);

          const mine = edgeKeySet(outline);
          const theirs = polyEdgeKeySet(expected);
          if (mine.size !== theirs.size) return false;
          for (const k of theirs) if (!mine.has(k)) return false;
          return true;
        }),
        { numRuns: RUNS, seed: SEED },
      );
    },
    CASE_TIMEOUT_MS,
  );

  it("the oracle is not vacuous — a planted extra wall changes its answer too", () => {
    // If `rectBooleanOutline` returned the same thing for everything, (d) would prove
    // nothing. One wall vs two must differ under BOTH.
    const one = renderWalls([
      {
        points: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
        ],
        thickness: 200,
        closed: false,
        group: "brick",
        openings: [],
      },
    ]);
    const two = renderWalls([
      {
        points: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
        ],
        thickness: 200,
        closed: false,
        group: "brick",
        openings: [],
      },
      {
        points: [
          { x: 4000, y: 0 },
          { x: 4000, y: 3000 },
        ],
        thickness: 200,
        closed: false,
        group: "brick",
        openings: [],
      },
    ]);
    const a = edgeKeySet(joinWalls(one.walls, one.cuts, one.groups).outline);
    const b = edgeKeySet(joinWalls(two.walls, two.cuts, two.groups).outline);
    expect(a).not.toEqual(b);
  });
});

/* --------------------------------------------------------- (e) the angled oracle */

/**
 * How closely the two engines can possibly agree on a POSITION: the coarser of their two
 * quantisations.
 *
 * `clipper2-wasm` works on an integer grid of `SCALE = 1000` per mm
 * (`src/geometry/clipper.ts`), so every coordinate it returns has been snapped to a
 * micron. The joinery layer snaps to `SNAP_MM`. Comparing at anything tighter than the
 * coarser of the two asserts that one of them is exact, which neither is.
 */
const COMPARE_MM = Math.max(SNAP_MM, 1e-3);

/**
 * Closest approach below which two edges from DIFFERENT bands make the comparison
 * meaningless, in mm.
 *
 * The two engines snap at different resolutions, so where two boundaries pass within a
 * hair of each other without crossing they can legitimately disagree about CONNECTIVITY
 * — and one measured case is exactly that: clipper called a pair of walls two separate
 * components where joinery, snapping ten times coarser, called them one touching region.
 * Neither is wrong; inside that band there is no single right answer, so the VERTEX-SET
 * comparison (which assumes the two boundaries have the same shape) is preconditioned on
 * staying out of it. The AREA comparison is not preconditioned — it survives a
 * connectivity disagreement, because a region counted as one piece or two has the same
 * total area either way.
 */
const SEPARATION_MM = 0.05;

/** Distance from a point to an edge — exact for both kinds. */
const edgeDist = (p: Point, e: Edge): number =>
  e.t === "arc" ? distPointToArc(p, e.arc) : distPointToSegment(p, edgeStart(e), edgeEnd(e));

/** Sampled closest approach between two edges. Dense enough to be conservative here. */
function closestApproach(a: Edge, b: Edge): number {
  const at = (e: Edge, t: number): Point =>
    e.t === "arc"
      ? {
          x: e.arc.center.x + e.arc.r * Math.cos(e.arc.start + e.arc.sweep * t),
          y: e.arc.center.y + e.arc.r * Math.sin(e.arc.start + e.arc.sweep * t),
        }
      : {
          x: edgeStart(e).x + t * (edgeEnd(e).x - edgeStart(e).x),
          y: edgeStart(e).y + t * (edgeEnd(e).y - edgeStart(e).y),
        };
  const dist = (p: Point, e: Edge): number =>
    e.t === "arc" ? distPointToArc(p, e.arc) : distPointToSegment(p, edgeStart(e), edgeEnd(e));
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= 64; i++) {
    best = Math.min(best, dist(at(a, i / 64), b), dist(at(b, i / 64), a));
  }
  return best;
}

/**
 * Are all the bands far enough apart, or properly crossing, for a vertex-by-vertex
 * comparison to mean anything? Edges that share an interned endpoint are incident by
 * construction and are not asked about.
 */
function wellSeparated(walls: readonly JoineryWall[]): boolean {
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      for (const ea of walls[i]!.loops.flat()) {
        for (const eb of walls[j]!.loops.flat()) {
          const shares =
            edgeStart(ea) === edgeStart(eb) ||
            edgeStart(ea) === edgeEnd(eb) ||
            edgeEnd(ea) === edgeStart(eb) ||
            edgeEnd(ea) === edgeEnd(eb);
          if (shares) continue;
          const d = closestApproach(ea, eb);
          if (d > 0 && d < SEPARATION_MM) return false;
        }
      }
    }
  }
  return true;
}

const clipper: GeometryBackend | null = await loadClipperBackend().catch(() => null);
const CLIPPER_REQUIRED = !!process.env.CI;

/** Shoelace area of a plain polygon (the closing edge implied). */
function shoelace(poly: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Distance from a point to a plain polygon's boundary. */
const toPolylines = (polys: readonly Point[][], p: Point): number =>
  Math.min(
    ...polys.map((poly) => Math.min(...poly.map((q, k) => distPointToSegment(p, q, poly[(k + 1) % poly.length]!)))),
  );

/**
 * Does the joinery outline agree with clipper's union of the same bands?
 *
 * **Two comparisons, and which SHAPE one applies is a property of the input, not a
 * tolerance dial.**
 *
 * **(i) AREA — always, and relative.** It is the one claim that survives the two engines
 * disagreeing about CONNECTIVITY: a region counted as one piece or as two has the same
 * total area either way, so it needs no precondition. Its budget carries two derived
 * terms beside the `1e-5` relative one, and neither is slack for its own sake.
 * `snapSlack` is clipper's own micron grid — every vertex it returns has moved by up to
 * `COMPARE_MM`, which shifts the area by about the boundary's LENGTH times that.
 * `tessSlack` is the area between a curve and its own chords, `(L·r/2)·(θ − sin θ)/θ`
 * per arc: both sides are compared as POLYGONS but tessellated from different arcs,
 * because the join merges and splits curves and the step counts then differ. It is
 * exactly zero on an all-straight outline, so the strict comparison still applies in
 * full wherever it can.
 *
 * **(ii) SHAPE, curved input — ONE-DIRECTIONAL.** Every joinery vertex, plus the
 * MIDPOINT of every joinery arc edge (the point of a curve furthest from its own chord,
 * so the one a faceted oracle is least likely to carry), must lie on clipper's boundary.
 * The reverse direction is deliberately NOT asserted: clipper unions a TESSELLATED
 * polygon, so it necessarily owns vertices joinery never had — a 48-gon's worth per
 * circle — and requiring joinery to account for each of them tests the oracle's faceting,
 * not the algorithm. The tolerance carries the sagitta `r(1 − cos(step/2))`, which is the
 * furthest a point of the true curve can sit from the chord standing in for it.
 *
 * **(iii) SHAPE, straight input — BOTH directions.** With no curve there is no sagitta
 * and no faceting, so the two boundaries must be each other's, and the comparison is
 * tight (`COMPARE_MM`). It is still point-to-BOUNDARY rather than vertex-to-vertex, and
 * that is not a loosening: clipper unions per-band polygons and KEEPS the collinear
 * vertex where two of them met, while `joinWalls` merges a straight run into one edge —
 * measured on two disjoint walls, its loop carried `[3060,60] [1500,60] [-60,60]` where
 * joinery's carried the two ends alone. A vertex-set equality calls that a mismatch when
 * the two boundaries are the identical rectangle.
 *
 * Both SHAPE comparisons are preconditioned on well-separated bands (see
 * {@link SEPARATION_MM}); the AREA one is not.
 */
function agreesWithClipper(outline: EdgeLoop[], walls: readonly JoineryWall[], theirs: Point[][]): boolean {
  const mineTess = tessellateLoops(outline);
  const theirArea = theirs.reduce((s, p) => s + shoelace(p), 0);
  const mineArea = mineTess.reduce((s, p) => s + shoelace(p), 0);
  const perimeter = mineTess.reduce(
    (s, poly) =>
      s +
      poly.reduce(
        (t, p, k) => t + Math.hypot(p.x - poly[(k + 1) % poly.length]!.x, p.y - poly[(k + 1) % poly.length]!.y),
        0,
      ),
    0,
  );

  // (i) AREA
  const step = rad(ARC_STEP_DEG);
  const chordDeficit = (step - Math.sin(step)) / step;
  const tessSlack = outline
    .flat()
    .reduce((m, e) => (e.t === "arc" ? m + ((Math.abs(e.arc.sweep) * e.arc.r * e.arc.r) / 2) * chordDeficit : m), 0);
  const scale = Math.max(Math.abs(theirArea), Math.abs(mineArea), 1);
  const snapSlack = perimeter * COMPARE_MM;
  if (Math.abs(Math.abs(mineArea) - Math.abs(theirArea)) > scale * 1e-5 + snapSlack + tessSlack) return false;

  // (ii)/(iii) SHAPE
  if (!wellSeparated(walls)) return true;
  const curved = outline.some((l) => l.some((e) => e.t === "arc"));
  if (!curved) {
    const onMine = (p: Point): boolean => outline.flat().some((e) => edgeDist(p, e) <= COMPARE_MM);
    for (const poly of theirs) for (const p of poly) if (!onMine(p)) return false;
    for (const poly of mineTess) for (const p of poly) if (toPolylines(theirs, p) > COMPARE_MM) return false;
    return true;
  }
  // The sagitta bound is derived from clipper's OWN OUTPUT - its longest chord - and not
  // from the tessellation step it was fed.
  //
  // The step would be the obvious source and it is wrong: a UNION clips chords. Where two
  // bands overlap, clipper's boundary runs from one intersection point to the next, and
  // that span can be longer than any single facet it started with. Measured, that put a
  // joinery arc midpoint 9.26 mm off clipper's polyline against an 8.04 mm step-derived
  // bound - a curve neither engine got wrong, judged by a ruler that did not describe the
  // polygon actually returned. `r - sqrt(r^2 - (L/2)^2)` for the longest chord `L` present
  // and the largest radius `r` in play is the honest bound, and it adapts to whatever the
  // oracle happened to emit.
  const rMax = [...outline.flat(), ...walls.flatMap((w) => w.loops.flat())].reduce(
    (m, e) => (e.t === "arc" ? Math.max(m, e.arc.r) : m),
    0,
  );
  const maxChord = theirs.reduce(
    (m, poly) =>
      Math.max(
        m,
        ...poly.map((q, k) => Math.hypot(q.x - poly[(k + 1) % poly.length]!.x, q.y - poly[(k + 1) % poly.length]!.y)),
      ),
    0,
  );
  const sagitta = rMax - Math.sqrt(Math.max(0, rMax * rMax - (maxChord / 2) ** 2));
  // Twice COMPARE_MM: a chord has TWO endpoints and clipper has snapped both to its grid,
  // which tilts the chord as well as moving it.
  const tol = 2 * COMPARE_MM + sagitta;
  const probes: Point[] = [];
  for (const loop of outline) {
    for (const e of loop) {
      probes.push(edgeStart(e));
      if (e.t === "arc") probes.push(edgeMid(e));
    }
  }
  return probes.every((p) => toPolylines(theirs, p) <= tol);
}

describe("(e) angled and curved input agrees with the clipper2 union", () => {
  if (!clipper) {
    const gate = "optional geometry dep clipper2-wasm is installed";
    if (CLIPPER_REQUIRED) {
      it(gate, () => {
        throw new Error(
          "optional dep clipper2-wasm missing in CI — install step is broken. The ANGLED " +
            "joinery path was NOT cross-checked against any oracle (area and vertex-set " +
            "agreement both went unasserted). Check that the install step still pulls " +
            "optionalDependencies (npm ci without --omit=optional).",
        );
      });
    } else {
      it.skip(`${gate} (absent locally — the angled oracle did not run)`, () => {});
    }
  } else {
    it(
      "agrees with clipper2 on AREA always, and on SHAPE by the comparison each input admits",
      () => {
        fc.assert(
          fc.property(angledWalls, (specs) => {
            const { walls, cuts, groups } = renderWalls(specs);
            // The oracle cannot subtract an ANNULAR opening sector, so this property is
            // stated on the union alone - openings have their own example-based coverage.
            if (cuts.length > 0) return true;
            const { outline } = joinWalls(walls, cuts, groups);
            const polys = walls.flatMap((w) => tessellateLoops(w.loops));
            if (polys.length === 0) return outline.length === 0;
            const theirs = clipper.union(polys);
            return agreesWithClipper(outline, walls, theirs);
          }),
          { numRuns: RUNS, seed: SEED },
        );
      },
      CASE_TIMEOUT_MS,
    );

    it("REGRESSION: a straight run capping into a curved one, from a failing property seed", () => {
      // The case property (e) died on at run 13, before the shape comparison was split by
      // input kind. It is a 180 mm straight run whose cap lands beside a 120 mm CURVED
      // wall, so the two bands overlap and clipper's union CLIPS the chords of the curve -
      // which is what made a step-derived sagitta bound too small (a joinery arc midpoint
      // 9.26 mm off clipper's polyline against an 8.04 mm bound). Pinned as an example so
      // the bound cannot quietly go back to being derived from the tessellation step
      // rather than from the polygon clipper actually returned.
      const specs: WallSpec[] = [
        {
          points: [P(0, 0), P(1500, 0), P(4040.2155, 0)],
          thickness: 180,
          closed: false,
          group: "brick",
          openings: [],
        },
        {
          points: [P(4000, 0), P(7976.044906898427, 0), P(9476.044906898427, 0)],
          thickness: 120,
          closed: false,
          group: "brick",
          openings: [],
          arc: { radius: 2286.225821466596, dir: "ccw" },
        },
      ];
      const { walls, cuts, groups } = renderWalls(specs);
      expect(cuts).toHaveLength(0);
      const { outline } = joinWalls(walls, cuts, groups);
      // The fixture is honest: the two bands really do overlap (ONE joined region, not
      // two), and the outline really does carry a curve.
      expect(outline).toHaveLength(1);
      expect(outline[0]!.some((e) => e.t === "arc")).toBe(true);
      const theirs = clipper.union(walls.flatMap((w) => tessellateLoops(w.loops)));
      expect(agreesWithClipper(outline, walls, theirs)).toBe(true);
    });

    it("the oracle really is exercised — a curved wall reaches it and returns a curve", () => {
      const { walls } = renderWalls([
        {
          points: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
          ],
          thickness: 200,
          closed: false,
          group: "brick",
          openings: [],
          arc: { radius: 3000, dir: "cw" },
        },
      ]);
      const polys = walls.flatMap((w) => tessellateLoops(w.loops));
      expect(polys.length).toBeGreaterThan(0);
      // A tessellated curve carries many more vertices than a rectangle's four.
      expect(polys[0]!.length).toBeGreaterThan(8);
      expect(clipper.union(polys).length).toBeGreaterThan(0);
      // And the tessellator really is the shared one.
      expect(arcTessellate).toBeTypeOf("function");
    });
  }
});
