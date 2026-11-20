/**
 * Product roadmap RM9.10 (ruling RM-D72, revised): `W_EXTERIOR_DOOR_ONTO_ROOF`, a door to the
 * outside whose point just outside it lies on a lower storey's footprint, with nothing drawn there
 * to stand on.
 *
 * Each finding is shown beside the same plan with its cause removed (a balcony, a deck or paving
 * drawn over the roof), and beside the shapes that are doors from the ground and must read as they
 * always did (a walk-out storey, a garage under the house, a bridge, an upper flat with no stair, a
 * storey stacked on an identical one), so a test cannot pass because the rule never ran.
 */
import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { type Diagnostic, describe, lint } from "../src/index.js";
import { EXAMPLE_FILES, EXAMPLES_WORLD, SHIPPED_EXAMPLES } from "./helpers/d4-oracle.js";

const CODE = "W_EXTERIOR_DOOR_ONTO_ROOF";
const of = (src: string): Diagnostic[] => lint(src).filter((d) => d.code === CODE);
const CASE = readFileSync("test/defect-corpus/circulation-privacy/door-onto-roof.arch", "utf8");
const OUT = "    door id=d_out on shell at 12000 width 900\n";
/** The defect plan with `extra` drawn on level 2, after its door. */
const withUpper = (extra: string): string => CASE.replace(OUT, `${OUT}    ${extra}\n`);
/** Level 2 of the defect plan split in two: Study holds the stair, Store is opened only by `door`. */
const twoRooms = (doors: string): string =>
  CASE.replace(
    '    room id=study at (0,0) size 6000x3000 label "Study" uses office\n',
    [
      "    wall id=mid partition thickness 100 { (4800,0) (4800,3000) }",
      '    room id=study at (0,0) size 4800x3000 label "Study" uses office',
      '    room id=store at (4800,0) size 1200x3000 label "Store" uses storage',
      "",
    ].join("\n"),
  ).replace(OUT, doors);
/** Two storeys of 6000 x 3000 with a stair, each with one door: `lower` on level 1, `upper` on level 2. */
const stacked = (lowerSize: string, lower: string, upper: string): string => `plan "S" {
  units mm
  level 0 "Lower" {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,${lowerSize}) (0,${lowerSize}) close }
    room id=hall at (0,0) size 6000x${lowerSize} label "Hall" uses hall
${lower}    stair id=st at (2000,200) size 2600x900 dir up
  }
  level 1 "Upper" {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }
    room id=study at (0,0) size 6000x3000 label "Study" uses living
${upper}    stair id=st at (2000,200) size 2600x900 dir down
  }
}
`;

suite(CODE, () => {
  it("fires on a door onto the roof of the storey below, once, at the door, with no id in the message", () => {
    const [d, ...rest] = of(CASE);
    expect(rest).toEqual([]);
    expect(d!.level).toBe(2);
    expect(CASE.slice(d!.span!.start, d!.span!.end)).toBe(OUT.trim());
    expect(d!.message).toBe(
      'The exterior door from "Study" opens onto the roof of level 1: no balcony, deck or terrace is drawn outside it, so it leads nowhere a person can stand.',
    );
    expect(d!.hints![0]).toContain("`d_out`");
    expect(d!.hints![0]).not.toMatch(/\bmove\b/i);
  });

  it("names an unlabelled room's storey once", () => {
    const src = CASE.replace(' label "Study" uses office', "");
    const [d] = of(src);
    expect(d!.message.match(/level 2/g) ?? []).toHaveLength(1);
  });

  it("is silent where the plan draws a balcony, a deck or paving over the roof", () => {
    for (const surface of [
      "outdoor balcony at (2000,3000) size 2000x1200 rail all",
      "outdoor deck at (0,3000) size 6000x2000",
      "outdoor paving at (0,3000) size 6000x2000",
    ]) {
      expect(of(withUpper(surface)), surface).toEqual([]);
    }
  });

  it("reads a door that opens beyond every storey below as a door from the ground, as it always was", () => {
    // Walk-out (`garden` below, `front` above on the side wall), garage under the house, a bridge
    // (no door below), an upper storey stacked on an identical one, and an upper flat with no stair.
    const front = "    door id=front on shell at 7500 width 900\n";
    const plans = {
      walkout: stacked("3000", "    door id=garden on shell at 12000 width 900\n", front),
      garageUnder: stacked("3000", "    door id=garage on shell at 12000 width 2400\n", front),
      bridge: stacked("3000", "", front),
      stackedFront: stacked("3000", "    door id=garden on shell at 12000 width 900\n", OUT.replace("d_out", "up")),
      upperFlat: stacked("3000", "    door id=garden on shell at 12000 width 900\n", front).replace(
        /\n\s*stair id=st at \(2000,200\) size 2600x900 dir down/,
        "",
      ),
    };
    for (const [name, src] of Object.entries(plans)) {
      expect(of(src), name).toEqual([]);
      const d = describe(src);
      expect(
        d.levels!.flatMap((l) => l.access.rooms.filter((r) => !r.reachable).map((r) => r.id)),
        name,
      ).toEqual([]);
      expect(
        lint(src).map((x) => x.code),
        name,
      ).not.toContain("W_ROOM_UNREACHABLE");
    }
    expect(describe(plans.bridge).vertical!.reachable_levels).toEqual([0, 1]);
  });

  it("is silent on a plan of one storey, with or without its `level` block", () => {
    const body = `  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }\n  room id=r at (0,0) size 6000x3000 label "Study"\n${OUT}`;
    expect(of(`plan "one" {\n  units mm\n${body}}\n`)).toEqual([]);
    expect(of(`plan "one" {\n  units mm\n  level 1 {\n${body}  }\n}\n`)).toEqual([]);
  });

  it("a door onto a roof grounds nothing: the storey is walked from its stair", () => {
    // Store is opened only by the door onto the roof: it is unreachable, and the Study the stair
    // lands in is not.
    const src = twoRooms("    door id=d_out on shell at 9600 width 900\n");
    expect(of(src).map((d) => d.level)).toEqual([2]);
    const unreachable = lint(src).filter((d) => d.code === "W_ROOM_UNREACHABLE");
    expect(unreachable.map((d) => src.slice(d.span!.start, d.span!.end))).toEqual([
      'room id=store at (4800,0) size 1200x3000 label "Store" uses storage',
    ]);
  });

  it("two doors onto a roof never join two rooms through the air", () => {
    const src = twoRooms(
      "    door id=d_out on shell at 9600 width 900\n    door id=d_out2 on shell at 12000 width 900\n",
    );
    expect(of(src).map((d) => src.slice(d.span!.start, d.span!.end).split(" ")[1])).toEqual(["id=d_out", "id=d_out2"]);
    expect(
      describe(src)
        .levels![1]!.access.rooms.filter((r) => !r.reachable)
        .map((r) => r.id),
    ).toEqual(["store"]);
    expect(lint(src).filter((d) => d.code === "W_ROOM_UNREACHABLE")).toHaveLength(1);
  });

  it("raises nothing over the shipped examples (the rule card's count over examples/**: 0)", () => {
    expect(SHIPPED_EXAMPLES.length).toBeGreaterThan(5);
    const fired = SHIPPED_EXAMPLES.filter(
      (f) => lint(EXAMPLE_FILES[f]!, { world: EXAMPLES_WORLD }).filter((d) => d.code === CODE).length > 0,
    );
    expect(fired).toEqual([]);
  });
});
