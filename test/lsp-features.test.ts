/**
 * T5.3 — full LSP feature core (pure functions over source + offset).
 *
 * Exercises hover, completion, go-to-definition, rename, and signature help on a
 * controlled source that uses values, a function, a component, params, and
 * element keywords.
 */

import { describe, expect, it } from "vitest";
import { completion, definition, hover, rename, signatureHelp } from "../src/index.js";
import { FIXTURE_CATEGORIES } from "../src/elements/fixtures-glyphs.js";
import { defaultFootprint } from "../src/fixtures-catalog.js";

const SRC = [
  'plan "T" {',
  "  units mm",
  "  let W = 4000",
  "  let aream2(w, h) = w * h",
  "  component bed(x, y) {",
  "    furniture bed at (x, y) size 1500x2000",
  "  }",
  "  wall exterior thickness 200 { (0, 0) (W, 0) (W, 4000) close }",
  '  room at (0, 0) size W x 3000 label "Room"',
  "  let area = aream2(W, 3000)",
  "  bed(300, 300)",
  "}",
].join("\n");

/** Offset just inside the first occurrence of `needle` (optionally past `plus`). */
const at = (needle: string, plus = 1): number => SRC.indexOf(needle) + plus;

describe("T5.3 — hover", () => {
  it("shows an element signature + docs for a keyword", () => {
    const h = hover(SRC, at("room at"));
    expect(h).not.toBeNull();
    expect(h!.contents).toContain("room");
    expect(h!.contents).toContain("size WxH");
    expect(h!.contents.toLowerCase()).toContain("filled rectangle");
  });

  it("shows the definition of an in-scope value reference", () => {
    const h = hover(SRC, at("(W, 0)") + 1); // the `W` inside the wall
    expect(h!.contents).toContain("let W");
  });

  it("shows a function's signature on its name", () => {
    const h = hover(SRC, at("aream2(w"));
    expect(h!.contents).toContain("aream2(w, h)");
  });

  it("shows a parameter binding inside a component body", () => {
    // the `x` in `furniture bed at (x, y)`
    const h = hover(SRC, SRC.indexOf("at (x, y)") + 4);
    expect(h!.contents).toContain("parameter x of bed");
  });
});

describe("T5.3 — completion", () => {
  it("offers element keywords, control keywords, and in-scope bindings", () => {
    const items = completion(SRC, at("bed(300")); // plan scope
    const labels = items.map((i) => i.label);
    expect(labels).toContain("room");
    expect(labels).toContain("wall");
    expect(labels).toContain("for");
    expect(labels).toContain("W");
    expect(labels).toContain("aream2");
    expect(labels).toContain("bed");
  });

  it("does not leak component params into plan scope", () => {
    const labels = completion(SRC, at("bed(300")).map((i) => i.label);
    expect(labels).not.toContain("x"); // `x` is a param local to `component bed`
  });
});

// ---------------------------------------------------------------------------
// G.7 — the fixture category slot: the core's first POSITION-SENSITIVE completion.
//
// `completion()` was context-free — every setting keyword, control keyword, registry element,
// builtin and in-scope binding, wherever the cursor was. These cases pin the one exception and,
// more importantly, pin that it IS an exception:
//
//   - PRESENCE, bound to the source of truth by SET EQUALITY against `FIXTURE_CATEGORIES`, so a
//     family added with no completion goes red with no edit here;
//   - ABSENCE everywhere else, stated two ways — no fixture WORD leaks into a plan-scope list,
//     and no item of the `enum` KIND exists outside the slot (the fixture branch is that kind's
//     only producer, so this is the same claim made structurally);
//   - an every-offset SWEEP whose expected ranges are derived by hand from the source text
//     rather than from the detector — the only shape of expectation that can catch the detector
//     and its test being wrong together.
//
// A one-directional test would pass if the 129 words were simply added everywhere, which is
// exactly the change that would make the feature worse than nothing.
// ---------------------------------------------------------------------------

/** Two `furniture` statements (bare and `id=`-prefixed), plus the two places the word
 *  `furniture` appears WITHOUT opening a slot: inside a string literal and inside a comment. */
const FSRC = [
  'plan "F" {',
  "  units mm",
  "  furniture bed at (0,0) size 1500x2000",
  "  furniture id=b2 sofa at (0,3000) size 2000x900",
  '  room at (0,0) size 4000x4000 label "furniture bed"',
  "  # furniture bed",
  "}",
].join("\n");

const labelsAt = (src: string, off: number): string[] => completion(src, off).map((i) => i.label);
/** The slot branch is the only producer of `enum`, so this IS "the fixture list is showing". */
const showsFixtures = (src: string, off: number): boolean => completion(src, off).some((i) => i.kind === "enum");

