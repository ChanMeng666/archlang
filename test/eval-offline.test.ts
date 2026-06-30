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

  it("no golden contains a physical-correctness violation", async () => {
    const { results } = await evaluate(entries, (e) => readGolden(e));
    const broken = results.filter((r) => r.physicalWarnings > 0);
    expect(broken.map((r) => `${r.id}: ${r.failures.join(", ")}`)).toEqual([]);
  });

  it("scoreSource fails a plan with furniture drawn through a wall", () => {
    const s = scoreSource(
      { id: "y", prompt: "", golden: "", expect: { rooms: 2 } },
      `plan "P" {
        units mm
        wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
        wall partition thickness 100 { (4000,0) (4000,4000) }
        room id=a at (0,0)    size 4000x4000 label "A"
        room id=b at (4000,0) size 4000x4000 label "B"
        furniture sofa at (3500,1000) size 1000x900
      }`,
    );
    expect(s.physicalWarnings).toBeGreaterThan(0);
    expect(s.semanticPass).toBe(false);
    expect(s.failures.some((f) => f.startsWith("physical:"))).toBe(true);
  });
});
