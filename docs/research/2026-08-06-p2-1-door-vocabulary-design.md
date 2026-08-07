# P2-1 door vocabulary — **buildable as designed, and the shape is smaller than it looks**: four kinds cost one enum table, one `doorSwing` early return, four `render()` branches and zero backend code

**Date:** 2026-08-06 · **Status:** DESIGN PROPOSAL — nothing implemented, nothing approved ·
**Brief:** [`2026-08-06-competitor-borrowing-roadmap.md`](./2026-08-06-competitor-borrowing-roadmap.md)
§5 (the P2-1 row and the "conventions worth having written down" block) ·
**Scope:** `src/elements/door.ts`, `src/geometry.ts`, `src/grammar/tokens.ts`, `src/lint/`,
`src/fix-producers.ts`, `src/frame.ts`, `scripts/gen-gbnf.ts`, `src/plan-json.ts` ·
**Sources read at head:** `D:\github_repository\arch-plotter` (MIT) and
`D:\github_repository\planscript-rust` (MIT). CeTZ was **not opened for this item** — it is
LGPL-3.0-or-later and contributes nothing here.

Everything below marked **Proposal** is a design choice this document is asking the owner to
approve or reject; everything marked **Verified** is a fact about the tree at this commit, cited
to `file:line`. Where a claim in the P2-1 brief turned out to be imprecise it is corrected in §11,
not quietly restated.

## 1. What the feature is, and the one thing that makes it cheap

Four new door kinds — `sliding` (bypass), `barn` (surface-sliding), `bifold`, `pocket` — plus a
drawn `open` state and an along-wall `slide` direction, plus a `W_POCKET_RUN` soundness rule
carrying a machine fix.

The reason this is a small change rather than a wide one is a single structural fact:

> **Verified.** `doorSwing` (`src/geometry.ts:118-136`) is the *only* place the leaf, the hinge,
> the far jamb and the arc orientation exist. It has exactly four callers —
> `src/elements/door.ts:217` (render), `src/lint/rules/doors.ts:20` (`W_SWING_OBSTRUCTED`),
> `src/repair.ts:907` (furniture push-out), and `test/swing.test.ts`. Every one of them already
> handles `null` (`doors.ts:21` guards `if (s)`; `repair.ts:907` filters
> `(s): s is DoorSwing => s !== null`; `door.ts:218` guards `if (swing)`).

A sliding door has no swing arc. **Proposal: `doorSwing` returns `null` for every non-hinged kind**
— a two-line early return — and all four call sites do the right thing with no edit. The lint rule
stops flagging it (correct: a bypass leaf sweeps nothing), the renderer stops emitting the leaf
line and arc (correct), `repair()` has one fewer obstacle (correct). The behaviour is not merely
tolerable, it is the behaviour the existing hint already advertises: *"Move the door or the
obstruction, flip its `hinge`/`swing`, or use a sliding door"* (`src/lint/rules/doors.ts:40`,
repeated in the catalog at `src/error-catalog.ts:658`). Today that hint names a door the language
cannot express. This item makes the hint honest.

## 2. Grammar proposal

**Proposal — surface syntax.** A bare kind word in leading position, and two trailing clauses
beside `hinge`/`swing`:

```
door [id=<name>] [hinged|sliding|barn|bifold|pocket]
     (at (x,y) | on <wall> at <pos>) width <mm>
     [wall <id|category>] [hinge left|right|near start|near end]
     [swing in|out|into <roomId>] [slide left|right] [open <0..1>]
```

Worked:

```
door pocket on partition at 40% width 900 slide left
door barn   on w_kitchen at center width 1100 slide right swing out open 0.6
door bifold on closet    at 50% width 1500 open 0.4
door        on w1        at 30% width 850  hinge left swing in     # unchanged, still hinged
```

Leading position is chosen to match the shipped precedent, not invented: `room [id=…] polygon …`
/ `room [id=…] circle …` (`scripts/gen-gbnf.ts:234-238`) and `dim [faces|clear] …`
(`:259-262`) both put a bare shape/mode word immediately after the keyword and any `id=`. It is
unambiguous by construction — after `parseIdOpt()` the only other legal leads are `at` and `on`
(`src/elements/door.ts:82`, via `parseAttachTarget`).

| Word | Category in `src/grammar/tokens.ts` | Why |
| --- | --- | --- |
| `hinged` `sliding` `barn` `bifold` `pocket` | `KEYWORDS.enum` (beside `left` `right` `in` `out`) | value words, not clause introducers |
| `slide` `open` | `KEYWORDS.attribute` (beside `hinge` `swing`) | clause introducers |

**Verified:** the lexer emits every word as an `ident` and keywords are recognised at parse time
(`src/grammar/tokens.ts:12-16`), so none of these seven words becomes reserved — an existing plan
with a room called `open` still parses. Adding them to `KEYWORDS` buys editor highlighting and
GBNF/spec rendering for free via `gen:grammars`.

**Open for the owner (A).** The alternative is a `kind <x>` clause (`door … width 900 kind pocket`),
which is more uniform with `hinge`/`swing` but less uniform with `room polygon`/`dim faces`, and
costs one extra token per statement. This document proposes the leading form; the choice is not
load-bearing for anything else here.

### 2.1 The parse-side restructure, which must land *before* the four words

**Verified.** Door enums are today validated by inline string comparison inside `parse()`:
`hinge` at `src/elements/door.ts:97-111` (`if (h !== "left" && h !== "right") ctx.fail(…)`) and
`swing` at `:112-123` (`if (s !== "in" && s !== "out") ctx.fail(…)`). There is no table. A second
copy of the same literals lives in `resolve()` for the `set door(…)` default path —
`enumDefault(ctx.defaults, "hinge", ["left", "right"] as const)` at `:168` and the `["in","out"]`
twin at `:170` — a third in the Plan JSON validator (`src/plan-json.ts:658-661`), a fourth in the
Plan JSON schema (`:1205-1206`), a fifth in the GBNF generator (`scripts/gen-gbnf.ts:246-247`) and
a sixth in the spec generator's prose (`scripts/gen-llm-spec.ts:38`). **Six hand-kept copies of two
enums.** Adding two more enums to that shape produces twelve.

