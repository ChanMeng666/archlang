/**
 * `sheet text { … }` (issue #403): what the block changes, and what it never reaches. The byte law
 * for plans that do not write it is `test/sheet-text-byte-identity.test.ts`.
 *
 * Every table of words here is derived from {@link SHEET_WORDS} and the language's own vocabularies, so
 * a new fixed word on the sheet is a red test until it has a key that draws.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import {
  compile,
  describe as describePlan,
  finish,
  format,
  lint,
  planToJson,
  toDxf,
  type Scene,
} from "../src/index.js";
import { FIXTURE_CATEGORIES } from "../src/elements/fixtures-glyphs.js";
import { DOOR_KINDS, WINDOW_KINDS } from "../src/grammar/tokens.js";
import { GROUND_MATERIALS, KNOWN_MATERIALS } from "../src/hatches.js";
import { fmt2, drawnDecimal, plainDecimal } from "../src/num-format.js";
import { MAX_SHEET_WORD, PLAIN_SHEET_TEXT, SHEET_WORDS, sheetText, sheetTextKeys } from "../src/sheet-text.js";
import { inkWidth } from "../src/text-metrics.js";
import { everyWord } from "./sheet-text-plans.js";

const FIXTURE = readFileSync("test/fixtures/sheet-text/sheet-text.arch", "utf8");
const block = (...lines: string[]): string => `  sheet text {\n${lines.map((l) => `    ${l}\n`).join("")}  }`;

/** Every string a compile draws, page by page, unescaped. */
function drawn(src: string): string[] {
  const o = compile(src, { noCache: true });
  expect(o.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const svgs = o.pages ? o.pages.map((p) => p.svg) : [o.svg];
  return svgs.flatMap((svg) =>
    // `&amp;` goes last: first, it would turn an authored `&lt;` into a `<` that no one wrote.
    [...svg.matchAll(/<text\b[^>]*>([^<]*)</g)].map((m) => m[1]!.replaceAll("&lt;", "<").replaceAll("&amp;", "&")),
  );
}

/** A plan's SVGs with every text's content taken out, so only geometry and paint are left. */
function emptied(src: string): string {
  const o = compile(src, { noCache: true });
  return (o.pages ? o.pages.map((p) => p.svg) : [o.svg]).join("\n").replace(/(<text\b[^>]*>)[^<]*</g, "$1<");
}

const withoutBlock = (src: string): string => src.replace(/ {2}sheet text \{[\s\S]*?\n {2}\}\n/, "");
/** The fixture with its block taken out: the same plan, in English, with a decimal point. */
const TWIN = withoutBlock(FIXTURE);
/** The fixture with its stair elsewhere. It keeps clear of the label and the doors as written. */
const stairAt = (placed: string): string => {
  const stair = "stair at (5000,200) size 800x2400 dir up";
  if (!FIXTURE.includes(stair)) throw new Error("the fixture's stair moved");
  return FIXTURE.replace(stair, `stair ${placed} dir up`);
};
const parseErrors = (src: string) => compile(src, { noCache: true }).diagnostics.filter((d) => d.code === "E_PARSE");
const inPlan = (body: string): string => `plan "T" {\n  units mm\n${body}\n}\n`;

suite("sheet text: the keys", () => {
  it("every fixed word draws: a key that drew nothing would be a promise the sheet breaks", () => {
    // `floor` is the one word no row of `everyWord` reaches: that plan is pinned by two byte laws.
    const every = (head: string): string => everyWord(head).replace('label "Living"', 'label "Living" floor tile');
    const english = drawn(every(""));
    for (const [key, word] of Object.entries(SHEET_WORDS)) {
      const sentinel = "Q@Q";
      const texts = drawn(every(block(`${key} "${sentinel}"`)));
      expect(
        texts.some((t) => t.includes(sentinel)),
        key,
      ).toBe(true);
      // ...and it takes the English word's place: the word is gone from where it stood.
      const lost = english.filter((t) => t.includes(word)).length - texts.filter((t) => t.includes(word)).length;
      expect(lost, key).toBeGreaterThan(0);
    }
  });

  it("no drawn word is left without a key: every string is authored, a number, a handle or a key's", () => {
    const words = drawn(everyWord(""));
    const authored = new Set([
      ..."Lawn Living Upper P D R A-1.5 2026-11-02".split(" "),
      "Bed 1.5",
      "Wing",
      "Stand 1.5",
      "Plan 2.5 of 3.5",
      "1.5 m",
      "1 — Ground",
      "2 — Upper",
      "exterior / Living",
      "exterior / Bed 1.5",
      "Living / Bed 1.5",
      "-",
    ]);
    const keyed = new Set<string>([...Object.values(SHEET_WORDS), ...sheetTextKeys()]);
    const number = /^(?:[A-Z]\d+|\d+\.|\d+(?:\.\d+)?(?: m²(?: net)?| m)?|1:[\d.]+)$/;
    const rest = words.filter((t) => !authored.has(t) && !keyed.has(t) && !number.test(t));
    expect(rest).toEqual(["brick x1.5 @22.5°", "casement window"]);
  });

  it("each kind, material and fixture category is its own key", () => {
    const keys = new Set(sheetTextKeys());
    for (const k of [...DOOR_KINDS, ...WINDOW_KINDS, ...KNOWN_MATERIALS, ...GROUND_MATERIALS, ...FIXTURE_CATEGORIES])
      expect(keys.has(k), k).toBe(true);
  });

  it("no caption key shares a word with the vocabularies: one word, one meaning", () => {
    const vocabulary = new Set<string>([
      ...DOOR_KINDS,
      ...WINDOW_KINDS,
      ...KNOWN_MATERIALS,
      ...GROUND_MATERIALS,
      ...FIXTURE_CATEGORIES,
    ]);
    expect(Object.keys(SHEET_WORDS).filter((k) => vocabulary.has(k))).toEqual([]);
  });

  it("a key the plan does not write keeps its English word", () => {
    const texts = drawn(everyWord(block('total "SUMME"')));
    expect(texts).toContain("SUMME");
    expect(texts).toContain("SUBTOTAL");
    expect(texts).not.toContain("TOTAL");
  });

  it("the fixture's legend and schedule read the vocabulary words", () => {
    const texts = drawn(FIXTURE);
    for (const w of ["Mauerwerk x1,5", "Rasen", "Wand", "Sofa", "Drehflügel", "Drehtür", "außen / Bad", "links"])
      expect(texts, w).toContain(w);
    // An authored kind is its word alone in the legend: German compounds, so no ` window` follows it.
    expect(texts.filter((t) => t.includes("window"))).toEqual([]);
  });

  it("a glazed_sliding door's legend row is its word alone too", () => {
    const plan = (head: string): string =>
      inPlan(`  legend\n${head}
  wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=a at (0,0) size 4000x3000
  door glazed_sliding at (2000,3000) width 1800 wall exterior`);
    expect(drawn(plan(""))).toContain("glazed_sliding door");
    expect(drawn(plan(block('glazed_sliding "Hebeschiebetür"')))).toContain("Hebeschiebetür");
  });
});

suite("sheet text: the refusals", () => {
  const cases: [string, string, RegExp][] = [
    ["an unknown key, with a did-you-mean", 'totl "SUMME"', /Unknown sheet text key "totl" — did you mean "total"\?/],
    ["a key written twice", 'total "A"\n    total "B"', /`total` is written twice/],
    ["an empty word", 'total ""', /`total` is empty/],
    ["a line break", 'total "A\\nB"', /`total` holds a control character/],
    ["a word past the cap", `total "${"x".repeat(MAX_SHEET_WORD + 1)}"`, /is 41 long, past the 40/],
    ["a long word in a fixed spot", 'north "NORDEN!"', /`north` is 7 long, past the 6/],
    ["a mark that is no mark", 'decimal ";"', /`decimal` is "," or "."/],
    ["a number for a word", "total 5", /Expected string/],
    ["no key", '"SUMME"', /Expected a sheet text key/],
    ["no entry", "", /`sheet text` writes nothing/],
    ["only a comment", "# later", /`sheet text` writes nothing/],
  ];
  it.each(cases)("%s", (_name, entry, message) => {
    const errors = parseErrors(inPlan(block(entry)));
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(message);
    expect(errors[0]!.span).toBeDefined();
  });

  it("the cap is a cap, not a guess: the longest word passes", () => {
    expect(parseErrors(inPlan(block(`total "${"x".repeat(MAX_SHEET_WORD)}"`)))).toEqual([]);
    expect(parseErrors(inPlan(block('north "NORDEN"')))).toEqual([]);
  });

  it("a parse pays for one did-you-mean: no step meter runs here, and the search reads every key", () => {
    const errors = parseErrors(inPlan(`${block('totl "A"')}\n${block('totl "B"')}\n${block('totl "C"')}`));
    expect(errors.map((e) => e.message.includes("did you mean"))).toEqual([true, false, false]);
    const huge = "z".repeat(MAX_SHEET_WORD + 1);
    expect(parseErrors(inPlan(block(`${huge} "A"`)))[0]!.message).not.toContain("did you mean");
  });

  it("a bad entry costs one error: the block is skipped whole and the plan reads on", () => {
    for (const entries of [
      ['totl "A"', 'total "B"'],
      ['total "A"', 'totl "B"', 'name "C"'],
      ['total ""', 'name "C"'],
      [],
    ]) {
      const src = inPlan(
        `${block(...entries)}\n  room id=r at (0,0) size 2000x2000 label "After"\n  room id=s at (2000,0) size 0x0`,
      );
      const o = compile(src, { noCache: true });
      expect(parseErrors(src), entries.join()).toHaveLength(1);
      // The statement after the block was read: its own error is reported, not swallowed.
      expect(
        o.diagnostics.some((d) => d.code !== "E_PARSE" && d.severity === "error"),
        entries.join(),
      ).toBe(true);
    }
  });

  it("a second block is refused, not merged", () => {
    const errors = parseErrors(inPlan(`${block('total "A"')}\n${block('total "B"')}`));
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/written twice: a plan has one/);
  });

  const AFTER = '  room id=r at (0,0) size 2000x2000 label "After"\n  room id=s at (2000,0) size 0x0';
  // `legend` and `scale` are statement words too: read as statements they would cost more errors.
  const NESTED = block('legend "L"', 'scale "M"');
  it.each([
    ["a level", `  level 1 {\n${NESTED}\n${AFTER}\n  }`],
    ["a component", `  component k() {\n${NESTED}\n${AFTER}\n  }\n  k()`],
    ["an if", `  if 1 > 0 {\n${NESTED}\n${AFTER}\n  }`],
    ["a for", `  for i in [1] {\n${NESTED}\n${AFTER}\n  }`],
    ["a zone", `  zone z "Z" {\n${NESTED}\n${AFTER}\n  }`],
  ])("inside %s it says it is plan-level, over the whole block, and the body reads on", (_where, body) => {
    const src = inPlan(body);
    const errors = parseErrors(src);
    expect(errors.map((e) => e.message)).toEqual([
      "`sheet text` is a plan-level statement: write it once, outside any `level`, `component` or block",
    ]);
    const span = errors[0]!.span!;
    expect(src.slice(span.start, span.end)).toBe(NESTED.trimStart());
    // The statement after the block was read: its own error is reported, not swallowed.
    expect(
      compile(src, { noCache: true }).diagnostics.some((d) => d.code !== "E_PARSE" && d.severity === "error"),
    ).toBe(true);
  });

  it("the near misses in a body keep their old words: only `sheet text {` is the form", () => {
    for (const near of ['sheet text "x"', 'sheet words { total "T" }', 'sheet "text" { total "T" }']) {
      const errors = parseErrors(inPlan(`  level 1 {\n  ${near}\n  }`));
      expect(
        errors.map((e) => e.message),
        near,
      ).toEqual(['Unknown statement "sheet"']);
    }
  });

  it('a string is not the word `text`: the form is not read off `sheet "text" {`', () => {
    const errors = parseErrors(inPlan('  sheet "text" { total "T" }'));
    expect(errors.map((e) => e.message)).toEqual(['Unknown statement "sheet"']);
  });
});

