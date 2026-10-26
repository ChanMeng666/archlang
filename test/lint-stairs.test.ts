/**
 * Plan-soundness PS2.11e (the stair bullets), PS2.34 and PS2.15: the six stair-safety codes. What
 * each fires on, what it must not fire on, its boundaries, its words (no id in a message, the ids in
 * the hints) and that a `place` turn moves none of them (each is classified `invariant` in
 * `test/d4-oracle.ts`).
 */

import { describe as suite, expect, it } from "vitest";
import { type Diagnostic, lint, lintCoverage } from "../src/index.js";
import { DEFAULT_RULESET, LINT_PROFILES } from "../src/lint.js";
import { MAX_STAIR_WORK, minimumRun } from "../src/lint/rules/stairs.js";
import { resolveRuleset } from "../src/lint/ruleset.js";

const of = (src: string, code: string, profile?: string): Diagnostic[] =>
  lint(src, profile ? { profile } : {}).filter((d) => d.code === code);

/** One storey: a 6000 × 6000 shell, a hall on the north half and a bedroom on the south half. */
const house = (body: string, extra = ""): string => `plan "P" {
  units mm
  grid 50
${extra}  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  wall id=w_p partition thickness 100 { (0,3000) (6000,3000) }
  room id=r_hall at (0,0) size 6000x3000 label "Hall" uses hall
  room id=r_bed at (0,3000) size 6000x3000 label "Bedroom" uses bedroom
  door id=d_front at (4500,0) width 900 wall shell swing into r_hall
  window at (3000,6000) width 1500 wall shell
${body}
}`;

/** Two storeys over one shaft `st`: `lower`/`upper` are each storey's extra statements. */
const twoStorey = (lower: string, upper: string, height = ""): string => `plan "P" {
  units mm
  grid 50
${height}  level 1 "Ground" {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
    room id=hall at (0,0) size 6000x6000 label "Hall" uses hall
    door id=front at (4500,6000) width 1000 wall shell
    window at (3000,0) width 1500 wall shell
${lower}
  }
  level 2 "First" {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
    wall id=w_p partition thickness 100 { (4000,0) (4000,6000) }
    room id=landing at (0,0) size 4000x6000 label "Landing" uses circulation
    room id=bed at (4000,0) size 2000x6000 label "Bedroom" uses bedroom
    door id=d_bed at (4000,5000) width 900 wall w_p swing into bed
    window at (5000,0) width 1200 wall shell
${upper}
  }
}`;

const STAIR_CODES = [
  "W_SWING_OVER_STAIR",
  "W_STAIR_NO_LANDING",
  "W_STAIR_SIDE_ENTRY",
  "W_STAIR_HEAD_VOID",
  "W_STAIR_TOO_STEEP",
  "W_SHAFT_FOOTPRINT_MISMATCH",
];
const stairCodes = (src: string, profile?: string): string[] =>
  lint(src, profile ? { profile } : {})
    .map((d) => d.code!)
    .filter((c) => STAIR_CODES.includes(c));

/** No message quotes an authored id; every hint quotes the stair's. */
function wordsHold(ds: Diagnostic[], ids: string[]): void {
  for (const d of ds) {
    for (const id of ids) expect(d.message, d.message).not.toContain(`\`${id}\``);
    expect(d.hints!.join(" ")).toMatch(/`st`|`s`/);
  }
}

