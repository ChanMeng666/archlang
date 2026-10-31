/**
 * What lint and `describe` say of a block stair (issue #362, card S2).
 *
 * A landing replaces one going: `minimumRun` owes `n − 1 − L` goings for `L` landings, because a
 * flight ends on its landing as the top flight ends on the floor above. Every figure below is worked
 * out by hand from the plan's numbers, in the comment beside it, never read back from the rule.
 *
 * Coverage stays true: a reading that is now whole stops filing `block-stair`, and one that is not
 * keeps filing. No height enters the drawing, and nothing here claims a stair complies.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { STATEMENT_STARTS } from "../src/grammar/tokens.js";
import { compile, describe as describePlan, lint, lintCoverage, type Diagnostic } from "../src/index.js";
import { buildLintContext } from "../src/lint/context.js";
import { MAX_STAIR_WORK, minimumRun } from "../src/lint/rules/stairs.js";
import { LINT_RULES } from "../src/lint/rules/index.js";
import { DEFAULT_RULESET, LINT_PROFILES, resolveRuleset } from "../src/lint/ruleset.js";
import { lintStoreys } from "../src/lint/storeys.js";
import { completion, hover } from "../src/lsp.js";
import {
  BLOCK_STAIRS,
  type BlockStair,
  hallPlan,
  L_STAIR,
  planOf,
  STRAIGHT_LANDING,
  SHORT_AXIS,
  stairBlock,
  THREE_FLIGHTS,
  U_STAIR,
} from "./block-stair-plans.js";
import {
  canonFacts,
  D4_ELEMENTS,
  diffFacts,
  expectFacts,
  type Facts,
  frameFor,
  observe,
  summaryFacts,
  witnessPair,
} from "./d4-oracle.js";

const HEIGHT = "  height 2750\n";
const of = (src: string, code: string): Diagnostic[] => lint(src).filter((d) => d.code === code);
const steep = (src: string): Diagnostic[] => of(src, "W_STAIR_TOO_STEEP");

/** #362's quarter-turn, with the flights it needs: 1100 + 1320 = 2420 mm, 5 goings and 6 of 220. */
const ENOUGH: BlockStair = {
  ...L_STAIR,
  name: "enough",
  pieces: [
    [1500, 1100, 1000, 1100],
    [1500, 100, 1000, 1000],
    [180, 100, 1320, 1000],
  ],
};

/** The same 2420 mm, in flights that hold 4 goings and 6: a sum that passes and is not the answer. */
const REMAINDER: BlockStair = {
  ...L_STAIR,
  name: "remainder",
  pieces: [
    [1500, 1100, 1000, 1000],
    [1500, 100, 1000, 1000],
    [80, 100, 1420, 1000],
  ],
};

/** The stops on which `rule` alone files `block-stair` (0 for one storey), through its own sink. */
const filedBy = (src: string, rule: string): number[] => {
  const { ir, levels } = resolvePlan(src);
  const rules = resolveRuleset();
  return lintStoreys(ir!, levels, rules.tolMm).flatMap((st) => {
    let filed = false;
    const sink = (reason: string): void => {
      if (reason === "block-stair") filed = true;
    };
    LINT_RULES.find((r) => r.name === rule)!.check(buildLintContext(st.ir, rules, st.building, sink));
    return filed ? [st.level ?? 0] : [];
  });
};

