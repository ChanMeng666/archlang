/**
 * `inkWidth` (`src/text-metrics.ts`) against the two faces it says it reads.
 *
 * The compiler loads no font, so the width of a text comes from tables typed into the source. This
 * file reads the faces themselves and holds every entry to them, so a table cannot drift: Roboto
 * from `assets/fonts/Roboto-Regular.ttf`, through a small OpenType reader written here (`head` for
 * the em, `cmap` for the glyph, `hmtx` for the advance), and Helvetica Bold from Adobe's
 * `Helvetica-Bold.afm` in pdfkit, an optional dependency: it skips visibly when that is absent and
 * fails under `CI`, where absence means the install step is broken. The AFM is read here and
 * never shipped.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { EM_PER_CHAR, inkWidth, textWidth } from "../src/text-metrics.js";
import { inkExtent, textExtent } from "../src/text-layout.js";
import type { ScenePrim } from "../src/scene.js";

const font = readFileSync(join(__dirname, "..", "assets", "fonts", "Roboto-Regular.ttf"));

/** The byte offset of a table, from the directory at the head of the file. */
function table(tag: string): number {
  const n = font.readUInt16BE(4);
  for (let i = 0; i < n; i++) {
    const at = 12 + i * 16;
    if (font.toString("latin1", at, at + 4) === tag) return font.readUInt32BE(at + 8);
  }
  throw new Error(`no ${tag} table`);
}

const unitsPerEm = font.readUInt16BE(table("head") + 18);