suite("sheet text: the word `sheet` keeps its old meanings", () => {
  it("as an id, a binding, a component and a macro call", () => {
    const src = inPlan(`  let sheet = 3000
  component text() {
    room id=y at (0,0) size 500x500
  }
  component other() {
    room id=z at (0,0) size 500x500
  }
  room id=sheet at (0,0) size sheet x 2000
  text()`);
    expect(parseErrors(src)).toEqual([]);
    const macro = inPlan(`  component sheet() {\n    room id=x at (0,0) size 1000x1000\n  }\n  sheet()`);
    expect(parseErrors(macro)).toEqual([]);
  });

  it("the statement before it ends where it always did", () => {
    const after = (line: string): string => inPlan(`${line}\n${block('total "A"')}`);
    for (const line of [
      "  legend",
      "  schedule rooms",
      "  dims auto",
      "  scale 1:50",
      '  notes "a"',
      "  room id=r at (0,0) size 1000x1000",
      "  dim (0,0)->(1000,0)",
      "  north up",
    ]) {
      expect(parseErrors(after(line)), line).toEqual([]);
    }
  });
});

suite("sheet text: the decimal mark", () => {
  const COMMA = everyWord(block('decimal ","'));
  const ENGLISH = everyWord("");

  it("reaches no geometry and no paint: the two sheets differ only inside their text", () => {
    expect(emptied(COMMA)).toBe(emptied(ENGLISH));
    expect(emptied(FIXTURE.replace(/ {2}sheet text \{[\s\S]*?\n {2}\}\n/, block('decimal ","') + "\n"))).toBe(
      emptied(TWIN),
    );
  });

  it("every drawn number takes it; what the author wrote does not", () => {
    const authored = ["Bed 1.5", "Stand 1.5", "Plan 2.5 of 3.5", "A-1.5", "1.5 m", "Living / Bed 1.5"];
    const a = drawn(ENGLISH);
    const b = drawn(COMMA);
    expect(b).toHaveLength(a.length);
    a.forEach((was, i) => {
      if (authored.some((s) => was.includes(s)) || !/\d\.\d/.test(was)) expect(b[i]).toBe(was);
      else expect(b[i]).toBe(was.replaceAll(".", ","));
    });
    // Nothing the plan did not write still has a point in a number.
    const rest = b.filter((t) => /\d\.\d/.test(t) && !authored.some((s) => t.includes(s)));
    expect(rest).toEqual([]);
    // Every site is in this plan: stamps, cells, dims, the scale row, the legend, the width cell.
    for (const t of [
      "3,6 m²",
      "21,7 m² net",
      "24,00",
      "49,02",
      "1000,5",
      "300,5",
      "900,5",
      "1:12,5",
      "brick x1,5 @22,5°",
    ])
      expect(b, t).toContain(t);
  });

  it("the scale bar takes it, and the curve call-outs", () => {
    const small = inPlan(`  dims auto all
${block('decimal ","')}
  wall id=s exterior thickness 200 { (0,0) (1000,0) arc (1000,1000) radius 700.5 cw (0,1000) close }
  room id=d circle at (500,500) radius 200.5 label "Round"`);
    const texts = drawn(small);
    expect(texts).toContain("0,5 m");
    expect(texts).toContain("R700,5");
    expect(texts).toContain("φ401");
    const stamp = texts.filter((t) => t.endsWith("m²"));
    expect(stamp.every((t) => t.includes(","))).toBe(true);
  });

  it('`decimal "."` is the point, spelled out, and changes nothing', () => {
    expect(drawn(everyWord(block('decimal "."')))).toEqual(drawn(ENGLISH));
  });

  it("the net stamp takes the mark and the word", () => {
    expect(drawn(FIXTURE)).toContain("10,4 m² netto");
  });

  it("a DXF keeps a point in every numeric field; only its TEXT strings take the comma", () => {
    const scene = (src: string): Scene => compile(src, { noCache: true }).scene as Scene;
    const lines = toDxf(scene(FIXTURE)).split(/\r?\n/);
    const texts: string[] = [];
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const code = Number(lines[i]);
      const value = lines[i + 1]!;
      if (code === 1) texts.push(value);
      else if (code >= 10 && code <= 59) expect(value).not.toContain(",");
    }
    expect(texts).toContain("12,00");
  });

  it("drawnDecimal is the one place, and is the identity for the point", () => {
    expect(drawnDecimal("12.50", ",")).toBe("12,50");
    expect(drawnDecimal("1200", ",")).toBe("1200");
    expect(drawnDecimal("12.50", ".")).toBe("12.50");
    expect(PLAIN_SHEET_TEXT.mm).toBe(fmt2);
    expect(sheetText(undefined)).toBe(PLAIN_SHEET_TEXT);
  });
});

