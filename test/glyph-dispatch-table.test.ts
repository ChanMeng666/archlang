/** fixture glyph dispatch is by family. */

import { sha256 } from "./helpers/digest.js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_FIXTURES,
  drawnFamilies,
  FIXTURE_CATEGORIES,
  fixtureGlyph,
  hasFixtureGlyph,
} from "../src/elements/fixtures-glyphs.js";
import { DEFAULT_THEME } from "../src/theme.js";

const SIZES = {
  refDim: 1000,
  wallStroke: 20,
  thin: 6,
  roomFont: 40,
  areaFont: 30,
  dimFont: 30,
  furnFont: 24,
  margin: 100,
  hatchGap: 50,
};
const RECTS = [
  { x: 100, y: 200, w: 1800, h: 900 },
  { x: 0, y: 0, w: 1000, h: 1000 },
];

const digest = (category: string): string =>
  sha256(JSON.stringify(RECTS.map((r) => fixtureGlyph(category, r, DEFAULT_THEME, SIZES))));

const GOLDEN = JSON.parse(readFileSync("test/tables/glyph-dispatch.json", "utf8")) as Record<string, string>;

describe("fixture glyph dispatch is by family", () => {
  it("the drawer table's families equal the canonical families of FIXTURE_FAMILIES, both ways", () => {
    const drawn = new Set(drawnFamilies());
    const canonical = new Set(CANONICAL_FIXTURES);
    expect([...canonical].filter((f) => !drawn.has(f))).toEqual([]);
    expect([...drawn].filter((f) => !canonical.has(f))).toEqual([]);
    expect(drawn.size).toBe(CANONICAL_FIXTURES.length);
  });

  // The same `hasFixtureGlyph` check as `test/cli-manifest.test.ts`'s (manifest = categories ⊆
  // drawn); what it adds is only where it fails: here, beside the drawer table and its golden,
  // naming the category whose drawer is empty on the 1x1 probe, which the golden cannot see.
  it("every catalogued category draws a symbol", () => {
    for (const category of FIXTURE_CATEGORIES) expect(hasFixtureGlyph(category), category).toBe(true);
  });

  // The pin that stops an alias from ever diverging from its family: a moved hash is a drawing
  // change to explain (docs/testing.md § 3), not a golden to re-bless. It is the drawing identity
  // at two real rects (so an empty drawer there moves the hash); the test above is the 1x1-probe
  // predicate the legend and the LSP read, which this does not imply.
  it("each alias's primitives match test/tables/glyph-dispatch.json", () => {
    expect(Object.keys(GOLDEN).sort()).toEqual([...FIXTURE_CATEGORIES].sort());
    for (const category of FIXTURE_CATEGORIES) expect(digest(category), category).toBe(GOLDEN[category]);
  });

  it("an unknown word draws nothing, including Object.prototype names", () => {
    for (const word of ["no_such_thing", "", "constructor", "toString", "__proto__"]) {
      expect(fixtureGlyph(word, RECTS[0] as (typeof RECTS)[number], DEFAULT_THEME, SIZES), word).toBeNull();
    }
  });
});
