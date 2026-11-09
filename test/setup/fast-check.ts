/**
 * The fast-check run policy, registered for every test file by `vitest.config.ts` `setupFiles`.
 *
 * `FC_SCALE` multiplies the number of runs of every property: unset is 1 (a PR run, the counts
 * the call sites pin), `0.25` is the local quick check (`scripts/check-quick.mjs`), `10` is the
 * nightly deep pass (`.github/workflows/nightly.yml`, job `fuzz-deep`). A count is the budget,
 * never a time (AGENTS.md).
 *
 * A call site that pins a count writes `numRuns: runs(300)`; a call with no `numRuns` gets the
 * fast-check default (100) scaled by the same factor, through `configureGlobal`. Seeds are not
 * touched here: a NON-VACUITY ("at least one") property must carry its own `seed:`
 * (`test/fast-check-policy.test.ts`); a universal law may stay unseeded, and fast-check prints the
 * seed and path of a counterexample, which then becomes a pinned regression case.
 */
import fc from "fast-check";

const parsed = Number(process.env.FC_SCALE ?? 1);
/** The scale factor; a missing, non-numeric or non-positive `FC_SCALE` is 1. */
export const FC_SCALE = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

/** `n` runs at the current scale, never fewer than 1. */
export const runs = (n: number): number => Math.max(1, Math.round(n * FC_SCALE));

/**
 * A non-vacuity floor that counts what the runs produced ("at least 40 of 50 plans had faces")
 * follows the run count down: `floorAt(40)` is 40 at scale 1 and above (a PR, nightly), and below
 * 1 it is scaled by the run count and halved again (a shorter seeded prefix draws a different mix, not
 * just fewer of the same). It never scales up: the floor is a minimum, not a target.
 */
export const floorAt = (n: number): number => (FC_SCALE >= 1 ? n : Math.floor((n * FC_SCALE) / 2));

fc.configureGlobal({ numRuns: runs(100) });