suite("sheet text: what it never reaches", () => {
  it("describe() does not learn it", () => {
    expect(JSON.stringify(describePlan(FIXTURE))).toBe(JSON.stringify(describePlan(TWIN)));
  });

  it("lint messages stay English, and every code holds on this plan", () => {
    const strip = (src: string) => lint(src).map(({ span: _span, fixes: _fixes, ...d }) => d);
    expect(JSON.stringify(strip(FIXTURE))).toBe(JSON.stringify(strip(TWIN)));
    // The fixture lints clean, so that line compares nothing. With its stair in the doors' way this
    // plan has warnings to compare, and none of them reads the sheet.
    const warned = stairAt("at (3500,500) size 1000x2400");
    expect(
      strip(warned)
        .map((d) => d.code)
        .sort(),
    ).toEqual(["W_STAIR_NO_LANDING", "W_STAIR_SIDE_ENTRY", "W_SWING_OVER_STAIR"]);
    expect(JSON.stringify(strip(warned))).toBe(JSON.stringify(strip(withoutBlock(warned))));
  });

  // What the sheet draws decides what collides, and may change a verdict: that is the rule reading
  // the drawing. What it says stays English, so these read the message and not the twin's.
  it("an overprint no fit clears quotes the area stamp in English", () => {
    const filled = stairAt("at (3200,200) size 2600x3600"); // nothing clears a stair that fills the floor
    expect(drawn(filled)).toContain("10,4 m² netto");
    const [d] = lint(filled).filter((x) => x.code === "W_ANNOTATION_OVERLAP");
    expect(d?.message).toContain("the area figure (10.4 m² net)");
    expect(d?.message).not.toMatch(/\d,\d|netto/);
  });

  // The number lands on the figure, so one message quotes both the `dims auto` value and the stamp.
  const pavilion = (entries: string) => `plan "p" {
  units mm
  paper A4 landscape
  scale 1:50
  dims auto overall
  sheet text {
${entries}
  }
  schedule rooms net
  wall id=drum exterior thickness 200 {
    (6001,3000)
    arc (0,3000) radius 3000.5
    arc (6001,3000) radius 3000.5
  }
  room id=r_pav circle at (3000.5,3000) radius 3000.5 label "Pavilion" at (3000,1025) uses living
  door on drum at 75% width 900
  window on drum at 25% width 1200
}`;

  it.each([
    ["the mark and the word", '    decimal ","\n    net "netto"', "R3000,5", "26,4 m² netto"],
    ["the mark alone", '    decimal ","', "R3000,5", "26,4 m² net"],
    ["the word alone", '    net "netto"', "R3000.5", "26.4 m² netto"],
    ["a word with a comma in it", '    decimal ","\n    net "o. Wände, 1,5"', "R3000,5", "26,4 m² o. Wände, 1,5"],
    ["a word that reads as the unit", '    decimal ","\n    net "m²"', "R3000,5", "26,4 m² m²"],
  ])("a `dims auto` number over the stamp quotes both in English: %s", (_, entries, number, stamp) => {
    const src = pavilion(entries);
    expect(drawn(src)).toEqual(expect.arrayContaining([number, stamp]));
    expect(
      lint(src)
        .filter((x) => x.code === "W_ANNOTATION_OVERLAP")
        .map((x) => x.message),
    ).toEqual([
      'The radius call-out R3000.5 that `dims auto overall` draws from the arc\'s centre is printed over the area figure (26.4 m² net) of "Pavilion", so the two overprint each other on the drawing.',
    ]);
  });

  it("a number the sheet drew comes back as it was printed", () => {
    for (const n of [0, 0.5, 1, 10.4, 300, 3000.5, 12345.67]) {
      const printed = fmt2(n);
      expect(plainDecimal(drawnDecimal(printed, ","), ",")).toBe(printed);
      expect(plainDecimal(printed, ".")).toBe(printed);
    }
  });

  it("compile().diagnostics hold", () => {
    const strip = (src: string) =>
      compile(src, { noCache: true }).diagnostics.map(({ span: _span, fixes: _fixes, ...d }) => d);
    expect(JSON.stringify(strip(FIXTURE))).toBe(JSON.stringify(strip(TWIN)));
  });

  it("Plan JSON keeps its numbers and reports the block in `dropped`, counted", () => {
    const a = planToJson(TWIN);
    const b = planToJson(FIXTURE);
    expect(JSON.stringify(b.json)).toBe(JSON.stringify(a.json));
    const row = (b.dropped ?? []).find((r) => r.clause === "sheet text");
    const entries = FIXTURE.match(/^ {4}[a-z_]+ "/gm)!;
    expect(entries).toContain('    decimal "');
    expect(row?.count).toBe(entries.length - 1);
    expect((b.dropped ?? []).find((r) => r.clause === "decimal mark")).toEqual({
      clause: "decimal mark",
      count: 1,
      text: 'decimal ","',
    });
    expect((a.dropped ?? []).some((r) => r.clause === "sheet text" || r.clause === "decimal mark")).toBe(false);
  });

  it("`decimal` is no sheet word: alone, no words are reported; without it, no mark", () => {
    const of = (entry: string) =>
      (planToJson(inPlan(`${block(entry)}\n  room id=a at (0,0) size 2000x2000`)).dropped ?? []).map((r) => r.clause);
    expect(of('decimal ","')).toEqual(["decimal mark"]);
    expect(of('total "SUMME"')).toEqual(["sheet text"]);
  });

  it("no module reads a locale from the host: nothing in src/ asks `Intl` or `toLocale*`", () => {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => {
        const p = join(d, f);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
      });
    const code = (p: string): string =>
      readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
    for (const p of walk("src")) expect(code(p), p).not.toMatch(/\bIntl\.|\.toLocale[A-Z]/);
  });
});

