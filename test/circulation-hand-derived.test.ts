import { describe, expect, it } from "vitest";
import { compile, describe as describePlan } from "../src/index.js";

/**
 * The ONE circulation gate whose expected answer does not come out of the compiler
 * (`docs/backlog.md` G.11).
 *
 * Every other circulation law in this repository is RELATIVE. `test/path-monotonic.test.ts`
 * compares the grid to itself under a perturbation; `test/nav-grid-scale.test.ts` compares
 * one resolution to another; the byte-identity digests pin today's output against
 * yesterday's. All of them stay green on a grid that models the wrong building — which is
 * exactly what shipped for every curved plan until v1.33.0, when the nav grid was found to
 * be rasterising each curved wall as the straight CHORD between its arc endpoints. On
 * `examples/library.arch` that moved one walk by 800 mm with no room dropped, no diagnostic
 * changed and no drawing moved, and NOTHING saw it.
 *
 * So this file does the exercise that work did not: it computes a walk BY HAND, from the
 * geometry, outside the system, and asserts the compiler reproduces it.
 *
 * ===========================================================================
 * # Fixture 1 — THE DRUM (the primary)
 *
 * One rectangular room, 20100 x 10100 mm at the origin, inside a 200 mm exterior ring whose
 * CENTRELINE is the room's own rectangle. One entrance on the west wall. One 200 mm closed
 * circular drum in the west half of the room, written as its two semicircles. The target is
 * the room's own measured point, which lies EAST of the drum; the entrance is west of it.
 *
 *   circle centre C = (5000, 5000), radius R = 3000
 *   written as (8000,5000) -> arc -> (2000,5000) -> arc -> (8000,5000), both radius 3000
 *
 * Chord = 2R exactly, so `arcFromChord`'s offset `sqrt(r^2 - (c/2)^2)` is 0 and the centre
 * IS the chord midpoint with no floating residue, and each sweep is exactly +/-pi.
 *
 * ## Step 1 — the grid
 *
 * The grid's extent is the union of the ROOM boxes, so here it is the room itself, and
 * `navCellSizeMm(area)` is `max(100, ceil(sqrt(area / 250000)))`. Area = 20100 x 10100 =
 * 203,010,000 mm^2 and `sqrt(203010000 / 250000) = 28.50`, so the cell is the 100 mm floor:
 *
 *   cell = 100 mm,  nx = 201, ny = 101,  cell (i,j) has centre (100i + 50, 100j + 50)
 *
 * The fixture deliberately does NOT declare `grid 100`. That statement would snap the
 * door's `at (0,5050)` to a multiple of 100, moving the seed one row and making the walk
 * 16,000 — measured, not guessed. The plan is un-snapped so the derivation below holds.
 *
 * ## Step 2 — the blocked cells, and why no rounding can move them
 *
 * A cell is blocked when its CENTRE lies within `thickness/2` of a wall centreline.
 *
 *   shell (half = 100): centrelines x = 0, x = 20100, y = 0, y = 10100. Column i=0 has
 *     cx = 50, which is 50 from x = 0, so it blocks; i=1 has cx = 150 and does not. Exactly
 *     the one-cell border ring is blocked, leaving i in [1,199], j in [1,99].
 *
 *   drum (half = 100): blocked iff 2900 <= |p - C| <= 3100.
 *
 * Put `u = (x - 5000)/50` and `v = (y - 5000)/50`. A cell centre has `x = 100i + 50`, so
 * `u = 2i - 99` and likewise `v = 2j - 99`: **both are always ODD**. Since
 * `|p - C|^2 = 2500(u^2 + v^2)`, the drum blocks exactly when
 *
 *   3364 <= u^2 + v^2 <= 3844
 *
 * An odd square is `1 (mod 8)`, so `u^2 + v^2 = 2 (mod 8)` for every cell centre — while
 * `3364 = 4 (mod 8)` and `3844 = 4 (mod 8)`. **Neither bound is attainable.** The
 * production `<=` and this derivation can therefore never disagree at any rounding: there
 * is no cell within reach of the decision boundary, so the answer below is exact rather
 * than merely stable. (The `jitter` cases prove the same thing operationally.)
 *
 * The drum also provably SEALS at this resolution: a 4-connected step changes `u^2 + v^2`
 * by `|4u +/- 4|`, at most 232 for any cell strictly inside the drum, while the blocked
 * annulus is 480 wide in that quantity — so no single step can cross it.
 *
 * ## Step 3 — the two measured endpoints
 *
 * SOURCE. `seedCell` starts at the door's own cell and steps INWARD perpendicular to the
 * room side it sits on. The door is at (0, 5050); `|0 - rb.x| = 0 <= tol`, so the step is
 * +x from cell (0,50). Cell (0,50) is the blocked border ring, so the seed is cell (1,50),
 * centre (150, 5050) — free, since `|p - C| = sqrt(4850^2 + 50^2) = 4850.26`.
 *
 * TARGET. A rectangular room's seed point is its bbox centre, (10050, 5050) — which is
 * EXACTLY the centre of cell (100,50), so the nearest free cell is that cell at distance 0
 * and there is no tie to break. Free: `|p - C| = sqrt(5050^2 + 50^2) = 5050.25`. It is
 * reachable (Step 4), so `reachableRep` returns the anchor unchanged.
 *
 *   source = (i,j) = (1,50)      target = (100,50)
 *
 * ## Step 4 — the walk
 *
 * The metric is a 4-connected uniform-cost BFS, so `walkDistanceMm = hops x 100`; the walk
 * is grid MANHATTAN.
 *
 * The source is west of the drum and the target east of it, so the path must cross the
 * column through the drum's centre, i = 50 (`cx` = 5050, `u` = 1). There it is blocked iff
 * `3363 <= v^2 <= 3843`, i.e. `|v|` in {59, 61} — rows j in {19, 20, 79, 80}. So the
 * crossing happens at `j >= 81` or `j <= 18`.
 *
 * LOWER BOUND. Horizontal steps >= 99, since i runs 1 -> 100 and the path may as well be
 * monotone. Vertical steps: the path starts and ends at j = 50 and must attain j >= 81 or
 * j <= 18, so >= `min(2 x 31, 2 x 32) = 62`. Hence hops >= 161.
 *
 * UPPER BOUND. Attained, by three monotone legs:
 *
 *   (1,50)   -> (1,81)     up column i=1        31 hops
 *   (1,81)   -> (100,81)   east along row j=81  99 hops
 *   (100,81) -> (100,50)   up column i=100      31 hops
 *
 * Row j=81 has `v = 63`, so `u^2 + v^2 >= 3969 > 3844` for every column: the drum never
 * reaches it. Columns i=1 and i=100 are 4850 and 5050 from C at their nearest, both far
 * outside the annulus.
 *
 *   hops = 31 + 99 + 31 = 161        walkDistanceMm = 16100
 *
 * ## Step 5 — the straight line, and the control
 *
 * `detourRatio` divides that walk by the straight-line distance between the SAME two cell
 * centres: `|(10050,5050) - (150,5050)| = 9900`. 16100 / 9900 = 1.6263, rounded to 1.63.
 *
 * The control is the identical plan with `w_drum` DELETED: the row-j=50 line is then
 * unobstructed and the walk must read exactly `(100 - 1) x 100 = 9900`, ratio 1. That
 * number independently re-derives Step 3 — it can only come out right if the source really
 * is column 1 and the target column 100 — and **the 6200 mm between the two figures is the
 * drum's entire contribution to the answer**, which is what makes the 16100 a test of the
 * curve rather than of the room.
 *
 * ## Step 6 — facet invariance
 *
 * The same circle written as EIGHT arcs instead of two, on 3-4-5 lattice points
 * (2400^2 + 1800^2 = 3000^2), must read exactly 16100 as well. Same circle, eight times as
 * many segments, eight times as many endpoints — so a rasteriser that fell back on chords,
 * or that mishandled a segment end, would give a different number for the same building.
 * This is the degenerate, exact form of a polygonal-refinement differential, which is why
 * one is not built separately.
 *
 * ===========================================================================
 * # Fixture 2 — THE OPEN ARC (a second shape class)
 *
 * **These two are not duplicates and must not be de-duplicated.** The drum is a closed curve
 * with no free END, and its forced detour is purely VERTICAL; this one is an open run whose
 * free end exercises the round cap the drum never touches, and whose detour is forced on the
 * X axis. They also fail differently under a plant: the drum's answer is protected by an
 * exact mod-8 argument, this one's by measured margins, so a rounding-shaped regression would
 * reach one before the other. Deleting either narrows the class this file covers.
 *
 * Concretely: a semicircular arc bulging west with a FREE north end (so the mask's round cap
 * and the drawing's square one both matter) and a tail carried out through the south wall, so
 * the only way into the pocket is round that end.
 *
 *   room 12100 x 8100 at the origin, 200 mm shell, entrance west at (0,4050)
 *   circle centre C = (8000, 4000), R = 3000; arc = the WEST semicircle from
 *   N = (8000,1000) (free end) to S = (8000,7000), then a tail S -> (8000,8200)
 *
 * Same Step 1: area 98,010,000, `sqrt(98010000/250000) = 19.80`, so cell = 100, nx = 121,
 * ny = 81. Same Step 3 mechanics: source cell (1,40) at (150,4050); the room's bbox centre
 * (6050,4050) is exactly cell (60,40)'s centre, free at 1049 mm from the arc.
 *
 * Around the free end N the arithmetic is (all mm):
 *
 *   (7950,  850)  |p-C| = sqrt(50^2 + 3150^2) = 3150.40 -> d = 150.40  FREE    (+50.4)
 *   (7950,  950)  |p-C| = sqrt(50^2 + 3050^2) = 3050.41 -> d =  50.41  blocked (-49.6)
 *   (7950, 1050)  |p-C| = sqrt(50^2 + 2950^2) = 2950.42 -> d =  49.58  blocked (-50.4)
 *   (8050,  850)  east of the sweep, |p-N| = sqrt(50^2+150^2) = 158.11 FREE    (+58.1)
 *   (8050,  950)  east of the sweep, |p-N| = sqrt(50^2+ 50^2) =  70.71 blocked (-29.3)
 *   (8050, 1050)  east of the sweep, |p-N| = 70.71                     blocked (-29.3)
 *   (8150,  950)  east of the sweep, |p-N| = sqrt(150^2+50^2)= 158.11  FREE    (+58.1)
 *
 * The bracketed figure is the margin to the `d <= 100` decision. The tightest one the
 * answer depends on is 29.3 mm — the best a round cap can do, since near a lattice CORNER
 * the only available distances are 70.71 and 158.11, which straddle 100 as widely as any
 * placement can. This fixture therefore has no mod-8 argument and leans on the `jitter`
 * cases instead; that asymmetry is the reason the drum is the primary.
 *
 * LOWER BOUND. Extend the barrier by the ray {x = 8000, 0 <= y <= 1000} from N to the north
 * wall: barrier plus ray separates the room into a west part (source) and the pocket east
 * of the arc (target), so the path must cross that ray — between columns 79 and 80, at a
 * row with cy < 1000. Row j=9 is blocked at both columns, so the crossing is at j <= 8.
 * Separately the blocked band runs unbroken from the south wall up the tail, round the arc
 * and back east to the cap cells (79,9), (79,10), (80,9), (80,10); its east extremity is
 * column 80 and column 81 is free at every row, so descending into the pocket needs i >= 81.
 *
 *   horizontal >= (81 - 1) + (81 - 60) = 101      vertical >= (40 - 8) x 2 = 64
 *
 * UPPER BOUND, attained: up column 1 (32), east along row j=8 (80), down column 81 (32),
 * west along row j=40 (21) = **165 hops, 16,500 mm**. Row j=8 is free throughout (at
 * cy = 850 the radial distance is at least 3150, so `d >= 150`); column 81 is 150 mm clear
 * of N, of S and of the tail; row j=40 is free from i=51 east, the arc crossing it at
 * cx = 5000.4. Straight line = 5900, so `detourRatio` = 16500/5900 = 2.80.
 *
 * Its control is the same wall written as its own literal CHORD — the wall the pre-v1.33
 * rasteriser modelled — which puts the target WEST of the barrier and collapses the walk to
 * the unobstructed row-j=40 line, 5900 mm.
 *
 * ===========================================================================
 * ## If this test goes red
 *
 * The derivations above are the specification and the compiler is the thing under test.
 * Do NOT re-bless a number. Work through the steps against the current code and say which
 * one stopped holding: the cell size (Step 1), the rasterisation rule (Step 2), the seeding
 * or the anchor (Step 3), or the search (Step 4). A change to any of those is a change to
 * what `describe().circulation` MEANS, and it needs saying out loud in `CHANGELOG.md`
 * before this file is touched.
 */

