# AF9 design: moves and skeletons for refused openings and blocked doorways

Design note for card AF9 (track 10 of `../product-roadmap/cards.md`; design row in `README.md` §7
Wave B), written 2026-11-20 to meet EV.5's gate (`docs/backlog.md` § EV.5: "a design note in the
card or an ADR before code"). **No code changes here.** `file:line` anchors are `main@cc1709bf`;
re-read them before building.

Bounds: ADR 0005 (the core never chooses among valid placements), ADR 0011 (four tiers;
machine-applicable only on proof of uniqueness), ADR 0028 §5 ("the nib is enforced, never slid";
the refusal names the nearest legal position).

## 0. Decisions in one table

| Diagnostic (raise site) | Placeholder skeleton (`has-placeholders`) | Maybe-incorrect move | Machine-applicable move |
|---|---|---|---|
| `E_OPENING_NIB` (`nibRefusal`, `src/opening-relation.ts:1045`) | none (no legal position: "narrow it" is never a fix) | two equally near positions; a position past a meeting wall; an expression, an axis, a component or a loop; another opening within a mullion | phase B only: the one nearest legal centre **in the bay the written centre lies in**, on the host the clause names (§3) |
| `E_OPENING_HOST_AMBIGUOUS`, room-edge branch (`refusalOnEdge`, `:1316`) | none | each exterior body's nearest position (`edgeHints`, `:1364`) when two or more fit, or one fits past a meeting wall | phase B only: one exterior body takes it, and in the written centre's bay (§3) |
| `E_OPENING_NO_SHARED_WALL`, partition branch (`placeOnRun`, `:990-1001`) | a window: `on <exterior edge of "a">` when the room has two or more exterior edges | a door or opening on a derived partition: `between <room> and <other room>` (same wall); a window: the room's one exterior edge | never: it changes the wall |
| `E_OPENING_DATUM` (`positionOnRun`, `:686-760`) | no position written: ` at <mm> from start` inserted | a parallel edge: each edge of the **same room** that meets the run at an end (`a.left` becomes `a.top` or `a.bottom`); `at <mm>` with no datum: `at <mm> from start` | never: which end the author meant is not in the source |
| `W_DOORWAY_BLOCKED` (`doorwayBlocked`, `src/lint/rules/doors.ts:282`) | none | the door moved along its own bay until its landing misses every piece (both directions when they tie) | never: which one moves, the door or the piece, is a design decision |

Phase A (one code PR) ships the skeletons and every maybe-incorrect move, plus the three hint
corrections in §8. Phase B (a later PR, after a ruling on §10 Q1 and Q2) promotes the two
machine-applicable rows. Phase A cannot move any L1 number (§6).

## 1. A design note, not an ADR

No ADR-level contract changes:

- `compile()` still refuses. ADR 0028 §5's "the nib is enforced, never slid" binds the compiler, and
  ADR 0011 §1 makes a fix data that never changes what `compile()` renders.
- The machine-applicable bar is ADR 0011's own: one candidate, proved unique. Its accepted example,
  the off-wall opening's single nearest wall (`offWallFix`, `src/fix-producers.ts:218`), is a
  nearest-position fix of the same kind. The refusal already prints this position in its hint
  (`placeOnRun`, `src/opening-relation.ts:1025-1038`). AF9 turns the printed text into an edit.
- ADR 0011 §5 (fix edits text, repair searches space) holds. Every candidate is a closed-form
  endpoint of an interval on one run. There is no iteration to a fixpoint. Furniture stays
  `repair`'s.

One precedent leans the other way. `src/lint/rules/openings.ts:16-21` says of
`W_OPENING_AT_JUNCTION`'s move hints: "No fix is machine-applicable: every remedy moves something
the author placed, and there are always at least two (either direction, or the other wall)." That
rule is about hand-placed openings that compile. A refused relational opening draws nothing, and its
relation fixes the run, so "the other wall" does not exist. The bay rule (§3) also removes "either
direction" in the machine-applicable case. That is why phase B is a ruling (§10 Q1), not a
default. If the ruling makes phase B an ADR matter, the amendment is one dated line under ADR 0028
§5: "A refusal's nearest position is also carried as a fix; it is machine-applicable only under
`docs/plans/ai-first-language/af9-design.md` §3."

## 2. The diagnostics in scope, reproduced

