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
import { type Diagnostic, lint, type World } from "../src/index.js";
import { doorLandingRect } from "../src/geometry/rect.js";

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
      "The stove in Kitchen stands 100 mm from the fridge beside it; a cooking surface needs 300 mm of worktop on each side before a tall unit (200 mm short).",
    );
    expect(ds[0]!.hints![0]).toContain("`hobLandingMm` is 300 mm");
    expect(ds[0]!.hints![0]).toContain("move one of them 200 mm further along the run");
  });

  it("abutting (0 mm) fires; 300 mm is clear; either side", () => {
    expect(of(run(2000, 2600), HF)).toHaveLength(1);
    expect(of(run(2000, 2900), HF)).toEqual([]);
    expect(of(run(2000, 2850), HF)).toHaveLength(1);
    expect(of(run(2000, 1100), HF)).toEqual([]);
    expect(of(run(2000, 1150), HF)).toHaveLength(1);
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
    // A piece in a leaf-less opening's approach (PS2.11e).
    ["T2", "5-townhouse.arch", DB],
    ["NH2 (its opening half)", "2026-10-24-rerun/2-house.arch", DB],
    ["OS2", "2026-10-26-rerun-armA/3-studio.arch", DB],
    ["OT4 (its opening half)", "2026-10-26-rerun-armA/5-townhouse.arch", DB],
    ["CS3 (its opening half)", "2026-10-26-rerun-armB/3-studio.arch", DB],
    // Door–door interference, still read from the face (PS2.54 kept the leaf rule's datum).
    ["A1", "1-apartment.arch", "W_LEAF_ACROSS_DOORWAY"],
    ["NH5", "2026-10-24-rerun/2-house.arch", "W_LEAF_ACROSS_DOORWAY"],
  ];
  it.each(ROWS)("%s (%s): %s", (_row, path, code) => {
    expect(codesOf(path)).toContain(code);
  });
});
