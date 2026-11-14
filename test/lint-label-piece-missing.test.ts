/**
 * Product roadmap RM1.2c (ruling RM-D35): `W_LABEL_PIECE_MISSING`, a room whose label names a
 * catalogued piece it does not hold ("Desk Nook" with no desk).
 *
 * Each finding is shown beside the same plan with its cause removed, so a test cannot pass because
 * the rule never ran.
 */
import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { compile, type Diagnostic, ERROR_CATALOG, lint } from "../src/index.js";
import { FIXTURE_CATEGORIES } from "../src/elements/fixtures-glyphs.js";
import { CATALOG_CATEGORIES, fixtureSpec } from "../src/fixtures-catalog.js";
import { familyOf } from "../src/furnish-table.js";
import { labelPieces, ROOM_NAMING_PIECES } from "../src/lint/rules/room-contents.js";
import { FALLBACK_USE_VOCABULARY, normalizeLabel, USE_VOCABULARY } from "../src/vocabulary.js";

const CODE = "W_LABEL_PIECE_MISSING";
const of = (src: string): Diagnostic[] => lint(src).filter((d) => d.code === CODE);
const plan = (...lines: string[]): string => `plan "t" {\n  units mm\n  grid 50\n${lines.join("\n")}\n}\n`;
const SHELL = [
  "  wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }",
  "  door id=d at (2000,3000) width 900 wall shell",
].join("\n");
const room = (label: string): string => `  room id=r at (0,0) size 4000x3000 label "${label}"`;
const labelled = (label: string, ...more: string[]): string => plan(SHELL, room(label), ...more);

