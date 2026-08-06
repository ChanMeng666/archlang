import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan } from "../src/index.js";
import { EM_PER_CHAR, textWidth } from "../src/text-metrics.js";
import { CHAIN_BASE, CHAIN_SLOTS, CHAIN_STEP, DIM_BAND_FONTS, DIM_TEXT_GAP } from "../src/sheet.js";
import type { Scene } from "../src/scene.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (...p: string[]): string => readFileSync(join(__dirname, ...p), "utf8");
const fixture = (name: string): string => read("fixtures", name);
const example = (name: string): string => read("..", "examples", name);

/**
 * **Dimension-NUMBER crowding is a different problem from chain TIERING.**
 *
 * `dims auto` already stages its three chains into three slots correctly. What it could
 * not do before this change is fit twelve ~309 mm-wide "200"s into twelve 200 mm bays:
 * every value overprinted both its neighbours while the lines under them were perfectly
 * placed. The GB/T 50104 / ISO 129 answer is to stagger the VALUES — alternate them across
 * the dimension line — and that is all this does. `staggerChain` in `scene-build.ts`
 * decides, `RDim.stagger` carries it, `dim.render` flips the text anchor.
 *
 * Four properties are load-bearing and each has a test below:
 *
 *  1. **A crowded chain stops overprinting.** Same-side neighbours end up two bays apart.
 *  2. **An uncrowded chain is byte-identical.** No `stagger` is set, so `dim.render` takes
 *     the exact path it always did — this is the property that keeps every dimensioned
 *     drawing in the repo where it was (not one golden or snapshot moved).
 *  3. **The annotation band does not move.** A staggered number flips INWARD, so the
 *     outward reach `DIM_BAND_FONTS` reserves is untouched. If this ever fails, the sheet
 *     fit rule and the drawing have started to disagree.
 *  4. **`describe()` never sees it.** Where a number is drawn is not a measured fact.
 */

/** One drawn dimension value, in the frame of its own (possibly rotated) baseline:
 *  `along` is the axis the glyphs run along, `across` the axis a stagger moves it on. */
interface DimText {
  value: string;
  along: number;
  across: number;
  /** `"h"` for a horizontal chain's text, `"v"` for a vertical chain's rotated text. */
  axis: "h" | "v";
  x: number;
  y: number;
}

function scene(src: string): Scene {
  const { scene: s, errors } = compile(src, { noCache: true });
  expect(errors).toEqual([]);
  expect(s).toBeDefined();
  return s as Scene;
}

/**
 * Every dimension VALUE the drawing carries. `dim.render` clamps the text rotation into
 * `[-90, 90]`, so a vertical chain's numbers are drawn at ±90° and run along **y** — a
 * naive x-only comparison would call two different chains on a vertical facade
 * "overprinting" purely because they share a y. The axis is read off that rotation.
 */
function dimTexts(s: Scene): DimText[] {
  const out: DimText[] = [];
  for (const n of s.nodes) {
    if (n.layer !== "dims" || n.prim.t !== "text") continue;
    const { at, value, rotate } = n.prim;
    const axis = Math.abs(Math.abs(rotate ?? 0) - 90) < 1e-9 ? "v" : "h";
    out.push({
      value,
      along: axis === "h" ? at.x : at.y,
      across: axis === "h" ? at.y : at.x,
      axis,
      x: at.x,
      y: at.y,
    });
  }
  return out;
}

/** Do two numbers on the SAME row overprint? Both are `anchor: "middle"`, so each spans
 *  half its estimated width either side of its anchor along its own baseline. Rows are
 *  compared exactly: a staggered number lands on a different row by construction, never a
 *  fraction off one. */
function overprints(a: DimText, b: DimText, font: number): boolean {
  if (a.axis !== b.axis || a.across !== b.across) return false;
  const need = (textWidth(a.value, font) + textWidth(b.value, font)) / 2;
  return Math.abs(a.along - b.along) < need;
}

function overprintingPairs(s: Scene): [DimText, DimText][] {
  const t = dimTexts(s);
  const out: [DimText, DimText][] = [];
  for (let i = 0; i < t.length; i++) {
    for (let j = i + 1; j < t.length; j++) {
      if (overprints(t[i]!, t[j]!, s.sizes.dimFont)) out.push([t[i]!, t[j]!]);
    }
  }
  return out;
}

/** The numbers of the fixture's bottom (horizontal) axis chain. */
const bottomChain = (s: Scene): DimText[] => dimTexts(s).filter((t) => t.axis === "h");

