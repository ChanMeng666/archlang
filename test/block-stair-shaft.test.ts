/**
 * A block stair across storeys (issue #362): one id is one shaft, the same block on both stops, and
 * the head a flight from below arrives at is that flight's, read on its own footprint.
 *
 * Nothing is inferred from geometry: identity alone joins two stops. The figures are worked out by
 * hand from the plan's numbers, in the comment beside each, never read back from the rule.
 */

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildingRoomReach, DEFAULT_TOL, resolvePlan, storeyGrounded } from "../src/analyze.js";
import { checkGraph, compile, describe as describePlan, type Diagnostic, lint, lintCoverage } from "../src/index.js";
import { LINT_RULES } from "../src/lint.js";
import { buildLintContext } from "../src/lint/context.js";
import { resolveRuleset } from "../src/lint/ruleset.js";
import { lintStoreys } from "../src/lint/storeys.js";
import { arrivalRuns, verticalReach } from "../src/vertical.js";
import {
  BLOCK_STAIRS,
  type BlockStair,
  CLEAR_L,
  hallBody,
  L_STAIR,
  movedBlock,
  SHORT_AXIS,
  STRAIGHT_LANDING,
  stairBlock,
  THREE_FLIGHTS,
  U_STAIR,
  upperBody,
} from "./block-stair-plans.js";

const MISMATCH = "W_SHAFT_FOOTPRINT_MISMATCH";
const of = (src: string, code: string): Diagnostic[] => lint(src).filter((d) => d.code === code);
const codes = (src: string) => compile(src, { noCache: true }).diagnostics.map((d) => d.code);

/** A plan of the storeys given, ascending from level 1. */
const building = (...storeys: string[]): string =>
  `plan "Shaft" {\n  units mm\n${storeys.map((b, i) => `  level ${i + 1} {\n${b}\n  }`).join("\n")}\n}\n`;

/** A hall with the front door, then an upper storey with no way in but the shaft. */
const stops = (lower: string, ...upper: string[]): string =>
  building(hallBody(lower), ...upper.map((run) => upperBody(run)));

/** `s` drawn up from the hall, then `dir down` above: the same block twice. */
const twoStorey = (s: BlockStair, above: BlockStair = s, id = "s"): string =>
  stops(stairBlock(s, "up"), stairBlock(above, "down", id));

/** `s` climbing on through a middle storey and coming down on the top one. */
const threeStorey = (s: BlockStair, middle: string = stairBlock(s, "up"), extra = ""): string =>
  stops(stairBlock(s, "up"), `${middle}${extra}`, stairBlock(s, "down"));

/** The fixtures, moved clear of the hall's walls so that both ends have floor. */
const CLEAR: readonly BlockStair[] = [
  CLEAR_L,
  movedBlock(U_STAIR, 700, 300),
  movedBlock(STRAIGHT_LANDING, 1500, 500),
  movedBlock(SHORT_AXIS, 700, 300),
  movedBlock(THREE_FLIGHTS, 900, 400),
];

/** A stair across three rooms in a row, boarded `dir up` in the east one: the middle of its box is
 *  the middle room, and its first flight's is not. */
const WIDE: BlockStair = {
  name: "wide",
  width: 1000,
  pieces: [
    [4500, 2100, 1000, 2000],
    [4500, 1100, 1000, 1000],
    [500, 1100, 4000, 1000],
  ],
  tails: ["bottom", "right"],
};

/** Three rooms in a row, each saying where it is, holding `run`; `door` makes the way in. */
const rowOfRooms = (
  run: string,
  door: boolean,
): string => `    room id=w${door ? 1 : 2} at (0,0) size 2000x6000 uses hall
    room id=m${door ? 1 : 2} at (2000,0) size 2000x6000 uses hall
    room id=e${door ? 1 : 2} at (4000,0) size 2000x6000 uses hall
    walls from rooms exterior 200 partition 100
${run}`;

/** A copy of `s` with piece `i` replaced. */
const withPiece = (s: BlockStair, i: number, p: readonly [number, number, number, number]): BlockStair => ({
  ...s,
  pieces: s.pieces.map((q, j) => (j === i ? p : q)),
});

const levelsOf = (src: string, code: string): (number | undefined)[] => of(src, code).map((d) => d.level);

const clearances = (src: string, level: number) =>
  describePlan(src, { facts: ["clearances"] }).levels!.find((l) => l.level === level)!.clearances!.stairs![0]!;

const circulationOn = (src: string, level: number) =>
  describePlan(src).levels!.find((l) => l.level === level)!.circulation!;

/** The storeys of `src` and the ground test `describe()` and lint read them with. */
const storeysOf = (src: string) => {
  const inputs = resolvePlan(src).levels.map((l) => ({ level: l.level, ir: l.ir }));
  const grounded = (n: number): boolean => storeyGrounded(inputs.find((x) => x.level === n)!.ir, DEFAULT_TOL);
  return { inputs, grounded };
};

/** The runs a person arrives by, storey by storey, as `describe()` and lint read them. */
const arrivalsOf = (src: string) => {
  const { inputs, grounded } = storeysOf(src);
  return arrivalRuns(inputs, grounded, buildingRoomReach(inputs, DEFAULT_TOL));
};

