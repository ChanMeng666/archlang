> Research record, 2026-10-26, against `main@98b3d7ab` (built CLI, `dist/`). Design only: no code,
> no spec, no example changes. Read observations as evidence and diagnoses as hypotheses: re-measure
> before you build on a number. Programme entry: `../README.md` (§3 D1, D5, D11, D13, D20, D21; §4;
> §6 PS4; §7 row 6; §8 Q5). ADR text: `docs/adr/0033-keep-invariants.md` (Proposed, this PR).

# PS4.3 `keep` invariants: design for §7 row 6

Row 6's acceptance, the part this card owns: "`keep` invariants and brief-bound sizes are checked by
`validate`, the widening drill reports a broken `keep` with its signed residual". This file fixes the
grammar, what each form measures, where each grade lands, the budget and purity argument, the
`--facts depends` and `arch impact` additions, the byte-identity law, the teaching text and its
cost, and works the drill through by hand. It ends with the cards and the questions the coordinator
should rule on before the implementation PR.

## 0. Measured today (what shapes the design)

1. **No source form says "this must stay".** README §2.3 found it on 2026-10-18 and nothing has
   changed it: §4's hold-fixed ladder is "enforced by hosting …, by `keep` declarations, and by
   `impact`'s ordering", and only the first and third exist.
2. **The widening drill, run today.** `archlang impact docs/plans/plan-soundness/repro/widen-before.arch
   --set AW=4500` reports `a` resized, `b` moved 500 mm right, `door_2` re-hosted to nothing, `Held (0)`,
   and three broken lint codes on `b` (`W_BOUNDARY_NO_WALL`, `W_ROOM_DISCONNECTED`,
   `W_ROOM_OUTSIDE_SHELL`). Every one is a symptom. The cause, the partition `p` left at x 4000 while
   the room edge it stood on moved to 4500, is named by nothing: `p` is written at fixed coordinates
   and depends on nothing, so `held` cannot see it (PS4.5) and lint sees only what it left behind.
3. **Stacking defects recur and nothing checks them.** Three first-contact runs each produced one:
   T7 (2026-10-18, an upper partition over the middle of the hall), RT3 (2026-10-25, `N`, missed: `grid
   100` snapped `size 2750x7000` to 2800, so the first floor is 100 mm wider than the ground floor and
   its east wall stands on nothing), WT8 (2026-10-26 arm C, no first-floor partition on a ground-floor
   wall). README §8 Q8 lists "vertical stacking of partitions" as uncarded.
4. **Optional declarations are not used cold.** `facing` had 0 uses in 12 cold-authored plans
   (D20) and `score --taste` 0 calls (D15, D20). So a `keep` is not expected to catch first-contact
   defects unless the brief, the reviewer or the authoring role writes it. Its yield is in the change
   loop (`impact`, `validate` after an edit) and in briefs that bind a number. The design does not
   claim a first-contact gain; the re-measure after row 6 counts uses (§8).
5. **The PS4.2 seam already expects a compile-channel code.** `src/impact.ts`'s header: "When it
   lands, `W_KEEP_VIOLATED` is raised by `compile()` …, so it arrives in `sideDiagnostics`' `compile`
   channel". `ImpactDiagnostic.channel` documents `compile` as "where `keep` lands, PS4.3".
6. **`validate` already gathers both channels.** `cmdValidate` resolves once (`resolvePlan`, compile's
   diagnostics), lints once, and feeds `nextDiagnostic` with compile diagnostics, default lint and,
   when asked, the intent check, a profile run and taste. `--strict` fails on any warning of either
   channel (`report`, `src/cli/commands-analyze.ts`). `finish`/`furnish`'s never-worse law counts
   compile codes and default-lint codes, drafting codes aside (`gainedCodes`, `src/furnish.ts`).
