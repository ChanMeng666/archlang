/**
 * `lint(source)` — architectural soundness rules, as diagnostics.
 *
 * The compiler tells you a plan is *valid* (it parses and resolves). Lint tells you
 * it is *sound* — that an agent-drawn plan is actually habitable: every room can be
 * entered, bedrooms have a window, rooms aren't implausibly tiny, doors are wide
 * enough to pass, and the building has an entrance. These are exactly the mistakes a
 * model makes when it invents coordinates, and they ship as the same errors-as-data
 * the rest of ArchLang uses (a `W_*` code + byte span + a catalog `fix`), so an agent
 * self-corrects from them with no extra plumbing.
 *
 * Pure and deterministic. Each rule is its own module in `lint/rules/` checking a
 * shared, precomputed {@link import("./lint/context.js").LintContext}; this entry
 * point builds the context and folds the ordered rule list (`LINT_RULES`) — the
 * emission order is part of the output contract. Thresholds/profiles live in
 * `lint/ruleset.ts` (re-exported here, so the public surface is unchanged).
 */

import { resolvePlan } from "./analyze.js";
import type { Diagnostic } from "./diagnostics.js";
import { buildLintContext } from "./lint/context.js";
import { LINT_RULES } from "./lint/rules/index.js";
import { DEFAULT_RULESET, LINT_PROFILES, type LintOptions, type LintRuleset } from "./lint/ruleset.js";

export {
  DEFAULT_RULESET,
  LINT_PROFILES,
  LINT_PROFILE_NAMES,
  type LintOptions,
  type LintRuleset,
} from "./lint/ruleset.js";
export type { LintContext, LintRule } from "./lint/context.js";
export { LINT_RULES } from "./lint/rules/index.js";

/**
 * Lint ArchLang `source` and return architectural-soundness warnings. Returns `[]`
 * when the plan has fatal errors (resolution failed — there is nothing sound to
 * check; compile/validate surfaces those). Never throws.
 */
export function lint(source: string, opts: LintOptions = {}): Diagnostic[] {
  // Ruleset cascade: defaults → named profile → explicit per-call overrides.
  const profileRules = opts.profile ? (LINT_PROFILES[opts.profile] ?? {}) : {};
  const rules: LintRuleset = { ...DEFAULT_RULESET, ...profileRules, ...opts.ruleset };
  const { ir } = resolvePlan(source, opts);
  if (!ir) return [];

  const ctx = buildLintContext(ir, rules);
  const out: Diagnostic[] = [];
  for (const rule of LINT_RULES) out.push(...rule.check(ctx));
  return out;
}