suite("W_SWING_OVER_STAIR", () => {
  it("a leaf over the low end of a rising flight", () => {
    // The bedroom door swings north into the hall, over the flight's foot end (y 2000-2800).
    const ds = of(
      house(
        "  door id=d_bed at (1300,3000) width 800 wall w_p swing into r_hall\n  stair id=st at (900,300) size 1000x2500 dir up",
      ),
      "W_SWING_OVER_STAIR",
    );
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toBe(
      'The door between "Hall" and "Bedroom" swings over the stair in "Hall": its open leaf sweeps the flight itself.',
    );
    expect(ds[0]!.hints![0]).toContain("`d_bed`");
    expect(ds[0]!.hints![0]).toContain("`swing in`");
    expect(ds[0]!.hints![0]).toContain("(this clears the stair)");
    wordsHold(ds, ["d_bed", "st"]);
  });

  it("not a leaf under the high end of a rising flight (the treads stand above the door's head)", () => {
    // The front door's leaf sweeps y 0-900 beside x 4050-4950; the flight rises northward from
    // y 3000 to y 400, so at y 900 its treads stand about 2.4 m up, above the 2100 mm head.
    expect(of(house("  stair id=st at (4000,400) size 1000x2400 dir up"), "W_SWING_OVER_STAIR")).toEqual([]);
  });

  it("a stairwell: the whole footprint is a hole on the storey the flight comes down to", () => {
    // The bedroom door in `w_p` (x 4000) swings west into the landing, sweeping x 3100-4000 over
    // y 1600-2500: over the well's middle when the well reaches x 3500, clear of it at x 3000.
    const at = (x: number) =>
      twoStorey(
        `    stair id=st at (${x},1000) size 1000x3000 dir up`,
        `    door id=d_side at (4000,2050) width 900 wall w_p swing into landing
    stair id=st at (${x},1000) size 1000x3000 dir down`,
      );
    expect(of(at(2000), "W_SWING_OVER_STAIR")).toEqual([]);
    expect(of(at(2500), "W_SWING_OVER_STAIR").map((d) => [d.level, d.message])).toEqual([
      [
        2,
        'The door between "Landing" and "Bedroom" swings over the stair in "Landing" on level 2: its open leaf sweeps the flight itself.',
      ],
    ]);
  });

  it("the foot: 400 mm clear across the flight in a dwelling, the whole landing elsewhere", () => {
    // A side door in the west shell, swinging in beside the foot (the flight ends at y 1800).
    const at = (y: number) =>
      house(`  door id=d_side at (0,${y}) width 700 wall shell swing in
  stair id=st at (300,300) size 1000x1500 dir up`);
    const office = (src: string) => src.replace('label "Bedroom" uses bedroom', 'label "Office" uses office');
    expect(of(at(2150), "W_SWING_OVER_STAIR").map((d) => d.message.split(": ")[1])).toEqual([
      "its open leaf comes within 400 mm of the bottom step, the clear space a door at the foot of a flight must leave across its width.",
    ]);
    // 400 mm left clear: a dwelling's door may swing there (AD K 1.24, Diagram 1.8)…
    expect(of(at(2550), "W_SWING_OVER_STAIR")).toEqual([]);
    // …and no other building's may (1.23b).
    expect(of(office(at(2550)), "W_SWING_OVER_STAIR").map((d) => d.message.split(": ")[1])).toEqual([
      "its open leaf sweeps the landing at the foot of the flight, which no door of a building other than a dwelling may swing across.",
    ]);
  });
});

suite("W_STAIR_NO_LANDING", () => {
  it("a foot against a partition: the depth is measured to its face, across the flight's middle", () => {
    const ds = of(house("  stair id=st at (200,200) size 1000x2300 dir up"), "W_STAIR_NO_LANDING");
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toBe(
      'The stair in "Hall" has no landing at its foot: the partition wall at y 3000 stands 450 mm past the bottom step, where a landing as long as the flight is wide needs 1000 mm (550 mm short).',
    );
    expect(ds[0]!.hints![0]).toContain("`st`");
    expect(ds[0]!.hints![0]).toContain('wall "w_p"');
    // Shortened to leave 1050 mm: quiet.
    expect(of(house("  stair id=st at (200,200) size 1000x1700 dir up"), "W_STAIR_NO_LANDING")).toEqual([]);
  });

  it("a cased opening across the foot is passable; a door's closed leaf is not", () => {
    const opening = house(
      "  opening id=o at (700,3000) width 1200 wall w_p\n  stair id=st at (200,200) size 1000x2300 dir up",
    );
    expect(of(opening, "W_STAIR_NO_LANDING")).toEqual([]);
    const door = house(
      "  door id=dd at (700,3000) width 900 wall w_p swing into r_bed\n  stair id=st at (200,200) size 1000x2300 dir up",
    );
    expect(of(door, "W_STAIR_NO_LANDING")).toHaveLength(1);
  });

  it("a flank wall drawn 50 mm into the flight is not read as standing across its end", () => {
    // The stair runs to x 4100 along a partition at x 4100 whose body reaches x 4050.
    const body =
      "  wall id=w_v partition thickness 100 { (4100,0) (4100,3000) }\n  stair id=st at (3100,200) size 1000x1700 dir up";
    expect(of(house(body), "W_STAIR_NO_LANDING")).toEqual([]);
  });

  it("the head on the storey a flight arrives at", () => {
    const ds = of(
      twoStorey(
        "    stair id=st at (2000,200) size 1000x3000 dir up",
        "    stair id=st at (2000,200) size 1000x3000 dir down",
      ),
      "W_STAIR_NO_LANDING",
    );
    expect(ds.map((d) => [d.level, d.message])).toEqual([
      [
        2,
        'The stair in "Landing" on level 2 has no landing at its head: the exterior wall at y 0 stands 100 mm past the top step, where a landing as long as the flight is wide needs 1000 mm (900 mm short).',
      ],
    ]);
  });

  it("a building other than a dwelling asks 1200 mm (AD K 1.23a); `residential-basic` reads every plan as one", () => {
    const office = house("  stair id=st at (200,200) size 1000x1700 dir up").replace(
      'label "Bedroom" uses bedroom',
      'label "Office" uses office',
    );
    expect(of(office, "W_STAIR_NO_LANDING").map((d) => d.message)).toEqual([
      'The stair in "Hall" has no landing at its foot: the partition wall at y 3000 stands 1050 mm past the bottom step, where a landing as long as the flight is wide needs 1200 mm (150 mm short).',
    ]);
    expect(of(office, "W_STAIR_NO_LANDING", "residential-basic")).toEqual([]);
  });

  it("no floor beyond the end", () => {
    const src = `plan "P" {\n  units mm\n  room id=r at (0,0) size 3000x3000 label "Hall" uses hall\n  stair id=st at (3500,0) size 1000x2400 dir up\n}`;
    expect(of(src, "W_STAIR_NO_LANDING").map((d) => d.message)).toEqual([
      "The stair in the middle of the plan has no landing at its foot: there is no floor, where a landing as long as the flight is wide needs 1000 mm (1000 mm short).",
    ]);
  });
});