7. **The spec has 271 UTF-16 units of headroom** (29,729 of 30,000, `test/llm-spec-drift.test.ts`,
   after PR #263).
8. **`keep` is free as an identifier.** None of the 368 `.arch` files in the repository uses `keep`
   outside a comment; no source uses `keeps`, `E_KEEP_*` or `W_KEEP_*`. ADR 0033 is unclaimed (0030 and
   0031 are reserved by the archlang-3d drafts, 0032 is taste); re-check `docs/adr/` and open PRs
   before the implementation PR lands.
9. **Sizes.** The largest example, `hillside-villa`, has 20 rooms; holding every edge of every room
   would take 80 keeps.

## 1. Scope, non-goals and the ADR

**In scope (PS4.3):** the `keep` statement, seven forms, three grades; its evaluation inside
`compile()`; one compile-channel warning for a broken `hard` keep; `describe().keeps[]`; a `keeps`
key and `next` slots in `validate --json`; `depends.keeps[]` under `--facts depends`; a `keeps`
section in `arch impact`; the printer and `arch fmt`; the error catalogue; the byte-identity law;
the spec line, its cuts and one SKILL sentence.

**Non-goals:** solving or moving anything (ADR 0004, 0006; `arch solve` is PS6.1); a keep inside a
`component` (PS4.8); keeps across files or plans; level-qualified datums (`align` across storeys,
PS4.9); keeps in Plan JSON and over MCP (PS4.10); a lint rule or taste criterion reading keeps; a
machine fix; brief-bound sizes in `intent.json` (PS4.4, §10).

**ADR: a new ADR 0033, not an addendum to ADR 0028.** The card says "needs an ADR addendum"; it was
written on 2026-10-18, before ADR 0029 and 0032 existed. Reasons for a new number:
- ADR 0028 decides how geometry is *derived* (resolve order, datums, derived walls). A `keep` derives
  nothing. What it decides is a *layer*: where a declared invariant is checked and reported, which
  touches `validate`'s exit, `next`'s tiers (D13), the taste cap (ADR 0032, D11), the never-worse law
  (ADR 0024 §6, ADR 0025 §7) and the solver seam (ADR 0006). An addendum would make 0028 carry a
  checking channel outside its scope ("Rooms may be primary").
- What `keep` borrows from 0028 is the datum vocabulary (§2), and it reads it as written there; no
  0028 rule changes. 0033 cites 0028 §2 instead of amending it.
- PS6.1 is "ADR addendum to 0006, then `arch solve`": the solver addendum stays with 0006, and 0033
  gives it the declarations to read.
- *Reverse if:* the reviewer of this PR finds 0033 adds no decision beyond 0028's vocabulary; then
  its Decision moves under 0028 as a dated amendment and 0033 is withdrawn before it is accepted.

## 2. The grammar

    keep <form> [hard|soft|advisory]

    <form> := align <d> <d> [<d> …]
            | equal width|depth <t> <t> [<t> …]
            | offset <x> from <d> <mm>
            | min clear <room> <mm>
            | on axis <label> <wall>
            | stacked <id> on levels <n> <n> [<n> …]
            | fixed <d> at <mm>

**Datums `<d>`** (ADR 0028 §2's vocabulary, read on the resolved plan):
- `<room>.top|bottom|left|right|cx|cy` of a rectangular room; `north|south|east|west` at a
  `north up` root only (`E_DATUM_COMPASS`, as today); a placed instance's room in world words by its
  dotted path (`west.main.left`, ADR 0028 §2).
- `axis <label>` (a numbered `x` axis is a vertical line, a lettered `y` axis a horizontal one).
- `<wall>`: a wall with exactly one straight segment, read as its centreline line; or
  `<wall> segment <n>`, one straight segment of a longer wall, numbered 0-based as `segment <n>`
  numbers them for furniture.
- A datum is a **vertical** line (`left`, `right`, `cx`, an `x` axis, a vertical segment; its value
  is an `x`) or a **horizontal** one (`top`, `bottom`, `cy`, a `y` axis, a horizontal segment; its
  value is a `y`, `+y` down).

**Every target is an authored id** (or a datum of one, or an axis label). An auto id is refused:
`furniture_3` renumbers when an earlier piece is named (ADR 0029 §6 makes the same point for
`facing`), and a keep is the statement that must survive edits.

**Grade:** a trailing word, default `hard`. `keep`, the only reserved word added, becomes a
`KEYWORDS.control` entry; `align`, `equal`, `offset`, `min`, `clear`, `on`, `axis`, `stacked`, `on
levels`, `fixed`, `at`, `width`, `depth` and the three grades are read **in position after `keep`
only**, so no plan that uses `soft`, `fixed` or `stacked` as an id or a `let` changes meaning.
*Parsing rules (R14):* a trailing grade word is always the grade, never a target; a value (`<mm>`,
a level) is the longest complete expression; `keep` joins `STATEMENT_STARTS`; `min` stays the
built-in function everywhere else, and no new `KEYWORDS` category is added for the form words.

**How a datum is read (R5, R6, R20).** A keep reads a datum exactly as an expression in the plan
would read it: the room edge or centre as ADR 0028 §2 resolves it, grid-snapped. Each datum value is
then put on the 0.001 mm lattice with sign-symmetric rounding, `sign(v)·round(|v|·1000)/1000`, and
compared in lattice integers; a centre (`cx`, `cy`) is compared at twice its value, so a
half-lattice centre is never rounded. A keep's own `<mm>` is put on the lattice the same way and is
**never grid-snapped**: it is the author's number, not a coordinate.

### 2.1 One line per form

All residuals are exact on the 0.001 mm lattice (ADR 0022: lattice integers, compared without
tolerance) and printed in mm by a digit helper beside `fmtPermyriad` in `src/num-format.ts`, so no
float sits upstream of a pinned byte. `v(d)` is a datum's value. "Reported" is the one residual a
diagnostic, `validate` and `impact` quote; `describe()` lists every residual.

| Form | What it measures | Residual, sign, unit | Holds when | May name |
|---|---|---|---|---|
| `keep align <d1> <d2> …` | the line position of each datum (resolved room rectangle, axis, wall centreline) | per `di`, i ≥ 2: `v(di) − v(d1)`; `+` = right of / below `d1`; mm. Reported: the largest in magnitude, first in list order on a tie, `at` that target | every residual is 0 | 2–64 datums of one orientation |
| `keep equal width\|depth <t1> <t2> …` | `width` = x extent of a rectangular room or the resolved width of an opening; `depth` = y extent of a rectangular room | per `ti`: `m(ti) − m(t1)`; `+` = wider / deeper; mm. Reported as `align` | every residual is 0 | 2–64 rooms (either word) or openings (`width` only) |
| `keep offset <x> from <d> <mm>` | `v(x) − v(d)` on `d`'s normal axis; `x` is a datum parallel to `d`, an opening read at its resolved centre, or a piece of furniture read at its resolved footprint rectangle's own centre, on that axis | `(v(x) − v(d)) − mm`; `+` = `x` lies further right / lower than stated; mm | residual is 0 | `d` a datum; `x` a datum, opening or furniture |
| `keep min clear <room> <mm>` | the room's clear span: along each axis, the widest free interval of the room's extent between the bodies (centreline ± t/2, read on the joined wall outline) of the straight wall segments parallel to that axis that meet the room's rectangle with positive area and whose body spans its whole other extent; the smaller of the two spans; every wall body counts whatever its `height` (R18) | `clear − mm`; `+` = margin, `−` = short; mm | residual ≥ 0 | one rectangular room |
| `keep on axis <label> <wall>` | the wall's centreline line against the axis line (the structural-axis rung's own word for `keep align axis <label> <wall>`) | `v(wall) − v(axis)`; `+` = right of / below the axis; mm | residual is 0 | a declared axis and a straight wall (or `segment <n>`) parallel to it |
| `keep stacked <id> on levels <l1> <l2> …` | the footprint edges `left, top, right, bottom` of the element with that id on each listed storey, the footprint being its resolved `at` + `size` rectangle | per `li`, i ≥ 2, per edge: `e(id@li) − e(id@l1)`; mm. Reported: the largest in magnitude, first in level order then edge order; `at` `{ level, edge }` | every residual is 0 | a rectangular room, `stair`, `elevator`, `escalator` or `void` present on every listed level |
| `keep fixed <d> at <mm>` | `v(d)` | `v(d) − mm`; `+` = right of / below the stated value; mm | residual is 0 | one datum |

Notes on the measures:
- **`min clear` reads the shape, never a bbox:** the room's rectangle and the wall bodies, one scan
  over the storey's straight segments (as `bodiesOn` scans for `against <room>.<edge>`). Its stated
  limits: an arc segment, an oblique segment and a segment that meets the room but does not span its
  whole other extent (a nib) are not read; their count is reported as `skipped_walls` on the row, so
  the limit is visible, never silent. A room cut by a full-span wall is honestly measured as its
  widest piece. Lint keeps judging what the measure leaves out (`W_PATH_TOO_NARROW`,
  `W_BOUNDARY_NO_WALL`). Whether a wall spans is decided by its body on the joined outline, so a
  partition that T-joins a wall at each end spans the room between them. A wall's `height` is never
  read: heights measure nothing (iron law), so a low wall cuts the span like a full one (R18).
- **`keep fixed` takes its value.** The card wrote `keep fixed …` with no number. A fixed with no
  value can be checked only between two versions (impact) or by a solver, never by one `compile()`,
  which the card's own headline ("checked … by `compile()`") forbids. With `at <mm>` it is checked in
  every compile, `impact` reports it like the others, and PS6.1 reads the same declaration as an
  anchor. *Reverse if:* authors write `keep fixed` mostly to restate the literal that already places
  the target (then the bare form, checked by `impact` only, is the better word, and the grammar gains
  it as a second form).
- **`on axis` is kept although `align axis <label> <wall>` measures the same thing:** the card names
  it, it is the ladder's "structural axes" rung, and it costs 23 units in the spec line. Both spell
  the same check, and the redundancy fact treats them as one (§5).

### 2.2 Refusals

Every refusal is a `Diagnostic` with a span on the offending clause and a catalogue entry with an
executed example; nothing throws. **`E_KEEP_*` are compile errors, as every refused statement's code
is (R8):** a plan with a refused keep has `ok: false`, and lint, `describe()` and `finish` stop at it
exactly as they stop at any compile error. The strong law of §7 (K2) is therefore stated for
accepted keeps only.

**Messages are id-free (R17).** Every `E_KEEP_*` and `W_KEEP_VIOLATED` message names rooms and
walls through the shared phrase builder of PR #269 (`src/naming.ts`): a room by its label (or its
use, place or size), a wall by the rooms it joins or the room it stands in, so two partitions are
never both "the partition". The ids and datums as written go in `hints[0]`.

| Code | When | Message (shape; names from `src/naming.ts`, ids only in `hints[0]`) |
|---|---|---|
| `E_KEEP_TARGET` | a name not in the storey (or plan, for `stacked`); an auto id; an element that could not be placed; an undeclared axis label; a level the plan lacks; a `stacked` id missing on a listed level | `This keep names something that is not an authored id on this storey` / `… names a room that could not be placed` / `… names something level <n> does not have` |
| `E_KEEP_MEASURE` | the measure is undefined for the target: a datum, `equal`, `min clear` or `stacked` on a polygon or circle room; datums of two orientations in one `align`/`offset`/`on axis`; a wall that is not one straight segment (an arc, several segments without `segment <n>`, an oblique segment); `depth` of an opening; an `offset` whose `from` is not a datum; a `stacked` kind with no rectangular footprint | `<what> has no <measure>: <reason>` (e.g. `a polygon room has no left edge to align`) |
| `E_KEEP_SELF` | one target named twice in one keep: `align a.left a.left`, `offset a.left from a.left 0`, `equal width a a`, a level listed twice | `This keep compares the left edge of "Living" with itself` (the target by its phrase) |
| `E_KEEP_PLACEMENT` | a keep inside a `component` (and so inside a file imported as one); `stacked` inside a `level` or on a single-storey plan; any other form at the root of a multi-storey plan | `A keep inside a component would be checked once per instance in its own frame; write it in the plan` / `stacked compares storeys, so it sits outside every level` / `… sits inside the level it measures` |
| `E_KEEP_VALUE` | `<mm>` not a finite length within `MODEL_RANGE_MM`; `min clear` ≤ 0; a level that is not an integer | `<mm> must be a length in mm within ±33,554,432` |
| `E_KEEP_LIMIT` | more than `MAX_KEEPS` = 1,000 keeps in a plan, or more than `MAX_KEEP_TARGETS` = 64 targets or levels in one keep; raised once, at the first keep past the cap, and every later keep is dropped while still charged (R13) | `A plan may declare at most 1000 keeps` |
| `W_KEEP_VIOLATED` | a `hard` keep does not hold (§3) | per form, e.g. `This keep holds the right edge of "Living", the left edge of "Bed" and the partition in "Living" on one line; that partition is 500 mm left of the right edge of "Living". A keep moves nothing.` |

