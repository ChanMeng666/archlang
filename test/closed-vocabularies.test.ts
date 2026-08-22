/**
 * Every CLOSED value set in the language must be highlightable.
 *
 * ## The rule
 *
 * A closed value set is a frozen list of literal words the parser accepts in one
 * position — `AUTO_DIMS_MODES`, `NORTH_DIRS`, `PAPER_SIZES`, `DOOR_KINDS`, and the rest.
 * Since v1.26.0 each lives ONCE, in `src/ast.ts` (or beside `KEYWORDS` for the door
 * tables), and interpolates into every description of the language. This asserts the
 * other half of that arrangement: every value in every such set also appears in
 * `KEYWORDS`, the flat highlighting bucket the three editor grammars are generated from.
 *
 * A value that is absent is not a broken build and not a wrong answer — it is a word the
 * parser accepts, the spec documents, and every renderer then draws as if it were a
 * user-chosen identifier. That is exactly what happened to `dims auto overall`: `all`,
 * `overall`, `rooms` and `walls` had been the parser's accept-list AND the spec's grammar
 * line since v1.20, and were in no editor grammar at all. Nothing could notice, because
 * `check:drift` proves a generator reproduces its own output, never that the output is
 * complete — the same structural blindness `test/spec-forms.test.ts` was built for, one
 * layer down. `site`'s `street` / `hemisphere` shipped the same way in v1.25.
 *
 * ## Why it is DERIVED, not a list
 *
 * The sets are discovered by walking the module's own exports for frozen string arrays,
 * so a NEW closed set is covered the moment it is exported — with no edit here. A test
 * that hand-listed the sets it checks would be the very thing it is checking against.
 *
 * `test/door-enums.test.ts` states this law for `DOOR_ENUMS` specifically and in more
 * depth (it also pins the per-clause groupings); this generalises the subset half of it
 * to every closed set in the language.
 */

import { describe, expect, it } from "vitest";
import * as ast from "../src/ast.js";
import { DOOR_ENUMS, DOOR_HINGE_NEAR, DOOR_KINDS, KEYWORDS } from "../src/grammar/tokens.js";
import * as sheet from "../src/sheet.js";

/** Every word `KEYWORDS` can highlight, in any category. */
const HIGHLIGHTED = new Set<string>([
  ...KEYWORDS.control,
  ...KEYWORDS.element,
  ...KEYWORDS.attribute,
  ...KEYWORDS.enum,
]);

/**
 * Closed value sets, DISCOVERED from a module's exports rather than listed: a
 * SCREAMING_CASE export whose value is an array of plain words. `REL_DIR_AXIS` and
 * `PAPER_MM` are records, not arrays, so they fall out on their own; `AXIS_ALIGNS` is a
 * record OF arrays and is unpacked below.
 */
function closedSets(mod: Record<string, unknown>, source: string): Array<[string, readonly string[]]> {
  const out: Array<[string, readonly string[]]> = [];
  for (const [name, value] of Object.entries(mod)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) continue;
    if (Array.isArray(value) && value.every((v) => typeof v === "string" && /^[a-zA-Z][\w-]*$/.test(v))) {
      out.push([`${source}.${name}`, value as readonly string[]]);
      continue;
    }
    // A record of arrays (AXIS_ALIGNS: {v: [...], h: [...]}) — take each row.
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const rows = Object.entries(value as Record<string, unknown>);
      if (rows.length > 0 && rows.every(([, v]) => Array.isArray(v) && v.every((x) => typeof x === "string"))) {
        for (const [key, v] of rows) out.push([`${source}.${name}.${key}`, v as readonly string[]]);
      }
    }
  }
  return out;
}

const SETS: Array<[string, readonly string[]]> = [
  ...closedSets(ast as unknown as Record<string, unknown>, "ast"),
  // `PAPER_SIZES` / `PAPER_ORIENTATIONS` live in the sheet layer, not the AST.
  ...closedSets(sheet as unknown as Record<string, unknown>, "sheet"),
  // The door tables sit beside KEYWORDS rather than in ast.ts (see their doc comment).
  ["tokens.DOOR_KINDS", DOOR_KINDS],
  ["tokens.DOOR_HINGE_NEAR", DOOR_HINGE_NEAR],
  ...Object.entries(DOOR_ENUMS).map(([k, v]) => [`tokens.DOOR_ENUMS.${k}`, v] as [string, readonly string[]]),
];