suite("W_STAIR_SIDE_ENTRY", () => {
  const flank = (y: number) => `plan "P" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (7000,0) (7000,4000) (0,4000) close }
  wall id=w_v partition thickness 100 { (3000,0) (3000,4000) }
  room id=r_bed at (0,0) size 3000x4000 label "Bedroom" uses bedroom
  room id=r_stair at (3000,0) size 4000x4000 label "Stair hall" uses hall
  door id=d_front at (7000,3200) width 900 wall shell swing into r_stair
  door id=d_side at (3000,${y}) width 800 wall w_v swing into r_bed
  window at (0,2000) width 1200 wall shell
  stair id=st at (3200,300) size 1100x2400 dir up
}`;

  it("a doorway beside the flight, nearer than the least clear path", () => {
    const ds = of(flank(1500), "W_STAIR_SIDE_ENTRY");
    expect(ds.map((d) => d.message)).toEqual([
      'The door between "Bedroom" and "Stair hall" opens onto the side of the stair in "Stair hall", 150 mm from the flight: less than the 700 mm a person needs to step through and turn, and a flight is entered at its foot or head, from a landing.',
    ]);
    expect(ds[0]!.hints![0]).toContain("`d_side`");
    expect(ds[0]!.hints![0]).toContain("`st`");
  });

  it("quiet once a doorway's width stands past the flight's end; and only beside the part a person cannot pass under", () => {
    expect(of(flank(3250), "W_STAIR_SIDE_ENTRY")).toEqual([]);
    // Beside the flight's high end only (y 300-1100, treads above 2 m on a 3000 mm storey): quiet.
    expect(of(flank(700), "W_STAIR_SIDE_ENTRY")).toEqual([]);
  });

  it("the accessibility profile's wider path (900 mm) is the threshold it reads", () => {
    const wide = flank(1500).replace("stair id=st at (3200,300)", "stair id=st at (3850,300)");
    expect(of(wide, "W_STAIR_SIDE_ENTRY")).toEqual([]);
    expect(of(wide, "W_STAIR_SIDE_ENTRY", "accessibility-advisory")).toHaveLength(1);
  });
});