const SHELL_20 = `  wall id=shell exterior thickness 200 { (0,0) (20100,0) (20100,10100) (0,10100) close }
  room id=r_hall at (0,0) size 20100x10100 label "Hall"
  door id=d_main at (0,5050) width 1000 wall shell swing into r_hall`;

/** The drum, parameterised only so the jitter cases can nudge it off the lattice. */
function drum(dx = 0, dy = 0, dr = 0): string {
  const cx = 5000 + dx;
  const cy = 5000 + dy;
  const r = 3000 + dr;
  return `plan "Drum" {
  units mm
  wall id=w_drum partition thickness 200 {
    (${cx + r},${cy}) arc (${cx - r},${cy}) radius ${r} arc (${cx + r},${cy}) radius ${r}
  }
${SHELL_20}
}`;
}

/** The identical plan with the drum deleted — the control for Step 5. */
const NO_DRUM = `plan "Drum" {
  units mm
${SHELL_20}
}`;

/** The same circle as EIGHT arcs on 3-4-5 lattice points (2400^2 + 1800^2 = 3000^2). */
const DRUM_FACETED = `plan "Drum faceted" {
  units mm
  wall id=w_drum partition thickness 200 {
    (8000,5000) arc (7400,6800) radius 3000 arc (5000,8000) radius 3000 arc (2600,6800) radius 3000
    arc (2000,5000) radius 3000 arc (2600,3200) radius 3000 arc (5000,2000) radius 3000
    arc (7400,3200) radius 3000 arc (8000,5000) radius 3000
  }
${SHELL_20}
}`;

