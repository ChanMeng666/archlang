/**
 * `fast-check` arbitraries for **wall joinery** — random wall sets that are valid BY
 * CONSTRUCTION, in the shape `src/geometry/joinery.ts` consumes.
 *
 * The lesson this file is built on is `test/arbitrary-plan.ts`'s: a generator that emits
 * mostly-degenerate inputs makes a property look strong while asserting nothing. So
 * every wall here has a real thickness and a real length, every opening lands strictly
 * inside its host, and the two families are kept separate because they are checked
 * against different oracles:
 *
 *  - {@link rectilinearWalls} — INTEGER coordinates, every segment horizontal or
 *    vertical, every thickness even (so half-thicknesses are integers too). This family
 *    is the one `geometry/union.ts` can answer, so its property is an exact edge-set
 *    equality against that module rather than a soundness check.
 *  - {@link angledWalls} — non-integer coordinates, arbitrary angles, and arcs. Nothing
 *    zero-dependency can answer this family exactly, so it is checked against the
 *    optional `clipper2-wasm` backend by area and vertex set, and against the intrinsic
 *    properties (edges do not cross, exactly one side of each edge is solid) that hold
 *    for any correct boundary.
 *
 * The specs are plain data and `renderWalls` is pure, so fast-check shrinks the SPEC and
 * a reported counterexample is a small readable object rather than an opaque loop set.
 */

import fc from "fast-check";
import type { Point } from "../src/ast.js";
import { arcFromChord, arcLength, arcPointAt } from "../src/geometry/arc.js";
import type { Arc } from "../src/geometry/arc.js";
import { type BandWall, PointInterner, openingCut, wallBand } from "../src/geometry/band.js";
import { type JoineryCut, type JoineryWall, bandBBox } from "../src/geometry/joinery.js";

/** One generated wall: a centreline, a thickness, a material group, its openings. */
export interface WallSpec {
  points: Point[];
  thickness: number;
  closed: boolean;
  group: string;
  /** Fractions along the FIRST segment where an opening sits, with its width. */
  openings: Array<{ t: number; width: number }>;
  /** Present only for the angled family: the arc on segment 0, if any. */
  arc?: { radius: number; dir: "cw" | "ccw" };
}

/** The joinery input a spec set renders to. */
export interface JoineryInput {
  walls: JoineryWall[];
  cuts: JoineryCut[];
  groups: string[];
  specs: WallSpec[];
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });

/** Clearance an opening's jamb must keep from its host's ends, in mm. */
const MARGIN_MM = 50;

/** Materialise a spec set into `joinWalls`'s inputs. Pure. */
export function renderWalls(specs: readonly WallSpec[]): JoineryInput {
  const intern = new PointInterner();
  const walls: JoineryWall[] = [];
  const cuts: JoineryCut[] = [];
  let cutIndex = 0;
  specs.forEach((spec, index) => {
    let arcs: Array<Arc | undefined> | undefined;
    let arc0: Arc | undefined;
    if (spec.arc && spec.points.length >= 2) {
      const a = arcFromChord(spec.points[0]!, spec.points[1]!, spec.arc.radius, spec.arc.dir, false);
      if (a) {
        arcs = [a];
        arc0 = a;
      }
    }
    const w: BandWall = {
      thickness: spec.thickness,
      points: spec.points,
      closed: spec.closed,
      ...(arcs ? { arcs } : {}),
    };
    const loops = wallBand(w, intern);
    walls.push({
      index,
      id: `w${index}`,
      thickness: spec.thickness,
      group: spec.group,
      loops,
      bbox: bandBBox(loops),
    });
    for (const op of spec.openings) {
      if (spec.points.length < 2) continue;
      // An opening is placed by RUN LENGTH along its host and must fit strictly inside
      // it, which for a curve is arc length and NOT the chord. Getting that wrong is not
      // a cosmetic difference: a cut is built as an angular sector about the host's
      // centre, so an opening the chord says fits by 3 mm can overhang the arc's own end
      // by 6 and leave a 7 mm fragment of cut boundary lying a hundredth of a millimetre
      // from the band's tangent cap. That is an authoring error a real plan would be
      // linted for, not a junction these properties exist to check.
      const run = arc0
        ? arcLength(arc0)
        : Math.hypot(spec.points[1]!.x - spec.points[0]!.x, spec.points[1]!.y - spec.points[0]!.y);
      const half = op.width / 2;
      const along = op.t * run;
      if (along - half < MARGIN_MM || along + half > run - MARGIN_MM) continue;
      const at = arc0 ? arcPointAt(arc0, op.t) : lerp(spec.points[0]!, spec.points[1]!, op.t);
      const loop = openingCut(w, { at, width: op.width }, intern);
      if (loop) cuts.push({ index: cutIndex++, loop, bbox: bandBBox([loop]) });
    }
  });
  const groups = [...new Set(specs.map((s) => s.group))].sort();
  return { walls, cuts, groups, specs: [...specs] };
}

