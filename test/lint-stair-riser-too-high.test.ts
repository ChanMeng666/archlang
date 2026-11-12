/**
 * Product roadmap RM1.2a (backlog ST.1): `W_STAIR_RISER_TOO_HIGH`, the riser a stair's drawn treads
 * climb its storey on. What it fires on, what it leaves alone (no authored height, a stair
 * `W_STAIR_TOO_STEEP` already reports, a long enough flight, the rule turned off), its words (no id
 * in the message, the id and the limit's source in the hint), that pasting the hint clears it, the
 * implied riser of every shipped stair example derived by hand, and that the limit it reads is a
 * `V` or `S-full` figure that no profile replaces. A `place` turn moving none of it is the
 * equivariance oracle's (`stair-riser-too-high` is `invariant` in `test/helpers/d4-oracle.ts`).
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { type Diagnostic, lint, lintCoverage } from "../src/index.js";
import { resolvePlan } from "../src/analyze.js";
import { DEFAULT_RULESET, LINT_PROFILES } from "../src/lint.js";
import { RULE_PROVENANCE } from "../src/lint/provenance.js";
import { resolveRuleset } from "../src/lint/ruleset.js";
import { DRAWN_RISE_SOURCE, drawnRisers, drawnTreads } from "../src/lint/rules/stairs.js";
import type { RStair } from "../src/ir.js";
import { EXAMPLES_WORLD } from "./helpers/d4-oracle.js";

const CODE = "W_STAIR_RISER_TOO_HIGH";
const of = (src: string, opts: Parameters<typeof lint>[1] = {}): Diagnostic[] =>
  lint(src, opts).filter((d) => d.code === CODE);

/** Two storeys over one shaft `st`, the flight `size` written on both; `height` when given. */
const twoStorey = (size: string, height: string | null = "2700"): string => `plan "P" {
  units mm
  grid 50
${height === null ? "" : `  height ${height}\n`}  level 1 "Ground" {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
    room id=hall at (0,0) size 6000x4000 label "Hall" uses hall
    door id=front at (3000,4000) width 1000 wall shell
    window at (3000,0) width 1500 wall shell
    stair id=st at (1000,500) size ${size} dir up
  }
  level 2 "Upper" {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
    room id=landing at (0,0) size 6000x4000 label "Landing" uses circulation
    window at (3000,0) width 1500 wall shell
    stair id=st at (1000,500) size ${size} dir down
  }
}`;

/** The one run a hint quotes (`from A mm to B mm`), applied to the source by `at`, which writes the
 *  footprint whose side A becomes B, on every storey. */
function pasteHint(src: string, hint: string, at: (from: string, to: string) => [string, string]): string {
  const m = [...hint.matchAll(/from (\d+) mm to (\d+) mm/g)];
  expect(m).toHaveLength(1);
  const [was, now] = at(m[0]![1]!, m[0]![2]!);
  expect(src).toContain(was);
  return src.replaceAll(was, now);
}