suite("W_STAIR_HEAD_VOID", () => {
  it("a void on the landing beyond the head, not the stairwell itself", () => {
    const lower = "    stair id=st at (1000,1500) size 1000x3000 dir up";
    const upper = (v: string) => `    stair id=st at (1000,1500) size 1000x3000 dir down\n    ${v}`;
    const ds = of(twoStorey(lower, upper("void id=g at (1000,200) size 1000x1100")), "W_STAIR_HEAD_VOID");
    expect(ds.map((d) => d.message)).toEqual([
      'A void opens on the landing at the head of the stair in "Landing" on level 2: the floor ends 200 mm past the top step, where a person stepping off the flight needs 1000 mm (800 mm short).',
    ]);
    expect(ds[0]!.hints![0]).toContain("`g`");
    // The void drawn as the stairwell, or beside the head: quiet.
    expect(of(twoStorey(lower, upper("void id=g at (1000,1500) size 1000x3000")), "W_STAIR_HEAD_VOID")).toEqual([]);
    expect(of(twoStorey(lower, upper("void id=g at (2200,200) size 1000x1100")), "W_STAIR_HEAD_VOID")).toEqual([]);
  });
});

suite("W_STAIR_TOO_STEEP", () => {
  it("the least run: the fewest risers, one going fewer", () => {
    expect(minimumRun(3000, DEFAULT_RULESET)).toMatchObject({ risers: 14, going: 220, run: 2860 });
    expect(minimumRun(2640, DEFAULT_RULESET)).toMatchObject({ risers: 12, run: 2420 }); // 12 × 220 = 2640 exactly
    expect(minimumRun(2700, resolveRuleset(LINT_PROFILES["cn-residential-advisory"]))).toMatchObject({
      risers: 14,
      run: 2860,
    });
    const uk = minimumRun(2700, resolveRuleset(LINT_PROFILES["uk-residential-advisory"]));
    expect(uk.risers).toBe(13);
    expect(uk.going).toBeCloseTo(2700 / 13 / 0.9004, 9); // the pitch, not the 220 going, binds
    expect(minimumRun(2700, resolveRuleset(LINT_PROFILES["us-residential-advisory"]))).toMatchObject({
      risers: 14,
      run: 3302,
    });
    expect(minimumRun(150, DEFAULT_RULESET)).toMatchObject({ risers: 1, run: 0 });
  });

  it("judged against an authored height, on the storey the flight climbs from", () => {
    const src = (run: number) =>
      twoStorey(
        `    stair id=st at (2000,1200) size 1000x${run} dir up`,
        `    stair id=st at (2000,1200) size 1000x${run} dir down`,
        "  height 2800\n",
      );
    const ds = of(src(2000), "W_STAIR_TOO_STEEP");
    expect(ds.map((d) => [d.level, d.message])).toEqual([
      [
        1,
        'The stair in "Hall" on level 1 is too steep: its 2000 mm run must climb the 2800 mm storey, and at 220 mm a riser at most that is 13 risers and 12 goings of at least 220 mm, a 2640 mm run (640 mm short).',
      ],
    ]);
    expect(of(src(2650), "W_STAIR_TOO_STEEP")).toEqual([]);
  });

  it("no authored height: not judged, and the coverage report says so", () => {
    const src = twoStorey(
      "    stair id=st at (2000,1200) size 1000x1000 dir up",
      "    stair id=st at (2000,1200) size 1000x1000 dir down",
    );
    expect(of(src, "W_STAIR_TOO_STEEP")).toEqual([]);
    const stairs = lintCoverage(src)!.families.find((f) => f.family === "stairs")!;
    expect(stairs.skipped).toEqual([
      { reason: "no-storey-height", why: "the plan states no storey height", levels: [1] },
    ]);
  });
});