describe("one id is one shaft, the same block on both stops", () => {
  it("covers every fixture", () => {
    expect(CLEAR.length).toBe(BLOCK_STAIRS.length);
  });

  for (const s of CLEAR) {
    it(`${s.name}: one connection, no mismatch, the upper storey reachable and walked`, () => {
      const src = twoStorey(s);
      expect(codes(src)).toEqual([]);
      const d = describePlan(src);
      expect(d.vertical!.connections.map((c) => [c.id, c.levels])).toEqual([["s", [1, 2]]]);
      expect(d.vertical!.reachable_levels).toEqual([1, 2]);
      expect(of(src, MISMATCH)).toEqual([]);
      expect(of(src, "W_STAIR_UNMATCHED")).toEqual([]);
      expect(of(src, "W_ROOM_UNREACHABLE")).toEqual([]);
      const up = circulationOn(src, 2);
      expect(up.entranceId).toBe("s");
      expect(up.rooms.map((r) => r.roomId)).toEqual(["up"]);
    });
  }

  it("the shipped example is that plan: one shaft, nothing to report", () => {
    const src = readFileSync("examples/turning-stair.arch", "utf8");
    expect(describePlan(src).vertical!.connections.map((c) => c.id)).toEqual(["s"]);
    expect(of(src, MISMATCH)).toEqual([]);
    expect(of(src, "W_STAIR_UNMATCHED")).toEqual([]);
    expect(of(src, "W_ROOM_UNREACHABLE")).toEqual([]);
    expect(circulationOn(src, 2).rooms.map((r) => r.roomId)).toEqual(["gallery", "bed"]);
  });

  it("the example's head is the last flight's, measured on level 2 alone", () => {
    const src = readFileSync("examples/turning-stair.arch", "utf8");
    // The last flight runs west to x 1100, and the wall's east face is at x 100: 1000 mm of floor.
    expect(clearances(src, 2).landings).toEqual([{ end: "head", need_mm: 1000, clear_mm: 1000, by: null }]);
  });
});

describe("W_SHAFT_FOOTPRINT_MISMATCH reads the pieces", () => {
  const L = CLEAR_L;
  // The last flight is piece 2, (1100,1100) 1400 × 1000, and it touches the landing at x 2500.
  const longer = withPiece(L, 2, [1000, 1100, 1500, 1000]);

  it("one flight changed on one storey says which, and quotes both", () => {
    const [d, ...rest] = of(twoStorey(L, longer), MISMATCH);
    expect(rest).toEqual([]);
    expect(d!.level).toBe(2);
    expect(d!.message).toContain("does not stand over the run it continues from level 1");
    expect(d!.message).toContain(": flight 2 is not drawn the same on both storeys.");
    expect(d!.hints![0]).toContain(
      "on level 1 flight 2 is at (1100,1100) size 1400x1000, here at (1000,1100) size 1500x1000",
    );
    expect(d!.hints![0]).toContain("If they are two different runs, give them different ids.");
  });

  it("a landing changed says the landing, or which, where there are several", () => {
    const wider = withPiece(L, 1, [2500, 1100, 1040, 1000]);
    expect(of(twoStorey(L, wider), MISMATCH)[0]!.message).toContain(": the landing is not drawn the same");
    const three = CLEAR[4]!;
    const p = three.pieces[3]!;
    const other = withPiece(three, 3, [p[0], p[1], p[2] + 40, p[3]]);
    expect(of(twoStorey(three, other), MISMATCH)[0]!.message).toContain(": landing 2 is not drawn the same");
  });

  it("a millimetre is a mismatch: no share of overlap forgives one piece of a copied block", () => {
    const off = withPiece(L, 1, [2500, 1100, 1001, 1000]);
    expect(of(twoStorey(L, off), MISMATCH).length).toBe(1);
    // A straight flight redrawn a little longer passes, deliberately: one rectangle redrawn.
    const straight = (h: number, dir: string) => `    stair id=s at (1000,1000) size 1000x${h} dir ${dir}`;
    expect(of(stops(straight(3000, "up"), straight(3100, "down")), MISMATCH)).toEqual([]);
  });

  it("the whole block moved by a wall's thickness is a mismatch too, on its first piece", () => {
    const src = twoStorey(L, movedBlock(L, 200, 0));
    expect(of(src, MISMATCH)[0]!.message).toContain(": flight 1 is not drawn the same");
  });

  it("the pieces written in the other order are another stair, with the box unchanged", () => {
    const reversed: BlockStair = { ...L, pieces: [...L.pieces].reverse() };
    const src = twoStorey(L, reversed);
    expect(codes(src)).toEqual([]);
    expect(of(src, MISMATCH)[0]!.message).toContain(": flight 1 is not drawn the same");
  });

  it("the same pieces at another `width` say so", () => {
    const [d] = of(twoStorey(L, { ...L, width: 900 }), MISMATCH);
    expect(d!.message).toContain(": its flights are 1000 mm wide there and 900 mm here.");
    expect(d!.hints![0]).toContain("at one `width` on both storeys");
  });

  it("another count of flights says so, before any piece", () => {
    const three = CLEAR[4]!;
    const two: BlockStair = { ...three, pieces: three.pieces.slice(0, 3), tails: three.tails.slice(0, 2) };
    const [d] = of(twoStorey(three, two), MISMATCH);
    expect(d!.message).toContain(": it has 3 flights there and 2 flights here.");
  });

  it("the message places the stair at the flight boarded, not the middle of the box", () => {
    // Boarded here at the first flight, x 4500–5500, on the right; the box's centre, x 3000, is not.
    const far = withPiece(WIDE, 1, [4500, 1100, 1040, 1000]);
    const src = building(rowOfRooms(stairBlock(WIDE, "up"), true), rowOfRooms(stairBlock(far, "up"), false));
    expect(of(src, MISMATCH)[0]!.message).toContain("The stair on the right of the plan on level 2");
  });

  it("each pair of neighbouring stops is compared, and reported on the upper one", () => {
    const moved = stairBlock(longer, "up");
    expect(levelsOf(threeStorey(L, moved), MISMATCH)).toEqual([2, 3]);
    expect(levelsOf(threeStorey(L), MISMATCH)).toEqual([]);
  });

  it("the rule files nothing: the comparison is whole, whichever way it comes out", () => {
    for (const src of [twoStorey(L), twoStorey(L, longer)]) {
      const family = lintCoverage(src)!.families.find((f) => f.family === "vertical")!;
      expect((family.skipped ?? []).map((s) => s.reason)).not.toContain("block-stair");
    }
  });
});

