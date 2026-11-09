/**
 * The taste equivariance law (ADR 0032; design §4): `taste()` is INVARIANT under a pure
 * translation and under every proper D4 rotation applied with `north` carried along; under a D4
 * frame with `north` FIXED, every criterion but R12 is invariant. R12 (dwelling aspect) is the
 * only compass reader: it counts the compass facings of the habitable windows and, with `site`,
 * names the pole side, so a turn or a mirror under a fixed north relabels its facings (and, with
 * `site`, may move its score). The frames are the equivariance oracle's own (`test/helpers/d4-oracle.ts`):
 * P₀ is the example placed whole by `place … as g`, gP the same placement turned or mirrored, so
 * every id is `g.<id>` on both sides and the reports compare byte for byte.
 *
 * - north carried: the whole report (mirrors, whose compass a turn of `north` cannot carry, only
 *   on a plan with no `site`, comparing R12's score and count but not its facing letters);
 * - north fixed (PS5.1b): the report with R12 and what it feeds (the `light` subscore, the total,
 *   the coverage weight) set aside, on every example and every turn and mirror; the validity
 *   verdict (and so the cap) is set aside too, because lint reads the compass on a `site` plan.
 *
 * One part of the report is compared under the translation only: `validity.drafting`, the
 * drafting-layer lint findings. `W_ANNOTATION_OVERLAP` (PS2.12) reads the drawn sheet, whose text
 * stays upright when the building turns or flips, so where a label lands relative to a symbol is
 * a fact about the page (the d4 oracle's `sheet` class). It never caps and never scores, so the
 * score, the criteria and the validity verdict are still compared under every frame.
 */

import { describe, expect, it } from "vitest";
import { taste, type TasteReport } from "../src/index.js";
import {
  astOf,
  corpusElements,
  D4_TEST_ELEMENTS,
  ELIGIBLE_EXAMPLES,
  EXAMPLES_WORLD,
  rotateNorth,
  wrapperSource,
} from "./helpers/d4-oracle.js";

const report = (src: string): TasteReport => taste(src, { world: EXAMPLES_WORLD });

/** How a report is compared: `sheet` false leaves out its sheet-reading part (see above); `r12`
 *  says how much of R12 is compared ("all", "count": its score and count but not its words, or
 *  "none": R12 and what it feeds set aside). */
function view(r: TasteReport, sheet: boolean, r12: "all" | "count" | "none"): string {
  const validity = sheet ? r.validity : { ...r.validity, drafting: "compared under translation only" };
  if (r12 === "all") return JSON.stringify({ ...r, validity });
  if (r12 === "count")
    return JSON.stringify({
      ...r,
      validity,
      criteria: r.criteria.map((c) => (c.id === "R12" ? { ...c, message: "", evidence: [] } : c)),
    });
  return JSON.stringify({
    ...r,
    // The validity verdict is lint's, and lint has its own compass reader on a plan with `site`
    // (W_ROOM_NOT_EQUATOR_FACING), so under a fixed north the cap is set aside with the total.
    validity: null,
    capped: null,
    score: null,
    uncapped: null,
    subscores: { ...r.subscores, light: null },
    coverage: { ...r.coverage, weight: null, skipped: r.coverage.skipped.filter((s) => s.criterion !== "R12") },
    criteria: r.criteria.filter((c) => c.id !== "R12"),
  });
}

describe("taste() is invariant under translation and D4 (north carried)", () => {
  it("covers the oracle's corpus", () => {
    expect(ELIGIBLE_EXAMPLES.length).toBeGreaterThan(20);
  });

  for (const rel of ELIGIBLE_EXAMPLES) {
    it(rel, () => {
      const ast = astOf(rel);
      const p0 = report(wrapperSource(rel, null));
      expect(p0.ok, `${rel} resolves when placed`).toBe(true);
      const site = ast.site !== undefined;
      const moved: string[] = [];
      // Proper rotations with north carried along, and the translation: the whole report.
      for (const g of D4_TEST_ELEMENTS.filter((x) => x.name !== "e" && !x.mirror)) {
        const north = g.translate ? ast.north : rotateNorth(ast.north, g.rotate / 90);
        const sheet = g.translate === true;
        if (view(report(wrapperSource(rel, g, { north })), sheet, "all") !== view(p0, sheet, "all")) moved.push(g.name);
      }
      // Mirrors (whose compass a turn of `north` cannot carry) on a plan with no site: every
      // criterion, and R12's score and count (a mirror relabels E and W, never their number).
      if (!site)
        for (const g of corpusElements(rel).filter((x) => x.mirror))
          if (view(report(wrapperSource(rel, g, { north: ast.north })), false, "count") !== view(p0, false, "count"))
            moved.push(g.name);
      expect(moved).toEqual([]);
    }, 120_000);
  }
});

describe("with north fixed, every criterion but R12 is invariant under D4", () => {
  for (const rel of ELIGIBLE_EXAMPLES) {
    it(rel, () => {
      const ast = astOf(rel);
      const p0 = view(report(wrapperSource(rel, null)), false, "none");
      const moved: string[] = [];
      for (const g of D4_TEST_ELEMENTS.filter((x) => x.name !== "e" && !x.translate))
        if (view(report(wrapperSource(rel, g, { north: ast.north })), false, "none") !== p0) moved.push(g.name);
      expect(moved).toEqual([]);
    }, 120_000);
  }
});
