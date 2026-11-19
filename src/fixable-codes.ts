/**
 * The codes `fix` can resolve, declared by their fix producers: one row per producer, naming the codes
 * it attaches a span edit to, the applicability its edit can carry and the stage that raises it (card
 * AF8, after TypeScript's `getSupportedErrorCodes()`). `packages/mcp/scripts/gen-capabilities.ts`
 * renders it into the `archlang://capabilities` resource, grouped by applicability.
 *
 * A declaration, held to the producers from both sides by `test/fixable-codes.test.ts`: its codes are
 * exactly the codes `scripts/fix-coverage.ts` reads a fix site for in `src/`, and every fix that
 * `compile()`, `lint()` and `arch fix`'s `while` proof emit over the corpus, the catalogue's examples
 * and the test's own reach plans matches a row in code, `fixId`, applicability and stage, while every
 * row's every code and applicability is seen at least once. Nothing on the compile path imports it.
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
}

const MA = "machine-applicable";
const MI = "maybe-incorrect";
const HP = "has-placeholders";

export const FIX_PRODUCERS: readonly FixProducer[] = [
  {
    producer: "src/fix-producers.ts#offWallFix",
    stage: "compile",
    // maybe-incorrect when two walls tie for nearest.
    applicability: [MA, MI],
    codes: {
      W_DOOR_OFF_WALL: "door-off-wall",
      W_WINDOW_OFF_WALL: "window-off-wall",
      W_OPENING_OFF_WALL: "opening-off-wall",
    },
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
    // maybe-incorrect when the loop sits inside a component body.
    applicability: [MA, MI],
    codes: { W_WHILE_DEPRECATED: "while-to-for" },
  },
];

/** The applicabilities in the order `applyFixes` ranks them, most confidently applicable first. */
export const APPLICABILITY_ORDER: readonly Applicability[] = [MA, MI, HP, "unspecified"];

/** One applicability's codes, sorted, each with the stages that raise it. */
export interface FixableGroup {
  applicability: Applicability;
  codes: { code: string; stages: FixStage[] }[];
}

/**
 * {@link FIX_PRODUCERS} grouped by applicability ({@link APPLICABILITY_ORDER}; an applicability no
 * producer declares is left out). A code whose fix can carry two applicabilities is in both groups.
 */
export function fixableCodes(producers: readonly FixProducer[] = FIX_PRODUCERS): FixableGroup[] {
  return APPLICABILITY_ORDER.flatMap((applicability) => {
    const stages = new Map<string, Set<FixStage>>();
    for (const p of producers) {
      if (!p.applicability.includes(applicability)) continue;
      for (const code of Object.keys(p.codes)) {
        const s = stages.get(code) ?? new Set<FixStage>();
        s.add(p.stage);
        stages.set(code, s);
      }
    }
    const codes = [...stages.keys()].sort().map((code) => ({ code, stages: [...stages.get(code)!].sort() }));
    return codes.length > 0 ? [{ applicability, codes }] : [];
  });
}