describe("minimumRun takes the landings", () => {
  const PROFILES = [DEFAULT_RULESET, ...Object.values(LINT_PROFILES).map((p) => resolveRuleset(p))];

  it("with no landing, every figure is the one a straight flight has always had", () => {
    for (const rules of PROFILES) {
      for (let rise = 150; rise <= 6000; rise += 37) {
        const a = minimumRun(rise, rules);
        if (a === null) continue;
        expect(minimumRun(rise, rules, 0)).toEqual(a);
        // The old closed form, in its own operation order, so the double is the same one.
        expect(a.run).toBe((a.risers - 1) * a.going);
        expect(a.goings).toBe(a.risers - 1);
      }
    }
  });

  it("one going fewer per landing, the design's own figures", () => {
    // 2750 / 220 = 12.5, so 13 risers: 12 goings, 11 with a landing, 10 with two, of 220.
    expect(minimumRun(2750, DEFAULT_RULESET)).toMatchObject({ risers: 13, goings: 12, run: 2640 });
    expect(minimumRun(2750, DEFAULT_RULESET, 1)).toMatchObject({ risers: 13, goings: 11, run: 2420 });
    expect(minimumRun(2750, DEFAULT_RULESET, 2)).toMatchObject({ risers: 13, goings: 10, run: 2200 });
  });

  it("under a profile with a pitch cap the landing gives up that profile's going", () => {
    const uk = resolveRuleset(LINT_PROFILES["uk-residential-advisory"]);
    const [none, one] = [minimumRun(2750, uk)!, minimumRun(2750, uk, 1)!];
    expect(one.risers).toBe(none.risers);
    expect(one.going).toBe(none.going);
    expect(none.run - one.run).toBeCloseTo(one.going, 6);
    // The design's ≈ 2584, which is 11 × 234.9.
    expect(Math.round(one.run)).toBe(2584);
  });

  it("more landings than the climb has goings leave none, never a negative run", () => {
    // 400 / 220 is 2 risers: one going, and five landings cannot give up five.
    expect(minimumRun(400, DEFAULT_RULESET, 5)).toMatchObject({ risers: 2, goings: 0, run: 0 });
  });
});

describe("W_STAIR_TOO_STEEP on a block stair", () => {
  it("#362's stair with a sufficient run reports nothing", () => {
    expect(steep(planOf(ENOUGH, "up", HEIGHT))).toEqual([]);
  });

  it("the issue's own 2400 mm reports once, for the whole stair, with a true figure", () => {
    const ds = steep(planOf(L_STAIR, "up", HEIGHT));
    expect(ds.length).toBe(1);
    const m = ds[0]!.message;
    // 1000 + 1400 = 2400, against 11 × 220 = 2420.
    expect(m).toContain("its flights' 2400 mm run");
    expect(m).toContain("must climb the 2750 mm storey");
    expect(m).toContain("13 risers, 11 goings and a landing, each going at least 220 mm");
    expect(m).toContain("2420 mm of flights (20 mm short)");
    expect(ds[0]!.hints![0]).toContain("flights of `s` to at least 2420 mm between them");
  });

  it("one millimetre short is one millimetre short, and the exact run is not", () => {
    const short: BlockStair = {
      ...ENOUGH,
      pieces: [ENOUGH.pieces[0]!, ENOUGH.pieces[1]!, [181, 100, 1319, 1000]],
    };
    expect(steep(planOf(short, "up", HEIGHT))[0]!.message).toContain("(1 mm short)");
    expect(steep(planOf(ENOUGH, "up", HEIGHT))).toEqual([]);
  });

  it("two landings say so, and give up two goings", () => {
    // 7000 / 220 = 31.8, so 32 risers: 31 goings less 2 is 29, 6380 mm, against 3 × 1800 = 5400.
    const ds = steep(planOf(THREE_FLIGHTS, "up", "  height 7000\n"));
    expect(ds.length).toBe(1);
    expect(ds[0]!.message).toContain("32 risers, 29 goings and 2 landings");
    expect(ds[0]!.message).toContain("6380 mm of flights (980 mm short)");
  });

  it("a stop that comes down is not judged, as a straight one is not", () => {
    expect(steep(planOf(L_STAIR, "down", HEIGHT))).toEqual([]);
  });

  it("a straight stair's message has not moved by a byte, and its hint moved once", () => {
    const src = hallPlan("    stair id=s at (500,500) size 1000x2000 dir up", HEIGHT);
    const [d] = steep(src);
    expect(d!.message).toBe(
      'The stair in "Hall" is too steep: its 2000 mm run must climb the 2750 mm storey, and at 220 mm a riser at most that is 13 risers and 12 goings of at least 220 mm, a 2640 mm run (640 mm short).',
    );
  });

  it("the hint's advice is true: the same flights as a block with a landing clear the warning", () => {
    // 2420 mm in one flight owes 12 goings, 2640. In two, with a landing, it owes 11.
    const straight = hallPlan("    stair id=s at (1000,600) size 1000x2420 dir up", HEIGHT);
    const [d] = steep(straight);
    expect(d!.message).toContain("(220 mm short)");
    expect(d!.hints![0]).toContain("where a landing replaces one going");
    const block: BlockStair = {
      name: "the advice",
      width: 1000,
      pieces: [
        [1000, 3020, 1000, 1100],
        [1000, 2020, 1000, 1000],
        [1000, 700, 1000, 1320],
      ],
      tails: ["bottom", "bottom"],
    };
    expect(steep(planOf(block, "up", HEIGHT))).toEqual([]);
  });

  it("two stairs drawn separately are still two warnings: the hint's other half", () => {
    const src = hallPlan(
      "    stair id=a at (500,1000) size 1000x1100 dir up\n    stair id=b at (2000,1000) size 1000x1320 dir up",
      HEIGHT,
    );
    expect(steep(src).length).toBe(2);
  });

  it("clearances print the sum and the figure the message quotes", () => {
    const d = describePlan(planOf(L_STAIR, "up", HEIGHT), { facts: ["clearances"] });
    expect(d.clearances!.stairs).toMatchObject([{ id: "s", run_mm: 2400, min_run_mm: 2420 }]);
    const straight = describePlan(hallPlan("    stair id=s at (500,500) size 1000x2000 dir up", HEIGHT), {
      facts: ["clearances"],
    });
    expect(straight.clearances!.stairs).toMatchObject([{ run_mm: 2000, min_run_mm: 2640 }]);
  });
});

