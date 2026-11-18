/**
 * Card AL6: `W_ANNOTATION_OVERLAP` says, as data beside the warning, which text is printed over
 * what (`diagnosticOverprint`, `src/lint/overprint-ref.ts`).
 *
 * Pinned on two names pinned over fixtures ({@link PINS}), each detail exact, kinds and ids, and on
 * a galley whose thickness figure stands on a counter, a thickness report that remains. The
 * label-crowding witness (`test/fixtures/dense-office.arch`) reports nothing since card AL3b: the two
 * room names it reported over fixtures are led into the corridor. A room's report is about its label (`room-label`), and each thing under it
 * says which of the label's texts is over it (`parts`), measured hit by hit, never copied from the
 * message: the name alone, the area figure alone, and two shelves, one under each text, which the
 * message joins. A figure's report says the room it stands in only of the pieces under it (a label
 * names its own room). Then what holds everywhere: `lint()` and its JSON are untouched (the detail
 * is kept beside the diagnostic, never on it), the two-argument projection is unchanged and the
 * option only appends a last key, a copy or a clone has no detail while `lint()`'s own copies (a
 * storey's `level`) carry it, the CLI's `lint`/`validate --json` attach it, and over the
 * annotation-collisions defects every report has one whose subject is the text the message
 * names, whose ids are ids `describe()` lists. The message no longer names the room a figure
 * stands in when the label under it is another room's (the pavilion's call-out over the annex).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import {
  describe,
  type Diagnostic,
  type DiagnosticOverprintJson,
  diagnosticOverprint,
  diagnosticRule,
  diagnosticToJson,
  lint,
} from "../src/index.js";
import { runArch } from "./helpers/cli.js";

const OVERLAP = "W_ANNOTATION_OVERLAP";
const WITNESS_PATH = "test/fixtures/dense-office.arch";
const WITNESS = readFileSync(WITNESS_PATH, "utf8");
/** A pinned plan with reports, for the CLI: a pinned name over a bed. */
const PINNED_PATH = "test/defect-corpus/annotation-collisions/label-over-bed.arch";
const PINNED = readFileSync(PINNED_PATH, "utf8");

/** Two rooms whose pinned names stand over fixtures: the store's name over its shelving, the
 *  kitchen's area figure over its sink. A pinned label is never led off its floor (card AL3b). */
const PINS = `plan "Two pins" {
  units mm
  paper A4 landscape
  scale 1:100
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }
  wall id=mid partition thickness 100 { (3000,0) (3000,3000) }
  room id=r_store at (0,0) size 3000x3000 label "Store" at (1500,1500) uses storage
  room id=r_kitchen at (3000,0) size 3000x3000 label "Kitchen" at (4500,1500) uses kitchen
  door id=d_store at (1500,3000) width 900 wall shell swing in
  door id=d_kitchen at (4500,3000) width 900 wall shell swing in
  furniture id=shelf shelving at (1100,1250) size 800x400 in r_store
  furniture id=sink kitchen_sink at (4100,1600) size 800x500 in r_kitchen
}`;
const overlaps = (src: string): Diagnostic[] => lint(src).filter((d) => d.code === OVERLAP);

suite("who overprints whom", () => {
  const ds = overlaps(PINS);

  it("the label-crowding witness reports nothing: its two names are led into the corridor (AL3b)", () => {
    expect(overlaps(WITNESS)).toEqual([]);
  });

  it("reports each pinned name over its fixture, and which of its texts is over it", () => {
    expect(ds.map(diagnosticOverprint)).toEqual([
      {
        subject: { kind: "room-label", room: "r_store", text: "Store" },
        over: [{ kind: "symbol", id: "shelf", parts: ["name"] }],
      },
      {
        subject: { kind: "room-label", room: "r_kitchen", text: "Kitchen" },
        over: [{ kind: "symbol", id: "sink", parts: ["area"] }],
      },
    ] satisfies DiagnosticOverprintJson[]);
  });

  it("every id it names is one describe() lists", () => {
    const s = describe(PINS);
    const ids = new Set([...s.rooms.map((r) => r.id), ...s.furniture.map((f) => f.id), ...s.doors.map((d) => d.id)]);
    for (const d of ds) {
      const o = diagnosticOverprint(d)!;
      for (const item of [o.subject, ...o.over]) {
        if (item.id !== undefined) expect(ids.has(item.id), item.id).toBe(true);
        if (item.room !== undefined) expect(ids.has(item.room), item.room).toBe(true);
      }
    }
  });
});

