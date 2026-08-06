# P2-3 site & orientation — ship the NAMED-DIRECTION layer in closed form; the 2026-07 daylight refusal STANDS

**Date:** 2026-08-06 · **Status:** DESIGN PROPOSAL — nothing approved, nothing implemented, no
source file touched · **Roadmap item:**
[`2026-08-06-competitor-borrowing-roadmap.md`](./2026-08-06-competitor-borrowing-roadmap.md) §5 P2-3
(+ its "P2-3 axis warning") · **Prior verdict engaged:**
[`2026-07-ai-first-deep-dive.md:171`](./2026-07-ai-first-deep-dive.md) (Track D) · **Reference
codebases:** PlanScript TS (MIT, `D:\github_repository\planscript`) and PlanScript-Rust (MIT,
`D:\github_repository\planscript-rust\planscript-rust`), read at their working-tree state ·
**Requires:** the `windowFacing` true-north fix (`82d4221`, currently on an unmerged worktree
branch) to be on `main` first.

Everything below marked **PROPOSED** is a design choice offered for approval, not an established
fact. Facts about the current tree carry a `file:line`.

## 1. Position on the standing daylight verdict — **(a) confine to closed form. The verdict is upheld, not superseded.**

Track D of the 2026-07 deep dive ruled:

> Orientation is assertable (window facing is pure geometry, a small `describe` addition);
> **daylight is not** (requires sky/climate simulation — breaks determinism and zero-dep; refuse
> honestly). — `docs/research/2026-07-ai-first-deep-dive.md:171`

**This proposal takes option (a).** It proposes **no sun model, no sky model, no latitude, no date,
no solar-hour count, no shadow, no daylight factor, no irradiance**. Not one number in it is a
physical quantity. Everything it derives is a **name for one of the four compass letters the plan
already reports**, produced by a total function of two closed vocabularies:

| Derived name | Definition | Inputs |
| --- | --- | --- |
| `back` | the opposite letter of `street` | `street` |
| `morning_sun` | `"E"`, always, in both hemispheres | — |
| `afternoon_sun` | `"W"`, always, in both hemispheres | — |
| `good_sun` | the **equator-facing** side: `"S"` in the northern hemisphere, `"N"` in the southern | `hemisphere` |

That is four table lookups and one negation. It is exactly as much of a "sun model" as the north
arrow is a compass — a labelling convention, not a measurement. `compile()` stays pure,
synchronous, deterministic and zero-dependency, and no number leaves the mm/`fmt()` world.