describe("the block-stair skip stays true", () => {
  it("a reading now whole stops filing, whichever way it comes out", () => {
    expect(filedBy(planOf(ENOUGH, "up", HEIGHT), "stair-too-steep")).toEqual([]);
    expect(filedBy(planOf(L_STAIR, "up", HEIGHT), "stair-too-steep")).toEqual([]);
  });

  it("a sum that passes on flights that cannot hold the goings whole still files", () => {
    // 1000 holds 4 goings of 220 and 1420 holds 6: 10, and the storey owes 11. The sum is 2420.
    const src = planOf(REMAINDER, "up", HEIGHT);
    expect(steep(src)).toEqual([]);
    expect(filedBy(src, "stair-too-steep")).toEqual([0]);
  });

  it("a straight stair never files, at a run that is a whole number of goings or not", () => {
    for (const run of [2640, 2641, 2700]) {
      const src = hallPlan(`    stair id=s at (500,500) size 1000x${run} dir up`, HEIGHT);
      expect(filedBy(src, "stair-too-steep")).toEqual([]);
    }
  });

  it("what is not read yet goes on filing", () => {
    const src = planOf(ENOUGH, "up", HEIGHT);
    // The landing between the flights is not measured, and a door beside a rising block is read
    // against all of it: S4's, out of this round.
    expect(filedBy(src, "stair-no-landing")).toEqual([0]);
    expect(filedBy(src, "swing-over-stair")).toEqual([0]);
    expect(filedBy(src, "stair-side-entry")).toEqual([0]);
  });
});

/** The red team's plan: a door between two rooms, beside a quarter-turn at the hall's east wall. */
const doorPlan = (along: number): string => `plan "Door" {
  units mm
  height 2750
  room id=hall at (0,0) size 3600x3200 label "Hall" uses hall
  room id=side at (3600,0) size 3000x3200 label "Side" uses living
  walls from rooms exterior 200 partition 100
  door on hall.bottom at 800 from start width 900 swing inward
  door between hall and side at ${along} from start width 900 swing into hall
  stair id=s dir up width 1000 {
    flight at (2500,1100) size 1000x1000
    landing at (2500,100) size 1000x1000
    flight at (1100,100) size 1400x1000
  }
}
`;

