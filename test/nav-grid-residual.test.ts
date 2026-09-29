import { describe, expect, it } from "vitest";
import { buildDoorAccessGraph, DEFAULT_TOL, resolvePlan } from "../src/analyze.js";
import { computeCirculationOverlay } from "../src/analyze/circulation.js";
import type { RDoor, RFurniture, ROpening, RRoom } from "../src/ir.js";
import { describe as describePlan } from "../src/index.js";
import { censusOf, EPS_MM, shippedStoreys, type Census } from "./wall-solid.js";

/**
 * The GEOMETRIC RESIDUAL: the nav grid's wall mask against the DRAWN wall solid, over
 * every shipped example and every storey.
 *
 * ## Why this exists
 *
 * The nav grid once rasterised each curved wall as the straight CHORD between its
 * arc endpoints — not a coarser version of the wall, a wall somewhere else. It survived
 * three tiers of testing because every circulation law in the suite is RELATIVE: the
 * monotonicity property, the resolution ladder and the byte-identity digests each compare
 * the system to ITSELF, and all of them stay green on a grid that models the wrong
 * building. `examples/library.arch`'s `r_ref` walk moved 800 mm on the fix with no room
 * dropped, no diagnostic changed and no drawing moved.
 *
 * This gate is the missing cross-check: the model against the DRAWING. The comparands, the
 * two structural exclusions and the argument for why there is **no magnitude tolerance at
 * all** are documented in `test/wall-solid.ts`; read that header before touching this one.
 *
 * ## The census, measured BEFORE any assertion existed (30 examples)
 *
 *   storeys 35   skipped 0
 *   cells 1,209,653   examined 1,186,861   agree 1,178,103
 *   onBoundary 8,758   inexplicable 0
 *   maxOnBoundaryOffset 2.558e-13 mm      2.0 s
 *
 * So on the shipped tree the two predicates agree EXACTLY, everywhere outside a vertex
 * disc, with no tolerance of any kind. The 8,758 exceptions are all boundary TIES — cell
 * centres landing on a drawn face, where `d <= half` is inclusive and the winding rule is
 * half-open — and the worst of them sits 2.6e-13 mm from that face, seven orders of
 * magnitude under `EPS_MM`. That is the measured headroom: the tie set is a genuine
 * measure-zero artifact, not a fudge with room in it.
 *
 * ## Non-vacuity — four planted faults, all measured
 *
 * Each planted into `rasteriseWallSegments` and re-run through the same census:
 *
 *   plant                                     storeys firing   worst residual
 *   `distPointToSeg` for arcs (the chord bug)      4 of 35        7829.3 mm
 *   `d <= half + cell`                            33 of 35         100.0 mm
 *   `d <= half - cell`                            33 of 35         100.0 mm
 *   `d <= half * 1.5`                             33 of 35         299.4 mm
 *   `d <= half + 1`                                1 of 35           0.9 mm
 *
 * The chord bug **discriminates**: the four are exactly `aquarium` L0, `hexagon-pavilion`
 * L0, `hillside-villa` L0 and `library` L0 — every curved source, and ZERO on the other 31
 * storeys, `hillside-villa` L1 included, whose storey carries no arc. The `+ cell` and
 * `- cell` plants have the OPPOSITE signature — over- and under-blocking along wall RUNS,
 * on nearly every storey, curved or not — which is what shows the gate is sensitive to the
 * PREDICATE and not merely to arcs.
 *
 * **Two calibration notes worth keeping, because both correct a plausible guess.**
 *
 * `d <= half * 1.5` was predicted to be invisible, on the grounds that `h` in {50, 150} puts
 * the extra shell between cell centres. **That prediction was wrong, and the arithmetic is
 * why:** the corpus's commonest wall is `thickness 200`, so `h = 100`, `half * 1.5 = 150`, and
 * an axis-aligned centreline places cell centres at exactly 150 — which the inclusive `<=`
 * admits. It is wrong in general too, because `d` is a EUCLIDEAN distance to a segment or an
 * arc: near an endpoint, and anywhere on an angled or curved wall, the centres land at 70.71 /
 * 111.80 / 158.11 and are nowhere near multiples of 50. Measured, rather than reasoned:
 * `test/circulation-hand-derived.test.ts` moves 16500 -> 16400 and this file goes red on 33
 * storeys at 299.4 mm. **Scale a plant to the CELL, never to the thickness — and check the
 * arithmetic of a stated cause before building on it.**
 *
 * And `d <= half + 1` — one millimetre — is invisible to the CORPUS but not to this gate. A
 * SHA-256 sweep of `describe()`, `lint()` and every storey's SVG over all 30 examples moves
 * **0 of 95 artifacts** under that plant, while the census still catches 8 cells on
 * `aquarium` at up to 0.9 mm, because a curved wall puts cell centres at arbitrary
 * distances rather than on multiples of 50. So the gate's resolution is sub-millimetre on
 * curved geometry, and strictly finer than anything the shipped corpus can express.
 *
 * ## A thin wall's centreline cover (backlog C.1) — the one structural class it added
 *
 * A partition thinner than a cell used to block nothing: an 80 mm wall on a lattice line of
 * 100 mm cells has no cell centre within 40 mm of it, so the mask agreed with the drawing
 * cell for cell and the walk still leaked through the wall. The rasteriser now also blocks
 * every cell a wall's CENTRELINE passes through (touches its closed square). For a wall of
 * at least `cell·√2` (~142 mm) that adds nothing — a touched cell's centre is within
 * `cell·√2/2` of the line, which the centre test already blocks — and on the shipped
 * corpus it adds nothing either: the census above is unchanged, and no cell falls in the
 * new class. A thinner wall's covered cells are blocked though the drawn solid misses
 * their centres; the census counts them as `centrelineCover`, from the segment geometry in
 * `test/wall-solid.ts`, never as a residual. The class is shown non-vacuous below on a
 * planted 80 mm partition: the leak law is red on the centre-only rule and green with the
 * cover, and the census names the covered cells.
 *
 * (Blocking every cell the whole BAND passes through was measured and rejected: a square
 * predicate puts the drum fixture of `test/circulation-hand-derived.test.ts` exactly on its
 * decision boundary — its faces are tangent to lattice lines — so a 1 mm nudge moves a
 * hand-derived walk, 16100 → 16300.)
 *
 * ## If this test goes red
 *
 * It is naming a place where the circulation model and the drawing describe different
 * buildings, and the drawing is the one the user sees. Read the reported cell and residual
 * first. A residual in the hundreds of millimetres is a wall in the wrong place (the chord
 * class). A small one is a structural difference that has escaped the two exclusions — name
 * the class and excise it BY GEOMETRY, exactly as the vertex disc and the boundary tie are
 * excised. **Never enlarge the vertex radius, add a magnitude tolerance, or drop an example
 * to go green**: `test/wall-solid.ts` explains why any tolerance large enough to admit a
 * legitimate mitre would already swallow a curved wall's whole under-direction residual.
 */

