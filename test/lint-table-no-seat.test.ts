/**
 * Product roadmap RM9.6, coverage class CV13 (plan-soundness PS2.31): `W_TABLE_NO_SEAT`, a dining
 * table in a home's living room, dining room or kitchen that holds no seat.
 *
 * Each finding is shown beside the same plan with its cause removed, so a test cannot pass because
 * the rule never ran.
 */
import { describe as suite, expect, it } from "vitest";
import { type Diagnostic, ERROR_CATALOG, lint, lintWithCoverage, makeVirtualWorld, resolvePlan } from "../src/index.js";
import { CATALOG_CATEGORIES, fixtureSpec } from "../src/fixtures-catalog.js";
import { DEFAULT_RULESET } from "../src/lint/ruleset.js";
import { buildLintContext } from "../src/lint/context.js";
import { LINT_RULES, lintWork } from "../src/lint.js";
import { lintStoreys } from "../src/lint/storeys.js";
import { tableNoSeat } from "../src/lint/rules/room-contents.js";
import { D4_ELEMENTS, EXAMPLE_FILES, EXAMPLES_WORLD } from "./helpers/d4-oracle.js";

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
/** This rule's own skips and reports over one storey, over the context `lint()` builds. */
function ruleRun(src: string): { skips: string[]; diags: Diagnostic[] } {
  const ir = resolvePlan(src).ir!;
  const ctx = buildLintContext(
    ir,
    DEFAULT_RULESET,
    LINT_RULES,
    lintStoreys(ir, [], DEFAULT_RULESET.tolMm)[0]!.building,
  );
  const skips: string[] = [];
  ctx.skip = (reason, room) => void skips.push(room ? `${reason}:${room.id}` : reason);
  return { skips, diags: tableNoSeat.check(ctx) };
}

