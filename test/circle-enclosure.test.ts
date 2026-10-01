import { describe as suite, expect, it } from "vitest";
import { compile, lint } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { segmentsOfWall, type WallSegment } from "../src/geometry.js";
import { largestPerimeterGapCircle, largestPerimeterGapRing } from "../src/analyze.js";
import { arcFromChord } from "../src/geometry/arc.js";
import { DEFAULT_RULESET } from "../src/lint/ruleset.js";
import type { RRoom } from "../src/ir.js";

/**
 * `W_ROOM_NOT_ENCLOSED` on a CIRCULAR wet room walled by `arc` edges.
 *
 * The defect: the ring path matched wall centrelines PARALLEL to each of the room's 48
 * tessellation facets, and an arc wall entered it only by its chord (a semicircle's chord
 * is a diameter) — parallel to no facet — so a fully walled drum read as open by exactly
 * one facet, 2R·sin 3.75° ≈ 0.1308·R: silent below R ≈ 2294 mm (under the 300 mm
 * threshold), ~392 mm at R = 3000. A circle room is now measured by ANGLE against
 * concentric arc walls (`largestPerimeterGapCircle`).
 */

const TOL = DEFAULT_RULESET.tolMm;
const R = 3000;

const plan = (body: string): string => `plan "Drum" {\n  units mm\n${body}\n}`;
const BATH = `  room id=bath circle at (5000,5000) radius ${R} label "Bath" uses bath`;

/** One wall, two semicircles — the full circle as the examples author it. */
const FULL = `  wall id=drum partition thickness 200 {
    (8000,5000)
    arc (2000,5000) radius ${R}
    arc (8000,5000) radius ${R}
  }`;
/** Two walls, one semicircle each. */
const HALVES = `  wall id=n partition thickness 200 { (8000,5000) arc (2000,5000) radius ${R} }
  wall id=s partition thickness 200 { (2000,5000) arc (8000,5000) radius ${R} }`;
/** Four quarter arcs walked CLOCKWISE (the opposite sense to FULL's default ccw). */
const QUARTERS_CW = `  wall id=drum partition thickness 200 {
    (8000,5000)
    arc (5000,8000) radius ${R} cw
    arc (2000,5000) radius ${R} cw
    arc (5000,2000) radius ${R} cw
    arc (8000,5000) radius ${R} cw
  }`;
/** Three quarters (ccw from east: N, W, S) — the south-east quarter has no wall. */
const MISSING_QUARTER = `  wall id=drum partition thickness 200 {
    (8000,5000)
    arc (5000,2000) radius ${R}
    arc (2000,5000) radius ${R}
    arc (5000,8000) radius ${R}
  }`;

const enclosure = (src: string) => lint(src).filter((d) => d.code === "W_ROOM_NOT_ENCLOSED");
const gapMm = (src: string): number | undefined => {
  const d = enclosure(src)[0];
  const m = d ? /~(\d+) mm/.exec(d.message) : null;
  return m ? Number(m[1]) : undefined;
};
const resolved = (src: string): { room: RRoom; segs: WallSegment[] } => {
  const ir = resolve(parse(src).plan!).ir;
  const room = ir.elements.find((e): e is RRoom => e.kind === "room")!;
  return { room, segs: ir.walls.flatMap((w) => segmentsOfWall(w)) };
};