/** One pass over the corpus, shared by every case below. */
const CENSUS: Array<{ name: string; storey: number; census: Census | null }> = shippedStoreys().map((s) => ({
  name: s.name,
  storey: s.storey,
  census: censusOf(s),
}));

const measured = CENSUS.flatMap((c) => (c.census ? [c.census] : []));

describe("G.11 — the nav grid's walls agree with the drawn walls", () => {
  it("covers every storey of every shipped example, so nothing below is vacuous", () => {
    // A storey drops out only when it has no room (no grid) or no wall. If that list ever
    // becomes non-empty, coverage shrank and the laws below narrowed with it.
    const skipped = CENSUS.filter((c) => !c.census).map((c) => `${c.name} L${c.storey}`);
    expect(skipped).toEqual([]);
    expect(measured.length).toBeGreaterThanOrEqual(35);
    // Floors, not the measured figures, so ordinary corpus churn does not touch this file.
    const examined = measured.reduce((n, c) => n + c.examined, 0);
    expect(examined).toBeGreaterThanOrEqual(1_000_000);
    // The four curved sources are the class this gate exists for; each must contribute.
    for (const name of ["aquarium", "hexagon-pavilion", "hillside-villa", "library"]) {
      const best = Math.max(0, ...measured.filter((c) => c.name === name).map((c) => c.examined));
      expect(best, `${name} examined too few cells`).toBeGreaterThanOrEqual(5_000);
    }
  });

  it("the mask and the drawn solid agree EXACTLY, with no tolerance, on every storey", () => {
    const offenders = measured
      .filter((c) => c.inexplicable.length > 0)
      .map((c) => {
        const w = c.inexplicable.reduce((a, b) => (b.residualMm > a.residualMm ? b : a));
        return (
          `${c.name} L${c.storey}: ${c.inexplicable.length} of ${c.examined} examined; worst ` +
          `${w.kind}-block at (${w.x},${w.y}), ${w.residualMm.toFixed(1)} mm from the nearest drawn face`
        );
      });
    expect(offenders).toEqual([]);
  });

  it("every disagreement that does exist is a measure-zero boundary tie", () => {
    // The tie set is real (a 100 mm partition on a 100 mm grid puts cell centres exactly on
    // its faces) and must stay negligible in MAGNITUDE, or `EPS_MM` has quietly become a
    // tolerance. Measured worst: 2.558e-13 mm.
    const worst = Math.max(0, ...measured.map((c) => c.maxOnBoundaryOffsetMm));
    expect(worst).toBeLessThanOrEqual(EPS_MM);
    expect(worst).toBeLessThan(1e-9);
    // ...and it must not be empty, or the classification is dead code hiding real findings.
    expect(measured.reduce((n, c) => n + c.onBoundary, 0)).toBeGreaterThan(0);
  });
});

