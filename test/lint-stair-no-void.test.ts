/**
 * Product roadmap RM9.6, coverage class CV14: `W_STAIR_NO_VOID`, a flight that climbs from the
 * storey below to a storey whose floor covers it at its head: no `void` across the head of the flight,
 * over its whole width (the coordinator's ruling on #1004), where that storey's footprint stands.
 *
 * Each finding is shown beside the same plan with its cause removed, so a test cannot pass because
 * the rule never ran.
 */
import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { type Diagnostic, ERROR_CATALOG, lint, resolvePlan } from "../src/index.js";
import { LINT_RULES, lintWork } from "../src/lint.js";
import { buildLintContext } from "../src/lint/context.js";
import { DEFAULT_RULESET } from "../src/lint/ruleset.js";
import { stairNoVoid, storeyStairs } from "../src/lint/rules/stairs.js";
import { lintStoreys } from "../src/lint/storeys.js";
import { D4_ELEMENTS, EXAMPLE_FILES, EXAMPLES_WORLD } from "./helpers/d4-oracle.js";

const CODE = "W_STAIR_NO_VOID";
const of = (src: string): Diagnostic[] => lint(src).filter((d) => d.code === CODE);
const codes = (src: string): string[] => lint(src).map((d) => d.code ?? "");
const plan = (...lines: string[]): string => `plan "t" {\n  units mm\n  grid 50\n${lines.join("\n")}\n}\n`;
/** The same plan on a 1 mm grid, for a void a few millimetres across. */
const fine = (src: string): string => src.replace("  grid 50\n", "  grid 1\n");
const shell = (label: string, uses: string): string =>
  [
    "    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }",
    `    room id=hall at (0,0) size 6000x5000 label "${label}" uses ${uses}`,
  ].join("\n");
const level = (n: number, label: string, ...lines: string[]): string =>
  [`  level ${n} "L${n}" {`, shell(label, n === 1 ? "hall" : "circulation hall"), ...lines, "  }"].join("\n");
const DOOR = "    door id=d at (3000,5000) width 900 wall shell";
// Entered at its south end on level 1 (y 3600), so its head is its north edge, y 1000, x 500-1400.
const UP = "    stair id=s at (500,1000) size 900x2600 dir up";
const DOWN = "    stair id=s at (500,1000) size 900x2600 dir down";
const WELL = "    void id=well at (500,1000) size 900x2600";
const twoStorey = (...upper: string[]): string => plan(level(1, "Hall", DOOR, UP), level(2, "Landing", DOWN, ...upper));
const MESSAGE =
  'No void opens across the head of the flight that climbs from level 1 to the stair in "Landing" on level 2: this storey\'s floor covers it there, so a person climbing it meets the floor.';

/** A turning stair (flight, landing, flight), its box (1500,1000)-(4000,3600) holding a notch of floor. */
const block = (dir: "up" | "down"): string =>
  [
    `    stair id=s dir ${dir} width 1000 {`,
    "      flight at (3000,2000) size 1000x1600",
    "      landing at (3000,1000) size 1000x1000",
    "      flight at (1500,1000) size 1500x1000",
    "    }",
  ].join("\n");
/** The turning stair's stairwell over its three pieces, the notch left out. */
const WELL_L = "    void id=v polygon (1500,1000) (4000,1000) (4000,3600) (3000,3600) (3000,2000) (1500,2000)";
const turning = (...upper: string[]): string =>
  plan(level(1, "Hall", DOOR, block("up")), level(2, "Landing", block("down"), ...upper));