/**
 * A galley whose 3.7 m counter lines its whole north wall, the longest 300 run: the thickness
 * figure has no run clear of it and stands on it. A label is never under a thickness figure any
 * more (AL5); a symbol still can be.
 */
const GALLEY = `plan "Galley" {
  units mm
  grid 50
  paper A4 landscape
  scale 1:100
  dims auto all
  wall id=shell exterior thickness 300 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r_k at (0,0) size 4000x3000 label "Kitchen" uses kitchen
  door id=d_k at (2000,3000) width 900 wall shell swing in
  furniture id=run counter at (150,150) size 3700x600
}`;

suite("a thickness figure over a piece: the report that remains", () => {
  it("names the piece and the room it stands in, and the detail says so", () => {
    const [d, ...rest] = overlaps(GALLEY);
    expect(rest).toEqual([]);
    expect(d!.message).toBe(
      'The wall-thickness figure 300 that `dims auto all` writes beside its wall is printed over the counter in "Kitchen", so the two overprint each other on the drawing.',
    );
    expect(diagnosticOverprint(d!)).toEqual({
      subject: { kind: "dim-thickness", room: "r_k", text: "300" },
      over: [{ kind: "symbol", id: "run" }],
    } satisfies DiagnosticOverprintJson);
  });
});

suite("beside the diagnostic, never on it", () => {
  it("lint() returns the same keys: JSON.stringify(lint()) carries no detail", () => {
    const ds = lint(WITNESS);
    expect(JSON.stringify(ds)).not.toContain(`"overprint":`);
    for (const d of ds) expect(Object.keys(d)).not.toContain("overprint");
  });

  it("the two-argument projection is unchanged; the option appends `overprint` last, after `rule`", () => {
    for (const d of lint(WITNESS)) {
      const plain = diagnosticToJson(WITNESS, d);
      const both = diagnosticToJson(WITNESS, d, { rule: diagnosticRule, overprint: diagnosticOverprint });
      expect(plain).not.toHaveProperty("overprint");
      expect(Object.keys(both).at(-1)).toBe("overprint");
      const { overprint, rule: _r, ...rest } = both;
      expect(JSON.stringify(rest)).toBe(JSON.stringify(plain));
      expect(overprint).toEqual(diagnosticOverprint(d));
    }
  });

  it("a copy or a clone has none; a diagnostic of another code has none", () => {
    const [d] = overlaps(PINS);
    expect(diagnosticOverprint(d!)).toBeDefined();
    expect(diagnosticOverprint({ ...d! })).toBeUndefined();
    expect(diagnosticOverprint(structuredClone(d!))).toBeUndefined();
    const other = lint(PINS, { profile: "accessibility-advisory" }).filter((x) => x.code !== OVERLAP);
    expect(other.length).toBeGreaterThan(0);
    for (const x of other) expect(diagnosticOverprint(x)).toBeUndefined();
  });

  it("lint()'s own copies carry it: each storey's warning, stamped with its `level`", () => {
    const body = `
    wall id=shell exterior thickness 200 { (0,0) (2000,0) (2000,2500) (0,2500) close }
    room id=r_bath at (0,0) size 2000x2500 label "Bathroom" at (1000,1650) uses bath
    door id=d_bath at (600,2500) width 800 wall shell swing in
    furniture bathtub against wall shell segment 0 offset 1000 in r_bath
    furniture wc against wall shell segment 1 offset 1300 in r_bath
    furniture basin against wall shell segment 3 offset 1350 in r_bath`;
    const src = `plan "two storeys" {
  units mm
  grid 50
  paper A4 landscape
  scale 1:100
  level 1 {${body}
  }
  level 2 {${body}
  }
}`;
    const ds = overlaps(src);
    expect(ds.map((d) => d.level)).toEqual([1, 2]);
    for (const d of ds)
      expect(diagnosticOverprint(d)?.subject).toEqual({ kind: "room-label", room: "r_bath", text: "Bathroom" });
  });
});

