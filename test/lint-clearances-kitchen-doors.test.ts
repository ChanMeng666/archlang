/**
 * Plan-soundness PS2.11e (the kitchen and door half) and PS2.46, PS2.54: `W_HOB_UNDER_WINDOW`,
 * `W_HOB_FRIDGE_GAP`, `W_LEAF_TOO_WIDE`, `W_DOORWAY_BLOCKED` read for a leaf-less opening, and the
 * one datum for a doorway's approach (the wall's face). What each fires on, what it must not fire
 * on, its boundaries and its words, and the first-contact audits' rows each one catches.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe as suite, expect, it } from "vitest";
import { type Diagnostic, describe as describePlan, lint, type World } from "../src/index.js";
import { type AccessEdge, rectOf, resolvePlan } from "../src/analyze.js";
import { doorLandingRect, openingBlock } from "../src/geometry/rect.js";
import type { RFurniture, ROpening } from "../src/ir.js";
import { clearancesClear } from "../src/lint/clearance-measure.js";
import { buildLintContext } from "../src/lint/context.js";
import { DEFAULT_RULESET } from "../src/lint/ruleset.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const of = (src: string, code: string, opts: Parameters<typeof lint>[1] = {}): Diagnostic[] =>
  lint(src, opts).filter((d) => d.code === code);

const kitchen = (pieces: string, windows = "window id=w_k at (2000,0) width 1200 wall shell"): string => `plan "K" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r_k at (0,0) size 6000x4000 label "Kitchen" uses kitchen
  door id=d at (3000,4000) width 900 wall shell
  ${windows}
  ${pieces}
}`;

// ─── W_HOB_UNDER_WINDOW (PS2.46) ─────────────────────────────────────────────────────────

const HU = "W_HOB_UNDER_WINDOW";

suite("W_HOB_UNDER_WINDOW (PS2.46)", () => {
  it("a hob wholly under a window: the covered span, the window, and the move that clears it", () => {
    const ds = of(kitchen("furniture stove against wall shell segment 0 offset 2000 in r_k"), HU);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toBe(
      "The stove in Kitchen stands under 600 mm of a 1200 mm window: a cooking surface under a window puts its curtain or blind over the flames, and the reach to open it across the burners.",
    );
    expect(ds[0]!.hints![0]).toContain('window "w_k"');
    expect(ds[0]!.hints![0]).toContain("slide it 900 mm along the wall");
    // The piece's id was assigned, so it is named by its kind and room, never quoted.
    expect(ds[0]!.hints![0]).toContain('The stove in "Kitchen"');
    expect(ds[0]!.fixes).toBeUndefined();
  });

  it("every cooking-surface word: `stove`, `hob`, `cooktop`", () => {
    for (const w of ["stove", "hob", "cooktop"])
      expect(of(kitchen(`furniture ${w} against wall shell segment 0 offset 2000 in r_k`), HU), w).toHaveLength(1);
  });

  it("an authored id is quoted in the hint", () => {
    const ds = of(kitchen("furniture id=hob1 hob against wall shell segment 0 offset 2000 in r_k"), HU);
    expect(ds[0]!.hints![0]).toMatch(/^"hob1" stands under/);
  });

  it("a window's assigned id is never quoted: it is named by its width", () => {
    const ds = of(
      kitchen(
        "furniture stove against wall shell segment 0 offset 2000 in r_k",
        "window at (2000,0) width 1200 wall shell",
      ),
      HU,
    );
    expect(ds).toHaveLength(1);
    expect(ds[0]!.hints![0]).toContain('stands under 600 mm of the 1200 mm window on wall "shell"');
    expect(ds[0]!.hints![0]).not.toMatch(/window_\d/);
  });

  it("a hob past the window's end, touching it, is clear (positive area only)", () => {
    // Window x 1400–2600; a hob centred at 2900 spans 2600–3200.
    expect(of(kitchen("furniture stove against wall shell segment 0 offset 2900 in r_k"), HU)).toEqual([]);
    expect(of(kitchen("furniture stove against wall shell segment 0 offset 2850 in r_k"), HU)).toHaveLength(1);
  });

  it("a high window (sill at or above 2100 mm) is not judged", () => {
    const high = "window id=w_k at (2000,0) width 1200 wall shell sill 2100 head 2400";
    expect(of(kitchen("furniture stove against wall shell segment 0 offset 2000 in r_k", high), HU)).toEqual([]);
  });

  it("a sink, a worktop or a fridge under the window is not this rule's", () => {
    for (const w of ["kitchen_sink", "counter"])
      expect(of(kitchen(`furniture ${w} against wall shell segment 0 offset 2000 in r_k`), HU), w).toEqual([]);
  });

  it("a café's kitchen is read as a dwelling's: the hazard is the hob's", () => {
    // An office and no bedroom or living room: the plan reads as non-residential (D6).
    const cafe = kitchen("furniture stove against wall shell segment 0 offset 2000 in r_k")
      .replace('size 6000x4000 label "Kitchen"', 'size 3000x4000 label "Kitchen"')
      .replace("uses kitchen\n", 'uses kitchen\n  room id=r_o at (3000,0) size 3000x4000 label "Office" uses office\n');
    expect(cafe).toContain('label "Office" uses office');
    expect(of(cafe, HU)).toHaveLength(1);
  });
});

// ─── W_HOB_FRIDGE_GAP (PS2.11e) ──────────────────────────────────────────────────────────

const HF = "W_HOB_FRIDGE_GAP";
const run = (stove: number, fridge: number, extra = ""): string =>
  kitchen(
    `furniture stove against wall shell segment 0 offset ${stove} in r_k\n  furniture fridge against wall shell segment 0 offset ${fridge} in r_k${extra}`,
    "window id=w_k at (5000,4000) width 1200 wall shell",
  );

suite("W_HOB_FRIDGE_GAP (PS2.11e)", () => {
  it("a fridge 100 mm beside the hob: the gap, the figure and the shortfall", () => {
    // Stove 1700–2300, fridge 2400–3000.
    const ds = of(run(2000, 2700), HF);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toBe(
      "The stove in Kitchen stands 100 mm from the fridge beside it; a cooking surface needs 305 mm of worktop on each side before a tall unit (205 mm short).",
    );
    expect(ds[0]!.hints![0]).toContain("`hobLandingMm` is 305 mm");
    expect(ds[0]!.hints![0]).toContain("move one of them 205 mm further along the run");
  });

  it("abutting (0 mm) fires; 305 mm, the cited 12 in, is clear; either side", () => {
    expect(of(run(2000, 2600), HF)).toHaveLength(1);
    expect(of(run(2000, 2950), HF)).toEqual([]);
    expect(of(run(2000, 2900), HF)).toHaveLength(1);
    expect(of(run(2000, 1050), HF)).toEqual([]);
    expect(of(run(2000, 1100), HF)).toHaveLength(1);
    // The figure is the cited one in mm, not a grid module: off the grid, 305 clears and 304 does not.
    const fine = (fridge: number) => run(2000, fridge).replace("grid 50", "grid 1");
    expect(of(fine(2905), HF)).toEqual([]);
    expect(of(fine(2904), HF)).toHaveLength(1);
  });

  it("a fridge behind a partition, in the next room, is not beside the hob (lint and placement agree)", () => {
    // Kitchen x 0–2400, a 100 mm partition on x 2400 (body 2350–2450), a pantry beyond. The stove
    // spans 1700–2300; the fridge 2450–3050 stands 150 mm from it, through the wall.
    const src = `plan "K" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall id=w_p partition thickness 100 { (2400,0) (2400,4000) }
  room id=r_k at (0,0) size 2400x4000 label "Kitchen" uses kitchen
  room id=r_p at (2400,0) size 3600x4000 label "Pantry" uses storage
  door id=d at (1200,4000) width 900 wall shell
  door id=d2 at (2400,3000) width 800 wall w_p
  furniture stove against wall shell segment 0 offset 2000 in r_k
  furniture fridge against wall shell segment 0 offset 2750 in r_p
}`;
    expect(of(src, HF)).toEqual([]);
    const ctx = buildLintContext(resolvePlan(src, {}).ir!, DEFAULT_RULESET);
    // The placement check reads the same measure: the fridge where it stands is clear of the stove,
    // and so is the stove where it stands of the fridge.
    expect(clearancesClear(ctx, { x: 2450, y: 100, w: 600, h: 650 }, "fridge", 0)).toBe(true);
    expect(clearancesClear(ctx, { x: 1700, y: 100, w: 600, h: 600 }, "stove", 0)).toBe(true);
    // In the kitchen, 100 mm from the stove, the same fridge is refused.
    expect(clearancesClear(ctx, { x: 1000, y: 100, w: 600, h: 650 }, "fridge", 0)).toBe(false);
  });

  it("across an `open between` join there is no wall: a dining room's fridge 100 mm off the hob fires", () => {
    // Kitchen and dining as one open-plan space (walls from rooms, the shared edge left open). The
    // stove spans 1700–2300 on the north wall in the kitchen; the fridge 2400–3000 in the dining room.
    const plan = (join: string) => `plan "K" {
  units mm
  grid 50
  room id=r_k at (0,0) size 2400x4000 label "Kitchen" uses kitchen
  room id=r_d right-of r_k align top gap 0 size 3600x4000 label "Dining" uses dining
  walls from rooms exterior 200 partition 100 {
    ${join}
  }
  door on r_d.bottom at center width 900
  furniture stove against r_k.top offset 2000 in r_k
  furniture fridge against r_d.top offset 300 in r_d
}`;
    const open = of(plan("open between r_k and r_d"), HF);
    expect(open).toHaveLength(1);
    expect(open[0]!.message).toContain("from the fridge beside it");
    // The same rooms with their partition standing: the wall ends the measure.
    expect(of(plan("door between r_k and r_d at 2000 from start width 800"), HF)).toEqual([]);
  });

  it("a stub wall between them in one room ends the measure: the wall is nearer", () => {
    // A 100 mm nib on x 2400 (body 2350–2450) from the back wall; stove 1700–2300, fridge 2450–3050.
    const src = run(2000, 2750, "\n  wall id=w_nib partition thickness 100 { (2400,0) (2400,800) }");
    expect(of(src, HF)).toEqual([]);
    expect(of(run(2000, 2750), HF)).toHaveLength(1);
  });

  it("two tall units at the same gap: the one first in source order is named, either frame", () => {
    // A wardrobe and a bookcase 100 mm off each side of the stove.
    const pieces = (a: string, b: string) =>
      kitchen(
        `furniture stove against wall shell segment 0 offset 2000 in r_k
  furniture ${a} against wall shell segment 0 offset 2700 size 600x600 in r_k
  furniture ${b} against wall shell segment 0 offset 1300 size 600x600 in r_k`,
        "window id=w_k at (5000,4000) width 1200 wall shell",
      );
    expect(of(pieces("wardrobe", "bookcase"), HF)[0]!.message).toContain("from the wardrobe beside it");
    expect(of(pieces("bookcase", "wardrobe"), HF)[0]!.message).toContain("from the bookcase beside it");
  });

  it("any tall unit counts (a wardrobe or a bookcase), a low one does not", () => {
    const k = (piece: string): string =>
      kitchen(
        `furniture stove against wall shell segment 0 offset 2000 in r_k\n  furniture ${piece} against wall shell segment 0 offset 2650 size 600x600 in r_k`,
        "window id=w_k at (5000,4000) width 1200 wall shell",
      );
    expect(of(k("wardrobe"), HF)).toHaveLength(1);
    expect(of(k("bookcase"), HF)).toHaveLength(1);
    expect(of(k("counter"), HF)).toEqual([]);
    expect(of(k("dishwasher"), HF)).toEqual([]);
  });

  it("a fridge across the room, in front of the hob, is not beside it", () => {
    const src = kitchen(
      "furniture stove against wall shell segment 0 offset 2000 in r_k\n  furniture fridge at (1700,1300) size 600x650",
      "window id=w_k at (5000,4000) width 1200 wall shell",
    );
    expect(of(src, HF)).toEqual([]);
  });

  it("`hobLandingMm: null` turns it off", () => {
    expect(of(run(2000, 2600), HF, { ruleset: { hobLandingMm: null } })).toEqual([]);
  });
});

// ─── W_LEAF_TOO_WIDE (PS2.11e) ───────────────────────────────────────────────────────────

const LW = "W_LEAF_TOO_WIDE";
const hall = (door: string): string => `plan "H" {
  units mm
  grid 1
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  room id=r_hall at (0,0) size 8000x6000 label "Entrance Hall" uses entry
  ${door}
  window at (8000,3000) width 1200 wall shell
}`;

suite("W_LEAF_TOO_WIDE (PS2.11e)", () => {
  it("one hinged leaf over 1219 mm: the leaf, the figure, and a pair of leaves offered", () => {
    const ds = of(hall("door id=d_main on r_hall.bottom at center width 2400 swing inward"), LW);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toBe(
      'The exterior door into "Entrance Hall" is one hinged leaf 2400 mm wide; a swinging leaf is at most 1219 mm (1181 mm over), wider than a door is made to hang and swing.',
    );
    expect(ds[0]!.hints![0]).toContain(
      'Make door "d_main" a pair of leaves, `door double … width 2400` (each leaf 1200 mm)',
    );
  });

  it("the quoted width is rounded DOWN to the plan's grid, so applying it clears the warning", () => {
    for (const grid of [50, 25, 10]) {
      const at = (door: string) => hall(door).replace("grid 1", `grid ${grid}`);
      const single = of(at("door id=d on r_hall.bottom at center width 2500 swing inward"), LW)[0]!.hints![0]!;
      const pairMax = Math.floor(2438 / grid) * grid;
      const leafMax = Math.floor(1219 / grid) * grid;
      expect(single, `grid ${grid}`).toContain(`narrow it to ${leafMax} mm or less`);
      expect(single, `grid ${grid}`).toContain(`narrow it to ${pairMax} mm or less too`);
      const pair = of(at("door id=d double on r_hall.bottom at center width 3000 swing inward"), LW)[0]!.hints![0]!;
      expect(pair).toContain(`Narrow door "d" to ${pairMax} mm or less (\`width ${pairMax}\`)`);
      // Each quoted width, applied, clears the warning on that grid.
      expect(of(at(`door on r_hall.bottom at center width ${leafMax} swing inward`), LW), `grid ${grid}`).toEqual([]);
      expect(
        of(at(`door double on r_hall.bottom at center width ${pairMax} swing inward`), LW),
        `grid ${grid}`,
      ).toEqual([]);
    }
  });

  it("the boundary: 1219 is clear, 1220 fires", () => {
    expect(of(hall("door on r_hall.bottom at center width 1219 swing inward"), LW)).toEqual([]);
    expect(of(hall("door on r_hall.bottom at center width 1220 swing inward"), LW)).toHaveLength(1);
  });

  it("a `double` door is judged leaf by leaf", () => {
    expect(of(hall("door double on r_hall.bottom at center width 2400 swing inward"), LW)).toEqual([]);
    const ds = of(hall("door id=d double on r_hall.bottom at center width 3000 swing inward"), LW);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toContain("a double door whose leaves are each 1500 mm wide");
    expect(ds[0]!.hints![0]).toContain('Narrow door "d" to 2438 mm or less');
  });

  it("a door with no swinging leaf is never judged", () => {
    for (const k of ["sliding", "pocket", "bifold", "barn"])
      expect(of(hall(`door ${k} on r_hall.bottom at center width 3000`), LW), k).toEqual([]);
  });

  it("`maxHingedLeafMm: null` turns it off", () => {
    const src = hall("door on r_hall.bottom at center width 2400 swing inward");
    expect(of(src, LW, { ruleset: { maxHingedLeafMm: null } })).toEqual([]);
  });
});

// ─── W_DOORWAY_BLOCKED: leaf-less openings and the face datum (PS2.11e, PS2.54) ─────────

const DB = "W_DOORWAY_BLOCKED";
const pair = (connector: string, piece: string): string => `plan "O" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall id=w_mid partition thickness 100 { (5000,0) (5000,4000) }
  room id=r_study at (0,0) size 5000x4000 label "Study" uses office
  room id=r_entry at (5000,0) size 3000x4000 label "Entry" uses entry
  door id=d_entry at (6500,4000) width 900 wall shell
  ${connector}
  window at (2500,0) width 1500 wall shell
  ${piece}
}`;
const OPENING = "opening id=o_study at (5000,2000) width 1200 wall w_mid";

suite("W_DOORWAY_BLOCKED on a leaf-less opening (PS2.11e)", () => {
  it("a desk 50 mm off the study face: named by the rooms the opening joins, never an id", () => {
    const ds = of(pair(OPENING, "furniture desk at (4100,2200) size 800x1600 in r_study"), DB);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toBe(
      'The opening between "Study" and "Entry" is blocked — the approach needs 300 mm clear on each side but "desk" leaves 50 mm (250 mm short).',
    );
    expect(ds[0]!.hints![2]).toContain("Or move the opening along its wall");
  });

  it("an authored piece id is the hint's handle", () => {
    const ds = of(pair(OPENING, "furniture id=dk desk at (4100,2200) size 800x1600 in r_study"), DB);
    expect(ds[0]!.hints![0]).toMatch(/^Move "dk" 250 mm clear/);
  });

  it("a counter across a cased opening is a servery hatch, not a blocker", () => {
    for (const w of ["counter", "worktop", "bar_counter"])
      expect(of(pair(OPENING, `furniture ${w} at (4350,1400) size 600x1200 in r_study`), DB), w).toEqual([]);
    expect(of(pair(OPENING, "furniture sideboard at (4350,1400) size 600x1200 in r_study"), DB)).toHaveLength(1);
  });

  it("a door's diagnostics come first, so an existing plan's door warnings keep their order", () => {
    const src = pair(
      `${OPENING}\n  door id=d2 at (5000,3500) width 700 wall w_mid`,
      "furniture desk at (4100,2200) size 800x1600 in r_study\n  furniture chest at (4600,3200) size 300x600 in r_study",
    );
    const ds = of(src, DB);
    expect(ds.map((d) => d.message.startsWith("Doorway is blocked"))).toEqual([true, false]);
  });
});

suite("W_DOORWAY_BLOCKED on an opening wider than a doorway (the ruling on PR #283)", () => {
  const wide = (width: number) => `opening id=o_study at (5000,2000) width ${width} wall w_mid`;

  it("an opening up to 1200 mm is judged as a door: any piece in its approach blocks it", () => {
    // Opening y 1400–2600; a chest over 100 mm of it still blocks a doorway-wide opening.
    expect(of(pair(wide(1200), "furniture chest at (4600,2500) size 300x600 in r_study"), DB)).toHaveLength(1);
  });

  it("wider, it is blocked only when the pieces leave under 1200 mm of it clear", () => {
    // Opening 1300, y 1350–2650. A chest over its last 100 mm leaves 1200 clear; over 150, 1150.
    expect(of(pair(wide(1300), "furniture chest at (4600,2550) size 300x600 in r_study"), DB)).toEqual([]);
    const ds = of(pair(wide(1300), "furniture chest at (4600,2500) size 300x600 in r_study"), DB);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toBe(
      'The opening between "Study" and "Entry" is blocked — "chest" in its 300 mm approach leaves 1150 mm of its 1300 mm clear, under the 1200 mm a doorway needs (50 mm short).',
    );
  });

  it("the stretch is read across every piece in the approach, on both sides of the wall", () => {
    // Opening 3000, y 500–3500. A desk over 2200–3500 leaves 1700 clear; a chest on the entry
    // side over 1000–1600 then leaves 600 (500–1000) and 600 (1600–2200).
    const desk = "furniture desk at (4100,2200) size 800x1600 in r_study";
    expect(of(pair(wide(3000), desk), DB)).toEqual([]);
    const ds = of(pair(wide(3000), `${desk}\n  furniture chest at (5100,1000) size 300x600 in r_entry`), DB);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toContain(
      '"desk" and 1 other piece in its 300 mm approach leave 600 mm of its 3000 mm clear',
    );
  });

  it("the full shared edge `open between` derives is judged the same way: an open-plan join stays open", () => {
    // examples/relational.arch: the dining table 300 mm in from the living/kitchen join, its
    // 800 mm depth well inside the 3850 mm edge's approach, leaves 1550 mm of it to walk through.
    const src = readFileSync(join(ROOT, "examples/relational.arch"), "utf8");
    expect(src).toContain('furniture dining_table in kitchen anchor left inset 300 size 1400x800 label "Table"');
    const { ir } = resolvePlan(src, {});
    const join_ = ir!.elements.find((e) => e.kind === "opening" && e.width > 1200) as ROpening;
    const furniture = ir!.elements.filter((e): e is RFurniture => e.kind === "furniture");
    const block = openingBlock(join_, DEFAULT_RULESET.doorwayLandingMm, furniture.map(rectOf));
    expect(block).toMatchObject({ stretch: 1550, blocked: false });
    expect(block!.inside.map((i) => furniture[i]!.label)).toEqual(["Table"]);
    expect(of(src, DB)).toEqual([]);
  });
});

suite("a `double` door is passed through one leaf (ADA 2010 404.2.3)", () => {
  const withEntry = (door: string) =>
    pair(OPENING, "").replace("door id=d_entry at (6500,4000) width 900 wall shell", door);
  const codes = (door: string, opts: Parameters<typeof lint>[1] = {}) =>
    lint(withEntry(door), opts)
      .map((d) => d.code)
      .filter((c) => c === "W_DOOR_CLEARANCE" || c === "W_PATH_TOO_NARROW");

  it("`double width 1000` raises what a 500 mm door raises: the leaf is judged", () => {
    const pairOf = codes("door id=d_entry double at (6500,4000) width 1000 wall shell swing in");
    const single = codes("door id=d_entry at (6500,4000) width 500 wall shell swing in");
    expect(pairOf).toEqual(single);
    expect(pairOf).toEqual(["W_DOOR_CLEARANCE", "W_PATH_TOO_NARROW"]);
    const ds = lint(withEntry("door id=d_entry double at (6500,4000) width 1000 wall shell swing in"));
    const dc = ds.find((d) => d.code === "W_DOOR_CLEARANCE")!;
    expect(dc.message).toBe(
      "Door is a double door whose leaves are each 500 mm wide (under the 700 mm minimum nominal width): a person passes through one leaf.",
    );
    expect(dc.hints![0]).toBe("Widen it to at least 1400 mm, two 700 mm leaves.");
    // The path remedy widens the pair so each leaf passes: twice the passable single width.
    const path = ds.find((d) => d.code === "W_PATH_TOO_NARROW")!;
    expect(path.hints!.join(" ")).toContain('Widen door "d_entry" to `width 1550`');
  });

  it("1400 mm: two 700 mm leaves pass the door minimum, not the path's; 1550 passes both", () => {
    const door = "door id=d_entry double at (6500,4000) width 1400 wall shell swing in";
    // A 700 mm leaf is 640 mm clear (the 60 mm leaf-and-stop allowance), under the 700 mm path.
    expect(codes(door)).toEqual(["W_PATH_TOO_NARROW"]);
    expect(codes(door.replace("width 1400", "width 1550"))).toEqual([]);
    expect(codes(door, { profile: "accessibility-advisory" })).toContain("W_DOOR_CLEARANCE");
    expect(codes(door.replace("width 1400", "width 2000"), { profile: "accessibility-advisory" })).toEqual([]);
  });

  it("`W_SWING_OVER_STAIR` reads both leaves: a 1400 mm pair over the corpus flight fires, once", () => {
    const src = readFileSync(join(ROOT, "test/defect-corpus/stair-safety/swing-over-stair.arch"), "utf8");
    const hinged = "door id=d_en_corr at (4900,2600) width 700 wall w_land hinge near start swing into r_landing";
    expect(src).toContain(hinged);
    // The pair spans x 4200–5600; its east leaf, hung at 5600, sweeps the stair's head at x 4900+.
    const pair = src.replace(
      hinged,
      "door id=d_en_corr double at (4900,2600) width 1400 wall w_land swing into r_landing",
    );
    const ds = of(pair, "W_SWING_OVER_STAIR");
    expect(ds).toHaveLength(1);
    // A pair has a leaf on each jamb: only the swing-side remedy is offered.
    expect(ds[0]!.hints![0]).toContain("to the other side of its wall");
    expect(ds[0]!.hints![0]).not.toContain("other jamb");
    // Swung the other way, both leaves open into the ensuite, off the stair.
    expect(of(pair.replace("swing into r_landing", "swing into r_en"), "W_SWING_OVER_STAIR")).toEqual([]);
  });

  it("describe() reads the clear width off one leaf, the nominal width off the pair", () => {
    const src = pair(OPENING, "").replace(
      "door id=d_entry at (6500,4000) width 900 wall shell",
      "door id=d_entry double at (6500,4000) width 1400 wall shell swing in",
    );
    const edge = (describePlan(src) as { access: { edges: AccessEdge[] } }).access.edges.find(
      (e) => e.doorId === "d_entry",
    )!;
    expect(edge).toMatchObject({ nominalWidth: 1400, estimatedClearWidth: 640 });
  });
});

suite("one datum for a doorway's approach: the wall's face (PS2.54)", () => {
  it("`doorLandingRect` reaches the depth past each FACE, the wall's body between", () => {
    const host = { a: { x: 5000, y: 0 }, b: { x: 5000, y: 4000 }, thickness: 100 };
    expect(doorLandingRect({ at: { x: 5000, y: 2000 }, width: 900, host }, 300)).toEqual({
      x: 4650,
      y: 1550,
      w: 700,
      h: 900,
    });
  });

  it("a piece 250 mm off a 100 mm partition's face fires (it sat on the edge from the centreline)", () => {
    const door = "door id=d_s at (5000,2000) width 900 wall w_mid";
    // Desk east side at x 4700: 250 mm off the face (4950), 300 off the centreline.
    const ds = of(pair(door, "furniture desk at (3900,1800) size 800x1600 in r_study"), DB);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toContain("leaves 250 mm (50 mm short)");
    expect(of(pair(door, "furniture desk at (3850,1800) size 800x1600 in r_study"), DB)).toEqual([]);
  });

  it("`W_LEAF_ACROSS_DOORWAY` and `W_DOORWAY_BLOCKED` now share the datum: A1's geometry", () => {
    // A 100 mm partition; a leaf parked 250 mm in front of a doorway's face is in its approach.
    // (W_LEAF_ACROSS_DOORWAY always read the face; the furniture rule reads the same zone now.)
    const ds = of(
      pair("door id=d_s at (5000,2000) width 900 wall w_mid", "furniture cabinet at (4600,1600) size 100x800"),
      DB,
    );
    expect(ds).toHaveLength(1);
  });
});

// ─── The first-contact audits' rows ──────────────────────────────────────────────────────

const PLANS = "docs/plans/plan-soundness/audits/first-contact-plans";
const worldAt = (dir: string): World => ({
  read: (p) => {
    try {
      return readFileSync(join(dir, p), "utf8");
    } catch {
      return null;
    }
  },
});
const codesOf = (path: string): string[] => {
  const file = join(ROOT, PLANS, path);
  return lint(readFileSync(file, "utf8"), { world: worldAt(dirname(file)) }).map((d) => d.code ?? "");
};

suite("the audits' rows each rule catches (the acceptance of PS2.11e, PS2.46)", () => {
  const ROWS: [string, string, string][] = [
    // A hob under a window (PS2.46).
    ["NA2 (its hob half)", "2026-10-24-rerun/1-apartment.arch", HU],
    ["NC8", "2026-10-24-rerun/4-cafe.arch", HU],
    ["RS3", "2026-10-25-rerun/3-studio.arch", HU],
    ["RC4 (its hob half)", "2026-10-25-rerun/4-cafe.arch", HU],
    ["OT6", "2026-10-26-rerun-armA/5-townhouse.arch", HU],
    ["CC4", "2026-10-26-rerun-armB/4-cafe.arch", HU],
    ["WH7 (its window half)", "2026-10-26-walls-first/2-house.arch", HU],
    // A hob beside a fridge (PS2.11e).
    ["NS2 (its hob half)", "2026-10-24-rerun/3-studio.arch", HF],
    ["NT7", "2026-10-24-rerun/5-townhouse.arch", HF],
    ["OH3 (its fridge half)", "2026-10-26-rerun-armA/2-house.arch", HF],
    ["WH7 (its fridge half)", "2026-10-26-walls-first/2-house.arch", HF],
    // Exactly 300 mm apart: inside the cited 305 mm (the figure was 300 until red-team round 1).
    ["WT5", "2026-10-26-walls-first/5-townhouse.arch", HF],
    // A piece in a leaf-less opening's approach (PS2.11e).
    ["T2", "5-townhouse.arch", DB],
    ["OS2", "2026-10-26-rerun-armA/3-studio.arch", DB],
    ["OT4 (its opening half)", "2026-10-26-rerun-armA/5-townhouse.arch", DB],
    // Door–door interference, still read from the face (PS2.54 kept the leaf rule's datum).
    ["A1", "1-apartment.arch", "W_LEAF_ACROSS_DOORWAY"],
    ["NH5", "2026-10-24-rerun/2-house.arch", "W_LEAF_ACROSS_DOORWAY"],
  ];
  it.each(ROWS)("%s (%s): %s", (_row, path, code) => {
    expect(codesOf(path)).toContain(code);
  });

  // The ruling on PR #283: an opening wider than a doorway is blocked only below 1200 mm clear.
  // NH2's sofa covers 950 mm of a 2400 mm join (1450 left) and CS3's fridge 325 mm of an 1800 mm
  // one (1475 left): each keeps a doorway's width, so neither is caught any more.
  it.each([
    ["NH2 (its opening half)", "2026-10-24-rerun/2-house.arch"],
    ["CS3 (its opening half)", "2026-10-26-rerun-armB/3-studio.arch"],
  ])("%s (%s): no longer W_DOORWAY_BLOCKED, a doorway's width stays clear", (_row, path) => {
    expect(codesOf(path)).not.toContain(DB);
  });
});