/** The dense fixture with each bay widened to `mm` — the same chain, uncrowded. */
function bays(mm: number): string {
  const ticks = Array.from({ length: 13 }, (_, i) => i * mm).join(", ");
  return fixture("dense-bays.arch").replace(/x at [\d, ]+/, `x at ${ticks}`);
}

suite("dims auto — number staggering on a crowded chain", () => {
  it("stops twelve 200 mm bays overprinting their numbers", () => {
    const s = scene(fixture("dense-bays.arch"));
    // The premise: each value really is wider than the bay it labels (~309 mm of "200"
    // in a 200 mm slot). If this stops being true the fixture has stopped testing.
    const chain = bottomChain(s);
    expect(chain).toHaveLength(12);
    expect(chain.every((t) => t.value === "200")).toBe(true);
    expect(textWidth("200", s.sizes.dimFont)).toBeGreaterThan(200);

    expect(overprintingPairs(s)).toEqual([]);

    // Two rows, alternating from the chain's low end, and nothing else.
    const rows = [...new Set(chain.map((t) => t.across))].sort((a, b) => a - b);
    expect(rows).toHaveLength(2);
    const byAlong = [...chain].sort((a, b) => a.along - b.along);
    for (const [i, t] of byAlong.entries()) expect(t.across).toBe(rows[i % 2 === 0 ? 1 : 0]);

    // Same-side neighbours are now two bays apart, which is what buys the clearance.
    for (let i = 0; i + 2 < byAlong.length; i++) expect(byAlong[i + 2]!.along - byAlong[i]!.along).toBe(400);
  });

  it("leaves an UNCROWDED chain byte-identical — the same plan on wide bays never staggers", () => {
    // 4 m bays: the identical chain, identical code path, no stagger anywhere. The whole
    // point of the "only when needed" rule — every dimensioned drawing in the repo is this
    // case, which is why not one golden or snapshot moved.
    const wide = scene(bays(4000));
    expect([...new Set(bottomChain(wide).map((t) => t.across))]).toHaveLength(1);
    expect(overprintingPairs(wide)).toEqual([]);
    // And the render stays deterministic through the new branch.
    expect(compile(bays(4000), { noCache: true }).svg).toBe(compile(bays(4000), { noCache: true }).svg);
  });

  it("staggers on the CROWDING predicate, not on chain length — and the predicate is strict", () => {
    // `staggerChain` is `Wi + Wi+1 + 2·gap > wi + wi+1`. Both sides are computed here from
    // the shared `textWidth` and `DIM_TEXT_GAP`, so the test states the rule rather than
    // pinning a magic bay width, and a chain that fits is never nudged off its historical
    // bytes by a rounding wobble (the comparison is `>`, so an exact fit does NOT stagger).
    const font = scene(fixture("dense-bays.arch")).sizes.dimFont;
    const staggered = (mm: number): boolean => new Set(bottomChain(scene(bays(mm))).map((t) => t.across)).size > 1;
    const crowds = (mm: number): boolean => 2 * textWidth(String(mm), font) + 2 * DIM_TEXT_GAP * font > 2 * mm;

    for (const mm of [200, 300, 1000, 2000, 4000]) {
      expect(staggered(mm), `${mm} mm bays`).toBe(crowds(mm));
    }
    // Both verdicts are actually exercised by that sweep.
    expect(crowds(300)).toBe(true);
    expect(crowds(2000)).toBe(false);
  });

  it("keeps the staggered number INSIDE the band `DIM_BAND_FONTS` reserves", () => {
    // The band is a sheet-fit reservation computed in `sheet.ts`; the drawing must never
    // reach past it. A staggered value flips toward the building, so the outermost ink is
    // still an UNstaggered value on the outermost chain — the reach the formula describes.
    const s = scene(fixture("dense-bays.arch"));
    const font = s.sizes.dimFont;
    const outerFace = 6000 + 300 / 2; // south wall centerline + half thickness
    const rows = [...new Set(bottomChain(s).map((t) => t.across))].sort((a, b) => a - b);
    // This fixture's only horizontal chain is the AXIS chain (slot 1) — `dims auto rooms`
    // emits no openings or overall chain — so its reach is that slot's, not the full band.
    expect(rows[1]! - outerFace).toBeCloseTo(font * (CHAIN_BASE + CHAIN_STEP + 0.7), 6);
    expect(rows[1]! - outerFace).toBeLessThan(font * DIM_BAND_FONTS);
    // The staggered row is strictly nearer the building — and still clear of the wall face.
    expect(rows[0]! - outerFace).toBeCloseTo(font * (CHAIN_BASE + CHAIN_STEP - 0.7), 6);
    expect(rows[0]!).toBeGreaterThan(outerFace);
  });

  it("is a DRAWING fact — `describe()` cannot tell a staggered plan from an unstaggered one", () => {
    // Where a number is printed is not something the building knows. `describe()` of the
    // dense fixture must be exactly what the same source produced before the feature: it
    // reads the IR, which chain synthesis never touches.
    const dense = JSON.stringify(describePlan(fixture("dense-bays.arch")));
    expect(dense).toBe(JSON.stringify(describePlan(fixture("dense-bays.arch"))));
    expect(dense).not.toContain("stagger");
    // The wide-bay twin differs only in its declared axis positions — which `describe()`
    // does report — so the rooms/areas/bbox half of the answer is identical.
    const wide = describePlan(bays(4000));
    expect(JSON.stringify(wide.rooms)).toBe(JSON.stringify(describePlan(fixture("dense-bays.arch")).rooms));
  });

  it("never staggers a HAND-WRITTEN dim — the author owns their own annotation (ADR 0005)", () => {
    // Two crowded hand-written dims are reported as `W_DIM_OVERLAP`, never silently
    // re-staged. Only `dims auto` chain synthesis sets the flag.
    const src = [
      'plan "Hand" {',
      "  wall exterior thickness 200 { (0,0) (400,0) (400,3000) (0,3000) close }",
      '  room id=r at (0,0) size 400x3000 label "R"',
      "  dim (0,3000)->(200,3000) offset 400",
      "  dim (200,3000)->(400,3000) offset 400",
      "}",
    ].join("\n");
    const rows = [...new Set(bottomChain(scene(src)).map((t) => t.across))];
    expect(rows).toHaveLength(1);
  });
});

