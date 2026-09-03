import { describe, expect, it } from "vitest";
import { censusOf, EPS_MM, shippedStoreys, type Census } from "./wall-solid.js";

/**
 * The GEOMETRIC RESIDUAL: the nav grid's wall mask against the DRAWN wall solid, over
 * every shipped example and every storey (`docs/backlog.md` G.11).
 *
 * ## Why this exists
 *
 * Until v1.33.0 the nav grid rasterised each curved wall as the straight CHORD between its
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
 * ## The census, measured BEFORE any assertion existed (2026-09-04, 30 examples)
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
 * arithmetic of a stated cause before building on it** (`docs/backlog.md`'s preamble).
 *
 * And `d <= half + 1` — one millimetre — is invisible to the CORPUS but not to this gate. A
 * SHA-256 sweep of `describe()`, `lint()` and every storey's SVG over all 30 examples moves
 * **0 of 95 artifacts** under that plant, while the census still catches 8 cells on
 * `aquarium` at up to 0.9 mm, because a curved wall puts cell centres at arbitrary
 * distances rather than on multiples of 50. So the gate's resolution is sub-millimetre on
 * curved geometry, and strictly finer than anything the shipped corpus can express.
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