`MAX_KEEPS` is 12 × the 80 keeps that would pin every edge of the largest example. It bounds output
size (`describe().keeps[]`, impact's matching); the work is bounded by the step meter (§4).

**Circular and contradictory keeps.** A keep defines no value, so no keep can read another and no
cycle can form *among keeps*: the brief's "circular keep" has no instance. A self-reference is
refused (`E_KEEP_SELF`). A *contradictory* set (two offsets between the same datums with different
values; an `align` and an `offset` of the same pair; `fixed` twice at different values) is not
refused, because each keep is legal alone: each is measured against the same resolved geometry, at
least one reports violated with its own residual, nothing moves, and `--facts depends` names the
set under `conflicts` (§5). *Reverse if:* authors leave such sets standing after reading the
residuals; then a static `W_KEEP_CONFLICT` joins the compile channel.

## 3. Grades: what each changes

### 3.1 The proposal evaluated

The brief proposed: `hard` → a compile-channel warning that `validate --strict` gates on and the
never-worse law counts; `soft` → a lint validity-layer `W_KEEP_VIOLATED`; `advisory` → the intent
tier, never gating.

- **`hard` → compile channel: adopted.** A broken hard keep means the source does not resolve to
  what it declares, which is D13's reason for putting compile-channel warnings ahead of validity in
  `next`: in the drill, the broken keep names the cause (the partition did not follow) of the three
  lint symptoms. It is what PS4.2's seam expects.
- **`soft` → lint validity: rejected.** Four reasons:
  1. *The ladder would not be monotone.* `--strict` fails on any warning of either channel, so a
     soft keep would gate exactly as a hard one does; the never-worse law counts default-lint codes,
     so it would count soft exactly as hard; and the taste cap reads validity-layer lint codes only
     (ADR 0032 decision 4), so a soft keep would cap taste while a hard one would not. Hard and soft
     would then differ only by `next` tier, and soft would be stronger than hard in one respect.
  2. *Wrong layer.* §4's validity layer is "geometry and topology are not self-contradictory"; a keep
     is the author's contract, §4's intent layer. `W_FURN_CLEAR_FRONT` (ADR 0029) is a declared check
     in lint, but what it measures is a usability defect of the space (a wardrobe that cannot open);
     a keep measures a relation between numbers the author chose.
  3. *`lint()` stays keep-free.* With no grade in lint, `lint()` never moves for any plan because of
     a keep, so the law of §7 is simple and D17's drafting carve-out is never touched.
  4. *One evaluation, one place.* Keeps are measured once, in the resolver; lint would have to
     re-measure them or read the resolver's results, a second home for the same fact.
- **`advisory` → intent tier: changed to "facts only".** IFC's ADVISORY is information. If advisory
  sat in `next`'s intent tier it would be named as "the one thing to fix first" whenever nothing else
  is left, which is a soft keep's job. Advisory keeps are therefore reported in `describe()`,
  `validate`'s `keeps` and `impact`, and never chosen by `next`.

### 3.2 The decision

| | `hard` (default) | `soft` | `advisory` |
|---|---|---|---|
| `compile().diagnostics` | `W_KEEP_VIOLATED` (warning) when broken | — | — |
| `validate --strict` (exit 2) | fails | passes | passes |
| plain `validate` exit | 0 (warnings never fail it) | 0 | 0 |
| `validate --json` `next` (D13 tiers) | tier `warning`, with the other compile-channel warnings | tier `intent`, after the brief's gating assertions and `--graph` mismatch, before its advisory assertions | never |
| `validate --json` `keeps` (§3.3) | listed | listed | listed |
| `describe().keeps[]` | listed | listed | listed |
| `arch impact` `keeps` (§6) | listed | listed | listed |
| every source-rewriting transform's no-worse law (`finish`, `furnish`, `repair`, fix-apply, `reroll`; R7) | counted (a compile code) | not counted | not counted |
| taste cap (D11) | never | never | never |
| `lint()` | never | never | never |

So the ladder is monotone in every row: hard ≥ soft ≥ advisory. Why each row:
- **`next`.** `NEXT_TIERS` is unchanged (`error, warning, validity, drafting, intent, profile,
  taste`). A hard keep's diagnostic is a compile-channel warning, so it is already in tier
  `warning`. A soft keep enters tier `intent` as a new item kind, `code: "W_KEEP_VIOLATED"`, after
  the brief's gating assertion and the `--graph` mismatch (both of which fail the gate) and before
  the brief's advisory assertions (which never do). `NextInput` gains `keeps?`; a soft keep is in the
  tier even without `--intent`.
- **The cap.** D11: the cap reads validity-layer lint codes, "compile-channel and profile-only
  warnings never cap either", and the intent layer never capped. A keep is the intent layer; a plan
  whose author broke a contract is not thereby a worse plan, and the taste reviewer reads the keep
  row anyway.
- **No-worse laws (corrected, R7, R19).** Every transform that rewrites source and holds a no-worse
  law over codes (`finish`, `furnish`, `repair`, fix-apply, `reroll`) counts `W_KEEP_VIOLATED`,
  because the law counts codes and a broken hard keep raises one: a rewrite that breaks a hard keep
  is refused with no keep-specific code path. An inserted piece cannot be a keep's target (targets
  are authored ids, and `finish`/`furnish` insert pieces with none), so the law guards the rewrites
  that move or re-derive what a keep names (`repair` moving a named piece, a fix rewriting a
  coordinate, a `reroll` loop). Soft and advisory keeps are not counted because they raise no code.
  *Reverse if:* a transform is shown breaking a soft keep an author relied on; then the laws read
  the keep rows too.
- **Plain `validate` does not fail on a broken hard keep.** It fails only on errors today, and the
  ship gate the spec teaches is `validate --strict`. Making one warning code fail plain `validate`
  would be the only such code. *Reverse if:* authors are seen shipping with a broken hard keep
  because they ran `validate` without `--strict` (open question Q2).
- **Default `hard`.** An author writes a keep so that it holds; the strongest grade is the honest
  default, and a weaker grade is a word the author adds. *Reverse if:* hard keeps fail `--strict` on
  plans whose authors meant them as notes, in a re-measure.

### 3.3 Where a result appears

One evaluation (§4) produces one result per keep: `{ holds, residual, at?, measured?, residuals,
skipped_walls? }`, stored in a side table keyed by the `ResolvedPlan` (as `stepsSpent` is), never on
an element and never on the memoised `PlanNode`. Readers:
- `compile()` turns each broken hard result into `W_KEEP_VIOLATED`, appended after every diagnostic
  of its storey (so no existing diagnostic moves), and for `stacked` after the last storey's.
- `describe()` appends a top-level `keeps[]` key, **present only when the plan declares a keep**,
  one row per keep in source order (storey keeps first by level, then plan keeps):
  `{ keep, form, grade, level?, targets, holds, residual_mm, at?, measured_mm?, residuals?,
  skipped_walls? }`. `keep` is the statement as `arch fmt` prints it, without `keep` and the grade.
- `validate --json` appends `keeps` before `next`, present only when the plan declares a keep:
  `{ keep, grade, level?, holds, residual_mm, at?, measured_mm?, span }`. Every byte before it is what
  it was.

## 4. Purity and budget

- **A statement, not an element.** `keep` is a control statement. It gets no id, enters neither
  `ir.elements` nor `MAX_ELEMENTS`, has no `drawCost` and no `bounds()`, and the drawing budget
  never sees it. The iron law "new element = one `src/elements/` module" does not apply because
  nothing is drawn; the evaluator lives in one new module, `src/keep.ts`, with its measures.
- **Expansion.** A keep expands like any statement (inside `for`, `if` and `zone`; refused inside
  `component`). Its `<mm>` expression is evaluated there on the meter, as every expression is, so it
  cannot read a datum (`E_DATUM_BEFORE_ROOMS`, as a `let` cannot). Expansion charges a keep as it
  charges any statement: its expressions, and one step per target before the record is allocated;
  the measure's charge is separate and paid once (below). The count is checked against
  `MAX_KEEPS` and `MAX_KEEP_TARGETS` there: `E_KEEP_LIMIT` is raised once, and every later keep is
  dropped while its expansion is still charged, so the cap cannot be used to skip work (R13).