const SHELL_12 = `  wall id=shell exterior thickness 200 { (0,0) (12100,0) (12100,8100) (0,8100) close }
  room id=r_hall at (0,0) size 12100x8100 label "Hall" uses living
  door id=d_in at (0,4050) width 900 wall shell swing in`;

/** Fixture 2: an open arc with a free north end and a tail through the south wall. */
function openArc(o: { bx?: number; y0?: number; y1?: number; r?: number } = {}): string {
  const bx = o.bx ?? 8000;
  const y0 = o.y0 ?? 1000;
  const y1 = o.y1 ?? 7000;
  const r = o.r ?? 3000;
  return `plan "Open Arc" {
  units mm
  wall id=barrier partition thickness 200 { (${bx},${y0}) arc (${bx},${y1}) radius ${r} ccw (${bx},8200) }
${SHELL_12}
}`;
}

/** Fixture 2's control: that arc replaced by the straight line between its own endpoints. */
const OPEN_ARC_CHORD = `plan "Open Arc (chord)" {
  units mm
  wall id=barrier partition thickness 200 { (8000,1000) (8000,7000) (8000,8200) }
${SHELL_12}
}`;

/** The one room's circulation entry, or an explanatory throw. */
function hall(src: string): { walkDistanceMm: number; detourRatio: number; cellSizeMm: number } {
  const s = describePlan(src);
  const c = s.circulation;
  if (!c) throw new Error("no circulation model — the plan lost its entrance");
  const r = c.rooms.find((x) => x.roomId === "r_hall");
  if (!r) {
    throw new Error(
      `r_hall is not measured: blocked=${JSON.stringify(c.blocked)} unmeasured=${JSON.stringify(c.unmeasured)}`,
    );
  }
  return { walkDistanceMm: r.walkDistanceMm, detourRatio: r.detourRatio, cellSizeMm: c.cellSizeMm };
}