// The two category words, located by hand in the source text.
const BED = FSRC.indexOf("furniture bed at") + "furniture ".length;
const SOFA = FSRC.indexOf("furniture id=b2 sofa") + "furniture id=b2 ".length;
const ID = FSRC.indexOf("id=b2");
/** Inclusive offset ranges the cursor is in a category slot for — hand-derived: from the first
 *  offset past the prefix (which is the start of the category word) through the word's END, so
 *  `furniture bed|` can still be extended to `bedside_table`.
 *
 *  The `id` of `furniture id=b2 …` is the third range, and it is CORRECT that it is one: while
 *  the cursor is still inside that word there is nothing to distinguish `furniture id…` from a
 *  category being typed — the `=` that settles it has not been written yet. Suppressing the
 *  list on those two characters would mean the popup blinking out for anyone whose category
 *  happens to start `id`. From the `=` onward (and through `b2`) the slot is shut again, which
 *  is the part that had to be got right. */
const SLOT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [BED, BED + "bed".length],
  [ID, ID + "id".length],
  [SOFA, SOFA + "sofa".length],
];
const inSlotRange = (off: number): boolean => SLOT_RANGES.some(([a, b]) => off >= a && off <= b);

describe("G.7 — presence: the category slot offers the fixture vocabulary", () => {
  it("offers EXACTLY the catalogued categories — set equality against FIXTURE_CATEGORIES", () => {
    const items = completion(FSRC, BED);
    expect(new Set(items.map((i) => i.label))).toEqual(new Set(FIXTURE_CATEGORIES));
    // No duplicates: the slot list is that table flattened, and the table has none.
    expect(items.length).toBe(FIXTURE_CATEGORIES.length);
    // …and nothing from the context-free list rode along.
    for (const kw of ["room", "wall", "for", "units", "min"]) expect(items.map((i) => i.label)).not.toContain(kw);
  });

  it("opens after the `id=` prefix too, since `parseIdOpt` runs before the category", () => {
    expect(new Set(labelsAt(FSRC, SOFA))).toEqual(new Set(FIXTURE_CATEGORIES));
  });

  it("returns the FULL set mid-word — both shipped clients filter by the typed prefix", () => {
    // `furniture so|fa`, two characters in. Narrowing here would fight VS Code's and
    // CodeMirror's own prefix filtering, so the set must not shrink.
    expect(new Set(labelsAt(FSRC, SOFA + 2))).toEqual(new Set(FIXTURE_CATEGORIES));
  });

  it("kinds are all `enum` — reused rather than a new COMPLETION_KINDS member", () => {
    expect(new Set(completion(FSRC, BED).map((i) => i.kind))).toEqual(new Set(["enum"]));
  });
});

describe("G.7 — absence: everywhere else is exactly what it was", () => {
  it("LAW: a plan-scope completion is the context-free list, with no fixture word in it", () => {
    const items = completion(FSRC, FSRC.indexOf("  units mm") + 2);
    // Stated by NAME …
    for (const word of FIXTURE_CATEGORIES) expect(items.map((i) => i.label)).not.toContain(word);
    // … and structurally: `enum` has exactly one producer, so its absence is the list's absence.
    expect(items.some((i) => i.kind === "enum")).toBe(false);
    // The pre-existing surface is still whole.
    for (const kw of ["room", "wall", "furniture", "for", "units", "min"])
      expect(items.map((i) => i.label)).toContain(kw);
  });

  it("does not open on the word `furniture` itself, or once the category is past", () => {
    const kw = FSRC.indexOf("furniture bed at");
    expect(showsFixtures(FSRC, kw)).toBe(false); // `|furniture`
    expect(showsFixtures(FSRC, kw + "furniture".length)).toBe(false); // `furniture|` — still typing it
    expect(showsFixtures(FSRC, FSRC.indexOf("bed at") + "bed ".length)).toBe(false); // `furniture bed |at`
  });

  it("is not fooled by the word inside a string literal or a comment", () => {
    // Both are why detection reads TOKENS: the lexer has already classified them out.
    expect(showsFixtures(FSRC, FSRC.indexOf('"furniture bed"') + '"furniture '.length)).toBe(false);
    expect(showsFixtures(FSRC, FSRC.indexOf("# furniture bed") + "# furniture ".length)).toBe(false);
  });

  it("does not open on `set furniture(…)`, where the word names an element kind", () => {
    const src = 'plan "S" {\n  units mm\n  set furniture(rotate: 90)\n}';
    expect(showsFixtures(src, src.indexOf("set furniture") + "set furniture".length + 1)).toBe(false);
  });

  it("SWEEP: across every offset in the source, the slot is open exactly where it should be", () => {
    const wrong: string[] = [];
    for (let off = 0; off <= FSRC.length; off++) {
      if (showsFixtures(FSRC, off) !== inSlotRange(off))
        wrong.push(`${off}: …${JSON.stringify(FSRC.slice(Math.max(0, off - 14), off))}|`);
    }
    expect(wrong).toEqual([]);
  });
});