- **Where root keeps go on a multi-storey plan (R12).** Root-level keep statements are taken out of
  the `shared` statements before `levelPlanFor` builds each storey's plan, so a root keep is never
  copied into every storey. `stacked` keeps are evaluated in `resolveLevelsImpl` after the last
  storey has resolved. The root-placement refusal (`E_KEEP_PLACEMENT` for a storey form at the root
  of a multi-storey plan) is raised once, with no `level`.
- **Evaluation, once, after the last stage.** A storey's keeps are evaluated after the storey's
  resolution has finished every step of `resolveBody` (`src/ir.ts`: groups resolved, `facing`
  settled (`settleKinds`), instances carried into plan coordinates, openings registered, the
  cross-element checks, axes, sheet and drawn sizes), in source order, reading the resolved plan in
  plan coordinates. On a `paper` plan, whose storeys resolve twice (the geometry probes, then the
  drawn pass), keeps are evaluated **in the drawn pass only** (R11).
- **Charged once, at one point: immediately before the measure (R11).** `align`, `equal`, `offset`,
  `on axis`, `fixed`: `1 + targets` steps; `min clear`: its share of the storey's wall scan;
  `stacked`: `1 + 4 × levels`. All on `MAX_EVAL_STEPS`. The per-storey indexes the measures read (id →
  element, and the straight-segment index `min clear` scans) are built once per storey and charged
  once when built (`walls + segments`), not once per keep (R13).
