/**
 * Product roadmap RM1.2a (backlog ST.1): `W_STAIR_RISER_TOO_HIGH`, the riser a stair's drawn treads
 * climb its storey on. What it fires on, what it leaves alone (no authored height, a stair
 * `W_STAIR_TOO_STEEP` already reports, a long enough flight, the rule turned off), its words (no id
 * in the message, the id and the limit's source in the hint), that pasting the hint clears it, the
 * implied riser of every shipped stair example derived by hand, and that the limit it reads is a
 * `V` or `S-full` figure that no profile replaces. A `place` turn moving none of it is the
 * equivariance oracle's (`stair-riser-too-high` is `invariant` in `test/helpers/d4-oracle.ts`).
 *
 * PR #736's review: a winder line is a riser (M1); the rule fires and lengthens on one predicate, so
 * no limit or height makes it throw (M2); the hint quotes every statement to change, a flight's
 * `at` included when it grows toward its foot, and pasting it clears the warning (S3); where
 * `W_STAIR_TOO_STEEP` reports the stair too, its hint quotes one redrawing that answers both (S4).
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { type Diagnostic, lint, lintCoverage } from "../src/index.js";
import { resolvePlan } from "../src/analyze.js";
import { DEFAULT_RULESET, LINT_PROFILES } from "../src/lint.js";
import { RULE_PROVENANCE } from "../src/lint/provenance.js";
import { resolveRuleset } from "../src/lint/ruleset.js";
import { DRAWN_RISE_SOURCE, drawnRisers, drawnTreads, fewestRisers, winderRisers } from "../src/lint/rules/stairs.js";
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

/** A hint pasted: each statement it quotes (`from \`X\` to \`Y\``) rewritten, on every storey. */
function pasteHint(src: string, hint: string): string {
  const m = [...hint.matchAll(/from `([^`]+)` to `([^`]+)`/g)];
  expect(m.length).toBeGreaterThan(0);
  let out = src;
  for (const [, was, now] of m) {
    expect(out).toContain(was!);
    out = out.replaceAll(was!, now!);
  }
  return out;
}

/** `examples`' L, its flights `f1` (south of the landing, climbing north) and `f2` (west of it,
 *  climbing west) long, on a `height` storey; `landing` adds a clause to the landing. */
const lStair = (f1: number, f2: number, height: number, landing = ""): string => `plan "L" {
  units mm
  height ${height}
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  room id=hall at (0,0) size 6000x6000 label "Hall" uses hall
  door at (3000,6000) width 900 wall shell
  stair id=s dir up width 1000 {
    flight at (1500,1100) size 1000x${f1}
    landing at (1500,100) size 1000x1000${landing}
    flight at (${1500 - f2},100) size ${f2}x1000
  }
}`;

const errors = (src: string): string[] =>
  lint(src)
    .filter((d) => d.severity === "error")
    .map((d) => d.code ?? "");
const stairWarnings = (src: string, opts: Parameters<typeof lint>[1] = {}): Diagnostic[] =>
  lint(src, opts).filter((d) => d.code === CODE || d.code === "W_STAIR_TOO_STEEP");