suite("sheet text: the layout holds the words", () => {
  const tables = (src: string) => (compile(src, { noCache: true }).scene as Scene).chrome!.tables!;

  it("a column widens for a word the plan wrote, and holds it", () => {
    const word = "NETTOFLÄCHE BIS ZUR WAND (m²)";
    const plain = tables(TWIN).schedule!;
    const wide = tables(FIXTURE.replace('"NETTOFLÄCHE (m²)"', `"${word}"`)).schedule!;
    const col = wide.cols[3]!;
    expect(col.heading).toBe(word);
    expect(col.w).toBeGreaterThan(plain.cols[3]!.w);
    expect(inkWidth(word, wide.fs * 0.8)).toBeLessThan(col.w - 2 * wide.pad);
  });

  it("`decimal` alone moves no column", () => {
    const a = tables(everyWord(""));
    const b = tables(everyWord(block('decimal ","')));
    expect(b.schedule!.cols).toEqual(a.schedule!.cols);
    expect(b.openings!.cols).toEqual(a.openings!.cols);
    expect(b.legend!.w).toBe(a.legend!.w);
  });

  it("a word in a TYPE or HAND cell and a legend row fits its column", () => {
    const src = everyWord(
      block('hinged "Drehflügeltür"', 'right "rechtsseitig"', 'sofa "Sitzgruppe mit Hocker und Tisch"'),
    );
    const t = tables(src);
    const fs = t.openings!.fs;
    expect(t.openings!.cols[3]!.w).toBeGreaterThan(inkWidth("Drehflügeltür", fs));
    expect(t.openings!.cols[4]!.w).toBeGreaterThan(inkWidth("rechtsseitig", fs));
    expect(t.legend!.w - t.legend!.swatchW).toBeGreaterThan(inkWidth("Sitzgruppe mit Hocker und Tisch", fs));
  });

  suite("the plan's word for the outside, in a ROOM(S) cell", () => {
    const WORD = "Aussenbereich des Grundstuecks";
    const NAME = "Wohnzimmer mit offener Kueche und Essplatz";
    const opening = (head: string, label = "Bad"): string =>
      inPlan(`  schedule openings
${head}
  wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=a at (0,0) size 4000x3000 label "${label}"
  door at (2000,3000) width 900 wall exterior`);
    const interior = (head: string): string =>
      inPlan(`  schedule openings
${head}
  wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  wall id=p partition thickness 100 { (2000,0) (2000,3000) }
  room id=a at (0,0) size 2000x3000 label "${"W".repeat(MAX_SHEET_WORD)}"
  room id=b at (2000,0) size 2000x3000 label "B"
  door at (2000,1500) width 800 wall p`);

    it("is whole, and its column holds the cell", () => {
      const t = tables(opening(block(`exterior "${WORD}"`))).openings!;
      const cell = `${WORD} / Bad`;
      expect(t.rows[0]!.rooms).toBe(cell);
      expect(t.cols[1]!.w).toBeGreaterThan(tables(opening("")).openings!.cols[1]!.w);
      expect(inkWidth(cell, t.fs)).toBeLessThan(t.cols[1]!.w - t.fs / 2);
      expect(drawn(opening(block(`exterior "${WORD}"`)))).toContain(cell);
    });

    it("is whole at the longest it may be, in CJK too", () => {
      const word = "外".repeat(MAX_SHEET_WORD);
      const t = tables(opening(block(`exterior "${word}"`))).openings!;
      expect(t.rows[0]!.rooms).toBe(`${word} / Bad`);
      expect(inkWidth(t.rows[0]!.rooms, t.fs)).toBeLessThan(t.cols[1]!.w);
    });

    it("leaves the room beside it the characters it had in English", () => {
      const english = tables(opening("", NAME)).openings!.rows[0]!.rooms;
      expect(english).toMatch(/^exterior \/ .*\.\.\.$/);
      const cell = tables(opening(block(`exterior "${WORD}"`), NAME)).openings!.rows[0]!.rooms;
      expect(cell).toBe(english.replace("exterior", WORD));
    });

    it("a word no longer than the English keeps the clip", () => {
      const english = tables(opening("", NAME)).openings!.rows[0]!.rooms;
      const cell = tables(opening(block('exterior "außen"'), NAME)).openings!.rows[0]!.rooms;
      expect(cell.length).toBe(english.length);
    });

    it("a row that reads no authored word moves nothing, though the block writes one", () => {
      const a = tables(interior("")).openings!;
      const b = tables(interior(block(`exterior "${WORD}"`))).openings!;
      expect(b.rows[0]!.rooms).toBe(a.rows[0]!.rooms);
      expect(b.cols[1]!.w).toBe(a.cols[1]!.w);
      // The premise: this cell is wide enough to widen the column, if a row of no word could.
      expect(inkWidth(a.rows[0]!.rooms, a.fs) + a.fs).toBeGreaterThan(a.cols[1]!.w);
    });
  });

  it("the longest word a table caption may hold stays inside its frame, in CJK too", () => {
    const word = "表".repeat(MAX_SHEET_WORD);
    const t = tables(everyWord(block(`room_schedule "${word}"`, `opening_schedule "${word}"`, `legend "${word}"`)));
    for (const box of [t.schedule!, t.openings!, t.legend!]) {
      expect(inkWidth(word, box.fs)).toBeLessThan(box.w);
    }
  });

  it("the merged total label clears the AREA column", () => {
    const word = "GESAMTSUMME ALLER RÄUME DIESES GESCHOSSES".slice(0, MAX_SHEET_WORD);
    const t = tables(everyWord(block(`total "${word}"`))).schedule!;
    expect(inkWidth(word, t.fs)).toBeLessThan(t.cols[0]!.w + t.cols[1]!.w);
  });

  it("the sheet fit does not move: the same rows, the same scale", () => {
    const paper = (head: string): string => everyWord(head).replace("  scale 1:12.5\n", "  paper A3\n");
    expect(describePlan(paper(block('total "SUMME"'))).sheet).toEqual(describePlan(paper("")).sheet);
  });
});

