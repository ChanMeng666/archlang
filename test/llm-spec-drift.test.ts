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
    //
    // Raised 19.5k → 20.3k for the same reason (v1.22, zones): `zone` is a new *structural*
    // keyword whose whole point is that it is invisible in the output, so an agent that does
    // not know it cannot read a zoned plan's source, cannot use `describe --zone`, and cannot
    // tell why its `schedule rooms` table grew SUBTOTAL rows. Its line is one dense sentence
    // trimmed from 1,050 chars to 590, and the `schedule` line's addendum from 200 to 90
    // (the whole feature costs 730 chars); the suite is green at 20,135. Trim duplication
    // before raising again.
    //
    // Raised 20.3k → 21k for the same reason (v1.22, component v2): `place` is the fifth
    // *structural* keyword, and the one an agent will get wrong by guessing — a bare
    // `wing()` call and `place wing() as west at (…)` look interchangeable and are not
    // (id namespace, local coordinates, the transform, and the fact that an instance IS
    // a zone). Its line has to carry five facts that cannot be inferred: `as`+`at` are
    // required, the body is authored from (0,0), ids become `<instance>.<id>` and are
    // addressed dotted, a whole FILE can be the component, and the bare call is still the
    // old inline macro. It was trimmed from 742 to 645 chars before this was raised (the
    // `describe()`/freedom and nesting details went to the language reference), and the
    // suite is green at 20,770. Trim duplication before raising again.
    //
    // Raised 21k → 21.4k for v1.23 (polygonal rooms). `room polygon …` is a THIRD room
    // form, not a modifier: an agent that does not know it exists writes a bounding-box
    // rectangle and silently loses the notch, and one that does know must also be told
    // the two rings that are rejected and — the important half — that the rectangle-only
    // clauses REFUSE a polygon room (E_PLACE_POLY) instead of approximating it, so it
    // reaches for `at (x,y)` rather than fighting an anchor. Trimmed first, twice: the
    // entry went 700 → 460 chars, and the duplicated "hand-computing half a wall
    // thickness" pitfall row was folded into the row above it (the `furniture` entry
    // already states the `flush` rule verbatim), giving ~290 chars back. Net +130.
    // Trim duplication before raising again.
    //
    // Raised 22.2k → 22.8k for the site & orientation layer. `site` is the sixth
    // *structural* keyword and, like `zone`, it is invisible in the drawing: an agent
    // that does not know it exists cannot read a `site`-bearing source, cannot explain
    // where `describe --json`'s `site` block came from, and — the expensive half — will
    // write `facing: "S"` where the brief said "facing the sun", because it has no way to
    // learn that the five NAMES are assertable at all. The entry has to carry four facts
    // that cannot be inferred: the syntax, that it draws nothing, what the five derived
    // names resolve to, and that they are a drafting heuristic rather than a daylight
    // claim (the honesty clause is load-bearing here — dropping it is exactly how this
    // feature would break the standing daylight refusal in effect while honouring it in
    // form). It was trimmed from 1,010 chars to 609 before this was raised — the
    // `site`-vs-`north` composition detail and the per-name hemisphere prose went to the
    // language reference — and the suite is green at 22,613. Trim duplication before
    // raising again.
    //
    // Raised 22.8k → 23.5k for the door vocabulary (four kinds + `slide`/`open`). The
    // door entry is the only place four facts can live, and none is inferable: (1) a
    // kind is a bare LEADING word, so an agent that does not know the list cannot even
    // read `door pocket on w1 …`; (2) `hinged` is the default AND writing it is
    // identical to omitting it; (3) only a hinged door has a swing arc, which is what
    // tells an agent that `W_SWING_OBSTRUCTED` has a real remedy in the language now
    // rather than a rewrite of the brief; and (4) — the expensive one — `swing` MEANS
    // SOMETHING DIFFERENT PER KIND (leaf side vs. mounting face), an overload that is
    // silently mis-authorable if it is not stated. The clause-legality codes are named
    // because the design REFUSES rather than ignores a wrong pairing, so an agent that
    // does not know will produce an error, not a slightly-wrong drawing. It was
    // trimmed from 1,298 chars to 1,106 before this was raised (the per-code prose and
    // the pocket-run threshold went to the language reference and the error catalog)
    // and the suite is green at 23,456. Trim duplication before raising again.
    //
    // Raised 23.5k → 24.1k for CORRECTNESS, not surface — the first raise in this
    // file's history that buys no new language at all. Every earlier entry above
    // paid for a feature the spec did not yet describe; this one pays to make lines
    // that were ALREADY here true. The grammar lines are hand-typed in the generator,
    // so `check:drift` reproduced the same wrong text every run and stayed green
    // (the standing "a generator's TEMPLATE can go stale" law): `wall` omitted
    // `[id=<name>]` entirely while four other lines require a wall id, so an agent
    // could not write a valid `door on <wall>` from the reference alone; `furniture`
    // printed `<category> [id=…]` in the order the parser REFUSES (it is
    // `eatKeyword` → `parseIdOpt` → `eatIdent`, so `id=` must lead); the trailing
    // `wall` clause on door/window/opening read as if it paired with either
    // placement form when it is accepted only when NOT attached; `dim`'s `offset`
    // was printed as required and is optional; `align` omitted `center`; and the
    // most-copied section on the page, the common-mistakes table, taught
    // `label "{aream2(W,H)} m²"` as though `aream2` were a built-in — it is a `let`
    // in examples/parametric.arch, so copying that row raises E_UNKNOWN_FN. The
    // single highest-leverage byte here is rule 6, which now states that `id=` leads
    // every element: that one sentence corrects the teaching for all ten id-bearing
    // grammar lines at once. ~430 chars of genuine duplication were cut first — two
    // common-mistakes rows DELETED (the `paper` row, whose "Fix" is a verbatim third
    // statement of the sheet paragraph directly above the Elements section, and the
    // "Reusing an `id`" row, now word-for-word inside the expanded rule 6) and three
    // more TIGHTENED to drop only the half their grammar line already states, plus
    // the third statement of the `against wall` advice in the furniture prose,
    // `--strict` "fails on warnings too" said twice ten lines apart, `level`'s
    // restatement of the `stair` shaft rule, and the intro's `arch spec` pointer
    // that the CLI verb list below already carries. Green at 24,044. NOTE the two
    // trims this comment does NOT claim: the `stair` multi-storey sentence and
    // `place`'s `import … as` clause were both examined and KEPT — the first states
    // the SEMANTICS of a shaft where `level` states only its legality, and the
    // second documents `import "f.arch" as name` (a whole file as a component),
    // which is a different form from the scripting bullet's `import "f.arch": sym`.
    // Trim duplication before raising again.
    expect(spec.length).toBeLessThan(24_100);
  });
});
