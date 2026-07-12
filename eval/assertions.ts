/**
 * Intent assertions — a thin re-export SHIM over the production judge core in
 * {@link import("../src/intent.js")}.
 *
 * As of v1.14 Tranche 4 the judge-v2 scoring core LIVES in `src/intent.ts` (lifted so the
 * same intent contract a brief is measured against is checkable at author time) — ONE
 * judge, no eval↔prod skew. This file preserves the eval's historical import surface
 * (`assertions.js`) and remains JUDGE_VERSION's home: `eval/run.ts`, `eval/l2-run.ts`,
 * `eval/g1/*`, and the eval test suite import the judge from here unchanged. `compileExpect`
 * is kept as an alias of the core's `compileIntent` for the eval's callers.
 *
 * BUMP CRITERION (reworded for the lift): bump {@link JUDGE_VERSION} when any
 * CORPUS-OBSERVABLE judgment changes — the semantics of an existing predicate kind, a pass
 * rule, a reworded detail line, or a re-tuned synonym table. A NEW predicate kind unused by
 * the corpus (e.g. the core's `room-windows`) does NOT bump it. The proof is
 * `eval/judge-fixture.json` + `test/eval-fixture.test.ts`: every corpus per-assertion
 * judgment must stay byte-identical, so the fixture is regenerated ONLY to record an
 * already-approved bump — never to make a red suite green.
 */

export {
  JUDGE_VERSION,
  type Predicate,
  type AssertionResult,
  type Subscores,
  checkPredicates,
  projectSubscores,
  // The eval's callers keep the old name; the core's entry point is `compileIntent`.
  compileIntent as compileExpect,
} from "../src/intent.js";
