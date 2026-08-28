/**
 * Drift guards for the fixture classifier lists. Historically three places listed
 * fixture categories (the catalog, the renderer's glyph switch, and lint's
 * WET_FIX/KITCHEN_FIX literals) with only one guarded. The zone sets are now
 * derived from the catalog; these tests pin (a) the derived membership to the
 * exact historical lint literals — changing membership is a behaviour change that
 * must be made here, deliberately — and (b) glyph categories ⊆ catalog keys.
 */

import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { CANONICAL_FIXTURES, FIXTURE_CATEGORIES, hasFixtureGlyph } from "../src/elements/fixtures-glyphs.js";
import { CATALOG_CATEGORIES, defaultFootprint, zoneFixtureCategories } from "../src/fixtures-catalog.js";
import { KITCHEN_FIX, WET_FIX } from "../src/lint/rules/per-room.js";
import { ELEMENT_GRAMMAR, assertVocabRendered } from "../scripts/gen-llm-spec.js";

describe("fixture classifier — single source", () => {
  it("wet-zone membership equals lint's historical WET_FIX exactly", () => {
    expect([...zoneFixtureCategories("wet")].sort()).toEqual(
      [
        "wc",
        "toilet",
        "basin",
        "sink",
        "shower",
        "bath",
        "bathtub",
        "tub",
        // v1.32 F1. All three are plumbed sanitary fixtures, so all three are a deliberate
        // MEMBERSHIP change: a WC block whose only fixture is a urinal, or a utility room
        // with a laundry tub in it, no longer raises `W_ROOM_NO_FIXTURE`. `water_heater`
        // and `mirror` are deliberately NOT here — a cupboard with a boiler in it is not a
        // bathroom, and a mirror over a console table is not one either.
        "bidet",
        "urinal",
        "laundry_sink",
        "laundry_tub",
      ].sort(),
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
        // Added with the room-furniture vocabulary. Both are kitchen fixtures by any
        // reading, and both are a deliberate MEMBERSHIP change: a kitchen whose only
        // appliance is a dishwasher or an island no longer raises `W_ROOM_NO_FIXTURE`.
        "dishwasher",
        "island",
        // v1.32 F1, on the same terms: a kitchen whose only appliance is a microwave, an
        // extract hood or a bar counter is a kitchen.
        "range_hood",
        "microwave",
        "bar_counter",
      ].sort(),
    );
    expect(KITCHEN_FIX).toEqual(zoneFixtureCategories("kitchen"));
  });

  it("every glyph category has a catalog entry (aliases included)", () => {
    const catalog = new Set(CATALOG_CATEGORIES);
    for (const c of FIXTURE_CATEGORIES) expect(catalog.has(c), `glyph category "${c}" missing from catalog`).toBe(true);
  });
});

/**
 * `CANONICAL_FIXTURES` — one name per family, and the list `spec.llm.md`'s furniture line
 * interpolates instead of the eight-name-plus-ellipsis it used to spell by hand.
 */
describe("the canonical fixture names", () => {
  it("is a non-empty, duplicate-free subset of the full vocabulary", () => {
    expect(CANONICAL_FIXTURES.length).toBeGreaterThan(0);
    expect([...new Set(CANONICAL_FIXTURES)]).toEqual([...CANONICAL_FIXTURES]);
    const all = new Set(FIXTURE_CATEGORIES);
    for (const c of CANONICAL_FIXTURES) expect(all.has(c), `canonical "${c}" is not a known category`).toBe(true);
  });

  it("names a family for every category — no category belongs to none", () => {
    // Aliases outnumber canonicals, so this is a real inequality, not a tautology.
    expect(FIXTURE_CATEGORIES.length).toBeGreaterThan(CANONICAL_FIXTURES.length);
  });

  it("only categories with a drawn symbol pass hasFixtureGlyph", () => {
    const drawn = FIXTURE_CATEGORIES.filter(hasFixtureGlyph);
    // Every catalogued category draws now — the five domain modules closed the last stub, so
    // the list that used to name the eight shipped families is the whole vocabulary.
    //
    // DERIVED, not retyped, and not vacuous: `hasFixtureGlyph` answers by CALLING the glyph
    // dispatch on a probe rect (see its doc comment), so it knows nothing about
    // `FIXTURE_CATEGORIES`. The day someone adds a category without writing its symbol, this
    // goes red naming that category — which a 51-name literal would do only if whoever added
    // it also remembered to extend the literal. `widget` is the standing negative: an
    // uncatalogued word must still take the labelled-rectangle fallback.
    expect(drawn).toEqual([...FIXTURE_CATEGORIES]);
    expect(hasFixtureGlyph("widget")).toBe(false);
  });
});

/**
 * The spec's `against wall` claim, EXECUTED.
 *
 * `spec.llm.md` names the categories that may omit `size`. That sentence is now interpolated
 * from `defaultFootprint`, so it cannot go stale against the catalog — but nothing yet proved
 * the catalog itself matches the resolver. These two cases compile both halves of the claim:
 * every named category really does resolve without a `size`, and every category NOT named
 * really is refused. A footprint that the resolver would not accept fails here, not in a
 * model's output.
 */
describe("size-optional `against wall` placement matches the catalog", () => {
  const plan = (category: string) => `plan "P" {
    units mm
    wall id=w exterior thickness 200 { (0,0) (10000,0) (10000,10000) (0,10000) close }
    room id=r at (0,0) size 10000x10000 label "R"
    furniture ${category} against wall w segment 0 offset 3000 in r
  }`;
  const errorCodes = (src: string): string[] =>
    compile(src, { noCache: true })
      .diagnostics.filter((d) => d.severity === "error")
      .map((d) => d.code ?? "");

  it("a catalogued footprint lets `size` be omitted", () => {
    const sized = CANONICAL_FIXTURES.filter((c) => defaultFootprint(c) !== null);
    expect(sized.length).toBeGreaterThan(8); // the eight originals plus the new vocabulary
    for (const c of sized) expect(errorCodes(plan(c)), `"${c}" should resolve without a size`).toEqual([]);
  });

  it("the spec generator throws if the furniture line stops rendering the list", () => {
    // Non-vacuity for the guard added beside `assertVocabRendered`'s other callers: the
    // eight-name-plus-ellipsis this replaced could go stale forever with `check:drift`
    // green, because that gate compares a generator to its OWN output.
    const line = ELEMENT_GRAMMAR.furniture ?? "";
    const sized = CANONICAL_FIXTURES.filter((c) => defaultFootprint(c) !== null);
    expect(() => assertVocabRendered(line, "size-optional fixture", sized, "/")).not.toThrow();
    expect(() => assertVocabRendered(line, "size-optional fixture", [...sized, "hammock"], "/")).toThrow(
      /size-optional fixture/,
    );
  });

  it("no catalogued footprint means `size` is still required", () => {
    const unsized = [...CANONICAL_FIXTURES.filter((c) => defaultFootprint(c) === null), "widget"];
    expect(unsized.length).toBeGreaterThan(1);
    for (const c of unsized) expect(errorCodes(plan(c)), `"${c}" should demand a size`).toContain("E_FURN_SIZE");
  });
});
