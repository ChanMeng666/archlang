import { describe, expect, it } from "vitest";
import { ERROR_CATALOG } from "../src/error-catalog.js";
import { FAMILY_NOUN } from "../src/lint/coverage.js";
import { LINT_RULES } from "../src/lint/rules/index.js";
import { RULE_CLASS } from "./d4-oracle.js";
import { DECIDED } from "./stage-decisions.js";

/**
 * Where a lint rule is registered beyond its module, as one test per place (`.claude/commands/new-lint-rule.md`
 * is the same list as a checklist). A new rule fails every `it` below that it missed, each naming the file
 * to edit, so one run lists everything left to do.
 *
 * `src/lint/ruleset.ts` is not a registration site: it holds thresholds a rule may read, not a list of
 * rules, so nothing there can be derived from `LINT_RULES`.
 */

/** `LINT_RULES`, in order. ORDER IS CONTRACT (`src/lint/rules/index.ts`): the emitted diagnostic array is
 *  pinned by tests and diffed by agents, so a new rule is APPENDED here at its position in the list. */
const EXPECTED_ORDER = [
  "per-room",
  "furniture-overlap",
  "furn-clearance",
  "fixture-floating",
  "fixture-wrong-room",
  "furniture-wall-collision",
  "reachability",
  "swing-obstructed",
  "doorway-blocked",
  "door-clearance",
  "room-no-clear-path",
  "no-entrance",
  "path-too-narrow",
  "circuitous-path",
  "alias-match",
  "fixture-back-to-room",
  "dim-inside",
  "stair-unmatched",
  "dim-overlap",
  "room-not-equator-facing",
  "pocket-run",
  "outdoor-overlaps-room",
  "balcony-no-door",
  "door-near-corner",
  "opening-not-dimensioned",
  "room-via-private",
  "wet-room-door",
  "entrance-into-private",
  "opening-at-junction",
  "opening-overlap",
  "connector-ambiguous",
  "habitable-no-window",
  "room-missing-defining",
  "boundary-no-wall",
  "floor-unassigned",
  "room-outside-shell",
  "furn-clear-declared",
  "seat-facing-away",
  "dim-text-mismatch",
  "annotation-overlap",
  "title-overflow",
  "wc-side-clearance",
  "furniture-over-window",
  "footprint-transposed",
  "leaf-across-doorway",
  "swing-over-stair",
  "stair-no-landing",
  "stair-side-entry",
  "stair-head-void",
  "stair-too-steep",
  "shaft-footprint-mismatch",
  "hob-under-window",
  "hob-fridge-gap",
  "leaf-too-wide",
  "accessible-wc-side-wall",
  "exit-approach-blocked",
  "bed-undersized",
  "wall-end-short",
  "furniture-on-stair",
  "exterior-ring-open",
  "furniture-on-void",
];

const decidedCodes = new Set(Object.values(DECIDED).flat());

/** Fail with every offender listed, or pass when there is none. */
const none = (offenders: string[], fix: string): void => {
  expect(offenders, `${fix}\n  missing:\n    ${offenders.join("\n    ")}\n`).toEqual([]);
};

describe("a lint rule is registered in every place a rule is listed", () => {
  it("LINT_RULES order is pinned: append the new rule's name at its position in test/lint-rule-order.test.ts", () => {
    const actual = LINT_RULES.map((r) => r.name);
    const added = actual.filter((n) => !EXPECTED_ORDER.includes(n));
    const gone = EXPECTED_ORDER.filter((n) => !actual.includes(n));
    expect(
      actual,
      `append the new rule's name at its position in test/lint-rule-order.test.ts (EXPECTED_ORDER). ` +
        `not pinned: [${added.join(", ")}]; pinned but no longer a rule: [${gone.join(", ")}]`,
    ).toEqual(EXPECTED_ORDER);
  });

  it("every rule is classified in RULE_CLASS (test/d4-oracle.ts)", () => {
    none(
      LINT_RULES.filter((r) => RULE_CLASS[r.name] === undefined).map((r) => r.name),
      `add the rule to RULE_CLASS in test/d4-oracle.ts ("invariant" unless its doc comment says otherwise)`,
    );
  });

  it("every code a rule may emit is catalogued in ERROR_CATALOG (src/error-catalog.ts)", () => {
    none(
      LINT_RULES.flatMap((r) =>
        r.codes.filter((c) => ERROR_CATALOG[c] === undefined).map((c) => `${c} (rule ${r.name})`),
      ),
      `add a catalogue entry (with a firing example) for each code in src/error-catalog.ts, then npm run gen:all`,
    );
  });

  it("every code a rule may emit has a stage row in DECIDED (test/stage-decisions.ts)", () => {
    none(
      LINT_RULES.flatMap((r) => r.codes.filter((c) => !decidedCodes.has(c)).map((c) => `${c} (rule ${r.name})`)),
      `add the code to its stage's row in DECIDED in test/stage-decisions.ts, and bump the per-stage counts in test/stages.test.ts`,
    );
  });

  // tsc already rejects a family missing from FAMILY_NOUN (a Record over LintFamily); this keeps the
  // failure in the same run as the other sites.
  it("every rule's family has words in FAMILY_NOUN (src/lint/coverage.ts)", () => {
    none(
      LINT_RULES.filter((r) => FAMILY_NOUN[r.family] === undefined).map((r) => `${r.name} (family ${r.family})`),
      `add the family to LintFamily and FAMILY_NOUN in src/lint/coverage.ts`,
    );
  });
});