**The honesty clause is load-bearing, and it is where this proposal earns the right to use the
word "sun" at all.** `good_sun` names a *drafting heuristic* ("habitable rooms want the
equator-facing aspect"), not a measured daylight outcome. A south window in Reykjavík and one in
Singapore are not the same daylight and this layer will never say they are. **PROPOSED:** every
surface that emits `good_sun` — the `describe()` fact, the lint message, the intent schema
description, `docs/analysis.md` — carries that sentence, and a test pins the schema description so
it cannot be quietly dropped. If the owner would rather not spend the word "sun" on a convention,
the fallback spelling is `equator_side` / `sunrise_side` / `sunset_side`; it is strictly more
honest and strictly less familiar to a model that has read PlanScript's docs. **OPEN — owner's
call** (§10, Q1).

**The refusal list is part of the design, not an omission.** These are declined *by name* so a
later session does not read the silence as an invitation: `latitude`, `longitude`, any date or
season, solar altitude/azimuth, sun-hours, overshadowing, daylight factor, glare, and any
`W_*` that quantifies daylight. `latitude` is the tempting one and it is the clearest refusal:
a latitude number buys **nothing** any predicate here can consume — the first thing you could do
with it is compute a sun path, which is precisely the simulation the verdict refuses. A field that
is accepted, stored, and never legally read is worse than no field: it invites a future
implementation that breaks the verdict without ever re-opening it.

**Nothing in §1 supersedes, amends or narrows any standing decision.** The T3 iron law is untouched
(§4.3 explains why the one gating predicate this proposes is not a tier change and why
adjacency/reachability stay advisory). T6 is untouched (no `area` token, no `m2` suffix). The
dataset and judge-comparability laws are untouched (§4.3, §7).

## 2. What already exists — this feature COMPOSES, it does not re-derive

The roadmap's P2-3 row lands in `src/describe.ts`, `src/lint.ts`, `src/intent.ts`. Two of those
three already contain the hard part. Verified in the tree:

| Already shipped | Where | What it means for P2-3 |
| --- | --- | --- |
| `north up\|down\|left\|right\|<deg>` as a plan-level setting | type `src/ast.ts:24-25`, field `src/ast.ts:778`, dispatch `src/parser.ts:249-252`, parse `src/parser.ts:561-572`, IR `src/ir.ts:346` + `:1411`, Scene `src/scene.ts:262` + `src/scene-build.ts:844`, formatter `src/format.ts:370-385` | The page→compass anchor is **already authored and already plumbed end to end.** `site` never touches it |
| page facing of every window | `windowFacing`, `src/describe.ts:564-583` | Classifies against the **host room's own rect** (`:571-576`), falling through to the host wall segment for a polygon room (`:798-800`) |
| declared north → clockwise quarter-turns | `northQuarterTurns`, `src/describe.ts:512-532` | `{deg}` snaps to the nearest cardinal, exact 45° ties clockwise; no trig, one `Math.floor` |
| page facing → **true compass** facing | `toCompass`, `src/describe.ts:543-546`; assembled `:791-809` | `describe().windows[].facing` is **already a compass letter**. `facingPage` is emitted only when `northTurns !== 0` (`:807`), so a plan with no `north` is byte-identical |
| a gating window predicate that already understands `facing` | `Predicate` `room-windows` `src/intent.ts:87`, checker `src/intent.ts:374-391`, schema enum `src/intent.ts:773-778` | An intent can **already** assert `windows: { facing: "S" }`. P2-3 does not invent orientation assertions; it adds *symbolic targets* to one that exists |
| lint reaching `north` with no interface change | `LintContext.ir` `src/lint/context.ts:36`, `ir.north` `src/ir.ts:346` | An orientation rule needs **zero** context plumbing |

**Consequence, and it is the whole shape of this design:** the roadmap's transferable detail —
planscript-rust's `wall_direction` classifying against the room's own bbox
(`planscript-rust/src/validation.rs:681-703`) so interior rooms classify correctly — **is already
implemented here**, and has been since before the fix (`src/describe.ts:571-576` uses the host
room's rect, not the plan envelope). See §9 for that and the other roadmap corrections.

So P2-3 is **not** "teach ArchLang about compass directions". It is: *give three or four of those
directions a brief-level name, and let an assertion and a lint rule use the name.* That is a much
smaller feature than the roadmap row implies, and it is the reason it can be done in closed form.

## 3. The grammar — **PROPOSED** surface

### 3.1 The statement

```
site {
  street north|south|east|west     # required
  hemisphere north|south           # optional, default north
}
```

Modelled on `axes` (`src/parser.ts:262-269` dispatch, `:630-650` parser, `src/ast.ts:737-744` node)
because `site` is a **plan-level setting** with more than one field and room to grow — not on
`zone`, which is a body statement. The simpler `paper` setting (`src/parser.ts:477-495`) supplies
the three mechanics this must copy verbatim:

1. `this.spanFrom(t.start)` recorded into a `siteSpan`, so a diagnostic can blame the statement;
2. a **closed vocabulary** checked against an exported `readonly` tuple, failing on the offending
   word rather than the keyword;
3. a `closest()` did-you-mean in the failure message — the `schedule` variant
   (`src/parser.ts:515-528`) is the closer template because it spans the *offending word*.

### 3.2 The closed vocabularies

```ts
export const COMPASS_DIRECTIONS = ["north", "south", "east", "west"] as const;
export const HEMISPHERES = ["north", "south"] as const;
```

Both exported from `src/ast.ts` beside `SCHEDULE_SUBJECTS` (`src/ast.ts:753`), and both pinned to
`KEYWORDS` by a drift test copying `test/sheet.test.ts:130-134` verbatim — that is the precedent
this document is told to follow, and it is the right one: it is what stops the highlighter and the
parser drifting apart.

### 3.3 Source spelling vs JSON spelling — **PROPOSED, one mapping, one place**

Source spells **words** (`street south`); every machine surface keeps the **letters** the tree
already uses — `describe().windows[].facing` is `"N"|"S"|"E"|"W"` (`src/describe.ts:543`), and
so is the intent schema's `facing` enum (`src/intent.ts:775`). Widening that enum to accept
`"south"` as well as `"S"` would give one concept two JSON spellings forever. So: **one total
function `compassLetter(word)` in `src/describe.ts` beside `toCompass`**, applied once at the IR
boundary, and nothing downstream ever sees a word.

The alternative — spelling the source `street S` — is rejected for readability, but see §10 Q1.

### 3.4 The keyword-category collision, stated plainly

`north` is **already** in `KEYWORDS.attribute` (`src/grammar/tokens.ts:62`), because `north up` is
a statement. `street north` puts the same word in a *value* position, whose category is
`KEYWORDS.enum` (`src/grammar/tokens.ts:112-156`).

This is **not** a parser problem. The lexer emits every word as an `ident` and keywords are
recognised at parse time (`src/grammar/tokens.ts:12-15`, `isKeyword` `src/parser.ts:176-179`), so
there is no reserved word and no ambiguity — `site { street north }` parses.

It **is** a vocabulary problem: no word is currently in two `KEYWORDS` categories, and the
generators build flat alternations from those lists (`litAlt` over `KEYWORDS.*`, e.g.
`scripts/gen-gbnf.ts:116-119`). **PROPOSED:** add only `south`, `east`, `west` to `KEYWORDS.enum`
and leave `north` in `attribute`. Cost: in `street north` the word `north` is coloured as a
setting keyword rather than as an enum value — one word, one shade off, in one position. Benefit:
no word appears twice, no generator has to learn about duplicates, and the drift test stays a
one-liner. The alternative (allow the duplicate) needs every `KEYWORDS` consumer audited for
set-vs-list assumptions first. **OPEN — §10 Q2.**

### 3.5 Placement, repetition, levels, imports

| Question | **PROPOSED** answer | Rationale / precedent |
| --- | --- | --- |
| Where may `site` appear? | Plan level only — never inside `level`, `zone`, `component`, `for`/`if`/`while`, `strip` | One building sits on one site, exactly as it is issued on one sheet |
| Two `site` blocks? | **`E_SITE_DUP`**, an error | `axes` merges because two axis lists *append* (`src/parser.ts:264-268`); two `street` values **contradict**. Silently overwriting (what `paper` does today) hides an authoring mistake in the one statement whose whole job is to be the single source of orientation |
| Missing `street` inside the block? | **`E_SITE_NO_STREET`** | A `site` with no street derives nothing; refusing beats defaulting. PlanScript agrees (`LANGUAGE_REFERENCE.md:195-199` marks it Required) |
| Does an imported module's `site` apply? | **No — ignored, exactly as its `north` is** | `src/import.ts:72-74` and `src/ast.ts:705-707` already ignore a module's `units`/`grid`/`paper`/`scale`/`north`/`dims`/`title`/`axes`/`schedule`/`legend` because one drawing is issued on one sheet at one scale. Site is the same class of fact, and it composes with `north`, which is already governed this way. Being anything else would let an imported wing silently re-orient the building |
| Where is it in `arch fmt` output? | Immediately after `north`, before `dims auto` | `src/format.ts:385-386`. It reads as a rider on the north declaration, which is what it is |

`site` must therefore be added to the **three prose lists** of what may sit outside a `level`
block: `src/ast.ts:450` (the `LevelNode` doc comment), `src/error-catalog.ts:395` (the
`E_LEVEL_MIX` fix line, which enumerates them), and `src/import.ts:72` (the ignored-settings
list). Missing any one of the three leaves the language documented wrong in a place an agent
reads.

## 4. What is derived, and where it surfaces

### 4.1 `describe()` — one new optional top-level key

```json
"site": {
  "street": "S",
  "back": "N",
  "morning_sun": "E",
  "afternoon_sun": "W",
  "good_sun": "S",
  "hemisphere": "north"
}
```

Present **only** when the plan declares `site`, exactly as `sheet` is present only with `paper`
(`src/describe.ts:379-384`) and `axes` only with an `axes` block (`:400-406`). Append-only, so the
`CompileResult`/`SceneSummary` promise holds.

**Deliberately NOT added: any per-room orientation roll-up.** A room's window facings are already
`windows.filter(w => w.room === id).map(w => w.facing)` from facts that ship today
(`src/describe.ts:793-809`). Adding `rooms[].facings` would duplicate a derivation, grow every
summary, and create a second place for the north rotation to be applied — the exact bug
`82d4221` just fixed one instance of. The `site` block adds **names for directions**; it adds no
geometry.

**Churn this forces:** `DESCRIBE_KEYS` in `src/cli/commands-analyze.ts:92-…` gains `"site"`, or
`describe --select site` is a usage error. That list is pinned against the real key set by
`test/cli-narrow.test.ts` (`src/cli/commands-analyze.ts:88-91`), so the omission fails CI rather
than shipping — which is the guard working, not an obstacle.

### 4.2 Lint — **one** advisory rule, no machine fix

**PROPOSED: `W_ROOM_NO_GOOD_SUN`** — a habitable room (living / bedroom, classified through the
existing `USE_VOCABULARY` + `matchVocabulary` path in `src/vocabulary.ts`, the same route
`W_BEDROOM_NO_WINDOW` takes) has **at least one** window and **none** of them faces `good_sun`.

Four conditions, each carrying its reason:

- **Fires only when the plan declares `site`.** No `site` ⇒ the rule cannot run ⇒ every existing
  plan lints byte-identically, and the byte-identity law of §5 extends to lint output.
- **Requires ≥ 1 window.** A zero-window bedroom is already `W_BEDROOM_NO_WINDOW`'s report;
  double-reporting one defect under two codes makes a `--code`-filtered read misleading.
- **Exact test, no fuzz.** "None faces `good_sun`" — not "none faces `good_sun` or an adjacent
  quarter". A quarter-tolerance is a threshold with no derivation, and this language has spent two
  releases removing those.
- **No `FixSuggestion`.** The remedy is "move a window to the other facade", which is geometry the
  compiler must not choose — [ADR 0005](../adr/0005-no-invisible-architect.md), facts and advice,
  never an invisible architect. A `hints` line naming the `good_sun` letter is the whole
  affordance.

Mechanics: a new module under `src/lint/rules/`, **appended last** in `LINT_RULES`
(`src/lint/rules/index.ts:26-55`, whose header states the order is contract), reading
`ctx.ir.north` and the new `ctx.ir.site` — no `LintContext` field beyond the `ResolvedPlan` it
already holds (`src/lint/context.ts:36`). No new `LintRuleset` threshold: the rule has no number
in it (`src/lint/ruleset.ts`). It joins the **Room** family in `docs/analysis.md:632-640`.

### 4.3 Intent — widen one enum, add one refusal code. **No new predicate kind.**

**PROPOSED:** `roomsInclude[].windows.facing` accepts, in addition to `"N"|"S"|"E"|"W"`, the
five **symbolic targets** `"good_sun"`, `"morning_sun"`, `"afternoon_sun"`, `"street"`, `"back"`.
A symbolic target resolves to a letter through the plan's `describe().site` at check time, then
the existing `checkRoomWindows` (`src/intent.ts:374-391`) runs unchanged.

Why widen rather than add a `room-orientation` kind:

- `checkRoomWindows` **already** filters by compass facing (`src/intent.ts:381-383`) and already
  shares the greedy one-room-one-concept claim pool with `room-exists`/`room-area`
  (`src/intent.ts:400-408`). A new kind would duplicate that pool logic or sit outside it and
  disagree with it about which room a concept claimed.
- The failure it reports is the same failure: *the room the brief named does not have the window
  the brief asked for.* `E_INTENT_NO_WINDOW` (`src/intent.ts:117`, catalogued
  `src/error-catalog.ts:314`) is already worded for it, and `docs/intent.md:137` already says
  "optionally facing a direction".
- It is strictly less surface: one enum in `intentFromJson`'s `FACINGS` set (`src/intent.ts:608`),
  one enum in `INTENT_JSON_SCHEMA` (`src/intent.ts:773-778`), one resolution step.

**The refusal that must not be forgotten.** An intent asserting `facing: "good_sun"` against a plan
with **no** `site` block must be a hard error, never a silent pass and never a silent fail:
**PROPOSED `E_INTENT_NO_SITE`**, catalogued alongside the other eight `E_INTENT_*` codes
(`src/error-catalog.ts:300-334`), added to the `IntentCode` union (`src/intent.ts:109-117`) and to
the gating table in `docs/intent.md:129-137`. This is the one thing PlanScript got structurally
right — `ORIENTATION_NO_SITE = 'E601'` (`planscript/src/validation/index.ts:33`), raised before any
orientation assertion is evaluated (`:640-650`, and identically
`planscript-rust/src/validation.rs:529-544`) — and it is the difference between an unanswerable
question and a wrong answer.

**Two iron laws, addressed explicitly rather than assumed:**

> **Gating tier.** A symbolic `facing` rides `room-windows`, which is **already** `gate: true`
> (`src/intent.ts:87`), because a brief-stated window is a deliverable. This is **not** a tier
> change: `facing: "S"` gates today, and `facing: "good_sun"` is the same assertion with the letter
> written differently. The permanently-advisory set — adjacency and reachability
> (`src/intent.ts:85-86`, AGENTS.md standing decisions) — is untouched, and nothing here generates
> anything: the channel still only measures and gates.

> **`JUDGE_VERSION`.** `src/intent.ts:32` states the criterion: the version bumps when predicate
> kinds or their **corpus judgments** change, and "new predicate kinds unused by the corpus (e.g.
> `room-windows`) do not bump it". A widened enum that no corpus intent uses changes **no corpus
> per-assertion judgment**, so `JUDGE_VERSION` stays `"2"` — and that is proved, not asserted, by
> `eval/judge-fixture.json` remaining byte-identical. **The fixture is never regenerated for this
> work.** If it moves, the change is wrong; the response is to fix the change, never to re-pin.
> Nothing here compares any rate across anything.

### 4.4 What is deliberately NOT derived

| Not derived | Why |
| --- | --- |
| Any daylight quantity | §1. The 2026-07 verdict stands |
| `latitude` / `longitude` / date / season | Consumable only by a sun path, i.e. the simulation the verdict refuses. A stored-but-unreadable field is an invitation |
| `rooms[].facings` roll-up | Already derivable from shipped facts; a second place to apply the north rotation is a second place to get it wrong |
| A **drawn** street/site symbol | Site is semantics, not chrome. The north arrow already carries orientation on the sheet, and any new ink breaks §5's byte-identity for the plans that adopt `site` — a much bigger promise to make in stage 1 |
| `near street` / `away_from street` | Definable (§8, stage 3) but needs a threshold. PlanScript hardcodes `tolerance = 0.5` metres against the **footprint** bbox (`planscript/src/validation/index.ts:524`; identically `planscript-rust/src/validation.rs:715`) — a magic epsilon of exactly the class this repo's non-goals table rejects. Not shipped without a derived bound |
| `garden_view` as its own assertion | Free: it **is** `facing: "back"`. One concept, one spelling |

## 5. The byte-identity law

**Law (to be pinned by test, in a new `test/site.test.ts`):**

> **A plan that declares no `site` block is byte-identical — in every backend — and its
> `describe()`, `lint()` and `validateIntent()` output is unchanged, field for field.**

Concretely, the assertions:

1. **Render.** For every tracked `examples/*.arch`, `compile()` output is byte-equal to the
   pre-change golden — SVG, DXF, ASCII, and PDF. `site` draws nothing (§4.4), so this must hold for
   plans that declare `site` too; a dedicated case compiles one source with and without a `site`
   block and asserts the two SVGs are identical.
2. **`describe()`.** No `site` ⇒ the key is **absent**, not `null` — the same discipline `sheet`
   and `axes` keep (`src/describe.ts:379-384`, `:400-406`). Asserted by deep-equality against the
   summary of the same source parsed by the pre-change build, and by a key-set assertion.
3. **Lint.** No `site` ⇒ `W_ROOM_NO_GOOD_SUN` cannot fire, and because it is appended last
   (`src/lint/rules/index.ts:54`) the diagnostic **order** of every existing plan is unchanged —
   the property every rule added since v1.21 has had to satisfy.
4. **Intent.** An `Intent` with no symbolic facing lowers to a byte-identical `Predicate[]`
   (`compileIntent`, `src/intent.ts:238-240`) and produces byte-identical `detail` strings — the
   `facing` clause only appears when a facing is asserted (`src/intent.ts:386`), which is the
   existing behaviour and must not move.
5. **`eval/judge-fixture.json` is unchanged**, byte for byte (§4.3).
6. **Determinism, both engines.** `compile(s) === compile(s)` with the optional `clipper2-wasm`
   backend registered *and* cleared — the standing pair, unaffected here because `site` reaches no
   geometry, but asserted so a later stage cannot quietly change that.

And the round-trip: `arch fmt` on a plan with `site` re-emits exactly one `site` block in the
canonical position, and formatting is idempotent (`formatPlan`, `src/format.ts:374-390`).

## 6. Generators — the exact `gen:*` set, and the two that hard-fail until fed

Adding `site` to `KEYWORDS.control` (`src/grammar/tokens.ts:21-41`) and `STATEMENT_STARTS`
(`src/grammar/tokens.ts:204-…`, consumed as `FIXED_STATEMENT_STARTS` `src/parser.ts:55` → `:122`)
makes **two generators throw on the next run**. This is the guard system working exactly as
designed, and both failures are the *first* signal, not the last:

| Generator | Guard | Message | What feeds it |
| --- | --- | --- | --- |
| `npm run gen:gbnf` | `assertVocab`, `scripts/gen-gbnf.ts:94-103` | *"KEYWORDS.control entries have no production: site. Add a rule that emits the literal, or list it in `CONTROL_COVERED_STRUCTURALLY`."* | A real `site-stmt` production emitting the literal + both closed vocabularies via `litAlt` — **derived from `COMPASS_DIRECTIONS` / `HEMISPHERES`, never retyped** (the stale-template law: `gen-grammars.ts` once hardcoded a number regex without the unit suffixes and reproduced it forever). `CONTROL_COVERED_STRUCTURALLY` (`:82`) is **not** the answer here — `site` is a real literal an agent must be able to decode |
| `npm run gen:spec` | drift guard #2, `scripts/gen-llm-spec.ts:114-126` | *"KEYWORDS.control is not fully covered by the spec … Add each new keyword to `STATEMENT_GRAMMAR` (it draws something) or `SCRIPTING_KEYWORDS` (prose covers it)."* | A `STATEMENT_GRAMMAR["site"]` line. It is the branch that fits: `site` is a setting an agent must be able to *write*, and the guard exists precisely because `strip` shipped for three releases with no syntax line |

The full regeneration set, **in dependency order** (`gen:spec` before `gen:llms`, which consumes
it):

| Command | Why it moves |
| --- | --- |
| `npm run gen:grammars` | new `control` + `enum` entries → TextMate grammar + `playground/src/arch-language.js` |
| `npm run gen:gbnf` | new production (hard-fails first — above) |
| `npm run gen:errors` | new codes `E_SITE_DUP`, `E_SITE_NO_STREET`, `W_ROOM_NO_GOOD_SUN`, `E_INTENT_NO_SITE` → `docs/error-codes.md`. Every raised code needs a catalogue entry and vice-versa (a test enforces both directions); each example fence must be emitted `arch static`, which `scripts/gen-error-codes.ts` already does |
| `npm run gen:spec` | new statement line (hard-fails first — above) |
| `npm run gen:llms` | consumes the regenerated spec + error catalog |
| `npm run gen:intent-schema` | the widened `facing` enum + its descriptions → `schemas/intent.schema.json` |
| `npm run gen:cli` | **only if** a flag or an `examples[]` entry changes in `src/manifest.ts`. Stage 1 adds none |
| `npm run gen:plan-schema` | **only if** `PLAN_JSON_SCHEMA` gains `site` — see §10 Q3; `compile --from-json` round-tripping a plan that loses its `site` is a silent asymmetry, so the answer is probably yes |

`npm run check:drift` then proves reproducibility — and, per the standing law, proves *only* that.
It cannot tell you the production is correct, which is why each rendering above is required to be
derived from the source-of-truth tuple rather than retyped.

**Also regenerated, and easy to forget:** `packages/mcp` bakes `spec.llm.md`, `llms-full.txt`,
`archlang.gbnf` and both schemas in at **pack** time. A language-surface release therefore turns
`packages/mcp/scripts/check-dist-resources.mjs` and `packages/mcp/test/lockstep.test.ts` red **on
purpose** until the resources are rebuilt and the shim is bumped in `packages/mcp/package.json`
*and* both `version` fields of `server.json`. Shipping `site` without that hands MCP hosts a grammar
that cannot decode it — the exact 0.2.2 failure recorded in AGENTS.md.

## 7. Doc churn to name

| File | Edit |
| --- | --- |
| `docs/language-reference.md:47-…` | A `site { … }` row in the **plan-level settings** table (beside `north`, whose row at `:47` already explains that `north` orients the compass facing `describe()` reports), plus a short section on the derived names carrying the §1 honesty clause. **GFM trap:** any `\|` inside inline code in a table cell must be escaped (`test/docs-table-pipes.test.ts`) |
| `docs/analysis.md:25-…` | The `describe` contract gains the `site` block in its worked JSON |
| `docs/analysis.md:632-640` | `W_ROOM_NO_GOOD_SUN` into the **Room** family row of the lint table |
| `docs/intent.md:34-78` | The `facing` field's symbolic targets, in "The shape" |
| `docs/intent.md:123-137` | `E_INTENT_NO_SITE` into the **Gating** table, with one sentence on why it is a refusal rather than a failure |
| `docs/error-codes.md` | **GENERATED** — never hand-edited; falls out of `gen:errors` |
| `spec.llm.md`, `llms-full.txt`, `schemas/intent.schema.json`, `grammars/archlang.gbnf` | **GENERATED** — §6 |
| `CHANGELOG.md` | `[Unreleased]` until a release claims it |
| `examples/` | See §8 — **PROPOSED: no new flagship.** Adding `site` to an existing example changes its `describe()` output and its docs-site page. `examples/two-bed.arch:6` is the one example that declares `north right`, so it is the natural place to *demonstrate* the composition — and precisely therefore the change with the widest golden blast radius. Stage 1 ships the feature with **test fixtures only**; an example is a stage-2 decision taken with the diff in hand |

Verification beyond `npm run check` + `check:drift`: `npm run docs:build` for the three `docs/*.md`
edits (the core suite does not compile the site), `npm run typecheck:all` if anything outside
`src/`+`test/` moves, and — because a published ```` ```arch ```` fence **compiles in the reader's
browser** — every new fence either compiles clean or carries `static` (`test/docs-fences.test.ts`).

## 8. Staged plan

| Stage | Contents | Gate to the next stage |
| --- | --- | --- |
| **0 — prerequisite** | `82d4221` (`windowFacing` true north) merged to `main` | Without it every derived direction is page-relative and silently wrong on `examples/two-bed.arch`. **Do not start stage 1 before this lands** |
| **1 — the language + the facts** | `site` grammar (§3), `PlanNode.site` + `siteSpan`, IR passthrough, formatter slot, `describe().site` (§4.1), `E_SITE_DUP` / `E_SITE_NO_STREET`, `DESCRIBE_KEYS`, the three prose lists, all generators (§6), the byte-identity suite (§5) | `check` + `check:drift` + `typecheck:all` green; goldens **untouched** |
| **2 — the two consumers** | `W_ROOM_NO_GOOD_SUN` (§4.2) and the symbolic-facing widening + `E_INTENT_NO_SITE` (§4.3) | `eval/judge-fixture.json` byte-identical; `eval:ci` identical to baseline; diagnostic order unchanged on every example |
| **3 — deferred, by name** | `near street` / `away_from street` (§4.4) — if built, defined **exactly**: "the room's `bbox` (`src/describe.ts:91`) touches the plan's `bbox` on that compass side within the analysis tolerance `tolMm` (`src/lint/ruleset.ts`)", never a fresh magic epsilon. And a `site`-bearing flagship example | Its own design pass, or a written close like the dims-collision item in the roadmap's §2 |

**Deferred by name, so the silence is not read as an invitation:** latitude/longitude and every
daylight quantity (§1 — permanently, not "later"); a drawn site/street symbol; `rooms[].facings`;
`near street` / `away_from street` (stage 3); a `site`-aware `arch suggest`; and any orientation
input to `repair()` — `repair()` is the **geometric** corrector, and "move a window for the sun" is
a design decision, not a geometric correction.

## 9. Corrections to the roadmap's P2-3 brief

Found while verifying it. None changes the recommendation; two change the cost.

| Roadmap claim | Finding |
| --- | --- |
| planscript-rust's `wall_direction` (`:681-703`) "classifying against the **room's own bbox** so interior rooms classify correctly — that detail is worth keeping" | **True, and we already have it.** `windowFacing` classifies against the host room's own rect (`src/describe.ts:571-576`) and falls through to the host wall segment for a polygon room (`:798-800`), which is *more* correct than theirs. Also: the detail is not rust-specific — the TS original is the same function (`planscript/src/validation/index.ts:469-497`), transliterated. **Nothing to port; the cost of this line item is zero** |
| "PlanScript's model is **y-up** (`DESIGN.md:4`)" | True but mis-cited: the declaration is `axis x:right y:up` at **`DESIGN.md:76`** (§4 of that document, which is presumably what `:4` meant). The inversion warning stands and is real — their `wall_direction` maps `max_y → North` (`validation.rs:687-688`), which under our y-down convention is the **top** of the page. **In practice it costs nothing here**, because this design never ports their geometry: our page→compass conversion is `toCompass` (`src/describe.ts:543-546`) and it is already correct for y-down |
| "their compass is always screen-up … they never solved true north" | **Confirmed, in both.** `generateCompassSVG` draws a fixed up-arrow with the comment *"pointing up in SVG = north in plan"* (`planscript/src/exporters/svg.ts:1143`, `:1163-1164`); the rust twin is `exporters.rs:3023`. So `site` there is a *semantic* layer over an unrotatable page. Ours composes with a real `north`, which is why §2's composition rule is not optional |
| "orientation assertions + lint" as a single unit of work | The **assertion** half is an enum widening on an existing gating predicate, not a new predicate kind (§4.3) — materially cheaper than the row implies. The **lint** half is one rule with no threshold and no fix. The real cost of P2-3 is the grammar + generator + doc surface (§6, §7), not the semantics |
| Not in the roadmap, and it is the main risk | The **`north` keyword-category collision** (§3.4) — the first word that would sit in two `KEYWORDS` categories. Not a parser problem, but it needs an owner decision before implementation, not during |

## 10. What would sink this

1. **Q1 — `good_sun` read as a daylight claim.** If a user, a model, or a downstream integrator
   takes `good_sun` for a measured outcome, the feature has broken the 2026-07 verdict in effect
   while formally honouring it — which is worse than not shipping, because the refusal is the
   project's credibility. Mitigations: the honesty clause on every surface (§1), the schema-
   description pin, and the `equator_side` fallback spelling. **This is the single question that
   most needs an owner answer, and it is a naming decision, not an engineering one.**
2. **Q2 — the `north` category collision (§3.4).** If the owner rejects the "leave `north` in
   `attribute`" compromise, the alternatives are auditing every `KEYWORDS` consumer for duplicate
   tolerance, or spelling the source `street S|N|E|W`. Both are viable; neither should be
   discovered mid-implementation.
3. **Q3 — `PLAN_JSON_SCHEMA`.** If `site` is not added, `compile --from-json` silently drops it and
   a Plan-JSON round trip loses the site. If it is added, `gen:plan-schema` joins §6's set. Leaning
   **add**, but it is a decision.
4. **Golden churn nobody signed up for.** If stage 1 touches any `examples/*.arch`, §5's law is
   violated at the one moment it most needs to hold. Stage 1 ships with fixtures only, on purpose.
5. **The MCP staleness trap.** Shipping the language surface without bumping `packages/mcp` in all
   three version fields hands hosts a grammar that cannot decode `site` while the dep range resolves
   to a core that can — the recorded 0.2.2 failure. It fails loudly now (`check-dist-resources.mjs`,
   `lockstep.test.ts`); the risk is someone relaxing the guard to get green.
6. **`JUDGE_VERSION` drift.** If `eval/judge-fixture.json` moves, the change is wrong. Re-pinning it
   to green a red suite voids the eval permanently. There is no version of this feature worth that.
7. **Scope creep into a sun model.** The refusal list in §1 exists because "we already have
   hemisphere, latitude is one more field" is a genuinely tempting next step and is the exact
   boundary the verdict drew. If a future session wants it, it re-opens the 2026-07 verdict
   explicitly — it does not arrive as a P2-3 follow-up.
8. **Is it worth it at all?** Honest read: the *semantics* are a day's work and add real
   brief-expressiveness — an architectural brief says "living room gets the afternoon sun" far more
   often than it says "living room has a west-facing window", and today that sentence has no
   checkable form. But the *surface* cost is a new keyword, two vocabularies, six generator runs,
   four docs, an MCP version bump and a keyword-category decision — the standard price of any P2
   row. **Recommendation: worth building, and worth building small** — stage 1 + stage 2 exactly as
   scoped, stage 3 deferred, nothing that needs a sky.

## 11. Files & sources

**This repo (verified at the current worktree state).** `src/ast.ts:24-25`, `:450`, `:705-712`,
`:737-744`, `:753`, `:778` · `src/parser.ts:55`, `:122`, `:176-179`, `:249-252`, `:262-269`,
`:477-495`, `:515-528`, `:561-572`, `:630-650` · `src/grammar/tokens.ts:12-15`, `:21-41`, `:56-110`,
`:112-156`, `:204` · `src/ir.ts:346`, `:1411` · `src/scene.ts:262` · `src/scene-build.ts:844` ·
`src/format.ts:370-390` · `src/import.ts:66-89` · `src/describe.ts:82-111`, `:353-406`, `:512-532`,
`:543-546`, `:564-583`, `:791-809` · `src/intent.ts:32`, `:53-75`, `:80-87`, `:109-117`, `:155-235`,
`:374-391`, `:400-408`, `:608-611`, `:620-692`, `:707-819` · `src/error-catalog.ts:300-334`, `:395` ·
`src/lint/context.ts:35-56` · `src/lint/rules/index.ts:26-55` · `src/lint/ruleset.ts` ·
`src/cli/commands-analyze.ts:81-102` · `scripts/gen-gbnf.ts:77-104`, `:116-119` ·
`scripts/gen-llm-spec.ts:104-132` · `test/sheet.test.ts:130-134` · `examples/two-bed.arch:6` ·
`docs/language-reference.md:47` · `docs/analysis.md:25`, `:632-640` · `docs/intent.md:34`, `:123-137`.

**Prior verdicts and laws.** [`2026-07-ai-first-deep-dive.md:171`](./2026-07-ai-first-deep-dive.md)
(the daylight refusal, upheld) · [`2026-07-g2-verdict.md`](./2026-07-g2-verdict.md) (T6 parked; the
house style this document copies) ·
[`2026-08-06-competitor-borrowing-roadmap.md`](./2026-08-06-competitor-borrowing-roadmap.md) §5 ·
[ADR 0005](../adr/0005-no-invisible-architect.md) (facts and advice, never an invisible architect) ·
[ADR 0016](../adr/0016-component-instances-and-frames.md) (the house style for a design decision
that names its rejected alternative) · `AGENTS.md` → "Standing decisions & iron laws".

**Competitor sources (MIT; read and reimplement, never vendor).** PlanScript TS —
`LANGUAGE_REFERENCE.md:191-234` (the `site` block and its derived table), `:891-970` (the
orientation assertions), `DESIGN.md:72-84` (`axis x:right y:up`),
`src/lowering/index.ts:676-694` (`deriveSiteInfo` — the four-line derivation this design's §1 table
is the closed-form restatement of), `src/validation/index.ts:33-37` (E601–E605),
`:444-466` (`getRoomWindowDirections`), `:469-497` (`getWallDirection`), `:500-536`
(`isRoomNearDirection`, `tolerance = 0.5` at `:524`), `:640-650` (the no-site refusal),
`src/exporters/svg.ts:1143`, `:1163-1164` (the always-screen-up compass). PlanScript-Rust —
`src/validation.rs:524-608` (the same assertions), `:681-703` (`wall_direction`), `:705-722`
(`is_room_near_direction`, `tolerance = 0.5` at `:715`), `src/exporters.rs:3023`
(`generate_compass_svg`).