suite("the fabric kinds: a wall, a door's swing, the floor's edge", () => {
  it("a pinned name over a wall and a swing", () => {
    const src = `plan "labels in small rooms" {
  units mm
  paper A4 landscape
  scale 1:50
  room id=flur at (0,0) size 3000x1400 label "Flur" uses hall
  room id=wc right-of flur size 1000x1400 label "WC" uses wc
  room id=abst below wc align left size 1200x900 label "Abstellraum" at (3600,1985) uses storage
  walls from rooms exterior 200 partition 100
  door on flur.bottom at 800 from start width 900 swing into flur
  door between flur and wc at center width 800 swing into wc
  door id=d_abst between wc and abst at center width 600 swing into abst
}`;
    const [d, ...rest] = overlaps(src);
    expect(rest).toEqual([]);
    // The message joins the two texts; the detail parts them: the area figure is the one over the
    // wall, and the name the one over the swing.
    expect(d!.message).toContain(
      'The name "Abstellraum" and the area figure (1.1 m²) are printed over a wall and the swing',
    );
    expect(diagnosticOverprint(d!)).toEqual({
      subject: { kind: "room-label", room: "abst", text: "Abstellraum" },
      over: [
        { kind: "wall", parts: ["area"] },
        { kind: "door-swing", id: "d_abst", parts: ["name"] },
      ],
    });
  });

  it("a name wider than its floor, over a wall and off the floor", () => {
    const src = `plan "r" {
  units mm
  paper A4 landscape
  scale 1:50
  room id=r at (0,0) size 1200x2000 label "Hauswirtschaftsraumundabstellkammer" uses bedroom
  walls from rooms exterior 100 partition 100
}`;
    const [d] = overlaps(src);
    expect(d!.message).toContain("is printed over a wall and runs out of the room");
    expect(diagnosticOverprint(d!)).toEqual({
      subject: { kind: "room-label", room: "r", text: "Hauswirtschaftsraumundabstellkammer" },
      over: [
        { kind: "wall", parts: ["name"] },
        { kind: "floor-edge", room: "r", parts: ["name"] },
      ],
    });
  });
});

/** A 4 x 3 m store whose label is pinned at its centre, and `extra` statements. */
const store = (extra: string) => `plan "Store" {
  units mm
  grid 50
  paper A4 landscape
  scale 1:50
  wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r_store at (0,0) size 4000x3000 label "Store" at (2000,1500) uses storage
  door id=d_store at (600,3000) width 800 wall shell swing in
${extra}
}`;
// The name is drawn centred at y 1465, the area figure at y 1657.5: one shelf under each.
const UNDER_NAME = "  furniture id=s_name shelf at (1700,1380) size 600x150";
const UNDER_AREA = "  furniture id=s_area shelf at (1700,1610) size 600x100";

suite("`parts`: which of a room label's texts each thing is under", () => {
  it("the name alone", () => {
    const [d, ...rest] = overlaps(store(UNDER_NAME));
    expect(rest).toEqual([]);
    expect(d!.message.startsWith('The name "Store" is printed over the shelf')).toBe(true);
    expect(diagnosticOverprint(d!)).toEqual({
      subject: { kind: "room-label", room: "r_store", text: "Store" },
      over: [{ kind: "symbol", id: "s_name", parts: ["name"] }],
    });
  });

  it("the area figure alone: the subject is still the room's label, named by its name", () => {
    const [d, ...rest] = overlaps(store(UNDER_AREA));
    expect(rest).toEqual([]);
    expect(d!.message.startsWith('The area figure (12.0 m²) of "Store" is printed over the shelf')).toBe(true);
    expect(diagnosticOverprint(d!)).toEqual({
      subject: { kind: "room-label", room: "r_store", text: "Store" },
      over: [{ kind: "symbol", id: "s_area", parts: ["area"] }],
    });
  });

  it("two shelves, one under the name and one under the area figure: each hit says its own text", () => {
    const [d, ...rest] = overlaps(store(`${UNDER_NAME}\n${UNDER_AREA}`));
    expect(rest).toEqual([]);
    // The message reads as if both texts were over one shelf; the detail does not copy that.
    const opening = 'The name "Store" and the area figure (12.0 m²) are printed over the shelf,';
    expect(d!.message.startsWith(opening)).toBe(true);
    expect(diagnosticOverprint(d!)).toEqual({
      subject: { kind: "room-label", room: "r_store", text: "Store" },
      over: [
        { kind: "symbol", id: "s_name", parts: ["name"] },
        { kind: "symbol", id: "s_area", parts: ["area"] },
      ],
    });
  });
});

