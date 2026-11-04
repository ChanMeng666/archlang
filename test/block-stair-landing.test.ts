/**
 * A block stair's landings between its flights, and a rising block read to the height asked (issue
 * #362, card S4, `archlang-lab/plans/preview-and-remodel/research/2026-11-02-j11-stairs-s4.md`).
 *
 * A landing is read leg by leg, along each flight that meets it. At a corner `E_STAIR_PIECES` holds
 * both legs at `width` already. The rise spreads over the flights, landings level, so the high end of
 * a block is passed under as the high end of a flight is, and the floor a block wraps round is floor.
 *
 * Every figure is worked out by hand from the plan's numbers, in the comment beside it, never read
 * back from the rule. Nothing here claims a stair complies.
 */

import { describe, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { compile, describe as describePlan, type Diagnostic, lint, lintCoverage } from "../src/index.js";
import { buildLintContext } from "../src/lint/context.js";
import { stairZones, storeyStairs } from "../src/lint/rules/stairs.js";
import { resolveRuleset } from "../src/lint/ruleset.js";
import { lintStoreys } from "../src/lint/storeys.js";
import {
  type BlockStair,
  CLEAR_L,
  hallBody,
  hallPlan,
  movedBlock,
  planOf,
  stairBlock,
  THREE_FLIGHTS,
  upperBody,
} from "./block-stair-plans.js";
import { D4_ELEMENTS, witnessPair } from "./d4-oracle.js";

const HEIGHT = "  height 2750\n";
const NO_LANDING = "W_STAIR_NO_LANDING";
const of = (src: string, code: string): Diagnostic[] => lint(src).filter((d) => d.code === code);
const rows = (src: string) => describePlan(src, { facts: ["clearances"] }).clearances!.stairs![0]!.landings;
const turns = (src: string) => rows(src).filter((l) => l.end === "turn");
const OFFICE = (src: string): string => src.replace('label "Hall" uses hall', 'label "Office" uses office');

/** Two flights in line, 1400 each, and a landing `length` long between them. */
const inLine = (length: number): BlockStair => ({
  name: "in line",
  width: 1000,
  pieces: [
    [1000, 2000 + length, 1000, 1400],
    [1000, 2000, 1000, length],
    [1000, 600, 1000, 1400],
  ],
  tails: ["bottom", "bottom"],
});

/** A half-turn: both flights meet the landing's south edge, and it is `depth` deep. */
const halfTurn = (depth: number): BlockStair => ({
  name: "half-turn",
  width: 1000,
  pieces: [
    [500, 2000, 1000, 2000],
    [500, 2000 - depth, 2200, depth],
    [1700, 2000, 1000, 2000],
  ],
  tails: ["bottom", "top"],
});

/** A building of the storeys given, ascending from level 1, with one shaft. */
const building = (...storeys: string[]): string =>
  `plan "Shaft" {\n  units mm\n${storeys.map((b, i) => `  level ${i + 1} {\n${b}\n  }`).join("\n")}\n}\n`;

describe("a landing between the flights is measured", () => {
  it("a short landing in line reports once, with the figures of the plan", () => {
    const src = planOf(inLine(400));
    const ds = of(src, NO_LANDING);
    expect(ds.length).toBe(1);
    expect(ds[0]!.message).toBe(
      'The stair in "Hall" has too short a landing between its flights: it runs 400 mm past the top step of the flight that reaches it, where a landing as long as the flight is wide needs 1000 mm (600 mm short).',
    );
    expect(ds[0]!.hints![0]).toContain("flights of `s` so it runs at least 1000 mm along each flight");
    expect(turns(src)).toEqual([{ end: "turn", need_mm: 1000, clear_mm: 400, by: { kind: "landing-end" } }]);
  });

  it("the figure is exact: 999 mm is 1 mm short, 1000 mm is clear", () => {
    expect(of(planOf(inLine(999)), NO_LANDING)[0]!.message).toContain("(1 mm short)");
    expect(of(planOf(inLine(1000)), NO_LANDING)).toEqual([]);
    expect(turns(planOf(inLine(1000)))).toEqual([{ end: "turn", need_mm: 1000, clear_mm: 1000, by: null }]);
  });

  it("the walking line's length is no measure: a half-turn landing 500 deep has 1700 mm of it", () => {
    // Flights centred at x 1000 and 2200: 250 up, 1200 across, 250 down.
    const src = planOf(halfTurn(500));
    expect(of(src, NO_LANDING)[0]!.message).toContain("it runs 500 mm past the top step");
    expect(turns(src)[0]).toMatchObject({ clear_mm: 500 });
    expect(of(planOf(halfTurn(1000)), NO_LANDING)).toEqual([]);
  });

  it("the hint's advice is true: the landing at the length it quotes clears the warning", () => {
    expect(of(planOf(inLine(400)), NO_LANDING)[0]!.hints![0]).toContain("at least 1000 mm");
    expect(of(planOf(inLine(1000)), NO_LANDING)).toEqual([]);
  });

  it("each landing has its row, in climbing order, and only the short one reports", () => {
    const s: BlockStair = {
      name: "two landings",
      width: 1000,
      pieces: [
        [1000, 3900, 1000, 1000],
        [1000, 2900, 1000, 1000],
        [1000, 1900, 1000, 1000],
        [1000, 1200, 1000, 700],
        [1000, 200, 1000, 1000],
      ],
      tails: ["bottom", "bottom", "bottom"],
    };
    const src = planOf(s);
    expect(turns(src).map((l) => l.clear_mm)).toEqual([1000, 700]);
    expect(of(src, NO_LANDING).length).toBe(1);
    expect(rows(src)[0]!.end).toBe("foot");
  });

  it("a straight stair has no turn row, and keeps its words", () => {
    const src = hallPlan("    stair id=s at (1000,1000) size 1000x2000 dir up");
    expect(rows(src).map((l) => l.end)).toEqual(["foot"]);
  });

  it("nothing a short landing reports says the stair complies, or quotes an id in the message", () => {
    const [d] = of(planOf(inLine(400)), NO_LANDING);
    expect(`${d!.message} ${d!.hints!.join(" ")}`).not.toMatch(/compli|conform|to code/i);
    expect(d!.message).not.toContain("`s`");
  });
});

describe("at a corner, where the walking line turns", () => {
  const corner = (pad: BlockStair, extra: string, head = ""): string => hallPlan(`${stairBlock(pad)}\n${extra}`, head);
  const across = "    wall id=p partition thickness 100 { (2300,1250) (3700,1250) }";
  const along = "    wall id=q partition thickness 100 { (3400,900) (3400,2300) }";

  it("a landing shorter than `width` cannot exist: the resolver refuses it first", () => {
    const short: BlockStair = {
      name: "1000 x 700",
      width: 1000,
      pieces: [
        [2500, 2000, 1000, 1100],
        [2500, 1300, 1000, 700],
        [1180, 1150, 1320, 1000],
      ],
      tails: ["bottom", "right"],
    };
    expect(compile(planOf(short), { noCache: true }).diagnostics.map((d) => d.code)).toEqual(["E_STAIR_PIECES"]);
    // A flight band of 600 fits that edge, and then the landing is longer than `width` both ways.
    const narrow = planOf({ ...short, width: 600 });
    expect(of(narrow, NO_LANDING)).toEqual([]);
    expect(turns(narrow)).toEqual([{ end: "turn", need_mm: 600, clear_mm: 600, by: null }]);
  });

  it("a wall across the leg of the flight that reaches it: measured from that flight's top step", () => {
    // The first flight ends at y 2100, and the wall's body stands at y 1200–1300: 800 mm.
    const src = corner(CLEAR_L, across);
    const ds = of(src, NO_LANDING);
    expect(ds.length).toBe(1);
    expect(ds[0]!.message).toContain("stands 800 mm past the top step of the flight that reaches it");
    expect(ds[0]!.message).toContain("(200 mm short)");
    expect(ds[0]!.hints![0]).toContain("clear of the landing between the flights of `s`");
    expect(turns(src)).toEqual([{ end: "turn", need_mm: 1000, clear_mm: 800, by: { kind: "wall", id: "p" } }]);
  });

  it("a wall across the leg of the flight that leaves it: measured back from that flight's bottom step", () => {
    // The last flight starts at x 2500, and the wall's body stands at x 3350–3450: 850 mm.
    const ds = of(corner(CLEAR_L, along), NO_LANDING);
    expect(ds.length).toBe(1);
    expect(ds[0]!.message).toContain("stands 850 mm behind the bottom step of the flight that leaves it");
    expect(ds[0]!.message).toContain("(150 mm short)");
  });

  it("short on both legs is one landing and one warning, for the shorter", () => {
    const src = corner(CLEAR_L, `${across}\n${along}`);
    expect(of(src, NO_LANDING).length).toBe(1);
    expect(turns(src)).toEqual([{ end: "turn", need_mm: 1000, clear_mm: 800, by: { kind: "wall", id: "p" } }]);
  });

  it("outside a dwelling a corner owes 1200 mm each way, and says why", () => {
    const [d] = of(OFFICE(planOf(CLEAR_L)), NO_LANDING);
    expect(d!.message).toContain("it runs 1000 mm past the top step");
    expect(d!.message).toContain("a landing in a building other than a dwelling needs 1200 mm (200 mm short)");
    // A corner 1200 square under the same flights: the first flight now ends at y 2300.
    const wide: BlockStair = {
      ...CLEAR_L,
      pieces: [
        [2500, 2300, 1000, 1000],
        [2500, 1100, 1200, 1200],
        [1100, 1200, 1400, 1000],
      ],
    };
    expect(of(OFFICE(planOf(wide)), NO_LANDING)).toEqual([]);
  });

  it("a winder corner drawn as a landing passes this check, and the run still reads strictly", () => {
    // 13 risers at 2750: three winders in the corner leave 9 straight goings of 220, 1980 mm, in
    // flights of 5 and 4. Drawn as a landing it owes 11 goings, 2420 mm: 440 mm short.
    const s: BlockStair = {
      name: "winders, drawn as a landing",
      width: 1000,
      pieces: [
        [2500, 2200, 1000, 1100],
        [2500, 1200, 1000, 1000],
        [1620, 1200, 880, 1000],
      ],
      tails: ["bottom", "right"],
    };
    const src = planOf(s, "up", HEIGHT);
    expect(of(src, NO_LANDING)).toEqual([]);
    expect(of(src, "W_STAIR_TOO_STEEP")[0]!.message).toContain("2420 mm of flights (440 mm short)");
  });
});

describe("what stands in a landing", () => {
  const wall = (clause: string) => `    wall id=p partition thickness 100${clause} { (2300,1250) (3700,1250) }`;
  const withWall = (clause: string): string => hallPlan(`${stairBlock(CLEAR_L)}\n${wall(clause)}`, HEIGHT);

  it("a wall lower than the landing stands under it", () => {
    // 1000 of 2400 mm of flights climbed of 2750 mm: the landing stands at 1146 mm.
    expect(of(withWall(" height 1000"), NO_LANDING)).toEqual([]);
    expect(of(withWall(" height 1200"), NO_LANDING).length).toBe(1);
    expect(of(withWall(""), NO_LANDING).length).toBe(1);
  });

  it("a wall `walls from rooms` derives is a wall, and so is one a `place` renamed", () => {
    // A room edge at y 1250, so the same 800 mm as a wall written there.
    const derived = `plan "D" {
  units mm
  room id=a at (0,0) size 6000x1250 uses hall
  room id=b at (0,1250) size 6000x4750 uses hall
  walls from rooms exterior 200 partition 100
${stairBlock(CLEAR_L)}
}
`;
    expect(turns(derived)).toEqual([{ end: "turn", need_mm: 1000, clear_mm: 800, by: { kind: "wall", id: "a|b" } }]);
    const placed = `plan "P" {
  units mm
  component c() {
    room id=r at (0,0) size 6000x6000 uses hall
${wall("")}
${stairBlock(CLEAR_L)}
  }
  place c() as u at (0,0)
}
`;
    expect(turns(placed)).toEqual([{ end: "turn", need_mm: 1000, clear_mm: 800, by: { kind: "wall", id: "u.p" } }]);
  });

  it("a wall drawn on the landing's edge is half in it", () => {
    // Its centreline on the landing's north edge, y 1100: the body reaches y 1150, so 950 of 1000.
    const src = hallPlan(`${stairBlock(CLEAR_L)}\n    wall id=p partition thickness 100 { (2300,1100) (3700,1100) }`);
    expect(turns(src)).toEqual([{ end: "turn", need_mm: 1000, clear_mm: 950, by: { kind: "wall", id: "p" } }]);
    expect(of(src, NO_LANDING)[0]!.message).toContain("(50 mm short)");
    // Its face on that edge, the centreline at y 1050, leaves the landing whole.
    const face = hallPlan(`${stairBlock(CLEAR_L)}\n    wall id=p partition thickness 100 { (2300,1050) (3700,1050) }`);
    expect(turns(face)).toEqual([{ end: "turn", need_mm: 1000, clear_mm: 1000, by: null }]);
  });

  it("a wall that only touches the landing stands beside it, not in it", () => {
    // The last flight runs north through the wall at y 0, whose face at y 100 is the landing's north
    // edge. The landing is 1000 mm clear, from the wall's side, and nothing is short.
    const through: BlockStair = {
      name: "through the wall",
      width: 1000,
      pieces: [
        [1500, 1100, 1000, 1000],
        [1500, 100, 1000, 1000],
        [1500, -900, 1000, 1000],
      ],
      tails: ["bottom", "bottom"],
    };
    expect(turns(planOf(through))).toEqual([{ end: "turn", need_mm: 1000, clear_mm: 1000, by: null }]);
    // One millimetre into the landing is in it.
    const into = hallPlan(`${stairBlock(CLEAR_L)}\n    wall id=p partition thickness 100 { (2300,2051) (3700,2051) }`);
    expect(turns(into)[0]).toMatchObject({ by: { kind: "wall", id: "p" } });
  });

  it("a cased opening in the wall is no wall", () => {
    const src = hallPlan(
      `${stairBlock(CLEAR_L)}\n${wall("")}\n    opening id=o at (3000,1250) width 800 wall p`,
      HEIGHT,
    );
    expect(of(src, NO_LANDING)).toEqual([]);
  });

  it("a void under it is no matter, and neither is having no room under it", () => {
    const voided = hallPlan(`${stairBlock(CLEAR_L)}\n    void id=v at (2700,1300) size 500x500`);
    expect(of(voided, NO_LANDING)).toEqual([]);
    expect(turns(voided)[0]).toMatchObject({ by: null });
    // A room from y 2000 down: the landing, y 100–1100, stands over no room.
    const out = movedBlock(CLEAR_L, 0, -1000);
    const src = `plan "Out" {\n  units mm\n  room id=r at (0,2000) size 6000x4000 uses hall\n${stairBlock(out)}\n}\n`;
    expect(of(src, NO_LANDING)).toEqual([]);
    expect(turns(src)).toEqual([{ end: "turn", need_mm: 1000, clear_mm: 1000, by: null }]);
  });

  it("a curved wall near a leg is not judged, and the coverage report says so", () => {
    const s: BlockStair = {
      name: "by a curve",
      width: 1000,
      pieces: [
        [2500, 2000, 1000, 1400],
        [2500, 3400, 1000, 1000],
        [1100, 3400, 1400, 1000],
      ],
      tails: ["top", "right"],
    };
    const src = `plan "P" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) arc (0,4000) radius 10000 cw close }
  room id=r at (0,0) size 6000x4000 label "Hall" uses hall
  door id=d at (3000,0) width 900 wall shell
${stairBlock(s)}
}
`;
    expect(turns(src)).toEqual([{ end: "turn", need_mm: 1000, clear_mm: null, by: null }]);
    expect(of(src, NO_LANDING)).toEqual([]);
    const family = lintCoverage(src)!.families.find((f) => f.family === "stairs")!;
    expect(family.skipped!.map((x) => x.reason)).toContain("curved-landing-wall");
  });
});

describe("a shaft reports a landing once", () => {
  // Moved clear of the north wall, so that its head has floor and only the landing is short.
  const short = movedBlock(inLine(400), 0, 600);
  const up = stairBlock(short, "up");
  const down = stairBlock(short, "down");
  const levels = (src: string) => of(src, NO_LANDING).map((d) => d.level);
  const turnsOn = (src: string, level: number) =>
    describePlan(src, { facts: ["clearances"] })
      .levels!.find((l) => l.level === level)!
      .clearances!.stairs![0]!.landings.filter((l) => l.end === "turn");

  it("on the stop it climbs from, not on the stop above", () => {
    const src = building(hallBody(up), upperBody(down));
    expect(levels(src)).toEqual([1]);
    expect(turnsOn(src, 1).length).toBe(1);
    expect(turnsOn(src, 2)).toEqual([]);
  });

  it("two climbs of one block are two landings", () => {
    const src = building(hallBody(up), upperBody(up), upperBody(down));
    expect(levels(src)).toEqual([1, 2]);
  });

  it("a block coming down with nothing rising to it is read where it is drawn", () => {
    expect(of(planOf(short, "down"), NO_LANDING).length).toBe(1);
    expect(of(planOf(short, "down"), NO_LANDING)[0]!.message).toContain(
      "past the top step of the flight that reaches it",
    );
  });

  it("a block coming down over another block is read: nothing else read that landing", () => {
    const other = stairBlock(inLine(1000), "up");
    expect(levels(building(hallBody(other), upperBody(down)))).toEqual([2]);
  });

  it("a stop coming down with no block below still reads the landing's own length", () => {
    const wall = "    wall id=p partition thickness 100 { (2300,1250) (3700,1250) }";
    // The wall is not read, and the landing's 400 mm is.
    const src = hallPlan(`${stairBlock(short, "down")}\n${wall}`);
    expect(turns(src)).toEqual([{ end: "turn", need_mm: 1000, clear_mm: 400, by: { kind: "landing-end" } }]);
  });

  it("a stop coming down reads no wall: its walls stand above its floor, and the landing below", () => {
    const wall = "    wall id=p partition thickness 100 { (2300,1250) (3700,1250) }";
    expect(
      of(hallPlan(`${stairBlock(CLEAR_L, "down")}\n${wall}`), NO_LANDING).filter((d) => /between/.test(d.message)),
    ).toEqual([]);
  });
});

describe("under the eight frames of D4", () => {
  const facts = (src: string) => ({
    rows: rows(src),
    warned: of(src, NO_LANDING).length,
  });
  const CASES: [string, string][] = [
    ["a short landing in line", stairBlock(inLine(400))],
    ["coming down", stairBlock(inLine(400), "down")],
    ["a half-turn", stairBlock(halfTurn(500))],
    [
      "a wall across one leg",
      `${stairBlock(CLEAR_L)}\n    wall id=p partition thickness 100 { (2300,1250) (3700,1250) }`,
    ],
    [
      "a wall across the other",
      `${stairBlock(CLEAR_L)}\n    wall id=q partition thickness 100 { (3400,900) (3400,2300) }`,
    ],
  ];

  /** What each case must read in the identity frame, or two frames could agree on reading nothing. */
  const READS: Record<string, { clear_mm: number; by: string }> = {
    "a short landing in line": { clear_mm: 400, by: "landing-end" },
    "coming down": { clear_mm: 400, by: "landing-end" },
    "a half-turn": { clear_mm: 500, by: "landing-end" },
    "a wall across one leg": { clear_mm: 800, by: "wall" },
    "a wall across the other": { clear_mm: 850, by: "wall" },
  };

  for (const [name, run] of CASES) {
    it(`${name} measures the same`, () => {
      for (const g of D4_ELEMENTS) {
        const { p0, gP } = witnessPair(hallBody(run), g, { fixedSheet: true });
        expect(facts(gP)).toEqual(facts(p0));
        const [row] = turns(gP);
        expect({ clear_mm: row!.clear_mm, by: row!.by!.kind }).toEqual(READS[name]);
      }
    });
  }

  it("the floor in the notch is floor in every frame", () => {
    const table = "    furniture id=t table at (1400,2300) size 600x600";
    for (const g of D4_ELEMENTS) {
      const { gP } = witnessPair(hallBody(`${stairBlock(CLEAR_L)}\n${table}`), g, { fixedSheet: true });
      expect(of(gP, "W_FURNITURE_ON_STAIR")).toEqual([]);
    }
  });
});

describe("a rising block is read to the height asked", () => {
  const FURNITURE = "W_FURNITURE_ON_STAIR";
  const piece = (x: number, w: number, kind = "wardrobe"): string =>
    `    furniture id=t ${kind} at (${x},1200) size ${w}x600`;
  const onHigh = (x: number, w: number, head = HEIGHT): string =>
    hallPlan(`${stairBlock(CLEAR_L)}\n${piece(x, w)}`, head);

  it("the high end of the last flight is passed under; its low end is not", () => {
    // 2000 of 2750 mm is 1745 of the 2400 mm of flights: all of the first, 1000, and 745 of the
    // second, which runs west from x 2500. So it stands in the way from x 1755 on.
    expect(of(onHigh(1200, 500), FURNITURE)).toEqual([]);
    const [d] = of(onHigh(1700, 100), FURNITURE);
    expect(d!.message).toContain("it covers 45 × 600 mm of the flight, where less than 2000 mm of headroom is left.");
    expect(d!.hints![0]).toContain("(x 1755–2500, y 1100–2100)");
  });

  it("with no height authored it reads 3000 mm, which can only quiet it", () => {
    // 2000 of 3000 mm is 1600 of 2400 mm: 600 of the second flight, from x 1900 on.
    expect(of(onHigh(1800, 90, ""), FURNITURE)).toEqual([]);
    expect(of(onHigh(1800, 90), FURNITURE).length).toBe(1);
  });

  it("a landing with less than 2 m beneath it stands in the way whole, and one above does not", () => {
    // Three flights of 1800: the second landing has climbed 3600 of 5400 mm. At 3200 mm that is
    // 2133 mm up, and at 2750 mm it is 1833.
    const table = "    furniture id=t table at (3000,1400) size 400x400";
    const at = (height: number): string => hallPlan(`${stairBlock(THREE_FLIGHTS)}\n${table}`, `  height ${height}\n`);
    expect(of(at(3200), FURNITURE)).toEqual([]);
    expect(of(at(2750), FURNITURE)[0]!.message).toContain("of a landing between the flights.");
  });

  it("a door's leaf swings under the high end, and into the low end it does not", () => {
    // A door's head is 2100 mm: 1833 of the 2400 mm of flights, so the second flight is in the way
    // from x 1667 on. Each door stands in a wall along the second flight's south side.
    const door = (at: number): string =>
      hallPlan(
        `${stairBlock(CLEAR_L)}\n    wall id=p partition thickness 100 { (300,2200) (2450,2200) }\n    door id=n at (${at},2200) width 700 wall p swing out`,
        HEIGHT,
      );
    expect(of(door(1000), "W_SWING_OVER_STAIR")).toEqual([]);
    expect(of(door(2000), "W_SWING_OVER_STAIR")[0]!.message).toContain("sweeps the flight itself");
  });

  it("a doorway beside the high end opens under it, and beside the low end it does not", () => {
    // Beside the part of the second flight under 2 m, from x 1755 on, 50 mm from it.
    const door = (at: number): string =>
      hallPlan(
        `${stairBlock(CLEAR_L)}\n    wall id=p partition thickness 100 { (300,2200) (2450,2200) }\n    door id=n at (${at},2200) width 700 wall p`,
        HEIGHT,
      );
    expect(of(door(1000), "W_STAIR_SIDE_ENTRY")).toEqual([]);
    expect(of(door(2000), "W_STAIR_SIDE_ENTRY")[0]!.message).toContain("50 mm from the flight");
  });

  it("a stop that comes down is a hole: all of it, the high end included", () => {
    const src = hallPlan(`${stairBlock(CLEAR_L, "down")}\n${piece(1200, 500)}`, HEIGHT);
    expect(of(src, FURNITURE)[0]!.message).toContain("of the stairwell.");
  });

  it("the skip files nothing on a block that matches: every reading is whole", () => {
    const src = hallPlan(`${stairBlock(CLEAR_L)}\n${piece(1200, 500)}`, HEIGHT);
    for (const f of lintCoverage(src)!.families) {
      expect((f.skipped ?? []).map((s) => s.reason)).not.toContain("block-stair");
    }
  });

  it("`finish` still keeps off all of it: a position the rule lets stand is not one it proposes", () => {
    const { ir, levels } = resolvePlan(planOf(CLEAR_L, "up", HEIGHT));
    const rules = resolveRuleset();
    const [st] = lintStoreys(ir!, levels, rules.tolMm);
    const zones = stairZones(storeyStairs(buildLintContext(st!.ir, rules, st!.building))!);
    expect(zones.filter((z) => z.piece !== undefined).map((z) => z.rect)).toEqual([
      { x: 2500, y: 2100, w: 1000, h: 1000 },
      { x: 2500, y: 1100, w: 1000, h: 1000 },
      { x: 1100, y: 1100, w: 1400, h: 1000 },
    ]);
  });
});