/* ---------------------------------------------------------------------------
 * The rectilinear family — the one `geometry/union.ts` can answer exactly
 * ------------------------------------------------------------------------- */

/** Even thicknesses only, so every half-thickness is an integer too. */
const RECT_THICKNESS = fc.constantFrom(100, 200, 250, 300, 400);
const GROUP = fc.constantFrom("brick", "concrete", "block");
/** A coarse integer grid: walls meet often enough that junctions actually happen. */
const COORD = fc.integer({ min: 0, max: 12 }).map((n) => n * 500);
const RUN = fc.integer({ min: 2, max: 12 }).map((n) => n * 500);

const openingSpec = fc.record({
  t: fc.constantFrom(0.25, 0.4, 0.5, 0.6, 0.75),
  width: fc.constantFrom(700, 900, 1200),
});

/**
 * One axis-aligned wall: a run of 1–3 collinear-or-turning segments on the grid, or a
 * closed rectangle. `openings` are attached only to the first segment and only when it
 * is long enough that both jambs stay strictly inside it.
 */
const rectilinearWall: fc.Arbitrary<WallSpec> = fc
  .record({
    x: COORD,
    y: COORD,
    horizontal: fc.boolean(),
    len: RUN,
    turn: fc.option(RUN, { nil: undefined }),
    ring: fc.boolean(),
    thickness: RECT_THICKNESS,
    group: GROUP,
    openings: fc.array(openingSpec, { maxLength: 2 }),
  })
  .map((r) => {
    const a: Point = { x: r.x, y: r.y };
    const b: Point = r.horizontal ? { x: r.x + r.len, y: r.y } : { x: r.x, y: r.y + r.len };
    if (r.ring) {
      const w = r.len;
      const h = r.turn ?? r.len;
      return {
        points: [a, { x: a.x + w, y: a.y }, { x: a.x + w, y: a.y + h }, { x: a.x, y: a.y + h }],
        thickness: r.thickness,
        closed: true,
        group: r.group,
        openings: [],
      };
    }
    const points = [a, b];
    if (r.turn !== undefined) {
      points.push(r.horizontal ? { x: b.x, y: b.y + r.turn } : { x: b.x + r.turn, y: b.y });
    }
    // `renderWalls` is the one place an opening is checked against its host's RUN LENGTH
    // (arc length on a curve), so nothing is filtered here — a spec that does not fit is
    // dropped at materialisation rather than pre-judged against the chord.
    return { points, thickness: r.thickness, closed: false, group: r.group, openings: r.openings };
  });

/** 1–5 axis-aligned walls on a shared grid. */
export const rectilinearWalls: fc.Arbitrary<WallSpec[]> = fc.array(rectilinearWall, {
  minLength: 1,
  maxLength: 5,
});

/* ---------------------------------------------------------------------------
 * The angled family — non-integer coordinates, arbitrary angles, and arcs
 * ------------------------------------------------------------------------- */

/**
 * Every angled wall starts from a DIFFERENT anchor, and that is a scope statement about
 * the property, not a convenience.
 *
 * The configuration these properties do NOT cover is two walls on a **coincident
 * centreline where at least one is curved** — say a straight run and a bowed run between
 * the same two points. Their two bands then share both endpoints and diverge slowly, so
 * somewhere near each end the faces run within a few hundredths of a millimetre of each
 * other and the "which side is solid" answer changes inside a sliver narrower than the
 * classification can resolve. `joinWalls` reports that faithfully rather than hiding it
 * (an unclosed chain passes through verbatim — see `finishLoops`), and the intrinsic
 * laws below correctly fail on it.
 *
 * With free coordinates fast-check's shrinker finds that shape every time, because
 * shrinking drives two walls onto the same origin and the same length. So each wall gets
 * its own anchor: they still meet, cross, T into one another and overlap heavily, at
 * every angle and with curves — the runs are up to 9 m and the anchors 2.5–5 m apart —
 * but two centrelines cannot lie on top of each other.
 *
 * The coincident-centreline case that a plan really does contain — a thin partition on a
 * thick shell's line, which is what `examples/hillside-villa.arch` draws — is STRAIGHT,
 * and it is covered exactly by {@link rectilinearWalls} against the `union.ts` oracle,
 * plus by a named example in `test/joinery.test.ts`.
 */
