# AF9 design: moves and skeletons for refused openings and blocked doorways

Design note for card AF9 (track 10 of `../product-roadmap/cards.md`; design row in `README.md` §7
Wave B), written 2026-11-19 (UTC, as every date here) to meet EV.5's gate (`docs/backlog.md`
§ EV.5: "a design note in the card or an ADR before code"). **No code changes here.** `file:line`
anchors are `main@cc1709bf`; re-read them before building. The rulings are RM-D70 (revised), §12.

Bounds: ADR 0005 (the core never chooses among valid placements), ADR 0011 (four tiers;
machine-applicable only on proof; "the *moment* there is a choice, it emits `maybe-incorrect`
instead", `docs/adr/0011-machine-applicable-fixes.md:73-74`), ADR 0028 §5 ("The nib is enforced,
never slid"; the refusal names the nearest legal position).

## 0. Decisions in one table

AF9 emits no machine-applicable fix (RM-D70, revised). Every move is `maybe-incorrect`, and every
skeleton is `has-placeholders`.

| Diagnostic (raise site) | Placeholder skeleton (`has-placeholders`) | Maybe-incorrect move |
|---|---|---|
| `E_OPENING_NIB` (`nibRefusal`, `src/opening-relation.ts:1045`) | none (with no legal position there is no fix: "narrow it" is never one) | the nearest legal centre on each side of the written centre in its bay (§3), on the host the clause names; a legal centre only past a meeting wall when the bay has none |
| `E_OPENING_HOST_AMBIGUOUS`, room-edge branch (`refusalOnEdge`, `:1316`) | none | each exterior body's nearest legal position (`edgeHints`, `:1364`) |
| `E_OPENING_NO_SHARED_WALL`, partition branch (`placeOnRun`, `:990-1001`) | a window: `on <exterior edge of "a">` when the room has two or more exterior edges, or its one exterior edge does not take the window | a door or opening on a derived partition: `between <room> and <other room>` (same wall); a window: the room's one exterior edge |
| `E_OPENING_DATUM` (`positionOnRun`, `:686-760`) | no position written: ` at <mm> from start` inserted; `at <mm>` or `at <pct>%` with no datum: ` from <start or end>` | a parallel edge: each edge of the **same room** that meets the run at an end (`a.left` becomes `a.top` or `a.bottom`) |
| `W_DOORWAY_BLOCKED` (`doorwayBlocked`, `src/lint/rules/doors.ts:282`) | none | the door moved along its own bay until its landing and swing miss every piece (§4) |

AF9 is one code PR: these fixes, plus the three hint corrections in §8 (F1 and F2 among them). A
"phase B" that promotes a move to machine-applicable is **not planned**. It would need an owner
decision and an amendment to ADR 0011 and ADR 0028 §5 (§12).

## 1. A design note, not an ADR

No ADR-level contract changes:

- `compile()` still refuses. ADR 0028 §5's "the nib is enforced, never slid" binds the compiler, and
  ADR 0011 §1 makes a fix data that never changes what `compile()` renders. A fix is a suggestion
  the author or an agent takes or leaves (ADR 0005: the core chooses nothing).
- Every move is `maybe-incorrect`, which ADR 0011 already prescribes the moment there is a choice.
  There always is one here. `E_OPENING_NIB`'s own catalogue fix lists three remedies ("Use the
  position the hint names, narrow the opening, or move the wall that meets the run", §2). The lint
  precedent says the same of hand-placed openings (`src/lint/rules/openings.ts:16-21`: "No fix is
  machine-applicable: every remedy moves something the author placed"). And the red team found
  unique-nearest moves that are still wrong. In its plan B1, a door moved to 650 by its corner nib
  lints `W_DOOR_NEAR_CORNER`, and the first clean position is 850. (`nib.arch` does not show this:
  lint of the door at 600 to 850 there gives only `W_NO_ENTRANCE`.) In its plan B2, a window move
  puts the window over a stove (`W_HOB_UNDER_WINDOW`).
- ADR 0011 §5 (fix edits text, repair searches space) holds. Every candidate is a closed-form
  endpoint of an interval on one run. There is no iteration to a fixpoint. Furniture stays
  `repair`'s.

No ADR line is added (§12 Q8).

## 2. The diagnostics in scope, reproduced

Every plan below was compiled on 2026-11-19 with `npx tsx src/cli.ts compile <file>` from this
branch's base (`main@cc1709bf`). The plans live in the executor's scratch folder and are copied into
the tests (§9). Each body is wrapped in `plan "<name>" { … }`. Output is quoted as printed. The
`= fix:` catalogue line is cut where it is long.

**C-jamb, `E_OPENING_NIB`** (EV.1: 4 of 7 compile-error losses). `nib.arch`:

```text
room id=a at (0,0) size 4000x3000
room id=b at (4000,0) size 3000x3000
walls from rooms exterior 200 partition 100
door between a and b at 500 from start width 800
```

```text
error[E_OPENING_NIB]: Door "door_1" is refused, not moved: its span y 100–900 leaves a jamb 0 mm from the face of the exterior wall derived from the rooms. A jamb needs at least 100 mm of wall to a meeting wall's face (the larger of 100 mm and half the 100 mm wall)
  --> 5:8
  = help: The nearest legal position is `between a and b at 600 from start` (centre at y 600).
  = fix: Use the position the hint names, narrow the opening, or move the wall that meets the run.
```

`arch fix --dry-run --json` on it reports `"passes": 0, "applied": [], "unresolved": ["E_OPENING_NIB"]`:
no fix is attached today.

`nib-tie.arch`: the same rooms, plus `wall id=t partition thickness 100 { (4000,1500) (7000,1500) }`
and `door between a and b at 1500 from start width 800`:

```text
error[E_OPENING_NIB]: Door "door_1" is refused, not moved: wall "t" stands inside its span y 1100–1900. …
  = help: The nearest legal position is `between a and b at 950 from start` (centre at y 950).
```

Centre 2050 is just as near (550 mm either way). The hint picks the smaller coordinate by its
tie-break (`nearestLegal`, `src/opening-relation.ts:1466`, `… && s < best`). See finding F1.

`flush.arch`: the same rooms, `opening between a and b at 450 from start width 800`:

```text
error[E_OPENING_NIB]: Opening "opening_1" is refused, not moved: the exterior wall derived from the rooms stands inside its span y 50–850. …
  = help: The nearest legal position is `between a and b at 600 from start` (centre at y 600).
```

`flush-ok.arch` (`at 500 from start`, the jamb flush on the ring's face) compiles: `✓ … (2343 bytes,
SVG)`. A cased opening's jamb is legal when it lies within `FLUSH_MM` (0.5 mm,
`src/opening-junctions.ts:17`) of a meeting wall's face (`nibFault`, `:1425`,
`flushOk && nib <= FLUSH_MM`). Centre 500 is 50 mm from the written 450, and the hint quotes 600,
150 mm away. See finding F2.

**C-ext, `E_OPENING_NO_SHARED_WALL`** (EV.1: 1 of 7). `ext.arch`: the same rooms,
`window on a.right width 1200`:

```text
error[E_OPENING_NO_SHARED_WALL]: Window "window_1" needs an exterior wall on `on a.right`, but the wall there is the partition between "a" and "b", a partition: the edge is shared with another room
  --> 5:10
  = help: Place it `between <room> and <room>` for an opening into the neighbouring room, or on an edge of the room that faces outside.
```

For a window the first half of that help cannot apply, because `between` takes a door or a cased
opening only. AF9 gives a window its own hint (§8).

**The same family on an edge with several walls, `E_OPENING_HOST_AMBIGUOUS`.** `ext-part.arch`:
`room id=b at (4000,0) size 3000x1500` (half height), `window on a.right at center width 800`:

```text
error[E_OPENING_HOST_AMBIGUOUS]: Window "window_1" cannot tell which wall to stand in: the edge `on a.right` names carries 2 wall runs (the exterior wall derived from the rooms, the partition between "a" and "b"), and its span y 1100–1900 lies on 2 of them
  = help: `on a.right at 2100 from start` stands in the exterior wall on y 1500–3000.
```

At `width 1200` the help is "No position along the edge … fits a 1200 mm opening with its nibs in an
exterior wall".

**C-par, `E_OPENING_DATUM`** (EV.1: 1 of 7). `par.arch`: the same rooms,
`door between a and b at 600 from a.left width 800`:

```text
error[E_OPENING_DATUM]: `a.left` runs parallel to the shared edge, so an offset cannot be measured from it: name an edge that meets one of its ends, or write `from start|end`
  --> 5:36
```

The same code without a datum (`nopos.arch`):

```text
error[E_OPENING_DATUM]: Door "door_1" has no position: a door is held to an end of the shared edge or to a room edge, never centred by default; write `at <mm> from start|end`, `at <mm> from <room>.<edge>`, `at axis <label>` or `at center`
error[E_OPENING_DATUM]: Door "door_2" is placed `at 600`, which names no datum: along a shared edge write `at <mm> from start|end`, `at <mm> from <room>.<edge>`, `at axis <label>` or `at center`
```

**`W_DOORWAY_BLOCKED`** (lint). `blocked.arch`:

```text
wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
room id=r at (0,0) size 6000x4000 label "Bath"
door id=d on shell at 3000 width 800
furniture wc at (2800,150) size 400x700
```

`arch lint --json` gives `W_DOORWAY_BLOCKED` ("the approach needs 300 mm clear on each side but
"wc" leaves 50 mm (250 mm short)") with three hints and no `fixes`. The same plan already raises
`W_SWING_OBSTRUCTED` on the door too (and `W_ROOM_MISSING_DEFINING`, unrelated). `arch repair
--json` moves the WC to `(2800,100)` and leaves it in `unresolved`: "it cycles between 2 positions
((2800,400) ↔ (2800,100)); parked on the lowest of them, adjust manually". A door move is offered
only as a hint today.

**What the corpus raises today.** A read-only scan with `compile()` + `lint()` over 112 plans
(`examples/`, `test/fixtures/`, `test/walls-from-rooms/`, `eval/faults/`, `eval/goldens/`, recursive)
found no plan that raises any of the four compile codes. Shipped plans compile. Seven plans raise
`W_DOORWAY_BLOCKED`:
`test/fixtures/off-path-bypass.arch`, `test/fixtures/gaps/gaps.arch`,
`eval/faults/blocked-doorway.arch`, `eval/faults/combined.arch`, `eval/goldens/compact-studio.arch`,
`eval/goldens/dims-auto-cottage.arch`, `eval/goldens/galley-kitchen.arch`. Those are the plans
whose `lint()` output AF9 moves (§7). The scan was top-level plus subfolders of those five
directories only. The code PR re-runs it over every digest table's inline plans too
(`docs/agents/gotchas.md` § PRs & CI).

## 3. "Legal", "nearest" and the candidate search

**Legal** means the placement passes the same checks `placeOnRun` runs (`src/opening-relation.ts:920-1040`).
It is not a lookalike:

1. the position is snapped by `ctx.snapPt`, and the snapped point is the one judged;
2. its span lies on one body (`bodiesUnder` is 1 where the run carries several), and an exterior
   body on a room edge;
3. the host is not `status demolish` and is not voided by `open between`;
4. `nibFault` is null on that host. It demands a nib of `max(100, t/2)` only from the meeting-wall
   spans `js`, and lets a cased opening's jamb sit within `FLUSH_MM` (0.5 mm) of a face. At the
   host's own ends `R0` and `R1` it asks only that the span stays inside them, with no nib.

AF9 moves that sequence, unchanged, into one pure judge, `judgeLanding(c, …) → fault | null`.
Both the written position and each candidate are judged by it. Moved-function hazard: diff the moved
body against `placeOnRun:961-1040` and keep every charge and float operation in its order.

**Bays.** The bodies of the meeting walls on the host (`hostFit(...).js`) cut the host's extent
`[R0, R1]` into bays. A move stays in a bay: it never jumps over a wall that meets the run, except
in the one fallback below. This is how "never across a room boundary" is written here. On
`between A and B` the run is the pair's shared edge, so both faces keep the same two rooms. A
meeting wall inside a room (wall `t` in `nib-tie`) still divides it physically, and crossing it is a
choice. On `on <room>.<edge>` the inside face stays in the named room, and the host stays an
exterior body.

**Candidates.** A bay end is either a meeting wall's face (`j.lo` or `j.hi`) or a free end of the
host (`R0` or `R1`). The legal centres of a bay are one interval. Its low end is `j.hi + need + w/2`
past a meeting wall, and `R0 + w/2` at a free end. The high end mirrors that. Today `nearestLegal`
already proposes both forms (`raw = [R0 + w2, R1 - w2]`, then `j.hi + need + w2` and
`j.lo - need - w2`, `:1456-1457`). For a cased opening the flush band is added at each meeting-wall
end: the centres whose jamb lies within 0.5 mm of the face, `[j.hi + w/2, j.hi + w/2 + FLUSH_MM]`
and its mirror. `nearestLegal` omits it today (F2). On a grid each interval end rounds inward to the
grid. An interval with no grid point is empty.

**Which candidates become fixes.**

- The written centre lies inside a bay. Then it is offered the nearest legal centre on each side of
  it in that bay that has one. A written centre beyond one end of the legal interval (as in `nib`)
  has one side only: the interval's near end.
- The written centre lies on a meeting wall's body. Then it is offered the nearest legal centre in
  each of the two bays beside it.
- The bay has no legal centre at all. Then it is offered the nearest legal centre in each
  neighbouring bay (the "past a meeting wall" case).
- No legal centre anywhere on the host means no fix, and the hint stays.

A candidate becomes a fix only if its quoted text round-trips. The printed offset (`fmt3`),
evaluated from its anchor and snapped, must give the judged centre, and `judgeLanding` must pass
there (`docs/agents/gotchas.md` § Core, "a hint must quote the position the plan resolves"). A
diagnostic that carries a `file` gets no fix, because `applyFixes` skips an imported module's edits
anyway (`src/fix-apply.ts`). Candidates are not checked against sibling openings resolved later.
The fuzz counts `W_OPENING_OVERLAP` after each move (§9).

Under these rules: `nib` (written 500, in the bay past the ring's faces) gets one alternative, 600.
`nib-tie` (written centre on wall `t`'s body) gets two, 950 and 2050. `flush` gets 500, from the
flush band. `ext-part` (centre 1500 on b's bottom wall at y 1400–1600) gets one alternative, 2100.

**A move that replaces a relation (S1, S2).** When the written position is not a numeric offset
from `start`, `end` or a room edge, the edit replaces a relation with a fixed offset. That covers
`at center`, `at axis <label>`, an expression, and a span that a `for` body or a component's
instances share. The fix's title says so, for example: "replaces `at center` with
`at 2100 from start`: the window no longer follows the edge's centre". When one span is shared by
several diagnostics, the title also says the edit moves every instance. The `E_OPENING_HOST_AMBIGUOUS`
example above (`at center`) is this case.

**Edit shape (the AF2 discipline).** The parser records the span of the whole position clause
(`at …`) on `OpeningBetween` and `OpeningAttach`. `AttachPos` axis and corner already carry spans.
Plan JSON prints positions as text (`src/plan-json/from-json.ts:109-113`), so the new field
serialises nowhere; check it there. The edit replaces that clause alone with
`at <legalText(anchor, s, run)>`. That keeps the author's anchor word (`from b.top`, `from end`) and
leaves every other clause byte for byte.

**Order of alternatives (S3).** The producer emits alternatives nearer first, then by smaller
coordinate. That is not the order consumers apply them in. `rankFixes` (`src/fix-apply.ts:164-175`)
sorts by applicability, then total edit magnitude (bytes removed plus bytes inserted), then the
earliest edit start, and only then by array index. Every AF9 alternative of one diagnostic has the
same tier and the same span, so the **shorter replacement text comes first**. In `nib-tie`,
`at 950 from start` sorts before `at 2050 from start` for that reason, not because it is nearer.
So the hint makes no claim about which alternative is first. When a diagnostic gets two or more
alternatives, the hint lists every one of them with its distance from the written centre (F1's
wording, §8). `arch fix --unsafe` and the LSP's first quick-fix take `rankFixes`' top.

**Step meter.** All of this runs only on a refusal path. Before it runs, it charges one step per
meeting wall to build the bays, and one per candidate judged times `(bodies + js + 1)`
(`chargeSteps`, `docs/agents/gotchas.md` § Core on scaling a charge). Every count is bounded by the
group's walls and openings, which the drawing budget bounds.

## 4. Each diagnostic's remedies

**`E_OPENING_NIB`.** §3. "Narrow it" and "move the meeting wall" are never fixes: rewriting a width
to pass a check is constraint laundering (`pocketRun`'s header, `src/lint/rules/doors.ts:392-396`),
and moving a wall moves other rooms. Those stay in the hint and the catalogue fix. A demolished host,
or a host beside another wall on the line (`ONE_WALL_HINT`), gets no fix: no position resolves
there.

**`E_OPENING_HOST_AMBIGUOUS` on a room edge.** `edgeHints` already finds each exterior body's
nearest position through `hostFit` and the placement check. The fix is that position, per body, as
maybe-incorrect alternatives. Written `at center`, the move replaces the relation, and the title
says so (§3). The run branches of this code (two bodies on a shared run, a polygon pair's several
runs, `open between`) stay hint-only. Each is a choice of wall or run the source does not make
(ADR 0028 §5), and none is EV.5's.

**`E_OPENING_NO_SHARED_WALL`, one partition on a room edge.**

- A door or cased opening whose host is a derived partition with `_derived.between = [a, x]`:
  maybe-incorrect `between a and x` at the position the same words give on that run. The position is
  judged by §3, and there is no fix if it fails. It stands in the same wall, but it changes an
  exterior opening into an interior one. An authored partition names no pair, so it gets no fix.
- A window (§12 Q5): first count the room's exterior edges, the edges that carry an exterior body
  (datum table edges and `bodiesOn`; charged).
  - Exactly one: a maybe-incorrect `on a.<edge>`, judged by §3 with the same position words
    (`judgeLanding`). If those words do not land legally there, it gets the placeholder instead.
  - Two or more: `has-placeholders`. The edge is replaced by `<exterior edge of "a">`, and the title
    lists the edges.
  - None: no fix, since no edge could fill the placeholder.

  Another wall faces another way, which is the author's decision (ADR 0005).
- The other branch of this code (no wall on the run at all, `:937-956`) stays hint-only. Adding a
  wall is not an opening move.

**`E_OPENING_DATUM`.**

- A parallel edge `from <R>.<edge>` (C-par): the edges of the same room `R` that are perpendicular
  to the run and meet it at an end (`runEndMet`). Each is a maybe-incorrect alternative that
  replaces only the datum word (`pos.from.span`), judged by §3 with the written offset. If neither
  is legal (or `R` meets the run at no end), the fallback is `from start` and `from end` the same
  way. With no legal alternative there is no fix. Which end the author measured from is not in the
  source.
- `at <mm>` / `at <pct>%` with no datum (§12 Q6): `has-placeholders`. After an `<mm>`, the fix
  inserts ` from <start or end>`. A `<pct>%` position is replaced by `at <mm> from <start or end>`.
  It is never applied.
- No position (a door or cased opening): `has-placeholders`, ` at <mm> from start` inserted at the
  end of the `between` clause. This is the rustc `HasPlaceholders` case the card names. It is never
  applied.
- An axis parallel to the run, or not crossing it: no fix. Another axis is another datum.

**`W_DOORWAY_BLOCKED`.** Maybe-incorrect only, and only for a door or cased opening placed by a
position the edit can rewrite: `on <wall> at <literal>` (datum forms included), or a relational
form with a literal value. Excluded: `at (x,y)`, an `open between` opening, and an opening drawn by
a placed component (its frame: `LintContext.frameOf`, `docs/agents/gotchas.md` § Core).

The search reuses `clearMove` and `keepouts` (`src/lint/rules/openings.ts:275-363`): run ends,
meeting walls grown by the nib, other openings grown by a mullion, a door's corner nib. It adds one
keep-out per piece whose rectangle reaches into the landing band on either face. Each keep-out is
the piece's extent along the run. The search stays in the door's bay. At each moved position the
rule's own predicate (`blockedApproach`) and `W_SWING_OBSTRUCTED`'s sector check are both asked
again, and a direction is offered only when both are clear there. That is `dimSwapFix`'s lesson
(`src/fix-producers.ts:432`): a fix that leaves a warning standing makes `arch fix` ping-pong. When
both directions clear at equal distance, both are offered. `repair` keeps the furniture moves
(ADR 0011 §5).

In `blocked.arch` the door at 3000 must clear the WC's 2800–3200, so the candidates are 2400 and
3600, equally near. Only **2400** is offered. Lint of the door at 2400 gives only
`W_ROOM_MISSING_DEFINING`. At 3600 the door still lints `W_SWING_OBSTRUCTED`, so that direction is
dropped (both measured 2026-11-19 with `arch lint --json` on this branch's base). Lint has no step
meter. This search is bounded by `2 × (pieces + openings + walls on the host) + 4` iterations per
blocked door (`clearMove`'s own bound).

## 5. The AF8 table and AF2's discipline

New rows in `FIX_PRODUCERS` (`src/fixable-codes.ts`), one code per row
(`test/fixable-codes.test.ts`). Every applicability literal sits inside its producer function. The
`when` texts carry no ", " (`capabilities.md` splits its list on it; AF2 #978 `db72d3c0`):

| Producer | Stage | Tiers | Codes → fixId |
|---|---|---|---|
| `src/fix-producers.ts#openingMoveFix` | compile | MI | `E_OPENING_NIB`, `E_OPENING_HOST_AMBIGUOUS` → `opening-move` |
| `src/fix-producers.ts#exteriorEdgeFix` | compile | MI, HP | `E_OPENING_NO_SHARED_WALL` → `opening-exterior-edge` |
| `src/fix-producers.ts#openingDatumFix` | compile | MI, HP | `E_OPENING_DATUM` → `opening-datum` |
| `src/lint/doorway-move.ts#doorwayMoveFix` | lint | MI | `W_DOORWAY_BLOCKED` → `doorway-move` |

The lint producer lives in a lint-only module, not in `src/fix-producers.ts`. That file is imported
by element modules and sits on the compiler path. A function only lint calls would still ride in
that chunk, because chunks split by module (§7).

Every tier needs a plan that reaches it, or the output check fails ("a declared code|applicability no
plan reaches"). The catalogue examples reach `E_OPENING_NIB` MI and `E_OPENING_DATUM` HP (its example
writes no position). The rest get `REACH` plans: the §2 plans.

AF2's discipline, applied:

- the narrowest span that carries the change (the position clause, or the datum word);
- every open choice is maybe-incorrect: an alternative side, wall or end. Here there is always one
  (§1), so nothing is machine-applicable;
- imported-module provenance is honoured (`file`);
- one bounded, pre-charged search.

## 6. Consumers, and L1

- **`arch fix`** (`src/cli/commands-author.ts:285-330`) reads compile **and** lint diagnostics. For
  each one it takes the top of `rankFixes` (`src/fix-apply.ts:164`; order in §3). It applies
  maybe-incorrect fixes only with `--unsafe`. It rolls back a pass that raises the error count or
  breaks a hard keep. `has-placeholders` is never applied. Without `--unsafe`, AF9 changes nothing
  `arch fix` does.
- **MCP `fix`** (`packages/mcp/src/tools.ts:760-790`) reads **compile** diagnostics only, and does
  **not** call `rankFixes`. With several alternatives on one diagnostic and `unsafe:true`, it
  applies the first by array order and reports the next as skipped ("overlaps an earlier fix"). AF9
  is the first producer to emit more than one alternative per diagnostic (F3). Making MCP `fix` and
  L1 call `rankFixes` is a separate small card (§12 Q3). The doorway move (lint) never reaches MCP
  `fix`.
- **LSP** shows every alternative as a quick-fix, in `rankFixes` order. None is a preferred action,
  because none is machine-applicable.
- **L1** (`eval/l1.ts:45-60`, `l1Pipeline`) applies compile-stage machine-applicable fixes only.
  **AF9 emits no machine-applicable fix, so L1 cannot move.** No L1 number is reported or claimed,
  and the offline gates that reach `l1Pipeline` (`test/fault-injection.test.ts` directly,
  `test/eval-offline.test.ts` through `l1Row`) must stay byte-stable.

## 7. Byte-identity and size

**What may move.** Only the output of plans that already fail with one of the four compile codes,
or are warned with `W_DOORWAY_BLOCKED`. No SVG moves anywhere. `describe()` does not move. A plan
that raises none of the five codes is byte-identical in SVG, `describe()`, `lint()`,
`compile().diagnostics` and evaluation steps. The judge refactor keeps the success path's
operations and charges in order, and every new charge is on a refusal path.

**What will move, by design.** Each row is explained field by field and proved by swap-back. Put
main's producers back, and the old digest must return.

- The step-digesting rows of failing inline plans. `inline:door-refusals`
  (`test/helpers/rectilinear-rooms-law.ts:107`) writes `d4` (no position), `d5` (`at 800`), `d6`
  (`500 from a.left`, parallel) and `d7` (`100 from start`, nib). It sits in the tables of
  `test/rectilinear-rooms-byte-identity.test.ts`, `test/block-stair-byte-identity.test.ts`,
  `test/corner-window-byte-identity.test.ts`, `test/floor-materials-byte-identity.test.ts`,
  `test/gaps-byte-identity.test.ts` and the other suites that list it (AF2 moved the same rows the
  same way). Also `refused` in `test/openings-between-digests.test.ts`. Those rows gain `fixes`, and
  their refusal paths charge more steps.
- `lint()` of the seven `W_DOORWAY_BLOCKED` plans (§2) gains `fixes` on that warning, where a fix
  is offered. Any K1 keep row built from them is re-taken with `npx tsx test/keep-weak-law-gen.ts
  "<reason>"`, never hand-merged.
- Catalogue prose: `E_OPENING_NIB`, `E_OPENING_DATUM`, `E_OPENING_NO_SHARED_WALL` and
  `W_DOORWAY_BLOCKED` say a fix is attached, and when. Regenerate with `gen:*`:
  `src/error-catalog-fixes.ts`, `docs/error-codes.md`, `packages/mcp/capabilities.md`.
  `test/lint-fix-texts.test.ts` wakes for these.

A moved row outside that list is a finding, not a re-pin.

**Size.** Three budgets in `playground/e2e/startup-chunks.baseline.json` bound this work:

| Budget | Ceiling | Main after AF4 (coordinator's figure, not measured here) | Headroom |
|---|---|---|---|
| `firstUsePathBudget` | 468,000 B | about 459,991 B | about 8,000 B |
| `compilerPathBudget` | 333,000 B | about 327,813 B | about 5,200 B |
| `embedPathBudget` | 319,000 B | about 314,004 B | about 5,000 B |

AF4 had not landed when this was written, so the code PR re-reads all three on its base. The three
compile producers ride the compiler chunk, which all three paths share. A compile-stage fix cannot
live in a lazy chunk, because `compile()` is synchronous and returns its fixes. The doorway search
sits in lint. EB.2 moved lint off the compiler chunk into the `first-use` chunk, so the search costs
the compiler and embed paths 0 B, but **it does count against `firstUsePathBudget`**. This note
gives no byte estimate: nothing was built to measure one. The compile-path cost is kept small
anyway: the judge is moved, not copied; the bays and the round-trip are short; titles reuse the hint
text. **Stop rule:** the code PR reports CI's `startup-chunks` numbers for all three paths before and
after. If any path grows by more than half its headroom on the PR's base, it stops and reports with
numbers. No ceiling is raised to fit (`REVIEW.md`).

## 8. Hint corrections (failing plans only)

- **F1, several alternatives.** When a refusal gets two or more alternatives, `nibRefusal`'s hint
  names each with its distance ("Two positions are equally near: … and …" on a tie) instead of one
  picked by coordinate. The order in the hint is the producer's (nearer first). The hint does not
  say which one `arch fix --unsafe` takes (§3).
- **F2, flush.** For a cased opening, `nearestLegal` adds the flush band, so the quoted position is
  the nearest legal one (500 in `flush.arch`, not 600).
- **C-ext, a window.** It gets a hint that does not offer `between` (§2).

These change only the messages and hints of plans that already fail, which are pinned where they
live, as AF2's were.

## 9. Test plan

1. **Public fixtures** (`test/opening-moves.test.ts`): the §2 plans, each asserting the code, the
   tier, the edit's exact span and text, and that **pasting** the edit compiles with the diagnostic
   gone and the opening at the quoted centre on the same host (§3). The catalogue entries gain the
   fixed text their fix produces. AF5's `fixed` column picks it up when AF5 lands.
2. **Oracle by a different shape.** For each fixture, and for seeded perturbations of it, an
   independent brute force writes the position at every grid point of the run (1 mm with no grid;
   at most 4,000 points, the run's length). It compiles each with `compile()` and keeps the ones
   that resolve. The nearest legal centre on each side within the bay is read from that set, never
   from `nearestLegal`. Every offered alternative must be in that set and be the nearest on its side.
   Every tie must surface as alternatives, and no legal side may be missing. Jittered room sizes,
   odd grids and free host ends are included, because an exact lattice hides float noise
   (`docs/agents/gotchas.md` § Core).
3. **Fuzz over the corpus** (as AF2 did). The sources are the §2 scan's five directories
   (`examples/`, `test/fixtures/`, `test/walls-from-rooms/`, `eval/faults/`, `eval/goldens/`,
   recursive) and every digest table's inline plans. For every relational or hosted opening in them,
   shift its position by ±50, ±150 and ±400 mm, and onto each meeting wall's centre. Collect every
   fix and apply each maybe-incorrect one **alone**. Required, for every one:
   - the diagnostic is gone;
   - the error count falls;
   - the opening lands on the predicted centre and host, between the same rooms (`describe()`'s
     `between`);
   - a second `arch fix --unsafe` pass on its own diagnostic changes nothing.

   A fix that cannot meet these is not offered. The fuzz also counts, without failing, the new lint
   warnings on moved openings: `W_OPENING_AT_JUNCTION`, `W_OPENING_OVERLAP`, `W_DOOR_NEAR_CORNER`,
   `W_CONNECTOR_AMBIGUOUS`, `W_SWING_OBSTRUCTED`, `W_DOORWAY_BLOCKED` and `W_HOB_UNDER_WINDOW` (the
   red team's B1 and B2 kinds). The counts go in the PR body. Seeded, with the case count bounded at
   PR scale and widened by `FC_SCALE` in `fuzz-deep`.
4. **Byte-identity law** (`test/af9-byte-identity.test.ts`). SHA-256 of SVG, `describe()`, `lint()`,
   `compile().diagnostics` and steps over every shipped plan and every digest table's inline plans:
   unchanged for each plan that raises none of the five codes. The moved rows of §7 are re-pinned in
   the PR with their reasons and swap-back evidence.
5. **AF8.** The new rows, and `REACH` plans for each code and tier. Plants: the source check must go
   red on a producer whose tier is set outside its function, and on any AF9 row that declares MA.
6. **Bound.** A plan with many meeting walls and refused openings near the step limit returns
   `E_STEP_LIMIT` deterministically, never a hang. The refusal path's charges are pinned.
7. **Size.** CI's `startup-chunks` e2e, all three paths, held to §7's stop rule.

## 10. Open questions for the coordinator (ruled in §12; Q1, Q2 and Q8 revised)

1. **Phase B at all?** May a refused relational opening's single bay-nearest position be
   machine-applicable (ADR 0011's bar)? Or do the lint precedent (`src/lint/rules/openings.ts:21`,
   "no fix is machine-applicable") and ADR 0028 §5's "never slid" keep every move maybe-incorrect?
   The first draft recommended yes. The revised ruling is no (§12).
2. **What "AF9 may move no L1 number" means.** Read as "makes no L1 claim", a machine-applicable
   tier would be allowed. Read as "must not change L1 output", AF9 has no machine-applicable tier.
3. **Several alternatives per diagnostic.** AF9 is the first producer to emit them (ties, the two
   sides of a meeting wall, two datum words). Should MCP `fix` call `rankFixes` as `arch fix` does?
   That would be a separate small card, `packages/mcp/src/tools.ts:770-777`. L1 needs nothing,
   because no diagnostic carries two machine-applicable fixes. The alternative is for AF9 to emit
   only the first alternative.
4. **Furniture in a moved door's new swing or landing.** `compile()` cannot see furniture where it
   raises the refusal, and checking it there would put swing geometry on the compiler path.
5. **A window on a single partition edge.** Maybe-incorrect to the room's one exterior edge (§4), or
   always the skeleton? Recommendation: maybe-incorrect only when exactly one edge takes it.
6. **Scope beyond the parallel edge.** Should AF9 also give fixes to `E_OPENING_DATUM`'s other two
   cases, no position and a position with no datum? They use the same code and the same raise
   function, and have no L1 effect. Keep them in AF9, or card them apart?
7. **Hint corrections F1 and F2.** These are message changes on failing plans (§8). Ship them with
   AF9, or as a separate fix?
8. **The ADR line.** Should a machine-applicable tier add a one-line amendment under ADR 0028 §5, or
   is this note enough?

## 11. Findings while designing

- **F1.** The nib hint presents one of two equally near positions as "the nearest"
  (`src/opening-relation.ts:1466`; `nib-tie`: 950 quoted, 2050 as near).
- **F2.** `nearestLegal` never proposes a cased opening's flush jamb (within `FLUSH_MM`, 0.5 mm, of
  a face), so for a cased opening its "nearest legal position" can be farther than one that compiles
  (`flush`: 600 quoted, 500 compiles).
- **F3.** MCP `fix` and L1 apply every alternative of a diagnostic in array order, without
  `rankFixes` (`packages/mcp/src/tools.ts:770-777`, `eval/l1.ts:51`). This is harmless while every
  producer emits one fix per diagnostic.
- **F4.** For `blocked.arch`, `arch repair` cannot clear the doorway: the WC cycles between two
  positions. The catalogue's other remedies (shrink the piece, move it by hand, move the door) stay
  open. The door move is the one AF9 can turn into an edit, and today it is only a hint.

## 12. Rulings (RM-D70, revised; coordinator, 2026-11-19 UTC)

The coordinator ruled on the eight questions of §10 on 2026-11-19. After a red-team round on
this note the same day, it revised Q1, Q2 and Q8. The coordinator records RM-D70 in
`../product-roadmap/README.md` §6. The owner delegated these rulings for this session and can
overturn any of them. The text above follows them.

1. **Q1, phase B: no (revised).** AF9 is phase A only: placeholder skeletons and maybe-incorrect
   moves. No move is machine-applicable. Reasons: ADR 0011 ("the *moment* there is a choice, it
   emits `maybe-incorrect`"); `E_OPENING_NIB`'s catalogue fix lists three remedies; ADR 0028 §5
   ("The nib is enforced, never slid"); and the red team's B1 and B2, unique-nearest moves that are
   still wrong (§1). §3 is a candidate search, not a proof of machine-applicability. Phase B is
   **not planned**. It would need an owner decision and an ADR 0011/0028 amendment.
2. **Q2, L1 (revised):** AF9 emits no machine-applicable fix, so L1 cannot move. No L1 number is
   reported. (The earlier "offline L1 numbers" text is gone: offline L1 does not exist, because
   `--l1` requires `--live` (`eval/run.ts:1072-1073`), which is paid and owner-only.)
3. **Q3, several alternatives: yes, a separate small card.** MCP `fix` and L1 call `rankFixes`.
4. **Q4, furniture: no check inside `compile()`.** With no machine-applicable tier there is nothing
   to demote. The fuzz counts the swing and landing warnings on moved doors (§9 item 3).
5. **Q5, a window on a single partition edge:** a maybe-incorrect move when the room has exactly
   one exterior edge; otherwise the placeholder (§4).
6. **Q6, `E_OPENING_DATUM`'s no-position and no-datum cases: yes, kept in AF9, as placeholders**
   (§4).
7. **Q7, F1 and F2: yes**, shipped with AF9 (§8).
8. **Q8, the ADR line: no (revised).** No ADR changes, because nothing is machine-applicable.