suite("W_SHAFT_FOOTPRINT_MISMATCH", () => {
  const pair = (lower: string, upper: string) => twoStorey(`    ${lower}`, `    ${upper}`);

  it("a stair drawn in another place, or turned, on the next storey", () => {
    const ds = of(
      pair("stair id=st at (500,1200) size 1000x3000 dir up", "stair id=st at (2500,1200) size 1000x3000 dir down"),
      "W_SHAFT_FOOTPRINT_MISMATCH",
    );
    expect(ds.map((d) => [d.level, d.message])).toEqual([
      [
        2,
        "The stair in the middle of the plan on level 2 does not stand over the run it continues from level 1: the footprints overlap by 0% of the smaller, under half.",
      ],
    ]);
    expect(ds[0]!.hints![0]).toContain("on level 1 it is at (500,1200) size 1000x3000");
    expect(
      of(
        pair("stair id=st at (500,1200) size 1000x3000 dir up", "stair id=st at (500,1200) size 3000x1000 dir down"),
        "W_SHAFT_FOOTPRINT_MISMATCH",
      ),
    ).toHaveLength(1);
    // Shifted by a wall's thickness: more than half still overlaps.
    expect(
      of(
        pair("stair id=st at (500,1200) size 1000x3000 dir up", "stair id=st at (600,1200) size 1000x3000 dir down"),
        "W_SHAFT_FOOTPRINT_MISMATCH",
      ),
    ).toEqual([]);
  });

  it("a lift car must stand in exactly the same footprint", () => {
    const lift = (x: number) =>
      pair("elevator id=lift at (500,500) size 1600x1600", `elevator id=lift at (${x},500) size 1600x1600`);
    expect(of(lift(500), "W_SHAFT_FOOTPRINT_MISMATCH")).toEqual([]);
    expect(of(lift(600), "W_SHAFT_FOOTPRINT_MISMATCH")).toHaveLength(1);
  });

  it("a one-storey plan: storey matching is skipped, as `W_STAIR_UNMATCHED`'s is", () => {
    const src = house("  stair id=st at (200,200) size 1000x1700 dir up");
    expect(lintCoverage(src)!.families.find((f) => f.family === "vertical")!.status).toBe("skipped");
  });
});

suite("a `place` turn moves none of them", () => {
  it("the same codes, on the same statements, at every quarter-turn", () => {
    const body = `  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  wall id=w_p partition thickness 100 { (0,3000) (6000,3000) }
  room id=r_hall at (0,0) size 6000x3000 label "Hall" uses hall
  room id=r_bed at (0,3000) size 6000x3000 label "Bedroom" uses bedroom
  door id=d_front at (4500,0) width 900 wall shell swing into r_hall
  door id=d_bed at (1300,3000) width 800 wall w_p swing into r_hall
  window at (3000,6000) width 1500 wall shell
  stair id=st at (900,300) size 1000x2500 dir up`;
    const placed = (rot: number) =>
      `plan "P" {\n  units mm\n  grid 50\n  component c() {\n${body}\n  }\n  place c() as g at (0,0)${rot ? ` rotate ${rot}` : ""}\n}`;
    const base = stairCodes(placed(0));
    expect(base).toEqual(["W_SWING_OVER_STAIR", "W_STAIR_NO_LANDING"]);
    for (const r of [90, 180, 270]) expect(stairCodes(placed(r)), `rotate ${r}`).toEqual(base);
  });
});

