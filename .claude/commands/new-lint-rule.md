---
description: Add a new ArchLang lint rule and register it in every place a rule is listed
---

# Add a new lint rule

A rule is one module under `src/lint/rules/` plus the places below. `test/lint-rule-order.test.ts`
goes red for every derivable place a new rule missed, naming each file; run it once and fix what it
lists. The list comes from commit `974d9981` (`W_FURNITURE_ON_VOID`).

## Steps, in dependency order

1. **The rule** in `src/lint/rules/<module>.ts`: a `LintRule` with `name`, `family`, `layer`,
   `codes`, `stage` (one stage, or one per code) and `check(ctx)`. Returns `Diagnostic`s with a byte
   `span`, never throws. Guarded by `test/lint-layers.test.ts` (layer and codes) and the stage
   shape test in `test/stages.test.ts`.
2. **The family**, only if new: `LintFamily` and `FAMILY_NOUN` in `src/lint/coverage.ts`. Red
   without it: `tsc`, and `test/lint-rule-order.test.ts` (family words).
3. **The catalogue entry** for every code in `rule.codes`, with a firing example:
   `src/error-catalog.ts`. Red without it: `test/lint-rule-order.test.ts` (catalogued codes) and
   the catalogue tests.
4. **Append the rule to `LINT_RULES`** in `src/lint/rules/index.ts`, last unless the reading order
   says otherwise (order is contract). Red without the next step:
   `test/lint-rule-order.test.ts` (order).
5. **Pin its name** at the same position in `EXPECTED_ORDER` in `test/lint-rule-order.test.ts`.
6. **Classify it** in `RULE_CLASS` in `test/d4-oracle.ts` ("invariant" unless the doc comment above
   the table says the rule reads the sheet or a compass fact). Red without it:
   `test/lint-rule-order.test.ts` (classified), `test/equivariance-corpus.test.ts`.
7. **Give each code its stage row** in `DECIDED` in `test/stage-decisions.ts`, and bump the
   per-stage counts in `test/stages.test.ts`. Red without it: `test/lint-rule-order.test.ts`
   (stage rows), `test/stages.test.ts` (decided table and counts).
8. **Tests for the rule itself**: a `test/lint-<name>.test.ts` with a firing case and a clean case.
9. **Not derivable, check by hand** (no test lists them for you): a threshold the rule reads goes in
   `src/lint/ruleset.ts` (it names thresholds, not rules); a rule that reads furniture sets
   `readsFurniture` (`test/lint-hint-paste.test.ts`); `test/defect-corpus/README.md` lists a case
   per code it names; the totals in `test/rooms-tiling-probe.test.ts` and
   `test/walls-from-rooms.test.ts` if the rule judges room tiling or enclosure; the K1 keep digests
   move when `next` or lint output moves (`docs/agents/gotchas.md` § PRs & CI).
10. **Regenerate**: `npm run gen:all` (error-code docs, `llms-full.txt`, the context-size figure);
    never hand-edit the outputs. Red without it: `npm run check:drift` in CI.
11. **Prove it through the CLI** (`arch lint --json` on a plan that fires it and on the examples,
    which must not move), then `npm run check:quick`, push, and read the PR's CI.