suite("W_ROOM_NOT_ENCLOSED on a circle room enclosed by arc walls", () => {
  it.each([
    ["one wall of two semicircles", FULL],
    ["two semicircle walls", HALVES],
    ["four clockwise quarter arcs", QUARTERS_CW],
  ])("%s: a wet R=3000 drum lints clean", (_name, walls) => {
    expect(enclosure(plan(`${walls}\n${BATH}`))).toEqual([]);
  });

  it("control on the identical geometry: the ring path still reads one facet (2R·sin 3.75°) open", () => {
    // Proves the test above exercises the NEW branch: the old measure of the same plan is
    // over the threshold, and the circle measure is ~0.
    const { room, segs } = resolved(plan(`${FULL}\n${BATH}`));
    const ring = largestPerimeterGapRing(room.poly!, [], TOL, segs);
    expect(ring).toBeCloseTo(2 * R * Math.sin((3.75 * Math.PI) / 180), 6);
    expect(ring).toBeGreaterThan(DEFAULT_RULESET.maxUnenclosedMm);
    expect(largestPerimeterGapCircle(room.circle!.c, room.circle!.r, segs, TOL)).toBeCloseTo(0, 9);
  });

  it("a missing 90° arc reports R·π/2 (≈ 4712 mm)", () => {
    const src = plan(`${MISSING_QUARTER}\n${BATH}`);
    expect(gapMm(src)).toBe(Math.round((R * Math.PI) / 2));
    expect(gapMm(src)).toBe(4712);
    const { room, segs } = resolved(src);
    expect(largestPerimeterGapCircle(room.circle!.c, R, segs, TOL)).toBeCloseTo((R * Math.PI) / 2, 6);
  });

  it("the gap is the angular formula, not a tessellation count (a gap no multiple of 7.5°)", () => {
    // A 3-4-5 point: the uncovered run is atan2(3,4) ≈ 36.87° of arc, which no whole
    // number of 7.5° facets can produce.
    const src = plan(`  wall id=drum partition thickness 200 { (15000,10000) arc (14000,13000) radius 5000 major }
  room id=bath circle at (10000,10000) radius 5000 label "Bath" uses bath`);
    const want = 5000 * Math.atan2(3, 4);
    expect(gapMm(src)).toBe(Math.round(want));
    const { room, segs } = resolved(src);
    expect(largestPerimeterGapCircle(room.circle!.c, 5000, segs, TOL)).toBeCloseTo(want, 6);
    // Synthetic arcs over many sweeps and radii: coverage is exactly r·|sweep|.
    for (const r of [1000, 2294, 6000, 12345]) {
      for (const deg of [10, 37, 90, 179, 200, 355]) {
        const t = (deg * Math.PI) / 180;
        const c = { x: 0, y: 0 };
        const a = { x: r, y: 0 };
        const b = { x: r * Math.cos(t), y: r * Math.sin(t) };
        for (const dir of ["cw", "ccw"] as const) {
          // `cw` from east reaches angle t directly; `ccw` the long way round.
          const major = dir === "cw" ? deg > 180 : deg < 180;
          const arc = arcFromChord(a, b, r, dir, major)!;
          const seg: WallSegment = { a, b, thickness: 200, category: "partition", wallId: "w", index: 0, arc };
          const covered = dir === "cw" ? t : 2 * Math.PI - t;
          expect(largestPerimeterGapCircle(c, r, [seg], TOL)).toBeCloseTo(r * (2 * Math.PI - covered), 6);
        }
      }
    }
  });

  it("only a CONCENTRIC arc within tol counts", () => {
    const off = (dx: number, dr: number): string =>
      plan(`  wall id=drum partition thickness 200 {
    (${8000 + dx + dr},5000)
    arc (${2000 + dx - dr},5000) radius ${R + dr}
    arc (${8000 + dx + dr},5000) radius ${R + dr}
  }
${BATH}`);
    expect(enclosure(off(0, 150))).toEqual([]); // wall centreline 150 mm out: within tol
    expect(enclosure(off(150, 0))).toEqual([]); // centre 150 mm off: within tol
    expect(gapMm(off(0, 400))).toBe(Math.round(2 * Math.PI * R)); // another circle
    expect(gapMm(off(400, 0))).toBe(Math.round(2 * Math.PI * R));
  });

  // Red-team M1: an arc admitted within tol but OFF-centre must still close on its
  // neighbour. The offsets above keep every endpoint on the axis through the room centre,
  // so an interval hung off one endpoint by the arc's own |sweep| happened to close; an
  // offset PERPENDICULAR to that axis opened ~2·atan(d/R) at each junction.
  it.each([
    [0, 150],
    [0, 200],
    [0, -200],
  ])("two semicircles whose centre is off by (%i,%i) — within tol — still close", (dx, dy) => {
    const p = (x: number, y: number) => `(${x + dx},${y + dy})`;
    const src = plan(`  wall id=n partition thickness 200 { ${p(8000, 5000)} arc ${p(2000, 5000)} radius ${R} }
  wall id=s partition thickness 200 { ${p(2000, 5000)} arc ${p(8000, 5000)} radius ${R} }
${BATH}`);
    expect(enclosure(src)).toEqual([]);
    const { room, segs } = resolved(src);
    expect(largestPerimeterGapCircle(room.circle!.c, R, segs, TOL)).toBeCloseTo(0, 6);
  });

  it.each([
    [140, 140],
    [-140, 140],
  ])("four quarter arcs whose centre is off diagonally by (%i,%i) — within tol — still close", (dx, dy) => {
    const p = (x: number, y: number) => `(${x + dx},${y + dy})`;
    const src = plan(`  wall id=drum partition thickness 200 {
    ${p(8000, 5000)}
    arc ${p(5000, 8000)} radius ${R} cw
    arc ${p(2000, 5000)} radius ${R} cw
    arc ${p(5000, 2000)} radius ${R} cw
    arc ${p(8000, 5000)} radius ${R} cw
  }
${BATH}`);
    expect(enclosure(src)).toEqual([]);
    const { room, segs } = resolved(src);
    expect(largestPerimeterGapCircle(room.circle!.c, R, segs, TOL)).toBeCloseTo(0, 6);
  });

  it("the radius test reads the wall CENTRELINE: a 420 mm drum with its inner face on R backs nothing (documented)", () => {
    // Centreline at R + 210 > R + tol, exactly as a rect room's wall more than tol off its edge.
    const src = plan(`  wall id=drum exterior thickness 420 {
    (8210,5000)
    arc (1790,5000) radius 3210
    arc (8210,5000) radius 3210
  }
${BATH}`);
    expect(gapMm(src)).toBe(Math.round(2 * Math.PI * R));
  });

  it("a diagonal offset of (150,150) is |d| ≈ 212 mm — OUTSIDE the 200 mm tol, so no wall counts", () => {
    const p = (x: number, y: number) => `(${x + 150},${y + 150})`;
    const src = plan(`  wall id=n partition thickness 200 { ${p(8000, 5000)} arc ${p(2000, 5000)} radius ${R} }
  wall id=s partition thickness 200 { ${p(2000, 5000)} arc ${p(8000, 5000)} radius ${R} }
${BATH}`);
    expect(gapMm(src)).toBe(Math.round(2 * Math.PI * R));
  });

  // Red-team m1: an arc whose covered interval CROSSES angle 0 (east) takes the wrap
  // branch; pin its value exactly so an over-covering wrap cannot pass.
  it("a covered interval straddling east wraps exactly: the gap across WEST is 2R·atan2(3,4)", () => {
    // Endpoints at (−4000, ∓3000) from the centre; the wall runs clockwise the LONG way,
    // through north, east and south, leaving the west 2·atan2(3,4) ≈ 73.74° open.
    const src = plan(`  wall id=drum partition thickness 200 { (6000,7000) arc (6000,13000) radius 5000 cw major }
  room id=bath circle at (10000,10000) radius 5000 label "Bath" uses bath`);
    const want = 2 * 5000 * Math.atan2(3, 4);
    expect(gapMm(src)).toBe(Math.round(want));
    const { room, segs } = resolved(src);
    expect(segs[0]!.arc!.center).toEqual({ x: 10000, y: 10000 });
    expect(largestPerimeterGapCircle(room.circle!.c, 5000, segs, TOL)).toBeCloseTo(want, 6);
  });
});