suite("W_STAIR_RISER_TOO_HIGH", () => {
  it("fires where the drawn treads climb the storey on risers over 220 mm, and W_STAIR_TOO_STEEP passes", () => {
    const src = twoStorey("2900x900");
    expect(lint(src).filter((d) => d.code === "W_STAIR_TOO_STEEP")).toEqual([]);
    const ds = of(src);
    expect(ds.map((d) => [d.message, d.hints])).toEqual([
      [
        `The stair in "Hall" on level 1 draws 10 treads on its 2900 mm run, so it climbs the 2700 mm storey on 11 risers (one per tread and one at the flight's head) of about 245 mm, above 220 mm: the drawing draws one tread for every 280 mm of a flight's run (its nominal going, whatever the storey), and at 220 mm a riser the storey takes 13 risers.`,
        [
          `Redraw \`st\` from \`size 2900x900\` to \`size 3250x900\` on every storey it is drawn on, so it draws 12 treads and climbs on 13 risers of about 208 mm, or correct the storey \`height\` if it is wrong; the limit is the ruleset's \`stairDrawnMaxRiseMm\` (by default 220 mm: ${DRAWN_RISE_SOURCE}).`,
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
    const fixed = pasteHint(src, d!.hints![0]!);
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

  it("a stair W_STAIR_TOO_STEEP reports is reported once, by it, with a hint that answers both (S4)", () => {
    // 2200 mm for a 3000 mm storey: too short to climb at all (14 risers, 13 goings need 2860). But
    // 2860 mm would draw 10 treads, 11 risers of 273 mm, and pasting it would raise the riser rule;
    // 14 risers of 214 mm need 13 treads, drawn from a 3500 mm run (12.5 goings of 280 mm).
    const src = twoStorey("2200x900", "3000");
    const [steep, ...more] = stairWarnings(src);
    expect(more).toEqual([]);
    expect(steep!.code).toBe("W_STAIR_TOO_STEEP");
    expect(steep!.hints![0]).toMatch(
      /^Redraw `st` from `size 2200x900` to `size 3500x900` on every storey it is drawn on, so it draws 13 treads and climbs on 14 risers of about 214 mm: that meets the going limit and the riser the drawing implies too \(the drawing draws one tread for every 280 mm of a flight's run/,
    );
    // Pasted, neither rule asks again.
    expect(stairWarnings(pasteHint(src, steep!.hints![0]!))).toEqual([]);
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
      `The stair in "Hall" on level 1 draws 5 + 5 treads on its flights' 3060 mm run, so it climbs the 2750 mm storey on 12 risers (one per tread and one at each flight's head) of about 229 mm, above 220 mm: the drawing draws one tread for every 280 mm of a flight's run (its nominal going, whatever the storey), and at 220 mm a riser the storey takes 13 risers.`,
    );
    // Flight 1 is the portrait one, its foot at the bottom: it grows there, so its `at` stays.
    expect(d!.hints![0]).toMatch(
      /^Redraw flight 1 of `s` from `flight at \(2630,1100\) size 1000x1530` to `flight at \(2630,1100\) size 1000x1540` on every storey/,
    );
    expect(d!.hints![0]).toContain("so it draws 11 treads and climbs on 13 risers of about 212 mm");
    const fixed = pasteHint(src, d!.hints![0]!);
    expect(of(fixed, { world: EXAMPLES_WORLD })).toEqual([]);
  });
});

suite("PR #736's review", () => {
  it("M1: a winder line is a riser; the drawing's count, not the 3D preview's level box", () => {
    // Flights of 1100 and 880 mm draw 4 + 3 treads (1100 / 280 = 3.9, 880 / 280 = 3.1): 9 risers on a
    // level landing. `winders 4` draws 3 lines across the landing, splitting it into 4 steps: 3 more
    // risers, 12, so 2750 / 12 = 229 mm is still above 220. `winders 5` draws 4: 13 risers, 212 mm.
    const plan = (w: string) =>
      resolvePlan(lStair(1100, 880, 2750, w)).ir!.elements.find((e): e is RStair => e.kind === "stair")!;
    expect([winderRisers(plan("")), drawnRisers(plan(""))]).toEqual([0, 9]);
    expect([winderRisers(plan(" winders 4")), drawnRisers(plan(" winders 4"))]).toEqual([3, 12]);
    expect([winderRisers(plan(" winders 5")), drawnRisers(plan(" winders 5"))]).toEqual([4, 13]);
    const [d] = of(lStair(1100, 880, 2750, " winders 4"));
    expect(d!.message).toContain(
      "on 12 risers (one per tread, one at each flight's head and 3 across its winders) of about 229 mm",
    );
    expect(of(lStair(1100, 880, 2750, " winders 5"))).toEqual([]);
    // Neither is too steep: the winders earn their goings there too.
    expect(lint(lStair(1100, 880, 2750, " winders 4")).filter((x) => x.code === "W_STAIR_TOO_STEEP")).toEqual([]);
  });

  it("M2: the review's case returns, never throws; fractional limits and heights never throw", () => {
    // A 3640 mm flight draws 13 treads, 14 risers; 2101.96 / 14 = 150.14 in decimal, exactly the limit.
    // In binary the old firing test (a division) said above it and the hint's count (a product) said
    // not, so the hint had no flight to lengthen and threw. One predicate now: at the limit, not above.
    const straight = (h: string, run: number) => twoStorey(`${run}x900`, h).replace("grid 50\n", "");
    const edge = straight("2101.96", 3640);
    expect(() => lint(edge, { ruleset: { stairDrawnMaxRiseMm: 150.14 } })).not.toThrow();
    expect(of(edge, { ruleset: { stairDrawnMaxRiseMm: 150.14 } })).toEqual([]);
    // A hair under the limit, it fires, and its hint names the lengths.
    const [under] = of(edge, { ruleset: { stairDrawnMaxRiseMm: 150.13 } });
    expect(under!.hints![0]).toMatch(/^Redraw `st` from `size 3640x900` to `size \d+x900`/);
    // A fixed pseudo-random walk (no clock, no seed to forget): every warning it gives names a length,
    // fires exactly when the drawn risers are fewer than the fewest the limit allows, and pasting it clears it.
    let x = 1;
    const next = (): number => {
      x = (x * 48271) % 2147483647;
      return x / 2147483647;
    };
    let fired = 0;
    for (let k = 0; k < 60; k++) {
      const max = Math.round((140 + next() * 120) * 100) / 100;
      // Above 2300 mm, so the template's 2100 mm door and window heads stay inside their walls.
      const h = Math.round((2300 + next() * 1200) * 100) / 100;
      const run = 1000 + Math.round(next() * 3000);
      const src = straight(String(h), run);
      const opts = { ruleset: { stairDrawnMaxRiseMm: max } };
      const ds = of(src, opts);
      const st = resolvePlan(src).levels[0]!.ir.elements.find((e): e is RStair => e.kind === "stair")!;
      const steep = lint(src, opts).some((d) => d.code === "W_STAIR_TOO_STEEP");
      if (!steep) expect(ds.length, `${h} ${max} ${run}`).toBe(drawnRisers(st) < fewestRisers(h, max) ? 1 : 0);
      for (const d of ds) {
        fired++;
        expect(d.hints![0], `${h} ${max} ${run}`).toMatch(/^Redraw `st` from `size \d+x900` to `size \d+x900`/);
        expect(of(pasteHint(src, d.hints![0]!), opts), `${h} ${max} ${run}`).toEqual([]);
      }
    }
    expect(fired).toBeGreaterThan(5);
  });

  it("S3: L flights of 1400 and 1250 mm at 2750: both lengthened, the west one's `at` moved, and the paste clears it", () => {
    const src = lStair(1400, 1250, 2750);
    const [d] = of(src);
    expect(d!.hints![0]).toMatch(
      /^Redraw flight 1 of `s` from `flight at \(1500,1100\) size 1000x1400` to `flight at \(1500,1100\) size 1000x1540`, and flight 2 of `s` from `flight at \(250,100\) size 1250x1000` to `flight at \(240,100\) size 1260x1000` on every storey/,
    );
    const fixed = pasteHint(src, d!.hints![0]!);
    expect(errors(fixed)).toEqual([]);
    expect(stairWarnings(fixed)).toEqual([]);
  });

  it("S4: where both hold, one W_STAIR_TOO_STEEP whose redrawing answers both; pasted, nothing asks again", () => {
    for (const [f1, f2, h] of [
      [1100, 880, 2750],
      [1400, 1250, 3000],
    ] as const) {
      const src = lStair(f1, f2, h);
      const ds = stairWarnings(src);
      expect(
        ds.map((d) => d.code),
        `${f1} ${f2} ${h}`,
      ).toEqual(["W_STAIR_TOO_STEEP"]);
      expect(ds[0]!.hints![0]).toContain("that meets the going limit and the riser the drawing implies too");
      const fixed = pasteHint(src, ds[0]!.hints![0]!);
      expect(errors(fixed)).toEqual([]);
      expect(stairWarnings(fixed), `${f1} ${f2} ${h}`).toEqual([]);
    }
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
        .map((s) => ({
          storey: ir.storeyHeight,
          treads: drawnTreads(s),
          risers: drawnRisers(s),
          authored: ir._heightsAuthored,
        })),
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
    for (const [name, p] of Object.entries(RULE_PROVENANCE.profiles))
      expect(p.stairDrawnMaxRiseMm, name).toBeUndefined();
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