const errorsIn = (src: string): string[] =>
  compile(src)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code ?? "?");

describe("G.11 — a curved walk, derived by hand: the drum", () => {
  it("compiles clean, so the derivation is about geometry and not about errors", () => {
    expect(errorsIn(drum())).toEqual([]);
    expect(errorsIn(NO_DRUM)).toEqual([]);
    expect(errorsIn(DRUM_FACETED)).toEqual([]);
  });

  it("grids at 100 mm, as Step 1 assumes", () => {
    expect(hall(drum()).cellSizeMm).toBe(100);
  });

  it("the walk is 16100 mm — 161 hops of 100 mm (Steps 2-4)", () => {
    expect(hall(drum()).walkDistanceMm).toBe(16100);
  });

  it("the detour ratio is 16100 / 9900 = 1.63 (Step 5)", () => {
    expect(hall(drum()).detourRatio).toBe(1.63);
  });

  it("the DRUM is load-bearing: deleting it gives 9900 mm, so it contributes 6200", () => {
    const control = hall(NO_DRUM);
    expect(control.walkDistanceMm).toBe(9900);
    expect(control.detourRatio).toBe(1);
    expect(hall(drum()).walkDistanceMm - control.walkDistanceMm).toBe(6200);
  });

  it("is facet-invariant: the same circle as EIGHT arcs still reads 16100 (Step 6)", () => {
    expect(hall(DRUM_FACETED).walkDistanceMm).toBe(16100);
  });

  it.each([
    ["centre +1 x", 1, 0, 0],
    ["centre -1 x", -1, 0, 0],
    ["centre +1 y", 0, 1, 0],
    ["centre -1 y", 0, -1, 0],
    ["centre +2 x", 2, 0, 0],
    ["centre -2 y", 0, -2, 0],
    ["radius +1", 0, 0, 1],
    ["radius -1", 0, 0, -1],
  ])("jitter (%s) does not move the answer off 16100", (_name, dx, dy, dr) => {
    // The drum is jittered, never the whole plan: translating everything would move the
    // grid origin with it (the extent is the room's own bbox), so it tests nothing.
    expect(hall(drum(dx, dy, dr)).walkDistanceMm).toBe(16100);
  });
});