describe("C.1 — a wall thinner than a cell still blocks (the centreline cover)", () => {
  /** Two rooms split by a partition of `t` mm on the lattice line x = 3000, joined only by a
   *  door at the far end, so the walk to `b` must go round by the door. */
  const SPLIT = (t: number) => `plan "Split" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall id=mid partition thickness ${t} { (3000,0) (3000,4000) }
  room id=a at (0,0) size 3000x4000 label "Hall"
  room id=b at (3000,0) size 3000x4000 label "Store"
  door id=d_ext at (1500,0) width 900 wall shell
  door id=d_in at (3000,3500) width 800 wall mid
}
`;
  const walkB = (t: number) => describePlan(SPLIT(t)).circulation?.rooms.find((r) => r.roomId === "b")?.walkDistanceMm;

  it("walks an 80 mm partition's rooms exactly as a 100 mm one's — round by the door, never through the wall", () => {
    // The 100 mm twin blocks under both rules (its faces put cell centres at exactly 50 mm),
    // so it is the control; an 80 mm wall leaked on the centre sample alone.
    expect(walkB(100)).toBeDefined();
    expect(walkB(80)).toBe(walkB(100));
    // Not vacuous: the door really is the long way round (straight through the wall from
    // the entrance to the store's centre is about 4800 mm; round by the door is 7000).
    expect(walkB(100)!).toBeGreaterThanOrEqual(6000);
  });

  it("the census names the covered cells, and they are the only disagreement", () => {
    const c = censusOf({ name: "split-80", storey: 0, ir: resolvePlan(SPLIT(80)).ir! })!;
    expect(c.centrelineCover).toBeGreaterThan(0);
    expect(c.inexplicable).toEqual([]);
    // The 100 mm control has none: its cells are blocked by the centre test.
    expect(censusOf({ name: "split-100", storey: 0, ir: resolvePlan(SPLIT(100)).ir! })!.centrelineCover).toBe(0);
  });

  it("a thin CURVED wall blocks too: a closed 80 mm drum keeps the walk out of its interior", () => {
    // A hall with a closed drum (two 2000 mm-radius arcs, no door) round its own centre. The
    // expectation is geometric, not the rasteriser's: if the drum blocks, the hall is measured
    // to the nearest cell the entrance REACHES, which lies outside the drum (≥ R − t/2 from
    // its centre); if it leaks, to the centre cell itself. On the centre rule alone the 80 mm
    // drum leaked (the walk ended 70.7 mm from the centre, 2800 mm long); the 200 mm control
    // blocks under both rules.
    const DRUM = (t: number) => `plan "Drum" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  wall id=drum partition thickness ${t} { (5000,3000) arc (1000,3000) radius 2000 arc (5000,3000) radius 2000 }
  room id=hall at (0,0) size 6000x6000 label "Hall"
  door id=d at (0,3000) width 900 wall shell
}`;
    for (const t of [80, 200]) {
      const ir = resolvePlan(DRUM(t)).ir!;
      const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
      const doors = ir.elements.filter((e): e is RDoor => e.kind === "door");
      const openings = ir.elements.filter((e): e is ROpening => e.kind === "opening");
      const furniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
      const access = buildDoorAccessGraph(rooms, doors, DEFAULT_TOL, undefined, openings);
      const o = computeCirculationOverlay(rooms, ir.walls, doors, openings, furniture, access, DEFAULT_TOL)!;
      const end = o.rooms[0]!.path.at(-1)!;
      expect(Math.hypot(end.x - 3000, end.y - 3000), `t = ${t}`).toBeGreaterThanOrEqual(2000 - t / 2);
      expect(o.rooms[0]!.fallback, `t = ${t}`).toBe(true);
    }
    // The census exercises the arc branch of the cover class, with nothing unexplained.
    const c = censusOf({ name: "drum-80", storey: 0, ir: resolvePlan(DRUM(80)).ir! })!;
    expect(c.centrelineCover).toBeGreaterThan(0);
    expect(c.inexplicable).toEqual([]);
  });

  it("adds no covered cell anywhere in the shipped corpus", () => {
    expect(measured.reduce((n, c) => n + c.centrelineCover, 0)).toBe(0);
  });
});
