/**
 * `inkWidth` (`src/text-metrics.ts`) against the font it says it reads.
 *
 * The compiler loads no font, so the width of a text comes from a table typed into the source.
 * This file reads the face itself and holds every entry of that table to it, so the table cannot
 * drift from `assets/fonts/Roboto-Regular.ttf`. A small OpenType reader below, written here so the
 * check needs no optional dependency: `head` for the em, `cmap` for the glyph, `hmtx` for the advance.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("inkWidth reads the bundled face", () => {
  it("states every printable ASCII and Latin-1 character at its advance", () => {
    expect(unitsPerEm).toBe(2048);
    let seen = 0;
    for (const [from, to] of [
      [0x20, 0x7e],
      [0xa0, 0xff],
    ] as const) {
      for (let cp = from; cp <= to; cp++) {
        const glyph = glyphOf(cp);
        expect(glyph, `U+${cp.toString(16)}`).toBeGreaterThan(0);
        // At a font size of the em, the width is the advance itself, in font units.
        expect(inkWidth(String.fromCodePoint(cp), unitsPerEm), `U+${cp.toString(16)}`).toBe(advance(glyph));
        seen++;
      }
    }
    expect(seen).toBe(95 + 96);
  });

  it("gives the three names G11 measured their means, not 0.5", () => {
    const em = (s: string): string => (inkWidth(s, 1000) / s.length / 1000).toFixed(3);
    expect(em("WC")).toBe("0.769");
    expect(em("HWR")).toBe("0.739");
    expect(em("BEDROOM 1")).toBe("0.613");
    expect(em("Utility")).toBe("0.358");
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
