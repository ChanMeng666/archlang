/**
 * The `keep` byte-identity law (ADR 0033 decision 7; PS4.3 design §7).
 *
 * **K1, weak: a plan with no `keep` is unchanged.** Every file of the examples, the eval goldens
 * and the plan corpora (`KEEP_WEAK_LAW_ROOTS`) compiles, describes (with and without
 * `--facts depends`), lints, validates and reports impact byte for byte as it did on the tree
 * before the statement existed, and its resolution spends the same evaluation steps. The baseline
 * (`./keep-byte-identity-baseline.ts`) was measured with this file's own body
 * (`./keep-weak-law.ts`) and committed before any code landed.
 *
 * **K2, strong: an accepted keep draws nothing and moves nothing** (R8, R9, R13). Every plan of
 * the keep corpus (`test/keep-corpus/`) whose keeps are all accepted is compiled as written and
 * with each keep's bytes blanked by spaces, newlines kept, inside the test (no twin file to
 * drift): every storey's SVG and `lint()` are identical; `describe()` (with and without
 * `--facts depends`) is identical once the `keeps` key and the `W_KEEP_VIOLATED` rows are
 * removed; `compile().diagnostics` is identical once its `W_KEEP_VIOLATED` rows are removed, and
 * identical with nothing removed for a plan whose keeps all hold.
 *
 * K3, the digest table over the keep rows themselves, is `./keep-digests.test.ts`.
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { KEEP_WEAK_BASELINE } from "./keep-byte-identity-baseline.js";
import { compile, describe } from "../src/index.js";
import { blankKeeps, k2Parts, keepCorpus, keepNodes } from "./keep-harness.js";
import { keepWeakLawDigest, keepWeakLawFiles, keepWeakLawSteps } from "./keep-weak-law.js";

suite("keep · K1, the weak law: a plan with no keep is unchanged", () => {
  it("the baseline covers the corpus as it stood, and no baseline file declares a keep", () => {
    const files = new Set(keepWeakLawFiles());
    expect(KEEP_WEAK_BASELINE.length).toBeGreaterThan(250);
    for (const [f] of KEEP_WEAK_BASELINE) {
      expect(files.has(f), f).toBe(true);
      // A keep statement starts a line; a comment that mentions the word is not one.
      expect(/^\s*keep\b/m.test(readFileSync(f, "utf8")), f).toBe(false);
    }
  });

  it("every file: the same digest and the same evaluation steps", () => {
    const moved: string[] = [];
    for (const [f, digest, steps] of KEEP_WEAK_BASELINE) {
      if (keepWeakLawDigest(f) !== digest) moved.push(`${f} (digest)`);
      if (keepWeakLawSteps(f) !== steps) moved.push(`${f} (steps)`);
    }
    expect(moved).toEqual([]);
  }, 600_000);
});

/** The corpus plans whose keeps are all accepted (no `E_*`): K2's domain (R8). */
const accepted = (): [string, string][] =>
  keepCorpus().filter(([, src]) => !compile(src, { noCache: true }).diagnostics.some((d) => d.severity === "error"));

suite("keep · K2, the strong law: an accepted keep draws nothing and moves nothing", () => {
  it("the corpus covers every form, every grade and every refusal, and K2 is not vacuous", () => {
    const all = keepCorpus();
    expect(all.length).toBeGreaterThanOrEqual(12);
    const forms = new Set<string>();
    const grades = new Set<string>();
    const codes = new Set<string>();
    for (const [, src] of all) {
      for (const k of keepNodes(src)) {
        forms.add(k.form);
        grades.add(k.grade ?? "hard");
      }
      for (const d of compile(src, { noCache: true }).diagnostics) if (d.code?.includes("KEEP")) codes.add(d.code);
    }
    expect([...forms].sort()).toEqual(["align", "equal", "fixed", "min-clear", "offset", "on-axis", "stacked"]);
    expect([...grades].sort()).toEqual(["advisory", "hard", "soft"]);
    expect([...codes].sort()).toEqual([
      "E_KEEP_LIMIT",
      "E_KEEP_MEASURE",
      "E_KEEP_PLACEMENT",
      "E_KEEP_SELF",
      "E_KEEP_TARGET",
      "E_KEEP_VALUE",
      "W_KEEP_VIOLATED",
    ]);
    expect(accepted().length).toBeGreaterThanOrEqual(9);
  });

  for (const [name, src] of accepted()) {
    it(name, () => {
      const blank = blankKeeps(src);
      expect(blank.length).toBe(src.length);
      expect(keepNodes(blank)).toEqual([]);
      const a = k2Parts(src, true);
      const b = k2Parts(blank, false);
      expect(a.svg).toBe(b.svg);
      expect(a.lint).toBe(b.lint);
      expect(a.describe).toBe(b.describe);
      expect(a.describeDepends).toBe(b.describeDepends);
      expect(a.diagnostics).toBe(b.diagnostics);
      const allHold = (describe(src).keeps ?? []).every((k) => k.holds);
      if (allHold) expect(k2Parts(src, false).diagnostics).toBe(b.diagnostics);
    });
  }
});
