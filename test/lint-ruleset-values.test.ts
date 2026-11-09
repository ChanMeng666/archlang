/**
 * A lint ruleset value that is not a finite number within the modelling range (or `null` where
 * the field allows it) is refused with `E_RULESET_VALUE` before any rule runs (engineering-health
 * EH2.12).
 *
 * `resolveRuleset` lays a caller's `ruleset` over the defaults and the named profile and used to
 * check nothing, so `lint(src, { ruleset: { doorwayLandingMm: NaN } })`, or `undefined` spread over
 * the default, reached the rules and the grid index. `validateRuleset` (`src/lint/ruleset.ts`)
 * holds every field whose DEFAULT is a number or `null`, and the three per-use tables entry by
 * entry, and `lintRun` (`src/lint.ts`) returns its errors alone, in dotted-key order, at byte 0,
 * with no coverage, without resolving the plan. A message names the key and what is wrong with
 * the value, never the value itself.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics.js";
import {
  DEFAULT_RULESET,
  ERROR_CATALOG,
  LINT_PROFILES,
  lint,
  lintWithCoverage,
  type LintRuleset,
} from "../src/index.js";
import { resolveRuleset, validateRuleset } from "../src/lint/ruleset.js";
import { MODEL_RANGE_MM } from "../src/num-format.js";

const SRC = readFileSync("examples/studio.arch", "utf8");

/** Lint the studio under a caller ruleset. */
const lintWith = (ruleset: Partial<LintRuleset>): Diagnostic[] => lint(SRC, { ruleset });

/** `test/lint-stairs.test.ts`'s contract for every lint message: no non-finite or
 *  exponent-formatted number, ever. */
const PRINTED_NUMBER = /Infinity|NaN|e\+\d/;
const clean = (d: Diagnostic): void => expect(`${d.message} ${(d.hints ?? []).join(" ")}`).not.toMatch(PRINTED_NUMBER);

/** The one diagnostic `ruleset` must yield: an `E_RULESET_VALUE` at 0..0, and nothing else. */
function onlyRulesetError(ruleset: Partial<LintRuleset>): string {
  const ds = lintWith(ruleset);
  expect(ds).toHaveLength(1);
  const d = ds[0]!;
  expect(d.code).toBe("E_RULESET_VALUE");
  expect(d.severity).toBe("error");
  expect(d.span).toEqual({ start: 0, end: 0 });
  clean(d);
  return d.message;
}

/** The message's rule half, for a field that does not, and one that does, accept `null`. */
const MUST = "must be a finite number within ±33554432 (the modelling range, in the field's own unit)";
const MUST_OR_NULL = `${MUST} or null`;

/** A ruleset only a JavaScript caller can pass (the types refuse it). */
const loose = (r: Record<string, unknown>): Partial<LintRuleset> => r as Partial<LintRuleset>;

