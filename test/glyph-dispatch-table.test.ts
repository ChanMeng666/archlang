import { describe, expect, it } from "vitest";
import {
  canonicalFixture,
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
const RECT = { x: 100, y: 200, w: 1800, h: 900 };

describe("fixture glyph dispatch is by family", () => {
  it("every catalogued category draws a symbol, and an alias draws exactly what its family does", () => {
    for (const category of FIXTURE_CATEGORIES) {
      expect(hasFixtureGlyph(category), category).toBe(true);
      const family = canonicalFixture(category);
      expect(family, category).toBeDefined();
      expect(fixtureGlyph(category, RECT, DEFAULT_THEME, SIZES), category).toEqual(
        fixtureGlyph(family as string, RECT, DEFAULT_THEME, SIZES),
      );
    }
  });

  it("an unknown word draws nothing, including Object.prototype names", () => {
    for (const word of ["no_such_thing", "", "constructor", "toString", "__proto__"]) {
      expect(fixtureGlyph(word, RECT, DEFAULT_THEME, SIZES), word).toBeNull();
    }
  });
});