/** The glyph of a BMP code point, through the format 4 subtable of the Windows Unicode cmap. */
function glyphOf(cp: number): number {
  const cmap = table("cmap");
  const n = font.readUInt16BE(cmap + 2);
  for (let i = 0; i < n; i++) {
    const at = cmap + 4 + i * 8;
    const sub = cmap + font.readUInt32BE(at + 4);
    if (font.readUInt16BE(at) !== 3 || font.readUInt16BE(at + 2) !== 1 || font.readUInt16BE(sub) !== 4) continue;
    const segX2 = font.readUInt16BE(sub + 6);
    const ends = sub + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    for (let s = 0; s < segX2; s += 2) {
      if (cp > font.readUInt16BE(ends + s)) continue;
      const start = font.readUInt16BE(starts + s);
      if (cp < start) return 0;
      const delta = font.readUInt16BE(deltas + s);
      const range = font.readUInt16BE(ranges + s);
      if (range === 0) return (cp + delta) & 0xffff;
      const g = font.readUInt16BE(ranges + s + range + (cp - start) * 2);
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
  }
  throw new Error("no format 4 cmap");
}

/** A glyph's advance, in font units. */
function advance(glyph: number): number {
  const metrics = font.readUInt16BE(table("hhea") + 34);
  return font.readUInt16BE(table("hmtx") + Math.min(glyph, metrics - 1) * 4);
}

/** Adobe's glyph names for U+0020 to U+007E, then U+00A0 to U+00FF (a no-break space is a space). */
const ASCII_NAMES =
  "space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore grave a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde".split(
    " ",
  );
const LATIN1_NAMES =
  "space exclamdown cent sterling currency yen brokenbar section dieresis copyright ordfeminine guillemotleft logicalnot hyphen registered macron degree plusminus twosuperior threesuperior acute mu paragraph periodcentered cedilla onesuperior ordmasculine guillemotright onequarter onehalf threequarters questiondown Agrave Aacute Acircumflex Atilde Adieresis Aring AE Ccedilla Egrave Eacute Ecircumflex Edieresis Igrave Iacute Icircumflex Idieresis Eth Ntilde Ograve Oacute Ocircumflex Otilde Odieresis multiply Oslash Ugrave Uacute Ucircumflex Udieresis Yacute Thorn germandbls agrave aacute acircumflex atilde adieresis aring ae ccedilla egrave eacute ecircumflex edieresis igrave iacute icircumflex idieresis eth ntilde ograve oacute ocircumflex otilde odieresis divide oslash ugrave uacute ucircumflex udieresis yacute thorn ydieresis".split(
    " ",
  );

/** Helvetica Bold's advances by glyph name, from pdfkit's copy of the AFM; null when pdfkit is absent. */
function helveticaBold(): Map<string, number> | null {
  let file: string;
  try {
    // pdfkit's `exports` hides its `package.json`, so walk from the main entry, which sits in `js/`.
    file = join(dirname(createRequire(__filename).resolve("pdfkit")), "data", "Helvetica-Bold.afm");
  } catch {
    return null;
  }
  if (!existsSync(file)) return null;
  const widths = new Map<string, number>();
  for (const line of readFileSync(file, "latin1").split("\n")) {
    const m = /^C -?\d+ ; WX (\d+) ; N (\S+)/.exec(line);
    if (m) widths.set(m[2]!, Number(m[1]));
  }
  return widths;
}

const afm = helveticaBold();

/** Every code point of the two tables with its glyph name, in the tables' order. */
const TABLE = [
  ...ASCII_NAMES.map((name, i) => [0x20 + i, name] as const),
  ...LATIN1_NAMES.map((name, i) => [0xa0 + i, name] as const),
];

describe("inkWidth reads the two faces", () => {
  it("names the whole table", () => {
    expect(TABLE.length).toBe(95 + 96);
  });

  it("holds both faces: every character at the wider of its Roboto and its Helvetica Bold advance", () => {
    if (!afm) {
      if (process.env.CI) throw new Error("optional dep pdfkit missing in CI: the AFM was not read");
      console.warn("pdfkit absent: Helvetica-Bold.afm not read, the table is held to Roboto alone");
    }
    expect(unitsPerEm).toBe(2048);
    let boldWins = 0;
    for (const [cp, name] of TABLE) {
      const glyph = glyphOf(cp);
      const roboto = advance(glyph) / unitsPerEm;
      expect(glyph, `U+${cp.toString(16)}`).toBeGreaterThan(0);
      const drawn = inkWidth(String.fromCodePoint(cp), 1);
      if (afm) {
        const bold = afm.get(name);
        expect(bold, name).toBeDefined();
        expect(drawn, `U+${cp.toString(16)} ${name}`).toBeCloseTo(Math.max(roboto, bold! / 1000), 12);
        if (bold! / 1000 > roboto) boldWins++;
      } else expect(drawn, `U+${cp.toString(16)}`).toBeGreaterThanOrEqual(roboto - 1e-12);
    }
    // Each face decides some of the table, or the other is no part of the envelope.
    if (afm) expect(boldWins).toBeGreaterThan(40);
    if (afm) expect(boldWins).toBeLessThan(TABLE.length - 10);
  });

  it("reads the names G11 measured no narrower than Roboto draws them, and wider where the bold is", () => {
    const em = (s: string): string => (inkWidth(s, 1000) / s.length / 1000).toFixed(3);
    // Roboto alone: 0.769, 0.739, 0.613, 0.358.
    expect(em("WC")).toBe("0.833");
    expect(em("HWR")).toBe("0.796");
    expect(em("BEDROOM 1")).toBe("0.678");
    expect(em("Utility")).toBe("0.397");
  });

  it("sums the characters, so a text scales with its size and adds up", () => {
    expect(inkWidth("Küche", 100) * 2).toBeCloseTo(inkWidth("Küche", 200), 9);
    expect(inkWidth("Flur", 175) + inkWidth("WC", 175)).toBeCloseTo(inkWidth("FlurWC", 175), 9);
    expect(inkWidth("", 175)).toBe(0);
  });

  it("gets a CJK name right: one em a character, where the flat estimate read half that", () => {
    expect(inkWidth("主卧室", 100)).toBe(300);
    expect(inkWidth("キッチン", 100)).toBe(400);
    expect(inkWidth("거실", 100)).toBe(200);
    // Fullwidth forms and the ideographic plane past the BMP, one code point each.
    expect(inkWidth("Ａ", 100)).toBe(100);
    expect(inkWidth("𠀋", 100)).toBe(100);
    expect(inkWidth("主卧室", 100)).toBeGreaterThan(textWidth("主卧室", 100));
  });

  it("takes the shared estimate for any other script", () => {
    for (const ch of ["Я", "Ω", "ß́".slice(1), "ก", "א"]) expect(inkWidth(ch, 100)).toBeCloseTo(100 * EM_PER_CHAR, 9);
  });

  it("measures a wrapped text by its widest line at the width it draws", () => {
    const text = (extra: object): Extract<ScenePrim, { t: "text" }> => ({
      t: "text",
      at: { x: 0, y: 0 },
      value: "Abstell- raum",
      size: 100,
      anchor: "middle",
      baseline: "central",
      ...extra,
    });
    const block = { lines: ["Abstell-", "raum"], pitch: 120 };
    expect(inkExtent(text({ block }))).toEqual({ w: inkWidth("Abstell-", 100), h: 220 });
    expect(inkExtent(text({})).h).toBe(textExtent(text({})).h);
  });
});