describe("G.11 — a second shape class: an open arc with a free end", () => {
  it("compiles clean", () => {
    expect(errorsIn(openArc())).toEqual([]);
    expect(errorsIn(OPEN_ARC_CHORD)).toEqual([]);
  });

  it("the walk is 16500 mm — 165 hops, with the detour forced on the X axis", () => {
    const h = hall(openArc());
    expect(h.cellSizeMm).toBe(100);
    expect(h.walkDistanceMm).toBe(16500);
    expect(h.detourRatio).toBe(2.8);
  });

  it("the CURVE is load-bearing: the same wall as its own chord measures 5900 mm", () => {
    const chord = hall(OPEN_ARC_CHORD);
    expect(chord.walkDistanceMm).toBe(5900);
    expect(chord.detourRatio).toBe(1);
    expect(hall(openArc()).walkDistanceMm).not.toBe(chord.walkDistanceMm);
  });

  it("survives a 1 mm nudge anywhere, which is the cap's substitute for a mod-8 proof", () => {
    const nudges: Array<[string, Parameters<typeof openArc>[0]]> = [
      ["barrier 1 mm west", { bx: 7999 }],
      ["barrier 1 mm east", { bx: 8001 }],
      ["arc ends spread 1 mm", { y0: 999, y1: 7001, r: 3001 }],
      ["arc ends closed 1 mm", { y0: 1001, y1: 6999, r: 2999 }],
      ["radius +1 mm", { r: 3001 }],
      ["radius +10 mm", { r: 3010 }],
    ];
    const out = nudges.map(([name, o]) => `${name}: ${hall(openArc(o)).walkDistanceMm}`);
    expect(out).toEqual(nudges.map(([name]) => `${name}: 16500`));
  });
});
