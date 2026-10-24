/**
 * `taste()` and `arch score --taste` (ADR 0032, plan-soundness PS5.1a): the exact arithmetic,
 * the report's shape and key order, the advice table, the validity cap and its layers, the
 * counted budget, each criterion's acceptance line from the design (§3), and the CLI contract
 * (exit 0 on a measurement, 2 on compile errors, 3 on bad usage).
 *
 * The corpus-wide laws live beside this file: `taste-separation` (row 5's monotone separation),
 * `taste-digests` (the pinned report table), `taste-invisible` (describe/lint/compile untouched),
 * `taste-equivariance` (translation and D4) and `taste-budget` (the measured budget).
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_CATALOG } from "../src/error-catalog.js";
import { fmtPermyriad } from "../src/num-format.js";
import { fmtRatio, meanPermyriad, ramp, roundHalfUp } from "../src/taste/arith.js";
import { TASTE_CRITERIA } from "../src/taste/criteria.js";
import {
  compile,
  describe as describePlan,
  LINT_CODE_LAYERS,
  lint,
  taste,
  TASTE_ADVICE,
  TASTE_PROFILE_NAMES,
  TASTE_SUBSCORES,
  type TasteReport,
} from "../src/index.js";
import { tasteWithBudget } from "../src/taste/index.js";
import { TASTE_SOURCES, TASTE_WORLD } from "./taste-sources.js";

const read = (p: string): string => readFileSync(p, "utf8");
const CHAIN = "test/defect-corpus/circulation-privacy/two-bed-chain";
const crit = (r: TasteReport, id: string) => r.criteria.find((c) => c.id === id)!;

describe("exact arithmetic", () => {
  it("fmtPermyriad prints an integer permyriad from its digits", () => {
    expect(fmtPermyriad(0)).toBe("0");
    expect(fmtPermyriad(5)).toBe("0.0005");
    expect(fmtPermyriad(5000)).toBe("0.5");
    expect(fmtPermyriad(6125)).toBe("0.6125");
    expect(fmtPermyriad(6667)).toBe("0.6667");
    expect(fmtPermyriad(10000)).toBe("1");
    for (let p = 0; p <= 10000; p++) expect(JSON.stringify(Number(fmtPermyriad(p)))).toBe(fmtPermyriad(p));
    expect(() => fmtPermyriad(10001)).toThrow(RangeError);
    expect(() => fmtPermyriad(0.5)).toThrow(RangeError);
  });

  it("roundHalfUp decides ties upward in integers, negatives included", () => {
    expect(roundHalfUp(1n, 2n)).toBe(1n);
    expect(roundHalfUp(-1n, 2n)).toBe(0n);
    expect(roundHalfUp(2n, 3n)).toBe(1n);
    expect(roundHalfUp(-5n, 3n)).toBe(-2n);
  });

  it("ramp maps zero → 0 and one → 10000, clamps, and reads lower-is-better ramps", () => {
    const r = (n: bigint, d: bigint) => ({ num: n, den: d });
    expect(ramp(r(0n, 1n), r(0n, 1n), r(1n, 1n))).toBe(0);
    expect(ramp(r(1n, 2n), r(0n, 1n), r(1n, 1n))).toBe(5000);
    expect(ramp(r(2n, 3n), r(0n, 1n), r(1n, 1n))).toBe(6667);
    expect(ramp(r(3n, 1n), r(0n, 1n), r(1n, 1n))).toBe(10000);
    // R14: rank 3 of 5 on the ramp 5 → 2 reads 2/3.
    expect(ramp(r(3n, 1n), r(5n, 1n), r(2n, 1n))).toBe(6667);
    expect(ramp(r(6n, 1n), r(5n, 1n), r(2n, 1n))).toBe(0);
    // R7: 0.06 on 0 → 8/100 is 0.75.
    expect(ramp(r(6n, 100n), r(0n, 1n), r(8n, 100n))).toBe(7500);
  });

  it("means are weighted and rounded half up; an empty mean is null", () => {
    expect(meanPermyriad([])).toBeNull();
    expect(
      meanPermyriad([
        { p: 5000, w: 1 },
        { p: 6667, w: 1 },
        { p: 10000, w: 1 },
      ]),
    ).toBe(7222);
    expect(
      meanPermyriad([
        { p: 1, w: 1 },
        { p: 2, w: 1 },
      ]),
    ).toBe(2);
    expect(fmtRatio(144n, 1200n, 4)).toBe("0.12");
    expect(fmtRatio(1n, 3n, 2)).toBe("0.33");
  });
});

describe("the advice table (A_* codes are advice, not diagnostics)", () => {
  it("every criterion has one row with an A_ code, a source and the words it asks with", () => {
    expect(TASTE_ADVICE.map((r) => r.id)).toEqual(TASTE_CRITERIA.map((c) => c.id));
    const codes = TASTE_ADVICE.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const row of TASTE_ADVICE) {
      expect(row.code).toMatch(/^A_[A-Z_]+$/);
      expect(ERROR_CATALOG[row.code], `${row.code} must not be in the error catalogue`).toBeUndefined();
      expect(row.source.length).toBeGreaterThan(10);
      expect(["V", "S", "M"]).toContain(row.verified);
      // A remembered value is verified before it ships (ADR 0032): no criterion ships on [M].
      expect(row.verified, `${row.id} ships on a remembered source`).not.toBe("M");
      expect(row.asks.length).toBeGreaterThan(10);
      expect(TASTE_SUBSCORES).toContain(row.subscore);
    }
    // The criteria's doc comments carry the same marks: an [M] may stand only as "[M] not
    // shipped" (named for honesty, never in a shipped `source`).
    const marks = [...read("src/taste/criteria.ts").matchAll(/\[(V|S|M)\]( not shipped)?/g)];
    expect(marks.length).toBeGreaterThanOrEqual(10);
    expect(
      marks.filter((m) => m[1] === "M" && m[2] === undefined).map((m) => m[0]),
      "a criterion's doc comment cites a remembered [M] source as if shipped",
    ).toEqual([]);
  });
});

describe("the report", () => {
  const r = taste(read(`${CHAIN}.arch`));

  it("has the fixed key order of the design (§2.2)", () => {
    expect(Object.keys(r)).toEqual([
      "profile",
      "ok",
      "score",
      "uncapped",
      "capped",
      "validity",
      "advisory",
      "coverage",
      "subscores",
      "criteria",
    ]);
    expect(Object.keys(r.validity)).toEqual(["pass", "warnings", "codes", "drafting"]);
    expect(Object.keys(r.validity.drafting)).toEqual(["warnings", "codes"]);
    expect(Object.keys(r.coverage)).toEqual(["rooms", "classified", "unclassified", "weight", "skipped"]);
    expect(Object.keys(r.subscores)).toEqual([...TASTE_SUBSCORES]);
    expect(Object.keys(r.criteria[0]!)).toEqual([
      "id",
      "name",
      "subscore",
      "kind",
      "weight",
      "assessable",
      "measured",
      "score",
      "source",
      "verified",
      "advice",
      "message",
      "evidence",
    ]);
    expect(r.criteria.map((c) => c.id)).toEqual([
      "R3",
      "R6",
      "R7",
      "R9",
      "R11",
      "R12",
      "R14",
      "R15",
      "R16",
      "R17",
      "R18",
    ]);
  });

  it("caps at 0.5 while a validity warning stands, and says what it was before", () => {
    expect(r.validity.pass).toBe(false);
    expect(r.validity.codes).toContain("W_ROOM_VIA_PRIVATE");
    expect(r.capped).toBe(true);
    expect(r.score).toBe(0.5);
    expect(r.uncapped).toBe(0.6875);
  });

  it("a drafting-layer warning is listed and never caps", () => {
    const src = `plan "Drafted" {
  units mm
  grid 100
  room id=r_living at (0,0) size 3200x4200 label "Living Room" uses living
  walls from rooms exterior 200 partition 100
  door id=d_front on r_living.bottom at center width 900 swing into r_living
  window id=w_n on r_living.top at center width 1200
  dim (500,1000)->(2500,1000)
}`;
    const t = taste(src);
    expect(t.validity.drafting.codes).toEqual(["W_DIM_INSIDE"]);
    expect(t.validity.drafting.warnings).toBe(1);
    expect(t.validity.pass).toBe(true);
    expect(t.capped).toBe(false);
    // Not capped: the score is the uncapped total (0.875: R12 reads the one window as single aspect).
    expect(t.score).toBe(t.uncapped);
    expect(t.score).toBe(0.875);
  });

  it("a compile-channel warning never caps", () => {
    const src = `plan "Overlap" {
  units mm
  room id=a at (0,0) size 3000x3000 label "Living Room" uses living
  room id=b at (2000,0) size 3000x3000 label "Store" uses storage
}`;
    // The plan really carries the compile-channel warning…
    expect(compile(src).diagnostics.some((d) => d.code === "W_ROOM_OVERLAP" && d.severity === "warning")).toBe(true);
    // …and the cap counts exactly default lint()'s validity-layer warnings, nothing from compile().
    const t = taste(src);
    const validity = lint(src).filter((d) => LINT_CODE_LAYERS[d.code ?? ""] === "validity");
    expect(t.validity.codes).not.toContain("W_ROOM_OVERLAP");
    expect(t.validity.warnings).toBe(validity.length);
    expect(t.validity.pass).toBe(validity.length === 0);
  });

  it("a plan that does not resolve is not scored, and the call does not throw", () => {
    const t = taste(`plan "x" { room id=a at (0,0) size 1x }`);
    expect(t.ok).toBe(false);
    expect(t.score).toBeNull();
    expect(t.capped).toBe(false);
    expect(t.criteria).toEqual([]);
  });

  it("an unknown profile is a caller error", () => {
    expect(TASTE_PROFILE_NAMES).toEqual([
      "generic",
      "cn-residential-advisory",
      "uk-residential-advisory",
      "us-residential-advisory",
    ]);
    expect(() => taste(read(`${CHAIN}.arch`), { profile: "uk" })).toThrow(/unknown taste profile "uk"/);
  });

  it("a budget too small for a criterion skips it as taste-budget, counted, never run", () => {
    const t = tasteWithBudget(read(`${CHAIN}.arch`), {}, 0);
    expect(t.score).toBeNull();
    expect(t.criteria.every((c) => !c.assessable && c.reason === "taste-budget")).toBe(true);
    expect(t.coverage.skipped.map((s) => s.reason)).toEqual(Array(11).fill("taste-budget"));
    expect(t.coverage.weight).toEqual({ assessable: 0, total: 11 });
  });
});

describe("each criterion's acceptance line (design §3)", () => {
  const bad = taste(read(`${CHAIN}.arch`));
  const good = taste(read(`${CHAIN}.clean.arch`));

  it("R3: two-bed-chain scores 1/2 and its twin 2/2; two-bed (living and bedrooms at depth 2) scores 1", () => {
    expect(crit(bad, "R3").measured).toEqual({ num: 1, den: 2 });
    expect(crit(bad, "R3").score).toBe(0.5);
    expect(crit(bad, "R3").advice).toBe("A_INTIMACY_INVERSION");
    expect(crit(bad, "R3").evidence).toEqual([{ ids: ["r_living", "r_master"], fact: "depth 4 > depth 3" }]);
    expect(crit(good, "R3").measured).toEqual({ num: 2, den: 2 });
    expect(crit(good, "R3").advice).toBeNull();
    expect(crit(taste(read("examples/two-bed.arch")), "R3").score).toBe(1);
  });

  it("R7: a 12 m² net living room with a 1200 mm window at default heights reads 0.12 → 1; 600 mm reads 0.75", () => {
    const wide = crit(taste(read("test/taste-corpus/r7-small-window.good.arch")), "R7");
    expect(wide.score).toBe(1);
    expect(wide.evidence[0]!.fact).toBe("glazing 1.44 m² / net floor 12 m² = 0.12 (target 0.08); heights default");
    const narrow = crit(taste(read("test/taste-corpus/r7-small-window.arch")), "R7");
    expect(narrow.score).toBe(0.75);
    expect(narrow.measured).toEqual({ num: 0, den: 1 });
  });

  it("R7 says `heights default` per room: only a room whose own windows stand at 900/2100", () => {
    const src = `plan "Two rooms" {
  units mm
  grid 100
  room id=r_a at (0,0) size 3200x4200 label "Living Room" uses living
  room id=r_b at (3200,0) size 3200x4200 label "Bedroom" uses bedroom
  walls from rooms exterior 200 partition 100
  door id=d_front on r_a.bottom at center width 900 swing into r_a
  door id=d_ab between r_a and r_b at center width 900 swing into r_b
  window id=w_a on r_a.top at center width 1200 sill 300 head 2400
  window id=w_b on r_b.top at center width 1200
}`;
    const facts = crit(taste(src), "R7").evidence.map((e) => e.fact);
    expect(facts[0]).not.toContain("heights default");
    expect(facts[0]).toContain("glazing 2.52 m²");
    expect(facts[1]).toContain("; heights default");
  });

  it("R7 files a habitable room whose area rounds to 0 m² as a `too-small` skip, never silently", () => {
    const src = `plan "Speck" {
  units mm
  room id=r_a at (0,0) size 4000x3000 label "Living Room" uses living
  room id=r_s at (4000,0) size 40x40 label "Bedroom" uses bedroom
  wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  door id=d_front on shell at 60% width 900
  window id=w_n on shell at 10% width 1500
}`;
    const t = taste(src);
    expect(t.coverage.skipped).toContainEqual({ criterion: "R7", reason: "too-small", room: "r_s" });
    expect(crit(t, "R7").measured?.den).toBe(1);
  });

  it("R14: two-bed-chain ranks 3 of 5 (0.6667), its twin 1 of 5 (1)", () => {
    expect(crit(bad, "R14").measured).toEqual({ num: 3, den: 5 });
    expect(crit(bad, "R14").score).toBe(0.6667);
    expect(crit(good, "R14").measured).toEqual({ num: 1, den: 5 });
    expect(crit(good, "R14").score).toBe(1);
  });

  // ---- PS5.1b: the eight remaining criteria (design §3 acceptance lines) ----

  const corpus = (name: string): TasteReport => taste(read(`test/taste-corpus/${name}.arch`));
  /** A bare plan of rooms (no walls, no openings): what the geometry criteria read. */
  const roomsOnly = (rooms: string[], extra: string[] = []): string =>
    [
      'plan "Rooms" {',
      "  units mm",
      "  grid 10",
      ...rooms.map((r) => `  ${r}`),
      ...extra.map((e) => `  ${e}`),
      "}",
    ].join("\n");

  it("R6: a bed in a room typed `uses kitchen` is 1 mismatch of 3 judged pieces; in the bedroom, 0", () => {
    const bad = crit(corpus("r6-bed-in-kitchen"), "R6");
    expect(bad.measured).toEqual({ num: 2, den: 3 });
    expect(bad.score).toBe(0.6667);
    expect(bad.advice).toBe("A_FURNITURE_USE_MISMATCH");
    expect(bad.evidence).toHaveLength(1);
    expect(bad.evidence[0]!.ids[1]).toBe("r_kitchen");
    expect(bad.message).toContain('"Kitchen"');
    const good = crit(corpus("r6-bed-in-kitchen.good"), "R6");
    expect(good.measured).toEqual({ num: 3, den: 3 });
    expect(good.advice).toBeNull();
  });

  it("R6 judges a home only, and never a bare work surface", () => {
    // A clinic's consulting-room basins are not bath fittings out of place.
    expect(crit(taste(read("examples/clinic.arch")), "R6").reason).toBe("non-dwelling");
    // The bungalow's laundry counter is a bench, not a kitchen fitting: every judged piece fits.
    const b = crit(taste(read("examples/bungalow.arch"), { world: TASTE_WORLD }), "R6");
    expect(b.score).toBe(1);
  });

  it("R9: a 2000 × 5000 bedroom (aspect 2.5) scores 0.5; a squarer twin scores 1", () => {
    const bad = crit(corpus("r9-long-bedroom"), "R9");
    expect(bad.score).toBe(0.5);
    expect(bad.evidence[0]!.fact).toContain("aspect 2.5 of the minimum enclosing rectangle");
    expect(crit(corpus("r9-long-bedroom.good"), "R9").score).toBe(1);
  });

  it("R9 reads the minimum rectangle of the SHAPE, never the bounding box", () => {
    // A 45°-turned square: its bounding box and its shape both say 1.
    const square = roomsOnly([
      'room id=r_a polygon (0,3000) (3000,0) (6000,3000) (3000,6000) label "Bedroom" uses bedroom',
    ]);
    expect(crit(taste(square), "R9").score).toBe(1);
    // A 45°-turned 2828 × 7071 rectangle: the bounding box (7000 × 7000) would say 1; the shape says 2.5.
    const turned = roomsOnly([
      'room id=r_a polygon (0,2000) (2000,0) (7000,5000) (5000,7000) label "Bedroom" uses bedroom',
    ]);
    const r9 = crit(taste(turned), "R9");
    expect(r9.score).toBe(0.5);
    expect(r9.evidence[0]!.fact).toContain("aspect 2.5 ");
    // An L reads its convex hull's rectangle: 4000 × 6000 here, aspect 1.5.
    const l = roomsOnly([
      'room id=r_a polygon (0,0) (4000,0) (4000,1000) (1000,1000) (1000,6000) (0,6000) label "Bedroom" uses bedroom',
    ]);
    expect(crit(taste(l), "R9").evidence[0]!.fact).toContain("aspect 1.5 ");
  });

  it("R11: living-via-bedrooms 0/1, its twin 1/1; the corpus pair 0/1 → 1/1", () => {
    const lvb = "test/defect-corpus/circulation-privacy/living-via-bedrooms";
    expect(crit(taste(read(`${lvb}.arch`)), "R11").measured).toEqual({ num: 0, den: 1 });
    expect(crit(taste(read(`${lvb}.clean.arch`)), "R11").measured).toEqual({ num: 1, den: 1 });
    const bad = crit(corpus("r11-kitchen-off-hall"), "R11");
    expect(bad.score).toBe(0);
    expect(bad.advice).toBe("A_KITCHEN_APART");
    expect(crit(corpus("r11-kitchen-off-hall.good"), "R11").score).toBe(1);
  });

  it("R12: every habitable window on one side scores 0.5; with `site` and that side the pole side, 0", () => {
    const one = read("test/taste-corpus/r12-single-aspect.arch");
    expect(crit(taste(one), "R12").score).toBe(0.5);
    expect(crit(corpus("r12-single-aspect.good"), "R12").score).toBe(1);
    // Northern hemisphere: the equator side is S, so the pole side is N, which both windows face.
    const north = one.replace("  grid 100\n", "  grid 100\n  site { street south hemisphere north }\n");
    const r12 = crit(taste(north), "R12");
    expect(r12.score).toBe(0);
    expect(r12.evidence[0]!.fact).toBe("habitable windows face N; the pole side is N");
    // Southern hemisphere: N is the equator side, so the same plan is 0.5 again.
    const south = one.replace("  grid 100\n", "  grid 100\n  site { street south hemisphere south }\n");
    expect(crit(taste(south), "R12").score).toBe(0.5);
    expect(crit(taste(read("examples/clinic.arch")), "R12").reason).toBe("non-dwelling");
  });

  it("R15: bedroom-via-bedroom scores 0 on both twins; two bedrooms off one hall score 1; terrace-row pairs no two houses", () => {
    const bvb = "test/defect-corpus/circulation-privacy/bedroom-via-bedroom";
    expect(crit(taste(read(`${bvb}.arch`)), "R15").measured).toEqual({ num: 0, den: 1 });
    expect(crit(taste(read(`${bvb}.clean.arch`)), "R15").measured).toEqual({ num: 0, den: 1 });
    expect(crit(corpus("r15-bedroom-off-living"), "R15").score).toBe(0);
    expect(crit(corpus("r15-bedroom-off-living.good"), "R15").measured).toEqual({ num: 1, den: 1 });
    // Each house's bedrooms are joined only through the street: no pair is judged.
    expect(crit(taste(read("examples/terrace-row.arch"), { world: TASTE_WORLD }), "R15").reason).toBe("too-few-items");
  });

  it("R16: a small bedroom's door 350 mm from its corner passes; centred on the 3000 mm edge (1050 mm) fails", () => {
    const bad = crit(corpus("r16-door-mid-wall"), "R16");
    expect(bad.measured).toEqual({ num: 0, den: 1 });
    expect(bad.evidence[0]!.fact).toContain("jamb 1050 mm");
    expect(bad.advice).toBe("A_DOOR_OFF_CORNER");
    const good = crit(corpus("r16-door-mid-wall.good"), "R16");
    expect(good.measured).toEqual({ num: 1, den: 1 });
    expect(good.evidence[0]!.fact).toContain("jamb 350 mm");
    // The hall side of the door is circulation and not judged: one item, the bedroom's.
    expect(good.evidence.map((e) => e.ids[1])).toEqual(["r_bed"]);
  });

  it("R16 skips a non-rectilinear room as `non-rectangular-room`", () => {
    const src = roomsOnly(
      [
        'room id=r_h at (0,0) size 2000x3000 label "Hall" uses hall',
        'room id=r_a polygon (2000,0) (5000,0) (4000,3000) (2000,3000) label "Bedroom" uses bedroom',
      ],
      ["wall id=w partition thickness 100 { (2000,0) (2000,3000) }", "door id=d on w at 1500 width 900"],
    );
    expect(taste(src).coverage.skipped).toContainEqual({
      criterion: "R16",
      reason: "non-rectangular-room",
      room: "r_a",
    });
  });

  it("R17: four rooms on 7 axes read 7/4 (0.75); a partition 40 mm off its neighbour clusters with it, 600 mm does not", () => {
    expect(crit(corpus("r17-staggered-partition.good"), "R17").measured).toEqual({ num: 7, den: 4 });
    expect(crit(corpus("r17-staggered-partition.good"), "R17").score).toBe(0.75);
    expect(crit(corpus("r17-staggered-partition"), "R17").measured).toEqual({ num: 8, den: 4 });
    const grid = (offset: number): string =>
      roomsOnly([
        'room id=a at (0,0) size 4000x3500 label "Living Room" uses living',
        'room id=b at (4000,0) size 3000x3500 label "Dining Room" uses dining',
        `room id=c at (0,3500) size ${4000 + offset}x3500 label "Bedroom 1" uses bedroom`,
        `room id=d at (${4000 + offset},3500) size ${3000 - offset}x3500 label "Bedroom 2" uses bedroom`,
      ]);
    expect(crit(taste(grid(40)), "R17").measured).toEqual({ num: 6, den: 4 });
    expect(crit(taste(grid(40)), "R17").score).toBe(1);
    expect(crit(taste(grid(600)), "R17").measured).toEqual({ num: 7, den: 4 });
  });

  it("R17 needs four counted rooms: below that no plan can reach 1.5 axes per room (design's 3-room strip)", () => {
    // The design's acceptance line reads a 3-room strip as 6/3; three rooms can never reach the
    // ramp's 1.5, so R17 does not judge them (R17_MIN_ROOMS).
    const strip = roomsOnly([
      'room id=a at (0,0) size 3000x4000 label "Bedroom 1" uses bedroom',
      'room id=b at (3000,0) size 3000x4000 label "Bedroom 2" uses bedroom',
      'room id=c at (6000,0) size 3000x4000 label "Living Room" uses living',
    ]);
    expect(crit(taste(strip), "R17").reason).toBe("too-few-items");
  });

  it("R18: a 3000 × 3000 room scores 1; an L at 0.75 of its hull rectangle scores 0; a circle is skipped", () => {
    const sq = roomsOnly(['room id=a at (0,0) size 3000x3000 label "Bedroom" uses bedroom']);
    expect(crit(taste(sq), "R18").score).toBe(1);
    const l = crit(corpus("r18-l-shaped-bedroom"), "R18");
    expect(l.score).toBe(0);
    expect(l.evidence[0]!.fact).toContain("= 0.75 ");
    expect(l.advice).toBe("A_ROOM_IRREGULAR");
    expect(crit(corpus("r18-l-shaped-bedroom.good"), "R18").score).toBe(1);
    const circle = roomsOnly(['room id=a circle at (3000,3000) radius 2000 label "Bedroom" uses bedroom']);
    const t = taste(circle);
    expect(t.coverage.skipped).toContainEqual({ criterion: "R18", reason: "curved-room", room: "a" });
    // R9 reads a circle as aspect 1.
    expect(crit(t, "R9").score).toBe(1);
  });

  it("an upper storey is skipped for the depth readers, filed with its level", () => {
    const t = taste(read("examples/townhouse.arch"), { world: TASTE_WORLD });
    const upper = t.coverage.skipped.filter((s) => s.reason === "upper-storey");
    expect(upper.map((s) => `${s.criterion}@${s.level}`)).toEqual(["R3@2", "R3@3", "R14@2", "R14@3", "R15@2", "R15@3"]);
  });
});