/**
 * A round pavilion whose `R3000` call-out `dims auto overall` letters at (3000,1500), halfway
 * from the centre to the arc's midpoint (`test/defect-corpus/annotation-collisions/`), with the
 * pavilion's label pinned at `pav` and `extra` statements.
 */
const pavilion = (pav: string, extra: string) => `plan "Pavilion" {
  units mm
  grid 50
  paper A4 landscape
  scale 1:50
  dims auto overall
  wall id=drum exterior thickness 200 {
    (6000,3000)
    arc (0,3000) radius 3000
    arc (6000,3000) radius 3000
  }
  room id=r_pav circle at (3000,3000) radius 3000 label "Pavilion" at ${pav} uses living
  door on drum at 75% width 900
  window on drum at 25% width 1200
${extra}
}`;
const TABLE = "  furniture table at (2400,1100) size 1200x800";
/** A room east of the drum whose label is pinned on the call-out. */
const annex = (at: string) => `  room id=r_annex at (6200,1500) size 3000x3000 label "Annex" at ${at} uses storage`;
const figureOf = (src: string): Diagnostic => overlaps(src).find((d) => d.message.startsWith("The radius call-out"))!;
const RADIUS = "The radius call-out R3000 that `dims auto overall` draws from the arc's centre is printed over";
const TWO = "so the two overprint each other on the drawing.";

suite("a figure's report says where the pieces under it are, and only the pieces", () => {
  it("a piece and the labels of the figure's own room: the room after the whole list, as before", () => {
    const d = figureOf(pavilion("(3000,1500)", TABLE));
    expect(d.message).toBe(
      `${RADIUS} the table, the name "Pavilion" and the area figure (28.3 m²) of "Pavilion" in "Pavilion", ${TWO}`,
    );
    expect(diagnosticOverprint(d)).toEqual({
      subject: { kind: "dim-radius", room: "r_pav", text: "R3000" },
      over: [
        { kind: "symbol", id: "table_1" },
        { kind: "room-label", room: "r_pav", text: "Pavilion", parts: ["name", "area"] },
      ],
    });
  });

  it("a piece and another room's label: the figure's room goes with the piece, not after the label", () => {
    // The table stands in the pavilion and the annex's label is pinned onto the call-out: the room
    // the figure stands in is the table's, so it follows the table and never reads as the annex's.
    const d = figureOf(pavilion("(3000,4300)", `${TABLE}\n${annex("(3000,1500)")}`));
    expect(d.message).toBe(
      `${RADIUS} the table in "Pavilion", the name "Annex" and the area figure (9.0 m²) of "Annex", ${TWO}`,
    );
    expect(diagnosticOverprint(d)).toEqual({
      subject: { kind: "dim-radius", room: "r_pav", text: "R3000" },
      over: [
        { kind: "symbol", id: "table_1" },
        { kind: "room-label", room: "r_annex", text: "Annex", parts: ["name", "area"] },
      ],
    });
  });

  it("the labels of two rooms and no piece: no room, each label names its own", () => {
    const d = figureOf(pavilion("(3000,1350)", annex("(3000,1700)")));
    expect(d.message).toBe(
      `${RADIUS} the name "Pavilion", the area figure (28.3 m²) of "Pavilion" and the name "Annex", ${TWO}`,
    );
    // One entry per room; the annex's area figure is clear of the call-out.
    expect(diagnosticOverprint(d)).toEqual({
      subject: { kind: "dim-radius", room: "r_pav", text: "R3000" },
      over: [
        { kind: "room-label", room: "r_pav", text: "Pavilion", parts: ["name", "area"] },
        { kind: "room-label", room: "r_annex", text: "Annex", parts: ["name"] },
      ],
    });
  });
});