**Proposal — one table, in `src/grammar/tokens.ts`, imported by everything:**

```ts
/** Door enum value sets. The ONE source; parser, resolver, Plan JSON validator/schema
 *  and every gen:* generator read this and never retype a member. */
export const DOOR_ENUMS = {
  kind:  ["hinged", "sliding", "barn", "bifold", "pocket"],
  hinge: ["left", "right"],
  swing: ["in", "out"],
  slide: ["left", "right"],
} as const;
```

plus one parse helper, replacing both inline blocks:

```ts
// in ParseCtx or a small src/grammar/enum-clause.ts
eatEnum<T extends string>(allowed: readonly T[], what: string): T
```

which reads an ident, checks membership, and on a miss calls `ctx.fail()` with the allowed list
**and a `closest()` did-you-mean** — the affordance the CLI already gives for an unknown flag or
verb, applied one layer down. That is a strict improvement on today's `Expected hinge "left" or
"right" but found "…"` for exactly zero extra surface.

`src/grammar/tokens.ts` is already the file every generator imports (`scripts/gen-llm-spec.ts:21`,
`scripts/gen-gbnf.ts`), so this placement is what makes §8's generator fix possible at all.

## 3. Semantics — what each kind means, and the four things a kind never changes

**Proposal.** A door kind changes **what is drawn in the reveal** and **whether a swing arc
exists**. It changes nothing else. Specifically, these four stay kind-independent:

| Invariant | Where it lives | Why it must not learn about kinds |
| --- | --- | --- |
| The wall boolean voids the opening | `src/ir.ts:1591-1602` (`registerOpenings` pushes `{at, width}` from the resolved element, keyed only on `kind === "door" \| "window" \| "opening"`) | A doorway is a hole in the wall whatever hangs in it. Making a pocket door void less would move wall geometry on every plan that adopts the kind. |
| The **opening cover polygon** is emitted | `src/elements/door.ts:194-215` — the comment at `:194-197` is explicit that "the ASCII/DXF backends locate the doorway by the cover polygon on this pass" | Dropping it for any kind silently breaks `-f txt` and the DXF export with no diagnostic. **Every new kind emits the cover first, unconditionally.** |
| `describe()` adjacency + the access graph | `src/describe.ts:766-771` (`between: doorConnections(…)`) and `src/analyze.ts` | A pocket door connects two rooms exactly as a hinged one does. |
| The walk-through landing | `doorLandingRect` (`src/geometry/rect.ts:167-184`) → `W_DOORWAY_BLOCKED` (`src/lint/rules/doors.ts:52-74`) and `W_DOOR_CLEARANCE` (`:77-94`) | You still walk through it. Both rules read only `at`/`width`/`host`, so both keep firing for free — and **must be pinned by test**, because "the sliding door stopped tripping the swing rule" is right and "it stopped tripping the landing rule" is a regression. |

**Verified, and it removes a worry:** the circulation nav grid deliberately does **not** treat
swing arcs as occupancy (`src/analyze/occupancy.ts:9-11`: *"Door swing arcs are deliberately NOT
occupancy here — the leaf opens flat against a wall and you stand in the doorway to enter"*). So
sliding doors change no circulation fact, no `W_PATH_TOO_NARROW`, no `W_ROOM_NO_CLEAR_PATH`, no
reachability. Nothing in `src/analyze/` needs to know this feature shipped.

### 3.1 `open` — a fraction for the sliding family, and deliberately not an angle yet

The brief's instruction is to keep arch-plotter's deliberate inconsistency: `open` is a 0–1
fraction for the sliding family and an angle for hinged doors, *and not to unify them*.
**Verified in their source:** `opening(…, open: 0.5, flip: false, …)` is a float
(`Arch.typ:252`), while `double-door(…, open: 90deg, …)` is a Typst angle (`:147`).

**Proposal: ship `open <0..1>` for `sliding`/`barn`/`bifold`/`pocket` only, and defer the hinged
angle form by name to a later stage (§10).** The reason is a soundness hole, not squeamishness:

> `W_SWING_OBSTRUCTED` measures the wedge `doorSwing()` returns. If a hinged `open 45` narrowed
> that wedge, an author could **silence the lint rule by drawing the door half open**. That is the
> constraint-laundering failure mode P0-3 exists to close, arriving through the front door of a
> drawing flag.

If hinged `open` ever ships, the mandatory shape is a split: `doorSwing()` keeps returning the
**full 90° measured** quarter-disc that lint and `repair()` read, and a separate
`doorLeafAt(d, open)` returns the **drawn** leaf that only `render()` reads. Writing that split
down now is most of the value of deferring it.

**Proposal — range handling.** `open` outside `[0,1]` is a returned error
`E_DOOR_OPEN_RANGE` with a clamping fix, not a silent clamp. Silent-error design is an explicit
non-goal of the roadmap (§7, against `Arch.typ:1443-1446`), and this matches the shipped
`E_ARC_RADIUS` pattern (an impossible number → an error carrying the legal minimum).

### 3.2 Clause legality — refuse, never approximate

`hinge` on a `pocket` door is a category error; so is `slide` on a `hinged` one. **Proposal: one
code `E_DOOR_KIND_CLAUSE`** ("clause `<c>` is not available on a `<kind>` door"), with a fix that
deletes the clause or, for `hinge` → `slide`, rewrites it. This is the v1.23 precedent applied
verbatim: rectangle-only clauses refuse rather than approximate (`E_PLACE_POLY`,
`E_ROOM_POLY_SELF_INTERSECT`). One code for the whole class, not one per pairing.

| kind | `hinge` | `swing` | `slide` | `open` |
| --- | --- | --- | --- | --- |
| `hinged` (default) | yes | yes | **refuse** | **refuse** (stage 1) |
| `sliding` (bypass) | **refuse** | **refuse** | yes | yes |
| `barn` | **refuse** | yes — the mounting face | yes | yes |
| `bifold` | **refuse** | yes — the fold face | yes (which end is fixed) | yes |
| `pocket` | **refuse** | **refuse** — the cavity is inside the wall | yes | yes |

**Open for the owner (B).** `swing in\|out` is reused above for "which face of the wall the panel
hangs on / folds toward" (arch-plotter's `flip`, `Arch.typ:301`, `:323`). It is an overload of the
word, but it is semantically the *same* property — which normal side — and it is the only handed
rule in the tree that already flips correctly under a reflection (§6). The alternative is a new
`face in|out` keyword, which is clearer prose and one more word plus one more flip rule to get
right. This document proposes reuse.

## 4. Rendering — the primitive budget, and the proof that no backend changes

**Verified.** `door.render()` emits only `polygon`, `line` and `arc` (`src/elements/door.ts:211-236`),
and every backend serializes those generically from `ScenePrim` (`src/scene.ts:139-183`).
`Paint` already carries `dash?: [number, number]` (`:121`), which is what the swing arc uses at
`door.ts:234`.

**Proposal — primitives per kind, all existing:**

| kind | primitives beyond the cover `polygon` | source of the convention |
| --- | --- | --- |
| `hinged` | 1 `line` (leaf) + 1 `arc` (90° minor arc) — **byte-identical to today** | `src/elements/door.ts:218-236` |
| `sliding` | 2 `polygon` (panels, each `w/2 + 0.05w` long × `0.35t` thick, offset ±`0.05t` from the centreline so they read as two tracks; the moving one translated by `−(w/2 − overlap)·open`) + 2 thin `line` (track centrelines) | `Arch.typ:283-296` |
| `barn` | 2 dashed `line` (the wall faces at ±`t/2`, redrawn dashed because the leaf hangs *outside* the wall) + 1 `line` (track, overrunning the far jamb by one full door width) + 1 `polygon` (panel `1.1w` × `0.35t`, offset outboard by `t/2 + 0.1t`, translated `w·open`) | `Arch.typ:297-317` |
| `bifold` | 1 dashed `line` (floor track) + 2 thin `polygon` (the two panel leaves, `0.20t` thick, meeting at the fold, angle `open·90°`) + 1 small `circle` (the fold hinge) | `Arch.typ:319-356`, **with a deliberate substitution — see below** |
| `pocket` | 2 thin `line` (the cavity, one full door width from the slide-side jamb, at ±`0.25t/2`) + 1 `polygon` (panel `w − 2f` long × `0.25t`, translated `w·open` along the slide) | `Arch.typ:358-379`; cavity/slide geometry cross-checked against planscript-rust `exporters.rs:1635-1763` |

**The one place we should NOT transliterate.** arch-plotter draws a bifold as a *single 3-point
polyline with `cap: "round", join: "round"`* — "the round join *is* the hinge glyph"
(`Arch.typ:329-341`). Copying that needs a `polyline` primitive **and** widening
`Paint.linecap`/`linejoin` (today `"square"` / `"miter"` only, `src/scene.ts:122-123`) — a Scene IR
change touching all four backends, which is exactly what the brief says a new door kind must not
cost. And the trick does not survive the trip: **DXF has no stroke caps**, so the hinge glyph
would silently vanish in the CAD export while looking right in SVG. **Proposal: two thin
`polygon`s + one `circle` instead** — zero IR change, identical read at any zoom, and it exports
correctly to DXF as real geometry (`circle` already emits a native `CIRCLE`, `src/scene.ts:157-163`).

So the brief's requirement holds with a proof rather than a hope: **this feature adds no
per-backend code and no new `ScenePrim`.**

**Determinism.** `open` is an expression evaluated through `ctx.eval` and formatted through
`fmt()` like every other number; the bifold fold uses `cos`/`sin` of `open·90°`, which is the same
class of arithmetic the swing arc and v1.24's arc solve already do. No new determinism risk, but
the determinism test must cover a plan of each kind (§9).

## 5. The byte-identity law

**Proposed law, to be pinned by test in `test/doors.test.ts` (new):**

> **A plan that names no door kind, no `slide` and no `open` compiles to byte-identical SVG, DXF,
> ASCII and PDF as before this feature, and to a byte-identical `describe --json`, `lint --json`
> and Plan JSON.** Additionally, writing the default kind explicitly (`door hinged …`) is
> byte-identical to omitting it.

This holds by construction if three rules are kept, and each needs its own assertion:

1. `RDoor.kind` defaults to `"hinged"` and the hinged branch of `render()` is the *existing code
   moved, not rewritten* — the leaf `line` and `arc` emission at `door.ts:218-236` is relocated
   into a branch verbatim.
2. `doorSwing`'s early return is `if (d.kind !== undefined && d.kind !== "hinged") return null;`
   — `DoorLike` (`src/geometry.ts:98-104`) gains `kind?:` as **optional**, so all four existing
   callers and every case in `test/swing.test.ts` compile and behave unchanged.
3. **Every new field is emitted conditionally.** `describe().doors[]`, Plan JSON's `OpeningJson`
   (`src/plan-json.ts:210-223`) and `emitOpening`'s source round-trip (`:800-812`) gain
   `kind`/`slide`/`open` **only when they are not the default** — the same append-only-and-
   conditional pattern the `windowFacing` fix used for `facingPage` (`82d4221`). Emitting
   `kind: "hinged"` unconditionally would change every existing `describe --json` payload and
   every `compile --from-json` round-trip.

**Open for the owner (C).** Whether `describe().doors[]` should carry `kind` at all. It is a real
semantic fact an agent would want (`DoorSummary` is `id`/`instance`/`between`/`width` today,
`src/describe.ts:113-123`), and conditional emission keeps it free. This document proposes yes,
conditional.

## 6. Handedness — every handed rule the feature adds, and its `transformElement` flip

**Verified.** `src/frame.ts:280-297` states the law and `:311-319` implements it: under a
reflecting frame (`det(f) < 0`) a door's `swing` flips `in`↔`out` (`:317`) and `hinge` does
**not**, "because it is defined along the wall's traversal direction, which the transform carries
with it" (`:287-288`).

**Proposal — the feature adds exactly one handed rule, and its correct flip is the identity.**

| new property | defined against | flip under `det(f) < 0` | argument |
| --- | --- | --- | --- |
| `slide left\|right` | the host wall's **traversal direction**, identically to `hinge` | **none** | `transformSegment` (`frame.ts:274-278`) maps `a`,`b` through `f`, so the transformed direction is `f·dir`; a pure along-direction offset `at + dir·(±hw)` transforms as `f(at + dir·(±hw))`. Exact, no sign to correct — the same argument that already exempts `hinge`. A mirrored pocket door slides to the mirrored side automatically. |
| `open` (0–1) | nothing — a dimensionless fraction | **none** | invariant under any isometry. |
| `swing in\|out` on `barn`/`bifold` (the mounting/fold face) | the host wall's **left normal** | **flips — already implemented** at `frame.ts:317` | `normal(f·dir) = ±f·normal(dir)`, sign reversing under a reflection. This is why §3.2 proposes reusing `swing` rather than inventing `face`: the flip is written, tested and correct. |

**This must be proved, not asserted.** The AGENTS.md iron law is "add a handed rule ⇒ add its flip
to `transformElement`", and the honest reading here is that `slide`'s flip *is* the identity — a
claim that is only worth anything with a test behind it. **Required fixture:** a component
containing one door of each kind, `place`d once plain and once `mirror x`, against a hand-authored
mirrored twin; the two must be byte-equal. `test/place.test.ts` already holds the analogous pin
for mirrored door swings — the new cases belong beside it, not in a new file.

## 7. `W_POCKET_RUN`

### 7.1 What it measures

**Verified reference:** planscript-rust `pocket_door_wall_run` (`warnings.rs:91-157`) projects the
two jambs onto the host wall, picks the jamb on the slide side as `pocket_start`, and takes the
available run as the larger signed projection of the two wall endpoints onto the slide direction,
floored at 0 (`:145-156`). Required is `width × (1 + POCKET_DOOR_END_CLEARANCE_RATIO)` with the
ratio `0.05` (`warnings.rs:14`, applied `:70`) — i.e. `width × 1.05`.

**Proposal — the same measurement, plus the one thing they do not do.** Their available run counts
*wall length only*. A pocket door cannot slide through a window either. **Our rule subtracts other
openings on the same host wall that fall inside the pocket run**, which is free: the wall already
carries `openings: {at, width}[]` from `registerOpenings` (`src/ir.ts:1591-1602`), and the lint
context already has the walls. That is a genuine correctness gain over the reference and costs one
loop.

**Coordinate warning, applied.** planscript-rust is y-up; ArchLang is y-down (`+y` is *down*,
AGENTS.md → Architecture). This rule is signed-projection arithmetic along a wall direction, so it
is **orientation-agnostic** and inverts nothing — but the outside-normal machinery around it
(`left_right_points_from_outside`, `exporters.rs:1845`) *is* handed and must not be copied. We do
not need it: our slide direction is defined along traversal (§6), not against an outside normal.

### 7.2 Threshold, placement, ordering

| Decision | Proposal |
| --- | --- |
| Threshold | `pocketRunRatio: 1.05` in `LintRuleset` (`src/lint/ruleset.ts:13-62`) and `DEFAULT_RULESET` (`:63-74`), matching the reference exactly so the number is citable |
| Rule module | a new `pocketRun` in `src/lint/rules/doors.ts`, exported beside `swingObstructed`/`doorwayBlocked`/`doorClearance` |
| Rule order | **appended LAST** in `LINT_RULES` (`src/lint/rules/index.ts:26-55`) — the file's own header says "ORDER IS CONTRACT", and every rule since `pathTooNarrow` carries the same append-last comment. No existing plan's diagnostic order moves. |
| Catalog | `W_POCKET_RUN` in `src/error-catalog.ts` in the shipped 5-field `W(...)` shape (code, one-line summary, explanation, remedy, ` arch static ` example) — see `W_SWING_OBSTRUCTED` at `:654-660` for the exact form |

**Open for the owner (D).** A pure ratio is generous on narrow doors (a 700 mm pocket asks for
735 mm of run — 35 mm of end clearance, which is thin for a real jamb + pull). The alternative is
`width + max(pocketRunClearanceMm, width × 0.05)` with `pocketRunClearanceMm: 50`. This document
proposes the plain ratio for reference-comparability and flags the two-term form as the honest
architectural answer.

### 7.3 The message, and the machine fix

The reference's message shape is worth taking wholesale (it is also P1-5's model):
**measured requirement, measured shortfall, then the closed set of remedies** — *"needs 1.16 units
of clear pocket to slide right, but only 0.95 is available on wall `w2`; move the door, reverse the
slide direction, narrow it, or lengthen the wall"* (`warnings.rs:75-83`). **They can only print
those four remedies. We can carry them as structured fixes — which is the entire point of taking
this.** Not all four are legitimate:

| Remedy | Ship as | Reasoning |
| --- | --- | --- |
| **Reverse the slide** | `machine-applicable` fix, ranked first | A single-token rewrite `slide left` ↔ `slide right`. Emitted **only after computing the reverse run and confirming it satisfies** — never as a guess. |
| **Move the door** | `machine-applicable`, **attached form only** (`on <wall> at <pos>`) | Rewrites `<pos>` to the nearest position where the run fits. Position is a drawing decision, not a stated requirement. On the `at (x,y)` form, decline — that is `repair()`'s territory (ADR 0006). |
| **Narrow it** | **hint only, not a fix** | It rewrites the author's stated requirement to satisfy the checker. That is precisely the laundering pattern P0-3 documents from ifc-lite's own red-team (a sill silently rewritten 2.0 → 1.55 and scored a success). It would also cross `minDoorWidthMm` and trip `W_DOOR_CLEARANCE`. **Proposal: never emit it as an applicable fix, not even under `--unsafe`.** |
| **Lengthen the wall** | hint only | Edits a *different statement* than the one diagnosed. |

**The implementation detail that decides the cost.** `W_POCKET_RUN` is raised in a lint rule, which
sees the resolved `RDoor`, not the AST node — so it cannot re-emit the statement the way
`openingWidthFix` does (`src/fix-producers.ts:230-241`). **There is a shipped precedent for exactly
this and it should be copied:** `fixtureRotateFix` (`src/fix-producers.ts:181-197`) drives its edit
from `_rotateSpan`, an internal span the parser records and `furniture.resolve` carries onto the IR
(`src/elements/furniture.ts:253`, `src/ir.ts:252`) — and it handles the *absent-clause* case by
carrying an **empty span** and prepending a space when `span.start === span.end` (`:187`, `:194`).

**Proposal:** `RDoor` gains internal `_slideSpan?: Span` (empty when `slide` was not written),
populated the same way, never rendered, never in `describe()`. `pocketRunFix` in
`src/fix-producers.ts` then produces a pure span→text edit. And per `src/fix-apply.ts:206-216`,
**the suggestion must carry `file` when the door was written in an imported module** — `applyFixes`
skips those with a reason rather than splicing a component's offsets into the importer.

## 8. Generated artifacts: the regeneration set, and the generator fix that must ship with it

| Generator | Why it fires | What must change at the SOURCE |
| --- | --- | --- |
| `gen:grammars` | four enum + two attribute words enter `KEYWORDS` | nothing — it already derives from `src/grammar/tokens.ts`. Free. |
| `gen:spec` → **then** `gen:llms` | the door grammar line is prose in `ELEMENT_GRAMMAR` | `scripts/gen-llm-spec.ts:38` — see the risk note below |
| `gen:gbnf` | `door-clause` / `hinge-val` / `swing-val` productions | `scripts/gen-gbnf.ts:245-247` — **the blocking fix**, below |
| `gen:plan-schema` | `hinge`/`swing` enums live in `PLAN_JSON_SCHEMA` | `src/plan-json.ts:1205-1206`, plus the validator at `:658-661`, the type at `:219-220`, the projection at `:417-418` and the source round-trip at `:808-809` |
| `gen:errors` → **then** `gen:spec`/`gen:llms` | three new codes (`W_POCKET_RUN`, `E_DOOR_OPEN_RANGE`, `E_DOOR_KIND_CLAUSE`) | `src/error-catalog.ts` |
| `gen:cli` | — | **not fired.** No new flag, no new command. |
| `gen:intent-schema` | — | **not fired.** The intent channel learns nothing about door kinds. |

In practice: `npm run gen:all` (which already sequences `gen:spec` before `gen:llms`) plus
`npm run check:drift`.

### 8.1 The blocking generator fix

> **Verified.** `scripts/gen-gbnf.ts` **hardcodes the door clause literals**:
> ```
> 245:  ["door-clause", `"wall" rws ref | "hinge" rws hinge-val | "swing" rws swing-val`],
> 246:  ["hinge-val",   `"near" rws ( "start" | "end" ) | "left" | "right"`],
> 247:  ["swing-val",   `"into" rws ref | "in" | "out"`],
> ```
> These are string literals retyped into the generator, not derived from `KEYWORDS`. Add
> `sliding`/`barn`/`bifold`/`pocket`/`slide`/`open` without touching them and **`npm run
> check:drift` stays green while `grammars/archlang.gbnf` ships a grammar that cannot decode the
> new language.** That is the exact failure CLAUDE.md documents — "a generator's TEMPLATE can go
> stale even when `check:drift` is green" — and the exact failure that already shipped once: MCP
> 0.2.2 served a v1.19 GBNF that could not decode `paper`/`level`/`place`/`zone`/`polygon`/`arc`.

**Requirement, not a suggestion:** `gen-gbnf.ts` must render `door-clause`, `hinge-val`,
`swing-val`, `door-kind` and `slide-val` **from `DOOR_ENUMS`** (§2.1), and must carry a guard that
**throws when a `DOOR_ENUMS` key has no rendering** — the same guard shape `gen-llm-spec.ts`
already has for `KEYWORDS.element` (`scripts/gen-llm-spec.ts:106-110`, extended to
`KEYWORDS.control`). Without the guard the fix is a one-time correction; with it, the class of bug
is closed.

**Same class, one layer softer:** `scripts/gen-llm-spec.ts:38` retypes the whole door grammar as a
prose string. Its existing guard checks that every `KEYWORDS.element` key *has an entry* — it
cannot check that the entry is *correct*, which is how a v1.12 CLI reference survived three
releases. Deriving the enum lists inside that string from `DOOR_ENUMS` (string-interpolating
`DOOR_ENUMS.kind.join("|")` rather than typing `hinged|sliding|barn|bifold|pocket`) closes the
half of it that is mechanically closable. **Proposal: do that in the same commit.**

**And downstream:** every core release turns `packages/mcp` red on purpose
(`packages/mcp/test/lockstep.test.ts` + `check-dist-resources.mjs`). A release carrying this item
must re-pin, rebuild the baked resources and bump the shim in `packages/mcp/package.json` **and
both** `server.json` version fields — the 0.2.2 lesson, written into the iron laws.

## 9. Golden / snapshot impact — named artifacts

**Expected churn from the feature itself: zero.** §5's byte-identity law says so, and these are the
artifacts that would prove it wrong:

| Artifact | Expected |
| --- | --- |
| `test/__snapshots__/snapshot.test.ts.snap` (+ `scene`, `annotate`, `accessible-svg`, `error-svg`) | **untouched** |
| `test/__goldens__/*.png` — all 12: `studio`, `two-bed`, `parametric`, `relational`, `themed`, `museum`, `museum-wing`, `museum-wings`, `gallery-l`, `aquarium`, `two-storey.L1`, `two-storey.L2` | **untouched** (`UPDATE_GOLDENS=1` must not be needed) |
| `test/__ascii__/studio.arch.txt`, `two-bed.arch.txt` | **untouched** (`ASCII_UPDATE=1` must not be needed) |
| `test/export-dxf.test.ts` | **untouched** |
| `eval/` goldens, `eval/judge-fixture.json`, `eval/live-baseline.json` | **untouched, and not to be regenerated for this item under any circumstance** — no `JUDGE_VERSION` movement is involved |

**If any of those move, the implementation is wrong.** Blessing one to green the suite is the
prohibited move.

**Deliberate new artifacts:**

- `test/doors.test.ts` (new) — the byte-identity law, `hinged` explicit ≡ omitted, `doorSwing`
  returns `null` per kind, the four kind-independent invariants of §3, `W_DOORWAY_BLOCKED` and
  `W_DOOR_CLEARANCE` still firing on a sliding door, `W_SWING_OBSTRUCTED` *not*, both
  `E_DOOR_KIND_CLAUSE` directions, `E_DOOR_OPEN_RANGE` ± its fix, and determinism per kind with
  the clipper2 backend registered **and** cleared.
- new cases in `test/place.test.ts` — the mirrored-instance handedness pin of §6.
- new cases in `test/lint.test.ts` (or `doors.test.ts`) — `W_POCKET_RUN` ±, the window-in-the-run
  case, the reverse-slide fix applying, and the narrow-it remedy appearing as a hint and **never**
  as an applicable fix.
- **Open (E):** whether a flagship example adopts a kind. Every prior tranche shipped one
  (`gallery-l`, `aquarium`). A new `examples/*.arch` is additive and adds one golden PNG; adding a
  pocket door to `examples/studio.arch` is **not** an option — it is import-free and lint-clean by
  contract (`test/world.test.ts`) and it owns a snapshot, a golden and an ASCII golden.

## 10. Staged plan

**Stage 1 — the language and the drawing (one release).** `DOOR_ENUMS` + `eatEnum` restructure;
the five kinds; `slide`; `open` for the sliding family; the render branches; `doorSwing`'s early
return; `E_DOOR_KIND_CLAUSE` + `E_DOOR_OPEN_RANGE`; **the `gen-gbnf.ts` derivation fix and its
guard**; the byte-identity and handedness pins. Ships without any new lint rule.

**Stage 2 — `W_POCKET_RUN` (same release if §7's fix producer lands clean, next if not).** The
rule, the ruleset threshold, the catalog entry, the reverse-slide and move-the-door fixes, and
`RDoor._slideSpan`. Held separable because it is the only part that touches `fix-producers.ts` and
`fix-apply.ts`'s `file` contract, and because it is the only part whose threshold is a judgement
call (open question D).

**Stage 3 and beyond — deferred by name, not silently:**

- **Hinged `open <angle>`** — needs the measured-vs-drawn split of §3.1 written and tested first.
- **`W_BARN_RUN`** — a barn door needs clear *wall face* to park on, obstructed by furniture and
  other openings, not by wall length. A different measurement from `W_POCKET_RUN`; planscript-rust
  does not have it either.
- **Double / bi-parting leaves** (`double bifold`, a two-panel pocket) — arch-plotter has them
  (`Arch.typ:344-355`) and planscript-rust has `double door` (`parser.rs:1218-1222`); ArchLang has
  no double-leaf door at all today, so it is a separate item, not a rider on this one.
- **The pocket-door slide arrow** (planscript-rust `exporters.rs:1735-1763`) — the cavity lines
  plus the panel position already read; an arrow is annotation, and annotation on a curved host is
  a separate problem.
- **Kinds on a curved (`arc`) host** — the cover, the tangent and `segmentDirAt` all already work
  (`src/elements/door.ts:188-201`), so this is *probably* free, but the sliding panels are drawn as
  straight rectangles and would visually leave a curved wall. **Stage 1 must decide explicitly:
  either the panels follow the arc, or a non-hinged kind on an arc-bearing host is refused with a
  catalogued code.** Do not let it fall out silently.
- **P2-2 (room-relative door hand)** is a *separate roadmap item with its own staging* and must not
  be smuggled in here. This item keeps `hinge`/`slide` on the wall's traversal direction exactly as
  today.

## 11. Corrections to the P2-1 brief

Three things in the brief are imprecise. None changes the design; all three would have cost time.

| Brief says | Actually |
| --- | --- |
| planscript-rust: "four spellings collapse to one node (`parser.rs:1221-1229`)" | **Verified at `parser.rs:1216-1235`:** the four spellings are `double door` / `double_door` / `pocket door` / `pocket_door` — two *concepts* × two spellings, collapsing into `parse_door_opening(default_double, default_pocket)`. It is not four door kinds. **planscript-rust has no `sliding`, `barn` or `bifold` at all** (`grep` over `src/*.rs` returns only `DoorSlideDirection`). All four kinds come from arch-plotter; planscript-rust contributes only pocket + the soundness rule. |
| sliding panels "separated by `0.05t`" | `gap = thickness * 0.05` is each panel's offset from the **centreline** (`Arch.typ:288`, panels at `+gap…` and `−gap…`), so the clear separation between the two panels is `0.1t`. |
| bifold "fold angle `open·90°`" | Correct in code (`Arch.typ:325`), but their own comment two lines above says *"Max angle is 80deg"* — a stale comment in their source. Take the code, not the comment. |

Two further notes: arch-plotter's jamb inset is a hardcoded `f = 0.05` **feet** (`Arch.typ:265`) —
they are feet-native and irrational in metric from the first token (roadmap §8), so every one of
their absolute offsets must be re-derived as a fraction of `t` or a mm constant in `src/theme.ts`,
never transcribed. And planscript-rust's pixel offsets are divided by a render scale
(`exporters.rs:1666-1669`, `3.0 / t.scale`) — screen-space constants, the same anti-pattern as
their `patternUnits="userSpaceOnUse"` hatches. Ours must be wall-thickness-relative so they scale
with `paper`/`scale`.

## 12. What would sink this

Each of these should **stop the item**, not be worked around.

1. **The GBNF fix is skipped or done by retyping.** If `gen-gbnf.ts:245-247` gets four new string
   literals instead of a derivation from `DOOR_ENUMS`, this item ships a constrained-decoding
   grammar that cannot emit the language it documents, with every gate green. This is not a
   quality concern, it is the item's single highest-probability failure, and it has a shipped
   precedent (MCP 0.2.2). **No derivation + no guard ⇒ do not merge.**
2. **Any golden or snapshot in §9 moves.** The byte-identity law is the entire safety argument. A
   moved golden means the hinged path was rewritten rather than relocated, or a field is being
   emitted unconditionally. Blessing it is the prohibited move.
3. **`bifold` starts pulling on the Scene IR.** If the polygon-and-circle rendering is rejected in
   favour of a round-capped polyline, this stops being a door feature and becomes a `ScenePrim` +
   `Paint` + four-backend change with a DXF hole in it. In that case: **ship the other three kinds
   and defer `bifold` by name.** Three kinds is still the feature.
4. **`open` acquires a measured meaning.** The moment a drawn `open` value can change what
   `W_SWING_OBSTRUCTED`, `describe()` or the intent channel reports, the language has grown a
   channel for satisfying a checker by redrawing rather than by fixing — the P0-3 laundering
   pattern. `open` is a drawing fact, permanently.
5. **`W_POCKET_RUN` false-positives on sound plans.** The ×1.05 ratio is one competitor's constant
   with no standard behind it. If a fixture sweep over the flagship examples plus adversarial
   cases shows it firing on plans a drafter would accept, the rule is wrong and stage 2 stops until
   the threshold is re-derived — the same discipline that set `maxDetourRatio: 3.0` deliberately
   generous (`src/lint/ruleset.ts:54-59`).
6. **`slide` turns out to need a flip after all.** §6 argues the flip is the identity. If the
   mirrored-component fixture disagrees, the reasoning behind `hinge`'s exemption
   (`src/frame.ts:287-288`) is also wrong and a *shipped* rule is broken — a much larger finding
   than this item. Stop and report it rather than adding a compensating flip.
7. **`E_DOOR_KIND_CLAUSE` gets softened to a warning.** "A pocket door with a `hinge left` clause
   draws as if the clause were absent" is silent-error design, an explicit roadmap non-goal (§7).
   Refuse or don't ship the clause table.

## 13. Honest read: is this worth building?

**Yes, and it is the strongest item in P2 — but for the diagnostic reason, not the drawing one.**

Three arguments for:

- **It closes a hole the tree already admits.** `W_SWING_OBSTRUCTED`'s remedy has told authors to
  "use a sliding door" since it shipped (`src/lint/rules/doors.ts:40`,
  `src/error-catalog.ts:658`), for a door the language cannot write. Every other remedy in the
  catalog names something expressible.
- **The cost is genuinely small and the blast radius is genuinely bounded.** One enum table, one
  early return, four render branches, zero backends, zero `analyze/`, zero circulation, zero
  intent. The verification above found no hidden coupling — the swing arc was the coupling, and it
  is one function with four `null`-safe callers.
- **`W_POCKET_RUN` is the only item in the whole P2 table that ships a new *soundness* fact**, and
  it is the P1-5 message shape (measured deficit → enumerated remedies) with the remedies carried
  as structured fixes instead of printed prose. That is the differentiator the audit keeps finding
  — the competitor can only print them.

Two arguments against, stated plainly:

- **Nothing measures it.** No brief in the 26-brief eval corpus asks for a pocket door; this item
  will not move a single eval number, and no evidence in the audit says door variety is a barrier
  to anyone. It is a professional-completeness feature, and the honest framing is "a drafter
  opening our output notices the door types are missing", not "authors are blocked".
- **The parse-side restructure is the actual deliverable.** Six hand-kept copies of two enums, one
  hardcoded generator production, one prose generator retyping the same grammar. The four words
  are the occasion; §2.1 and §8.1 are the value, and they would be worth doing at roughly half the
  cost even if the kinds were dropped. **If the owner wants a smaller bite: land §2.1 + §8.1 alone
  as a P1-class refactor, then decide on the kinds separately.** That is a legitimate outcome of
  this design pass and this document recommends it as the fallback.

## 13b. Owner decisions (2026-08-07) — **all five resolved; the doc is unblocked**

`DOOR_ENUMS` (§2.1) already shipped alone as `c39a25e`, so the parse-side restructure and both
generator guards are in place. What follows decides the four kinds themselves.

### A — **leading kind word**, as proposed

`door pocket on w1 at 40% width 900 slide left`. A door kind changes what the element *is*, not a
property of it, which is exactly the `room polygon` / `room circle` / `dim faces` case the proposal
cites. `kind pocket` would be more uniform with `hinge`/`swing` — but those are attributes of a thing,
and this is the thing. One token cheaper, and unambiguous by construction after `parseIdOpt()`.

### B — **reuse `swing in|out`**, as proposed, with a documentation obligation

Adding `face in|out` means a second **handed** rule, and handedness under `place … mirror` is where
this codebase's subtlest bugs live — it is why `frame.ts` carries an iron law at all. `swing` is the
one handed rule already proven correct under reflection (§6). Reuse buys that proof; a new keyword
re-opens it for no semantic gain, since "which normal side" is genuinely the same property.

The cost is real and must be paid in prose, not waved off: a barn door does not swing, so
`door barn … swing out` reads wrong to anyone who has not been told. **Obligation:** the catalog entry,
`spec.llm.md`'s door line and `docs/language-reference.md` must each state the meaning **per kind** —
"for `barn`/`bifold`, `swing` selects the face the panel hangs on." §3.2 already refuses `swing` on
`sliding` and `pocket`, so the overload is confined to the two kinds where a panel genuinely hangs on
one face of the wall.

### C — **yes, `describe().doors[]` carries `kind`**, conditionally

A door's kind is a semantic fact, not a drawing one: it determines whether a swing arc exists at all,
which clearance rules apply, and what an agent should reason about. Withholding it means an agent that
just authored a pocket door cannot verify it did. Emitted **only when not `hinged`**, so every existing
payload is byte-identical.

### D — **two-term threshold. This OVERRULES the proposal.**

Ship `width + max(pocketRunClearanceMm, width × 0.05)` with `pocketRunClearanceMm: 50`, not the plain
`1.05` ratio.

The doc proposes the ratio for "reference-comparability" and then calls the two-term form "the honest
architectural answer" in the same breath. We are not publishing a comparison against planscript-rust,
so comparability buys nothing — while the ratio is *wrong on narrow doors*: a 700 mm pocket asks for
35 mm of end clearance, which does not fit a real jamb and pull. This project already chose
`A-ANNO-DIMS` over the reference's coarser `A-DIMS` on exactly this reasoning: **architectural
correctness outranks matching someone else's constant.**

Record the divergence and its reason in the catalog entry and the commit body, so a future reader
finds a deliberate choice rather than an unexplained drift from the cited source.

### E — **no new flagship example**

`gallery-l` and `aquarium` earned flagships because polygon rooms and arcs changed what a building
*could be*. A door kind is a detail at the scale of an opening, not a building-scale capability.

The demonstration is free without one: the docs site rewrites every plain ```` ```arch ```` fence into
a live `<ArchLive>` widget, and `test/docs-fences.test.ts` already requires each to compile — so the
worked examples in `docs/language-reference.md` are executable documentation, gated. That is a better
teaching surface for a per-opening feature than a twelfth golden PNG, and it adds no artifact to
maintain. If a visual is wanted later, add a **new small** example rather than churning a flagship —
`examples/studio.arch` remains ineligible either way (import-free and lint-clean by contract,
`test/world.test.ts`, and it owns a snapshot, a PNG golden and an ASCII golden).

## Files & sources

**This tree** (verified at the current commit): `src/elements/door.ts:67-239` ·
`src/geometry.ts:98-136` (`DoorLike`, `doorSwing`) · `src/geometry/rect.ts:167-184`
(`doorLandingRect`) · `src/lint/rules/doors.ts:14-94` · `src/lint/rules/index.ts:26-55` ·
`src/lint/ruleset.ts:13-74` · `src/frame.ts:274-297`, `:311-319` · `src/ir.ts:205-215` (`RDoor`),
`:252` (`_rotateSpan`), `:1591-1602` (`registerOpenings`) · `src/ast.ts:42-47`, `:189-208`
(`DoorNode`) · `src/scene.ts:114-183` (`Paint`, `ScenePrim`) · `src/describe.ts:113-123`, `:766-771` ·
`src/plan-json.ts:210-223`, `:417-418`, `:658-661`, `:800-812`, `:1205-1206` ·
`src/fix-producers.ts:181-197` (`fixtureRotateFix`, the empty-span precedent), `:212-241` ·
`src/fix-apply.ts:206-216` (the `file` guard) · `src/repair.ts:907` ·
`src/analyze/occupancy.ts:9-11` · `src/error-catalog.ts:654-660` ·
`src/grammar/tokens.ts:12-16`, `:19-120` · `scripts/gen-gbnf.ts:244-247` ·
`scripts/gen-llm-spec.ts:35-38`, `:106-110` · `src/elements/furniture.ts:253` ·
`test/visual.test.ts:32`, `test/ascii.test.ts:22`, `test/__goldens__/` (12 files),
`test/__ascii__/` (2 files), `test/__snapshots__/` (5 files).

**arch-plotter** (MIT, `D:\github_repository\arch-plotter`, read at head):
`src/Arch.typ:147` (hinged `open` is an angle) · `:252` (`opening(…, open: 0.5, flip: false, …)`) ·
`:265` (`f = 0.05` feet) · `:283-296` sliding · `:297-317` surface-sliding/barn · `:319-356`
bifold · `:358-379` pocket.

**planscript-rust** (MIT, `D:\github_repository\planscript-rust`, read at head):
`planscript-rust/src/parser.rs:1216-1235` (the spelling collapse), `:1288` (`slide` parse) ·
`src/warnings.rs:14` (ratio 0.05), `:68-89` (the message), `:91-157` (`pocket_door_wall_run`) ·
`src/exporters.rs:1635-1763` (`render_pocket_door`), `:1845` (`left_right_points_from_outside`) ·
`src/ast.rs:584`, `:625-630` (`DoorSlideDirection`).

**Not read for this item:** CeTZ (`D:\github_repository\cetz`) — LGPL-3.0-or-later, ideas only,
and it contributes nothing to a door vocabulary.

**Prior verdicts in this directory:**
[`2026-08-06-competitor-borrowing-roadmap.md`](./2026-08-06-competitor-borrowing-roadmap.md) ·
[`2026-07-g2-verdict.md`](./2026-07-g2-verdict.md) ·
[`2026-07-roadmap-proposal.md`](./2026-07-roadmap-proposal.md).
Relevant ADRs: [0005](../adr/0005-no-invisible-architect.md) (facts + lint, no invisible architect),
[0011](../adr/0011-machine-applicable-fixes.md) (fix applicability),
[0016](../adr/0016-component-instances-and-frames.md) (frames and handed rules).
