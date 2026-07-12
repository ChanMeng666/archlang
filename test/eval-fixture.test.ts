import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type Score, loadCorpus, readGolden, scoreSource } from "../eval/run.js";
import { JUDGE_VERSION } from "../eval/assertions.js";
import { SYNONYMS_VERSION } from "../eval/synonyms.js";

/**
 * Judge fixture — the byte-equivalence proof for the T4 intent lift.
 *
 * `eval/judge-fixture.json` pins the FULL `Score` this judge (`scoreSource`) produces
 * for every corpus golden under the current scoring core (judge v2 · synonyms v1). Its
 * purpose is to keep JUDGE_VERSION at "2" honest across the planned refactor that lifts
 * `eval/assertions.ts` into `src/intent.ts`: after that lift, this suite must still pass
 * unchanged — same predicates, same passes, same detail strings, same subscores — which
 * is what proves the judge's *meaning* did not move.
 *
 * Therefore: a semantic change to the judge (new/changed predicate kind, a different
 * pass rule, a reworded detail line, a re-tuned synonym table) must **bump
 * JUDGE_VERSION** (and re-approve the rubric) — never be smuggled in by silently
 * regenerating this fixture. Regeneration (`UPDATE_JUDGE_FIXTURE=1`) is only for
 * recording an already-approved version bump, never for making a red suite green.
 *
 * Regenerate intentionally with:  UPDATE_JUDGE_FIXTURE=1 vitest run test/eval-fixture.test.ts
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, "..", "eval", "judge-fixture.json");
const UPDATE = Boolean(process.env.UPDATE_JUDGE_FIXTURE);

/** The committed fixture's on-disk shape (top-level tags + per-golden Scores in corpus order). */
interface JudgeFixture {
  judgeVersion: string;
  synonymsVersion: number;
  scores: Score[];
}

const entries = loadCorpus();
// Recompute the live Scores once — `scoreSource` is pure and deterministic.
const scores = entries.map((e) => scoreSource(e, readGolden(e)));
const live: JudgeFixture = { judgeVersion: JUDGE_VERSION, synonymsVersion: SYNONYMS_VERSION, scores };

describe("judge fixture — byte-equivalence proof across the intent lift", () => {
  if (UPDATE) {
    it("regenerates eval/judge-fixture.json from the current judge", () => {
      writeFileSync(FIXTURE, JSON.stringify(live, null, 2) + "\n");
      expect(live.scores).toHaveLength(entries.length);
    });
    return;
  }

  const committed = JSON.parse(readFileSync(FIXTURE, "utf8")) as JudgeFixture;

  it("fixture version tags match the live scoring-core constants", () => {
    expect(committed.judgeVersion).toBe(JUDGE_VERSION);
    expect(committed.synonymsVersion).toBe(SYNONYMS_VERSION);
  });

  it("fixture covers the whole corpus, in order", () => {
    expect(committed.scores.map((s) => s.id)).toEqual(entries.map((e) => e.id));
  });

  // One assertion per golden so a judge drift names the exact brief that moved.
  for (const [i, entry] of entries.entries()) {
    it(`${entry.id} scores identically to the pinned fixture`, () => {
      expect(scores[i]).toEqual(committed.scores[i]);
    });
  }
});