describe("messages name rooms by label, never by id (the lint iron law, applied to taste)", () => {
  it("every room a message names is named by its label (an id only for a room with none)", () => {
    const bad: string[] = [];
    let quoted = 0;
    for (const { name, src } of TASTE_SOURCES) {
      const t = taste(src, { world: TASTE_WORLD });
      const s = describePlan(src, { world: TASTE_WORLD });
      const rooms = [...s.rooms, ...(s.levels ?? []).flatMap((l) => l.rooms)];
      // What a person would call each room: its label, or its id when it has no label.
      const names = new Set(rooms.map((r) => r.label ?? r.id));
      for (const c of t.criteria) {
        for (const m of c.message.matchAll(/"([^"]+)"/g)) {
          quoted++;
          if (!names.has(m[1]!)) bad.push(`${name} ${c.id}: ${m[1]} in ${c.message}`);
        }
      }
    }
    expect(quoted).toBeGreaterThan(50); // the check reached messages that name rooms
    expect(bad).toEqual([]);
  }, 300_000);
});

describe("arch score --taste (the CLI contract)", () => {
  const run = (args: string[], input?: string) => {
    const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
      input,
      encoding: "utf8",
      cwd: process.cwd(),
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };

  it("--json prints taste()'s report and exits 0, capped or not", () => {
    const r = run(["score", `${CHAIN}.arch`, "--taste", "generic", "--json"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(taste(read(`${CHAIN}.arch`)));
  }, 30000);

  it("prints a human summary line and exits 0", () => {
    const r = run(["score", `${CHAIN}.arch`, "--taste", "generic"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("taste generic: 0.5 (capped; uncapped 0.6875) · judged 10/11 of the weight\n");
    expect(r.stderr).toContain("A_INTIMACY_INVERSION");
  }, 30000);

  it("--taste with --brief is a usage error (exit 3)", () => {
    const r = run(["score", `${CHAIN}.arch`, "--taste", "generic", "--brief", "x.json"]);
    expect(r.status).toBe(3);
  }, 30000);

  it("an unknown profile exits 3 with a did-you-mean", () => {
    const r = run(["score", `${CHAIN}.arch`, "--taste", "generik"]);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('did you mean "generic"');
  }, 30000);

  it("a plan with compile errors exits 2 and prints them", () => {
    const r = run(["score", "-", "--taste", "generic", "--json"], `plan "x" { room id=a at (0,0) size 1x }`);
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stdout).ok).toBe(false);
  }, 30000);
});