suite("W_TABLE_NO_SEAT", () => {
  it("reports a table with no seat in its room, at the table, with ids only in the hint", () => {
    const src = living();
    const [d, ...rest] = of(src);
    expect(rest).toEqual([]);
    expect(d!.severity).toBe("warning");
    expect(d!.message).toBe(
      'The table "Table" stands in "Living / Dining", which holds no seat lint counts for a table (a chair, stool or bench).',
    );
    expect(d!.message).not.toMatch(/table_\d|`r`|\br\b/);
    expect(d!.hints).toEqual([
      'Add a chair at the table "Table", its front toward the table (`furniture chair … in r`), or draw the table "Table" as a `dining_table`, whose symbol includes its chairs (its size is then the table and the chairs together).',
    ]);
    // An auto id is never quoted; an authored one is.
    expect(d!.hints!.join(" ")).not.toMatch(/table_\d/);
    const named = of(living().replace("furniture table at", "furniture id=t_eat table at"))[0]!;
    expect(named.hints![0]).toMatch(/^Add a chair at "t_eat", .* or draw "t_eat" as a `dining_table`/);
    // A room with an auto id is not quoted either.
    const autoRoom = plan(
      SHELL,
      '  room at (0,0) size 5000x4500 label "Living" uses living',
      "  furniture table at (2800,1300) size 1400x900",
    );
    expect(of(autoRoom)[0]!.hints![0]).toContain("(`furniture chair …`)");
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
      const src = plan(
        SHELL,
        room("Living / Dining", "living"),
        `  furniture ${piece} at (2800,1300) size 1400x900 in r`,
      );
      expect(of(src), piece).toEqual([]);
    }
  });

  it("judges a living room, a dining room and a kitchen, never a bedroom or a study", () => {
    // A studio (`uses living bedroom`) is a living room as well: judged. Only a room whose uses are
    // all bedroom, or none of the day uses, is not.
    for (const uses of ["living", "dining", "kitchen", "living kitchen", "living bedroom", "bedroom dining"]) {
      expect(of(plan(SHELL, room("Room", uses), TABLE)), uses).toHaveLength(1);
    }
    for (const uses of ["bedroom", "office", "storage", "bedroom office"]) {
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
    // residential-basic judges every plan as a home, not every room as a day room.
    const office = plan(SHELL, room("Office", "office"), TABLE);
    expect(of(office, "residential-basic")).toEqual([]);
    expect(
      of(
        plan(SHELL, room("Cafe seating", "dining"), TABLE, "  furniture stool at (3275,800) size 450x450 in r"),
        "residential-basic",
      ),
    ).toEqual([]);
  });

  it("does not read a table whose label names another piece, whole-word and in any case", () => {
    for (const label of [
      "Coffee",
      "coffee table",
      "Desk",
      "Kitchen island",
      "TV",
      "tv table",
      "Side",
      "Console",
      "Bedside",
      "Dressing table",
    ]) {
      expect(of(living().replace('label "Table"', `label "${label}"`)), label).toEqual([]);
    }
    for (const label of [
      "Dining table",
      "Breakfast",
      "Desktop",
      "Television",
      "Islands",
      "Sideboard",
      "Table for two",
    ]) {
      expect(of(living().replace('label "Table"', `label "${label}"`)), label).toHaveLength(1);
    }
  });

  it("files one verdict per table across overlapping rooms: a reported table files no no-uses", () => {
    const overlap = plan(
      SHELL,
      room("Living", "living"),
      '  room id=q at (2500,500) size 2000x2500 label "Nook"',
      TABLE,
    );
    const run = ruleRun(overlap);
    expect(run.diags).toHaveLength(1);
    expect(run.skips).toEqual([]);
    // Not reported (the only day-use room gone): the room with no uses is declared.
    const alone = ruleRun(overlap.replace('label "Living" uses living', 'label "Store" uses storage'));
    expect(alone.diags).toEqual([]);
    expect(alone.skips).toEqual(["no-uses:q"]);
  });

  it("reads each storey on its own, a table in no room, and polygon and circle rooms", () => {
    const storeys = (upperChair: boolean): string =>
      [
        'plan "t" {',
        "  units mm",
        "  grid 50",
        '  level 1 "Ground" {',
        SHELL,
        '  room id=r at (0,0) size 5000x4500 label "Hall" uses hall',
        "  furniture chair at (3275,800) size 450x450 in r",
        "  stair id=st at (300,300) size 900x3000 dir up",
        "  }",
        '  level 2 "Upper" {',
        SHELL,
        '  room id=r at (0,0) size 5000x4500 label "Living" uses living',
        TABLE,
        upperChair ? "  furniture chair at (3275,2250) size 450x450 rotate 180 in r" : "",
        "  stair id=st at (300,300) size 900x3000 dir up",
        "  }",
        "}",
      ].join("\n");
    // The ground floor's chair stands under the table but on another storey: no seat for it.
    expect(of(storeys(false))).toHaveLength(1);
    expect(of(storeys(true))).toEqual([]);
    // A table on no room's floor is not read, and declares nothing.
    const outside = plan(
      SHELL,
      '  room id=r at (0,0) size 2000x2000 label "Living" uses living',
      "  furniture table at (2800,2600) size 1400x900",
    );
    expect(of(outside)).toEqual([]);
    expect(ruleRun(outside).skips).toEqual([]);
    // An L-shaped polygon room and a round one are read off their shape.
    const ell = plan(
      SHELL,
      '  room id=r polygon (0,0) (5000,0) (5000,4500) (2500,4500) (2500,2000) (0,2000) label "Living" uses living',
      TABLE,
    );
    expect(of(ell)).toHaveLength(1);
    expect(of(ell.replace(TABLE, `${TABLE}\n  furniture chair at (3275,800) size 450x450 in r`))).toEqual([]);
    const round = plan(SHELL, '  room id=r circle at (2500,2250) radius 2200 label "Dining" uses dining', TABLE);
    expect(of(round)).toHaveLength(1);
    expect(of(round.replace(TABLE, `${TABLE}\n  furniture chair at (3275,800) size 450x450 in r`))).toEqual([]);
  });

  it("is invariant under the eight turns and mirrors of a plan it reports (a witness, not only the examples)", () => {
    for (const [src, want] of [
      [living(), 1],
      [living("  furniture chair at (3275,800) size 450x450 in r"), 0],
    ] as const) {
      const world = makeVirtualWorld({ "w.arch": src });
      for (const g of D4_ELEMENTS) {
        const turn = `${g.rotate !== 0 ? ` rotate ${g.rotate}` : ""}${g.mirror ? ` mirror ${g.mirror}` : ""}`;
        const placed = `plan "p" {\n  units mm\n  grid 50\n  import "w.arch" as w\n  place w() as g at (0, 0)${turn}\n}\n`;
        expect(
          lint(placed, { world }).filter((d) => d.code === CODE),
          `${g.name} (${want})`,
        ).toHaveLength(want);
      }
    }
  });

  it("does its room reading once per room, never once per table (rooms x pieces centre tests)", () => {
    const dense = (n: number): string => {
      const lines = [SHELL, '  room id=r0 at (0,0) size 5000x4500 label "Living" uses living'];
      for (let i = 1; i < n; i++)
        lines.push(
          `  room id=r${i} at (${(i % 5) * 100},${(i % 7) * 100}) size 4000x3500 label "Living ${i}" uses living`,
        );
      for (let j = 0; j < 2 * n; j++)
        lines.push(`  furniture table at (${500 + (j % 6) * 500},${500 + (j % 5) * 500}) size 400x400`);
      return plan(...lines);
    };
    for (const n of [10, 20, 40]) {
      const work = lintWork(dense(n));
      // n rooms, each read once over the storey's 2n pieces: 2n^2, never 2n x n x 2n.
      expect(work.tableSeatTests, `n = ${n}`).toBe(n * 2 * n);
    }
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
