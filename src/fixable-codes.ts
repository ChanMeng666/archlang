/**
 * The codes `fix` can resolve: a table of the fix producers, held to their source by a test. One row
 * per producer names the codes it attaches a span edit to, the applicability its edit can carry and
 * the stage that raises it (card AF8, after TypeScript's `getSupportedErrorCodes()`).
 * `packages/mcp/scripts/gen-capabilities.ts` renders it into the `archlang://capabilities` resource,
 * grouped by applicability.
 *
 * `test/fixable-codes.test.ts` holds it to the source, over the fix sites `scripts/fix-coverage.ts`
 * sees: the codes are exactly the catalogued codes those sites attach a fix to; each code's sites call
 * its row's producer or lie in it, and call no other code's producer; each site's file gives its
 * row's stage; and every `applicability` inside the producer is written out as literals (a string, or
 * a conditional of strings), whose set is exactly the row's. A `fixId` and a `when` text are not read
 * from the source, and neither is which branch of a conditional gives which tier.
 *
 * The source check does not see a fix attached through a helper's spread (`...openRemedy(n)`), a
 * helper in another file, `Object.assign`, a spread parameter, or a producer that hands part of its
 * work to another function (`scripts/fix-coverage.ts` lists the shapes it reads). The backstop is
 * the output check: every fix `compile()`, `lint()` and `arch fix`'s `while` proof emit over the
 * corpus, the catalogue's examples and the test's reach plans must match a row in code, `fixId`,
 * applicability and stage, and every row's every code and applicability must be seen. A fix no such
 * plan reaches is checked by neither. Nothing on the compile path imports this module.
 */

import type { Applicability } from "./diagnostics.js";

/**
 * Which diagnostics a fix rides on: `compile` is `compile().diagnostics` (what the MCP `fix` tool and
 * `arch fix` both read), `lint` is `lint()` (read by `arch fix`, not by the MCP tool), and `fix` is a
 * fix `arch fix` proves itself before it attaches it (`proveWhileFixes`, `src/while-fix.ts`).
 */
export type FixStage = "compile" | "lint" | "fix";

/** One fix producer's declaration. */
export interface FixProducer {
  /** Where the producer is: a repo-relative file, and `#name` when it is one function there. */
  readonly producer: string;
  readonly stage: FixStage;
  /** Every applicability the producer's edit can carry. */
  readonly applicability: readonly Applicability[];
  /** Each code the producer attaches its fix to, with the `fixId` that fix carries (`null`: none). */
  readonly codes: Readonly<Record<string, string | null>>;
  /** When the edit takes each applicability: given for every one of them when there are two or more. */
  readonly when?: Readonly<Partial<Record<Applicability, string>>>;
}

const MA = "machine-applicable";
const MI = "maybe-incorrect";
const HP = "has-placeholders";