suite("W_STAIR_NO_VOID", () => {
  it("reports the upper stop of a flight with no void over its head, ids only in the hint", () => {
    const src = twoStorey();
    const [d, ...rest] = of(src);
    expect(rest).toEqual([]);
    expect(d!.severity).toBe("warning");
    expect(d!.message).toBe(MESSAGE);
    expect(d!.message).not.toContain("`");
    expect(d!.hints).toEqual([
      "Draw a `void` on this storey over the flight of `s` that climbs from level 1, across its whole width at its head (over its pieces, never the box round a turning stair), clear of the landing beyond its head.",
    ]);
    // At the upper storey's stair, never the lower one's.
    expect(src.slice(d!.span!.start, d!.span!.end)).toBe(DOWN.trim());
    // The stairwell clears it, and raises no other stair warning.
    const fixed = twoStorey(WELL);
    expect(of(fixed)).toEqual([]);
    expect(codes(fixed).filter((c) => c.startsWith("W_STAIR"))).toEqual([]);
  });

  it("asks for a void across the flight's whole width at its head, not merely over some of it", () => {
    // A void elsewhere on the storey, and voids that touch the flight's side or its head end only.
    for (const v of [
      "    void id=v at (3000,1000) size 900x900",
      "    void id=v at (1400,1000) size 900x2600",
      "    void id=v at (500,0) size 900x1000",
      // Over the middle of the flight, not its head: the floor may cover a flight's low end, never its head.
      "    void id=v at (500,1500) size 900x500",
    ])
      expect(of(twoStorey(v)), v).toHaveLength(1);
    // A sliver at the head's corner (2 x 2 mm) and a 50 mm strip down one side leave the head floored.
    for (const v of ["    void id=v at (500,1000) size 2x2", "    void id=v at (500,1000) size 50x2600"])
      expect(of(fine(twoStorey(v))), v).toHaveLength(1);
    // Across the head band it clears, whole or in pieces that meet, and over more than the flight too.
    for (const v of [
      "    void id=v at (500,1000) size 900x1300",
      "    void id=v at (500,1000) size 450x500\n    void id=w at (950,1000) size 450x500",
      "    void id=v at (300,800) size 1300x700",
    ])
      expect(of(twoStorey(v)), v).toEqual([]);
    // Pieces that leave a gap across the head do not clear it.
    expect(of(twoStorey("    void id=v at (500,1000) size 400x500\n    void id=w at (1000,1000) size 400x500"))).toHaveLength(1);
  });

  it("reads the floor where the head is open: the storey's footprint, never a box", () => {
    // No room and no exterior ring over the flight's head on level 2: there is no floor to meet
    // (test/fixtures/zones-levels.arch; W_STAIR_NO_LANDING says "there is no floor").
    const open = (room: string) =>
      plan(
        level(1, "Hall", DOOR, UP),
        `  level 2 "L2" {\n    room id=up at ${room} label "Upper" uses bedroom\n${DOWN}\n  }`,
      );
    expect(of(open("(2000,0) size 4000x5000"))).toEqual([]);
    const fixture = readFileSync("test/fixtures/zones-levels.arch", "utf8");
    expect(lint(fixture).filter((d) => d.code === CODE)).toEqual([]);
    expect(lint(fixture).some((d) => d.code === "W_STAIR_NO_LANDING" && /there is no floor/.test(d.message))).toBe(true);
    // A room over part of the head is floor there.
    expect(of(open("(1000,0) size 5000x5000"))).toHaveLength(1);
    // Inside the closed exterior ring with no room there is floor too (the slab, as the 3D preview builds it).
    expect(
      of(
        plan(
          level(1, "Hall", DOOR, UP),
          `  level 2 "L2" {\n    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }\n    room id=up at (2000,0) size 4000x5000 label "Upper" uses bedroom\n${DOWN}\n  }`,
        ),
      ),
    ).toHaveLength(1);
  });

  it("reads only a flight that climbs from the storey below", () => {
    // One storey: a stair coming down to an undrawn storey has no flight below to read.
    expect(of(plan(shell("Hall", "hall"), DOWN.replace("    ", "  ")))).toEqual([]);
    // The lower storey is never reported: its flight rises from its own floor.
    expect(of(twoStorey()).map((d) => d.level)).toEqual([2]);
    // A stop below that comes down (it does not climb to this storey) is not read.
    expect(of(plan(level(1, "Hall", DOOR, DOWN), level(2, "Landing", DOWN)))).toEqual([]);
  });

  it("reads every storey a run continues through, on the flight that arrives there", () => {
    // townhouse's shape: one footprint on three storeys, rising from the first and the second.
    const three = (two: string[], top: string[]) =>
      plan(level(1, "Hall", DOOR, UP), level(2, "Landing", UP, ...two), level(3, "Top", DOWN, ...top));
    expect(of(three([], [])).map((d) => [d.level, d.message.split(":")[0]])).toEqual([
      [2, 'No void opens across the head of the flight that climbs from level 1 to the stair in "Landing" on level 2'],
      [3, 'No void opens across the head of the flight that climbs from level 2 to the stair in "Top" on level 3'],
    ]);
    expect(of(three([WELL], [])).map((d) => d.level)).toEqual([3]);
    // The middle storey's stairwell ends at the foot of the flight that rises from it: its landing
    // is floor (W_STAIR_NO_LANDING reads a void only touching the step as no part of it).
    const both = three([WELL], [WELL]);
    expect(of(both)).toEqual([]);
    expect(codes(both).filter((c) => c.startsWith("W_STAIR"))).toEqual([]);
  });

  it("reads a turning stair's last flight on its own footprint, never the box round its pieces", () => {
    expect(of(turning())).toHaveLength(1);
    // The notch is inside the box and holds no piece: a void there is over nothing of the stair.
    expect(of(turning("    void id=v at (1500,2000) size 1500x1600"))).toHaveLength(1);
    // Over the first flight only (where the climb starts) is not over the flight that reaches the storey.
    expect(of(turning("    void id=v at (3000,2000) size 1000x1600"))).toHaveLength(1);
    // Over the last flight it clears, and so does the stairwell drawn over every piece.
    expect(of(turning("    void id=v at (1500,1000) size 1500x1000"))).toEqual([]);
    const well = turning(WELL_L);
    expect(of(well)).toEqual([]);
    expect(codes(well).filter((c) => c.startsWith("W_STAIR"))).toEqual([]);
  });

  it("is invariant under the eight turns and mirrors of the plan (a witness on authored coordinates)", () => {
    // Every rectangle and point of the turning-stair plan carried through g in a 10 m frame.
    const S = 10_000;
    for (const g of D4_ELEMENTS) {
      const map = (x: number, y: number): [number, number] => {
        let [u, v] = g.mirror ? [S - x, y] : [x, y];
        for (let k = 0; k < g.rotate / 90; k++) [u, v] = [S - v, u];
        return [u, v];
      };
      const carry = (src: string): string =>
        src
          .replace(/at \((\d+),(\d+)\) size (\d+)x(\d+)/g, (_, x, y, w, h) => {
            const [a, b] = map(+x, +y);
            const [c, d] = map(+x + +w, +y + +h);
            return `at (${Math.min(a, c)},${Math.min(b, d)}) size ${Math.abs(c - a)}x${Math.abs(d - b)}`;
          })
          .replace(/\((\d+),(\d+)\)(?! size)/g, (_, x, y) => `(${map(+x, +y).join(",")})`)
          .replace(/door id=d at \(\d+,\d+\) width 900 wall shell/, "door id=d on hall.bottom at center width 900");
      for (const [src, want] of [
        [turning(), 1],
        [turning(WELL_L), 0],
        [twoStorey(), 1],
        [twoStorey(WELL), 0],
        [twoStorey("    void id=v at (500,1000) size 50x2600"), 1],
      ] as const)
        expect(of(carry(src)), `${g.name}: ${want}`).toHaveLength(want);
    }
  });

  it("counts its work: per arriving flight, one test per void piece and one per element and wall read for floor", () => {
    // n stairs, each from level 1 to level 2, and m voids on level 2 (none over a flight). Each head
    // band is open, and its first point read is on the floor: one footprint read per flight.
    const dense = (n: number, m: number): string => {
      const ups: string[] = [];
      const downs: string[] = [];
      for (let i = 0; i < n; i++) {
        ups.push(`    stair id=s${i} at (${200 + i * 200},200) size 100x1000 dir up`);
        downs.push(`    stair id=s${i} at (${200 + i * 200},200) size 100x1000 dir down`);
      }
      const voids = Array.from({ length: m }, (_, j) => `    void id=v${j} at (${200 + j * 300},3000) size 200x200`);
      return plan(level(1, "Hall", DOOR, ...ups), level(2, "Landing", ...downs, ...voids));
    };
    for (const [n, m] of [
      [1, 0],
      [2, 3],
      [5, 10],
      [10, 15],
    ] as const) {
      const src = dense(n, m);
      const upper = resolvePlan(src).levels[1]!.ir;
      const read = upper.elements.length + upper.walls.length;
      expect(lintWork(src).stairVoidTests, `n = ${n}, m = ${m}`).toBe(n * (m + read));
      expect(of(src), `n = ${n}, m = ${m}`).toHaveLength(n);
    }
  });

  it("charges its work before it runs: past the stair budget it reports nothing and says so", () => {
    const src = twoStorey();
    const run = (left?: number): { skips: string[]; diags: Diagnostic[] } => {
      const { ir, levels } = resolvePlan(src);
      const storey = lintStoreys(ir!, levels, DEFAULT_RULESET.tolMm)[1]!;
      const ctx = buildLintContext(storey.ir, DEFAULT_RULESET, LINT_RULES, storey.building);
      const skips: string[] = [];
      ctx.skip = (reason) => void skips.push(reason);
      if (left !== undefined) storeyStairs(ctx)!.left = left;
      return { skips, diags: stairNoVoid.check(ctx) };
    };
    const within = run();
    expect([within.skips, within.diags.map((d) => d.code)]).toEqual([[], [CODE]]);
    expect(run(0)).toEqual({ skips: ["stair-budget"], diags: [] });
  });

  it("reports nothing over the shipped examples under the default ruleset (RM-D73: their stairwells were drawn first)", () => {
    const hits = Object.entries(EXAMPLE_FILES).flatMap(([name, src]) =>
      lint(src, { world: EXAMPLES_WORLD })
        .filter((d) => d.code === CODE)
        .map(() => name),
    );
    expect(Object.keys(EXAMPLE_FILES).length).toBeGreaterThan(40);
    expect(hits).toEqual([]);
  });

  it("has a catalogue entry whose example reports it and whose fixed form does not", () => {
    const e = ERROR_CATALOG[CODE]!;
    expect(e.severity).toBe("warning");
    expect(of(plan(e.example!))).toHaveLength(1);
    expect(of(plan(e.fixed!))).toEqual([]);
  });
});