suite("bad ruleset overrides are declined, never looped on or printed", () => {
  const src = `plan "P" {
  units mm
  height 2800
  room id=r at (0,0) size 6000x6000 label "Hall" uses hall
  stair id=s at (500,500) size 1000x2000 dir up
}`;
  const bad = [
    { stairMaxRiseMm: -200 },
    { stairMaxRiseMm: 0 },
    { stairMaxRiseMm: Number.NaN },
    { stairMaxRiseMm: Number.POSITIVE_INFINITY },
    { stairMaxRiseMm: 1e-300 },
    { stairMinGoingMm: -1 },
    { stairMinGoingMm: Number.NaN },
    { stairMinGoingMm: Number.POSITIVE_INFINITY },
    { stairMaxPitchRatio: 0 },
    { stairMaxPitchRatio: -1 },
    { stairMaxPitchRatio: Number.NaN },
  ];
  it.each(bad.map((r) => [JSON.stringify(r), r] as const))("%s", (_name, r) => {
    expect(minimumRun(2800, { ...DEFAULT_RULESET, ...r })).toBeNull();
    const ds = lint(src, { ruleset: r });
    expect(ds.filter((d) => d.code === "W_STAIR_TOO_STEEP")).toEqual([]);
    for (const d of ds) expect(`${d.message} ${(d.hints ?? []).join(" ")}`).not.toMatch(/Infinity|NaN|e\+\d/);
  });

  it("a bad rise is declined too", () => {
    for (const rise of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(minimumRun(rise, DEFAULT_RULESET)).toBeNull();
  });
});

suite("hints name only what an author can write", () => {
  it("a derived wall by its rooms, an unnamed door by its rooms (walls from rooms)", () => {
    // The red team's t01: a stair against the partition `walls from rooms` derived between the hall
    // and the bedroom, beside the hall-living door; neither has an id in the source.
    const src = `plan "T1" {
  units mm
  grid 50
  room id=hall at (0,0) size 2000x4000 label "Hall" uses hall
  room id=living right-of hall align top gap 0 size 4000x4000 label "Living" uses living
  room id=bed below hall align left gap 0 size 6000x3000 label "Bedroom" uses bedroom
  walls from rooms exterior 200 partition 100
  door between hall and living at 2000 from start width 800 swing into living
  door between hall and bed at 1000 from start width 800 swing into bed
  door on hall.top at center width 900 swing into hall
  window on living.top width 1800
  window on bed.bottom width 1800
  stair id=st at (500,1000) size 1000x2700 dir up
}`;
    const ds = lint(src).filter((d) => STAIR_CODES.includes(d.code!));
    expect(ds.map((d) => d.code)).toEqual(["W_STAIR_NO_LANDING", "W_STAIR_SIDE_ENTRY"]);
    const hints = ds.flatMap((d) => d.hints ?? []).join(" ");
    expect(hints).not.toContain("|");
    expect(hints).not.toContain("door_");
    expect(hints).toContain('the partition between "hall" and "bed"');
    expect(hints).toContain('Move the door between "Hall" and "Living" along its wall');
  });
});

suite("a flight that continues upward from where the flight below arrives", () => {
  it("is owed the lower flight's head landing, read on the lower flight's footprint", () => {
    // Level 2's run is drawn 1000 mm south of level 1's; level 1's flight arrives at y 1500, where a
    // partition at y 1000 stands 450 mm off. Read on level 2's own footprint (its top at y 2500) the
    // landing would look clear.
    const src = `plan "Three" {
  units mm
  grid 50
  level 1 {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,7000) (0,7000) close }
    room id=hall at (0,0) size 6000x7000 label "Hall" uses hall
    door id=front at (4500,7000) width 1000 wall shell
    stair id=st at (2000,1500) size 1000x3000 dir up
  }
  level 2 {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,7000) (0,7000) close }
    wall id=w_x partition thickness 100 { (0,1000) (6000,1000) }
    room id=store at (0,0) size 6000x1000 label "Store" uses storage
    room id=land at (0,1000) size 6000x6000 label "Landing" uses circulation
    door id=d_store at (4500,1000) width 800 wall w_x
    stair id=st at (2000,2500) size 1000x3000 dir up
  }
  level 3 {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,7000) (0,7000) close }
    room id=top at (0,0) size 6000x7000 label "Top" uses circulation
    stair id=st at (2000,2500) size 1000x3000 dir down
  }
}`;
    expect(of(src, "W_STAIR_NO_LANDING").map((d) => [d.level, d.message])).toEqual([
      [
        2,
        'The stair in "Landing" on level 2 has no landing at its head: the partition wall at y 1000 stands 450 mm past the top step, where a landing as long as the flight is wide needs 1000 mm (550 mm short).',
      ],
    ]);
    // The partition moved 600 mm north: 1050 mm clear of the arriving head, quiet.
    expect(
      of(
        src
          .replace("(0,1000) (6000,1000)", "(0,400) (6000,400)")
          .replace("size 6000x1000 label", "size 6000x400 label")
          .replace("at (0,1000) size 6000x6000", "at (0,400) size 6000x6600")
          .replace("(4500,1000) width 800 wall w_x", "(4500,400) width 800 wall w_x"),
        "W_STAIR_NO_LANDING",
      ),
    ).toEqual([]);
  });
});

suite("a curved wall near a landing", () => {
  it("is not measured: the landing is not judged and the coverage report says so", () => {
    const src = `plan "P" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) arc (0,4000) radius 10000 cw close }
  room id=r at (0,0) size 6000x4000 label "Hall" uses hall
  door id=d at (3000,0) width 900 wall shell
  stair id=st at (2500,500) size 1000x3000 dir up
}`;
    expect(of(src, "W_STAIR_NO_LANDING")).toEqual([]);
    const stairs = lintCoverage(src)!.families.find((f) => f.family === "stairs")!;
    expect(stairs.skipped!.map((s) => s.reason)).toContain("curved-landing-wall");
  });
});

suite("the counted work", () => {
  it("is a count, charged before the work", () => {
    expect(Number.isInteger(MAX_STAIR_WORK)).toBe(true);
    expect(MAX_STAIR_WORK).toBeGreaterThan(200_000);
  });
});