suite("W_STAIR_RISER_TOO_HIGH", () => {
  it("fires where the drawn treads climb the storey on risers over 220 mm, and W_STAIR_TOO_STEEP passes", () => {
    const src = twoStorey("2900x900");
    expect(lint(src).filter((d) => d.code === "W_STAIR_TOO_STEEP")).toEqual([]);
    const ds = of(src);
    expect(ds.map((d) => [d.message, d.hints])).toEqual([
      [
        'The stair in "Hall" on level 1 draws 10 treads on its 2900 mm run, so it climbs the 2700 mm storey on 11 risers (one per tread and one at the flight\'s head) of about 245 mm, above 220 mm.',
        [
          `Lengthen \`st\` along its flight from 2900 mm to 3250 mm on every storey it is drawn on (its \`size\`), so it draws 12 treads and climbs on 13 risers of about 208 mm, or correct the storey \`height\` if it is wrong; the limit is the ruleset's \`stairDrawnMaxRiseMm\` (by default 220 mm: ${DRAWN_RISE_SOURCE}).`,
        ],
      ],
    ]);
    expect(ds[0]!.level).toBe(1);
  });

  it("names no id and no clause in its message, and prints no non-finite number", () => {
    const [d] = of(twoStorey("2900x900"));
    expect(d!.message).not.toContain("`st`");
    expect(d!.message).not.toMatch(/Table|Approved|clause|\d+\.\d+\.\d+/);
    expect(d!.message).not.toMatch(/Infinity|NaN|e\+\d/);
    expect(d!.hints![0]).toContain(DRAWN_RISE_SOURCE);
  });

  it("is silent at 220 mm exactly and below, and on a flight drawn with enough treads", () => {
    // 2640 / 12 risers = 220: at the limit, not above it (11 treads on a 3080 mm run).
    expect(of(twoStorey("3080x900", "2640"))).toEqual([]);
    expect(of(twoStorey("3250x900"))).toEqual([]);
  });

  it("pasting the hint clears it and raises nothing new", () => {
    const src = twoStorey("2900x900");
    const [d] = of(src);
    const fixed = pasteHint(src, d!.hints![0]!, (a, b) => [`size ${a}x900`, `size ${b}x900`]);
    expect(of(fixed)).toEqual([]);
    const codes = (s: string) => new Set(lint(s).map((x) => x.code));
    expect([...codes(fixed)].filter((c) => !codes(src).has(c))).toEqual([]);
  });

  it("no authored height: not judged, and the coverage report says the stair checks skipped it", () => {
    const src = twoStorey("2200x900", null);
    expect(of(src)).toEqual([]);
    const stairs = lintCoverage(src)!.families.find((f) => f.family === "stairs")!;
    expect(stairs.skipped).toEqual([
      { reason: "no-storey-height", why: "the plan states no storey height", levels: [1] },
    ]);
  });

  it("a stair W_STAIR_TOO_STEEP reports is reported once, by it", () => {
    // 2200 mm for a 3000 mm storey: too short to climb at all (14 risers, 13 goings need 2860).
    const src = twoStorey("2200x900", "3000");
    expect(lint(src).filter((d) => d.code === "W_STAIR_TOO_STEEP")).toHaveLength(1);
    expect(of(src)).toEqual([]);
    // Under `us-residential-advisory` the 2900 mm flight is too steep too: one warning, not two.
    const us = lint(twoStorey("2900x900"), { profile: "us-residential-advisory" });
    expect(us.filter((d) => d.code === "W_STAIR_TOO_STEEP")).toHaveLength(1);
    expect(us.filter((d) => d.code === CODE)).toEqual([]);
  });

  it("`null` turns it off; a caller's limit is read, and named as the ruleset's", () => {
    const src = twoStorey("2900x900");
    expect(of(src, { ruleset: { stairDrawnMaxRiseMm: null } })).toEqual([]);
    expect(of(src, { ruleset: { stairDrawnMaxRiseMm: 250 } })).toEqual([]);
    const [d] = of(twoStorey("3250x900"), { ruleset: { stairDrawnMaxRiseMm: 200 } });
    expect(d!.message).toContain("above 200 mm");
    expect(d!.hints![0]).toContain("`stairDrawnMaxRiseMm` (by default 220 mm");
  });

  it("a block stair: the flights to lengthen, from the cheapest next tread, and the paste clears it", () => {
    // examples/turning-stair before RM1.2a: 1530 + 1530 mm flights draw 5 + 5 treads, 12 risers
    // of about 229 mm up 2750 mm; one more tread on the first flight is 13 risers of about 212 mm.
    const src = readFileSync("examples/turning-stair.arch", "utf8").replaceAll("1000x1540", "1000x1530");
    const [d] = of(src, { world: EXAMPLES_WORLD });
    expect(d!.message).toBe(
      'The stair in "Hall" on level 1 draws 5 + 5 treads on its flights\' 3060 mm run, so it climbs the 2750 mm storey on 12 risers (one per tread and one at each flight\'s head) of about 229 mm, above 220 mm.',
    );
    expect(d!.hints![0]).toMatch(/^Lengthen flight 1 of `s` from 1530 mm to 1540 mm on every storey/);
    expect(d!.hints![0]).toContain("so they draw 11 treads and climb on 13 risers of about 212 mm");
    // Flight 1 is the portrait one, `flight at (2630,1100) size 1000x1530`.
    const fixed = pasteHint(src, d!.hints![0]!, (a, b) => [`(2630,1100) size 1000x${a}`, `(2630,1100) size 1000x${b}`]);
    expect(of(fixed, { world: EXAMPLES_WORLD })).toEqual([]);
  });
});

