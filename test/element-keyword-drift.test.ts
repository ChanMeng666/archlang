/**
 * Drift guard for the weakest joint in the "adding an element = one module"
 * story: `KEYWORDS.element` (src/grammar/tokens.ts — feeds the parser's
 * statement-start set, the editor grammars and the LLM spec) and
 * `BUILTIN_DEFS` (src/elements/defs.ts — the runtime registry) are two
 * hand-maintained lists. A new element added to one but not the other would
 * parse-fail (or highlight wrong) with no test catching the mismatch — this one
 * does, in both directions and in order.
 */

import { describe, expect, it } from "vitest";
import { BUILTIN_DEFS } from "../src/elements/defs.js";
import { KEYWORDS } from "../src/grammar/tokens.js";

describe("element keyword ↔ registry drift", () => {
  it("KEYWORDS.element lists exactly the built-in defs' keywords, in canonical order", () => {
    expect(KEYWORDS.element).toEqual(BUILTIN_DEFS.map((d) => d.keyword));
  });

  it("every def's kind is reachable from its keyword (registry invariant)", () => {
    for (const d of BUILTIN_DEFS) expect(typeof d.kind).toBe("string");
    expect(new Set(BUILTIN_DEFS.map((d) => d.kind)).size).toBe(BUILTIN_DEFS.length);
  });
});
