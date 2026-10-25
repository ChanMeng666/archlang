/**
 * PS4.4 — brief-bound dimensions: the gross internal area fact (`describe().totals`) and the
 * intent assertions that bind a brief's stated sizes (`grossInternalAreaM2`, `roomDimensions`).
 *
 * The first-contact audits judged every dwelling brief's area on centrelines and on GIA (the
 * floor inside the exterior walls' inner faces, `audits/first-contact-protocol.md` § Area basis)
 * by hand. The fact now gives that figure; the pins below put it beside each audit's own number,
 * and every difference is a reading difference (the audit's, not the fact's), named per row.
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { applyLetOverride, describe, type Intent, intentFromJson, validateIntent } from "../src/index.js";
import { grossInternalArea } from "../src/analyze/gross-area.js";

const FC = "docs/plans/plan-soundness/audits/first-contact-plans";
const REPRO = "docs/plans/plan-soundness/repro";
const read = (p: string): string => readFileSync(p, "utf8");
const totals = (src: string) => describe(src).totals;

suite("PS4.4 — GIA beside the audits' figures (first-contact apartment, house, studio)", () => {
  // [plan, centreline floor_area_m2, gross_internal_area_m2, the audit's figure and reading]
  const ROWS: [string, number, number, string][] = [
    ["1-apartment", 70, 65.81, "A12: GIA 9750 × 6750 = 65.8 — same figure"],
    ["2-house", 131.2, 125.16, "H8: total GIA with garage 125.2 — same figure (habitable 99.2 drops the garage)"],
    ["3-studio", 30, 27.31, "S7: GIA 5750 × 4750 = 27.3 — same figure"],
    ["2026-10-24-rerun/1-apartment", 72, 68.64, "NA7: GIA 8800 × 7800 = 68.6 — same figure"],
    ["2026-10-24-rerun/2-house", 122.5, 115.9, "NH10: about 101 m² GIA habitable = this less the garage"],
    ["2026-10-24-rerun/3-studio", 30, 27.84, "NS6: GIA 5800 × 4800 = 27.8 — same figure"],
    [
      "2026-10-25-rerun/1-apartment",
      84.28,
      79.6,
      "RA8: 67.2 is the flat alone; this shell also wraps the 9800 × 1400 corridor",
    ],
    [
      "2026-10-25-rerun/2-house",
      117,
      110.49,
      "RH11: 102.6 habitable on centrelines; this is the whole shell, garage in",
    ],
    ["2026-10-25-rerun/3-studio", 30, 27.84, "RS7: GIA 5800 × 4800 = 27.8 — same figure"],
    ["2026-10-26-rerun-armA/1-apartment", 70.5, 67.16, "OA7: GIA 9200 × 7300 = 67.2 — same figure"],
    ["2026-10-26-rerun-armA/2-house", 112.14, 105.78, "OH12: 12300 × 8600 = 105.8 before the garage — same figure"],
    ["2026-10-26-rerun-armA/3-studio", 30, 27.84, "OS5: GIA 5800 × 4800 = 27.8 — same figure"],
    [
      "2026-10-26-rerun-armB/1-apartment",
      81.9,
      78.32,
      "CA10: 66.9 is the flat alone; this shell also wraps the corridor",
    ],
    ["2026-10-26-rerun-armB/2-house", 114, 107.64, "CH9: GIA 11700 × 9200 = 107.6 before the garage — same figure"],
    ["2026-10-26-rerun-armB/3-studio", 29.9, 27.72, "CS8: GIA 6300 × 4400 = 27.7 — same figure"],
    ["2026-10-26-walls-first/2-house", 129.6, 125.02, "WH12: GIA 13300 × 9400 = 125.0 before the garage — same figure"],
    ["2026-10-26-walls-first/3-studio", 30, 27.84, "WS6: GIA 5800 × 4800 = 27.8 — same figure"],
  ];
  for (const [plan, centre, gia, why] of ROWS) {
    it(`${plan}: ${gia} m² GIA (${why})`, () => {
      const t = totals(read(`${FC}/${plan}.arch`));
      expect(t.floor_area_m2).toBe(centre);
      expect(t.gross_internal_area_m2).toBe(gia);
      expect(t.gross_internal_area_omitted).toBeUndefined();
      // Never above the centreline figure on these plans: their rooms tile the shell.
      expect(gia).toBeLessThan(centre);
    });
  }

  it("the walls-first apartment is refused: an exterior wall divides its shell (WA's 70.6 is the flat alone)", () => {
    // `wR` (exterior) stands between the flat and the corridor `wC` wraps: which side is the
    // building is the audit's reading, not a fact the plan states.
    const t = totals(read(`${FC}/2026-10-26-walls-first/1-apartment.arch`));
    expect(t.gross_internal_area_m2).toBeUndefined();
    expect(t.gross_internal_area_omitted).toBe("exterior-ring-subdivided");
  });
});

suite("PS4.4 — the GIA rule, case by case", () => {
  const plan = (body: string): string => `plan "p" {\n  units mm\n${body}\n}`;
  const SHELL = "  wall id=s exterior thickness 200 { (0,0) (10000,0) (10000,8000) (0,8000) close }";

  it("a closed ring: the rectangle inside the inner faces, a door in it changes nothing", () => {
    const bare = totals(plan(`${SHELL}\n  room id=a at (0,0) size 10000x8000 label "A"`));
    const door = totals(
      plan(`${SHELL}\n  room id=a at (0,0) size 10000x8000 label "A"\n  door on s at 1000 width 900`),
    );
    expect(bare.gross_internal_area_m2).toBe(76.44); // 9800 × 7800
    expect(door.gross_internal_area_m2).toBe(76.44);
  });

  it("partitions inside the shell are counted; `walls from rooms` derives the ring", () => {
    const t = totals(
      plan(
        '  room id=a at (0,0) size 5000x4000 label "A"\n  room id=b right-of a size 3000x4000 label "B"\n  walls from rooms exterior 200 partition 100',
      ),
    );
    expect(t.gross_internal_area_m2).toBe(29.64); // 7800 × 3800, the 100 partition inside
    expect(t.net_floor_area_m2).toBe(29.26); // net takes the partition out
  });

  it("a curved shell is exact: π (r − t/2)², no tessellation", () => {
    const t = totals(
      plan(
        '  wall id=s exterior thickness 200 { (0,0) arc (10000,0) radius 5000 cw arc (0,0) radius 5000 cw }\n  room id=a circle at (5000,0) radius 5000 label "A"',
      ),
    );
    expect(t.gross_internal_area_m2).toBe(Math.round(Math.PI * 4900 * 4900 * 1e-4) / 100);
  });

  it("a courtyard ring's court is not floor; two buildings sum", () => {
    const court = totals(
      plan(
        `  wall id=s exterior thickness 200 { (0,0) (12000,0) (12000,10000) (0,10000) close }\n  wall id=c exterior thickness 200 { (4000,3000) (8000,3000) (8000,7000) (4000,7000) close }\n  room id=a at (0,0) size 12000x3000 label "A"`,
      ),
    );
    expect(court.gross_internal_area_m2).toBe(98); // 11800 × 9800 − 4200 × 4200
    const two = totals(
      plan(
        `  wall id=s exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }\n  wall id=t exterior thickness 200 { (8000,0) (12000,0) (12000,4000) (8000,4000) close }\n  room id=a at (0,0) size 5000x4000 label "A"\n  room id=b at (8000,0) size 4000x4000 label "B"`,
      ),
    );
    expect(two.gross_internal_area_m2).toBe(32.68); // 4800 × 3800 + 3800 × 3800
  });

  it("refuses rather than guesses: open run, no shell, a dividing exterior wall, a ring in a court", () => {
    const why = (body: string) => totals(plan(body)).gross_internal_area_omitted;
    expect(
      why(
        '  wall id=s exterior thickness 200 { (0,0) (9000,0) (9000,7000) }\n  room id=a at (0,0) size 9000x7000 label "A"',
      ),
    ).toBe("no-closed-exterior-ring");
    expect(why('  room id=a at (0,0) size 9000x7000 label "A"')).toBe("no-closed-exterior-ring");
    expect(
      why(
        `${SHELL}\n  wall id=x exterior thickness 200 { (6000,0) (6000,8000) }\n  room id=a at (0,0) size 6000x8000 label "A"\n  room id=b at (6000,0) size 4000x8000 label "B"`,
      ),
    ).toBe("exterior-ring-subdivided");
    expect(
      why(
        `  wall id=s exterior thickness 200 { (0,0) (20000,0) (20000,20000) (0,20000) close }\n  wall id=c exterior thickness 200 { (4000,4000) (16000,4000) (16000,16000) (4000,16000) close }\n  wall id=p exterior thickness 200 { (8000,8000) (12000,8000) (12000,12000) (8000,12000) close }\n  room id=a at (0,0) size 20000x4000 label "A"`,
      ),
    ).toBe("nested-exterior-rings");
  });

  it("exactly one of the two keys, beside floor_area_m2, on every storey", () => {
    for (const f of ["examples/townhouse.arch", "examples/hillside-villa.arch", "examples/parametric.arch"]) {
      const s = describe(read(f));
      for (const t of [s.totals, ...(s.levels ?? []).map((l) => l.totals)]) {
        const keys = Object.keys(t);
        expect(keys[keys.indexOf("floor_area_m2") + 1]).toMatch(/^gross_internal_area_(m2|omitted)$/);
        expect("gross_internal_area_m2" in t !== "gross_internal_area_omitted" in t).toBe(true);
      }
    }
  });

  it("no wall is no work: an empty set is refused before the joinery", () => {
    expect(grossInternalArea([])).toEqual({ ok: false, reason: "no-closed-exterior-ring" });
  });
});

suite("PS4.4 — brief-bound intent assertions", () => {
  const APT = read(`${FC}/2026-10-26-rerun-armA/1-apartment.arch`);
  const BRIEF: Intent = { grossInternalAreaM2: { min: 67, source: "a two-bed apartment of about 70 m²" } };

  it('binds the brief: "~70 m²" as GIA ≥ 67 passes the plan, and fails when the plan shrinks', () => {
    const ok = validateIntent(APT, BRIEF);
    expect(ok.ok).toBe(true);
    expect(ok.measures).toEqual([
      {
        path: "/grossInternalAreaM2",
        what: "gross internal area",
        unit: "m2",
        measured: [67.16],
        residual: [0],
        pass: true,
      },
    ]);
    // The living room loses 200 mm of depth: the derived shell follows, 9200 × 7100 inside.
    const shrunk = APT.replace("size 9400x3000", "size 9400x2800");
    expect(shrunk).not.toBe(APT);
    const r = validateIntent(shrunk, BRIEF);
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => [v.code, v.gate, v.message])).toEqual([
      [
        "E_INTENT_GROSS_AREA",
        true,
        "intent /grossInternalAreaM2: gross internal 65.32 m² outside [67, ∞], residual −1.68 m² (a two-bed apartment of about 70 m²)",
      ],
    ]);
    expect(r.measures![0]!.residual).toEqual([-1.68]);
    // The centreline total still reads "about 70" (68.62): the area basis the audits filed.
    expect(describe(shrunk).totals.floor_area_m2).toBeGreaterThan(67);
  });

  it("the widening drill with a bound width: widening the living room breaks it, the shell holds", () => {
    const before = read(`${REPRO}/widen-before.arch`);
    const o = applyLetOverride(before, "AW", "4500");
    if (!o.ok) throw new Error("override refused");
    const intent: Intent = {
      grossInternalAreaM2: { min: 37, max: 38, source: "about 37.5 m² inside" },
      roomDimensions: [
        { room: "Living", widthMm: { max: 4000, source: "a living room 4 m wide" } },
        { room: "b", sizeMm: { w: 5000, h: 4000, source: "a 4 × 5 m bedroom" } },
      ],
    };
    const was = validateIntent(before, intent);
    expect(was.ok).toBe(true);
    expect(was.measures!.map((m) => [m.path, m.measured, m.residual, m.pass])).toEqual([
      ["/grossInternalAreaM2", [37.44], [0], true],
      ["/roomDimensions/0/widthMm", [4000], [0], true],
      // Written 5000 × 4000, measured 4000 × 5000: the size binds the rectangle, not its turn.
      ["/roomDimensions/1/sizeMm", [5000, 4000], [0, 0], true],
    ]);
    const now = validateIntent(o.source, intent);
    expect(now.ok).toBe(false);
    expect(now.violations.map((v) => [v.code, v.message])).toEqual([
      [
        "E_INTENT_ROOM_DIMENSION",
        'intent /roomDimensions/0/widthMm: "Living" width 4500 mm on centrelines outside [0, 4000] mm, residual +500 mm (a living room 4 m wide)',
      ],
    ]);
    // The shell is written at fixed coordinates: GIA and the moved bedroom's size still hold.
    expect(now.measures!.filter((m) => m.pass).map((m) => m.path)).toEqual([
      "/grossInternalAreaM2",
      "/roomDimensions/1/sizeMm",
    ]);
  });

  it("refuses what it cannot measure, gating, with a typed reason", () => {
    const src = `plan "q" {
  units mm
  room id=a at (0,0) size 4000x3000 label "Bed"
  room id=b right-of a size 4000x3000 label "Bed"
  room id=c polygon (8000,0) (11000,0) (11000,3000) (9000,3000) label "Nook"
}`;
    const r = validateIntent(src, {
      grossInternalAreaM2: { min: 1, source: "x" },
      roomDimensions: [
        { room: "Bed", widthMm: { min: 1, source: "x" } },
        { room: "Nook", depthMm: { min: 1, source: "x" } },
        { room: "Study", sizeMm: { w: 1, h: 1, source: "x" } },
        { room: "a", widthMm: { min: 1, source: "x" } },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.measures!.map((m) => [m.path, m.reason ?? "measured", m.pass])).toEqual([
      ["/grossInternalAreaM2", "no-closed-exterior-ring", false],
      ["/roomDimensions/0/widthMm", "room-ambiguous", false],
      ["/roomDimensions/1/depthMm", "room-not-rectangular", false],
      ["/roomDimensions/2/sizeMm", "room-not-found", false],
      ["/roomDimensions/3/widthMm", "measured", true],
    ]);
    expect(r.violations.every((v) => v.code === "E_INTENT_UNMEASURED" && v.gate)).toBe(true);
    // Id-free: a room bound by its id is still named by its label.
    expect(r.violations.map((v) => v.message).join("\n")).not.toMatch(/\bid=|"a"/);
  });

  it("names an unlabelled room by the shared naming phrase, never its id", () => {
    const src = `plan "u" {
  units mm
  room id=r_k at (0,0) size 3000x3000 uses kitchen
}`;
    const r = validateIntent(src, { roomDimensions: [{ room: "r_k", widthMm: { min: 3500, source: "x" } }] });
    expect(r.violations[0]!.message).toBe(
      "intent /roomDimensions/0/widthMm: the kitchen width 3000 mm on centrelines outside [3500, ∞] mm, residual −500 mm (x)",
    );
  });

  it("an intent without the new fields gives the result it always did (no `measures` key)", () => {
    const r = validateIntent(APT, { rooms: 5, totalAreaM2: { min: 63, max: 77, source: "about 70 m²" } });
    expect("measures" in r).toBe(false);
    expect(r.assertions.every((a) => !("measure" in a))).toBe(true);
  });

  it("intentFromJson: the shapes it accepts and the pathed errors it gives", () => {
    expect(
      intentFromJson({
        grossInternalAreaM2: { min: 67, source: "s" },
        roomDimensions: [
          { room: "a", widthMm: { min: 1, source: "s" }, sizeMm: { w: 1, h: 2, tolerance: 0, source: "s" } },
        ],
      }).errors,
    ).toEqual([]);
    expect(
      intentFromJson({
        grossInternalAreaM2: { source: "s" },
        roomDimensions: [{ room: "" }, { room: "a", sizeMm: { w: 0, h: 1, tolerance: -1, extra: 1 } }, 3],
      }).errors,
    ).toEqual([
      "/grossInternalAreaM2: expected at least one of min/max",
      "/roomDimensions/0/room: expected a room id or label",
      "/roomDimensions/0: expected at least one of widthMm/depthMm/sizeMm",
      "/roomDimensions/1/sizeMm/extra: unknown key",
      "/roomDimensions/1/sizeMm/w: expected a number > 0",
      "/roomDimensions/1/sizeMm/tolerance: expected a number ≥ 0",
      "/roomDimensions/1/sizeMm/source: expected a string",
      "/roomDimensions/2: expected an object",
    ]);
  });
});
