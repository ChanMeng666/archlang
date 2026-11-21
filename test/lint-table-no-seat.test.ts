/**
 * Product roadmap RM9.6, coverage class CV13 (plan-soundness PS2.31): `W_TABLE_NO_SEAT`, a dining
 * table in a home's living room, dining room or kitchen that holds no seat.
 *
 * Each finding is shown beside the same plan with its cause removed, so a test cannot pass because
 * the rule never ran.
 */
import { describe as suite, expect, it } from "vitest";
import { type Diagnostic, ERROR_CATALOG, lint, lintWithCoverage } from "../src/index.js";
import { CATALOG_CATEGORIES, fixtureSpec } from "../src/fixtures-catalog.js";
import { EXAMPLE_FILES, EXAMPLES_WORLD } from "./helpers/d4-oracle.js";

const CODE = "W_TABLE_NO_SEAT";
const of = (src: string, profile?: string): Diagnostic[] =>
  lint(src, profile ? { profile } : {}).filter((d) => d.code === CODE);
const plan = (...lines: string[]): string => `plan "t" {\n  units mm\n  grid 50\n${lines.join("\n")}\n}\n`;
const SHELL = [
  "  wall id=shell exterior thickness 200 { (0,0) (5000,0) (5000,4500) (0,4500) close }",
  "  door id=d at (4000,4500) width 900 wall shell",
  "  window at (2500,0) width 1500 wall shell",
].join("\n");
const TABLE = '  furniture table at (2800,1300) size 1400x900 label "Table" in r';
const room = (label: string, uses = ""): string =>
  `  room id=r at (0,0) size 5000x4500 label "${label}"${uses ? ` uses ${uses}` : ""}`;
const living = (...more: string[]): string => plan(SHELL, room("Living / Dining", "living"), TABLE, ...more);
const skipsOf = (src: string): string[] =>
  (lintWithCoverage(src).coverage?.families.find((f) => f.family === "contents")?.skipped ?? []).map((s) => s.reason);

suite("W_TABLE_NO_SEAT", () => {
  it("reports a table with no seat in its room, at the table, with ids only in the hint", () => {
    const src = living();
    const [d, ...rest] = of(src);
    expect(rest).toEqual([]);
    expect(d!.severity).toBe("warning");
    expect(d!.message).toBe(
      'The table "Table" stands in "Living / Dining", which holds no seat to sit at it: no chair, stool or bench.',
    );
    expect(d!.message).not.toMatch(/table_\d|`r`|\br\b/);
    expect(d!.hints).toEqual([
      'Add a chair at "table_1", its front toward the table (`furniture chair … in r`), or draw "table_1" as a `dining_table`, whose symbol includes its chairs (its size is then the table and the chairs together).',
    ]);
    expect(src.slice(d!.span!.start, d!.span!.end)).toBe(TABLE.trim());
    // An unlabelled table is named by what it is.
    const bare = plan(SHELL, room("Living / Dining", "living"), "  furniture table at (2800,1300) size 1400x900 in r");
    expect(of(bare)[0]!.message).toMatch(/^A table stands in "Living \/ Dining"/);
  });

  it("is silent once any seat a table is sat at stands in the room", () => {
    for (const seat of ["chair", "office_chair", "outdoor_chair", "patio_chair", "stool", "barstool", "bench"]) {
      expect(of(living(`  furniture ${seat} at (3275,800) size 450x450 in r`)), seat).toEqual([]);
    }
    // The clean twin's two chairs, each facing the table, raise nothing else either.
    expect(
      lint(
        living(
          "  furniture chair at (3275,800) size 450x450 in r",
          "  furniture chair at (3275,2250) size 450x450 rotate 180 in r",
        ),
      ),
    ).toEqual([]);
  });

  it("does not count a lounge seat: a sofa or an armchair is not sat at a table", () => {
    for (const seat of ["sofa", "armchair", "loveseat", "bean_bag"]) {
      expect(of(living(`  furniture ${seat} at (400,3300) size 900x850 in r`)), seat).toHaveLength(1);
    }
  });

  it("reads only a table doing a dining table's job, derived from the catalogue", () => {
    expect(CATALOG_CATEGORIES.filter((c) => fixtureSpec(c)?.serves === "dining_table")).toEqual(["table"]);
    // A dining table draws its own chairs; the others are not dining tables.
    for (const piece of ["dining_table", "coffee_table", "side_table", "desk", "meeting_table", "console_table"]) {
      const src = plan(SHELL, room("Living / Dining", "living"), `  furniture ${piece} at (2800,1300) size 1400x900 in r`);
      expect(of(src), piece).toEqual([]);
    }
  });

  it("judges a living room, a dining room and a kitchen, never a bedroom or a study", () => {
    for (const uses of ["living", "dining", "kitchen", "living kitchen"]) {
      expect(of(plan(SHELL, room("Room", uses), TABLE)), uses).toHaveLength(1);
    }
    for (const uses of ["bedroom", "office", "living bedroom", "storage"]) {
      expect(of(plan(SHELL, room("Room", uses), TABLE)), uses).toEqual([]);
    }
  });

  it("declares a table's room with no classified use instead of guessing", () => {
    const src = plan(SHELL, room("Room A"), TABLE);
    expect(of(src)).toEqual([]);
    expect(skipsOf(src)).toContain("no-uses");
  });

  it("reads a seat in another room as no seat, and reports a table on two rooms' floor once", () => {
    const two = [
      "  wall id=shell exterior thickness 200 { (0,0) (9000,0) (9000,4500) (0,4500) close }",
      "  wall id=w_mid partition thickness 100 { (5000,0) (5000,4500) }",
      "  door id=d at (2500,4500) width 900 wall shell",
      "  door id=d2 at (5000,2000) width 800 wall w_mid",
      "  window at (2500,0) width 1500 wall shell",
      "  window at (7000,0) width 1500 wall shell",
      '  room id=r at (0,0) size 5000x4500 label "Living / Dining" uses living',
      '  room id=s at (5000,0) size 4000x4500 label "Study" uses office',
    ].join("\n");
    expect(of(plan(two, TABLE, "  furniture chair at (6000,800) size 450x450 in s"))).toHaveLength(1);
    const overlaid = plan(
      SHELL,
      room("Living / Dining", "living"),
      '  room id=z at (2500,500) size 2000x2500 label "Dining nook" uses dining',
      TABLE,
    );
    expect(of(overlaid)).toHaveLength(1);
    expect(of(overlaid.replace(TABLE, `${TABLE}\n  furniture chair at (3275,800) size 450x450 in z`))).toEqual([]);
  });

  it("does not judge a plan that reads as non-residential, and says so; residential-basic does", () => {
    const cafe = plan(SHELL, room("Cafe seating", "dining"), TABLE);
    expect(of(cafe)).toEqual([]);
    expect(skipsOf(cafe)).toContain("non-dwelling");
    expect(of(cafe, "residential-basic")).toHaveLength(1);
  });

  it("reports nothing over the shipped examples under the default ruleset (RM-D73: their tables were seated first)", () => {
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