suite("the annotation-collisions defects: every report has a detail, and its subject is the message's", () => {
  const dir = "test/defect-corpus/annotation-collisions";
  const files = [
    WITNESS_PATH,
    ...readdirSync(dir)
      .filter((f) => f.endsWith(".arch"))
      .sort()
      .map((f) => join(dir, f).replace(/\\/g, "/")),
  ];
  // The galley above: since AL5 the one source here whose thickness figure is reported.
  const sources = [...files.map((f) => [f, readFileSync(f, "utf8")] as const), ["galley", GALLEY] as const];
  /** The subject kind each opening of the message names. */
  const OPENING: [RegExp, string][] = [
    [/^The name /, "room-label"],
    [/^The area figure /, "room-label"],
    [/^The wall-thickness figure /, "dim-thickness"],
    [/^The radius call-out /, "dim-radius"],
    [/^The diameter call-out /, "dim-diameter"],
    [/^The figure /, "dim-chain"],
  ];

  it("holds on each report, and the set is not empty", () => {
    let reports = 0;
    const kinds = new Set<string>();
    for (const [f, src] of sources) {
      const s = describe(src);
      const ids = new Set([...s.rooms.map((r) => r.id), ...s.furniture.map((x) => x.id), ...s.doors.map((x) => x.id)]);
      for (const d of overlaps(src)) {
        reports++;
        const o = diagnosticOverprint(d);
        expect(o, `${f}: ${d.message}`).toBeDefined();
        const want = OPENING.find(([re]) => re.test(d.message))?.[1];
        expect(o!.subject.kind, `${f}: ${d.message}`).toBe(want);
        expect(o!.subject.text.length, f).toBeGreaterThan(0);
        expect(o!.over.length, f).toBeGreaterThan(0);
        // The texts a room's message opens with are exactly the texts its hits found, name first.
        if (o!.subject.kind === "room-label") {
          const said = [
            ...(/^The name /.test(d.message) ? ["name"] : []),
            ...(/^The area figure |^The name "[^"]*" and the area figure /.test(d.message) ? ["area"] : []),
          ];
          const found = new Set(o!.over.flatMap((x) => x.parts ?? []));
          expect(
            (["name", "area"] as const).filter((p) => found.has(p)),
            `${f}: ${d.message}`,
          ).toEqual(said);
          for (const x of o!.over) expect(x.parts?.length, `${f}: ${d.message}`).toBeGreaterThan(0);
        }
        for (const item of [o!.subject, ...o!.over]) {
          kinds.add(item.kind);
          if (item.id !== undefined) expect(ids.has(item.id), `${f}: ${item.id}`).toBe(true);
          if (item.room !== undefined) expect(ids.has(item.room), `${f}: ${item.room}`).toBe(true);
          // An id is data here and a handle in the hint; the message never quotes it.
          if (item.id !== undefined) expect(d.message, f).not.toContain(item.id);
        }
      }
    }
    expect(reports).toBeGreaterThan(4);
    for (const k of ["room-label", "dim-thickness", "dim-radius", "symbol", "door-swing"])
      expect(kinds.has(k), k).toBe(true);
  });
});

suite("the CLI attaches it: `lint --json` and `validate --json`", () => {
  it("lint --json: every W_ANNOTATION_OVERLAP carries `overprint` as its last key, no other code does", async () => {
    const r = await runArch(["lint", PINNED_PATH, "--json"]);
    const out = JSON.parse(r.stdout) as { diagnostics: Array<Record<string, unknown>> };
    const ds = lint(PINNED);
    expect(ds.some((d) => d.code === OVERLAP)).toBe(true);
    expect(out.diagnostics.map((d) => d.overprint)).toEqual(ds.map(diagnosticOverprint));
    for (const d of out.diagnostics)
      if (d.code === OVERLAP) expect(Object.keys(d).at(-1)).toBe("overprint");
      else expect(d).not.toHaveProperty("overprint");
  });

  it("validate --json: `overprint` sits after `rule`, before the `stage` it ends with", async () => {
    const r = await runArch(["validate", PINNED_PATH, "--json"]);
    const out = JSON.parse(r.stdout) as { diagnostics: Array<Record<string, unknown>> };
    const shown = out.diagnostics.filter((d) => d.code === OVERLAP);
    expect(shown).toHaveLength(1);
    for (const d of shown) expect(Object.keys(d).slice(-2)).toEqual(["overprint", "stage"]);
  });
});