describe("a landing between the flights is called a landing", () => {
  it("a door sweeping only the landing is not told it sweeps the flight", () => {
    // Its span, y 200–1100, and so its leaf, stand wholly beside the landing, y 100–1100.
    const [d] = of(doorPlan(650), "W_SWING_OVER_STAIR");
    expect(d!.message).toContain("its open leaf sweeps a landing between the flights");
    expect(d!.message).not.toContain("flight itself");
  });

  it("a door sweeping a flight still is", () => {
    const [d] = of(doorPlan(1600), "W_SWING_OVER_STAIR");
    expect(d!.message).toContain("its open leaf sweeps the flight itself");
  });

  /** A piece on the landing, one in the notch, and the storey it stands on. */
  const furnished = (dir: "up" | "down", piece: string): string =>
    hallPlan(
      `${stairBlock(L_STAIR, dir)}\n    furniture id=t ${piece} at (1700,300) size 600x600\n    furniture id=n table at (500,1300) size 600x600`,
    );

  it("a table on a rising landing stands on a landing, and one in the notch stands on nothing", () => {
    const ds = of(furnished("up", "table"), "W_FURNITURE_ON_STAIR");
    expect(ds.length).toBe(1);
    expect(ds[0]!.message).toContain("600 × 600 mm of a landing between the flights.");
    expect(ds[0]!.message).not.toContain("the flight,");
    expect(ds[0]!.hints![0]).toContain("clears the landing of `s` (x 1500–2500, y 100–1100)");
  });

  it("a piece of the stair is read whatever stands on it: a rug on the landing, which a floor beyond would let lie", () => {
    const ds = of(furnished("up", "rug"), "W_FURNITURE_ON_STAIR");
    expect(ds.length).toBe(1);
    expect(ds[0]!.message).toContain("600 × 600 mm of a landing between the flights.");
  });

  it("over a stair coming down it is the stairwell, as a flight is", () => {
    const [d] = of(furnished("down", "table"), "W_FURNITURE_ON_STAIR");
    expect(d!.message).toContain("600 × 600 mm of the stairwell.");
    expect(d!.hints![0]).toContain("clears the stairwell of `s`");
  });

  it("the flight keeps its words", () => {
    const src = hallPlan(`${stairBlock(L_STAIR)}\n    furniture id=t table at (1700,1300) size 600x600`);
    expect(of(src, "W_FURNITURE_ON_STAIR")[0]!.message).toContain("of the flight, where less than 2000 mm");
  });
});

/** Four flights round a square: the last passes 300 mm (`gap`) beyond the first flight's foot. */
const wrapped = (gap: number): BlockStair => ({
  name: "wrapped",
  width: 1000,
  pieces: [
    [1000, 2000, 1000, 1000],
    [1000, 1000, 1000, 1000],
    [2000, 1000, 1000, 1000],
    [3000, 1000, 1000, 1000],
    [3000, 2000, 1000, 1000 + gap],
    [3000, 3000 + gap, 1000, 1000],
    [1000, 3000 + gap, 2000, 1000],
  ],
  tails: ["bottom", "left", "top", "right"],
});

describe("a stair's own pieces stand in its landings, as they do in the walking grid", () => {
  it("a later flight past the foot cuts the foot landing short", () => {
    const src = planOf(wrapped(300));
    const [d] = of(src, "W_STAIR_NO_LANDING");
    expect(d!.message).toContain("at its foot: another part of the stair stands 300 mm past the bottom step");
    expect(d!.message).toContain("(700 mm short)");
    expect(d!.message).not.toContain("wall");
    const facts = describePlan(src, { facts: ["clearances"] }).clearances!.stairs![0]!;
    expect(facts.landings).toEqual([{ end: "foot", need_mm: 1000, clear_mm: 300, by: { kind: "own-piece" } }]);
  });

  it("past the landing's depth it does not", () => {
    expect(of(planOf(wrapped(1000)), "W_STAIR_NO_LANDING")).toEqual([]);
  });

  it("a touch leaves no landing at all", () => {
    expect(of(planOf(wrapped(0)), "W_STAIR_NO_LANDING")[0]!.message).toContain("stands 0 mm past the bottom step");
  });

  it("agrees with the grid: a head boxed in by its own stair seals the storey it arrives on", () => {
    // Climbing the wrapped stair backwards, so the head boarded upstairs is the end `gap` is before.
    const building = (gap: number): string => {
      const s: BlockStair = { ...wrapped(gap), pieces: [...wrapped(gap).pieces].reverse() };
      return `plan "Boxed" {
  units mm
  level 1 {
${planBody(s, "up", true)}
  }
  level 2 {
${planBody(s, "down", false)}
  }
}
`;
    };
    const noLanding = (gap: number): boolean =>
      lint(building(gap)).some((d) => d.code === "W_STAIR_NO_LANDING" && d.level === 2);
    const walked = (gap: number): string[] =>
      (describePlan(building(gap), {}).levels![1]!.circulation?.rooms ?? []).map((r) => r.roomId);
    expect(noLanding(0)).toBe(true);
    expect(walked(0)).toEqual([]);
    expect(noLanding(1000)).toBe(false);
    expect(walked(1000)).toEqual(["r"]);
  });

  it("a plan of straight stairs charges the landing measure what it always has", () => {
    // `ownPieces` is empty, so a stair beyond another stair's foot is still not read: the walking
    // grid's reading of other runs stays where it was.
    const src = hallPlan(
      "    stair id=a at (1000,1000) size 1000x2000 dir up\n    stair id=b at (1000,3300) size 1000x1600 dir up",
    );
    expect(of(src, "W_STAIR_NO_LANDING")).toEqual([]);
  });

  it("a straight-in-line block reads the foot and head a straight flight reads", () => {
    const wall = "    wall id=p partition thickness 100 { (500,5000) (2500,5000) }";
    const block = hallPlan(`${stairBlock(STRAIGHT_LANDING)}\n${wall}`);
    const flight = hallPlan(`    stair id=s at (1000,600) size 1000x3800 dir up\n${wall}`);
    const landings = (src: string) => describePlan(src, { facts: ["clearances"] }).clearances!.stairs![0]!.landings;
    expect(landings(block)).toEqual(landings(flight));
    expect(landings(block)[0]).toMatchObject({ end: "foot", clear_mm: 550, by: { kind: "wall", id: "p" } });
    const above = (run: string): string =>
      hallPlan(`${run}\n    wall id=q partition thickness 100 { (500,250) (2500,250) }`);
    expect(landings(above(stairBlock(STRAIGHT_LANDING, "down")))).toEqual(
      landings(above("    stair id=s at (1000,600) size 1000x3800 dir down")),
    );
  });
});

