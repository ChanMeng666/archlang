/**
 * The `keep` byte-identity law (ADR 0033 decision 7; PS4.3 design §7).
 *
 * **K1, weak: a plan with no `keep` is unchanged.** Every file of the examples, the eval goldens
 * and the plan corpora (`KEEP_WEAK_LAW_ROOTS`) compiles, describes (with and without
 * `--facts depends`), lints, validates and reports impact byte for byte as it did on the tree
 * before the statement existed, and its resolution spends the same evaluation steps. The baseline
 * (`./keep-byte-identity-baseline.ts`) was measured with this file's own body
 * (`./keep-weak-law.ts`) and committed before any code landed.
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { KEEP_WEAK_BASELINE } from "./keep-byte-identity-baseline.js";
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
