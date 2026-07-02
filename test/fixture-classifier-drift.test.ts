/**
 * Drift guards for the fixture classifier lists. Historically three places listed
 * fixture categories (the catalog, the renderer's glyph switch, and lint's
 * WET_FIX/KITCHEN_FIX literals) with only one guarded. The zone sets are now
 * derived from the catalog; these tests pin (a) the derived membership to the
 * exact historical lint literals — changing membership is a behaviour change that
 * must be made here, deliberately — and (b) glyph categories ⊆ catalog keys.
 */

import { describe, expect, it } from "vitest";
import { FIXTURE_CATEGORIES } from "../src/elements/fixtures-glyphs.js";
import { CATALOG_CATEGORIES, zoneFixtureCategories } from "../src/fixtures-catalog.js";
import { KITCHEN_FIX, WET_FIX } from "../src/lint/rules/per-room.js";

describe("fixture classifier — single source", () => {
  it("wet-zone membership equals lint's historical WET_FIX exactly", () => {
    expect([...zoneFixtureCategories("wet")].sort()).toEqual(
      ["wc", "toilet", "basin", "sink", "shower", "bath", "bathtub", "tub"].sort(),
    );
    expect(WET_FIX).toEqual(zoneFixtureCategories("wet"));
  });

  it("kitchen-zone membership equals lint's historical KITCHEN_FIX exactly", () => {
    expect([...zoneFixtureCategories("kitchen")].sort()).toEqual(
      [
        "sink",
        "kitchen_sink",
        "stove",
        "hob",
        "cooktop",
        "oven",
        "counter",
        "worktop",
        "fridge",
        "refrigerator",
      ].sort(),
    );
    expect(KITCHEN_FIX).toEqual(zoneFixtureCategories("kitchen"));
  });

  it("every glyph category has a catalog entry (aliases included)", () => {
    const catalog = new Set(CATALOG_CATEGORIES);
    for (const c of FIXTURE_CATEGORIES) expect(catalog.has(c), `glyph category "${c}" missing from catalog`).toBe(true);
  });
});