Every plan below was compiled on 2026-11-20 with `npx tsx src/cli.ts compile <file>` from this
branch's base (`main@cc1709bf`). The plans live in the executor's scratch folder and are copied into
the tests in phase A (§9). Each body is wrapped in `plan "<name>" { … }`. Output is quoted as
printed. The `= fix:` catalogue line is cut where it is long.

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
SVG)`. A cased opening's flush jamb is legal (`nibFault`, `:1392`, `flushOk && nib <= FLUSH_MM`).
Centre 500 is 50 mm from the written 450, and the hint quotes 600, 150 mm away. See finding F2.

**C-ext, `E_OPENING_NO_SHARED_WALL`** (EV.1: 1 of 7). `ext.arch`: the same rooms,
`window on a.right width 1200`:

```text
error[E_OPENING_NO_SHARED_WALL]: Window "window_1" needs an exterior wall on `on a.right`, but the wall there is the partition between "a" and "b", a partition: the edge is shared with another room
  --> 5:10
  = help: Place it `between <room> and <room>` for an opening into the neighbouring room, or on an edge of the room that faces outside.
```

For a window the first half of that help cannot apply, because `between` takes a door or a cased
opening only. Phase A gives a window its own hint (§8).

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
"wc" leaves 50 mm (250 mm short)") with three hints and no `fixes`. `arch repair --json` moves the WC
to `(2800,100)` and leaves it in `unresolved`: "it cycles between 2 positions ((2800,400) ↔
(2800,100)); parked on the lowest of them, adjust manually". Moving the door is the remaining
remedy. It is offered only as a hint today.

**What the corpus raises today.** A read-only scan with `compile()` + `lint()` over 112 plans
(`examples/`, `test/fixtures/`, `test/walls-from-rooms/`, `eval/faults/`, `eval/goldens/`, recursive)
found no plan that raises any of the four compile codes. Shipped plans compile. Seven plans raise
`W_DOORWAY_BLOCKED`:
`test/fixtures/off-path-bypass.arch`, `test/fixtures/gaps/gaps.arch`,
`eval/faults/blocked-doorway.arch`, `eval/faults/combined.arch`, `eval/goldens/compact-studio.arch`,
`eval/goldens/dims-auto-cottage.arch`, `eval/goldens/galley-kitchen.arch`. Those are the plans
whose `lint()` output phase A moves (§5). The scan was top-level plus subfolders of those five
directories only. Phase A re-runs it over every digest table's inline plans too
(`docs/agents/gotchas.md` § PRs & CI).

## 3. "Legal", "nearest" and the machine-applicable proof

**Legal** means the placement passes the same checks `placeOnRun` runs (`src/opening-relation.ts:920-1040`).
It is not a lookalike:

1. the position is snapped by `ctx.snapPt`, and the snapped point is the one judged;
2. its span lies on one body (`bodiesUnder` is 1 where the run carries several), and an exterior
   body on a room edge;
3. the host is not `status demolish` and is not voided by `open between`;
4. `nibFault` is null on that host (run ends, meeting walls grown by `max(100, t/2)`, and the flush
   exemption for a cased opening).

Phase A moves that sequence, unchanged, into one pure judge, `judgeLanding(c, …) → fault | null`.
Both the written position and each candidate are judged by it. Moved-function hazard: diff the moved
body against `placeOnRun:961-1040` and keep every charge and float operation in its order.

**Bays.** The bodies of the meeting walls on the host (`hostFit(...).js`) cut the host's extent
`[R0, R1]` into bays. A move stays in a bay: it never jumps over a wall that meets the run. This is
how "never across a room boundary" is written here. On `between A and B` the run is the pair's
shared edge, so both faces keep the same two rooms. A meeting wall inside a room (wall `t` in
`nib-tie`) still divides it physically, and crossing it is a choice. On `on <room>.<edge>` the inside
face stays in the named room, and the host stays an exterior body.

**Candidates.** In a bay `(b0, b1)` the legal centres are the interval
`[b0 + need + w/2, b1 − need − w/2]`. For a cased opening they also include the two flush points
`b0 + w/2` and `b1 − w/2`, which `nearestLegal` omits today (F2). On a grid each interval end
rounds inward to the grid. An interval with no grid point is empty.

**Machine-applicable (phase B) requires every one of these:**

- the written centre lies strictly inside a bay, not inside a meeting wall's body;
- that bay has a legal centre, and exactly one is nearest to the written centre: no tie in
  distance, exact on the grid lattice and within `JUNCTION_EPS` off it;
- the quoted text round-trips: the printed offset (`fmt3`), evaluated from its anchor and snapped,
  gives the judged centre, and `judgeLanding` passes there (`docs/agents/gotchas.md` § Core, "a hint
  must quote the position the plan resolves");
- the position is a numeric literal (or `center`) measured from `start`, `end` or a room edge. An
  expression, `axis <label>` or anything evaluated more than once is maybe-incorrect. "More than
  once" means the same edit span is proposed by two diagnostics of one compile (a `for` body, a
  component's instances), or the diagnostic carries `instance`/`component`;
- no other opening on that host (placed, or another candidate of this compile) comes within
  `minMullionMm` (100 mm, the ruleset default; `compile()` reads no profile, as for the nib) of the
  moved span. This is `W_OPENING_OVERLAP`'s measure;
- the diagnostic carries no `file`. A fix in an imported module is skipped by `applyFixes` anyway
  (`src/fix-apply.ts`).

Sibling openings resolve after or before the refused one, in registry order. The last two checks
therefore run in a post-pass at the end of the group's resolve (`resolveGroup`, `src/ir.ts:1223`), over
the group's pending candidates. Diagnostics are plain objects in the resolve's list until `compile()`
returns, so the post-pass sets each pending fix's tier before they are emitted. Order is unchanged
(ADR 0028 §1).

Under these rules: `nib` (written 500, bay 100–2900 past the faces, unique nearest 600) is
machine-applicable. `nib-tie` (written centre on wall `t`'s body) gives two maybe-incorrect
alternatives. `flush` gives 500, machine-applicable. `ext-part` (centre 1500 on b's bottom wall at
y 1400–1600) gives one maybe-incorrect alternative. The same window written `at 1700 from start`
would be machine-applicable at 2100.

**Edit shape (the AF2 discipline).** The parser records the span of the whole position clause
(`at …`) on `OpeningBetween` and `OpeningAttach`. `AttachPos` axis and corner already carry spans.
Plan JSON prints positions as text (`src/plan-json/from-json.ts:109-113`), so the new field
serialises nowhere; check it there. The edit replaces that clause alone with
`at <legalText(anchor, s, run)>`. That keeps the author's anchor word (`from b.top`, `from end`) and
leaves every other clause byte for byte.

**Step meter.** All of this runs only on a refusal path. Before it runs, it charges one step per
meeting wall to build the bays, one per candidate judged times `(bodies + js + 1)`, and one per
pending candidate times openings on the host in the post-pass (`chargeSteps`,
`docs/agents/gotchas.md` § Core on scaling a charge). Every count is bounded by the group's walls
and openings, which the drawing budget bounds.

## 4. Each diagnostic's remedies

**`E_OPENING_NIB`.** §3. When no legal centre exists in any bay, there is no fix and the hint stays.
"Narrow it" and "move the meeting wall" are never fixes: rewriting a width to pass a check is
constraint laundering (`pocketRun`'s header, `src/lint/rules/doors.ts:392-396`), and moving a wall
moves other rooms. A centre on a meeting wall's body, or a legal centre only past a meeting wall,
gives one maybe-incorrect alternative per side that has one. Order: nearer first, then the smaller
coordinate, so the first alternative is the one the hint names. A demolished host, or a host beside
another wall on the line (`ONE_WALL_HINT`), gets no fix: no position resolves there.

**`E_OPENING_HOST_AMBIGUOUS` on a room edge.** `edgeHints` already finds each exterior body's
nearest position through `hostFit` and the placement check. The fix is that position, per body:
maybe-incorrect alternatives in body order. In phase B it is machine-applicable when exactly one body
takes it and §3 holds. The run branches of this code (two bodies on a shared run, a polygon pair's
several runs, `open between`) stay hint-only. Each is a choice of wall or run the source does not
make (ADR 0028 §5), and none is EV.5's.

**`E_OPENING_NO_SHARED_WALL`, one partition on a room edge.**

- A door or cased opening whose host is a derived partition with `_derived.between = [a, x]`:
  maybe-incorrect `between a and x` at the position the same words give on that run. The position is
  judged by §3, and there is no fix if it fails. It stands in the same wall, but it changes an
  exterior opening into an interior one, so it is never machine-applicable. An authored partition
  names no pair, so it gets no fix.
- A window: the room's edges that carry an exterior body where the same position words land
  legally (datum table edges, `bodiesOn`, `judgeLanding`; charged). With exactly one, it is a
  maybe-incorrect `on a.<edge>`. With two or more, it is `has-placeholders`: the edge is replaced by
  `<exterior edge of "a">`, and the title lists them. With none, there is no fix. Never
  machine-applicable: another wall faces another way, which is the author's decision (ADR 0005).
- The other branch of this code (no wall on the run at all, `:937-956`) stays hint-only. Adding a
  wall is not an opening move.

**`E_OPENING_DATUM`.**

- A parallel edge `from <R>.<edge>` (C-par): the edges of the same room `R` that are perpendicular
  to the run and meet it at an end (`runEndMet`). Each is a maybe-incorrect alternative that
  replaces only the datum word (`pos.from.span`), judged by §3 with the written offset. If neither
  is legal (or `R` meets the run at no end), the fallback is `from start` and `from end` the same
  way. With no legal alternative there is no fix. Which end the author measured from is not in the
  source, so this is never machine-applicable.
- `at <mm>` / `at <pct>%` with no datum: maybe-incorrect ` from start` inserted after an `<mm>`,
  read the way `on <wall> at <mm>` reads; `<pct>%` gets no fix.
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
the piece's extent along the run. The search stays in the door's bay. The rule's own predicate
(`blockedApproach`) is re-asked at the moved position, along with `W_SWING_OBSTRUCTED`'s sector
check, and the fix is offered only when both are clear. That is `dimSwapFix`'s lesson
(`src/fix-producers.ts:432`): a fix that leaves the warning standing makes `arch fix` ping-pong.
Equal distances give both directions as alternatives. It is never machine-applicable. The catalogue
already lists three remedies (move the piece, shrink it, move the door), and which one is right is
a design decision, as `W_LEAF_ACROSS_DOORWAY`'s entry says for its own (`src/error-catalog/circulation.ts:80-83`).
`repair` keeps the furniture moves (ADR 0011 §5).

In `blocked.arch` the door at 3000 must clear the WC's 2800–3200, so it moves to 2400 or 3600. They
are equally near, so both are offered. Lint has no step meter. This search is bounded by
`2 × (pieces + openings + walls on the host) + 4` iterations per blocked door (`clearMove`'s own
bound).

## 5. The AF8 table and AF2's discipline

New rows in `FIX_PRODUCERS` (`src/fixable-codes.ts`), one code per row
(`test/fixable-codes.test.ts`). Every applicability literal sits inside its producer function. The
`when` texts carry no ", " (`capabilities.md` splits its list on it; AF2 #978 `db72d3c0`):

| Producer | Stage | Tiers | Codes → fixId |
|---|---|---|---|
| `src/fix-producers.ts#openingMoveFix` | compile | phase A: MI; phase B: MA, MI | `E_OPENING_NIB`, `E_OPENING_HOST_AMBIGUOUS` → `opening-move` |
| `src/fix-producers.ts#exteriorEdgeFix` | compile | MI, HP | `E_OPENING_NO_SHARED_WALL` → `opening-exterior-edge` |
| `src/fix-producers.ts#openingDatumFix` | compile | MI, HP | `E_OPENING_DATUM` → `opening-datum` |
| `src/lint/doorway-move.ts#doorwayMoveFix` | lint | MI | `W_DOORWAY_BLOCKED` → `doorway-move` |