export const FIX_PRODUCERS: readonly FixProducer[] = [
  {
    producer: "src/fix-producers.ts#offWallFix",
    stage: "compile",
    applicability: [MA, MI],
    codes: {
      W_DOOR_OFF_WALL: "door-off-wall",
      W_WINDOW_OFF_WALL: "window-off-wall",
      W_OPENING_OFF_WALL: "opening-off-wall",
    },
    when: { [MA]: "one wall is nearest", [MI]: "two or more walls tie for nearest" },
  },
  {
    producer: "src/fix-producers.ts#openingWidthFix",
    stage: "compile",
    applicability: [HP],
    codes: { E_DOOR_WIDTH: "door-width", E_WINDOW_WIDTH: "window-width", E_OPENING_WIDTH: "opening-width" },
  },
  {
    producer: "src/fix-producers.ts#doorKindClauseFix",
    stage: "compile",
    applicability: [MA],
    codes: { E_DOOR_KIND_CLAUSE: "door-kind-clause" },
  },
  {
    producer: "src/fix-producers.ts#windowKindClauseFix",
    stage: "compile",
    applicability: [MA],
    codes: { E_WINDOW_KIND_CLAUSE: "window-kind-clause" },
  },
  {
    producer: "src/fix-producers.ts#doorOpenRangeFix",
    stage: "compile",
    applicability: [MA],
    codes: { E_DOOR_OPEN_RANGE: "door-open-range" },
  },
  {
    producer: "src/fix-producers.ts#roomAlignFix",
    stage: "compile",
    applicability: [MA],
    codes: { E_ROOM_ALIGN: "room-align" },
  },
  {
    producer: "src/fix-producers.ts#roomAlignAxisFix",
    stage: "compile",
    applicability: [MA],
    codes: { E_ROOM_ALIGN_AXIS: "room-align-axis" },
  },
  {
    producer: "src/fix-producers.ts#spellingFix",
    stage: "compile",
    applicability: [MA, MI],
    codes: { E_PARSE: "spelling" },
    when: {
      [MA]: "the misspelt word is no word of the language and stands nowhere else in the source, the candidates are a closed list for that position, and no other is as near",
      [MI]: "the position expected one word, the word is one the language or the plan knows, or another candidate is as near",
    },
  },
  {
    producer: "src/fix-producers.ts#idSpellingFix",
    stage: "compile",
    applicability: [MI],
    codes: { E_LAYOUT_REF: "spelling" },
  },
  {
    producer: "src/fix-producers.ts#furnitureCategoryFix",
    stage: "compile",
    applicability: [MI],
    codes: { W_UNKNOWN_FURNITURE: null },
  },
  {
    producer: "src/attach.ts#attachClampFix",
    stage: "compile",
    applicability: [MA],
    codes: { E_ATTACH_POS_RANGE: "attach-pos-range" },
  },
  {
    producer: "src/datum.ts#heightRangeDiagnostic",
    stage: "compile",
    applicability: [MA],
    codes: { E_HEIGHT_RANGE: null },
  },
  {
    producer: "src/datum.ts#resolveOpeningHeights",
    stage: "compile",
    applicability: [MA],
    codes: { E_SILL_ABOVE_HEAD: null, E_OPENING_ABOVE_WALL: null },
  },
  {
    producer: "src/elements/wall.ts#resolveArcs",
    stage: "compile",
    applicability: [MA],
    codes: { E_ARC_RADIUS: "arc-radius-min" },
  },
  {
    producer: "src/fix-producers.ts#fixtureRotateFix",
    stage: "lint",
    applicability: [MA],
    codes: { W_FIXTURE_BACK_TO_ROOM: "fixture-back-to-room" },
  },
  {
    producer: "src/fix-producers.ts#doorHingeFlipFix",
    stage: "lint",
    applicability: [MA],
    codes: { W_SWING_OBSTRUCTED: "door-swing-obstructed" },
  },
  {
    producer: "src/fix-producers.ts#pocketRunFix",
    stage: "lint",
    applicability: [MA],
    codes: { W_POCKET_RUN: "pocket-run" },
  },
  {
    producer: "src/fix-producers.ts#dimSwapFix",
    stage: "lint",
    applicability: [MA],
    codes: { W_DIM_INSIDE: "dim-inside" },
  },
  {
    producer: "src/fix-producers.ts#dimBumpFix",
    stage: "lint",
    applicability: [MA],
    codes: { W_DIM_OVERLAP: "dim-overlap" },
  },
  {
    producer: "src/fix-producers.ts#dimTextFix",
    stage: "lint",
    applicability: [MI],
    codes: { W_DIM_TEXT_MISMATCH: "dim-text-mismatch" },
  },
  {
    producer: "src/lint/rules/alias-match.ts",
    stage: "lint",
    applicability: [MA],
    codes: { W_ALIAS_MATCH: "alias-uses" },
  },
  {
    producer: "src/lint/rules/footprint.ts",
    stage: "lint",
    applicability: [MI],
    codes: { W_FOOTPRINT_TRANSPOSED: "footprint-transposed" },
  },
  {
    producer: "src/while-fix.ts#proveWhileFixes",
    stage: "fix",
    applicability: [MA, MI],
    codes: { W_WHILE_DEPRECATED: "while-to-for" },
    when: { [MA]: "outside any component", [MI]: "inside a component" },
  },
];

/** The applicabilities in the order `applyFixes` ranks them, most confidently applicable first. */
export const APPLICABILITY_ORDER: readonly Applicability[] = [MA, MI, HP, "unspecified"];

/** One applicability's codes, sorted, each with its row's stage and, for a two-tier row, when. */
export interface FixableGroup {
  applicability: Applicability;
  codes: { code: string; stage: FixStage; when?: string }[];
}

/**
 * {@link FIX_PRODUCERS} grouped by applicability ({@link APPLICABILITY_ORDER}; an applicability no
 * producer declares is left out). A code whose fix can carry two applicabilities is in both groups.
 * A code is declared by one row (the test holds it).
 */
export function fixableCodes(producers: readonly FixProducer[] = FIX_PRODUCERS): FixableGroup[] {
  return APPLICABILITY_ORDER.flatMap((applicability) => {
    const codes = producers
      .filter((p) => p.applicability.includes(applicability))
      .flatMap((p) =>
        Object.keys(p.codes).map((code) => {
          const when = p.when?.[applicability];
          return { code, stage: p.stage, ...(when !== undefined ? { when } : {}) };
        }),
      )
      .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    return codes.length > 0 ? [{ applicability, codes }] : [];
  });
}
