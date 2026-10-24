/**
 * `taste(source, { profile?, world? })` — the taste layer (ADR 0032, plan-soundness PS5.1).
 *
 * A separate, sourced score in [0, 1] of how well a plan meets profile- and culture-dependent
 * quality criteria (privacy gradient, daylight, a common room at the heart). It is ADVICE: it
 * never gates, never sets an exit code, and neither `lint()` nor `describe()` ever reads it (an
 * import-graph law, `test/taste-invisible.test.ts`). Only plain defects are lint rules (D2).
 *
 * - **Coverage first.** A criterion that cannot judge says so (`assessable: false`, a reason)
 *   and is excluded, never counted as a pass; `coverage.weight` says how much was judged.
 * - **The validity cap.** The total is capped at 0.5 while default-ruleset `lint()` reports a
 *   warning from a VALIDITY-layer rule (`LintRule.layer`, read through
 *   `lintWithCoverage().layers`). Drafting-layer warnings (the annotation family) are listed in
 *   `validity.drafting` and never cap; compile-channel warnings never cap.
 * - **Exact.** Scores are integer permyriads decided in `BigInt` (`./arith.ts`) and printed by
 *   `fmtPermyriad`; the JSON numbers are the parse of those strings.
 * - **Bounded by counts.** One {@link TASTE_BUDGET} per call, charged before each criterion's
 *   work at its declared cost; a criterion that would exceed it is `taste-budget`, never a hang.
 *
 * Pure, sync, deterministic: it reads `describe()`, `lintWithCoverage()` and the resolved IR
 * through the shared parse/resolve memos and mutates none of them.
 */

import { resolvePlan } from "../analyze.js";
import { describe, type SceneSummary } from "../describe.js";
import type { ResolvedLevel, ResolvedPlan } from "../ir.js";
import type { Diagnostic } from "../diagnostics.js";
import { lint, LINT_PROFILES, lintWithCoverage } from "../lint.js";
import { fmtPermyriad } from "../num-format.js";
import type { World } from "../world.js";
import { adviceOf } from "./advice.js";
import { meanPermyriad, ONE } from "./arith.js";
import { type CriterionResult, TASTE_CRITERIA, notJudged, type TasteStorey } from "./criteria.js";
import { TASTE_PROFILE_NAMES, TASTE_PROFILE_SOURCES, TASTE_PROFILES } from "./profiles.js";
import {
  TASTE_SUBSCORES,
  type TasteAdvisory,
  type TasteCriterion,
  type TasteReport,
  type TasteSkip,
  type TasteSubscore,
} from "./report.js";

export type {
  TasteAdvisory,
  TasteCriterion,
  TasteEvidence,
  TasteReport,
  TasteSkip,
  TasteSkipReason,
  TasteSubscore,
  TasteVerified,
} from "./report.js";
export { TASTE_SUBSCORES } from "./report.js";
export { TASTE_ADVICE, type TasteAdviceRow } from "./advice.js";

export { TASTE_PROFILES, TASTE_PROFILE_NAMES } from "./profiles.js";

/**
 * The counted budget of one `taste()` call, in work units: each criterion declares a cost that
 * bounds the loop steps its judge counts (R3 about rooms + P·B pairs, R7 about elements +
 * windows + rooms, R14 about V·(V + 2E) on the access graph, R9/R18 about Σ V log V over the
 * room rings, R15 about V + E + B², R16 about D·V, R17 about L log L; `src/taste/criteria.ts`),
 * and the cost is charged before the judge runs. Set by measurement: the largest charge over the
 * examples, the defect corpus and the taste corpus is 6,163 units with the eleven criteria of
 * PS5.1 (`examples/terrace-row.arch`; it was 1,559 with PS5.1a's three; re-measured by
 * `test/taste-budget.test.ts`, which also holds every judge's counted work at or under its cost),
 * and the budget, 6,500,000, is 1,054 times that (at least 1,000 times, as the step budget was). A
 * storey at the 5,000-element cap (`MAX_ELEMENTS`) exceeds it on the all-pairs criteria (R14,
 * R15): they then report `taste-budget` instead of running.
 */
export const TASTE_BUDGET = 6_500_000;

export interface TasteOptions {
  /** A name from {@link TASTE_PROFILE_NAMES}; default `"generic"`. */
  profile?: string;
  /** How `import` resolves (the same seam as `compile()`). */
  world?: World;
}

/** A permyriad as the JSON number its exact decimal parses to. */
const num = (p: number): number => Number(fmtPermyriad(p));

