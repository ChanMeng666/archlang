/**
 * Product roadmap RM9.10 (ruling RM-D72, second revision): `W_EXTERIOR_DOOR_ONTO_ROOF`. A door or
 * cased opening to the outside opens over a lower storey's footprint when the point just outside it
 * (one wall thickness off the wall at its centre) lies on one of that storey's rooms or inside its
 * closed exterior wall rings read even-odd, edges included, and its own storey draws no `outdoor`
 * surface there. It stops being a way in, and is reported, ONLY when its storey still has another
 * arrival: a door from the ground over no footprint, or a shaft from a storey grounded by one.
 * Otherwise it keeps the role it always had (a bridge, an upper flat with no stair, a ground floor
 * over a larger basement with no door of its own all read as on `main`).
 *
 * Each finding is shown beside the same plan with its cause removed, and each branch of the rule
 * (the footprint's rooms and rings, the probe distance, any storey below, the suggest filter) is
 * pinned by a case its mutant fails, so a test cannot pass because the rule never ran.
 */
import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { type Diagnostic, describe, lint, suggestTopology } from "../src/index.js";
import { EXAMPLE_FILES, EXAMPLES_WORLD, SHIPPED_EXAMPLES } from "./helpers/d4-oracle.js";

const CODE = "W_EXTERIOR_DOOR_ONTO_ROOF";
const of = (src: string): Diagnostic[] => lint(src).filter((d) => d.code === CODE);
const codes = (src: string): string[] => lint(src).map((d) => d.code!);
const unreached = (src: string): string[] =>
  describe(src).levels!.flatMap((l) => l.access.rooms.filter((r) => !r.reachable).map((r) => `${l.level}:${r.id}`));
const CASE = readFileSync("test/defect-corpus/circulation-privacy/door-onto-roof.arch", "utf8");
const OUT = "    door id=d_out on shell at 12000 width 900\n";
/** The defect plan with `extra` drawn on level 2, after its door. */
const withUpper = (extra: string): string => CASE.replace(OUT, `${OUT}    ${extra}\n`);
/** Level 2 of the defect plan split in two: Study holds the stair, Store is opened by `doors` only. */
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
const ring = (x1: number, y1: number, id = "shell", x0 = 0, y0 = 0): string =>
  `    wall id=${id} exterior thickness 200 { (${x0},${y0}) (${x1},${y0}) (${x1},${y1}) (${x0},${y1}) close }\n`;
const STAIR_UP = "    stair id=st at (2000,200) size 2600x900 dir up\n";
const STAIR_DN = "    stair id=st at (2000,200) size 2600x900 dir down\n";
/** Level 0 `x1` wide and 3000 deep with `lower`; level 1 6000 x 3000 with its front door on the side wall. */
const hill = (x1: number, lower: string, stair = true): string => `plan "H" {
  units mm
  level 0 "Lower" {
${ring(x1, 3000)}    room id=hall at (0,0) size ${x1}x3000 label "Hall" uses hall
${lower}${stair ? STAIR_UP : ""}  }
  level 1 "Upper" {
${ring(6000, 3000)}    room id=study at (0,0) size 6000x3000 label "Study" uses living
    door id=front on shell at 7500 width 900
${stair ? STAIR_DN : ""}  }
}
`;
/** The defect plan with level 1 `depth` deep and no grid: the probe outside `d_out` is at y 3200. */
const edge = (depth: number): string =>
  CASE.replace("  grid 50\n", "")
    .replace("{ (0,0) (6000,0) (6000,5000) (0,5000) close }", `{ (0,0) (6000,0) (6000,${depth}) (0,${depth}) close }`)
    .replace("size 6000x5000", `size 6000x${depth}`);