/**
 * Discovered sets that are NOT language vocabulary, each with the reason — the same
 * shape as `test/spec-forms.test.ts`'s `NOT_REPRODUCED_HERE`, and pruned the same way by
 * an assertion below, so an entry cannot outlive its reason.
 *
 * The walk finds frozen string arrays; not every one of those is a set of WORDS A USER
 * TYPES. Anything listed here must be justified by what the array holds, never by the
 * inconvenience of it failing.
 */
const NOT_VOCABULARY = new Map<string, string>([
  [
    "ast.LEVEL_SHARED_KINDS",
    "AST node `kind` discriminants, not source words: `assign` and `error` are internal " +
      "tags the parser produces, and no user ever types them. (`let`/`set`/`level` are " +
      "keywords and are covered on their own, via KEYWORDS.control.)",
  ],
]);

const VOCABULARY_SETS = SETS.filter(([name]) => !NOT_VOCABULARY.has(name));

describe("every closed value set is highlightable", () => {
  it("discovers a non-trivial number of sets (a broken discovery walk must not pass vacuously)", () => {
    // If the export walk silently found nothing, every assertion below would pass while
    // checking zero words. Pin both the count and two sets by name — the one this test
    // was written for, and one from a different module.
    expect(SETS.length).toBeGreaterThanOrEqual(12);
    expect(SETS.map(([n]) => n)).toContain("ast.AUTO_DIMS_MODES");
    expect(SETS.map(([n]) => n)).toContain("sheet.PAPER_SIZES");
  });

  it("every NOT_VOCABULARY entry is still discovered, and still needed", () => {
    // Prune the exception list, so it can never quietly grow into a place to park a
    // genuine gap: an entry must name a set the walk still finds, AND that set must
    // still be uncovered — the moment its words are all in KEYWORDS, the exception is
    // stale and the row should go.
    const found = new Set(SETS.map(([n]) => n));
    for (const [name, reason] of NOT_VOCABULARY) {
      expect(found.has(name), `NOT_VOCABULARY names ${name}, which no longer exists — delete the row.`).toBe(true);
      expect(reason.length, `NOT_VOCABULARY[${name}] needs a real reason, not a placeholder.`).toBeGreaterThan(40);
      const values = SETS.find(([n]) => n === name)?.[1] ?? [];
      expect(
        values.some((v) => !HIGHLIGHTED.has(v)),
        `NOT_VOCABULARY excuses ${name}, but every one of its values is now in KEYWORDS — ` +
          `the exception is stale, delete the row and let the rule cover it.`,
      ).toBe(true);
    }
  });

  it.each(VOCABULARY_SETS)("%s is fully covered by KEYWORDS", (name, values) => {
    const missing = [...new Set(values)].filter((v) => !HIGHLIGHTED.has(v));
    expect(
      missing,
      `${name} contains ${missing.length} value(s) the parser accepts and the spec documents but ` +
        `NO editor grammar can colour: ${missing.join(", ")}. A closed value set is language ` +
        `vocabulary, so it belongs in KEYWORDS too — a value word goes in \`enum\`, a word that ` +
        `LEADS a clause goes in \`attribute\` (the categories must stay disjoint; see the note on ` +
        `\`north\` in src/grammar/tokens.ts). Then \`npm run gen:grammars\`.`,
    ).toEqual([]);
  });

  it("does NOT demand coverage of free-form fields", () => {
    // The counter-example that keeps this test honest. A wall's `category` is a `name`
    // field (src/elements/wall.ts), so `exterior` and `partition` are CONVENTIONS, not
    // keywords — `wall id=s myCategory thickness 200` is equally valid. Colouring them
    // would tell a reader they are reserved words when they are not, so their absence
    // from KEYWORDS is correct and must stay that way.
    expect(HIGHLIGHTED.has("exterior")).toBe(false);
    expect(HIGHLIGHTED.has("partition")).toBe(false);
  });
});

describe("the KEYWORDS categories stay disjoint", () => {
  it("no word appears in two categories", () => {
    // The generators build flat alternations from these lists and would have to learn
    // about duplicates; `src/grammar/tokens.ts` states the law where it explains why
    // `north` is deliberately absent from `enum`.
    const seen = new Map<string, string[]>();
    for (const [category, words] of Object.entries(KEYWORDS)) {
      for (const w of words) seen.set(w, [...(seen.get(w) ?? []), category]);
    }
    const dupes = [...seen].filter(([, cs]) => cs.length > 1);
    expect(dupes, `these words are in more than one KEYWORDS category: ${JSON.stringify(dupes)}`).toEqual([]);
  });
});
