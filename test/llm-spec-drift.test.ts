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
    // NOT raised for the value-set interpolation pass (`assertVocabRendered`, and
    // `test/spec-forms.test.ts` beside it). Recorded here because a future reader will
    // otherwise wonder why a change that ADDED text left the number alone. Every
    // retyped closed set — the room `uses` kinds, the furniture anchors, the paper
    // sizes/orientations, the scale ladder, the built-ins, the relational
    // directions/alignments, the `dims auto` modes, the `north` words, the strip and
    // vertical directions, the dim endpoint references and the arc directions — now
    // INTERPOLATES from its source array, which is byte-neutral (they all matched).
    // Three edits were not: the wall line stopped printing `material <name>` and now
    // prints the closed list plus the W_UNKNOWN_MATERIAL fallback (an agent could not
    // otherwise guess a legal material, and a wrong guess degrades the drawing
    // SILENTLY); the `dims auto` modes are printed in full for the first time (the page
    // taught `all` and `rooms` and never said the set was closed at four); and the
    // paper line names which orientation is the default. Paid for by ONE genuine
    // duplication: the CLI section stated exit code `2`'s meaning twice fifteen lines
    // apart, and the FIRST statement is rendered from the manifest — so the
    // hand-written restatement in the self-correction paragraph went, exactly as
    // `--strict`'s did last time. Green at 24,088 — **12 chars of headroom**, so the
    // next edit here almost certainly trips this. That is the cap working: trim
    // duplication, and raise it only with a reason of the kind written above.
    //
    // Raised 24.1k → 25k to WIDEN THE WORKING MARGIN, not because the spec grew past
    // the old number. Every raise above was reactive — a feature or a correction had
    // already made the file too big, and the number moved to admit it. This one is not:
    // the file is 24,088 and the old cap 24,100, so the margin had shrunk to **12
    // characters**, and a 12-char margin is not a budget, it is a tripwire on unrelated
    // work. The spec embeds `examples/attached.arch` and `examples/parametric.arch`
    // VERBATIM, so a one-character edit to either example — a change with nothing to do
    // with the spec — fails this test and hands the person who made it a choice between
    // reverting their example and deleting real agent guidance to fit. That is the cap
    // pointed at the wrong target: it is here to price the spec's own prose, not to
    // veto edits to the examples it quotes.
    //
    // What the cap is FOR, restated because it is easy to read as an arbitrary ceiling:
    // `spec.llm.md` is injected VERBATIM into agent system prompts (`arch spec`, `arch
    // context --section spec`, the MCP shim's baked resource, archlang.uk), so its size
    // is a RECURRING PER-REQUEST TOKEN COST paid by every downstream agent on every
    // call, not a one-off repo weight. At ~4 chars/token, 25,000 chars is ~6.25k tokens
    // of every prompt that carries it. That is what makes each addition worth arguing
    // about, and why the standing instruction stays: TRIM DUPLICATION BEFORE RAISING.
    //
    // Headroom bought at the moment of raising: **912 chars** over the then-current
    // 24,088 (~228 tokens), against 12 before.
    //
    // Where 693 of that went, in the same commit — recorded here so the next reader does
    // not mistake a thin margin for a cap that was never widened. Two structural holes in
    // `gen-llm-spec.ts` were closed and both cost text:
    //   - a THIRD table, `SETTING_GRAMMAR`, for the `KEYWORDS.attribute` entries that are
    //     plan STATEMENTS. They fell between the element guard and the control guard, so
    //     `dims`, `accTitle` and `accDescr` had no syntax on the page at all — only bare
    //     words in the keyword bullet. Three new Structure lines.
    //   - `SCRIPTING_KEYWORDS`'s "the prose covers these" claim became a CHECK, which
    //     failed immediately for `theme` and `style` (documented nowhere), so the missing
    //     Scripting bullet had to be written.
    // Paid for in part by one real duplication: the `dims auto` MODE SET was printed on
    // the `dim` element line because that was the only line that could hold it; now that
    // `dims` has a line of its own, the set has one owner and `dim` points at it.
    //
    // Green at 24,781 — **219 chars of headroom**, ~18× the 12 this replaced. Enough that
    // a character-level edit to `examples/attached.arch` or `examples/parametric.arch`
    // (both embedded VERBATIM) is no longer a spec-budget negotiation, which was the whole
    // point; not enough to be generous. Trim duplication before raising again — and the
    // largest single lever left is the `**Attributes:**` keyword bullet (~690 chars),
    // which the new partition guard has made *categorically* redundant but not yet
    // *provably* so: the guard asserts every attribute is classified, not that every
    // clause attribute is actually RENDERED in some element line. Make it assert the
    // rendering and the bullet can go.
    //
    // v1.27.0 spent 27 of the 219: the `on <wall> at <pos>` position became an
    // EXPRESSION, and the `door` line has to say so (an agent that does not know cannot
    // place a `for`-generated run, which is the whole reason the slot was widened) plus
    // the one grammar quirk it introduces — a `%` there ENDS the expression rather than
    // meaning modulo. The cap was NOT raised: 53 of the 80 chars were paid for on the
    // spot by de-duplicating the `window` line, whose "same two placement forms as door;
    // `wall` pairs with the `at` form ONLY" restated the door line's own sentence — it
    // now reads "placement + `wall` clause exactly as door", which is verbatim the
    // phrasing the `opening` line already used for the identical fact. Green at 24,970,
    // **30 chars of headroom**. That is back inside tripwire range, so the Attributes
    // bullet above is now the next edit here, not a someday one.
    //
    // v1.28.0 spent net 15 of the 30, and the gross number is the interesting one. The
    // furniture line's size-optional fixture list stopped being a hand-typed eight names
    // plus an ellipsis and became an INTERPOLATION of every catalogued footprint — which
    // the same release grew from 8 families to 18. That is +115 characters against 30 of
    // headroom, so 100 were paid for on the spot, all of them inside the furniture line:
    //   - `in <roomId>` was written TWICE in the grammar form, once before `centered` and
    //     once before `anchor`; factored to `in <roomId> (centered | anchor …)`.
    //   - "an `against` piece takes rotation FROM the wall, so writing one is
    //     E_FURN_AGAINST" restated "derives position+rotation" from earlier in the same
    //     note; it now reads "an `against` piece's comes FROM the wall (E_FURN_AGAINST…)".
    //   - "`side` inferred from `in <roomId>` when omitted" lost "when omitted", which the
    //     word "inferred" already carries.
    //   - the `flush` sentence said "`flush`" three times in two clauses.
    // Green at 24,985. The cap was NOT raised, and the list is now the kind of text that
    // GROWS on its own: every new catalogued footprint adds its name here. That makes the
    // Attributes bullet (~690 chars, above) not the next edit but an overdue one — the
    // next fixture family to ship a footprint will not find 15 characters waiting for it.
    //
    // v1.29.0 did that overdue edit, and then raised the cap. In order:
    //
    //   1. **The Attributes bullet is GONE.** It measured 475 chars, not the ~690
    //      estimated above (the estimate predated the `SETTING_GRAMMAR` split, which had
    //      already taken nine words out of it). It could go because the redundancy became
    //      PROVABLE, which is the condition the note above set: `gen-llm-spec.ts` now runs
    //      `assertScriptingKeywordsTaught` over `CLAUSE_ATTRIBUTES` as well, so every one
    //      of the 48 clause words is checked to appear in a code span or fence elsewhere
    //      in the document. All 48 already did. The partition guard alone never proved
    //      that — it proved each attribute was CLASSIFIED as a clause, not that the
    //      classification was true — and that gap is exactly why the bullet had to stay.
    //
    //   2. **Two new elements cost 1,119 chars gross.** `roof` (two spellings, seven
    //      catalogued refusals an authoring agent has to be able to avoid) and `void`
    //      (three behavioural facts that are invisible from the syntax: it obstructs
    //      circulation, it does not reduce the room's area, and `describe()` reports it).
    //      There is no duplication inside either line to trim — both were already written
    //      down twice and cut back before this measurement.
    //
    // Net 25,629, so the cap moves to 26,000: **371 chars of headroom**, comparable to
    // the 219 the last real raise bought. The instruction is unchanged and now has one
    // fewer lever behind it: TRIM DUPLICATION BEFORE RAISING. What is left to trim is no
    // longer a redundant bullet but real content, so the next raise should be argued as
    // "this language grew", not "this page repeats itself".
    //
    // v1.31.0 spent all 371 and then some, and the whole of it is "this language grew" —
    // which is the argument the note above says the next raise has to make, since what is
    // left to trim is real content rather than a redundant bullet. The release landed on
    // two parallel tracks and each was measured on its own against 25,911 at the v1.30.0
    // release commit, so both sets of numbers are recorded here and the net below is
    // their sum, not either one's.
    //
    // Track A — the outdoor GROUND elements, ~+1,964:
    //
    //   1. **`outdoor` costs ~1,100 chars.** One element, but it carries more than most:
    //      nine kinds, two spellings, four catalogued refusals and two warnings an
    //      authoring agent has to be able to avoid, and — the part that cannot be cut —
    //      three behavioural facts that are INVISIBLE from the syntax and wrong if
    //      guessed. It is not a room (so its area lands in a different total and it joins
    //      no access graph); it obstructs nothing, water included; and it grows the page.
    //      A model that assumes any of the three the other way produces a plan whose own
    //      `describe()` it will then misread.
    //
    //   2. **`fence` costs ~470.** Deliberately the cheap one: most of its line is the
    //      single fact that it is NOT a thin wall, which is the only thing a reader could
    //      reasonably get wrong. The three styles are named by what they draw rather than
    //      described, and the `arc` refusal is one clause.
    //
    //   3. **`site` gained ~150** for the `boundary` clause and its two refusals.
    //
    // Both element lines were written, measured and cut back BEFORE this raise — ~150
    // chars of restatement came out of them (the label-point derivation, which an author
    // cannot act on, and a "picket = / panel = / post =" gloss that re-listed the three
    // words already standing in the syntax half).
    //
    // Track B — the outdoor FIXTURES and the garage, +360:
    //
    //   4. **+38 for six new catalogued footprints.** The outdoor fixture tranche adds 21
    //      families, and six of them (`hedge`, `bbq`, `bin`, `mailbox`, `ev_charger`,
    //      `shed`) carry a footprint — so their names join the furniture line's
    //      size-optional list, which is exactly the text v1.28.0's note predicted would
    //      "GROW on its own". The other fifteen cost nothing: an uncatalogued-footprint
    //      family is not named anywhere in this document.
    //   5. **+17 for `uses garage`.** Seven characters in the `uses` alternation, ten in
    //      the reference the rest of the room line already carried.
    //   6. **+305 for the sixth door kind.** Seven of those are the word in the kind
    //      alternation; the other 298 are the three facts about `garage` an authoring model
    //      cannot guess and cannot recover from a refusal: it takes NO clause (so a model
    //      that reaches for `open` or `slide` gets E_DOOR_KIND_CLAUSE and needs to know
    //      there is no right answer, not a different one), its projection side is DERIVED
    //      rather than written, and that projection is dashed because dashed means above
    //      the cut plane. The kind is the first one whose clause row is entirely `false`,
    //      so "which clauses does it take" has an answer no other kind's prose supplies.
    //
    // The two deltas do NOT simply add. 25,911 + 1,964 + 360 predicts 28,235; the merged
    // spec MEASURES 27,940, 295 short — because both tracks widened the same interpolated
    // alternations and each measured its own widening against a document that did not yet
    // carry the other's. The number below is the measured one, and that is the rule: a
    // budget note records what the generator emitted, never what two branches' arithmetic
    // implies it should have.
    //
    // Net 27,940, so the cap moves to 28,300: **360 chars of headroom**, comparable to
    // the 371 the last raise bought. The instruction is unchanged and there is now no
    // known duplication left to spend: TRIM DUPLICATION BEFORE RAISING — and when there
    // is none left, say what grew and by how much. The next lever is a real one: the
    // `door` line is now the longest in the document at over 1,600 characters, and its
    // per-kind clause prose is the part a machine-readable table would carry better than
    // a sentence.
    //
    // ## v1.32 (the furniture catalogue): +251, and the cap moves to 28,600
    //
    // Measured after BOTH furniture tracks merged, from the quantity this test actually
    // asserts on: 27,940 -> **28,191**. Every one of the 251 characters is the `furniture`
    // line's catalogued-footprint list growing by the twenty-six new families, all of which
    // have a footprint and therefore all of which join a list the generator INTERPOLATES from
    // `CANONICAL_FIXTURES`. The arithmetic closes exactly: 8 kitchen-and-bath names are 71
    // characters plus 8 separators = 79, and 18 living/bedroom/office names are 154 plus 18
    // separators = 172. Nothing else in the document moved, which is the expected shape --
    // this release adds no keyword, no clause and no error code, and the fixture vocabulary is
    // a catalogue the spec interpolates rather than a grammar it describes.
    //
    // TWO THINGS THE MERGE HAD TO SETTLE, both of them worth leaving written down.
    //
    // The two branches' CAP RAISES do not add. Each measured the same base and added only its
    // own families, so one read 28,700 and the other 28,800; taking either would have been
    // arbitrary and taking their sum absurd. Their GROWTHS do add -- 79 + 172 = 251 -- because
    // the two sets of names are disjoint entries in one list. Cap re-measured from the merged
    // document, growth carried through from both.
    //
    // And both branches' notes quoted their base as 28,235, which is 295 too high: that is
    // `readFileSync("spec.llm.md")` on a Windows checkout, where 295 CRLF line endings each
    // cost a character the in-memory `renderLlmSpec()` string this test measures does not
    // have. The conclusions were unaffected (a delta is blind to a constant offset) but the
    // absolute figures were not this test's, so they are restated here from its own quantity.
    // MEASURE WHAT THE ASSERTION MEASURES.
    //
    // There is still no duplication left to trim -- the `door`-line lever above is untouched
    // and remains the honest next move -- so this is a raise with the growth named, as the
    // instruction requires. 28,600 buys **409 chars of headroom** on the measured 28,191, in
    // the same band as the 360 and 371 the last two raises bought. A fixture family with a
    // footprint costs this document about 10 characters, so a tranche this size will need
    // another raise; that is the honest signal rather than a defect, since the list is derived
    // and so cannot silently disagree with the catalogue.
    //
    // ## v1.35 — the vertical datum layer: 28,191 -> 29,778, and the trim that came first
    //
    // A raise with the growth named, and the trim done BEFORE it, as the instruction
    // requires. The first draft of this tranche measured **30,385** — it said "DRAWS
    // NOTHING — a plan is a horizontal cut" on four separate lines, spelled the six
    // defaults out twice, and named all three refusal codes in three places. Saying each of
    // those ONCE, in the `height` SETTING line, and pointing the four element lines at it
    // took 607 characters back off. What is left is not duplication: a plan setting, three
    // element clauses, six defaults, three codes, the override chain and the gating rule.
    //
    // The remaining 1,587 is the honest cost of a new language surface, and it is
    // distributed the way the surface is: ~700 on the `height` setting (the one place the
    // datum is explained), ~250 across the four element lines that take a clause, ~200 on
    // `level`, and the rest in the keyword and error-code lists this file derives.
    //
    // 30,000 buys **222 chars of headroom** on the measured 29,778 — tighter than the 409
    // the last raise bought, deliberately: this tranche adds no derived LIST that will grow
    // on its own (unlike the fixture catalogue, which costs ~10 characters a family), so
    // the next raise should be triggered by a real new surface rather than by drift.
    expect(spec.length).toBeLessThan(30_000);
  });
});
