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
    // ~4 chars/token. What the cap is FOR: `spec.llm.md` is injected VERBATIM into agent
    // system prompts (`arch spec`, `arch context --section spec`, the MCP shim's baked
    // resource, archlang.uk), so its size is a RECURRING PER-REQUEST TOKEN COST paid by every
    // downstream agent on every call, not a one-off repo weight. That is what makes each
    // addition worth arguing about.
    //
    // The rules for moving the number:
    //   - TRIM DUPLICATION BEFORE RAISING. A raise is never a threshold nudged to green a red
    //     suite; it names what grew and by how much ("this language grew", with the new
    //     surface's cost itemised), after the new lines were written, measured and cut back.
    //   - A redundancy may be cut only once it is PROVABLE: e.g. every clause attribute is
    //     checked by `assertScriptingKeywordsTaught` to appear in a code span elsewhere, which
    //     is what lets the spec carry no separate Attributes bullet.
    //   - MEASURE WHAT THE ASSERTION MEASURES: the in-memory `renderLlmSpec()` string, not
    //     `readFileSync("spec.llm.md")` — on a Windows checkout every CRLF costs a character
    //     this test does not see. And a budget figure records what the generator emitted,
    //     never what two branches' arithmetic implies: parallel branches widening the same
    //     interpolated alternation do not add.
    //   - Keep a working margin. The spec embeds `examples/attached.arch` and
    //     `examples/parametric.arch` VERBATIM, so a margin of a dozen characters turns the
    //     cap into a veto on unrelated example edits instead of a price on the spec's prose.
    //
    // Where the budget goes: every structural keyword (`level`, `zone`, `place`, `site`,
    // `height`) and element line carries facts that cannot be inferred from the syntax — the
    // behaviours that are invisible in the output or refused rather than approximated. The
    // `furniture` line's size-optional list INTERPOLATES every catalogued footprint from
    // `CANONICAL_FIXTURES`, so each new fixture family with a footprint costs ~10 characters
    // on its own. The next real lever is the `door` line, the longest in the document at over
    // 1,600 characters, whose per-kind clause prose a machine-readable table would carry
    // better than a sentence.
    //
    // 30,000 leaves ~222 chars of headroom on a measured 29,778.
    expect(spec.length).toBeLessThan(30_000);
  });
});