/** One storey of a hall holding `s`, for {@link wrapped}'s building. */
function planBody(s: BlockStair, dir: "up" | "down", door: boolean): string {
  return `    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
    room id=r at (0,0) size 6000x6000 label "Hall" uses hall
${door ? "    door id=d at (5000,6000) width 900 wall shell\n" : ""}${stairBlock(s, dir)}`;
}

describe("a block stair's own pieces are charged to the storey's stair budget", () => {
  // One storey, so each `dir up` stair owes one landing. Its work is n × (wall pieces + 1 room + 1),
  // and a block of three pieces adds 2 per landing for its two other pieces.
  const n = 1000;
  const perLanding = MAX_STAIR_WORK / n;
  const place = (i: number): [number, number] => [500 + (i % 40) * 3000, 500 + Math.floor(i / 40) * 3000];
  const straight = (i: number): string => {
    const [x, y] = place(i);
    return `  stair id=s${i} at (${x},${y}) size 1000x3000 dir up`;
  };
  const block = (i: number): string => {
    const [x, y] = place(i);
    return `  stair id=s${i} dir up width 1000 {
    flight at (${x + 1320},${y + 1000}) size 1000x1100
    landing at (${x + 1320},${y}) size 1000x1000
    flight at (${x},${y}) size 1320x1000
  }`;
  };
  /** A zigzag, so no two of its `pieces` wall pieces can merge. */
  const wall = (pieces: number): string => {
    const points = Array.from({ length: pieces + 1 }, (_, i) => `(${i * 50},${-1000 - (i % 2) * 100})`);
    return `  wall id=w exterior thickness 10 { ${points.join(" ")} }`;
  };
  const refused = (stair: (i: number) => string, pieces: number): boolean => {
    const stairs = Array.from({ length: n }, (_, i) => stair(i)).join("\n");
    const src = `plan "P" {\n  units mm\n  room id=r at (0,0) size 120000x80000\n${wall(pieces)}\n${stairs}\n}\n`;
    const family = lintCoverage(src)!.families.find((f) => f.family === "stairs")!;
    return family.skipped!.some((s) => s.reason === "stair-budget");
  };

  it("exactly at the budget a straight stair is read, and the same count of blocks is not", { timeout: 60_000 }, () => {
    expect(Number.isInteger(perLanding)).toBe(true);
    expect(refused(straight, perLanding - 2)).toBe(false);
    expect(refused(block, perLanding - 2)).toBe(true);
  });

  it("two wall pieces fewer pay for each block's two other pieces, and no more", { timeout: 60_000 }, () => {
    expect(refused(block, perLanding - 4)).toBe(false);
    expect(refused(block, perLanding - 3)).toBe(true);
  });
});

