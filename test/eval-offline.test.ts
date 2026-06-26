import { describe, expect, it } from "vitest";
import { evaluate, loadCorpus, readGolden, scoreSource } from "../eval/run.js";

/**
 * Authorability regression guard (offline eval).
 *
 * Every golden in the corpus must compile and match its semantic expectations. This
 * is the CI-safe half of the NL→ArchLang eval: if a language change breaks a plan a
 * model already wrote, this fails — no API key needed. The live eval (`npm run eval
 * -- --live`) produces the headline authorability number for the README.
 */

describe("eval — committed goldens still author correctly", () => {
  const entries = loadCorpus();

  it("the corpus is non-empty", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("every golden compiles and matches its expected semantics", async () => {
    const { results, summary } = await evaluate(entries, (e) => readGolden(e));
    const failed = results.filter((r) => !r.semanticPass);
    expect(failed.map((r) => `${r.id}: ${r.failures.join(", ")}`)).toEqual([]);
    expect(summary.valid).toBe(summary.total);
  });

  it("scoreSource flags a plan that misses its room-count expectation", () => {
    const s = scoreSource(
      { id: "x", prompt: "", golden: "", expect: { rooms: 5 } },
      `plan "P" { units mm room at (0,0) size 4000x3000 label "Only" }`,
    );
    expect(s.valid).toBe(true);
    expect(s.semanticPass).toBe(false);
    expect(s.failures.some((f) => f.startsWith("rooms:"))).toBe(true);
  });
});