suite(CODE, () => {
  it("fires on a door over the roof of the storey below, once, at the door, with no id in the message", () => {
    const [d, ...rest] = of(CASE);
    expect(rest).toEqual([]);
    expect(d!.level).toBe(2);
    expect(CASE.slice(d!.span!.start, d!.span!.end)).toBe(OUT.trim());
    expect(d!.message).toBe(
      'The exterior door from "Study" opens over the footprint of level 1; if that is a roof, nobody arrives through it: draw a deck or balcony there, or make it a window.',
    );
    expect(d!.hints![0]).toContain("`d_out`");
    expect(d!.hints![0]).not.toMatch(/\bmove\b/i);
  });

  it("names an unlabelled room's storey once", () => {
    const [d] = of(CASE.replace(' label "Study" uses office', ""));
    expect(d!.message.match(/level 2/g) ?? []).toHaveLength(1);
  });

  it("is silent where the plan draws a balcony, a deck or paving outside the door", () => {
    for (const surface of [
      "outdoor balcony at (2000,3000) size 2000x1200 rail all",
      "outdoor deck at (0,3000) size 6000x2000",
      "outdoor paving at (0,3000) size 6000x2000",
    ]) {
      expect(of(withUpper(surface)), surface).toEqual([]);
    }
  });

  it("probes one wall thickness out, and a footprint's edge counts as on it", () => {
    expect(of(edge(3199))).toEqual([]);
    expect(of(edge(3200)).map((d) => d.level)).toEqual([2]);
    expect(of(edge(3201)).map((d) => d.level)).toEqual([2]);
  });

  it("reads the lower storey's exterior ring, not only its rooms", () => {
    // Level 1's room covers its back 3000 mm only; the point outside `d_out` is inside its ring.
    const src = CASE.replace("size 6000x5000", "size 6000x3000").replace(
      "door id=front on shell at 14000 width 900",
      "door id=front on shell at 3000 width 900",
    );
    expect(of(src).map((d) => d.level)).toEqual([2]);
  });

  it("reads exterior rings even-odd: a door over a courtyard opens over no footprint", () => {
    const O = (n: number, door: string, dir: string): string => `  level ${n} {
${ring(12000, 12000)}${ring(8000, 8000, "cy", 4000, 4000)}    room id=s at (0,0) size 12000x4000 label "South" uses living
    room id=n at (0,8000) size 12000x4000 label "North" uses living
    room id=w at (0,4000) size 4000x4000 label "West" uses hall
    room id=e at (8000,4000) size 4000x4000 label "East" uses hall
    opening id=o1 at (2000,4000) width 1200 wall partition
    opening id=o2 at (2000,8000) width 1200 wall partition
    opening id=o3 at (10000,4000) width 1200 wall partition
    opening id=o4 at (10000,8000) width 1200 wall partition
    ${door}
    stair id=st at (6000,200) size 2600x900 dir ${dir}
  }
`;
    const src = `plan "C" {\n  units mm\n${O(1, "door id=front on shell at 1000 width 900", "up")}${O(2, "door id=court on cy at 2000 width 900", "down")}}\n`;
    expect(codes(src)).not.toContain(CODE);
  });

  it("reads every storey below, naming the nearest whose footprint holds the point", () => {
    // Levels 2 and 3 are both set back over level 1; the door on level 3 opens over level 1.
    const three = CASE.replace(
      '  level 2 "Upper" {',
      [
        '  level 2 "Mid" {',
        ring(6000, 3000).trimEnd(),
        '    room id=mid at (0,0) size 6000x3000 label "Mid" uses living',
        "    stair id=st at (2000,200) size 2600x900 dir up",
        "  }",
        '  level 3 "Upper" {',
      ].join("\n"),
    );
    const found = of(three);
    expect(found.map((d) => d.level)).toEqual([3]);
    expect(found[0]!.message).toContain("footprint of level 1");
  });

  it("names only a door that is no way in: its storey still has another arrival", () => {
    // Walk-out and garage-under with the lower storey 2 m deeper into the hill: the upper storey is
    // reached by its stair, so its front door over the lower storey is no way in and is named.
    for (const door of ["door id=garden on shell at 16000 width 900", "door id=garage on shell at 16000 width 2400"]) {
      const src = hill(8000, `    ${door}\n`);
      expect(
        of(src).map((d) => d.level),
        door,
      ).toEqual([1]);
      expect(unreached(src), door).toEqual([]);
    }
    // Identical storeys: the front door opens over no footprint.
    expect(of(hill(6000, "    door id=garden on shell at 12000 width 900\n"))).toEqual([]);
  });

  it("keeps the role it always had where it is the storey's only arrival", () => {
    // A bridge (no door below), an upper flat with no stair, a ground floor over a larger basement
    // with no door of its own: the door over the footprint grounds its storey, as on main.
    const bridge = hill(8000, "");
    const flat = hill(8000, "    door id=garden on shell at 16000 width 900\n", false);
    const basement = `plan "B" {
  units mm
  level -1 "Basement" {
${ring(8000, 6000, "shell", -2000, -2000)}    room id=cellar at (-2000,-2000) size 10000x8000 label "Cellar" uses storage
${STAIR_UP}  }
  level 1 "Ground" {
${ring(6000, 3000)}    room id=hall at (0,0) size 6000x3000 label "Hall" uses hall
    door id=front on shell at 12000 width 900
${STAIR_DN}  }
}
`;
    for (const [name, src] of [
      ["bridge", bridge],
      ["upper flat", flat],
      ["basement", basement],
    ] as const) {
      expect(of(src), name).toEqual([]);
      expect(unreached(src), name).toEqual([]);
      expect(codes(src), name).not.toContain("W_ROOM_UNREACHABLE");
    }
    expect(describe(bridge).vertical!.reachable_levels).toEqual([0, 1]);
    expect(describe(basement).vertical!.reachable_levels).toEqual([-1, 1]);
  });

  it("is silent on a plan of one storey, with or without its `level` block", () => {
    const body = `${ring(6000, 3000).replace(/^ {2}/, "")}  room id=r at (0,0) size 6000x3000 label "Study"\n${OUT}`;
    expect(of(`plan "one" {\n  units mm\n${body}}\n`)).toEqual([]);
    expect(of(`plan "one" {\n  units mm\n  level 1 {\n${body}  }\n}\n`)).toEqual([]);
  });

  it("a door that is no way in grounds nothing: the storey is walked from its stair", () => {
    const src = twoRooms("    door id=d_out on shell at 9600 width 900\n");
    expect(of(src).map((d) => d.level)).toEqual([2]);
    const unreachable = lint(src).filter((d) => d.code === "W_ROOM_UNREACHABLE");
    expect(unreachable.map((d) => src.slice(d.span!.start, d.span!.end))).toEqual([
      'room id=store at (4800,0) size 1200x3000 label "Store" uses storage',
    ]);
  });

  it("is no start beside a door from the ground on the same storey, and carries nobody up a stair it opens to", () => {
    // Level 2 has a hillside door (beyond level 1) into the Study and `d_out` alone opens the Store.
    const mixed = twoRooms(
      "    door id=hill on shell at 3000 width 900\n    door id=d_out on shell at 9600 width 900\n",
    );
    expect(of(mixed).map((d) => d.level)).toEqual([2]);
    expect(unreached(mixed)).toEqual(["2:store"]);
    expect(lint(mixed).filter((d) => d.code === "W_ROOM_UNREACHABLE")).toHaveLength(1);
    // A stair on up to level 3 standing in the Store: nobody arrives on level 3 through `d_out`.
    const relay = mixed
      .replace(STAIR_DN, `${STAIR_DN}    stair id=up at (5000,500) size 900x2000 dir up\n`)
      .replace(
        /\n}\n$/,
        `\n  level 3 "Top" {\n${ring(6000, 3000)}    room id=attic at (0,0) size 6000x3000 label "Attic" uses storage\n    stair id=up at (5000,500) size 900x2000 dir down\n  }\n}\n`,
      );
    expect(describe(relay).vertical!.reachable_levels).toEqual([1, 2]);
    expect(
      describe(relay.replace("    door id=d_out on shell at 9600 width 900\n", "")).vertical!.reachable_levels,
    ).toEqual([1, 2]);
  });

  it("two doors that are no way in never join two rooms through the air", () => {
    const src = twoRooms(
      "    door id=d_out on shell at 9600 width 900\n    door id=d_out2 on shell at 12000 width 900\n",
    );
    expect(of(src).map((d) => src.slice(d.span!.start, d.span!.end).split(" ")[1])).toEqual(["id=d_out", "id=d_out2"]);
    expect(unreached(src)).toEqual(["2:store"]);
  });

  it("suggests no door over a lower storey's footprint", () => {
    // Level 2 has a door from the ground on its back wall; the Store has no door, and windows fill
    // its back and side walls, so its only free run to the outside is over level 1's roof.
    const src = twoRooms(
      [
        "    door id=back on shell at 2000 width 900",
        "    window id=w_back on shell at 5400 width 1000",
        "    window id=w_side on shell at 7500 width 2800",
        "",
      ].join("\n"),
    );
    const store = suggestTopology(src).filter((s) => s.roomId === "store");
    expect(store.map((s) => [s.code, s.level])).toEqual([["W_ROOM_UNREACHABLE", 2]]);
    for (const c of store[0]!.candidates) expect(c.insertText, c.rationale).not.toMatch(/\bon shell\b/);
  });

  it("raises nothing over the shipped examples (the rule card's count over examples/**: 0)", () => {
    expect(SHIPPED_EXAMPLES.length).toBeGreaterThan(5);
    const fired = SHIPPED_EXAMPLES.filter(
      (f) => lint(EXAMPLE_FILES[f]!, { world: EXAMPLES_WORLD }).filter((d) => d.code === CODE).length > 0,
    );
    expect(fired).toEqual([]);
  });
});