suite("sheet text: W_TITLE_OVERFLOW reads the caption as it is drawn", () => {
  const LONG = "GEZEICHNET VON DER PROJEKTLEITUNG";
  const plan = (head: string): string =>
    inPlan(`  scale 1:50
${head}
  title { project "P" drawn_by "Chan Meng" }
  wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=a at (0,0) size 4000x3000 uses living
  door at (2000,3000) width 900 wall exterior`);
  const overflow = (src: string) => lint(src).filter((d) => d.code === "W_TITLE_OVERFLOW");

  it("fires on a caption that crowds its value, in English, at the block's span", () => {
    const src = plan(block(`drawn_by "${LONG}"`));
    const [d, ...more] = overflow(src);
    expect(more).toEqual([]);
    expect(d!.message).toContain("DRAWN BY");
    expect(d!.message).not.toContain("GEZEICHNET");
    expect(src.slice(d!.span!.start, d!.span!.end)).toMatch(/^sheet text \{/);
  });

  it("the stamped SCALE row is judged too, with no title at all", () => {
    const src = plan(block(`scale "${LONG}"`)).replace(/ {2}title \{.*\n/, "");
    expect(overflow(src).map((d) => d.message)).toEqual([expect.stringContaining("SCALE")]);
  });

  it("a caption that fits is quiet, and so is the same plan with none", () => {
    expect(overflow(plan(block('drawn_by "GEZEICHNET"')))).toEqual([]);
    expect(overflow(plan(""))).toEqual([]);
  });

  it("a multi-storey plan reports it once", () => {
    const src = everyWord(block(`drawn_by "${"X".repeat(30)}"`)).replace('drawn_by "D"', 'drawn_by "Chan Meng"');
    expect(overflow(src)).toHaveLength(1);
  });

  it("a value over its row is still reported by its old rule", () => {
    const value = "x".repeat(40);
    const src = plan(block('drawn_by "VON"')).replace('drawn_by "Chan Meng"', `drawn_by "${value}"`);
    expect(overflow(src).some((d) => d.message.includes("is 40 characters"))).toBe(true);
  });

  it.each([
    ["a short caption", "VON"],
    ["a caption that overflows too", LONG],
  ])("a value over its row is that row's one report, with %s", (_name, caption) => {
    const value = "x".repeat(40);
    const src = plan(block(`drawn_by "${caption}"`)).replace('drawn_by "Chan Meng"', `drawn_by "${value}"`);
    expect(overflow(src).map((d) => d.message)).toEqual([expect.stringContaining("value is 40 characters")]);
  });

  it("one row's value does not excuse another row's caption", () => {
    const value = "x".repeat(40);
    const src = plan(block(`drawn_by "${LONG}"`)).replace('project "P"', `project "${value}"`);
    expect(overflow(src).map((d) => d.message)).toEqual([
      expect.stringContaining("PROJECT value is 40 characters"),
      expect.stringContaining("DRAWN BY row is narrower"),
    ]);
  });
});

suite("sheet text: W_ANNOTATION_OVERLAP and the label passes read the drawn stamp", () => {
  const plan = (head: string): string =>
    inPlan(`  schedule rooms net
${head}
  wall id=w exterior thickness 200 { (0,0) (3000,0) (3000,1200) (0,1200) close }
  wall id=p partition thickness 100 { (1000,0) (1000,1200) }
  room id=a at (0,0) size 1000x1200 label "WC"
  room id=b at (1000,0) size 2000x1200 label "Hall"
  door at (2000,1200) width 900 wall exterior`);
  const stampOf = (src: string): { value: string; size: number } => {
    const scene = compile(src, { noCache: true }).scene as Scene;
    const prim = scene.nodes.map((n) => n.prim).find((p) => p.t === "text" && p.value.includes("m²"));
    if (prim?.t !== "text") throw new Error("no stamp");
    return prim;
  };

  it("a longer word shrinks the stamp, as a longer name would", () => {
    const plain = stampOf(plan(""));
    const long = stampOf(plan(block('net "NETTOFLÄCHE INNEN"')));
    expect(long.value).toContain("NETTOFLÄCHE INNEN");
    expect(long.size).toBeLessThan(plain.size);
  });
});

suite("sheet text: arch finish", () => {
  it("adds its statements outside the block and keeps every word", () => {
    const bare = FIXTURE.replace(/ {2}title \{.*\n/, "")
      .replace("  schedule rooms net\n", "")
      .replace("  legend\n", "")
      .replace("  scale 1:12.5\n", "");
    const { source } = finish(bare);
    const open = source.indexOf("sheet text {");
    const body = source.slice(open, source.indexOf("\n  }", open));
    expect(body).toBe(bare.slice(bare.indexOf("sheet text {"), bare.indexOf("\n  }", bare.indexOf("sheet text {"))));
    expect(source).toContain("schedule rooms");
    expect(compile(source, { noCache: true }).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});

suite("sheet text: arch fmt", () => {
  it("prints the block in written order, comments kept, and is a fixed point", () => {
    const once = format(FIXTURE);
    expect(once).toContain("sheet text {");
    expect(once).toContain("# Das Schriftfeld");
    expect(once.indexOf('decimal ","')).toBeLessThan(once.indexOf('project "PROJEKT"'));
    expect(format(once)).toBe(once);
    expect(drawn(once)).toEqual(drawn(FIXTURE));
  });

  it("escapes what it prints", () => {
    const src = inPlan(block('total "S \\"U\\" {x}"'));
    const once = format(src);
    expect(format(once)).toBe(once);
  });

  it("leaves a refused block as written, as it does any source that does not parse", () => {
    for (const src of [inPlan("  sheet text { }"), inPlan("  sheet text {\n    # later\n  }")]) {
      expect(format(src)).toBe(src);
    }
  });
});

suite("sheet text: the language reference", () => {
  const reference = readFileSync("docs/language-reference.md", "utf8");
  const section = reference.slice(reference.indexOf("### Sheet text"), reference.indexOf("## Keep — declared"));

  it("its row among the settings has all three columns", () => {
    const row = reference.split("\n").find((l) => l.startsWith("| `sheet text { … }` |"))!;
    expect(row.split(" | ").length).toBe(3);
    expect(row.endsWith(" | none |")).toBe(true);
  });

  it("lists every key and the English it replaces, and the cap it quotes", () => {
    const rows = section.split("\n").filter((l) => l.startsWith("| `"));
    const cell = (i: number): string => rows.map((r) => r.split(" | ")[i]).join(" ");
    for (const [key, word] of Object.entries(SHEET_WORDS)) {
      expect(cell(0), key).toContain(`\`${key}\``);
      expect(cell(1), word).toContain(`\`${word}\``);
    }
    expect(section).toContain(`more than ${MAX_SHEET_WORD} UTF-16 units`);
  });

  it("its German block compiles, draws, and says it is unreviewed", () => {
    const fence = section.match(/```arch\n([\s\S]*?)```/)![1]!;
    expect(drawn(fence)).toContain("RAUMBUCH");
    expect(section).toContain("not reviewed by a German");
  });
});

suite("sheet text: the words are text, never markup", () => {
  it("every chrome site escapes what the plan wrote", () => {
    const src = everyWord(
      block('north "<&>"', 'project "<a&b>"', 'total "</text>"', 'net "<i>"', 'up "<&"', 'legend "\\"<q>"'),
    );
    const o = compile(src, { noCache: true });
    for (const p of o.pages!) {
      const bad = [...p.svg.matchAll(/<\/?([a-zA-Z:]+)/g)].map((m) => m[1]);
      expect(bad.filter((t) => ["a", "i", "q"].includes(t!))).toEqual([]);
      expect(p.svg).toContain("&lt;&amp;&gt;");
    }
  });

  it("a word that reads as an entity is drawn as written, and comes back as written", () => {
    expect(drawn(everyWord(block('total "&lt;"')))).toContain("&lt;");
  });
});

suite("sheet text: multi-storey", () => {
  it("every page takes the block, and the LEVEL row its caption", () => {
    const o = compile(everyWord(block('level "GESCHOSS"', 'total "SUMME"')), { noCache: true });
    expect(o.pages).toHaveLength(2);
    for (const p of o.pages!) {
      expect(p.svg).toContain(">GESCHOSS<");
      expect(p.svg).toContain(">SUMME<");
    }
  });
});
