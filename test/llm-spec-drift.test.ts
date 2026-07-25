/**
 * Drift guard for `spec.llm.md` (the one-prompt agent spec).
 *
 * `scripts/gen-llm-spec.ts` generates it from the token source + the real example
 * files. This test regenerates it in-memory and asserts the committed file matches
 * — the CI equivalent of `npm run gen:spec && git diff --exit-code`. If it fails,
 * run `npm run gen:spec` and commit. It also asserts the spec stays sized for a
 * system prompt and lists every element keyword.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderLlmSpec, SPEC_EXAMPLES } from "../scripts/gen-llm-spec.js";
import { KEYWORDS } from "../src/grammar/tokens.js";

function exampleSources(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of SPEC_EXAMPLES) out[name] = readFileSync(resolve("examples", name), "utf8");
  return out;
}

describe("spec.llm.md is in sync with the token source + examples", () => {
  it("has no drift", () => {
    const committed = readFileSync("spec.llm.md", "utf8").replace(/\r\n/g, "\n");
    expect(renderLlmSpec(exampleSources())).toBe(committed);
  });

  it("documents every built-in element", () => {
    const spec = renderLlmSpec(exampleSources());
    for (const el of KEYWORDS.element) expect(spec).toMatch(new RegExp(`^${el} `, "m"));
  });

  it("documents every statement keyword that draws something", () => {
    // `strip` is a CONTROL keyword, not an `element`, so the check above never saw it —
    // and it shipped for three releases with no syntax line anywhere in the spec. Pin the
    // statement keywords here too, so the gap cannot reopen from the test side either.
    const spec = renderLlmSpec(exampleSources());
    expect(spec).toMatch(/^strip </m);
  });

  it("stays small enough to drop into a system prompt (< ~4.6k tokens)", () => {
    const spec = renderLlmSpec(exampleSources());
    // ~4 chars/token. Raised 16k → 18k deliberately (2026-07-13): the v1.13–v1.15 surface
    // the spec had been silently omitting (strip, on-wall attachment, furniture anchors, and
    // 7 more CLI verbs) is real language an agent must know, and it does not fit in 16k. This
    // is a considered budget increase, NOT a threshold nudged to green a red suite — the
    // suite was green at 15,901 when this was raised. Trim duplication before raising again.
    //
    // Raised 18k → 18.5k for the same reason (v1.21, multi-storey): `level` is a new
    // *structural* keyword — an agent that does not know it cannot write a two-storey plan at
    // all, and cannot read `compile`'s per-level output — and the baseline was already at
    // 17,960 with nothing duplicated left to cut. The line it adds is one deliberately dense
    // sentence (537 chars), not prose — the suite is green at 18,498. Trim duplication before
    // raising again.
    //
    // Raised 18.5k → 19.5k for the same reason (v1.21, vertical circulation): `stair` /
    // `elevator` / `escalator` are three new ELEMENTS, and the stair line has to carry the
    // one rule that is not guessable — that the same id on two `level` blocks is a shaft,
    // which is what makes an upper storey reachable and what `W_STAIR_UNMATCHED` reports.
    // The three lines were trimmed to 800 chars total before this was raised (the first
    // draft was 1,230), and the suite is green at 19,363. Trim duplication before raising
    // again.
    expect(spec.length).toBeLessThan(19_500);
  });
});