describe("describe reports a block stair's pieces", () => {
  const vertical = (src: string) => describePlan(src, {}).verticals![0]!;

  it("the issue's quarter-turn, in climbing order on both stops", () => {
    const up = vertical(planOf(L_STAIR));
    // Rises north off its bottom edge, then runs west off its right edge: a left turn.
    expect(up.flights).toEqual([
      { bbox: { x: 1500, y: 1100, w: 1000, h: 1000 }, run_mm: 1000, entry: "bottom" },
      { bbox: { x: 100, y: 100, w: 1400, h: 1000 }, run_mm: 1400, entry: "right" },
    ]);
    expect(up.landings).toEqual([{ bbox: { x: 1500, y: 100, w: 1000, h: 1000 }, turn: "left" }]);
    expect(up.turn).toBe("left");
    expect(up.bbox).toEqual({ x: 100, y: 100, w: 2400, h: 2000 });
    const down = vertical(planOf(L_STAIR, "down"));
    // Same order, read from the top: the edges reverse, the turn is the same stair's.
    expect(down.flights!.map((f) => f.entry)).toEqual(["top", "left"]);
    expect(down.turn).toBe("left");
    expect(down.landings![0]!.turn).toBe("left");
  });

  it("each fixture's turn, worked out on paper", () => {
    const turn = (s: BlockStair) => vertical(planOf(s)).turn;
    expect(turn(U_STAIR)).toBe("half");
    expect(turn(STRAIGHT_LANDING)).toBe("none");
    expect(turn(SHORT_AXIS)).toBe("half");
    // North, east, south: two right turns on its landings, and a half-turn over the whole stair.
    expect(vertical(planOf(THREE_FLIGHTS)).landings!.map((l) => l.turn)).toEqual(["right", "right"]);
    expect(turn(THREE_FLIGHTS)).toBe("half");
    // North, west, north: each landing its own turn, and none over the whole stair.
    const zigzag: BlockStair = {
      name: "zigzag",
      width: 1000,
      pieces: [
        [3000, 3900, 1000, 1800],
        [3000, 2900, 1000, 1000],
        [1500, 2900, 1500, 1000],
        [500, 2900, 1000, 1000],
        [500, 1100, 1000, 1800],
      ],
      tails: ["bottom", "right", "bottom"],
    };
    expect(vertical(planOf(zigzag)).landings!.map((l) => l.turn)).toEqual(["left", "right"]);
    expect(turn(zigzag)).toBe("none");
  });

  it("a straight stair gains no key", () => {
    const v = vertical(hallPlan("    stair id=s at (500,500) size 1000x2000 dir up"));
    expect(Object.keys(v).sort()).toEqual(["bbox", "dir", "flight_width", "id", "kind", "room"]);
  });

  const stairFacts = (src: string): Facts =>
    new Map([...summaryFacts(observe(src).summary, src)].filter(([k]) => k.startsWith("verticals")));

  for (const s of BLOCK_STAIRS) {
    for (const dir of ["up", "down"] as const) {
      it(`${s.name} ${dir}: every new fact is g of the old one, under all eight frames`, () => {
        for (const g of D4_ELEMENTS) {
          const { p0, gP } = witnessPair(hallPlan(stairBlock(s, dir)).split("\n").slice(2, -2).join("\n"), g, {
            fixedSheet: true,
          });
          const facts = stairFacts(p0);
          expect([...facts.keys()].filter((k) => k.endsWith(".turn")).length).toBe(
            s.pieces.length - (s.pieces.length - 1) / 2,
          );
          expect(diffFacts(expectFacts(facts, frameFor(g, 50), "up"), canonFacts(stairFacts(gP)))).toEqual([]);
        }
      });
    }
  }

  it("a reflection swaps left and right, and the oracle says so of a turn left unswapped", () => {
    const g = D4_ELEMENTS.find((x) => x.mirror)!;
    const body = hallPlan(stairBlock(L_STAIR)).split("\n").slice(2, -2).join("\n");
    const { p0, gP } = witnessPair(body, g, { fixedSheet: true });
    expect(vertical(p0).turn).toBe("left");
    expect(vertical(gP).turn).toBe("right");
    const asIf = new Map(stairFacts(p0));
    asIf.set("verticals[s].turn", { kind: "inv", value: "left" });
    const v = diffFacts(expectFacts(asIf, frameFor(g, 50), "up"), canonFacts(stairFacts(gP)));
    expect(v.map((x) => x.key)).toEqual(["verticals[s].turn"]);
  });
});