/** Every backticked statement a hint quotes, appended to the plan it came from. */
function pasted(src: string, d: Diagnostic): string {
  const stmts = [...d.hints![0]!.matchAll(/`(furniture [^`]+)`/g)].map((m) => `  ${m[1]}`);
  expect(stmts.length).toBeGreaterThan(0);
  return src.replace(/\n}\n$/, `\n${stmts.join("\n")}\n}\n`);
}

suite("W_LABEL_PIECE_MISSING", () => {
  it("reports a label naming a piece the room lacks, with the room's id only in the hints", () => {
    const src = labelled("Desk Nook");
    const [d, ...rest] = of(src);
    expect(rest).toEqual([]);
    expect(d!.severity).toBe("warning");
    expect(d!.message).toBe('Room "Desk Nook" holds no desk, though its label names one.');
    expect(d!.message).not.toContain("`r`");
    expect(d!.hints).toEqual([
      "Add it (nothing to import), e.g. `furniture desk in r anchor top flush size 1400x700`.",
      "If `r` is not meant to hold one, change its label, which says it does.",
    ]);
    expect(src.slice(d!.span!.start, d!.span!.end)).toBe('room id=r at (0,0) size 4000x3000 label "Desk Nook"');
  });

  it("is cleared by pasting its hint, and silent once the piece is there", () => {
    for (const label of ["Desk Nook", "Coffee Table Corner", "Desk and TV Room"]) {
      const src = labelled(label);
      const [d] = of(src);
      const fixed = pasted(src, d!);
      expect(
        compile(fixed).diagnostics.filter((x) => x.severity === "error"),
        label,
      ).toEqual([]);
      expect(of(fixed), label).toEqual([]);
    }
    expect(of(labelled("Desk Nook", "  furniture desk in r anchor top flush size 1200x600"))).toEqual([]);
  });

  it("pasted into the defect case, its hint raises no code the case did not raise (default and accessibility)", () => {
    const src = readFileSync("test/defect-corpus/missing-defining-contents/desk-nook-no-desk.arch", "utf8");
    for (const profile of [undefined, "accessibility-advisory"] as const) {
      const o = profile ? { profile } : {};
      const [d] = lint(src, o).filter((x) => x.code === CODE);
      const fixed = pasted(src, d!);
      const before = lint(src, o).map((x) => x.code);
      const after = lint(fixed, o).map((x) => x.code);
      expect(
        after.filter((c) => !before.includes(c)),
        profile ?? "default",
      ).toEqual([]);
      expect(after, profile ?? "default").not.toContain(CODE);
    }
  });

  it("matches whole words only, in any case, with regular plurals and punctuation between words", () => {
    expect(labelPieces("Bedroom")).toEqual([]);
    expect(labelPieces("Bathroom")).toEqual([]);
    expect(labelPieces("Deskside")).toEqual([]);
    expect(labelPieces("DESK nook")).toEqual(["desk"]);
    expect(labelPieces("Desks Area")).toEqual(["desk"]);
    expect(labelPieces("Lockers Area")).toEqual(["locker"]);
    expect(labelPieces("Benches Corner")).toEqual(["bench"]);
    expect(labelPieces("Piano, Desk and TV Room")).toEqual(["piano", "desk", "tv"]);
    expect(of(labelled("Bedroom 2"))).toEqual([]);
    expect(of(labelled("Bathroom"))).toEqual([]);
  });

  it("reads a word of several words only as consecutive words, the longest run winning", () => {
    expect(labelPieces("Coffee Table Corner")).toEqual(["coffee_table"]);
    expect(labelPieces("Dining Table Area")).toEqual(["dining_table"]);
    expect(labelPieces("Coffee and Table Corner")).toEqual(["table"]);
    expect(labelPieces("Sofa and Couch Corner")).toEqual(["sofa"]);
  });

  it("never reads the label's head noun, its last word, in each name a `/` separates: the room is that thing", () => {
    for (const label of ["Desk", "Desks", "Desk 2", "Serving Counter", "Counter / servery", "Coffee Table"])
      expect(labelPieces(label), label).toEqual([]);
    expect(labelPieces("Desk Nook 2")).toEqual(["desk"]);
    expect(of(labelled("Desk Nook 2"))).toHaveLength(1);
    // RM-D35a: names before a last name with words before its head share that head.
    expect(labelPieces("Piano / Desk Nook")).toEqual(["piano", "desk"]);
    expect(labelPieces("Washer / Dryer Closet")).toEqual(["washer", "dryer"]);
  });

  it("reads the words after `with` and inside parentheses as pieces, with no head of their own (RM-D35a)", () => {
    expect(labelPieces("Lounge with Piano")).toEqual(["piano"]);
    expect(labelPieces("Room with Desk and TV")).toEqual(["desk", "tv"]);
    expect(labelPieces("Utility (Washer)")).toEqual(["washer"]);
    expect(labelPieces("Snug (TV)")).toEqual(["tv"]);
    expect(labelPieces("Piano & Desk Room")).toEqual(["piano", "desk"]);
    // `with` only as a word: "Withy Store" names nothing, and "Lounge with" names no piece.
    expect(labelPieces("Withy Store")).toEqual([]);
    expect(labelPieces("Lounge with")).toEqual([]);
    for (const label of ["Lounge with Piano", "Room with Desk", "Utility (Washer)", "Snug (TV)"])
      expect(of(labelled(label)), label).toHaveLength(1);
    expect(of(labelled("Snug (TV)", "  furniture tv in r anchor top flush size 1200x100"))).toEqual([]);
  });

  it("never reads a word of a family the catalogue marks a place: the label names where the room is (RM-D35a)", () => {
    const places = CATALOG_CATEGORIES.filter((c) => fixtureSpec(c)?.place === true);
    // Every word of a family carries it, or none does.
    for (const c of CATALOG_CATEGORIES)
      expect(fixtureSpec(c)?.place === true, c).toBe(fixtureSpec(familyOf(c))?.place === true);
    expect([...new Set(places.map(familyOf))]).toEqual([
      "tree",
      "conifer",
      "shrub",
      "hedge",
      "pergola",
      "shed",
      "palm",
      "flower_bed",
      "boulder",
      "raised_bed",
      "pool",
      "gazebo",
      "greenhouse",
      "climber",
      "bamboo",
      "stepping_stones",
    ]);
    for (const w of places) expect(labelPieces(`${w} corner`), w).toEqual([]);
    for (const label of ["Pool House", "Palm Court", "Rock Garden", "Tree House Deck", "Pavilion", "Garden Shed"])
      expect(of(labelled(label)), label).toEqual([]);
    // A piece that only shares a word with one is still read: a pool table is not a pool.
    expect(labelPieces("Pool Table Room")).toEqual(["pool_table"]);
  });

  it("never reads a catalogue word that the use vocabularies read as the room's own name", () => {
    // Pinned, so a vocabulary or catalogue change that moves the list is seen here.
    expect(ROOM_NAMING_PIECES).toEqual([
      "wc",
      "toilet",
      "bath",
      "shower",
      "bed",
      "wardrobe",
      "closet",
      "plant",
      "car",
      "boiler",
      "pantry",
      "larder",
    ]);
    // ... and derived: each catalogue word whose words stand together inside a use-vocabulary word.
    const words = (s: string) => normalizeLabel(s).split(" ");
    const room = [...Object.values(USE_VOCABULARY), ...Object.values(FALLBACK_USE_VOCABULARY)].flatMap((v) =>
      [...v.canonical, ...v.aliases].map((w) => ` ${words(w).join(" ")} `),
    );
    expect(CATALOG_CATEGORIES.filter((c) => room.some((w) => w.includes(` ${words(c).join(" ")} `)))).toEqual([
      ...ROOM_NAMING_PIECES,
    ]);
    for (const w of ROOM_NAMING_PIECES) expect(labelPieces(`${w} corner`), w).toEqual([]);
    for (const label of [
      "Bed 2 Suite",
      "Shower Room",
      "Plant Room",
      "Car Port",
      "Boiler Cupboard",
      "Pantry Store",
      "Water Closet",
    ])
      expect(of(labelled(label)), label).toEqual([]);
    // The catalogue's explanation names the same words, in the same order.
    const said = ERROR_CATALOG[CODE]!.cause;
    const listed = said.slice(said.indexOf("the room's own name: ")).split(" (")[0]!;
    expect([...listed.matchAll(/`([a-z_]+)`/g)].map((m) => m[1])).toEqual([...ROOM_NAMING_PIECES]);
  });

  it("reads the family the catalogue holds the label's word in, every alias with it", () => {
    expect(new Set(CATALOG_CATEGORIES)).toEqual(new Set(FIXTURE_CATEGORIES));
    expect(of(labelled("Couch Corner", "  furniture sofa in r anchor top flush size 2000x900"))).toEqual([]);
    expect(of(labelled("Sofa Corner", "  furniture couch in r anchor top flush size 2000x900"))).toEqual([]);
    // A piece that does another's job counts for it: a reception desk serves a desk.
    expect(of(labelled("Desk Nook", "  furniture reception_desk in r anchor top flush size 2400x900"))).toEqual([]);
    expect(of(labelled("Couch Corner"))[0]!.message).toBe(
      'Room "Couch Corner" holds no couch, though its label names one.',
    );
  });

  it("names every piece missing, and quotes a size only where the catalogue or the furnish table has one", () => {
    const [d] = of(labelled("Piano and Desk Room"));
    expect(d!.message).toBe('Room "Piano and Desk Room" holds no piano and no desk, though its label names them.');
    expect(d!.hints).toEqual([
      "Add it (nothing to import), e.g. `furniture desk in r anchor top flush size 1400x700`.",
      "Add `furniture piano at (x,y) size … in r`: the catalogue gives it no default size.",
      "If `r` is not meant to hold them, change its label, which says it does.",
    ]);
    expect(
      of(labelled("Piano and Desk Room", "  furniture desk in r anchor top flush size 1200x600"))[0]!.message,
    ).toBe('Room "Piano and Desk Room" holds no piano, though its label names one.');
  });

  it("finds the piece by the room's shape, never its bounding box", () => {
    const L = [
      "  wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,1500) (2000,1500) (2000,3000) (0,3000) close }",
      '  room id=r polygon (0,0) (4000,0) (4000,1500) (2000,1500) (2000,3000) (0,3000) label "Desk Nook"',
    ];
    // In the notch: inside the room's box, outside its floor.
    expect(of(plan(...L, "  furniture desk at (2800,2000) size 1000x500"))).toHaveLength(1);
    expect(of(plan(...L, "  furniture desk at (2800,500) size 1000x500"))).toEqual([]);
  });

  it("reads each storey on its own: a desk on the floor below is not in the room above", () => {
    const storey = (label: string, more: string, dir: string) =>
      [
        "  wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }",
        `  room id=r at (0,0) size 4000x3000 label "${label}"`,
        more,
        `  stair id=s at (3000,500) size 900x2000 dir ${dir}`,
      ].join("\n");
    const src = (upper: string) =>
      `plan "t" {\n  units mm\n  grid 50\n  level 1 {\n${storey("Study", "  furniture desk at (500,500) size 1200x600", "up")}\n  }\n  level 2 {\n${storey("Desk Nook", upper, "down")}\n  }\n}\n`;
    const ds = of(src(""));
    expect(ds.map((d) => d.level)).toEqual([2]);
    expect(of(src("  furniture desk at (500,500) size 1200x600"))).toEqual([]);
  });

  it("reads no room without a label, and leaves a defining piece of a furnished room to W_ROOM_MISSING_DEFINING", () => {
    expect(of(plan(SHELL, "  room id=desk_nook at (0,0) size 4000x3000"))).toEqual([]);
    const chair = "  furniture chair at (500,500) size 450x450 in r";
    const furnished = lint(labelled("Dining Table Area", chair)).map((d) => d.code);
    expect(furnished).toContain("W_ROOM_MISSING_DEFINING");
    expect(furnished).not.toContain(CODE);
    // An empty room is no rule's report but this one's.
    expect(lint(labelled("Dining Table Area")).map((d) => d.code)).toContain(CODE);
    expect(lint(labelled("Dining Table Area")).map((d) => d.code)).not.toContain("W_ROOM_MISSING_DEFINING");
  });

  it("leaves a piece to W_ROOM_MISSING_DEFINING only when that rule reports it: a shower does a bath's job, not a tub's", () => {
    const wet = ["  furniture wc at (200,200) size 400x700 in r", "  furniture basin at (800,200) size 500x400 in r"];
    const shower = "  furniture shower at (3000,200) size 900x900 in r";
    // A shower: the bath is defined (none of bathtub | shower is missing), so the tub is this rule's.
    const [d] = of(labelled("Tub Bath", ...wet, shower));
    expect(d!.message).toBe('Room "Tub Bath" holds no tub, though its label names one.');
    expect(d!.hints![0]).toContain("`furniture bathtub ");
    expect(d!.hints![0]).not.toContain("shower");
    // No shower and no tub: W_ROOM_MISSING_DEFINING reports the bathtub, so this rule says nothing.
    const codes = lint(labelled("Tub Bath", ...wet)).map((x) => x.code);
    expect(codes).toContain("W_ROOM_MISSING_DEFINING");
    expect(codes).not.toContain(CODE);
    expect(of(labelled("Tub Bath", ...wet, "  furniture bathtub at (2300,200) size 1700x700 in r"))).toEqual([]);
  });

  it("is silent where W_ROOM_NO_FIXTURE reports the room and its hint already places the piece", () => {
    // An empty "Tub Bath": W_ROOM_NO_FIXTURE's hint places a bathtub.
    const tub = lint(labelled("Tub Bath"));
    expect(tub.map((x) => x.code)).toContain("W_ROOM_NO_FIXTURE");
    expect(tub.find((x) => x.code === "W_ROOM_NO_FIXTURE")!.hints![0]).toContain("`furniture bathtub ");
    expect(tub.map((x) => x.code)).not.toContain(CODE);
    // An empty "Island Kitchen": that hint places a sink, a stove and a counter, never an island.
    const island = lint(labelled("Island Kitchen"));
    expect(island.find((x) => x.code === "W_ROOM_NO_FIXTURE")!.hints![0]).not.toContain("island");
    expect(island.filter((x) => x.code === CODE).map((x) => x.message)).toEqual([
      'Room "Island Kitchen" holds no island, though its label names one.',
    ]);
    // A kitchen holding a chair only: still W_ROOM_NO_FIXTURE's, whose hint places the counter.
    const chair = "  furniture chair at (500,500) size 450x450 in r";
    expect(lint(labelled("Kitchen Counter Area", chair)).map((x) => x.code)).not.toContain(CODE);
  });

  it("counts a more specific piece named after the label's word: a TV unit for a TV, a bike rack for a bike", () => {
    for (const [label, piece] of [
      ["TV Room", "tv_unit at (1000,1000) size 1800x450"],
      ["Bike Store", "bike_rack at (1000,1000) size 1800x600"],
      ["Bicycle Store", "bike_rack at (1000,1000) size 1800x600"],
      ["Table Corner", "dining_table at (1000,1000) size 1600x900"],
      ["Chair Corner", "office_chair at (1000,1000) size 500x500"],
      ["Lamp Corner", "floor_lamp at (1000,1000) size 400x400"],
    ] as const)
      expect(of(labelled(label, `  furniture ${piece}`)), label).toEqual([]);
    // Not the other way round, and not a piece that shares no word with it.
    expect(of(labelled("Coffee Table Corner", "  furniture side_table at (1000,1000) size 500x500"))).toHaveLength(1);
    expect(of(labelled("TV Room", "  furniture sofa at (1000,1000) size 2000x900"))).toHaveLength(1);
  });

  it("keeps the label's own spelling of the piece, lower-casing only a title-case word", () => {
    expect(of(labelled("TV Room"))[0]!.message).toBe('Room "TV Room" holds no TV, though its label names one.');
    expect(of(labelled("Coffee Table Corner"))[0]!.message).toBe(
      'Room "Coffee Table Corner" holds no coffee table, though its label names one.',
    );
    expect(of(labelled("desk_nook"))[0]!.message).toBe('Room "desk_nook" holds no desk, though its label names one.');
  });

  it("in an empty room, also places the room's defining pieces, so pasting raises nothing new (both profiles)", () => {
    const src = plan(SHELL, "  window at (2000,0) width 1200 wall shell", room("Desk Bedroom"));
    for (const profile of [undefined, "accessibility-advisory"] as const) {
      const o = profile ? { profile } : {};
      const [d] = lint(src, o).filter((x) => x.code === CODE);
      expect(d!.message).toBe('Room "Desk Bedroom" holds no desk, though its label names one.');
      expect(d!.hints![0]).toMatch(/^Add it, with the bed that makes it a bedroom \(nothing to import\), e\.g\. /);
      const fixed = pasted(src, d!);
      const before = lint(src, o).map((x) => x.code);
      const after = lint(fixed, o).map((x) => x.code);
      expect(
        after.filter((c) => !before.includes(c)),
        profile ?? "default",
      ).toEqual([]);
      expect(after, profile ?? "default").not.toContain(CODE);
    }
  });
});