/**
 * Score `source` under a taste profile. Never throws on user source: a plan that does not
 * resolve returns `ok: false` with nothing scored.
 *
 * **An unknown `profile` throws a `RangeError`** naming the available profiles
 * ({@link TASTE_PROFILE_NAMES}). This differs from `lint()`, which ignores an unknown profile
 * and runs the defaults: a taste report names its profile and its thresholds come from it, so a
 * silent fallback would report a score under a profile the caller did not ask for. The profile
 * is the caller's argument, never user source, and `arch score --taste` validates it first
 * (exit 3 with a did-you-mean). ADR 0032, Consequences.
 */
export function taste(source: string, opts: TasteOptions = {}): TasteReport {
  return tasteWithBudget(source, opts, TASTE_BUDGET);
}

/** @internal {@link taste} under an explicit budget, so the `taste-budget` skip is testable. */
export function tasteWithBudget(source: string, opts: TasteOptions, budget: number): TasteReport {
  const profileName = opts.profile ?? "generic";
  const profile = TASTE_PROFILES[profileName];
  if (!profile)
    throw new RangeError(`unknown taste profile "${profileName}" (available: ${TASTE_PROFILE_NAMES.join(", ")})`);
  const world = opts.world ? { world: opts.world } : {};

  const { ir, levels } = resolvePlan(source, world);
  if (!ir) return emptyReport(profileName);

  const summary = describe(source, world);
  const linted = lintWithCoverage(source, world);
  const storeys = storeysOf(summary, ir, levels);

  // The validity cap: codes, never message text; the layer comes from the rule that declares it.
  const validityCodes: string[] = [];
  const draftingCodes: string[] = [];
  let validityWarnings = 0;
  let draftingWarnings = 0;
  for (const d of linted.diagnostics) {
    if (d.severity !== "warning" || d.code === undefined) continue;
    if (linted.layers[d.code] === "drafting") {
      draftingWarnings++;
      if (!draftingCodes.includes(d.code)) draftingCodes.push(d.code);
    } else {
      validityWarnings++;
      if (!validityCodes.includes(d.code)) validityCodes.push(d.code);
    }
  }
  const pass = validityWarnings === 0;

  let left = budget;
  const skipped: TasteSkip[] = [];
  const criteria: TasteCriterion[] = [];
  const perSubscore = new Map<TasteSubscore, Array<{ p: number; w: number }>>();
  let assessableWeight = 0;
  let totalWeight = 0;
  for (const def of TASTE_CRITERIA) {
    const row = adviceOf(def.id);
    totalWeight += def.weight;
    // Charged BEFORE the work: a criterion that would overspend the budget does not run.
    const cost = Math.max(1, def.cost(storeys));
    let result: CriterionResult;
    if (cost > left) {
      result = {
        reason: "taste-budget",
        measured: null,
        p: null,
        message: notJudged(def.id, "taste-budget"),
        evidence: [],
        evidenceMore: 0,
        skips: [],
      };
    } else {
      left -= cost;
      result = def.judge(storeys, profile, { n: 0 });
    }
    skipped.push(...result.skips);
    if (result.reason) skipped.push({ criterion: def.id, reason: result.reason });
    const assessable = result.p !== null;
    if (assessable) {
      assessableWeight += def.weight;
      const list = perSubscore.get(row.subscore) ?? [];
      list.push({ p: result.p!, w: def.weight });
      perSubscore.set(row.subscore, list);
    }
    criteria.push({
      id: def.id,
      name: row.name,
      subscore: row.subscore,
      kind: "taste",
      weight: def.weight,
      assessable,
      ...(result.reason ? { reason: result.reason } : {}),
      measured: result.measured,
      score: result.p === null ? null : num(result.p),
      source: TASTE_PROFILE_SOURCES[profileName]?.[def.id]?.source ?? row.source,
      verified: TASTE_PROFILE_SOURCES[profileName]?.[def.id]?.verified ?? row.verified,
      advice: result.p !== null && result.p < ONE ? row.code : null,
      message: result.message,
      evidence: result.evidence,
      ...(result.evidenceMore > 0 ? { evidence_more: result.evidenceMore } : {}),
    });
  }

  // Criterion → subscore: weighted mean of permyriads. Subscore → total: each subscore that
  // judged anything weighs 1.
  const subP = new Map<TasteSubscore, number>();
  for (const k of TASTE_SUBSCORES) {
    const m = meanPermyriad(perSubscore.get(k) ?? []);
    if (m !== null) subP.set(k, m);
  }
  const uncappedP = meanPermyriad([...subP.values()].map((p) => ({ p, w: 1 })));
  const scoreP = uncappedP === null ? null : pass ? uncappedP : Math.min(uncappedP, ONE / 2);

  const roomCount = storeys.reduce((n, s) => n + s.summary.rooms.length, 0);
  const unclassified = linted.coverage?.unclassifiedRooms ?? [];
  return {
    profile: profileName,
    ok: true,
    score: scoreP === null ? null : num(scoreP),
    uncapped: uncappedP === null ? null : num(uncappedP),
    capped: scoreP !== null && !pass,
    validity: {
      pass,
      warnings: validityWarnings,
      codes: validityCodes,
      drafting: { warnings: draftingWarnings, codes: draftingCodes },
    },
    advisory: advisoryOf(source, world, profileName, linted.diagnostics),
    coverage: {
      rooms: roomCount,
      classified: roomCount - unclassified.length,
      unclassified,
      weight: { assessable: assessableWeight, total: totalWeight },
      skipped,
    },
    subscores: Object.fromEntries(TASTE_SUBSCORES.map((k) => [k, subP.has(k) ? num(subP.get(k)!) : null])) as Record<
      TasteSubscore,
      number | null
    >,
    criteria,
  };
}

