/**
 * The ordered lint rule list, handed to `lint/defining.ts` without an import.
 *
 * `defining.ts` re-lints a candidate placement against the furniture-reading rules, but the rule
 * list (`rules/index.ts`) imports the rules that import `defining.ts`: a value import of the
 * list from `defining.ts` is a runtime import cycle. `rules/index.ts` registers `LINT_RULES`
 * here once, as it loads; `defining.ts` reads it through {@link hintRuleList}, or takes the list
 * as a parameter.
 *
 * Invariant: set exactly once, to the one `LINT_RULES`; reading it before any rule module has
 * loaded throws rather than silently verifying against no rules. Pure and deterministic; charges
 * the step meter: none.
 */

import type { LintRule } from "./context.js";

let registered: readonly LintRule[] | undefined;

/** Called by `rules/index.ts` with `LINT_RULES`, at load. */
export function registerHintRules(rules: readonly LintRule[]): void {
  registered = rules;
}

/** The registered rule list; throws when `rules/index.ts` has not loaded. */
export function hintRuleList(): readonly LintRule[] {
  if (registered === undefined) throw new Error("hint rules read before lint/rules/index.ts loaded");
  return registered;
}
