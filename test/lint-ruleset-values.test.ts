/**
 * A lint ruleset number that is not finite, or lies beyond the modelling range, is refused with
 * `E_RULESET_VALUE` before any rule runs (engineering-health EH2.12).
 *
 * `resolveRuleset` lays a caller's `ruleset` over the defaults and the named profile and used to
 * check nothing, so `lint(src, { ruleset: { doorwayLandingMm: NaN } })` reached the rules and the
 * grid index. `validateRuleset` (`src/lint/ruleset.ts`) reads every number of the resolved ruleset
 * by runtime type, the three per-use tables entry by entry, and `lintRun` (`src/lint.ts`) returns
 * its errors alone, at byte 0, with no coverage, without resolving the plan.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULESET,
  ERROR_CATALOG,
  LINT_PROFILES,
  lint,
  lintWithCoverage,
  type LintRuleset,
} from "../src/index.js";
import { MODEL_RANGE_MM } from "../src/num-format.js";
import { resolveRuleset, validateRuleset } from "../src/lint/ruleset.js";

const SRC = readFileSync("examples/studio.arch", "utf8");

/** Lint the studio under a caller ruleset. */
const lintWith = (ruleset: Partial<LintRuleset>) => lint(SRC, { ruleset });

/** The one diagnostic `ruleset` must yield: an `E_RULESET_VALUE` at 0..0, and nothing else. */
function onlyRulesetError(ruleset: Partial<LintRuleset>): string {
  const ds = lintWith(ruleset);
  expect(ds).toHaveLength(1);
  const d = ds[0]!;
  expect(d.code).toBe("E_RULESET_VALUE");
  expect(d.severity).toBe("error");
  expect(d.span).toEqual({ start: 0, end: 0 });
  return d.message;
}

const RANGE = "a ruleset number must be finite and within ±33554432 (the modelling range, 2^25), so no rule ran";

describe("E_RULESET_VALUE: a ruleset number that is not finite or not in range", () => {
  it("is catalogued, as an error", () => {
    expect(ERROR_CATALOG.E_RULESET_VALUE?.severity).toBe("error");
  });

  it("refuses NaN, naming the key and the value", () => {
    const m = onlyRulesetError({ doorwayLandingMm: Number.NaN });
    expect(m).toBe(`The lint ruleset's \`doorwayLandingMm\` is NaN; ${RANGE}`);
  });

  it("refuses Infinity and -Infinity by name", () => {
    expect(onlyRulesetError({ minDoorWidthMm: Infinity })).toContain("`minDoorWidthMm` is Infinity;");
    expect(onlyRulesetError({ tolMm: -Infinity })).toContain("`tolMm` is -Infinity;");
  });

  it("refuses a finite number one past the range, printing it", () => {
    const m = onlyRulesetError({ maxDetourRatio: MODEL_RANGE_MM + 1 });
    expect(m).toContain("`maxDetourRatio` is 33554433;");
    expect(m).toContain(RANGE);
    // A huge finite value is printed as a number, never as `Infinity` or `0`.
    expect(onlyRulesetError({ doorwayLandingMm: 1e300 })).toContain("`doorwayLandingMm` is 1e+300;");
    // The negative bound is held too.
    expect(onlyRulesetError({ swingClearanceMm: -(MODEL_RANGE_MM + 1) })).toContain("is -33554433;");
  });

  it("refuses a bad per-use table entry, naming it by a dotted key", () => {
    expect(onlyRulesetError({ minRoomAreaByUseM2: { bedroom: Number.NaN } })).toContain(
      "`minRoomAreaByUseM2.bedroom` is NaN;",
    );
    expect(onlyRulesetError({ minRoomShortSideByUseMm: { kitchen: Infinity } })).toContain(
      "`minRoomShortSideByUseMm.kitchen` is Infinity;",
    );
    expect(onlyRulesetError({ minPathClearWidthByUseMm: { hall: 1e9 } })).toContain(
      "`minPathClearWidthByUseMm.hall` is 1000000000;",
    );
  });

  it("reports one error per bad number, in key order", () => {
    const ds = lintWith({ tolMm: Number.NaN, minRoomAreaM2: Infinity, minRoomAreaByUseM2: { wc: Number.NaN } });
    expect(ds.map((d) => d.code)).toEqual(["E_RULESET_VALUE", "E_RULESET_VALUE", "E_RULESET_VALUE"]);
    // `minRoomAreaM2` comes before `tolMm` in DEFAULT_RULESET's key order, and the table after both.
    expect(ds.map((d) => /`([^`]+)`/.exec(d.message)?.[1])).toEqual([
      "minRoomAreaM2",
      "tolMm",
      "minRoomAreaByUseM2.wc",
    ]);
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
  it("accepts null on a nullable field (a rule turned off)", () => {
    expect(lintWith({ exitApproachMm: null }).some((d) => d.code === "E_RULESET_VALUE")).toBe(false);
    expect(lintWithCoverage(SRC, { ruleset: { exitApproachMm: null } }).coverage).not.toBeNull();
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