suite("straight walls never back a circle room (documented)", () => {
  it("a faceted polyline wall on the room's own 48-gon reads fully open (2πR)", () => {
    const { room } = resolved(plan(BATH));
    const pts = room.poly!;
    const walls = [
      {
        id: "facets",
        category: "partition",
        thickness: 200,
        points: pts,
        closed: true,
      },
    ];
    const segs = walls.flatMap((w) => segmentsOfWall(w));
    // The ring measure is satisfied by facet-parallel walls; the circle measure is not.
    expect(largestPerimeterGapRing(pts, walls, TOL, segs)).toBeCloseTo(0, 6);
    expect(largestPerimeterGapCircle(room.circle!.c, R, segs, TOL)).toBeCloseTo(2 * Math.PI * R, 6);
  });

  it("a circle room inside a square straight wall is reported with its whole circumference", () => {
    const src = plan(`  wall id=box partition thickness 200 { (2000,2000) (8000,2000) (8000,8000) (2000,8000) close }
${BATH}`);
    expect(gapMm(src)).toBe(Math.round(2 * Math.PI * R));
  });

  it("a dry circle room is never measured", () => {
    const src = plan(`  wall id=box partition thickness 200 { (2000,2000) (8000,2000) close }
  room id=hall circle at (5000,5000) radius ${R} label "Hall" uses hall`);
    expect(enclosure(src)).toEqual([]);
  });
});

suite("the verdict is D4-equivariant under `place`", () => {
  const component = (walls: string): string => `plan "Placed" {
  units mm
  component drum() {
${walls}
${BATH}
  }
  place drum() as g at (20000,20000) __T__
}`;
  const transforms = ["", "rotate 90", "rotate 180", "rotate 270", "mirror x", "mirror y", "rotate 90 mirror x"];

  it.each(transforms)("enclosed drum stays clean under `%s`", (t) => {
    const src = component(FULL).replace("__T__", t);
    expect(compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(enclosure(src)).toEqual([]);
  });

  it.each(transforms)("drum missing a quarter reports ~4712 mm under `%s`", (t) => {
    expect(gapMm(component(MISSING_QUARTER).replace("__T__", t))).toBe(4712);
  });
});