/**
 * The report's `advisory` (PS5.2): the warnings `lint()` raises under the lint profile of the
 * same name and default `lint()` does not raise at the same place (same code, module, storey and
 * span: a profile that only changes the number a default warning quotes adds nothing here),
 * counted per code in first-raised order. Empty for a taste profile that names no lint profile
 * (`generic`). They are advice from an advisory code and never cap the score (design §6 Q2:
 * otherwise a profile would turn advisory code into gating by the back door).
 */
function advisoryOf(
  source: string,
  world: { world?: World },
  profile: string,
  base: readonly Diagnostic[],
): TasteAdvisory[] {
  if (!Object.hasOwn(LINT_PROFILES, profile)) return [];
  const samePlace = (a: Diagnostic, b: Diagnostic): boolean =>
    a.code === b.code &&
    a.file === b.file &&
    a.level === b.level &&
    a.span?.start === b.span?.start &&
    a.span?.end === b.span?.end;
  const out: TasteAdvisory[] = [];
  for (const d of lint(source, { ...world, profile })) {
    if (d.severity !== "warning" || d.code === undefined || base.some((b) => samePlace(b, d))) continue;
    const row = out.find((a) => a.code === d.code);
    if (row) row.warnings++;
    else out.push({ code: d.code, warnings: 1 });
  }
  return out;
}

/** One {@link TasteStorey} per storey: the lowest is judged by the depth readers, the rest are `upper`. */
function storeysOf(summary: SceneSummary, ir: ResolvedPlan, levels: readonly ResolvedLevel[]): TasteStorey[] {
  return levels.length > 0 && summary.levels
    ? summary.levels.map((l, i) => ({ level: l.level, summary: l, ir: levels[i]!.ir, upper: i > 0 }))
    : [{ summary, ir, upper: false }];
}

/**
 * @internal What one `taste()` call charges against {@link TASTE_BUDGET}, per criterion in
 * R-number order (each criterion's declared cost, at least 1); `[]` when the plan does not
 * resolve. The measurement {@link TASTE_BUDGET} was set from (`test/taste-budget.test.ts`).
 */
export function tasteCharges(source: string, opts: Pick<TasteOptions, "world"> = {}): number[] {
  return tasteWork(source, opts).map((w) => w.cost);
}

/**
 * @internal Each criterion's declared cost beside the work its judge actually counted, run
 * unbudgeted, in R-number order; `[]` when the plan does not resolve. The probe behind the
 * law that a cost is an upper bound on the work (`test/taste-budget.test.ts`).
 */
export function tasteWork(
  source: string,
  opts: Pick<TasteOptions, "world"> = {},
): Array<{ id: string; cost: number; work: number }> {
  const world = opts.world ? { world: opts.world } : {};
  const { ir, levels } = resolvePlan(source, world);
  if (!ir) return [];
  const storeys = storeysOf(describe(source, world), ir, levels);
  return TASTE_CRITERIA.map((def) => {
    const work = { n: 0 };
    def.judge(storeys, TASTE_PROFILES.generic!, work);
    return { id: def.id, cost: Math.max(1, def.cost(storeys)), work: work.n };
  });
}

/** The report of a plan that does not resolve: nothing measured, nothing scored. */
function emptyReport(profile: string): TasteReport {
  return {
    profile,
    ok: false,
    score: null,
    uncapped: null,
    capped: false,
    validity: { pass: false, warnings: 0, codes: [], drafting: { warnings: 0, codes: [] } },
    advisory: [],
    coverage: {
      rooms: 0,
      classified: 0,
      unclassified: [],
      weight: { assessable: 0, total: TASTE_CRITERIA.reduce((n, c) => n + c.weight, 0) },
      skipped: [],
    },
    subscores: Object.fromEntries(TASTE_SUBSCORES.map((k) => [k, null])) as Record<TasteSubscore, number | null>,
    criteria: [],
  };
}