describe("no height enters the drawing, and no claim enters a message", () => {
  it("every fixture draws the same bytes at any height", () => {
    for (const s of BLOCK_STAIRS) {
      const svg = compile(planOf(s), { noCache: true }).svg;
      for (const h of [2400, 2750, 3600]) {
        expect(compile(planOf(s, "up", `  height ${h}\n`), { noCache: true }).svg).toBe(svg);
      }
    }
  });

  it("nothing a block stair reports says it complies", () => {
    const words = /compli|conform|meets the|to code|approved\b/i;
    for (const src of [planOf(L_STAIR, "up", HEIGHT), doorPlan(650), planOf(wrapped(300))]) {
      for (const d of lint(src)) expect(`${d.message} ${(d.hints ?? []).join(" ")}`).not.toMatch(words);
    }
  });
});

describe("the editor knows the block", () => {
  const SRC = `plan "P" {
  let n = 1000
  stair id=s dir up width 1000 {
    flight at (0,1000) size 1000x1000
    landing at (0,0) size n x 1000

  }
  room id=r at (0,0) size 3000x3000
}
`;
  const at = (needle: string, after = 0): number => SRC.indexOf(needle) + after;
  const labels = (src: string, off: number): string[] => completion(src, off).map((i) => i.label);

  it("just inside the block, after a piece and on a blank line: the two pieces and nothing else", () => {
    const pieces = ["flight", "landing"];
    expect(labels(SRC, at("{\n    flight", 1))).toEqual(pieces);
    expect(labels(SRC, at("1000x1000", "1000x1000".length))).toEqual(pieces);
    expect(labels(SRC, at("n x 1000\n", "n x 1000\n".length + 1))).toEqual(pieces);
  });

  it("offers them as the word is typed", () => {
    expect(labels(SRC, at("flight at", 3))).toEqual(["flight", "landing"]);
    // With the cursor just past the word's last letter, where it has not ended yet.
    expect(labels(SRC, at("flight at", "flight".length))).toEqual(["flight", "landing"]);
  });

  it("inside a piece, the words of an expression and no statement", () => {
    const words = labels(SRC, at("landing at (0,0)", "landing at (".length));
    expect(words).toContain("n");
    expect(words).toContain("max");
    for (const statement of ["room", "stair", "wall", "units", "let", "flight"]) expect(words).not.toContain(statement);
  });

  it("past the block, and beside a straight stair, the list is what it always was", () => {
    const whole = labels(`plan "P" {\n  units mm\n}\n`, 12);
    expect(labels(SRC, at("  room id=r"))).toEqual(expect.arrayContaining(["room", "wall", "stair"]));
    const straight = `plan "P" {\n  stair id=s at (0,0) size 1000x3000 dir up\n  \n}\n`;
    expect(labels(straight, straight.indexOf("  \n}"))).toEqual(whole);
    // Other blocks are no business of this branch.
    const wall = `plan "P" {\n  wall exterior thickness 200 { \n  }\n}\n`;
    expect(labels(wall, wall.indexOf("{ \n") + 2)).toEqual(whole);
  });

  it("hover says both forms", () => {
    const h = hover(SRC, at("stair"))!.contents;
    expect(h).toContain("flight");
    expect(h).toContain("landing");
    expect(h).toContain("[at (x, y)]");
    expect(h).toContain("A turning stair must state it");
  });

  it("the words are highlighted, and neither starts a statement", () => {
    const grammar = readFileSync("editors/archlang.tmLanguage.json", "utf8");
    expect(grammar).toMatch(/\bflight\b/);
    expect(grammar).toMatch(/\blanding\b/);
    expect(STATEMENT_STARTS).not.toContain("flight");
    expect(STATEMENT_STARTS).not.toContain("landing");
    expect(compile(`plan "P" {\n  room id=landing at (0,0) size 3000x3000\n}\n`).diagnostics).toEqual([]);
  });
});