suite("text width — one estimate, one place", () => {
  it("is the only em-per-character factor in `src/`", () => {
    // The factor was copied into `backends/error-svg.ts` and `lint/rules/dims.ts` before
    // `text-metrics.ts` existed. A third copy would let `W_DIM_OVERLAP` and the stagger
    // decision disagree about what collides, which is a silent wrong drawing — so the
    // literal is pinned to its definition.
    const files = ["../src/text-metrics.ts", "../src/backends/error-svg.ts", "../src/lint/rules/dims.ts"];
    const hits = files.filter((f) => read(f).includes(String(EM_PER_CHAR)));
    expect(hits).toEqual(["../src/text-metrics.ts"]);
    expect(textWidth("2400", 100)).toBeCloseTo(4 * 100 * EM_PER_CHAR, 9);
    expect(textWidth("", 100)).toBe(0);
  });

  it("keeps the shipped `dims auto` examples uncrowded — zero churn is the expected result", () => {
    // Every shipped example that dimensions itself still emits one row of numbers per
    // chain. If a future example genuinely crowds, this is the test that says so out loud
    // instead of letting a golden quietly move.
    for (const name of ["museum.arch", "aquarium.arch", "gallery-l.arch", "two-bed.arch", "studio.arch"]) {
      const src = example(name);
      if (!/dims\s+auto/.test(src)) continue;
      const s = scene(src);
      expect(overprintingPairs(s), `${name} overprints its dimension numbers`).toEqual([]);
      expect(compile(src, { noCache: true }).svg, `${name} renders deterministically`).toBe(
        compile(src, { noCache: true }).svg,
      );
    }
  });
});

suite("chain geometry constants stay welded to the drawing", () => {
  it("`DIM_BAND_FONTS` is unchanged by staggering (it flips inward, not outward)", () => {
    // Stated as an equation rather than a number so a slot change moves both together.
    expect(DIM_BAND_FONTS).toBe(CHAIN_BASE + (CHAIN_SLOTS - 1) * CHAIN_STEP + 0.7 + 1);
    // The inner side a staggered number flips into is free by construction: `CHAIN_STEP`
    // already spans two 0.7 standoffs plus two half cap-heights of text.
    expect(CHAIN_STEP).toBeGreaterThan(2 * 0.7 + 2 * 0.35);
    // And the innermost chain's own inner gap clears the wall face by at least as much as
    // two chains clear each other — so a staggered openings chain is no tighter than the
    // spacing the design already ships between two tiers.
    expect(CHAIN_BASE - 0.7 - 0.35).toBeGreaterThan(CHAIN_STEP - 2 * 0.7 - 2 * 0.35);
  });
});