describe("E_RULESET_VALUE: a ruleset number that is not finite or not in range", () => {
  it("is catalogued, as an error", () => {
    expect(ERROR_CATALOG.E_RULESET_VALUE?.severity).toBe("error");
  });

  it("refuses NaN, naming the key and what is wrong, not the value", () => {
    expect(onlyRulesetError({ doorwayLandingMm: Number.NaN })).toBe(
      `The lint ruleset's \`doorwayLandingMm\` ${MUST}; it is not a number, so no rule ran`,
    );
  });

  it("refuses Infinity and -Infinity as not finite", () => {
    expect(onlyRulesetError({ minDoorWidthMm: Infinity })).toContain("`minDoorWidthMm` must be");
    expect(onlyRulesetError({ minDoorWidthMm: Infinity })).toContain("; it is not finite,");
    expect(onlyRulesetError({ tolMm: -Infinity })).toContain("; it is not finite,");
  });

  it("refuses a finite number past the range, on either side, without printing it", () => {
    expect(onlyRulesetError({ maxDetourRatio: MODEL_RANGE_MM + 1 })).toBe(
      `The lint ruleset's \`maxDetourRatio\` ${MUST}; it is beyond the modelling range, so no rule ran`,
    );
    const huge = onlyRulesetError({ doorwayLandingMm: 1e300 });
    expect(huge).toContain("; it is beyond the modelling range,");
    expect(huge).not.toContain("1e");
    expect(onlyRulesetError({ swingClearanceMm: -(MODEL_RANGE_MM + 1) })).toContain(
      "; it is beyond the modelling range,",
    );
  });

  it("refuses a bad per-use table entry, naming it by a dotted key", () => {
    expect(onlyRulesetError({ minRoomAreaByUseM2: { bedroom: Number.NaN } })).toBe(
      `The lint ruleset's \`minRoomAreaByUseM2.bedroom\` ${MUST_OR_NULL}; it is not a number, so no rule ran`,
    );
    expect(onlyRulesetError({ minRoomShortSideByUseMm: { kitchen: Infinity } })).toContain(
      `\`minRoomShortSideByUseMm.kitchen\` ${MUST}; it is not finite,`,
    );
    expect(onlyRulesetError({ minPathClearWidthByUseMm: { hall: 1e9 } })).toContain(
      "`minPathClearWidthByUseMm.hall` must be",
    );
  });

  it("refuses a value that is not a number, naming what it is", () => {
    // `{ key: undefined }` spreads over the default; the rules would compute NaN boxes from it.
    expect(onlyRulesetError({ doorwayLandingMm: undefined })).toBe(
      `The lint ruleset's \`doorwayLandingMm\` ${MUST}; it is undefined, so no rule ran`,
    );
    expect(onlyRulesetError(loose({ doorwayLandingMm: "500" }))).toContain("; it is a string,");
    expect(onlyRulesetError(loose({ doorwayLandingMm: {} }))).toContain("; it is an object,");
    expect(onlyRulesetError(loose({ doorwayLandingMm: [450] }))).toContain("; it is an object,");
    expect(onlyRulesetError(loose({ doorwayLandingMm: true }))).toContain("; it is a boolean,");
    expect(onlyRulesetError(loose({ doorwayLandingMm: null }))).toContain(`${MUST}; it is null,`);
    // The value is never echoed, so a string carrying a number's spelling cannot leak one.
    expect(onlyRulesetError(loose({ tolMm: "NaN Infinity 1e+300" }))).toContain("; it is a string,");
  });

  it("refuses undefined on a nullable field, where only a number or null is valid", () => {
    expect(onlyRulesetError({ exitApproachMm: undefined })).toBe(
      `The lint ruleset's \`exitApproachMm\` ${MUST_OR_NULL}; it is undefined, so no rule ran`,
    );
  });

  it("refuses a non-number per-use entry, and null in a table that exempts no use", () => {
    expect(onlyRulesetError(loose({ minRoomAreaByUseM2: { bedroom: "x" } }))).toContain(
      "`minRoomAreaByUseM2.bedroom` must be",
    );
    expect(onlyRulesetError(loose({ minRoomAreaByUseM2: { bedroom: "x" } }))).toContain("; it is a string,");
    expect(onlyRulesetError(loose({ minRoomShortSideByUseMm: { kitchen: null } }))).toContain(
      `\`minRoomShortSideByUseMm.kitchen\` ${MUST}; it is null,`,
    );
  });

  it("reports one error per bad value, in code-unit order of the dotted keys, whatever the caller's order", () => {
    const keysOf = (r: Partial<LintRuleset>) => lintWith(r).map((d) => /`([^`]+)`/.exec(d.message)?.[1]);
    const sorted = ["minRoomAreaByUseM2.wc", "minRoomAreaM2", "tolMm"];
    expect(keysOf({ tolMm: Number.NaN, minRoomAreaM2: Infinity, minRoomAreaByUseM2: { wc: Number.NaN } })).toEqual(
      sorted,
    );
    expect(keysOf({ minRoomAreaByUseM2: { wc: Number.NaN }, minRoomAreaM2: Infinity, tolMm: Number.NaN })).toEqual(
      sorted,
    );
    const ds = lintWith({ tolMm: Number.NaN, minRoomAreaM2: Infinity });
    expect(ds.map((d) => d.code)).toEqual(["E_RULESET_VALUE", "E_RULESET_VALUE"]);
    for (const d of ds) clean(d);
  });

  it("returns no coverage: the plan is not resolved and no rule runs", () => {
    const r = lintWithCoverage(SRC, { ruleset: { doorwayLandingMm: Number.NaN } });
    expect(r.coverage).toBeNull();
    expect(r.diagnostics.map((d) => d.code)).toEqual(["E_RULESET_VALUE"]);
    // Even a source that does not parse is not read.
    expect(lint("plan {", { ruleset: { doorwayLandingMm: Number.NaN } }).map((d) => d.code)).toEqual([
      "E_RULESET_VALUE",
    ]);
  });
});

describe("what a ruleset may still say", () => {
  it("accepts null on a nullable field (a rule turned off) and in a table that exempts uses", () => {
    expect(lintWith({ exitApproachMm: null }).some((d) => d.code === "E_RULESET_VALUE")).toBe(false);
    expect(lintWithCoverage(SRC, { ruleset: { exitApproachMm: null } }).coverage).not.toBeNull();
    expect(validateRuleset(resolveRuleset({}, { minRoomAreaByUseM2: { bedroom: null } }))).toEqual([]);
  });

  it("reads an undefined per-use entry as no entry, as the rules do", () => {
    expect(validateRuleset(resolveRuleset({}, { minRoomAreaByUseM2: { bedroom: undefined } }))).toEqual([]);
  });

  it("does not read a key the defaults do not have", () => {
    expect(validateRuleset(resolveRuleset({}, loose({ notARule: Number.NaN })))).toEqual([]);
  });

  it("accepts a valid override, and the bounds themselves", () => {
    expect(lintWith({ doorwayLandingMm: 450 }).some((d) => d.code === "E_RULESET_VALUE")).toBe(false);
    expect(validateRuleset(resolveRuleset({}, { doorwayLandingMm: MODEL_RANGE_MM }))).toEqual([]);
    expect(validateRuleset(resolveRuleset({}, { swingClearanceMm: -MODEL_RANGE_MM }))).toEqual([]);
  });

  it("holds the defaults and every built-in profile valid", () => {
    expect(validateRuleset(DEFAULT_RULESET)).toEqual([]);
    for (const [name, profile] of Object.entries(LINT_PROFILES))
      expect(validateRuleset(resolveRuleset(profile)), name).toEqual([]);
    expect(lint(SRC).some((d) => d.code === "E_RULESET_VALUE")).toBe(false);
  });
});