suite("the riser each shipped stair example's drawing implies (backlog ST.1's gate, by hand)", () => {
  /** Each `dir up` stair of the example: its storey's height, the treads its flights draw, and
   *  whether the plan authors a height. */
  const stairsOf = (name: string) => {
    const r = resolvePlan(readFileSync(`examples/${name}.arch`, "utf8"), { world: EXAMPLES_WORLD });
    const plans = r.levels.length > 0 ? r.levels.map((l) => l.ir) : [r.ir!];
    return plans.flatMap((ir) =>
      ir.elements
        .filter((e): e is RStair => e.kind === "stair" && e.dir === "up")
        .map((s) => ({ storey: ir.storeyHeight, treads: drawnTreads(s), risers: drawnRisers(s), authored: ir._heightsAuthored })),
    );
  };

  it("one riser per tread and one per flight, as the 3D preview builds it", () => {
    // two-storey: a 3250 mm flight is 3250 / 280 = 11.6, so 12 treads, 13 risers of 2700 / 13.
    expect(stairsOf("two-storey")).toEqual([{ storey: 2700, treads: [12], risers: 13, authored: true }]);
    // turning-stair: 1540 / 280 = 5.5 and 1530 / 280 = 5.46, so 6 + 5 treads, 13 risers of 2750 / 13.
    expect(stairsOf("turning-stair")).toEqual([{ storey: 2750, treads: [6, 5], risers: 13, authored: true }]);
    // These three author no height, so the rule skips them (3000 mm is the default storey):
    // 3200 / 280 = 11.4, 11 treads and 12 risers of 250 mm; hillside-villa 2900 / 280, 11 risers of 273 mm.
    expect(stairsOf("townhouse")).toEqual([
      { storey: 3000, treads: [11], risers: 12, authored: false },
      { storey: 3000, treads: [11], risers: 12, authored: false },
    ]);
    expect(stairsOf("garden-house")).toEqual([{ storey: 3000, treads: [11], risers: 12, authored: false }]);
    expect(stairsOf("hillside-villa")).toEqual([{ storey: 3000, treads: [10], risers: 11, authored: false }]);
    for (const name of ["two-storey", "turning-stair", "townhouse", "garden-house", "hillside-villa"]) {
      const src = readFileSync(`examples/${name}.arch`, "utf8");
      expect(of(src, { world: EXAMPLES_WORLD }), name).toEqual([]);
    }
  });
});

suite("the limit it reads", () => {
  it("is a V or S-full figure, and no profile sets another", () => {
    const row = RULE_PROVENANCE.defaults.stairDrawnMaxRiseMm!;
    expect(["V", "S-full"]).toContain(row.verification);
    for (const [name, p] of Object.entries(RULE_PROVENANCE.profiles)) expect(p.stairDrawnMaxRiseMm, name).toBeUndefined();
    for (const name of Object.keys(LINT_PROFILES)) {
      expect(resolveRuleset(LINT_PROFILES[name]).stairDrawnMaxRiseMm, name).toBe(DEFAULT_RULESET.stairDrawnMaxRiseMm);
    }
  });

  it("the hint's source is the provenance row's document, edition and table", () => {
    const row = RULE_PROVENANCE.defaults.stairDrawnMaxRiseMm!;
    if (row.verification === "convention") throw new Error("the default limit has a source");
    expect(DRAWN_RISE_SOURCE.startsWith(`${row.document} (${row.edition})`)).toBe(true);
    expect(DRAWN_RISE_SOURCE).toContain(row.clause!.split(",")[0]!);
    expect(DEFAULT_RULESET.stairDrawnMaxRiseMm).toBe(220);
  });
});