The lint producer lives in a lint-only module, not in `src/fix-producers.ts`. That file is imported
by element modules and sits on the compiler path. A function only lint calls would still ride in
that chunk, because chunks split by module (§7).

Every tier needs a plan that reaches it, or the output check fails ("a declared code|applicability no
plan reaches"). The catalogue examples reach `E_OPENING_NIB` MI (phase A) and `E_OPENING_DATUM` HP
(its example writes no position). The rest get `REACH` plans: the §2 plans.

AF2's discipline, applied:

- the narrowest span that carries the change (the position clause, or the datum word);
- machine-applicable only for a single candidate in a closed set. Here the set is the bay's legal
  centres, computed from the source and proved unique;
- every open choice is maybe-incorrect: an alternative side, wall or end;
- imported-module provenance is honoured (`file`);
- one bounded, pre-charged search.

## 6. Consumers, and the L1 statement

- **`arch fix`** (`src/cli/commands-author.ts:285-330`) reads compile **and** lint diagnostics. For
  each one it takes the top of `rankFixes` (`src/fix-apply.ts:164`). It applies machine-applicable
  fixes by default, and maybe-incorrect ones with `--unsafe`. It rolls back a pass that raises the
  error count or breaks a hard keep. `has-placeholders` is never applied.
- **MCP `fix`** (`packages/mcp/src/tools.ts:760-790`) reads **compile** diagnostics only, and does
  **not** call `rankFixes`. With several alternatives on one diagnostic and `unsafe:true`, it
  applies the first by array order and reports the next as skipped ("overlaps an earlier fix"). AF9
  is the first producer to emit more than one alternative per diagnostic (F3, §10 Q3). The doorway
  move (lint) never reaches it.
- **LSP** shows every alternative as a quick-fix. A lone machine-applicable fix is the preferred
  action.
- **L1** (`eval/l1.ts:50-60`) applies compile-stage machine-applicable fixes only, with no
  `rankFixes`. **Phase A moves no L1 number**: it adds no machine-applicable fix. **Phase B can**: a
  draft that hits a refusal with a unique bay-nearest position would heal one step further. Nothing
  is claimed either way (`docs/agents/iron-laws.md` eval bounds; no live run is proposed). Phase B
  re-runs the offline gates that call `l1Pipeline` (`test/fault-injection.test.ts`,
  `test/eval-offline.test.ts`, `test/dataset.test.ts` § e's in-repo regeneration). It adds an
  `eval/faults/` fixture for the nib refusal, so the gate proves the healed plan compiles and is a
  fixpoint. The published dataset bytes are not regenerated (`.claude/rules/eval-dataset.md`).

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
  is proved. Any K1 keep row built from them is re-taken with `npx tsx test/keep-weak-law-gen.ts
  "<reason>"`, never hand-merged.
- Catalogue prose: `E_OPENING_NIB`, `E_OPENING_DATUM`, `E_OPENING_NO_SHARED_WALL` and
  `W_DOORWAY_BLOCKED` say a fix is attached, and when. Regenerate with `gen:*`:
  `src/error-catalog-fixes.ts`, `docs/error-codes.md`, `packages/mcp/capabilities.md`.
  `test/lint-fix-texts.test.ts` wakes for these.

A moved row outside that list is a finding, not a re-pin.

**Size.** `compilerPathBudget` is 333,000 B (`playground/e2e/startup-chunks.baseline.json:7`). The
coordinator puts the path near 327 KB; this note did not measure it. A compile-stage fix cannot live
in a lazy chunk, because `compile()` is synchronous and returns its fixes. The compile-path cost is
therefore kept small: the judge is moved, not copied; the bays, the round-trip and the post-pass
are short; titles reuse the hint text. Target: at most 1,500 B on the path, as CI's
`startup-chunks` e2e measures it. **Stop rule:** over 2,000 B, stop and report with numbers. The
ceiling is never raised to fit (`REVIEW.md`). The doorway search sits in lint, which EB.2 moved
off the compiler path, so it costs the path 0 B.

## 8. Hint corrections (phase A, failing plans only)

- **F1, the tie.** On a tie, `nibRefusal`'s hint names both positions ("Two positions are equally
  near: … and …") instead of one picked by coordinate.
- **F2, flush.** For a cased opening, `nearestLegal` adds the flush candidates, so the quoted
  position is the nearest legal one (500 in `flush.arch`, not 600).
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
   that resolve. "Nearest in the bay" and "unique" are read from that set, never from
   `nearestLegal`. Every machine-applicable fix must equal the brute force's unique answer, and
   every tie must surface as alternatives. Jittered room sizes and odd grids are included, because
   an exact lattice hides float noise (`docs/agents/gotchas.md` § Core).
3. **Fuzz over the corpus** (as AF2 did). For every relational or hosted opening in `examples/`,
   `test/fixtures/`, `eval/goldens/` and the digest tables' inline plans, shift its position by
   ±50, ±150 and ±400 mm, and onto each meeting wall's centre. Collect every fix and apply each
   machine-applicable one **alone**. Required: **zero wrong machine-applicable fixes**. Wrong means
   any of these:
   - the diagnostic remains;
   - the error count does not fall;
   - the opening lands off the predicted centre or host, or between other rooms (`describe()`'s
     `between`);
   - `lint()` reports `W_OPENING_AT_JUNCTION`, `W_OPENING_OVERLAP`, `W_DOOR_NEAR_CORNER` or
     `W_CONNECTOR_AMBIGUOUS` on it;
   - a second `arch fix` pass changes the source.

   Every maybe-incorrect fix applied alone must also remove its diagnostic. A fix that cannot help
   is not offered. The fuzz also counts, without failing, new `W_SWING_OBSTRUCTED` and
   `W_DOORWAY_BLOCKED` on moved doors (§10 Q4). Seeded, with the case count bounded at PR scale and
   widened by `FC_SCALE` in `fuzz-deep`.
4. **Byte-identity law** (`test/af9-byte-identity.test.ts`). SHA-256 of SVG, `describe()`, `lint()`,
   `compile().diagnostics` and steps over every shipped plan and every digest table's inline plans:
   unchanged for each plan that raises none of the five codes. The moved rows of §7 are re-pinned in
   the PR with their reasons and swap-back evidence.
5. **AF8.** The new rows, and `REACH` plans for each code and tier. Plants: the source check must go
   red on a producer whose tier is set outside its function, and on a row that declares MA in phase
   A.
6. **Bound.** A plan with many meeting walls and refused openings near the step limit returns
   `E_STEP_LIMIT` deterministically, never a hang. The refusal path's charges are pinned.
7. **Size.** CI's `startup-chunks` e2e, held to §7's stop rule.

## 10. Open questions for the coordinator

1. **Phase B at all?** May a refused relational opening's single bay-nearest position be
   machine-applicable (ADR 0011's bar)? Or do the lint precedent (`src/lint/rules/openings.ts:21`,
   "no fix is machine-applicable") and ADR 0028 §5's "never slid" keep every move maybe-incorrect?
   Recommendation: yes, under §3 only. The plan draws nothing until it is moved, the candidate is
   the one the compiler already prints, and `offWallFix` is the accepted precedent.
2. **What "AF9 may move no L1 number" means.** Read as "makes no L1 claim", phase B is allowed: it
   can change L1's output on drafts that hit a nib refusal, and no number is claimed (§6). Read as
   "must not change L1 output", AF9 ends at phase A.
3. **Several alternatives per diagnostic.** AF9 is the first producer to emit them (ties, the two
   sides of a meeting wall, two datum words). Should MCP `fix` call `rankFixes` as `arch fix` does?
   That would be a separate small card, `packages/mcp/src/tools.ts:770-777`. L1 needs nothing,
   because no diagnostic carries two machine-applicable fixes. The alternative is for AF9 to emit
   only the first alternative.
4. **Furniture in a machine-applicable door's new swing or landing.** `compile()` cannot see
   furniture where it raises the refusal, and checking it in the post-pass would put swing geometry
   on the compiler path. Recommendation: no in-compile proof. If the phase B fuzz counts any new
   `W_SWING_OBSTRUCTED` or `W_DOORWAY_BLOCKED` on a moved door over the corpus, doors are demoted to
   maybe-incorrect and windows stay.
5. **A window on a single partition edge.** Maybe-incorrect to the room's one exterior edge (§4), or
   always the skeleton? Recommendation: maybe-incorrect only when exactly one edge takes it.
6. **Scope beyond the parallel edge.** Phase A also gives `E_OPENING_DATUM`'s no-position
   (skeleton) and no-datum (`from start`, maybe-incorrect) cases fixes. They use the same code and
   the same raise function, and have no L1 effect. Keep them in AF9, or card them apart?
7. **Hint corrections F1 and F2.** These are message changes on failing plans in phase A (§8). Ship
   them with AF9, or as a separate fix?
8. **The ADR line.** Should phase B add the one-line amendment under ADR 0028 §5 (§1), or is this
   note enough?

## 11. Findings while designing

- **F1.** The nib hint presents one of two equally near positions as "the nearest"
  (`src/opening-relation.ts:1466`; `nib-tie`: 950 quoted, 2050 as near).
- **F2.** `nearestLegal` never proposes a cased opening's flush jamb, so for a cased opening its
  "nearest legal position" can be farther than one that compiles (`flush`: 600 quoted, 500
  compiles).
- **F3.** MCP `fix` and L1 apply every alternative of a diagnostic in array order, without
  `rankFixes` (`packages/mcp/src/tools.ts:770-777`, `eval/l1.ts:51`). This is harmless while every
  producer emits one fix per diagnostic.
- **F4.** For `blocked.arch`, `arch repair` cannot clear the doorway: the WC cycles between two
  positions. A door move is the only remedy left, and today it is only a hint.