- **One counter (R13).** The storeys of a plan share one step counter (`stepsBefore` chains them, and
  a `paper` plan's probes and drawn pass count into the same total), and the `stacked` pass after the
  last storey continues it. A crossing inside the `stacked` pass is `E_STEP_LIMIT` and leaves the
  plan unresolved, like any crossing.
- **Deterministic and exact.** Lattice integers, source order, no `Map` iteration over anything but
  source order, no tolerance, no float upstream of a printed residual.
- **No iteration, no solving, no writes.** One pass; a keep reads the resolved plan and writes only
  its own result. Nothing is moved, snapped, re-hosted or re-tried (ADR 0004, 0006). Two keeps that
  contradict each other both run, at least one reports, nothing moves, and the static fact names
  them (§2.2, §5).
- **The one exception to "a keep draws nothing", stated.** A plan whose resolution crosses
  `MAX_EVAL_STEPS` inside its keep pass stops there with `E_STEP_LIMIT` and resolves to no elements,
  exactly as a plan whose `height` or `let` expressions cross it does. The law of §7 is scoped to
  plans that resolve within the step budget (R13); the keep pass runs last, so no keep can move the
  crossing point of a plan that crosses earlier.
- **Outside `compile()`.** The static facts of §5 and impact's matching run post-resolve with no
  meter, bounded by counts, as `--facts depends` and `impact` are today.

## 5. `--facts depends` additions

`describe(…, { facts: ["depends"] })` gains `depends.keeps[]`, plan-wide on the top-level `depends`
object (every storey's keeps and the plan's, with `level`), present only when the plan declares a
keep:

    { keep, level?, targets, constrains, equations?, bounds?, locked?, implied?, redundant?, conflicts? }

- **`targets`**: the ids, datums and axis labels as written, namespaced like every depends row.
- **DOF, as named numbers: `constrains`** is the sorted set of bound names (`let`s, parameters) the
  targets' positions read, following each target's `on`, `hostWallId` and `params` edges
  transitively (the closure `impact` already walks; bounded by the element count). `equations` is the
  number of scalar equalities the keep states (`align`, `equal`: targets − 1; `offset`, `on axis`,
  `fixed`: 1; `stacked`: 4 × (levels − 1)); `bounds` the number of inequalities (`min clear`: 1).
  `locked: true` when `constrains` is empty and every target is placed by literals, so no `--set`
  can break it, only an edit of a literal.
- **Redundancy (`implied`, `redundant`).** Per storey and axis, every equality is a difference
  constraint `v(u) − v(w) = c` between datum nodes (`fixed` uses a node `origin`; `equal` uses one
  node per measured length; `stacked` one node per id and level). Before the keeps, the source's
  **implications** are entered, each labelled with the statement that makes it hold *for every value
  of every name*: a relational room (`right-of a gap <literal>` gives `b.left − a.right = gap`; `align
  top|bottom` gives the cross-axis edge equality), a wall point written as a bare datum or a datum
  plus a literal (`(a.right, 0)`). **Only implications that survive grid snapping are entered (R5):**
  the datum is an edge, never a centre (`cx`, `cy`, and so `align middle|center`, may sit on a
  half-grid and snap), and every literal in the implying statement is a multiple of the plan's
  `grid`. Otherwise the relation is not implied: a keep that restates it is measured, not excused,
  because the keep reads the snapped datum (§2). Then the keeps, in source order, into a weighted union-find
  on lattice integers: an equality whose ends are already joined with the same `c` is *implied*
  (listed under `implied` with `by`: the keep or statement phrase, never an internal name); a keep all
  of whose equalities are implied is `redundant: { by: […] }`. `min clear` is redundant when a later
  or earlier `min clear` on the same room demands at least as much; `stacked` when its levels are
  already joined for that id.
- **Conflict (`conflicts`).** An equality whose ends are joined with a different `c` cannot hold
  together with what joined them: `conflicts: [{ with: [<keep or statement phrase> …], axis, gap_mm
  }]`, the path found by a breadth-first walk of that component's spanning forest. Example: `keep
  offset b.left from a.right 100` on the drill conflicts with `room b right-of a … gap 0`
  (`gap_mm: 100`). The static facts read only declarations and literals, never resolved geometry, so a
  conflict means "these cannot all hold whatever the plan's names are set to".
- **Bounds.** At most `MAX_KEEPS × MAX_KEEP_TARGETS` = 64,000 equalities plus one implication per
  relational room and datum-written point; the union-find is near-linear; at most
  `MAX_KEEP_CONFLICTS` = 64 conflict paths are named, each a walk bounded by its component's size,
  then `conflicts_truncated: true`. No step is charged (no evaluation happens, as `depends.ts` says).
- `arch solve` (PS6.1) is what would *use* these facts; this card only reports them.
- **Scope (R16):** `depends.keeps[]` is built in PS4.3b, and so are the per-storey rows (a keep row
  on each `levels[]` entry's `depends`, beside the plan-wide list).

## 6. `arch impact` reads keeps

`ImpactReport` gains `keeps`, present only when either side declares a keep, placed after
`diagnostics`:

    keeps: { broke: KeepImpact[], held: KeepImpact[], healed: KeepImpact[],
             added: KeepImpact[], removed: KeepImpact[], unchanged_count }
    KeepImpact = { keep, grade, level?, residual_mm: { before, after }, at?, changed: [names] }

- Keeps are matched across the sides by `(level, keep text, occurrence index)`, span-blind (the
  text is the printed form, so `--set` cannot change it; a keep's `<mm>` that reads a name prints the
  name; the occurrence index tells apart two keeps with the same text, such as one a `for` loop
  repeats). A keep present on one side only is reported under `added` or `removed`, with the one
  residual it has (R15).
- **broke**: violated after, and either held before or its residual changed. **healed**: held after,
  violated before. **held**: held on both sides while at least one of its targets is in `changed`
  (the useful signal: the change moved what the keep reads, and the keep still holds, e.g. `keep
  align a.right b.left` on the drill, held because `b` follows `a` by `right-of`). Everything else
  counts in `unchanged_count`. `changed` lists the keep's targets that `impact` reports as changed.
- **Upper storeys (R15).** `impact` compares only the lowest storey's elements until PS4.6, so a keep
  on a higher storey (and a `stacked` keep's upper levels) has no `changed` to read. Such a keep is
  classified by its residual alone: broke and healed as above; held when it holds on both sides and
  its residual changed (a `min clear` margin); otherwise unchanged. PS4.3b names per-storey
  comparison of keep targets as its scope.
- **`W_KEEP_VIOLATED` is reported once, under `keeps`**: `sideDiagnostics` drops the code from the
  compile channel before matching, so `diagnostics.broke`/`healed`/`unchanged_count` never count it.
  The PS4.2 seam comment said it would arrive there "with no change here"; reporting it twice (a
  diagnostic and a keep row with its residual) would double every broken hard keep in the summary,
  and the keep row says more. The seam comment is rewritten in the implementation PR.
- Human summary: sections after `Unchanged diagnostics`, `Keeps broke (n)`, `Keeps held (n)`,
  `Keeps healed (n)`, and `Keeps added (n)` / `Keeps removed (n)` only when non-empty, one line per keep (`keep <text> (<grade>[, level n]): residual <before> →
  <after> mm[ at <target>[, level n, <edge> edge]]`) and one `changed:` line.
- PS4.5 (contact dependency, element `held`) is independent: a keep makes the drill's partition
  visible as a broken keep; PS4.5 makes it visible as a held element without any declaration.

## 7. The byte-identity law

Three claims, the heights law's weak/strong split (`test/height-byte-identity.test.ts`):

- **K1, weak: a plan with no `keep` is unchanged.** SVG of every storey, `describe()` (with and
  without `--facts depends`), `lint()`, `compile().diagnostics` with its order, `validate --json` and
  `impact --json` over every example and both corpora are byte-identical to a baseline taken with
  the test's own digest (`allStoreysPayload`, `allStoreysDiagnosticsPayload`) **before any code
  lands**. The resolver's step count of every keep-free corpus plan is unchanged
  (`test/step-budget.test.ts`).
- **K2, strong: an accepted keep draws nothing and moves nothing** (scoped to accepted keeps, R8,
  and to plans within the step budget, R13). A keep corpus, `test/keep-corpus/*.arch` (each form and
  grade, holding and broken; the drill of §9; a placed instance's datums; a three-storey `stacked`;
  one keep inside a `for` and one inside an `if`, R9), is compiled twice: as written, and with each
  keep's byte span **blanked with spaces, newlines kept**, inside the test (no twin file to drift),
  so every later span, line and column is unchanged (R9). Then, each a SHA-256 over the payload:
  every storey's SVG is identical; `lint()` is identical; `describe()` is identical once the `keeps`
  key, `depends.keeps` and the `W_KEEP_VIOLATED` rows of `describe().diagnostics` are removed;
  `compile().diagnostics` is identical once `W_KEEP_VIOLATED` rows are removed; and for the plans
  whose keeps all hold, `compile().diagnostics` is identical with nothing removed.
- **K3, the keep rows themselves.** A digest table over the keep corpus's `describe().keeps[]`,
  `validate --json` `keeps`/`next` and `impact --json` `keeps`, pinned last (as ADR 0029 §7's
  relation digests were). A table test pins each form's holds ⇔ residual rule and sign on hand-built
  cases, including:
  - the lattice edge: a 0.001 mm offset breaks `align`;
  - snapping (R5): `grid 50` and a room 4050 wide, so its `cx` lies on a half-grid and is read
    snapped; a keep on that `cx` measures the snapped value, and no `implied` fact is entered for
    it;
  - lattice rounding (R6): `keep fixed a.left at 0.1 + 0.2` on a room at `x = 0.3` with no grid
    holds, both sides rounding to 300 lattice units;
  - `min clear` spanning (R18): the §9 after-case, whose outside wall's north and south runs end at
    x 8100 inside a room that reaches 8500, so they do not span it, are not read
    (`skipped_walls: 2`), and the depth span is the room's full 5000.

Plus two laws the implementation needs anyway, and the printer's:
- **D4 equivariance (R10).** PS4.3a ships a source-level transformer for keeps: under `mirror x` the
  datum words `left`↔`right` swap, under `mirror y` `top`↔`bottom`, under a transpose `width`↔`depth`
  and the `x`↔`y` axes swap, and `at` values are mapped. Turning or mirroring a whole root plan with
  its keeps then keeps every `holds` and every residual's magnitude, signs mapped by the axis map, and
  the residual sets are compared **unordered**. The `test/d4-oracle.ts` component route does not
  apply: keeps are refused inside components (§2.2), so there is no instance frame to carry them. As built (PS4.3a), the law is stated over single-storey plans whose keeps name no axis and whose datums include no half-grid centre: a placed frame carries no positioning axis and no storey, so axis keeps and `stacked` keeps have no image under the instance route (a whole-plan transform would carry them; plan-soundness card PS0.26), and the language's `snap` rounds a half toward +∞ (`Math.round`), so a mirrored half-grid centre snaps one grid away from its image: the fault is in snapping, not in the transformer (PS0.26).
- **Printer round trip** (ADR 0020 §5): `arch fmt` prints every keep and re-parses to the same AST.
  Plan JSON drops keeps (it drops axes already) and the round-trip test pins that drop (PS4.10,
  PS4.11).

## 8. Teaching

### 8.1 The spec line and its cost

One `STATEMENT_GRAMMAR` line in `scripts/gen-llm-spec.ts`, interpolating the form words, the measure
words and the grades from the parser's tables and guarded by `assertVocabRendered` (no retyped
list, the generated-artifacts rule):

```text
keep (align <d>… | equal width|depth <id>… | offset <d|id> from <d> <mm> | min clear <room> <mm> | on axis <label> <wall> | stacked <room|stair|elevator|void> on levels <n>… | fixed <d> at <mm>) [hard|soft|advisory]   # CHECKED, never solved: draws/moves nothing. <d>: r.left…, axis <label>, straight wall; authored ids. Broken: hard (default) W_KEEP_VIOLATED ±mm, fails --strict; soft in next; advisory in describe/validate/impact
```

(Revised by R19: the line now says where advisory keeps are reported, teaches `stacked` on stairs,
lifts and voids, and tells the axis `<label>` from the level `<n>`; shortened elsewhere to the same
cost.) Cost, measured on the in-memory string the test measures (UTF-16 units): **432** with its
newline.
Headroom today: 271. The line does not fit alone, so four passages that describe only how
something is *drawn* (nothing an author writes differently, no refusal code, no measured fact) pay
for it, each an exact, unique substring of today's render:

| Line | Cut (exact) | Replacement | Saved |
|---|---|---|---|
| `door` | ` DASHED = above the cut plane or hidden (that projection, a barn/bifold track, a pocket cavity); a hinged swing is SOLID.` | (none) | 121 |
| `door` | `` `garage` (a sectional/roller door) takes NO clause at all: it parks OVERHEAD, so there is no `open` position to draw and its projection side is DERIVED from which face has floor, never written. `` | `` `garage` takes NO clause: it parks overhead. `` | 149 |
| `outdoor` | ``GROUND outside the building: a scale-aware material hatch over a tint (a `balcony`: tint + railing, no hatch). NOT a room`` | `GROUND outside the building. NOT a room` | 82 |
| `height` (setting) | ` (900 is GB 50352-2019's residential minimum)` | (none) | 45 |

Total cut 397; the spec goes 29,729 → **29,764** units, headroom **236**. The `door` line is the one
the test's own comment names as "the next real lever". The language reference
(`docs/language-reference.md`) keeps all four passages; `test/doors.test.ts` asserts the garage
semantics in code, not this prose. The cut is a teaching change on a measured surface, so the next
first-contact re-measure states it (D19).

### 8.2 SKILL

One sentence at the end of `skills/archlang/SKILL.md` step 8 ("Check the plan against the brief"),
the step where a brief's numbers become checks:

> A number or relation the brief fixes and every edit must keep (a 3.6 m clear living room, a
> partition on axis 2, a bath over a bath) goes in the source as a `keep` (`keep min clear living
> 3600`); it moves and draws nothing, a broken hard keep (the default) is `W_KEEP_VIOLATED` with a
> signed residual and fails `--strict`, and `archlang impact --set` lists which keeps a change breaks.

### 8.3 The author loop

After D20 the author loop is compile → `validate --json` (fix its `next` first) → lint → repair.
A broken hard keep is in `next`'s `warning` tier and a broken soft keep in its `intent` tier, so the
loop already reaches both through `next`: its text in the spec, SKILL step 7 and
`.claude/agents/arch-author.md` gains no words. The brief's note ("a keep is validity when
`soft`/`hard`") is met by `next`, not by the validity layer (§3.1).

## 9. Worked example: the widening drill with three keeps

The drill (`repro/widen-before.arch`) needs a second storey for `stacked`, so the example is its
two-storey twin. The twin without the three `keep` lines compiles today (checked on `main@98b3d7ab`;
the lint rows below are today's output, byte for byte, which K2 requires them to stay):

```arch static
plan "widen" {
  units mm
  grid 50
  let AW = 4000
  level 1 {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
    wall id=p partition thickness 100 { (4000,0) (4000,5000) }
    room id=a at (0,0) size AW x 5000 label "Living"
    room id=b right-of a align top gap 0 size 4000x5000 label "Bed"
    door on shell at 1000 width 900
    door on p at 2500 width 800
    window on shell at 6000 width 1500
    stair id=st at (300,3800) size 2400x900 dir up
    furniture id=bed double_bed against wall shell segment 0 offset 6000 side left in b
    keep align a.right b.left p
    keep min clear b 3800 soft
  }
  level 2 {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
    wall id=p partition thickness 100 { (4000,0) (4000,5000) }
    room id=l at (0,0) size 4000x5000 label "Landing" uses hall
    room id=b at (4000,0) size 4000x5000 label "Bed 2"
    door on p at 2500 width 800
    window on shell at 6000 width 1500
    stair id=st at (300,3800) size 2400x900 dir down
  }
  keep stacked b on levels 1 2 advisory
}
```

Spans (bytes, LF): `keep align …` [585, 612) at line 15 col 5; `keep min clear …` [617, 643) at line
16 col 5; `keep stacked …` [1059, 1096) at line 27 col 3. `AW = 4500` has the same length, so every
span is the same on the after side.

**The measures by hand.**
- *Before* (`AW = 4000`): `a.right` = 4000, `b.left` = 4000 (by `right-of a gap 0`), `p` = 4000:
  residuals 0, 0; holds. `min clear b`: `b` spans x 4000–8000, y 0–5000; full-depth vertical bodies
  meeting it: `p` (x 3950–4050, clipped to 4000–4050) and the shell's east segment (x 7900–8100,
  clipped to 7900–8000); widest free x interval 4050–7900 = 3850; horizontal: the shell's north and
  south segments, whose bodies run x −100–8100 and so span `b`'s 4000–8000, cut y 0–100 and
  4900–5000, free 100–4900 = 4800; clear 3850; residual +50; `skipped_walls: 0`; holds.
  `stacked b`: both storeys' `b` at x 4000–8000, y 0–5000; residuals 0; holds.
- *After* (`AW = 4500`): `a.right` = 4500, `b.left` = 4500, `p` = 4000: residuals 0 (b.left) and
  −500 (p); broken, reported at `p`. `min clear b`: `b` spans x 4500–8500; `p` no longer meets it; the
  shell's east segment (x 7900–8100) crosses it at full depth; free x intervals 4500–7900 = 3400 and
  8100–8500 = 400, widest 3400; the shell's north and south segments still meet `b` but their bodies
  end at x 8100, short of `b`'s 8500, so they do not span it and are not read (`skipped_walls: 2`,
  R18), and the depth span is `b`'s full 5000; clear min(3400, 5000) = 3400; residual −400; broken.
  `stacked b`: level 1
  `b` left 4500, right 8500; level 2 `b` left 4000, right 8000; residuals (level 2 − level 1) left −500,
  top 0, right −500, bottom 0; reported left −500 (first in edge order); broken.

**`archlang validate widen-keep.arch --json`, before.** `ok: true`; one lint row; all keeps hold;
`next` is the lint row:

```json
{
  "ok": true,
  "strict": false,
  "diagnostics": [
    { "code": "W_HABITABLE_NO_WINDOW", "severity": "warning", "message": "Living room \"Living\" (20 m²) has no window on any of its walls; a room people live in needs daylight.", "line": 8, "col": 5, "span": [218, 266], "fix": "…as today…", "hints": ["…as today…"], "level": 1 }
  ],
  "keeps": [
    { "keep": "align a.right b.left p", "grade": "hard", "level": 1, "holds": true, "residual_mm": 0, "span": [585, 612] },
    { "keep": "min clear b 3800", "grade": "soft", "level": 1, "holds": true, "residual_mm": 50, "measured_mm": 3850, "span": [617, 643] },
    { "keep": "stacked b on levels 1 2", "grade": "advisory", "holds": true, "residual_mm": 0, "span": [1059, 1096] }
  ],
  "next": { "tier": "validity", "code": "W_HABITABLE_NO_WINDOW", "message": "Living room \"Living\" (20 m²) has no window on any of its walls; a room people live in needs daylight.", "span": [218, 266], "level": 1, "hint": "Add a `window` on wall `shell`, which runs along this room's (`a`) outside edge." }
}
```

**The same, after (`AW = 4500`).** `ok: true` (no `--strict`); the hard keep's warning comes first
(compile channel), then today's four lint rows unchanged; `next` names the broken hard keep (tier
`warning`, D13), not the symptoms. With `--strict` the exit is 2, as it already is for the lint rows.

```json
{
  "ok": true,
  "strict": false,
  "diagnostics": [
    {
      "code": "W_KEEP_VIOLATED",
      "severity": "warning",
      "message": "This keep holds the right edge of \"Living\", the left edge of \"Bed\" and the partition in \"Living\" on one line; that partition is 500 mm left of the right edge of \"Living\". A keep moves nothing.",
      "line": 15,
      "col": 5,
      "span": [585, 612],
      "fix": "Edit the source so the keep holds (move what it names, or derive it from the rooms so it follows them), or remove the keep if the relation no longer applies. There is no machine fix: which side follows is a design decision.",
      "hints": [
        "The keep names `a.right`, `b.left` and `p`; residual -500 mm on x (+ is right): `p` at 4000, `a.right` at 4500.",
        "Nothing was moved: `p` stands where its own statement puts it."
      ],
      "level": 1
    },
    { "code": "W_ROOM_DISCONNECTED", "line": 9, "col": 5, "span": [271, 334], "level": 1, "…": "today's row" },
    { "code": "W_HABITABLE_NO_WINDOW", "line": 8, "col": 5, "span": [218, 266], "level": 1, "…": "today's row (22.5 m²)" },
    { "code": "W_BOUNDARY_NO_WALL", "line": 9, "col": 5, "span": [271, 334], "level": 1, "…": "today's row" },
    { "code": "W_ROOM_OUTSIDE_SHELL", "line": 9, "col": 5, "span": [271, 334], "level": 1, "…": "today's row" }
  ],
  "keeps": [
    { "keep": "align a.right b.left p", "grade": "hard", "level": 1, "holds": false, "residual_mm": -500, "at": { "target": "p" }, "span": [585, 612] },
    { "keep": "min clear b 3800", "grade": "soft", "level": 1, "holds": false, "residual_mm": -400, "measured_mm": 3400, "span": [617, 643] },
    { "keep": "stacked b on levels 1 2", "grade": "advisory", "holds": false, "residual_mm": -500, "at": { "target": "b", "level": 2, "edge": "left" }, "span": [1059, 1096] }
  ],
  "next": {
    "tier": "warning",
    "code": "W_KEEP_VIOLATED",
    "message": "This keep holds the right edge of \"Living\", the left edge of \"Bed\" and the partition in \"Living\" on one line; that partition is 500 mm left of the right edge of \"Living\". A keep moves nothing.",
    "span": [585, 612],
    "level": 1,
    "hint": "The keep names `a.right`, `b.left` and `p`; residual -500 mm on x (+ is right): `p` at 4000, `a.right` at 4500."
  }
}
```

(The rows marked "today's row" are printed in full by the CLI exactly as `main@98b3d7ab` prints
them; they are abbreviated here because K2 makes them identical by law. PR #269, open, rewords lint
messages to drop ids; whatever it merges is what these rows then carry. The keep's own message
names the partition through that PR's builder, `src/naming.ts`; "the partition in "Living"" is the
phrase the design expects, and the exact words are the builder's.) `describe()`'s row for the `min
clear` keep carries `skipped_walls: 2` (the shell's north and south runs). `next` names the broken
keep here only because the drill has no earlier compile-channel warning: `W_KEEP_VIOLATED` is
appended after the storey's other diagnostics, so within tier `warning` an earlier compile warning
(an opening off its wall, an overlap) would be named first (R19). Were the hard keep fixed
(`p` written `between a and b`), `next` would fall to tier `validity`; the soft `min clear` keep is
named by `next` (tier `intent`) only once validity and drafting are clean; the advisory `stacked`
keep never is.

**`archlang impact widen-keep.arch --set AW=4500`.** Today's sections are unchanged except that
nothing in them is a keep code; the new sections follow:

```text
AW: 4000 → 4500
Lets (1):
  AW: 4000 → 4500
Changed (3):
  room a resized (20 m² → 22.5 m²; right edge +500 mm)
    why: reads AW (4000 → 4500)
  room b moved 500 mm right
    why: on a (resized) ← reads AW (4000 → 4500)
  door door_2 re-hosted: joins a and b → nothing
    why: joins a (resized) ← reads AW (4000 → 4500)
Held (0): none
Broke (3):
  W_BOUNDARY_NO_WALL on b (level 1): …today's message…
  W_ROOM_DISCONNECTED on b (level 1): …today's message…
  W_ROOM_OUTSIDE_SHELL on b (level 1): …today's message…
Healed (0): none
Unchanged diagnostics: 1
Keeps broke (3):
  keep align a.right b.left p (hard, level 1): residual 0 → -500 mm at p
    changed: a, b
  keep min clear b 3800 (soft, level 1): residual 50 → -400 mm
    changed: b
  keep stacked b on levels 1 2 (advisory): residual 0 → -500 mm at b, level 2, left edge
    changed: b
Keeps held (0): none
Keeps healed (0): none
```

and in `--json`, after `diagnostics` (which counts no `W_KEEP_VIOLATED`):

```json
"keeps": {
  "broke": [
    { "keep": "align a.right b.left p", "grade": "hard", "level": 1, "residual_mm": { "before": 0, "after": -500 }, "at": { "target": "p" }, "changed": ["a", "b"] },
    { "keep": "min clear b 3800", "grade": "soft", "level": 1, "residual_mm": { "before": 50, "after": -400 }, "changed": ["b"] },
    { "keep": "stacked b on levels 1 2", "grade": "advisory", "residual_mm": { "before": 0, "after": -500 }, "at": { "target": "b", "level": 2, "edge": "left" }, "changed": ["b"] }
  ],
  "held": [],
  "healed": [],
  "added": [],
  "removed": [],
  "unchanged_count": 0
}
```

`changed` for the `stacked` keep is `b` on level 1; `impact` compares the lowest storey's elements
(PS4.6 widens that), and the keep row names the storey through `at`. A fourth keep `keep align
a.right b.left` would be listed under `held` (both targets moved, residual 0 → 0).

**`describe widen-keep.arch --facts depends --json`, `depends.keeps`** (either side; the facts are
static):

```json
[
  { "keep": "align a.right b.left p", "level": 1, "targets": ["a.right", "b.left", "p"], "constrains": ["AW"], "equations": 2, "implied": [{ "equation": ["a.right", "b.left"], "by": "room b right-of a" }] },
  { "keep": "min clear b 3800", "level": 1, "targets": ["b"], "constrains": ["AW"], "bounds": 1 },
  { "keep": "stacked b on levels 1 2", "targets": ["b"], "constrains": ["AW"], "equations": 4 }
]
```

So of the align keep's two equations one is already implied by `right-of`; the one that carries
information is `p` against the room edge, and the residual shows `p` is what did not follow.

## 10. Relation to PS4.4 (brief-bound dimensions)

Two homes, one measure. PS4.4 puts the client's numbers in `intent.json`, gated by `validate
--intent` (exit 2 on a gating miss). A `keep` puts the author's own invariants in the source:
relations between elements (alignment, stacking, axes, offsets) and a size the author decides must
survive edits. Where both bind a room's width, they must read one measure: PS4.4's width assertion
reuses `min clear`'s clear-span function from `src/keep.ts`, so a brief and a keep can never disagree
about the same room. Converting one into the other is not in either card.

## 11. Cards

PS4.3 stays `todo` with this design as its pointer, and is built in two PRs:

**PS4.3a · The statement, its evaluation, the hard channel and the law.** About 16–20 executor-hours.
- Files: `src/grammar/tokens.ts` (`keep` in `KEYWORDS.control`; the contextual word tables),
  `src/parser.ts`, `src/ast.ts` (`KeepNode`), `src/statement-print.ts` (printer), expansion in
  `src/ir.ts` (`E_KEEP_PLACEMENT`, `E_KEEP_LIMIT`, `E_KEEP_VALUE` at expansion), `src/keep.ts` (new:
  measures, evaluation, the side table, the source-level D4 transformer for tests), the storey and
  plan hooks in `src/ir.ts` (root keeps out of `shared` before `levelPlanFor`, `stacked` in
  `resolveLevelsImpl`, the drawn pass only on `paper` plans), `src/describe.ts`
  (`keeps[]`), `src/error-catalog.ts` (seven entries with executed examples), regenerated `gen:*`
  outputs (grammars, errors, CLI reference, llms files); `docs/language-reference.md` (a `keep`
  section); `test/keep-*.test.ts`, `test/keep-corpus/`.
- Acceptance: K1, K2, K3 (describe rows), D4 equivariance, printer round trip, step-budget test
  unchanged for keep-free plans; `archlang compile` and `describe --json` on the §9 file proven in the
  PR body; ADR 0033 → Accepted when this merges, if the reviewer agrees with §3.

**PS4.3b · `validate`, `next`, `impact`, the static facts and the teaching.** About 10–14
executor-hours. After PS4.3a.
- Files: `src/cli/commands-analyze.ts` (`keeps` key), `src/next.ts` (`NextInput.keeps`, the soft item
  in the intent tier), `src/impact.ts` (`keeps` section, the `sideDiagnostics` filter, the seam
  comment), `src/analyze/depends.ts` (`depends.keeps[]`), `scripts/gen-llm-spec.ts` (the line and the
  four cuts of §8.1), `skills/archlang/SKILL.md` (§8.2), `src/manifest.ts` if the `impact` or
  `validate` output description names its keys; the no-worse checks of every source-rewriting
  transform, each proven to count `W_KEEP_VIOLATED` (`src/repair.ts`, `src/fix-apply.ts`,
  `src/reroll.ts`, and `finish`/`furnish`'s `gainedCodes`, R7); tests.
- Scope named here (R15, R16): per-storey comparison of keep targets in `impact`, and the per-storey
  `depends` rows for keeps.
- Acceptance: the §9 outputs reproduced through the CLI (`validate --json` before and after, `impact`
  human and JSON, `describe --facts depends`); `validate --json` of every keep-free corpus plan
  byte-identical (K1); `next`'s corpus table test unchanged; spec ≤ 29,764 units as measured by the
  test; `test/spec-forms.test.ts` compiles one snippet per keep form as the spec line teaches it
  (R19); a CHANGELOG `[Unreleased]` entry; the as-built record.

Follow-up cards filed by this design:
- **PS4.8 · `keep` inside a component**: per instance, in its own frame, with residual signs mapped
  by the instance's transform; until then `E_KEEP_PLACEMENT`.
- **PS4.9 · `keep` measures beyond v1**: level-qualified datums so `align` can hold a partition over
  a wall below (T7, WT8), arc, oblique and partial walls in `min clear`, polygon room edges, furniture
  extents.
- **PS4.10 · Keeps over Plan JSON and MCP**: Plan JSON drops keeps in v1 (as it drops axes); MCP
  `validate`/`describe`/`impact` return `keeps` with the version bump (with PS5.3a's).
- **PS4.11 · Plan JSON says it dropped keeps** (R19): an export of a plan with keeps carries a note
  or a warning naming how many keeps it left out, so the loss is visible, not silent.

PS6.1 (`arch solve`) stays parked "until `keep` has real use"; PS4.3 gives it the declarations and
the static facts it would read.

## 12. Decisions taken here, with reverse-if

1. **ADR 0033, not an addendum to 0028** (§1). *Reverse if:* review finds no decision beyond 0028's
   vocabulary.
2. **Grades land as §3.2's table; soft is not a lint rule; advisory is never in `next`.** *Reverse
   if:* a re-measure shows authors fixing lint warnings but leaving broken soft keeps they wrote; then
   soft gains a non-capping, non-gating lint presence, decided again against §3.1's monotonicity
   argument.
3. **Default grade `hard`** (§3.2).
4. **`keep fixed` takes `at <mm>`** (§2.1).
5. **`min clear` is the widest free span between full-span straight wall bodies, the smaller of the
   two axes; skipped walls are counted** (§2.1). *Reverse if:* a corpus or first-contact case shows the
   widest-piece reading hiding a room split in two that the author meant as one; then the smallest
   piece is reported, and lint's `W_BOUNDARY_NO_WALL` coverage is re-checked.
6. **Authored ids only** (§2). *Reverse if:* authors hit `E_KEEP_TARGET` for auto ids on most first
   attempts.
7. **No keep inside a component; `stacked` at the plan root only; other forms inside their storey**
   (§2.2). *Reverse if:* PS4.8 lands.
8. **`keep` is a control statement, not an element** (§4).
9. **One meter; the `E_STEP_LIMIT` exception to "draws nothing" stated** (§4). *Reverse if:* a corpus
   plan crosses the budget in its keep pass; then keeps get a separate counted budget with a
   `keep-budget` skip, as taste has.
10. **No compile diagnostic for a static conflict** (§2.2).
11. **Impact reports `W_KEEP_VIOLATED` once, under `keeps`** (§6). *Reverse if:* a consumer keys on
    `diagnostics.broke` alone and misses broken keeps; then the code stays in both, marked.
12. **The four spec cuts of §8.1.** *Reverse if:* a first-contact re-measure shows an author
    misreading a dashed line, a garage door or a balcony hatch that the cut text explained.

## 13. Open questions for the coordinator (each changes what PS4.3a/b build)

- **Q1 · Grade landing.** This design adopts `hard` → compile channel, rejects `soft` → lint
  validity, and moves `advisory` out of `next` (§3.1). Rule on it before PS4.3b, since it decides
  whether `lint()` ever reads keeps and what `next` names.
- **Q2 · Should a broken hard keep fail plain `validate` (exit 2) like a gating intent assertion?**
  Recommended: no, `--strict` only (§3.2), because no warning code fails plain `validate` today.
- **Q3 · `keep fixed <d> at <mm>` instead of the card's bare `keep fixed …`.** Recommended: the
  valued form (§2.1); the bare form can be added later as an impact-only check.
- **Q4 · The four spec cuts (§8.1),** 397 units of drawing-only prose. Recommended as listed; any other
  set of cuts of at least 161 units keeps the line inside the cap, but a margin under about 100 units
  makes the cap a veto on unrelated example edits (the test's own warning).

## 14. Coordinator rulings (2026-10-26)

The coordinator ruled on §13's four questions on PR #270; recorded as README §3 D22. Each confirms
the §12 decision it names; nothing in §1–§12 changes.

- **R1 · Grade landing: accepted as §3.2's table** (§12 item 2). `hard`: compile-channel
  `W_KEEP_VIOLATED`, fails `--strict`, counted by the never-worse law, `next` tier `warning`. `soft`:
  `next` tier `intent` after the brief's gating items, never gates. `advisory`: reported in
  `describe()`, `validate --json` and `impact` only, never in `next`. No grade caps taste; keeps never
  enter `lint()`.
- **R2 · Plain `validate` exits 0 on a broken hard keep; only `--strict` fails** (§3.2): no warning
  code fails plain `validate` today.
- **R3 · `keep fixed <d> at <mm>`** (§12 item 4): a keep that one compile can never find broken is
  not a check.
- **R4 · The four spec cuts of §8.1** (§12 item 12), on the condition that the language reference
  keeps every cut fact and the GB 50352-2019 source stays in the doc comment where the 900 default
  lives (D3). Checked on `main@98b3d7ab`: `docs/language-reference.md` keeps the dashed convention
  and the hinged swing's solid arc (lines 1520, 1598–1601), the garage's overhead parking, derived
  side and missing `open` (1628–1648), and the outdoor hatch over a tint with the balcony's tint and
  railing (2194–2207); `src/datum.ts`'s `WINDOW_SILL` doc comment carries the GB 50352-2019 source.
  Net headroom after the keep line: **236** UTF-16 units (29,764 of 30,000).

### Red-team round 1 rulings (R5–R20), folded in place

The red team read the branch at `c00718f7` and found one blocker (R5) and fifteen should-fixes. The
coordinator ruled on each; unlike R1–R4, these amend §1–§11 in place, and the marks `(R5)` … `(R20)`
in the text show where. ADR 0033's decisions are amended to match. This was the last design round;
the implementation PRs carry their own reviews.

- **R5 (blocker) · Grid snapping.** A keep reads a datum as an expression in the plan would,
  grid-snapped (ADR 0028 §2); §5's `implied`/`redundant` facts are entered only when the implication
  survives snapping (an edge, never a half-grid centre; every literal of the implying statement a
  multiple of `grid`). K3 gains the `grid 50`, 4050-wide room, `cx` case. §2, §5, §7.
- **R6 · Lattice.** Datum values go on the 0.001 mm lattice by `sign(v)·round(|v|·1000)/1000`;
  centres compare at twice their value. K3 gains the `0.1 + 0.2` case. §2, §7.
- **R7 · No-worse laws.** Every source-rewriting transform's law counts a hard `W_KEEP_VIOLATED`:
  `finish`, `furnish`, `repair`, fix-apply, `reroll`. §3.2, §11 (PS4.3b files).
- **R8 · Refusals are compile errors.** A refused keep stops lint, `describe()` and `finish` as any
  error does; K2 is scoped to accepted keeps. §2.2, §7; ADR scope line.
- **R9 · K2's comparison.** Keep spans blanked with spaces (newlines kept); payloads as listed in §7,
  including `describe().diagnostics` less `W_KEEP_VIOLATED`; the keep corpus has a keep inside a
  `for` and one inside an `if`. §7.
- **R10 · D4 equivariance.** A source-level keep transformer in PS4.3a; residual sets compared
  unordered; the `d4-oracle` component route does not apply. §7, §11.
- **R11 · Paper plans.** Keeps are evaluated in the drawn pass only, charged once, immediately before
  the measure. §4.
- **R12 · Storeys.** Root keeps leave `shared` before `levelPlanFor`; `stacked` is evaluated in
  `resolveLevelsImpl` after the last storey; the root-placement refusal is raised once, without a
  level. §4, §11.
- **R13 · Budget.** The law is scoped to plans within the step budget; storeys share one counter; a
  crossing in the `stacked` pass is `E_STEP_LIMIT` and leaves the plan unresolved; per-storey indexes
  are built and charged once; `E_KEEP_LIMIT` is raised once and later keeps are dropped while still
  charged. §2.2, §4, §7.
- **R14 · Parsing.** A trailing grade word is always the grade; a value is the longest complete
  expression; `keep` joins `STATEMENT_STARTS`; `min` stays the built-in; no new `KEYWORDS`
  category. §2.
- **R15 · `impact`.** Keeps match by `(level, text, occurrence index)`; one-sided keeps are `added` /
  `removed`; upper-storey keeps are classified by their residual change; per-storey comparison is
  PS4.3b scope. §6, §9, §11.
- **R16 · `depends`.** Per-storey keep rows are PS4.3b scope. §5, §11.
- **R17 · Messages.** `E_KEEP_*` and `W_KEEP_VIOLATED` messages are id-free, built with PR #269's
  shared phrase builder (`src/naming.ts`); ids and datums go in `hints[0]`; a wall is named by the
  builder's wall phrase, so "the partition" is never ambiguous. §2.2, §9.
- **R18 · `min clear`.** A wall spans the room by its body (± t/2) on the joined outline; every wall
  body counts whatever its `height`. §9's after-case corrected: depth span 5000, `skipped_walls: 2`
  (residual unchanged, −400); K3 pins it. §2.1, §7, §9.
- **R19 · Nits.** `cards.md`'s vocabulary line uses R3's forms; the spec line says where advisory
  keeps are reported, teaches `stacked` on stairs, lifts and voids, and tells an axis `<label>` from a
  level `<n>`, at the same 432 units; PS4.3b's acceptance gains `test/spec-forms.test.ts`; `stacked`'s
  footprint is the resolved `at` + `size` rectangle; furniture in `offset` is read at its footprint
  rectangle's own centre; §3.2's no-worse justification corrected (the law counts codes; inserted
  pieces have no authored id); §9 notes that `next` names the keep only because the drill has no
  earlier compile-channel warning; card PS4.11 filed (Plan JSON says it dropped keeps). §2.1, §3.2,
  §8.1, §9, §11.
- **R20 · `<mm>` is never grid-snapped.** A keep's own value is the author's number; it is put on
  the lattice (R6), never on the grid. §2; ADR decision 2.

D22's figures stand: the revised spec line is still 432 units, so the headroom is still 236.
