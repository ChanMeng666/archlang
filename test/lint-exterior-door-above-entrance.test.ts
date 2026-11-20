/**
 * Product roadmap RM9.10: `W_EXTERIOR_DOOR_ABOVE_ENTRANCE`, an exterior door on a storey above the
 * building's entrance storey that opens onto nothing the plan draws.
 *
 * Each finding is shown beside the same plan with its cause removed (a balcony, a deck or paving
 * drawn outside the door, the door moved down a storey, the plan made single-storey), so a test
 * cannot pass because the rule never ran.
 */
import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { type Diagnostic, lint } from "../src/index.js";
import { EXAMPLE_FILES, EXAMPLES_WORLD, SHIPPED_EXAMPLES } from "./helpers/d4-oracle.js";

const CODE = "W_EXTERIOR_DOOR_ABOVE_ENTRANCE";
const of = (src: string): Diagnostic[] => lint(src).filter((d) => d.code === CODE);
const CASE = readFileSync("test/defect-corpus/circulation-privacy/upper-door-into-air.arch", "utf8");
const OUTSIDE_DOOR = "    door id=d_out on shell at 12000 width 900\n";
/** The defect plan with `extra` drawn on level 2, after its door. */
const withUpper = (extra: string): string => CASE.replace(OUTSIDE_DOOR, `${OUTSIDE_DOOR}    ${extra}\n`);

suite(CODE, () => {
  it("fires on an upstairs door onto nothing, once, at the door, with no id in the message", () => {
    const [d, ...rest] = of(CASE);
    expect(rest).toEqual([]);
    expect(d!.level).toBe(2);
    expect(CASE.slice(d!.span!.start, d!.span!.end)).toBe(OUTSIDE_DOOR.trim());
    expect(d!.message).toContain("level 2");
    expect(d!.message).toContain("(level 1)");
    expect(d!.message).not.toContain("d_out");
    expect(d!.hints![0]).toContain("`d_out`");
  });

  it("is silent where the plan draws a balcony, a deck or ground outside the door", () => {
    for (const surface of [
      "outdoor balcony at (2000,3000) size 2000x1200 rail all",
      "outdoor deck at (2000,3000) size 2000x1200",
      "outdoor paving at (0,3000) size 6000x2000",
    ]) {
      expect(of(withUpper(surface)), surface).toEqual([]);
    }
  });

  it("is silent on the entrance storey, and on a plan of one storey", () => {
    // The same door on level 1, beside the front door.
    const below = CASE.replace(OUTSIDE_DOOR, "").replace(
      "    door id=front on shell at 12000 width 900\n",
      "    door id=front on shell at 12000 width 900\n    door id=back on shell at 14000 width 900\n",
    );
    expect(of(below)).toEqual([]);
    const single = `plan "one" {\n  units mm\n  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }\n  room id=r at (0,0) size 6000x3000 label "Study"\n${OUTSIDE_DOOR}}\n`;
    expect(of(single)).toEqual([]);
  });

  it("reads the entrance storey off the doors: a basement with no door of its own is below it", () => {
    const basement = CASE.replace(
      '  level 1 "Ground" {',
      [
        '  level 0 "Basement" {',
        "    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }",
        '    room id=cellar at (0,0) size 6000x3000 label "Cellar" uses storage',
        "    stair id=st0 at (2000,200) size 2600x900 dir up",
        "  }",
        '  level 1 "Ground" {',
        "    stair id=st0 at (2000,1900) size 2600x900 dir down",
      ].join("\n"),
    );
    const found = of(basement);
    expect(found.map((d) => d.level)).toEqual([2]);
    expect(found[0]!.message).toContain("(level 1)");
  });

  it("the door into thin air grounds nothing: the storey is walked from its stair", () => {
    // A second room upstairs that only the outside door opens: it is now unreachable, and the room
    // the stair lands in is not (before RM9.10 the door was the storey's entrance, so the stair's
    // room read unreachable instead).
    const twoRooms = CASE.replace(
      '    room id=study at (0,0) size 6000x3000 label "Study" uses office\n',
      [
        "    wall id=mid partition thickness 100 { (4800,0) (4800,3000) }",
        '    room id=study at (0,0) size 4800x3000 label "Study" uses office',
        '    room id=store at (4800,0) size 1200x3000 label "Store" uses storage',
        "",
      ].join("\n"),
    ).replace(OUTSIDE_DOOR, "    door id=d_out on shell at 9600 width 900\n");
    const codes = lint(twoRooms).map((d) => `${d.code}@${d.level}`);
    expect(codes).toContain(`${CODE}@2`);
    const unreachable = lint(twoRooms).filter((d) => d.code === "W_ROOM_UNREACHABLE");
    expect(unreachable.map((d) => twoRooms.slice(d.span!.start, d.span!.end))).toEqual([
      'room id=store at (4800,0) size 1200x3000 label "Store" uses storage',
    ]);
  });

  it("raises nothing over the shipped examples (the rule card's count over examples/**: 0)", () => {
    expect(SHIPPED_EXAMPLES.length).toBeGreaterThan(5);
    const fired = SHIPPED_EXAMPLES.filter(
      (f) => lint(EXAMPLE_FILES[f]!, { world: EXAMPLES_WORLD }).filter((d) => d.code === CODE).length > 0,
    );
    expect(fired).toEqual([]);
  });
});
