import { readdirSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { USE_KINDS } from "../src/ast.js";
import { describe as describePlan, finish, FURNISH_TABLE, lint } from "../src/index.js";
import { CATALOG_CATEGORIES } from "../src/fixtures-catalog.js";
import { DEFINING, definingItems, WASH_WITH, washItems } from "../src/lint/defining.js";
import type { World } from "../src/world.js";

/**
 * `W_HABITABLE_NO_WINDOW` (PS2.8) and `W_ROOM_MISSING_DEFINING` (PS2.9): each fires on the
 * defect, is silent on its fix, and stays out of the territory of the rule beside it
 * (`W_BEDROOM_NO_WINDOW`, `W_ROOM_NO_FIXTURE`). The defining pieces are a reading of
 * `FURNISH_TABLE`, and the guards below hold that reading to the table, never a retyped list.
 */

const codesOf = (src: string): string[] => lint(src).map((d) => d.code ?? "");
const only = (src: string, code: string) => lint(src).filter((d) => d.code === code);

/** Two rooms side by side; `{L}`/`{R}` are the rooms' trailing clauses, `{X}` extra statements. */
const PAIR = (left: string, right: string, extra = ""): string => `plan "Pair" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall id=w_mid partition thickness 100 { (4000,0) (4000,4000) }
  room id=r_a at (0,0) size 4000x4000 ${left}
  room id=r_b at (4000,0) size 4000x4000 ${right}
  door id=d_entry at (2000,4000) width 900 wall shell
  door id=d_mid at (4000,2000) width 800 wall w_mid
${extra}}
`;

describe("W_HABITABLE_NO_WINDOW", () => {
  const WIN_A = "  window at (2000,0) width 1500 wall shell\n";
  const WIN_B = "  window at (6000,0) width 1500 wall shell\n";

  for (const use of ["living", "dining", "kitchen"]) {
    it(`fires on a ${use} room with no window, and is silent once it has one`, () => {
      const bare = PAIR(`label "Room A" uses ${use}`, 'label "Store" uses storage', WIN_B);
      const ds = only(bare, "W_HABITABLE_NO_WINDOW");
      expect(ds).toHaveLength(1);
      expect(ds[0]!.message).toMatch(/^(Living room|Dining room|Kitchen) "Room A" \(16 m²\) has no window on any/);
      expect(ds[0]!.message).not.toContain("r_a");
      expect(ds[0]!.hints!.join(" ")).toContain("`shell`");
      expect(ds[0]!.hints!.join(" ")).toContain("`r_a`");
      expect(ds[0]!.fixes).toBeUndefined();
      expect(codesOf(PAIR(`label "Room A" uses ${use}`, 'label "Store" uses storage', WIN_A + WIN_B))).not.toContain(
        "W_HABITABLE_NO_WINDOW",
      );
    });
  }

  it('reads a label-only living room (no `uses`): "Living" classifies', () => {
    const src = PAIR('label "Living"', 'label "Bed" uses bedroom', WIN_B);
    expect(only(src, "W_HABITABLE_NO_WINDOW").map((d) => d.message)).toEqual([
      'Living room "Living" (16 m²) has no window on any of its walls; a room people live in needs daylight.',
    ]);
  });

  it("never reports a bedroom (that is W_BEDROOM_NO_WINDOW), even one that is also a living room", () => {
    const src = PAIR('label "Studio" uses bedroom living kitchen', 'label "Store" uses storage', WIN_B);
    const codes = codesOf(src);
    expect(codes).toContain("W_BEDROOM_NO_WINDOW");
    expect(codes).not.toContain("W_HABITABLE_NO_WINDOW");
  });

  it("never asks a bath, WC, hall, store or an unclassified room", () => {
    for (const clause of ['label "Bath" uses bath', 'label "WC" uses wc', 'label "Hall" uses hall', 'label "Room 1"']) {
      expect(codesOf(PAIR(clause, 'label "Store" uses storage', WIN_B)), clause).not.toContain("W_HABITABLE_NO_WINDOW");
    }
  });

  it("measures a polygon room on its own ring", () => {
    const L = (win: string) => `plan "L living" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) close }
  room id=r_l polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "Living" uses living
  door id=d at (1500,6000) width 900 wall shell
${win}}
`;
    expect(codesOf(L(""))).toContain("W_HABITABLE_NO_WINDOW");
    // On the inner corner's edge (x 3000, y 3000..6000): an edge the bounding box does not have.
    expect(codesOf(L("  window at (3000,4500) width 1200 wall shell\n"))).not.toContain("W_HABITABLE_NO_WINDOW");
  });

  it("reads a window on an arc edge of the room from the shape, and says nothing only where that fails (PS0.12)", () => {
    const BAY = (glazed: boolean, chordWall = false) => `plan "Bay" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (4800,0) (4800,6000) (4000,6000) arc (1400,6000) radius 2000 cw (0,6000) close }
${chordWall ? "  wall id=w_chord partition thickness 100 { (1400,6000) (4000,6000) }\n" : ""}  room id=r_living at (0,0) size 4800x6000 label "Living" uses living
  door id=d_garden at (700,6000) width 900 wall shell swing out
${glazed ? "  window id=win_bay on shell at 13000 width 1200\n" : ""}}
`;
    // The bay's window is on the arc: the probe through the chord gives it to the living room,
    // which is lit.
    const glazed = BAY(true);
    const facts = describePlan(glazed) as { windows: { id: string; room: string | null }[] };
    expect(facts.windows).toEqual([expect.objectContaining({ id: "win_bay", room: "r_living" })]);
    expect(codesOf(glazed)).not.toContain("W_HABITABLE_NO_WINDOW");
    expect(codesOf(BAY(false))).toContain("W_HABITABLE_NO_WINDOW");
    // A wall on the chord closes the bay off: describe gives the window to no room, so whether
    // the living room is lit is unknown and the rule still says nothing (attribution unknown).
    const walled = BAY(true, true);
    const walledFacts = describePlan(walled) as { windows: { id: string; room: string | null }[] };
    expect(walledFacts.windows).toEqual([expect.objectContaining({ id: "win_bay", room: null })]);
    expect(codesOf(walled)).not.toContain("W_HABITABLE_NO_WINDOW");
    expect(codesOf(BAY(false, true))).toContain("W_HABITABLE_NO_WINDOW");
  });

  it("names only an outside face: an exterior wall shared with an attached wing is not one", () => {
    const src = `plan "Wing" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
  wall id=w_wing exterior thickness 200 { (0,0) (-3000,0) (-3000,4000) (0,4000) }
  room id=r_l at (0,0) size 4000x4000 label "Living" uses living
  room id=r_g at (-3000,0) size 3000x4000 label "Garage" uses garage
  door id=d at (2000,4000) width 900 wall shell
  door id=d2 at (0,2000) width 900 wall shell
  window at (-1500,0) width 1200 wall w_wing
}
`;
    const [d] = only(src, "W_HABITABLE_NO_WINDOW");
    expect(d!.hints![0]).toBe("Add a `window` on wall `shell`, which runs along this room's (`r_l`) outside edge.");
  });

  it("names no wall the source cannot name: a generated wall id stays out of the hint", () => {
    const src = `plan "Anon" {
  units mm
  wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
  room id=r_l at (0,0) size 4000x4000 label "Living" uses living
  door id=d at (2000,4000) width 900 wall exterior
}
`;
    const [d] = only(src, "W_HABITABLE_NO_WINDOW");
    expect(d!.hints![0]).toBe(
      "Add a `window` on the `exterior` wall that runs along this room's (`r_l`) outside edge.",
    );
  });

  it("reads the window fact describe reads: a room describe gives a window is never reported", () => {
    const worldFor = (dir: string): World => ({
      read: (p) => {
        try {
          return readFileSync(resolvePath(dir, p), "utf8");
        } catch {
          return null;
        }
      },
    });
    let checked = 0;
    for (const dir of ["examples", "test/fixtures", "test/defect-corpus/daylight"]) {
      const abs = resolvePath(dir);
      for (const f of readdirSync(abs).filter((n) => n.endsWith(".arch"))) {
        const src = readFileSync(join(abs, f), "utf8");
        const world = worldFor(abs);
        type Storey = { windows?: { room: string | null }[]; rooms?: { id: string; label?: string }[] };
        const facts = describePlan(src, { world }) as Storey & { levels?: Storey[] };
        const lit = new Set((facts.levels ?? [facts]).flatMap((s) => (s.windows ?? []).map((w) => w.room)));
        const labelled = new Map(
          (facts.levels ?? [facts]).flatMap((s) => (s.rooms ?? []).map((r) => [r.label ?? r.id, r.id])),
        );
        for (const d of lint(src, { world }).filter((x) => x.code === "W_HABITABLE_NO_WINDOW")) {
          const label = /"([^"]+)"/.exec(d.message)![1]!;
          expect(lit.has(labelled.get(label) ?? label), `${dir}/${f}: ${d.message}`).toBe(false);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("W_ROOM_MISSING_DEFINING", () => {
  const BED = 'label "Bedroom 2" uses bedroom';
  const LIVING = 'label "Living" uses living';
  const WINS = "  window at (2000,0) width 1500 wall shell\n  window at (6000,0) width 1500 wall shell\n";

  it("fires on a furnished bedroom with no bed, naming what it holds; the id is in the hints only", () => {
    const src = PAIR(
      LIVING,
      BED,
      `${WINS}  furniture wardrobe in r_b anchor top-right flush size 1800x600\n  furniture desk in r_b anchor bottom-right flush size 1200x600\n`,
    );
    const ds = only(src, "W_ROOM_MISSING_DEFINING");
    expect(ds.map((d) => d.message)).toEqual([
      '"Bedroom 2" is furnished (wardrobe, desk) but has no bed: the piece that makes it a bedroom.',
    ]);
    expect(ds[0]!.hints!.some((h) => h.includes("in r_b"))).toBe(true);
    expect(ds[0]!.fixes).toBeUndefined();
  });

  it("is silent once the bed is there, and a `double_bed` is a bed (the catalogue's `serves`)", () => {
    for (const bed of ["bed", "double_bed"]) {
      const src = PAIR(
        LIVING,
        BED,
        `${WINS}  furniture wardrobe in r_b anchor top-right flush size 1800x600\n  furniture ${bed} in r_b anchor bottom flush size 1500x2000\n`,
      );
      expect(codesOf(src), bed).not.toContain("W_ROOM_MISSING_DEFINING");
    }
  });

  it("never reports an empty room: an empty bath or kitchen is W_ROOM_NO_FIXTURE's", () => {
    for (const clause of [
      BED,
      'label "Bath" uses bath',
      'label "Kitchen" uses kitchen',
      'label "Dining" uses dining',
    ]) {
      expect(codesOf(PAIR(LIVING, clause, WINS)), clause).not.toContain("W_ROOM_MISSING_DEFINING");
    }
    // A kitchen holding only a table is furnished, but it has no kitchen fixture at all: one
    // report, W_ROOM_NO_FIXTURE's, not two.
    const kit = PAIR(
      LIVING,
      'label "Kitchen" uses kitchen',
      `${WINS}  furniture table in r_b centered size 1200x800\n`,
    );
    expect(codesOf(kit)).toContain("W_ROOM_NO_FIXTURE");
    expect(codesOf(kit)).not.toContain("W_ROOM_MISSING_DEFINING");
  });

  it("asks a bath for a bathtub or shower only, and a WC for a WC only", () => {
    const bath = (pieces: string) =>
      PAIR(
        LIVING,
        'label "Bath" uses bath',
        `${WINS}${pieces
          .split(",")
          .map(
            (p) =>
              `  furniture ${p} against wall shell segment 1 offset ${1000 + 1200 * pieces.split(",").indexOf(p)} in r_b\n`,
          )
          .join("")}`,
      );
    expect(only(bath("wc,basin"), "W_ROOM_MISSING_DEFINING").map((d) => d.message)).toEqual([
      '"Bath" is furnished (wc, basin) but has no bathtub or shower: the piece that makes it a bathroom.',
    ]);
    // A shower room with no WC is a shower room, not a defect.
    expect(codesOf(bath("shower,basin"))).not.toContain("W_ROOM_MISSING_DEFINING");
    const wc = (pieces: string) =>
      PAIR(
        LIVING,
        'label "WC" uses wc',
        `${WINS}  furniture ${pieces} against wall shell segment 1 offset 1000 in r_b\n`,
      );
    expect(codesOf(wc("wc"))).not.toContain("W_ROOM_MISSING_DEFINING");
    expect(only(wc("basin"), "W_ROOM_MISSING_DEFINING").map((d) => d.message)).toEqual([
      '"WC" is furnished (basin) but has no wc: the piece that makes it a WC.',
    ]);
  });

  it("asks a bath that holds a WC for a basin too (PS2.66), in the room or through a door, never from a kitchen", () => {
    const WASH =
      "a room with a WC needs one to wash hands at, in the room or in one a door joins it to (not a kitchen)";
    const at = (pieces: [string, number][], room = "r_b") =>
      pieces.map(([p, off]) => `  furniture ${p} against wall shell segment 1 offset ${off} in ${room}\n`).join("");
    const bath = (pieces: [string, number][], left = LIVING, extra = "") =>
      PAIR(left, 'label "Bathroom" uses bath', `${WINS}${at(pieces)}${extra}`);
    const ds = only(
      bath([
        ["bathtub", 300],
        ["wc", 2600],
      ]),
      "W_ROOM_MISSING_DEFINING",
    );
    expect(ds.map((d) => d.message)).toEqual([`"Bathroom" is furnished (bathtub, wc) but has no basin: ${WASH}.`]);
    expect(ds[0]!.hints![0]).toContain("furniture basin in r_b");
    expect(ds[0]!.hints![1]).toContain("If `r_b` is not a bathroom");
    // The clean twin: the basin in the room.
    expect(
      codesOf(
        bath([
          ["bathtub", 300],
          ["wc", 2600],
          ["basin", 3300],
        ]),
      ),
    ).not.toContain("W_ROOM_MISSING_DEFINING");
    // A bath holding only its WC lacks both: the defining piece is reported first, its message as before
    // PS2.66; the basin is asked once the bath is defined.
    expect(only(bath([["wc", 1000]]), "W_ROOM_MISSING_DEFINING").map((d) => d.message)).toEqual([
      '"Bathroom" is furnished (wc) but has no bathtub or shower: the piece that makes it a bathroom.',
    ]);
    // Approved Document G: a basin in a room giving direct access to the WC counts...
    const basinNextDoor = "  furniture basin against wall shell segment 3 offset 1000 in r_a\n";
    const dressing = 'label "Dressing" uses storage';
    expect(
      codesOf(
        bath(
          [
            ["bathtub", 300],
            ["wc", 2600],
          ],
          dressing,
          basinNextDoor,
        ),
      ),
    ).not.toContain("W_ROOM_MISSING_DEFINING");
    // ... but not through a wall with no door or opening in it, and never from a kitchen.
    const walled = bath(
      [
        ["bathtub", 300],
        ["wc", 2600],
      ],
      dressing,
      basinNextDoor,
    ).replace(/ {2}door id=d_mid[^\n]*\n/, "");
    expect(only(walled, "W_ROOM_MISSING_DEFINING").map((d) => d.message)).toEqual([
      `"Bathroom" is furnished (bathtub, wc) but has no basin: ${WASH}.`,
    ]);
    const kitchen = bath(
      [
        ["bathtub", 300],
        ["wc", 2600],
      ],
      'label "Kitchen" uses kitchen',
      basinNextDoor,
    );
    expect(only(kitchen, "W_ROOM_MISSING_DEFINING").map((d) => d.message)).toContain(
      `"Bathroom" is furnished (bathtub, wc) but has no basin: ${WASH}.`,
    );
    // A WC room is defined by its WC alone, basin or not.
    expect(codesOf(PAIR(LIVING, 'label "WC" uses wc', `${WINS}${at([["wc", 1000]])}`))).not.toContain(
      "W_ROOM_MISSING_DEFINING",
    );
  });

  it("guard: WASH_WITH names items of the use's furnish row", () => {
    for (const [u, spec] of Object.entries(WASH_WITH)) {
      const row = FURNISH_TABLE[u as keyof typeof FURNISH_TABLE]!;
      for (const c of [spec!.held, spec!.needs])
        expect(
          row.some((i) => i.category === c),
          `${u}: ${c}`,
        ).toBe(true);
      expect(washItems(u as keyof typeof FURNISH_TABLE), u).toBeDefined();
    }
    expect(Object.keys(WASH_WITH)).toEqual(["bath"]);
  });

  it("asks a kitchen for its sink, its hob and its worktop; a `hob` is a stove, a `worktop` a counter, a bare `sink` a kitchen sink", () => {
    const kit = (pieces: string[]) =>
      PAIR(
        LIVING,
        'label "Kitchen" uses kitchen',
        `${WINS}${pieces.map((p, i) => `  furniture ${p} against wall shell segment 1 offset ${800 + 900 * i} in r_b\n`).join("")}`,
      );
    expect(only(kit(["fridge"]), "W_ROOM_MISSING_DEFINING").map((d) => d.message)).toEqual([
      '"Kitchen" is furnished (fridge) but has no kitchen sink, no stove and no counter or worktop: the pieces that make it a kitchen.',
    ]);
    expect(codesOf(kit(["sink", "hob", "fridge"]))).toContain("W_ROOM_MISSING_DEFINING");
    expect(codesOf(kit(["sink", "hob", "worktop", "fridge"]))).not.toContain("W_ROOM_MISSING_DEFINING");
  });

  it("does not check a living room (no one piece defines it)", () => {
    const src = PAIR(LIVING, 'label "Snug" uses living', `${WINS}  furniture armchair in r_b centered size 900x850\n`);
    expect(codesOf(src)).not.toContain("W_ROOM_MISSING_DEFINING");
  });

  it("reads a label-only dining room, and an unclassified room is skipped", () => {
    const sofa = "  furniture sofa in r_b anchor bottom flush size 2000x900\n";
    expect(only(PAIR(LIVING, 'label "Dining"', WINS + sofa), "W_ROOM_MISSING_DEFINING").map((d) => d.message)).toEqual([
      '"Dining" is furnished (sofa) but has no dining table: the piece that makes it a dining room.',
    ]);
    expect(codesOf(PAIR(LIVING, 'label "Room 2"', WINS + sofa))).not.toContain("W_ROOM_MISSING_DEFINING");
  });

  it("reads containment off a polygon room's ring: a bed in the notch of an L is not the L's", () => {
    const L = (bedAt: string) => `plan "L bedroom" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  wall id=w_l partition thickness 100 { (3000,3000) (6000,3000) }
  wall id=w_l2 partition thickness 100 { (3000,3000) (3000,6000) }
  room id=r_l polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "Bedroom" uses bedroom
  room id=r_n at (3000,3000) size 3000x3000 label "Store" uses storage
  door id=d at (1500,6000) width 900 wall shell
  door id=d2 at (4500,3000) width 800 wall w_l
  window at (1500,0) width 1200 wall shell
  furniture wardrobe at (300,300) size 1800x600
  furniture bed at ${bedAt} size 1500x2000
}
`;
    // Centre (4500, 4500): inside the L's bounding box, outside its floor.
    expect(codesOf(L("(3750,3500)"))).toContain("W_ROOM_MISSING_DEFINING");
    expect(codesOf(L("(750,3500)"))).not.toContain("W_ROOM_MISSING_DEFINING");
  });

  it("the statements its hint quotes, applied together, clear it and raise nothing new (both profiles)", () => {
    const dir = resolvePath("test/defect-corpus/missing-defining-contents");
    const cases = readdirSync(dir).filter((f) => f.endsWith(".arch") && !f.endsWith(".clean.arch"));
    let applied = 0;
    for (const f of cases) {
      const src = readFileSync(join(dir, f), "utf8");
      for (const profile of [undefined, "accessibility-advisory"] as const) {
        const o = profile ? { profile } : {};
        const all = (s: string) => {
          const m = new Map<string, number>();
          for (const d of lint(s, o)) m.set(d.code ?? "", (m.get(d.code ?? "") ?? 0) + 1);
          return m;
        };
        const [d] = lint(src, o).filter((x) => x.code === "W_ROOM_MISSING_DEFINING");
        if (d === undefined) continue; // the todo case (no worktop) does not fire yet
        const stmts = [...d.hints![0]!.matchAll(/`(furniture [^`]+)`/g)].map((m) => m[1]!);
        expect(stmts.length, `${f}: ${d.hints![0]}`).toBeGreaterThan(0);
        const fixed = stmts.reduce((s, q) => s.replace(/\}\s*$/, `  ${q}\n}\n`), src);
        const before = all(src);
        const gained = [...all(fixed)].filter(([c, n]) => n > (before.get(c) ?? 0)).map(([c]) => c);
        expect(
          lint(fixed, o).filter((x) => x.code === "W_ROOM_MISSING_DEFINING"),
          f,
        ).toEqual([]);
        expect(gained, `${f} (${profile ?? "default"})`).toEqual([]);
        applied++;
      }
    }
    // Every `done` case of the folder fires and is cleared, under both profiles: read from the
    // headers, so a case added to the folder is counted without retyping a number here.
    const done = cases.filter((f) => /^# status: done$/m.test(readFileSync(join(dir, f), "utf8"))).length;
    expect(done).toBeGreaterThanOrEqual(3);
    expect(applied).toBe(done * 2);
  });

  it("guard: every use whose furnish row marks a piece required has a reading here", () => {
    const rowed = USE_KINDS.filter((u) => (FURNISH_TABLE[u] ?? []).some((i) => i.required));
    expect(rowed.length).toBeGreaterThan(0);
    for (const u of rowed) expect(DEFINING[u], u).toBeDefined();
    // ... and no reading names a use the table has no row for.
    for (const u of Object.keys(DEFINING)) expect(FURNISH_TABLE[u as keyof typeof FURNISH_TABLE], u).toBeDefined();
  });

  it("guard: every pick names an item of its row, and every defining word is a catalogue word", () => {
    for (const [u, spec] of Object.entries(DEFINING)) {
      const row = FURNISH_TABLE[u as keyof typeof FURNISH_TABLE]!;
      if (typeof spec === "object" && "pick" in spec) {
        for (const c of spec.pick)
          expect(
            row.some((i) => i.category === c),
            `${u}: ${c}`,
          ).toBe(true);
      }
      for (const i of definingItems(u as keyof typeof FURNISH_TABLE)) {
        expect(row, u).toContain(i); // the row's own item, so a room holding its full row holds it
        for (const w of [i.category, ...(i.or ?? [])]) expect(CATALOG_CATEGORIES, w).toContain(w);
      }
    }
    // The readings the doc comment states, so a table edit that changes them is seen.
    const words = (u: keyof typeof FURNISH_TABLE) => definingItems(u).map((i) => [i.category, ...(i.or ?? [])]);
    expect(words("bedroom")).toEqual([["bed"]]);
    expect(words("dining")).toEqual([["dining_table"]]);
    expect(words("kitchen")).toEqual([["kitchen_sink"], ["stove"], ["counter", "worktop"]]);
    expect(words("bath")).toEqual([["bathtub", "shower"]]);
    expect(words("wc")).toEqual([["wc"]]);
    expect(definingItems("living")).toEqual([]);
    expect(definingItems("office")).toEqual([]);
  });

  it("finish never writes a room this rule reports: an empty flat furnished by `finish` lints without it", () => {
    const FLAT = `plan "Flat" {
  units mm
  grid 50
  wall id=w_ext exterior thickness 200 { (0,0) (11000,0) (11000,5000) (0,5000) close }
  wall id=w_mid partition thickness 100 { (0,3600) (11000,3600) }
  wall id=w_bb partition thickness 100 { (4200,0) (4200,3600) }
  wall id=w_bk partition thickness 100 { (7000,0) (7000,3600) }
  room id=r_bed at (0,0) size 4200x3600 label "Bedroom" uses bedroom
  room id=r_bath at (4200,0) size 2800x3600 label "Bathroom" uses bath
  room id=r_kit at (7000,0) size 4000x3600 label "Kitchen" uses kitchen dining
  room id=r_hall at (0,3600) size 11000x1400 label "Hall" uses hall
  door id=d_bed on w_mid at 3400 width 900 swing into r_bed
  door id=d_bath on w_mid at 6200 width 800 swing into r_bath
  door id=d_kit on w_mid at 9000 width 900 swing into r_kit
  door id=d_front on w_ext at 62% width 1000 swing in
  window id=win_bed on w_ext at 2100 width 1600
  window id=win_kit on w_ext at 9000 width 1600
}
`;
    const r = finish(FLAT, { only: "furnish" });
    expect([...new Set(r.changes.map((c) => c.room))].sort()).toEqual(["r_bath", "r_bed", "r_kit"]);
    expect(codesOf(r.source)).not.toContain("W_ROOM_MISSING_DEFINING");
  });

  it("a bath too small to furnish is left empty by `finish` and reported by W_ROOM_NO_FIXTURE, not this code", () => {
    // 1.5 x 1.2 m: not even its WC has a position, so the stage leaves it empty (as it always
    // did) and the lint reports the empty room. The case where the WC and basin fit and only the
    // bathtub or shower does not is the review probe `fz-bath-1800x4200` below.
    const TINY = `plan "Tiny bath" {
  units mm
  grid 50
  wall id=w_ext exterior thickness 200 { (0,0) (5500,0) (5500,3000) (0,3000) close }
  wall id=w_v partition thickness 100 { (1500,0) (1500,1200) }
  wall id=w_h partition thickness 100 { (0,1200) (1500,1200) }
  room id=r_bath at (0,0) size 1500x1200 label "Bath" uses bath
  room id=r_hall at (0,1200) size 5500x1800 label "Hall" uses hall
  room id=r_rest at (1500,0) size 4000x1200 label "Store" uses storage
  door id=d_bath on w_h at 1050 width 700 swing out
  door id=d_rest on w_v at 600 width 700
  door id=d_front on w_ext at 50% width 1000 swing in
}
`;
    const r = finish(TINY, { only: "furnish" });
    expect(r.changes.filter((c) => c.room === "r_bath")).toEqual([]);
    expect(r.unresolved.some((u) => u.room === "r_bath")).toBe(true);
    const ds = lint(r.source).filter((d) => d.code === "W_ROOM_NO_FIXTURE" || d.code === "W_ROOM_MISSING_DEFINING");
    expect(ds.map((d) => d.code)).toEqual(["W_ROOM_NO_FIXTURE"]);
  });
});

/**
 * The adversarial review's probes (PR #200): the never-worse gate counted
 * W_ROOM_MISSING_DEFINING, so the piece-by-piece fallback refused a kitchen's lone sink and a
 * bath's lone WC and emptied rooms `finish` used to furnish. The gate now judges a use on its
 * finished pieces; these pin what `finish --only furnish` writes, as `main` wrote it before
 * the rule existed (`kd-regress`, the two kitchens) or, for a bath whose bathtub and shower have
 * no position beside its WC and basin, an empty room that says why.
 */
describe("finish with the room-contents rule: the review's probes", () => {
  const plan = (W: number, H: number, uses: string, door: string, extra: string): string => `plan "F" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (${W},0) (${W},${H + 3000}) (0,${H + 3000}) close }
  wall id=w_mid partition thickness 100 { (0,${H}) (${W},${H}) }
  room id=r_x at (0,0) size ${W}x${H} label "X" uses ${uses}
  room id=r_h at (0,${H}) size ${W}x3000 label "Hall" uses hall
  door id=d_in at (${W / 2},${H + 3000}) width 900 wall shell
  ${door}
${extra}}
`;
  const words = (src: string): string[] =>
    finish(src, { only: "furnish" })
      .changes.filter((c) => c.room === "r_x")
      .map((c) => c.text.split(" ")[1]!);

  it("kd-regress: a kitchen-diner whose table has no position keeps its kitchen run", () => {
    const src = `plan "F" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (2450,0) (2450,6600) (0,6600) close }
  wall id=w_mid partition thickness 100 { (0,3600) (2450,3600) }
  room id=r_x at (0,0) size 2450x3600 label "Kitchen / Dining" uses kitchen dining
  room id=r_h at (0,3600) size 2450x3000 label "Hall" uses hall
  door id=d_in at (1225,6600) width 900 wall shell
  door id=d_x at (1150,3600) width 800 wall w_mid swing out
  window at (1250,0) width 900 wall shell
}
`;
    expect(words(src)).toEqual(["kitchen_sink", "stove", "counter", "fridge"]);
    // The dining use is left out and says so; the lint then reports the room's missing table.
    const r = finish(src, { only: "furnish" });
    expect(r.unresolved.map((u) => u.reason)).toEqual([
      'the dining pieces were left out of "r_x" — no position for the required `dining_table` in "r_x" clears its walls, its doors and the pieces before it',
    ]);
    expect(lint(r.source).map((d) => d.code)).toContain("W_ROOM_MISSING_DEFINING");
  });

  it("fz-kitchen-1650x2600 and fz-kitchen-4000x2550: the sink, the stove and the worktop are written", () => {
    expect(
      words(
        plan(
          1650,
          2600,
          "kitchen",
          "door id=d_x at (1050,2600) width 800 wall w_mid swing in",
          "  window at (450,0) width 900 wall shell\n  window at (0,1850) width 600 wall shell\n",
        ),
      ),
    ).toEqual(["kitchen_sink", "stove", "counter"]);
    expect(
      words(
        plan(
          4000,
          2550,
          "kitchen",
          "door id=d_x at (3450,2550) width 800 wall w_mid swing in",
          "  window at (2600,0) width 900 wall shell\n  window at (0,800) width 600 wall shell\n",
        ),
      ),
    ).toEqual(["kitchen_sink", "stove", "counter", "fridge"]);
  });

  it("fz-bath-1800x4200: the stage's own candidates have no bathtub position, the lint's search has one", () => {
    // The stage tries a bathtub along the run it already placed (WC, basin on the east wall)
    // and at corners and wall middles; the west wall's middle carries the window, where it never
    // stands a tall piece. The lint's placement search (the statement the W_ROOM_MISSING_DEFINING
    // hint quotes) finds the west wall for a bathtub, and the gate accepts it. `main` wrote the
    // WC and basin alone.
    const src = plan(
      1800,
      4200,
      "bath",
      "door id=d_x at (800,4200) width 800 wall w_mid swing in",
      "  window at (0,1950) width 600 wall shell\n",
    );
    expect(words(src)).toEqual(["wc", "basin", "bathtub"]);
    const r = finish(src, { only: "furnish" });
    expect(r.changes.at(-1)!.text).toBe("furniture bathtub in r_x anchor left flush size 700x1700");
    expect(r.unresolved).toEqual([]);
    expect(lint(r.source).map((d) => d.code)).not.toContain("W_ROOM_MISSING_DEFINING");
  });

  it("fuzz counterexample: a bath whose bathtub positions the gate refuses is left empty, never written without one", () => {
    // `test/fuzz.test.ts` (finish is never worse) shrank to this: the stage HAD bathtub
    // candidates in the 2 x 2 m bath, the gate refused them, and writing the WC and basin alone
    // raised W_ROOM_MISSING_DEFINING. A use is now never written without its defining piece.
    const src = `plan "P" {
  units mm
  wall id=w_shell exterior thickness 100 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall id=w_v1 partition thickness 80 { (2000,0) (2000,4000) }
  wall id=w_v2 partition thickness 80 { (4000,0) (4000,4000) }
  wall id=w_h1 partition thickness 80 { (0,2000) (6000,2000) }
  room id=r0 at (0,0) size 2000x2000
  room id=r1 at (2000,0) size 2000x2000 uses bath
  room id=r2 at (4000,0) size 2000x2000
  room id=r3 at (0,2000) size 2000x2000
  room id=r4 at (2000,2000) size 2000x2000
  room id=r5 at (4000,2000) size 2000x2000
  door id=o0 hinged on w_shell at 5% width 700
  door id=o1 hinged on w_v2 at 5% width 700 swing out
  door id=o2 hinged on w_v1 at 5% width 700
  opening id=o3 on w_h1 at 67% width 700
}
`;
    const codes = (s: string) => new Set(lint(s).map((d) => d.code));
    const r = finish(src);
    expect(r.changes.filter((c) => c.room === "r1")).toEqual([]);
    const before = codes(src);
    expect([...codes(r.source)].filter((c) => !before.has(c))).toEqual([]);
  });

  it("the review's bath with no bathtub or shower beside its first WC is furnished as a set (PS2.45)", () => {
    // From the review's fuzz corpus A: 1.95 x 2.25 m, its door swinging out. `main` once wrote a
    // WC and a basin; then neither the stage's candidates nor the lint's search placed a bathtub
    // or shower beside them without a new code, and the room was left empty. The set search
    // (`wetSet`, `src/furnish.ts`) stands the pan elsewhere and fits all three.
    const src = plan(1950, 2250, "bath", "door id=d_x at (1400,2250) width 800 wall w_mid swing out", "");
    const r = finish(src, { only: "furnish" });
    expect(r.unresolved).toEqual([]);
    expect(r.changes.map((c) => c.text)).toEqual([
      "furniture wc against wall shell segment 3 offset 3500 side left in r_x",
      "furniture basin against wall shell segment 0 offset 400 side left in r_x",
      "furniture shower against wall shell segment 1 offset 550 side left in r_x",
    ]);
    // Never worse, counted: no code more often than before, under the default ruleset and the
    // universal profile the stage's law also holds under.
    const counts = (s: string, profile?: string): Map<string, number> => {
      const m = new Map<string, number>();
      for (const d of lint(s, profile ? { profile } : {})) m.set(d.code ?? "", (m.get(d.code ?? "") ?? 0) + 1);
      return m;
    };
    for (const profile of [undefined, "accessibility-advisory"]) {
      const was = counts(src, profile);
      const gained = [...counts(r.source, profile)].filter(([c, n]) => n > (was.get(c) ?? 0)).map(([c]) => c);
      expect(gained, profile ?? "default").toEqual([]);
    }
  });

  it("a bath where no search finds a bathtub or shower position is left empty, and the note says so", () => {
    // 1.15 x 2.3 m clear, its door in the middle of an end wall swinging out: no set the stage
    // tries keeps the floor in front of the pan and the door's approach clear (PS2.45's sweep).
    // (At 2.5 m clear, the room this probe first held, a set fits since PS2.54 measures the
    // door's approach from the wall's face: the basin then abuts that deeper approach.)
    const src = `plan "F" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (1350,0) (1350,2500) (0,2500) close }
  room id=r_x at (0,0) size 1350x2500 label "X" uses bath
  door id=d on w at 675 width 800 swing out
}
`;
    expect(words(src)).toEqual([]);
    const r = finish(src, { only: "furnish" });
    expect(r.unresolved.map((u) => u.reason)).toEqual([
      '"r_x" was left empty — furnish found no position for its `bathtub` or `shower`, the piece that defines a bathroom (`W_ROOM_MISSING_DEFINING`)',
    ]);
    expect(lint(r.source).map((d) => d.code)).toContain("W_ROOM_NO_FIXTURE");
  });
});

describe("PS2.17: a kitchen's worktop, written by finish", () => {
  /** A fuzz kitchen (the PS2.9 comparison's corpora) of the given size. */
  const kitchen = (w: number, h: number, extra: string): string => `plan "F" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (${w},0) (${w},${h + 3000}) (0,${h + 3000}) close }
  wall id=w_mid partition thickness 100 { (0,${h}) (${w},${h}) }
  room id=r_x at (0,0) size ${w}x${h} label "X" uses kitchen
  room id=r_h at (0,${h}) size ${w}x3000 label "Hall" uses hall
  door id=d_in at (${w / 2},${h + 3000}) width 900 wall shell
${extra}}
`;
  const written = (src: string): string[] =>
    finish(src, { only: "furnish" })
      .changes.filter((c) => c.room === "r_x")
      .map((c) => c.text);
  const codes = (src: string): string[] => lint(finish(src, { only: "furnish" }).source).map((d) => d.code!);

  it("stands the worktop in the run, beside the hob", () => {
    const src = kitchen(
      4200,
      3550,
      "  door id=d_x at (2850,3550) width 800 wall w_mid swing out\n  window at (1400,0) width 1200 wall shell\n",
    );
    expect(written(src)).toEqual([
      "furniture kitchen_sink against wall shell segment 1 offset 500 side left in r_x",
      "furniture stove against wall shell segment 1 offset 1200 side left in r_x",
      "furniture counter against wall shell segment 1 offset 1800 side left in r_x",
      "furniture fridge against wall shell segment 1 offset 2400 side left in r_x",
    ]);
    expect(codes(src)).not.toContain("W_ROOM_MISSING_DEFINING");
  });

  it("spills it to another wall when the run has no room, the sink and hob placed as before", () => {
    const src = kitchen(
      2650,
      2900,
      "  door id=d_x at (2200,2900) width 800 wall w_mid swing in\n  window at (1500,0) width 1200 wall shell\n",
    );
    const t = written(src);
    expect(t.slice(0, 2)).toEqual([
      "furniture kitchen_sink against wall shell segment 1 offset 1475 side left in r_x",
      "furniture stove against wall shell segment 1 offset 775 side left in r_x",
    ]);
    expect(t[2]).toMatch(/^furniture counter against wall shell segment 3 /);
    expect(codes(src)).not.toContain("W_ROOM_MISSING_DEFINING");
  });

  it("falls back to a 400 mm module, written with its size", () => {
    const src = kitchen(
      1700,
      2500,
      "  door id=d_x at (1000,2500) width 800 wall w_mid swing in\n  window at (450,0) width 1200 wall shell\n" +
        "  window at (0,1800) width 600 wall shell\n  door id=d_y at (1700,800) width 800 wall shell swing in\n",
    );
    expect(written(src)).toContain(
      "furniture counter against wall shell segment 3 offset 3800 side left size 400x600 in r_x",
    );
    expect(codes(src)).not.toContain("W_ROOM_MISSING_DEFINING");
  });

  it("the empty-kitchen hint tries the 400 mm worktop too, as finish does, so it still quotes statements", () => {
    // Review round 1: the hint tried the 600 mm module alone and told this kitchen to "make
    // room first", where main had quoted a sink and a stove.
    const src = readFileSync(resolvePath(__dirname, "../eval/fidelity-plans/min-bedroom-flat.faithful.arch"), "utf8");
    const [d] = lint(src).filter((x) => x.code === "W_ROOM_NO_FIXTURE" && x.message.startsWith("Kitchen"));
    expect(d!.hints![0]).not.toContain("does not fit");
    expect(d!.hints![0]).toContain("`furniture counter in r_live anchor top-left flush size 400x600`");
  });

  it("a 400 mm worktop quoted in a corner says its rotation, so pasting the hint raises nothing", () => {
    // Review round 2: the resolver reads a `counter` as the catalogue's square piece, so in a
    // corner with two walls it derives no rotation, and the pasted 400 x 600 worktop stood with
    // its back to the room (W_FIXTURE_BACK_TO_ROOM).
    const src = `plan "F" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,4450) (0,4450) close }
  wall id=w_mid partition thickness 100 { (0,1450) (4000,1450) }
  room id=r_x at (0,0) size 4000x1450 label "X" uses living kitchen
  room id=r_h at (0,1450) size 4000x3000 label "Hall" uses hall
  door id=d_in at (2000,4450) width 900 wall shell
  door id=d_x at (2150,1450) width 800 wall w_mid swing out
  window at (2800,0) width 900 wall shell
}
`;
    const [d] = lint(src).filter((x) => x.code === "W_ROOM_NO_FIXTURE");
    const stmts = [...d!.hints![0]!.matchAll(/`(furniture [^`]+)`/g)].map((m) => m[1]!);
    expect(stmts).toContain("furniture counter in r_x anchor bottom-left flush size 400x600 rotate 180");
    const pasted = src.replace(/\n}\s*$/, `\n${stmts.map((s) => `  ${s}`).join("\n")}\n}\n`);
    const before = new Set(lint(src).map((x) => `${x.code}|${x.message}`));
    const gained = lint(pasted)
      .filter((x) => x.code !== "W_ROOM_MISSING_DEFINING" && x.code !== "W_ROOM_NO_FIXTURE")
      .filter((x) => !before.has(`${x.code}|${x.message}`));
    expect(gained.map((x) => x.code)).toEqual([]);
  });

  it("leaves the kitchen out whole, and says so, when no worktop fits: never a sink and a hob alone", () => {
    const src = kitchen(
      1650,
      1950,
      "  door id=d_x at (900,1950) width 800 wall w_mid swing in\n  window at (550,0) width 600 wall shell\n" +
        "  window at (0,1150) width 600 wall shell\n",
    );
    const r = finish(src, { only: "furnish" });
    expect(r.changes).toEqual([]);
    expect(r.unresolved.map((u) => u.reason)).toEqual([
      'no position for the worktop (`counter`, 600, 400 mm along) in "r_x" clears its walls, its doors and the pieces before it — the room was left empty',
    ]);
  });
});