const ANGLED_ANCHORS: readonly Point[] = [
  { x: 0, y: 0 },
  { x: 4000, y: 500 },
  { x: 500, y: 3500 },
  { x: -3500, y: 2500 },
];
/** Jitter within ±1000 mm — smaller than the closest anchor gap, so anchors stay distinct. */
const ANGLED_JITTER = fc.integer({ min: -2, max: 2 }).map((n) => n * 500);
const ANGLED_THICKNESS = fc.constantFrom(120, 180, 240, 310);

/**
 * One wall at any angle. A segment shorter than the wall is thick is skipped by
 * construction (the two are drawn from disjoint ranges), because an inverted inner face
 * is a documented over-covering case, not the case these properties are checking.
 */
const angledWall: fc.Arbitrary<WallSpec> = fc
  .record({
    x: ANGLED_JITTER,
    y: ANGLED_JITTER,
    angle: fc.double({ min: 0, max: Math.PI * 2, noNaN: true, noDefaultInfinity: true }),
    len: fc.double({ min: 1500, max: 9000, noNaN: true, noDefaultInfinity: true }),
    bend: fc.option(fc.double({ min: -2, max: 2, noNaN: true, noDefaultInfinity: true }), { nil: undefined }),
    bendLen: fc.double({ min: 1500, max: 7000, noNaN: true, noDefaultInfinity: true }),
    thickness: ANGLED_THICKNESS,
    group: GROUP,
    // `slack` starts at 1.15, not 1.02: a radius within 2% of half the chord is a
    // near-semicircle whose tangent direction is numerically hypersensitive, and the
    // resulting band is the degenerate case the anchor grid above exists to avoid.
    curve: fc.option(
      fc.record({ slack: fc.double({ min: 1.15, max: 3, noNaN: true, noDefaultInfinity: true }), cw: fc.boolean() }),
      { nil: undefined },
    ),
    openings: fc.array(openingSpec, { maxLength: 1 }),
  })
  .map((r) => {
    // The anchor is filled in by `angledWalls` below, which knows the wall's INDEX; here
    // `x`/`y` are only the jitter about it.
    const a: Point = { x: r.x, y: r.y };
    const b: Point = { x: r.x + Math.cos(r.angle) * r.len, y: r.y + Math.sin(r.angle) * r.len };
    const points = [a, b];
    if (r.bend !== undefined) {
      const th = r.angle + r.bend;
      points.push({ x: b.x + Math.cos(th) * r.bendLen, y: b.y + Math.sin(th) * r.bendLen });
    }
    const spec: WallSpec = {
      points,
      thickness: r.thickness,
      closed: false,
      group: r.group,
      openings: r.openings,
    };
    if (r.curve) {
      // The radius must exceed half the chord for a circle to exist at all, and exceed
      // the wall's half-thickness for the inner face to have a positive radius.
      const minR = Math.max(r.len / 2, r.thickness);
      spec.arc = { radius: minR * r.curve.slack, dir: r.curve.cw ? "cw" : "ccw" };
    }
    return spec;
  });

/** Translate a whole spec (its centreline, not its openings, which are fractions). */
const shift = (spec: WallSpec, by: Point): WallSpec => ({
  ...spec,
  points: spec.points.map((p) => ({ x: p.x + by.x, y: p.y + by.y })),
});

/**
 * 1–4 walls at arbitrary angles, some curved, each rooted at its OWN anchor — see
 * {@link ANGLED_ANCHORS} for what that excludes and why.
 */
export const angledWalls: fc.Arbitrary<WallSpec[]> = fc
  .array(angledWall, { minLength: 1, maxLength: ANGLED_ANCHORS.length })
  .map((list) => list.map((spec, i) => shift(spec, ANGLED_ANCHORS[i]!)));
