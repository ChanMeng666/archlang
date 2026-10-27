/**
 * The `facts` gate of `describe()` — the byte-identity law for the opt-in derived facts.
 *
 * `symmetry`, `syntax`, `depends`, `clearances` and `quantities` are computed ONLY when named in `DescribeOptions.facts`. So, over
 * every example (multi-storey ones included, where each storey carries its own copy):
 *
 *  - the default summary never contains any of their keys, anywhere;
 *  - `facts: []` is the default, byte for byte;
 *  - asking for them only ADDS their keys: strip them and the summary is the default one,
 *    byte for byte — no other fact moves because a fact was requested.
 *
 * The SVG and `lint()` never see `DescribeOptions` at all; the corpus digest suites
 * (`byte-identity-*`) cover them unchanged.
 */

import { describe as suite, expect, it } from "vitest";
import { DESCRIBE_FACTS, describe, type SceneSummary } from "../src/index.js";
import { EXAMPLE_FILES, EXAMPLES_WORLD } from "./d4-oracle.js";

const FACT_KEYS: readonly string[] = DESCRIBE_FACTS;

/** The summary with every requested-fact key removed, at the top level and per storey. */
function strip(s: SceneSummary): unknown {
  const drop = (o: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(Object.entries(o).filter(([k]) => !FACT_KEYS.includes(k)));
  const top = drop(s as unknown as Record<string, unknown>);
  if (s.levels) top.levels = s.levels.map((l) => drop(l as unknown as Record<string, unknown>));
  return top;
}

const hasFactKey = (json: string): boolean => FACT_KEYS.some((k) => json.includes(`"${k}":`));

suite("describe facts gate — the default is byte-identical", () => {
  it("DESCRIBE_FACTS names exactly the five opt-in facts", () => {
    expect([...DESCRIBE_FACTS]).toEqual(["symmetry", "syntax", "depends", "clearances", "quantities"]);
  });

  it.each(Object.keys(EXAMPLE_FILES))("%s", (rel) => {
    const src = EXAMPLE_FILES[rel]!;
    const plain = JSON.stringify(describe(src, { world: EXAMPLES_WORLD }));
    expect(hasFactKey(plain), "the default summary carries no opt-in fact").toBe(false);
    expect(JSON.stringify(describe(src, { world: EXAMPLES_WORLD, facts: [] }))).toBe(plain);

    const withFacts = describe(src, { world: EXAMPLES_WORLD, facts: DESCRIBE_FACTS });
    expect(JSON.stringify(strip(withFacts))).toBe(plain);
    if (withFacts.ok) {
      expect(withFacts.symmetry, "requested → present").toBeDefined();
      expect(withFacts.syntax, "requested → present").toBeDefined();
      expect(withFacts.depends, "requested → present").toBeDefined();
      expect(withFacts.clearances, "requested → present").toBeDefined();
      expect(withFacts.quantities, "requested → present").toBeDefined();
      for (const l of withFacts.levels ?? []) {
        expect(l.symmetry, `level ${l.level} carries its own symmetry`).toBeDefined();
        expect(l.syntax, `level ${l.level} carries its own syntax`).toBeDefined();
        expect(l.depends, `level ${l.level} carries its own depends`).toBeDefined();
        expect(l.clearances, `level ${l.level} carries its own clearances`).toBeDefined();
        expect(l.quantities, `level ${l.level} carries its own quantities`).toBeDefined();
      }
    }
    // Deterministic: a second request reports the same bytes.
    expect(JSON.stringify(describe(src, { world: EXAMPLES_WORLD, facts: DESCRIBE_FACTS }))).toBe(
      JSON.stringify(withFacts),
    );
  });

  it("one fact asked for is one fact present", () => {
    const src = EXAMPLE_FILES["studio.arch"]!;
    const s = describe(src, { facts: ["syntax"] });
    expect(s.syntax).toBeDefined();
    expect("symmetry" in s).toBe(false);
    expect("depends" in s).toBe(false);
  });
});