describe("G.7 — the item payload is derived from the catalogue", () => {
  const items = completion(FSRC, BED);
  const item = (label: string) => items.find((i) => i.label === label)!;

  it("names the family an alias belongs to, so `tub` and `bathtub` read as one piece", () => {
    expect(item("tub").detail).toContain("= bathtub");
    expect(item("tub").doc).toContain("another name for `bathtub`");
    expect(item("bathtub").detail).not.toContain("="); // a canonical name claims no such thing
  });

  it("carries each family's own default footprint, read from the catalogue not retyped", () => {
    for (const word of ["bathtub", "wc", "treadmill", "bed"]) {
      const fp = defaultFootprint(word)!;
      expect(item(word).detail).toContain(`${fp.along} × ${fp.depth} mm`);
    }
    // `oven` and `sofa` are catalogued with no footprint, so they claim none — and a canonical
    // name with nothing to say carries no `detail` at all rather than an empty string.
    for (const word of ["oven", "sofa"]) {
      expect(defaultFootprint(word)).toBeNull();
      expect(item(word).detail).toBeUndefined();
    }
    // Every catalogued footprint reaches its own item, so the detail line cannot go stale for
    // one family while staying right for the rest.
    for (const word of FIXTURE_CATEGORIES) {
      const fp = defaultFootprint(word);
      if (fp) expect(item(word).detail).toContain(`${fp.along} × ${fp.depth} mm`);
    }
  });

  it("surfaces the flags that change how a piece may be written or placed", () => {
    expect(item("wc").doc).toContain("needs a wall behind it"); // requiresWall — services only
    expect(item("bed").doc).toContain("has a back worth turning to a wall"); // directional
    expect(item("rug").doc).toContain("walked over rather than round"); // underlay
    expect(item("range_hood").doc).toContain("above the plan's cut plane"); // overhead
    // A sofa is arranged, not installed: none of the three.
    expect(item("sofa").doc).not.toContain("needs a wall behind it");
    expect(item("sofa").doc).not.toContain("has a back worth turning to a wall");
  });

  it("says the slot is NOT closed — an uncatalogued word is legal and draws a rectangle", () => {
    for (const i of items) expect(i.doc).toContain("Any word is legal here");
  });

  it("every catalogued word gets a doc naming itself, so none ships blank", () => {
    for (const word of FIXTURE_CATEGORIES) expect(item(word).doc).toContain(`**${word}**`);
  });
});

describe("T5.3 — go to definition", () => {
  it("jumps from a reference to its `let`", () => {
    const def = definition(SRC, at("(W, 0)") + 1);
    expect(def).not.toBeNull();
    expect(SRC.slice(def!.start, def!.end)).toBe("W");
    // The definition is the `W` in `let W = 4000`, not a later use.
    expect(def!.start).toBe(SRC.indexOf("let W = ") + 4);
  });
});

describe("T5.3 — rename", () => {
  it("renames a global binding at every use, scoped correctly", () => {
    const edits = rename(SRC, at("let W = ") + 4, "WIDTH");
    expect(edits).not.toBeNull();
    // def + (W,0) + (W,4000) + `size W` + the W in `aream2(W, 3000)`
    expect(edits!.length).toBe(5);
    for (const e of edits!) expect(SRC.slice(e.span.start, e.span.end)).toBe("W");
    for (const e of edits!) expect(e.newText).toBe("WIDTH");
  });

  it("renames a component parameter only within its component", () => {
    const edits = rename(SRC, SRC.indexOf("bed(x, y)") + 4, "px"); // the param `x`
    expect(edits).not.toBeNull();
    // the param decl + its single use `(x, y)` — nothing outside the component
    expect(edits!.length).toBe(2);
    for (const e of edits!) expect(e.span.start).toBeGreaterThan(SRC.indexOf("component bed"));
    for (const e of edits!) expect(e.span.end).toBeLessThan(SRC.indexOf("wall exterior"));
  });
});

describe("T5.3 — signature help", () => {
  it("describes a component call and tracks the active argument", () => {
    const sig0 = signatureHelp(SRC, SRC.indexOf("bed(300") + 4);
    expect(sig0!.label).toContain("bed(x, y)");
    expect(sig0!.params).toEqual(["x", "y"]);
    expect(sig0!.activeParameter).toBe(0);
    const sig1 = signatureHelp(SRC, SRC.indexOf("bed(300, 300") + 9); // after the comma
    expect(sig1!.activeParameter).toBe(1);
  });

  it("describes a value-function call", () => {
    const sig = signatureHelp(SRC, SRC.indexOf("= aream2(W, 3000") + 9);
    expect(sig).not.toBeNull();
    expect(sig!.params).toEqual(["w", "h"]);
  });
});