describe("a straight stop beside a block, deliberately always a mismatch", () => {
  const straight = (dir: string) => `    stair id=s at (2500,1100) size 1000x2000 dir ${dir}`;
  const block = (dir: "up" | "down") => stairBlock(CLEAR_L, dir);

  it("one flight above flights and landings, however much of the footprint they share", () => {
    const [d] = of(stops(block("up"), straight("down")), MISMATCH);
    expect(d!.message).toContain(": it is drawn as flights and landings there and as one flight here.");
    expect(d!.hints![0]).toContain("Draw `s` the same way on both storeys");
    expect(d!.hints![0]).toContain("give them different ids");
  });

  it("flights and landings above one flight", () => {
    const [d] = of(stops(straight("up"), block("down")), MISMATCH);
    expect(d!.message).toContain(": it is drawn as one flight there and as flights and landings here.");
  });

  it("an in-line block over a straight flight of the very same outline", () => {
    const s = movedBlock(STRAIGHT_LANDING, 1500, 500);
    const run = (dir: string) => `    stair id=s at (2500,1100) size 1000x3800 dir ${dir}`;
    expect(of(stops(run("up"), stairBlock(s, "down")), MISMATCH).length).toBe(1);
  });

  it("two ids are the way to say so, and the mismatch goes", () => {
    // A straight flight from level 1, and a turning one from level 2.
    const src = stops(straight("up"), `${straight("down").replace("(2500,1100)", "(3700,1100)")}`);
    expect(of(src, MISMATCH).length).toBe(1);
    const two = building(
      hallBody(`    stair id=a at (4300,1100) size 1000x2000 dir up`),
      upperBody(`    stair id=a at (4300,1100) size 1000x2000 dir down\n${stairBlock(CLEAR_L, "up", "b")}`),
      upperBody(stairBlock(CLEAR_L, "down", "b")),
    );
    expect(of(two, MISMATCH)).toEqual([]);
    expect(describePlan(two).vertical!.connections.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("a stair over a lift stays a difference of kind, block or not", () => {
    const src = stops("    elevator id=s at (2500,1100) size 1000x2000", block("down"));
    expect(of(src, MISMATCH)[0]!.message).toContain("it is drawn as an elevator there and a stair here");
  });
});

describe("a straight shaft is what it was", () => {
  const run = (x: number, w: number, dir: string) => `    stair id=s at (${x},1000) size ${w}x3000 dir ${dir}`;

  it("the threshold, the axis and the hint, word for word", () => {
    const [d] = of(stops(run(1000, 1000, "up"), run(1800, 1000, "down")), MISMATCH);
    // 200 mm of 1000 overlap: a fifth of the smaller.
    expect(d!.message).toBe(
      "The stair in the middle of the plan on level 2 does not stand over the run it continues from level 1: the footprints overlap by 20% of the smaller, under half.",
    );
    expect(d!.hints).toEqual([
      "Draw `s` with the same footprint on both storeys: on level 1 it is at (1000,1000) size 1000x3000, here at (1800,1000) size 1000x3000. If they are two different runs, give them different ids.",
    ]);
    const across = `    stair id=s at (1000,1000) size 3000x1000 dir down`;
    expect(of(stops(run(1000, 1000, "up"), across), MISMATCH)[0]!.message).toContain("runs across the page");
  });

  it("half is enough, and adds no key to a stop", () => {
    const src = stops(run(1000, 1000, "up"), run(1500, 1000, "down"));
    expect(of(src, MISMATCH)).toEqual([]);
    for (const s of describePlan(src).vertical!.connections[0]!.stops) expect(s.steps_off).toBeUndefined();
  });
});

describe("nothing is inferred from geometry", () => {
  const twins = (a: string, b: string) => stops(stairBlock(CLEAR_L, "up", a), stairBlock(CLEAR_L, "down", b));

  it("two blocks that stand over each other under two ids are two runs", () => {
    const src = twins("s", "t");
    expect(describePlan(src).vertical?.connections ?? []).toEqual([]);
    expect(of(src, MISMATCH)).toEqual([]);
    expect(of(src, "W_STAIR_UNMATCHED").length).toBe(2);
    expect(circulationOn(src, 1).rooms.length).toBeGreaterThan(0);
    expect(describePlan(src).levels![1]!.circulation).toBeNull();
  });

  it("the unmatched message names where the stair is boarded, and the hint the id", () => {
    const src = building(rowOfRooms(stairBlock(WIDE, "up"), true), rowOfRooms("", false));
    const [d] = of(src, "W_STAIR_UNMATCHED");
    expect(d!.message).toBe(
      "The stair on the right of the plan on level 1 appears on only one storey, so it connects nothing.",
    );
    expect(d!.hints![0]).toContain("the same id `s`");
  });
});

describe("the head a flight from below arrives at", () => {
  const L = CLEAR_L;

  it("a block that climbs on owes its foot here and the head of the flight from below", () => {
    // The last flight's head is at x 1100, across from the wall's face at x 100: 1000 mm clear.
    expect(clearances(threeStorey(L), 2).landings).toEqual([
      { end: "foot", need_mm: 1000, clear_mm: 1000, by: null },
      { end: "head", need_mm: 1000, clear_mm: 1000, by: null },
      { end: "turn", need_mm: 1000, clear_mm: 1000, by: null },
    ]);
  });

  it("a stop that comes down owes that one head, not two", () => {
    expect(clearances(threeStorey(L), 3).landings).toEqual([{ end: "head", need_mm: 1000, clear_mm: 1000, by: null }]);
  });

  it("the bottom stop has no head to read", () => {
    expect(clearances(threeStorey(L), 1).landings).toEqual([
      { end: "foot", need_mm: 1000, clear_mm: 1000, by: null },
      { end: "turn", need_mm: 1000, clear_mm: 1000, by: null },
    ]);
  });

  it("a wall across it is a short landing at the head, on the storey the flight arrives at", () => {
    const wall = "\n    wall id=p partition thickness 100 { (600,1000) (600,2200) }";
    const src = threeStorey(L, stairBlock(L, "up"), wall);
    const ds = of(src, "W_STAIR_NO_LANDING");
    expect(ds.map((d) => d.level)).toEqual([2]);
    // The wall's east face is at x 650, 450 mm past the head at x 1100.
    expect(ds[0]!.message).toContain("no landing at its head");
    expect(ds[0]!.message).toContain("stands 450 mm past the top step");
    expect(ds[0]!.message).toContain("(550 mm short)");
    expect(clearances(src, 2).landings[1]).toMatchObject({ end: "head", clear_mm: 450, by: { kind: "wall", id: "p" } });
  });

  it("its own first flight stands in it, though that is the flight boarded here", () => {
    // Up, along, down, then back west to a head at x 2400, facing the first flight's face at x 2000.
    const spiral: BlockStair = {
      name: "spiral",
      width: 1000,
      pieces: [
        [1000, 3000, 1000, 2000],
        [1000, 2000, 3800, 1000],
        [3800, 3000, 1000, 1000],
        [3800, 4000, 1000, 1000],
        [2400, 4000, 1400, 1000],
      ],
      tails: ["bottom", "top", "right"],
    };
    const src = threeStorey(spiral);
    expect(codes(src)).toEqual([]);
    expect(clearances(src, 2).landings[1]).toEqual({
      end: "head",
      need_mm: 1000,
      clear_mm: 400,
      by: { kind: "own-piece" },
    });
    const ds = of(src, "W_STAIR_NO_LANDING").filter((d) => d.level === 2 && d.message.includes("at its head"));
    expect(ds.map((d) => d.message.includes("another part of the stair stands 400 mm past the top step"))).toEqual([
      true,
    ]);
  });

  it("a void on it is W_STAIR_HEAD_VOID", () => {
    const src = threeStorey(L, stairBlock(L, "up"), "\n    void id=v at (300,1300) size 500x600");
    const [d, ...rest] = of(src, "W_STAIR_HEAD_VOID");
    expect(rest).toEqual([]);
    expect(d!.level).toBe(2);
    // The void's near edge is at x 800, 300 mm past the head at x 1100.
    expect(d!.message).toContain("the floor ends 300 mm past the top step");
    expect(d!.message).toContain("(700 mm short)");
  });

  it("furniture on it stands on the landing at the head", () => {
    const src = threeStorey(L, stairBlock(L, "up"), "\n    furniture id=t table at (300,1300) size 600x600");
    expect(of(src, "W_FURNITURE_ON_STAIR").map((d) => d.message.includes("the landing at the head"))).toEqual([true]);
    // Over the stair, this stop is a stairwell, and a rug is a piece over a hole.
    const rug = threeStorey(L, stairBlock(L, "up"), "\n    furniture id=t rug at (1300,1300) size 600x600");
    expect(of(rug, "W_FURNITURE_ON_STAIR")[0]!.message).toContain("of the stairwell.");
  });

  it("a door swinging across it sweeps the landing at the head", () => {
    const door = "\n    door id=w at (0,1600) width 900 wall shell swing in";
    const [d] = of(threeStorey(L, stairBlock(L, "up"), door), "W_SWING_OVER_STAIR");
    expect(d!.message).toContain("sweeps the landing at the head of the flight, the 1000 mm a person steps off onto");
  });

  it("no head is owed from a stop below that does not rise here", () => {
    const run = (kind: string, tail: string) => `    ${kind} id=s at (2500,1100) size 1000x2000${tail}`;
    for (const below of [run("elevator", ""), run("escalator", " dir up"), run("stair", " dir down")]) {
      expect(clearances(stops(below, stairBlock(L, "up")), 2).landings.map((l) => l.end)).toEqual(["foot", "turn"]);
    }
  });
});

describe("arrival on a block that climbs on", () => {
  const L = CLEAR_L;

  it("is stepped off at the last flight's head, not boarded at the first flight's foot", () => {
    const src = threeStorey(L);
    expect(codes(src)).toEqual([]);
    const up = circulationOn(src, 2);
    expect(up.entranceId).toBe("s");
    expect(up.rooms.map((r) => r.roomId)).toEqual(["up"]);
    expect(of(src, "W_ROOM_UNREACHABLE")).toEqual([]);
  });

  it("a head sealed by a wall seals the storey, whatever stands open at the foot", () => {
    // A wall across the whole of the head, from the shell to the shell's far side of the flight.
    const wall = "\n    wall id=p partition thickness 100 { (1050,300) (1050,2900) }";
    const open = threeStorey(L);
    const sealed = threeStorey(L, stairBlock(L, "up"), wall);
    expect(circulationOn(open, 2).rooms.length).toBe(1);
    const c = circulationOn(sealed, 2);
    expect(c === null || c.rooms.length === 0).toBe(true);
  });

  it("from above, a stop walked from the foot of the upper stop's first flight", () => {
    // The door is upstairs, so level 1 is reached by coming down, and its own foot is that foot.
    const src = building(upperBody(stairBlock(L, "up")), hallBody(stairBlock(L, "down")));
    expect(codes(src)).toEqual([]);
    const low = circulationOn(src, 1);
    expect(low.entranceId).toBe("s");
    expect(low.rooms.map((r) => r.roomId)).toEqual(["up"]);
  });

  it("a block climbing on from a straight flight is stepped off at the straight flight's head", () => {
    // The flight rises to y 1000, clear of everything the stop draws: x 4300, away from the block.
    const run = "    stair id=s at (4300,1000) size 1000x2000 dir up";
    const src = stops(run, stairBlock(L, "up"));
    const up = circulationOn(src, 2);
    expect(up.entranceId).toBe("s");
    expect(up.rooms.map((r) => r.roomId)).toEqual(["up"]);
  });

  describe("a block and a straight flight on one shaft", () => {
    // The flight runs north from y 3000 to y 1000, so its head is the top edge.
    const straight = "    stair id=s at (4300,1000) size 1000x2000 dir up";
    // This one runs west from x 5700 to x 3700: along x, where the block's first flight, and so the
    // block's own axis, runs along y. Only here does the axis rule refuse.
    const across = "    stair id=s at (3700,4000) size 2000x1000 dir up";

    it("a block over a straight flight arrives at that flight's head, not its own last flight's", () => {
      const [run] = arrivalsOf(stops(straight, stairBlock(L, "up"))).get(2)!;
      expect(run!.edges).toEqual(["top"]);
      expect(run!.flight.at).toEqual({ x: 4300, y: 1000 });
    });

    it("a straight flight over a block arrives at the block's last flight", () => {
      // The last flight runs west from x 2500 to x 1100, entered from the right: its head is left.
      const [run] = arrivalsOf(stops(stairBlock(L, "up"), straight)).get(2)!;
      expect(run!.edges).toEqual(["left"]);
      expect(run!.flight.at).toEqual({ x: 1100, y: 1100 });
    });

    it("a block over a flight across it owes its own foot, and that flight's head is not read", () => {
      expect(clearances(stops(across, stairBlock(L, "up")), 2).landings).toEqual([
        { end: "foot", need_mm: 1000, clear_mm: 1000, by: null },
        { end: "turn", need_mm: 1000, clear_mm: 1000, by: null },
      ]);
    });

    it("a flight across a block owes its own foot, and the block's head is not read", () => {
      // The tail of `across` is at x 5700, 200 mm from the wall's face at x 5900.
      expect(clearances(stops(stairBlock(L, "up"), across), 2).landings).toEqual([
        { end: "foot", need_mm: 1000, clear_mm: 200, by: { kind: "wall", id: "shell" } },
      ]);
    });
  });

  describe("when the two ends stand in two rooms", () => {
    // Level 2 splits at x 2500: the first flight in `a`, east; the last flight's head in `b`, west.
    // A store behind `a` gives `a` a doorway, so a sealed `a` is unreachable and not disconnected.
    const split = (
      door: boolean,
      run: string,
    ): string => `    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
    wall id=p partition thickness 100 { (2500,0) (2500,6000) }
    wall id=q partition thickness 100 { (5000,0) (5000,6000) }
    room id=a at (2500,0) size 2500x6000 label "East" uses hall
    room id=b at (0,0) size 2500x6000 label "West" uses circulation
    room id=c at (5000,0) size 1000x6000 label "Store" uses storage
    door id=store on q at 5000 width 800
${door ? "    door id=between on p at 5000 width 900\n" : ""}${run}`;
    const twoStops = (door: boolean): string =>
      building(hallBody(stairBlock(L, "up")), split(door, stairBlock(L, "up")));

    it("the stop is boarded in one and stepped off in the other, and `describe` says so", () => {
      const stop = describePlan(twoStops(true)).vertical!.connections[0]!.stops[1]!;
      expect(stop).toMatchObject({ level: 2, dir: "up", room: "a", steps_off: { below: "b" } });
    });

    it("lint and the walk start from the room stepped off in, not the room boarded in", () => {
      const src = twoStops(false);
      // No door: `b` is where a person arrives, and `a` cannot be walked to.
      expect(circulationOn(src, 2).rooms.map((r) => r.roomId)).toEqual(["b"]);
      expect(of(src, "W_ROOM_UNREACHABLE").map((d) => d.level)).toEqual([2, 2]);
      expect(of(src, "W_ROOM_UNREACHABLE")[0]!.message).toContain('"East"');
      expect(of(src, "W_ROOM_UNREACHABLE")[1]!.message).toContain('"Store"');
    });

    it("a door between them joins them", () => {
      const src = twoStops(true);
      expect(
        circulationOn(src, 2)
          .rooms.map((r) => r.roomId)
          .sort(),
      ).toEqual(["a", "b", "c"]);
      expect(of(src, "W_ROOM_UNREACHABLE")).toEqual([]);
    });

    const threeStops = (door: boolean, top = upperBody(stairBlock(L, "down"))): string =>
      building(hallBody(stairBlock(L, "up")), split(door, stairBlock(L, "up")), top);
    const walked = (src: string, level: number): string[] =>
      circulationOn(src, level)
        .rooms.map((r) => r.roomId)
        .sort();
    const reached = (src: string): number[] => describePlan(src).vertical!.reachable_levels;

    it("with a stop above, a person who steps off in `b` cannot climb on from `a`", () => {
      const src = threeStops(false);
      expect(describePlan(src).vertical!.connections[0]!.stops[1]).toMatchObject({
        room: "a",
        steps_off: { below: "b", above: "a" },
      });
      // The flight up leaves from `a`, and no door joins it to `b`, where the flight from below ends.
      expect(reached(src)).toEqual([1, 2]);
      expect(walked(src, 2)).toEqual(["b"]);
    });

    it("a door between them carries the climb on", () => {
      const src = threeStops(true);
      expect(reached(src)).toEqual([1, 2, 3]);
      expect(walked(src, 2)).toEqual(["a", "b", "c"]);
    });

    it("a storey above silences nothing: it adds no way in to the storey below it", () => {
      const unreachable = (src: string): string[] =>
        of(src, "W_ROOM_UNREACHABLE")
          .filter((d) => d.level === 2)
          .map((d) => d.message);
      expect(unreachable(twoStops(false))).toHaveLength(2);
      expect(unreachable(threeStops(false))).toEqual(unreachable(twoStops(false)));
    });

    // A lift serving 1 and 3 only reaches the storey by itself: an unreachable storey has no
    // arrivals to ask about, so only this tells a flight that arrives from one that does not.
    const LIFT = "    elevator id=lift at (4400,4000) size 1200x1200";

    it("a storey reached by a lift is not arrived at by a flight no one can walk to", () => {
      const src = (door: boolean): string =>
        building(
          `${hallBody(stairBlock(L, "up"))}\n${LIFT}`,
          split(door, stairBlock(L, "up")),
          `${upperBody(stairBlock(L, "down"))}\n${LIFT}`,
        );
      const by = (door: boolean) =>
        arrivalsOf(src(door))
          .get(3)!
          .map((r) => r.run.id);
      // The climb on leaves from `a`, and a person steps off in `b`.
      expect(by(false)).toEqual(["lift"]);
      expect(by(true).sort()).toEqual(["lift", "s"]);
    });

    it("the storey-level reach lands in both rooms too, in the room-aware reach's order", () => {
      const { inputs, grounded } = storeysOf(threeStops(false));
      // From the stop below a person steps off in `b`; from the stop above in `a`.
      expect(verticalReach(inputs, grounded).arrivalRooms.get(2)).toEqual(["b", "a"]);
    });

    describe("with one end in no room", () => {
      const floorOf = (
        room: string,
      ): string => `    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
    ${room}
${stairBlock(L, "up")}`;
      const stopOf = (src: string) => describePlan(src).vertical!.connections[0]!.stops[1]!;

      it("the far end in none: `steps_off` says so, and the storey is still reached", () => {
        // `a` holds the first flight, x 2500 to 3500. The last flight, x 1100 to 2500, stands in none.
        const src = building(
          hallBody(stairBlock(L, "up")),
          floorOf('room id=a at (2500,0) size 3500x6000 label "East" uses hall'),
        );
        expect(stopOf(src)).toEqual({ level: 2, dir: "up", room: "a", steps_off: { below: null } });
        expect(describePlan(src).vertical!.reachable_levels).toEqual([1, 2]);
        // `a` holds a flight, and nobody steps off into it: the storey is told why.
        expect(of(src, "W_NO_ENTRANCE").map((d) => d.message)).toEqual([
          "Level 2 has no exterior door or opening of its own, and the stair that reaches it lands on no room here, so there is no floor to step off onto.",
        ]);
      });

      it("the boarded end in none: a person still arrives, in the room the far end stands in", () => {
        const src = building(
          hallBody(stairBlock(L, "up")),
          floorOf('room id=b at (0,0) size 2500x6000 label "West" uses circulation'),
        );
        expect(stopOf(src)).toEqual({ level: 2, dir: "up", room: null, steps_off: { below: "b" } });
        expect(
          arrivalsOf(src)
            .get(2)!
            .map((r) => r.run.id),
        ).toEqual(["s"]);
        expect(circulationOn(src, 2).rooms.map((r) => r.roomId)).toEqual(["b"]);
      });
    });

    it("lint and the walk agree on who can be walked to, on every stop of the shaft", () => {
      for (const src of [twoStops(false), twoStops(true), threeStops(false), threeStops(true)]) {
        const cut = of(src, "W_ROOM_UNREACHABLE").filter((d) => d.level === 2).length;
        expect(walked(src, 2).length + cut).toBe(3);
      }
    });

    describe("coming down", () => {
      // The top storey has its own front door, so it is the one a person starts from.
      const top = `${upperBody(stairBlock(L, "down"))}\n    door id=t at (3000,6000) width 900 wall shell`;
      const noFrontDoor = hallBody(stairBlock(L, "up")).replace(/\n\s*door id=d .*/, "");
      const fromTheTop = (door: boolean): string => building(noFrontDoor, split(door, stairBlock(L, "up")), top);

      it("the flight from above lands in `a`, and the flight down leaves from `b`", () => {
        expect(noFrontDoor).not.toContain("door");
        const src = fromTheTop(false);
        expect(reached(src)).toEqual([2, 3]);
        expect(walked(src, 2)).toEqual(["a", "c"]);
      });

      it("a door between them carries the descent on", () => {
        expect(reached(fromTheTop(true))).toEqual([1, 2, 3]);
      });

      it("a storey reached by a lift is not arrived at by a flight no one can walk to", () => {
        const src = (door: boolean): string =>
          building(`${noFrontDoor}\n${LIFT}`, split(door, stairBlock(L, "up")), `${top}\n${LIFT}`);
        const by = (door: boolean) =>
          arrivalsOf(src(door))
            .get(1)!
            .map((r) => r.run.id);
        // The descent on leaves from `b`, and a person steps off in `a`.
        expect(by(false)).toEqual(["lift"]);
        expect(by(true).sort()).toEqual(["lift", "s"]);
      });
    });

    it("`validate --graph` joins the room the flight leaves to the room it arrives in", () => {
      // The shaft from `r` reaches `b`, not `a`, where it is boarded for the storey above.
      const r = checkGraph(twoStops(true), { r: ["b"], a: ["b", "c"] });
      expect(r).toMatchObject({ ok: true, missing_connections: [], extra_connections: [] });
    });

    it("a straight stair in one room adds nothing, and a block with both ends in one room adds nothing", () => {
      const stopsOf = (src: string) => describePlan(src).vertical!.connections[0]!.stops;
      for (const s of stopsOf(threeStorey(L))) expect(s.steps_off).toBeUndefined();
    });
  });
});

describe("`keep stacked` on a block stair reads the box, as the docs say", () => {
  const keep = (src: string): string =>
    src.replace(`plan "Shaft" {\n  units mm\n`, `plan "Shaft" {\n  units mm\n  keep stacked s on levels 1 2\n`);
  const L = CLEAR_L;
  const keeps = (src: string) => describePlan(src).keeps!;

  it("the same block holds", () => {
    const src = keep(twoStorey(L));
    expect(codes(src)).toEqual([]);
    expect(keeps(src)[0]).toMatchObject({ holds: true, residual_mm: 0 });
  });

  it("a moved block breaks it, and the message names the flight's place, not the box's", () => {
    const src = keep(
      building(
        rowOfRooms(stairBlock(WIDE, "up"), true),
        rowOfRooms(stairBlock(movedBlock(WIDE, 0, 300), "down"), false),
      ),
    );
    const [d] = compile(src, { noCache: true }).diagnostics.filter((x) => x.code === "W_KEEP_VIOLATED");
    // Boarded on level 1 at x 4500–5500; the box's centre, x 3000, is the middle of the plan.
    expect(d!.message).toContain("This keep holds the stair on the right of the plan on levels 1 and 2");
    expect(d!.message).toContain("300 mm");
  });

  it("a piece changed inside the box still holds, and the shaft check is what reports it", () => {
    // The same three rectangles at another flight width: the box round them has not moved.
    const src = keep(twoStorey(L, { ...L, width: 900 }));
    expect(keeps(src)[0]).toMatchObject({ holds: true });
    expect(of(src, MISMATCH).length).toBe(1);
  });
});

describe("what still files `block-stair`, and why each is true", () => {
  /** The stops on which `rule` alone files the reason (0 for one storey), through its own sink. */
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

  it("the sites are the six this file names, and no other rule files it", () => {
    const dir = "src/lint/rules/";
    const sites = readdirSync(dir).flatMap((f) => {
      const hits = readFileSync(dir + f, "utf8").split('skip("block-stair")').length - 1;
      return hits > 0 ? [[f, hits]] : [];
    });
    expect(sites).toEqual([["stairs.ts", 6]]);
  });

  it("the landing between the flights is measured: a short one reports, on the stop it climbs from", () => {
    // 200 mm of landing between two flights in line, on both stops.
    const short: BlockStair = {
      name: "short landing",
      width: 1000,
      pieces: [
        [2500, 3500, 1000, 1400],
        [2500, 3300, 1000, 200],
        [2500, 1900, 1000, 1400],
      ],
      tails: ["bottom", "bottom"],
    };
    const src = twoStorey(short);
    expect(codes(src)).toEqual([]);
    expect(levelsOf(src, "W_STAIR_NO_LANDING")).toEqual([1]);
    expect(of(src, "W_STAIR_NO_LANDING")[0]!.message).toContain("it runs 200 mm past the top step");
    expect(filedBy(src, "stair-no-landing")).toEqual([]);
  });

  it("a block rising is read to the height asked, with or without a flight arriving, and files nothing", () => {
    const door = "\n    door id=w at (0,1600) width 900 wall shell swing in";
    const src = threeStorey(CLEAR_L, `${stairBlock(CLEAR_L, "up")}${door}`);
    expect(filedBy(src, "swing-over-stair")).toEqual([]);
    expect(filedBy(src, "stair-side-entry")).toEqual([]);
    const under = stops("    elevator id=s at (2500,1100) size 1000x2000", `${stairBlock(CLEAR_L, "up")}${door}`);
    expect(filedBy(under, "swing-over-stair")).toEqual([]);
  });

  it("the shaft and the head from below file nothing", () => {
    const src = threeStorey(CLEAR_L, stairBlock(CLEAR_L, "up"), "\n    void id=v at (300,1300) size 500x600");
    expect(filedBy(src, "shaft-footprint-mismatch")).toEqual([]);
    expect(filedBy(src, "stair-head-void")).toEqual([]);
    expect(filedBy(src, "stair-unmatched")).toEqual([]);
  });

  describe("a head from below left unread: where the stops do not match, the mismatch is the report", () => {
    const L = CLEAR_L;
    /** Every thing on the stop above that a stair rule compares, so each rule has a reason to run. */
    const THINGS = [
      "    door id=w at (0,1600) width 900 wall shell swing in",
      "    void id=v at (4600,4000) size 500x500",
      "    furniture id=t rug at (4600,3000) size 500x500",
    ].join("\n");
    const run = (dir: string) => `    stair id=s at (2500,1100) size 1000x2000 dir ${dir}`;
    const longer = withPiece(L, 2, [1000, 1100, 1500, 1000]);
    const reversed: BlockStair = { ...L, pieces: [...L.pieces].reverse(), tails: ["right", "bottom"] };
    // The ends, which is what a stop owes: a `turn` row is the block's own landing, read where it is.
    const landingEnds = (src: string) =>
      clearances(src, 2)
        .landings.map((l) => l.end)
        .filter((e) => e !== "turn");
    const RULES = ["stair-no-landing", "swing-over-stair", "stair-side-entry", "furniture-on-stair", "stair-head-void"];

    it("the false report is gone: a straight flight under a block says the mismatch and nothing else", () => {
      // The flight below rises north to y 1100, the north edge of this block's landing, so the block's
      // first flight and landing stand behind that head, never past it: nothing is short here.
      const src = stops(run("up"), stairBlock(L, "down"));
      expect(of(src, MISMATCH).map((d) => d.level)).toEqual([2]);
      expect(of(src, "W_STAIR_NO_LANDING")).toEqual([]);
    });

    it.each([
      ["a straight flight under a block coming down", stops(run("up"), stairBlock(L, "down"))],
      ["a straight flight over a block, coming down", stops(stairBlock(L, "up"), run("down"))],
      ["the same pieces in the other order, coming down", stops(stairBlock(L, "up"), stairBlock(reversed, "down"))],
    ])("%s has the one head it says, not two rows nothing tells apart", (_, src) => {
      expect(of(src, MISMATCH).map((d) => d.level)).toEqual([2]);
      expect(landingEnds(src)).toEqual(["head"]);
    });

    it.each([
      ["a block over a straight flight", () => stops(run("up"), `${stairBlock(L, "up")}\n${THINGS}`)],
      ["a straight flight over a block", () => stops(stairBlock(L, "up"), `${run("up")}\n${THINGS}`)],
      ["a block over another block", () => stops(stairBlock(L, "up"), `${stairBlock(longer, "up")}\n${THINGS}`)],
    ])("%s, both rising: only its foot, and every rule that reads the stop files", (_, plan) => {
      expect(landingEnds(plan())).toEqual(["foot"]);
      for (const rule of RULES) expect(filedBy(plan(), rule), rule).toContain(2);
    });

    it.each([
      ["a block, coming down, over a straight flight", () => stops(run("up"), `${stairBlock(L, "down")}\n${THINGS}`)],
      ["a straight flight, coming down, over a block", () => stops(stairBlock(L, "up"), `${run("down")}\n${THINGS}`)],
    ])("%s: its own head, and every rule that reads the stop files", (_, plan) => {
      expect(landingEnds(plan())).toEqual(["head"]);
      for (const rule of RULES) expect(filedBy(plan(), rule), rule).toContain(2);
    });

    it("a block rising over what it does not match is no stairwell: it stands as a block rising", () => {
      const over = (extra: string) => stops(stairBlock(L, "up"), `${stairBlock(longer, "up")}\n${extra}`);
      // A rug on the landing between the flights is walked on, as on any block rising from its floor.
      expect(of(over("    furniture id=t rug at (2800,1400) size 400x400"), "W_FURNITURE_ON_STAIR")).toEqual([]);
      // A wardrobe on it is a body on a landing, and a rug on the low end of a flight is under what no
      // one walks under. 2000 of the default 3000 mm is 1667 of the 2500 mm of flights, so the second
      // runs west from x 2500 and stands in the way to x 1833; past that a rug is passed over.
      const body = of(over("    furniture id=t wardrobe at (2800,1400) size 400x400"), "W_FURNITURE_ON_STAIR");
      expect(body[0]!.message).toContain("of a landing between the flights.");
      const flight = of(over("    furniture id=t rug at (1900,1300) size 400x400"), "W_FURNITURE_ON_STAIR");
      expect(flight[0]!.message).toContain("of the flight, where less than 2000 mm of headroom is left.");
      expect(of(over("    furniture id=t rug at (1400,1300) size 400x400"), "W_FURNITURE_ON_STAIR")).toEqual([]);
      // A leaf hung on a wall at x 3600, 100 mm east of the landing, swings west across it and stops
      // short of the flights: y 1150 to y 2050, x 2700 to x 3600.
      const leaf = `    wall id=p partition thickness 100 { (3600,800) (3600,3000) }
    door id=w at (3600,1600) width 900 wall p hinge right swing in`;
      const [d, ...rest] = of(over(leaf), "W_SWING_OVER_STAIR");
      expect(rest).toEqual([]);
      expect(d!.message).toContain("sweeps a landing between the flights.");
    });

    it("a block coming down over what it does not match is a stairwell by its own `dir`", () => {
      const src = stops(run("up"), `${stairBlock(L, "down")}\n    furniture id=t rug at (2800,1400) size 400x400`);
      expect(of(src, "W_FURNITURE_ON_STAIR")[0]!.message).toContain("of the stairwell.");
    });

    it("a straight flight rising over a block reads by its low end, as any flight rising from its floor", () => {
      // The flight runs north from y 3100 to y 1100; 2 m of a 3 m storey is its low 1333 mm, y 1767
      // to y 3100. A rug on its high end is passed under, and one on its low end is not.
      const over = (y: number) =>
        stops(stairBlock(L, "up"), `${run("up")}\n    furniture id=t rug at (2800,${y}) size 400x300`);
      expect(of(over(1200), "W_FURNITURE_ON_STAIR")).toEqual([]);
      expect(of(over(2500), "W_FURNITURE_ON_STAIR")[0]!.message).toContain("less than 2000 mm of headroom");
    });

    it("stops that meet at one head, though they differ elsewhere, read it: nothing was left out", () => {
      // Flight 1 is 100 mm shorter, and the last flight, whose head both stops meet at, is the same.
      const first = withPiece(L, 0, [2500, 2100, 1000, 900]);
      const src = stops(stairBlock(L, "up"), `${stairBlock(first, "down")}\n${THINGS}`);
      expect(of(src, MISMATCH).map((d) => d.level)).toEqual([2]);
      expect(landingEnds(src)).toEqual(["head"]);
      expect(filedBy(src, "stair-head-void")).toEqual([]);
    });

    it("the same block reads the head as before, and files nothing for it", () => {
      const src = threeStorey(L, `${stairBlock(L, "up")}\n${THINGS}`);
      expect(of(src, MISMATCH)).toEqual([]);
      expect(landingEnds(src)).toEqual(["foot", "head"]);
      expect(filedBy(src, "stair-head-void")).toEqual([]);
      expect(filedBy(src, "swing-over-stair")).not.toContain(2);
    });

    it("two straight flights are what they were: the head is read, nothing is filed", () => {
      // 60% of the smaller footprint shared, so no mismatch; a head above that is not this stop's.
      const low = "    stair id=s at (2500,1100) size 1000x2000 dir up";
      const high = "    stair id=s at (2500,1900) size 1000x2000 dir up";
      const src = stops(low, high);
      expect(of(src, MISMATCH)).toEqual([]);
      expect(landingEnds(src)).toEqual(["foot", "head"]);
      // Across the page is a mismatch, and a straight shaft has never read that head: nothing is left
      // out that the stop was owed, so nothing is filed.
      const across = stops(low, "    stair id=s at (2000,1500) size 2000x1000 dir up");
      expect(of(across, MISMATCH).map((d) => d.level)).toEqual([2]);
      expect(landingEnds(across)).toEqual(["foot"]);
      expect(filedBy(src, "stair-no-landing")).toEqual([]);
      expect(filedBy(across, "stair-no-landing")).toEqual([]);
    });
  });

  it("the report's own words say what is partial, and nothing about later", () => {
    // Stops that do not match, the one place a landing rule still has something unread.
    const src = stops(stairBlock(CLEAR_L, "up"), stairBlock(withPiece(CLEAR_L, 2, [1000, 1100, 1500, 1000]), "up"));
    const f = lintCoverage(src)!.families.find((x) => x.family === "stairs")!;
    const entry = f.skipped!.find((s) => s.reason === "block-stair")!;
    expect(JSON.stringify(entry)).toContain("read in part");
    expect(JSON.stringify(entry)).not.toMatch(/so far|not yet|later|until/);
  });
});

it("L_STAIR is what the fixtures here are moved from", () => {
  expect(CLEAR_L.pieces[0]).toEqual([L_STAIR.pieces[0]![0] + 1000, L_STAIR.pieces[0]![1] + 1000, 1000, 1000]);
});
