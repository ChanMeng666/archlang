# Backlog

Forward-looking work queue. **`CHANGELOG.md` remains the only record of what shipped** — this file
records what has not, and is deleted from as items land. Item numbers are stable identifiers, so a
gap in the sequence means that item shipped; the commit that closed it is cited by whatever
referenced it.

It is also the state file for the `/loop` burn-down driver:

```
/loop Read docs/backlog.md. Take the topmost item whose status is `todo`, dispatch one Opus
subagent with isolation:"worktree" to implement it, run that item's stated verification gate,
then report the diff and the gate output to me and STOP for approval. Do not commit, do not
push, do not start a second item in the same tick.
```

**Floor gate for every item:** `npm run check` + `npm run check:drift`; add `npm run typecheck:all`
for anything outside `src/`+`test/`, `npm run docs:build` for any `docs/*.md` edit, and
`npm run e2e:playground` / `e2e:docs` for site changes. Items list only what they add on top.

**Merge protocol** (a clean auto-merge is not evidence of correctness — one branch once *moved* a
function another had *modified*, and taking "theirs" would have silently reverted the fix with a
green suite): one worktree per item, never two concurrent items on the same file; diff moved or
renamed bodies against the newer version, not just the conflict set; run both branches' fixtures
together before merging; `npm run typecheck:all` after **every** merge.

**READ AN ENTRY'S OBSERVATIONS AS EVIDENCE AND ITS DIAGNOSIS AS A HYPOTHESIS.** This file's
*symptoms* have been reliable — reproducible, with real numbers. Its *stated causes* have been wrong
about as often as right, and each wrong one cost a detour because it read as authoritative. Measured
over the 2026-09 burn-down:

| item | the entry said | it actually was |
|---|---|---|
| 5.8 | the area-scaled nav-grid pitch; "does not reproduce in a small hand-written corridor" | arithmetically impossible (every plan under 2500 m² sits on the same 100 mm floor) — and it reproduces in an 8 × 3 m plan immediately. **Three** defects, none of them the pitch |
| G.4 | the defect is why `two-bed.arch` cannot round-trip | `two-bed` also declares a `roof` the projection does not model, so it could never have round-tripped; the exclusion is compound |
| 3.13 | constrained by `spec.llm.md`'s character cap | `SKILL.md` feeds the **uncapped** `llms-full.txt`; the capped artifact never moved |
| G.1 | `flush` "can resolve against the thinner face" | true but weak — the resolved position was **order-dependent**, and which consumer was at fault (the resolver, not the check) was the load-bearing question |
| G.5 | `doorConnections` marking a point `ambiguous` on 3+ rooms; a 12/9 split | **zero** `ambiguous` edges exist in any plan it blamed — that cause explains 0 of 9. The split is 16/4/1. The real defect was a curved wall rasterised into the nav grid as its **chord** |

A sharper reading of the G.1 row, from the agent that fixed it: "resolves against the thinner face"
did not merely understate the problem, it **presupposed the answer** — it framed the thin face as the
anomaly, when that face is picked correctly by a rule doing exactly what it was written to do. The
defect was that a *measurement* was taken from a segment chosen to answer a *different question*. An
entry worded that way sends the next reader to `flush`'s distance test, which is the wrong function
in the right file. **A directionally-right diagnosis is the expensive kind**, because it survives a
sanity check.

So: **check the arithmetic of a stated cause before building on it**, re-measure any number an entry
quotes (several have gone stale twice), and when an entry leaves open *which* of two components is
wrong, treat settling that as the first deliverable rather than a detail. Correct the entry in place
when you close it — this file drives the `/loop` burn-down, and a confident wrong cause sends the
next agent down the wrong path.

---

## Wave 2 — coverage where a wrong sign ships silently

_All items landed._

---

## Wave 3 — hygiene, freshness, and the missing example

### 3.1 · Nightly dependency audit red (issue #66) — `todo`

All six advisories trace to exactly two roots: `@modelcontextprotocol/sdk@1.29.0`
(→ `@hono/node-server`, `hono`, `fast-uri` via `ajv`, `ip-address` via `express-rate-limit`) and
`jspdf@4.2.1 → dompurify@3.4.11` in the playground. Both are dependency bumps.

The shim is **stdio-only**, so the hono and rate-limit code paths are unreachable at runtime —
record that in the issue rather than implying exposure. A shim bump also means the pack-time
resource law applies: version in `packages/mcp/package.json` **and both** `server.json` fields.

### 3.2 · Nine stale dependabot PRs — `todo`

Oldest is 2026-07-20. Batch the safe ones (`actions/checkout`, `actions/setup-node`,
`github/codeql-action` ×2, `@fontsource/ibm-plex-mono`). Review separately, each on its own:
**zod 3→4** (#27), **vite 6→8** (#26), and `@types/node` 22→26 (#28) — the last interacts with
`noUncheckedIndexedAccess` across every leg of `typecheck:all`.

### 3.14 · A worktree build silently bundles the WRONG core — `done` (v1.27.0)

**Fixed, and the "cheap mitigation / real fix" split below turned out to be a false
choice — the real fix was small.** The resolution walk already lived in
`editors/vscode/esbuild.mjs`; it is now `editors/vscode/resolve-core.mjs`, which returns
*where* the core resolved as well as its version, and `assertCoreIsOurs` refuses to build
unless that real path lies inside the repo root of the tree being built (derived by
walking up to the manifest whose `name` is the core's, not assumed to be `../..`). The
message names both paths, because the whole difficulty of this bug was that every visible
signal agreed.

One thing the notes below got wrong, and it matters: **junctioning a worktree's
`node_modules` does not make the build safe**, so the guard refuses that case too. npm
installs a workspace package as a symlink with an ABSOLUTE target, so
`node_modules/@chanmeng666/archlang` points at the MAIN checkout's root however you reach
it — a junction moves the walk one step and changes nothing about which core is bundled.

Gated by `editors/vscode/test/wrong-core.test.ts`, which builds two throwaway checkouts on
disk **at the same version** — so the `__CORE_VERSION__` stamp is green, exactly as it was
live — resolves from the worktree, and asserts the guard fires where the stamp cannot. Its
non-vacuity is the other direction: the real checkout, resolved the way `esbuild.mjs` does
it, must pass.

<details><summary>Original entry</summary>

**A release hazard that defeats a guard added the same day.** Running `npm run vscode:build:only`
from inside a `.claude/worktrees/*` checkout resolves `@chanmeng666/archlang` by walking **up** the
directory chain to the **shared** repo's `node_modules`, because a worktree has no `node_modules` of
its own. So esbuild bundles the shared checkout's core, not the worktree's.

Observed live: an agent's `dist/server.js` carried the pre-fix 1-argument `dimSwapFix` while its own
`dist/chunk-*.js` had the 2-argument one.

**The `__CORE_VERSION__` freshness test cannot catch it** — both cores stamp the same version, so it
passes. That test asserts the bundle is not stale *in version*; nothing asserts it came from *this
checkout*. An agent running `npm run package` from a worktree would ship a stale language with an
entirely green bundle-freshness check, which is precisely the shape of failure the stamp was added
to prevent.

- **Cheap mitigation, do this first:** state in `.claude/commands/release-check.md` and AGENTS.md
  that packaging happens in the **primary checkout only**, never a worktree.
- **Real fix:** have the bundle stamp something checkout-identifying (the resolved core's absolute
  path, or a content hash of `dist/index.js`) and assert it matches the building tree.
- **Gate:** prove it by building from a worktree with a deliberately divergent core and watching the
  new assertion fail where the version stamp passes.

</details>

### 3.11 · `repair(repair(s)) !== repair(s)` — `done` (v1.27.0)

**`repair` is now idempotent, and it is asserted** — `test/fuzz.test.ts`'s "is idempotent — a second
call changes nothing", a property over 300 generated plans, plus two named regression specimens in
`test/repair.test.ts`. The hedge this entry used to carry ("deliberately not asserted either way:
pinning `.not.toBe` would cement the defect") is retired.

Measured on the entry's own corpus, re-run against current `main` before anything was designed:
**60 of 400 generated plans never reached a fixpoint** (the entry recorded 47; three fix commits had
landed since, one of which widened repair's reach to angled walls). Orbits ran to period 2, 3 and 4
with tails up to 3. After: **0 of 400**, and 0 of 2000 across four seeds.

**Two causes, and only one of them is a cycle.**

1. **A written position the plan did not resolve back to.** A `in <room> …` placement is
   resolver-derived and therefore *not* grid-snapped (see 3.12, which drew that line); an absolute
   `at` **is**. So when a move could not be expressed as an `inset` and the placement became an
   absolute `at`, the coordinate repair had computed was snapped somewhere it had never evaluated —
   the change log promised a `to` the output did not contain (**37 of 400 plans**), and the next call
   started from a piece nobody had looked at. `planWrite` now plans the rewrite *before* anything
   downstream reads a position and adopts the point the write will land on, mirroring the forward
   check `insetForTarget` had always done for the `inset` branch. This is the half that changes
   output for plans that were *already* idempotent: 17 of 400, every one of them re-rendering
   **byte-identically** (the SVG was always drawn from the resolved position; only the written number
   became honest).

2. **A cycle with no closed-form cause fix.** The rest is two remedies that are each individually
   right and jointly unsatisfiable. The cleanest specimen: a 300 mm shell leaves an interior exactly
   1800 mm wide holding an 1800 mm piece, so the only position clearing both walls is x = 150 — a
   coordinate `grid 100` does not have. Push off the left wall and it snaps 50 mm into the right;
   push off the right and it snaps 50 mm into the left. Nothing is miscomputed and there is no
   objective to make consistent; the arbitrariness is *where the pass banked*, which was wherever it
   happened to be standing. So both levels park on the **canonical member of the cycle they are
   walking**, keyed only by the members and never by the order they were reached in: a piece that
   returns to a position it has held is parked on the lowest `(x,y)` of its cycle, and the pass is
   then iterated until the emitted source repeats, keeping the lexicographically smallest source of
   that cycle. Every member of a cycle has that same cycle as its orbit, so re-running from the
   canonical member returns it unchanged — which is the law.

Doing the per-piece half matters for more than tidiness: without it, independent per-piece cycles
multiply into one long orbit (a plan with pieces cycling at 4, 2 and 6 took **thirty** rounds to
close and overran the round cap). With it, 95% of plans settle in one or two rounds and the longest
orbit over 2000 plans is five.

Honesty holds throughout: a piece parked mid-cycle gets an `unresolved` entry naming every position
it alternates between, and a change entry whose net effect is nothing is dropped rather than
reported. All 27 shipped examples repair byte-identically to before (they are already at a fixpoint).

### 3.12 · `flush` and `grid` fight — `done` (v1.27.0)

A fixture placed `flush` against a 100 mm partition lands on a `…50` coordinate; `grid 100` then
snapped it back **into** the wall and raised `W_FURNITURE_WALL_COLLISION` on a plan that is correct.
`flush` exists precisely so nobody has to write the half-thickness, and the grid undid it.

Neither remedy sketched here was the right one. The cause was not `flush` and not the diagnostic: it
was that `resolve` grid-snapped a coordinate **it had derived itself** from wall geometry. The grid
is a drafting aid for the numbers an author writes, and a `flush` / `against wall` position is not
one of them — `describe().freedom` already draws that exact line between authored-absolute and
resolver-derived placement. So `elements/furniture.ts` no longer snaps the `against` and `place`
branches; the absolute `at (x,y)` branch still does.

Two shipped examples moved, both toward correctness: `materials.arch` (`grid 10`) had two `flush`
fixtures sitting 5 mm *inside* the wall face, and `terrace-row.arch` (`grid 50`) had every `flush`
fixture 25 mm *off* it. `bungalow.arch` keeps `grid 50` — its numbers were already on that grid, so
it is byte-identical — and its comment now records the workaround as history.

### 3.13 · `SKILL.md` never mentioned `site` or the door kinds — `done`

Confirmed before fixing: `grep` counted **0** for `site` and **0** for every door kind in `SKILL.md`,
so a cold-start agent following the loop had no reason to reach for either, and `examples/bungalow.arch`
demonstrated both with nowhere to be referenced from.

Written as **workflow, not grammar** — `arch spec` already covers both surfaces in full, and
duplicating a reference here would create a second place to drift. Each is framed by what it changes
about the LOOP:

- **Door kinds are an answer to a diagnostic.** Only `hinged` sweeps an arc, so `W_SWING_OBSTRUCTED`
  cannot apply to the others — swapping to a `sliding` or `pocket` leaf removes the warning because
  the plan genuinely fixed it, not because a rule was silenced. The entry says plainly that a
  `pocket` earns `W_POCKET_RUN` instead: trading one warning for another is a real trade to read,
  not a win.
- **`site` is framed by what silently cannot run without it.** An intent's `windows.facing` fails
  with `E_INTENT_NO_SITE` rather than passing vacuously, and `W_ROOM_NOT_EQUATOR_FACING` is the one
  rule that reads it — so a brief saying "south-facing living room" needs `site` declared or its
  central requirement is unverifiable. The no-sun-model caveat is restated, because the `_side`
  names invite being read as a daylight measurement.

**The constraint this entry warned about does NOT apply, and the entry was wrong to imply it.**
`SKILL.md` feeds `gen:llms` → `llms-full.txt`, which is **uncapped** (92,043 → 94,484 here). The
capped artifact is `spec.llm.md`, fed by `gen:spec` from `tokens.ts` + `examples/`, and it is
**unchanged at 28,486 against a cap of 28,600**. The entry's own instruction — *re-measure both
numbers rather than trusting this line* — was the right instruction and is what caught this: both
had moved again (it guessed 26,000 and 25,636).


### 3.15 · `W_FURNITURE_WALL_COLLISION` did not check a CURVED wall — `done`

A piece drawn straight through a curved wall linted **clean**. `wallIntrusionDepth` measures in the
wall segment's own frame, which has no meaning on an arc — the across-wall direction turns along the
run — so it declined any segment carrying one. That decline was deliberate and strictly better than
the predecessor, which measured the arc's CHORD whenever it happened to be axis-aligned: it flagged
furniture near a straight line the wall is not on, and missed the wall itself. Both poles stay pinned.

**The measurement, closed form, no tessellation.** A `t`-thick wall on an arc of radius `R` is the
**annular sector** from `R − t/2` to `R + t/2`, restricted to the arc's own angular sweep — so the
across-wall axis is the **radius** and the along-run axis is the **angle**, and both questions the
straight branch asks carry over unchanged. The radial extremes over the intersection are attained on
its boundary, which has exactly three kinds of piece, each with a closed-form extremum: rect edges
inside the wedge (radius is convex along a segment, so the max is at an endpoint and the min at the
perpendicular foot when it lies on the segment), wedge rays inside the rect (radius along a ray IS the
ray parameter, so a slab clip returns both radii with no trigonometry), and the centre itself when the
rect contains it. Radius is continuous on a connected region, so every value between them is genuinely
reached.

**The arc's tessellated band is a drawing artifact** whose facet count is a rendering decision — the
same reason a circular room's area is exact rather than the 48-gon the grid layer draws — so a
measurement must not depend on it.

New sibling module `src/geometry/arc-band.ts` rather than growing `rect.ts`, which advertises
axis-aligned rectangle math and is imported by repair, occupancy and resolve. The private
`angleOffset` became exported `arcAngleOffset`, so "how far round is this?" keeps exactly one answer.

**One residual approximation, stated in the module header rather than left to be found:** on a reflex
sweep where the piece straddles both bounding rays, the intersection can be two components and the
hull of their radii is conservative — the same direction of error the straight branch's projection
already carries, and reachable only by a piece that already surrounds the wall's angular gap.

**`repair` does NOT gain a push direction.** A curved wall returns the existing decline branch, now
naming a radius rather than a normal. That is required rather than optional: widening a lint rule puts
a fault in front of a mover that would otherwise return *nothing* — neither a change entry nor an
`unresolved` entry — which `test/repair-coverage.test.ts` forbids. Idempotence re-verified, 56 tests.

**Corpus: nothing moved** — 0 of 30 lint, 0 of 30 describe, 0 of 35 SVG. Zero movement alone cannot
distinguish "works and finds nothing" from "still declines silently", so a counter proved the four
curved plans DO reach the new path (`library` 480 pairs, `aquarium` 33, `hillside-villa` 29,
`hexagon-pavilion` 12) at zero depth, and a hand-built drum reproduced both poles: a piece on the true
band warns on the fix and not on `main`, while the same piece on the chord warns on neither.

---


## Found while redrawing the showcase

Five things the twelve new examples ran into. None is a regression and none blocked an example from
shipping — each was worked around in the source, and the workaround is what makes it worth
recording: an author had to give something up. Every claim below was **reproduced**, and the
reproduction is quoted.

### S.1 · `schedule rooms` and `place` are effectively unusable together — `done` (v1.27.0)

**Fixed.** A `place`d instance's implicit zone is now **transparent to schedule grouping**:
rows group by the innermost zone the author *wrote*, an instance inside one inherits it, and
an instance with no written zone falls to the un-zoned tail. `describe().zones` and `--zone`
are untouched — an instance is still a zone, still rolls up, still addressable; it is just
not a table heading. `RZone.instance` carries the distinction (absent on a written `zone`, so
an unplaced plan's IR is byte-identical) and `groupRoomsByZone` in `src/sheet-tables.ts`
walks out through it. `examples/clinic.arch` now ships the `schedule rooms` it could not
have: seven rooms under **Public** and **Clinical**, the six placed consult rooms among them.
`examples/museum-wings.arch` had relied on the old behaviour to group by wing and now says so
in source — `zone west "West wing" { place wing() as west … }`, which changes nothing else
(a zone has no geometric semantics, and ids namespace by the INSTANCE path, so `west.shell`
is still `west.shell`). Pinned by `test/zones.test.ts` → "a placed INSTANCE is transparent to
schedule grouping". The original report follows.



`schedule rooms` groups by a room's **innermost** zone, and every `place`d instance **is** an
implicit zone, so a plan that places N components prints N one-row groups with N subtotals. Adding
`schedule rooms` to `examples/clinic.arch` (six placed consult rooms) produces exactly that — seven
rooms in two real zones, then six groups of one:

```
07  r_wc      Accessible WC   13.5   zone=clinical
08  c1.main   Consult 1       16.2   zone=clinical.c1
09  c2.main   Consult 2       16.2   zone=clinical.c2
…  (c3…c6, one group and one subtotal each)
```

That is why the shipped `clinic.arch` carries a `legend` and no `schedule` — the legend has no
grouping structure, so it is unaffected. A fix has to decide what an instance zone *means* to a
table: roll instances up into their enclosing named zone (probably right — a reader wants
"Clinical", not "Clinical / c4"), or let a `schedule` name the grouping depth. Neither is obviously
free; both are a design pass.

### S.2 · `on <wall> at <pos>` takes a literal, so a generated run of openings can't use it — `done` (v1.27.0)

**Both halves fixed, and the parting note turned out to be the bigger of the two.**

`<pos>` is now a full expression, parsed by the same `ctx.parseExpr` every other numeric slot uses
(no second expression grammar), so `for i in 0..4 { door on w1 at bay * i + 600 width 800 }` places a
generated run along the wall. The byte-identity law holds: a literal `1200` parses to
`{ t: "num", value: 1200 }` and evaluates to the number it always did — a SHA sweep over all 27
shipped examples (SVG, `describe()`, `lint()` and `fmt`) shows zero changes, and a
literal-versus-expression twin pins it directly (`test/attach.test.ts`).

One grammar consequence, taken deliberately rather than left to fall out: inside `<pos>` a `%` is the
percent SUFFIX, so it always ends the expression and never means modulo (`at 5000 % 3000` is refused;
`at (5000 % 3000)` is fine — a parenthesised sub-expression re-enters the full grammar). The GBNF
mirrors it exactly with an `attach-expr` cascade rather than pinning the divergence, so a constrained
decoder cannot emit the one shape the parser rejects.

**The uncoded-diagnostic note became a structural fix.** Auditing the slot's refusals showed the
only uncoded one left was the parser itself — and that was true of *every* parse and lex error in the
language, not just here. They now carry `E_PARSE`, a catalogued code whose entry says what makes it
different from every other code (resolution never ran, so there is never a `fix` to apply). That also
replaced a heuristic: `test/gbnf-drift.test.ts` defined "parses" as *no diagnostic lacking a code*,
which worked only because parse errors happened to be the one uncoded kind — any new uncoded
`diag()` call would have silently turned a refusal into a "parses". `test/explain.test.ts` now
asserts the invariant generically, over a corpus chosen to fail in each layer: every diagnostic the
compiler emits has a catalogued code and a byte span, with a pruned allowlist for the whole-plan
verdicts that legitimately have no span.

Two things the audit found that were not in this entry: `E_DIV_ZERO`/`E_TYPE` raised from a binary
expression whose left operand was a literal had **no span at all** (`spanOf(left)`, and a `num` atom
carries none) — anywhere in the language, not just in this slot; and an expression position can be
non-finite, which the range check `mm < 0 || mm > total` waves through on both sides, so `NaN` would
have reached the drawing. Both closed.

`examples/transit-hall.arch` still uses the absolute form for its generated gate line; converting it
is a separate, purely cosmetic change and is deliberately not bundled here, since it would move a
committed drawing.

### S.3 · `strip` cannot nest inside `zone`, so strip rooms fall out of the schedule — `todo`

```
E_STRIP_NEST: "strip" is only allowed at plan level, not inside a block, component, or another strip
```

A `strip` is the cheapest way to lay out a run of rooms and a `zone` is the only way to group them
for `schedule rooms`, and the two cannot be combined — so strip-laid rooms land in the schedule's
`(no zone)` group. `examples/transit-hall.arch` hits both halves of this. The restriction is
deliberate (a strip resolves positions and a zone must not), but the two are orthogonal in principle:
a zone has **zero geometric semantics**, so there is no resolution-order reason a strip cannot sit
inside one.

### S.4 · `dims auto all` prints wall-thickness readings inside the poché — `done` (v1.27.0)

**Fixed, and it was bigger than recorded here.** The counts below were taken by eye; a
region-level probe over all 27 shipped examples found **29 readings in poché across 13 of
them** — every wall-thickness call-out in every plan that asks for `dims auto walls|all`,
because the call-out is drawn *on* the wall at zero offset and the number is far wider than
the thing it measures. The remedy is ISO 129-1 / GB/T 50001's: **where the value does not fit
between the stations, it is written outside them.** Three pieces, each derived from the shape
rather than a box — `outsideStations` (`src/elements/dim.ts`) pushes the number past a
station, but only for a zero-offset dim (a chain span's remedy stays the stagger) and only
when it genuinely does not fit; `thicknessStation` picks WHERE along the wall (the middle of
the widest run no other wall crosses — the reported "where a partition meets the shell"
case); `thicknessSideFlipped` picks WHICH SIDE by probing for floor, so a shell call-out
lands in the room rather than on top of the exterior dimension chains. The side is carried as
`RDim.calloutFrom`, never by swapping the endpoints, whose order also decides whether a
vertical number reads bottom-to-top. Gated by `test/dim-thickness-callout.test.ts`, whose
top assertion is the property over every shipped example. The original report follows.



Where a partition meets the shell, the rotated chain emits the wall's own thickness as a dimension
(`100`, `200`) drawn **inside the wall's hatch**, where it is nearly unreadable and measures nothing
a reader wants. Cosmetic, but it is on the signature drawing. Counts from the shipped sources:
`bungalow` 4, `laneway-house` 2, `garden-loft` 2 (`studio`, `two-bed`, `tiny-house` and `one-room`:
none). Worth a look at the stagger rule (`src/scene-build.ts` ~`:655`, which decides whether a
chain's numbers crowd, plus the shared `src/text-metrics.ts` estimate it measures with) — a reading
whose extent is shorter than the poché it sits in probably wants suppressing, or pulling out on a
leader rather than staggering.

### S.5 · The margin tables can push a page past its own declared paper, silently — `done` (v1.27.0)

**Fixed.** `usablePlanMm` now reserves the margin-table row: `SheetFitInput` carries a
**required** `tableRows`, `tableBandDepth` (`src/chrome-layout.ts`) turns it into a depth, and
the row COUNT comes from `scheduleRowCount` / `legendRowCount` in `src/sheet-tables.ts` — the
same two expressions `layoutSheetTables` sizes the drawn boxes with, so the reservation and
the layout cannot drift apart. `resolve()` derives the count through `planTableRows` before
any Scene exists (a multi-storey plan reserves the DEEPEST storey's, as it already does for
the extent). One shipped example changes verdict: **`materials.arch`** (A3 landscape @ 1:50,
schedule + legend) now reports `fits: false` and raises `W_SCALE_OVERFLOW`. Its page does not
grow — the bytes are unchanged — but its legend reaches to **14.3 mm** of the trimmed edge
against the 15 mm sheet margin the fit rule reserves, so the warning is a true positive about
the margin, not about the page. Every other paper example keeps ≥23 mm and is unaffected.
Reproduced as a property in `test/sheet.test.ts` → "the margin tables are inside the fit
rule". The original report follows.



`schedule rooms` / `legend` are laid out **below** the drawing and are not measured by the fit rule,
so a plan can emit a page taller than the paper it declares while `validate --strict` reports no
`W_SCALE_OVERFLOW` and `describe().sheet.fits` is `true` — both measure the drawing only. Reproduced
by moving `examples/library.arch` (as authored, before it was moved up to A2) back to A3:

| `examples/library.arch` on | emitted page | A3 landscape is | `sheet.fits` | `W_SCALE_OVERFLOW` |
|---|---|---|---|---|
| A3 landscape @ 1:200, with its tables | **420 × 322.6 mm** (viewBox 84000 × 64520) | 420 × 297 mm | `true` | 0 |
| A3 landscape @ 1:200, tables removed | 420 × 297 mm (viewBox 84000 × 59400) | 420 × 297 mm | `true` | 0 |

25.6 mm too tall, reported as fitting. The second row is the proof that the tables are the whole
difference. **No shipped example currently exhibits it** — `library.arch` ships on A2 precisely
because its author hit this — which is exactly why it needs recording: the next person to put a
schedule on a tight sheet gets an SVG whose `height` contradicts its own `paper` and no diagnostic
anywhere. Same "a promise quietly not kept" class as v1.26.1. The fix is to include
`chrome.tables`' measured height in the fit rule that raises `W_SCALE_OVERFLOW` and sets
`sheet.fits`, so the two agree with the bytes.

---

## Found while refreshing the gallery (2026-08-28)

Two things the villa and homes authors ran into while furnishing and re-sheeting the corpus, plus
one found integrating their work. None blocked anything from shipping; each was worked around.

### G.1 · `anchor <corner> flush` read the wrong wall face on a shared centreline — `done`

**The sharper statement, which this entry did not have: the resolved position was DEPENDENT ON
STATEMENT ORDER.** On the repro (1800 × 2600 room, a 100 mm partition coincident with the 250 mm
shell's north run), both walls cover the full edge, so `backingWallForRoomEdge`'s largest-overlap
tie-break fell through to declaration order:

| declaration order | resolved position | `arch lint` |
|---|---|---|
| partition first | `y = 50` | **W_FURNITURE_WALL_COLLISION** |
| shell first | `y = 125` | clean |

Same geometry, two `wall` lines swapped, two verdicts. That is why it survived until somebody hit it
while authoring rather than in a test: it needs two walls sharing a centreline **and** an unlucky
order.

**The fix lands on the right side of a fork the entry left open.** `wallIntrusionDepth` was
**correct** — a piece at `y = 50` genuinely *is* 75 mm inside the shell's solid — so the position was
wrong, not the check. Making the check agree with the resolver would have silenced a true positive.

The defect was in `innerFaceOfRoomEdge` (`src/fixture-orientation.ts`), which read the ONE segment
the scan returns. It now takes the **innermost face across every backing segment** (`max` for
`top`/`left`, `min` for `bottom`/`right`), because **a room edge is a CENTRELINE and more than one
wall can sit on it**: the face is a property of the SOLID at that edge, not of whichever segment a
tie-break picked. `backingWallForRoomEdge` keeps its largest-overlap `best` unchanged — the rotation
derivation and `W_FIXTURE_BACK_TO_ROOM` want a *segment*, not a *measurement* — so no lint verdict
moves, and `repair.ts` re-expresses a flush move through the same function and follows with no edit.

**Deliberately conservative along the run, argued rather than defaulted:** an edge backed by a thin
wall over one half and a thick one over the other reports the thick face for the whole edge, because
restricting the max to the run the piece covers is **circular** for a corner anchor — the extent along
the top edge depends on the left face and vice versa. 75 mm of visible air beats a warning on a piece
that reads as correct.

**Zero corpus movement, explained constructively rather than asserted.** The face computation fires
**228 times across 14 shipped examples**, and **0 of those 228 edges have more than one backing
wall** — where `max`/`min` over a one-element list is the identity. Instrumentation removed and
confirmed by `grep -c`. Independently verified: 0 of 35 drawings moved, 0 of 30 describe/lint digests
moved, and the repro flips both ways on the merged tree. Non-vacuity: reverting
`src/fixture-orientation.ts` alone turns 3 of the 5 new cases red.


### G.2 · `arch compile <file> --json` with no `-o` wrote sibling `.svg`/`.L<n>.svg` files — `done`

Fixed. `compile --json` with no `-o` now writes nothing and says so positively — `written: false`
takes the slot `output`/`outputs[]` occupied, `bytes` still reports the size of the render. One
predicate (`jsonNamesNoFile`) at two call sites, applied uniformly across every branch — clean plan,
multi-storey fan-out, and a broken plan under `--error-svg` — because a split rule would be more
surprising than the behaviour it replaced. `-o <file>`, `-o -` and the no-flag default are untouched,
as are `preview`/`batch`/`md`.

Three consequences worth carrying, none of them obvious from the entry as filed:

- **`watch` inherits the rule**, because `cmdWatch` re-enters `cmdCompile` on every save. Pinned by two
  LIVE end-to-end cases rather than left to follow by construction — `watch` did not watch at all for
  twenty-five releases precisely because nothing invoked it end to end.
- **The payload never carried the drawing.** `output` is a path and `bytes` a count, so this removes
  one accidental route to the bytes rather than a redundant one; the deliberate routes are
  `-o <file> --json` and `-o -`. The original proposal's premise ("the SVG already rides in the JSON
  payload") was simply wrong, and worth knowing before the next person reasons from it.
- **`--error-svg` is inert in exactly one combination** (`--json`, no `-o`). Emitting the card bytes
  into the payload instead was weighed and rejected: the envelope reports facts about a render and has
  never carried content, so an unbounded content key appearing only when no `-o` was given would make
  the error path the sole exception to a deliberately bounded envelope. The clause is declared
  per-command, since it is false for `preview`/`batch`/`md`.

`test/cli.test.ts` gained an 8-case side-effect suite pinning BOTH directions with `readdirSync`
listings, where it previously asserted nothing about file writing either way. Bonus finding: the agent
spec's `echo '…' | arch compile - --json   # stdin, no temp file` had been a FALSE statement shipped to
every model reading it, and the stdin case is now what keeps it true.

### G.3 · `garden-loft.arch` / `one-room.arch` did not round-trip through `planToJson` — `done`

Bisected to one clause: **`dims auto`** lived on the resolved plan as `ir.autoDims` with no field in
`PlanJson`, so `planJsonToArch` never re-emitted it. With no `paper` the drawing extent IS `refDim`, so
losing the chains rescaled every line weight and moved the whole title-block band — with no diagnostic.
The entry's "no `paper`" suspicion was a symptom, not the cause; `north up` is correctly omitted (it is
the default). A THIRD example was affected and unreported: **`laneway-house.arch`, the signature plan.**

`dims_auto` is projected only when declared (the `site` rule), so every pre-existing payload is
byte-identical, and `AUTO_DIMS_MODES` is interpolated from `src/ast.ts` into the type, the validator and
the schema rather than retyped into any of them. **The schema change is backward- but NOT
forward-compatible** (measured with ajv, not read off the text): a document the new `planToJson`
produces from a plan that declares `dims auto` is REJECTED by the published 1.32.0 schema, because the
top level is `additionalProperties: false`.

`test/plan-json.test.ts` no longer **samples** — which is why a lossy clause hid for so long. Every
`examples/*.arch` either round-trips or sits in `CANNOT_ROUND_TRIP` with a reason AND a `proof` regex
asserted to still match the file, so an exclusion cannot rot into decoration. One exclusion is labelled
a defect rather than a design boundary — see the new item below.


## Found while burning down the gallery items (2026-09-02)

Five things the G.2/G.3/5.8 work turned up. None was in scope for the item that found it, and each
was deliberately NOT widened into — recorded here rather than half-fixed.

### G.4 · `planToJson` re-emitted a RESOLVER-DERIVED position as an authored `at (x,y)` — `done`

`planToJson` wrote every furniture position as an absolute `at (x,y)`, including one the resolver had
DERIVED from `anchor`/`flush`/`against wall`. `grid` snaps coordinates an author *writes* — that is
v1.27.0's fix for item 3.12, which stopped `resolve()` snapping coordinates it derived itself — so a
derived position not already on the grid **moved on the way back in**, with no diagnostic.

**The authored form was NOT recoverable, and that reshaped the fix.** `RFurniture` kept only the
coarse `_placement` marker `describe().freedom` reads — never the anchor word, the inset or the
against-wall clause — and `inset`/`segment`/`offset` are **expressions**, so only `resolve()` can
evaluate them and no post-pass over the AST can recover them. `resolve()` now records the clause with
its expressions already evaluated, internal, never reaching the Scene.

The clause is emitted **alongside** the resolved coordinates, not instead of them: the coordinates
stay the useful output, the clause is what gets re-emitted, so the round-trip re-*derives* the
position and there is nothing left for `grid` to re-snap.

**Scope, measured rather than assumed.** `against wall` is affected too and is fixed — this entry
named only the anchor form. Relational rooms, `strip` and opening attachment are NOT affected,
because `resolve()` still snaps those, so re-emitting the snapped value is idempotent. Furniture is
the only affected form *precisely because* v1.27.0 deliberately stopped snapping its two derived
paths. The opening attachment is lossy in a different way — it re-emits the host's category rather
than its id — and is named rather than widened into.

**Schema compatibility, measured with ajv over 28 payloads:** backward compatible, and
forward-incompatible for exactly **one key**. `additionalProperties: false` sits on the furniture
ITEM as well as the top level, and every error path is `/furniture/N`. The break is **`flush` alone** —
`anchor`, `against_wall`, `centered`, `inset`, `segment`, `offset` and `side` were already *declared*
in the published 1.32.0 schema (declared but never emitted), so payloads carrying only those still
validate against it. A consumer pinned to 1.32.0 rejects payloads for plans using `anchor … flush`:
12 of the 30 shipped examples.

**The correction this entry needed.** It originally said the defect is *why* `two-bed.arch` cannot
round-trip. That was wrong: `two-bed` also declares `roof overhang 500`, which the projection
deliberately does not model, so it could never have round-tripped whatever happened to furniture. The
fix is proved constructively instead — with only that line removed, that variant went from **51
differing SVG lines to byte-identical**.

Non-vacuity through the real suite: with `src/` reverted, seven new cases go red, and the four corpus
cases are exactly the four examples carrying an off-grid derived fixture while the other 26 stay
green — the gate discriminates rather than blankets. Corpus otherwise untouched: 0 of 30 describe, 0
of 30 lint, 0 of 35 SVG.


### G.5 · `describe --json` silently omitted rooms from `circulation` — `done` (the repair half)

23 of 185 rooms across the corpus were absent from `.circulation.rooms[]` with **nothing said**.

**This entry's cause was wrong, and so was its split** — both falsified by measurement, not argued
around. **Zero `ambiguous` edges exist in any of the five plans** holding the rooms it blamed: every
one has a clean two-real-room connector and `reachable: true`, so `doorConnections`' 3+-room
classification accounts for **0 of 9**. The real partition is **16 / 4 / 1**, not 12 / 9 —
`hillside-villa`'s garage and utility and `parametric`'s two rooms are the same `entrances[0]` fact as
`terrace-row`'s twelve, not a carve defect.

**The real defect: a curved wall was rasterised into the nav grid as the straight CHORD between its
arc endpoints.** That is not a coarser shape — it is a wall somewhere else. A closed drum (two
semicircular `arc` edges sharing endpoints) rasterises to **a bar along its own diameter**: the grid
let a route walk through 1200 mm of masonry while severing the round room inside into two caps. The
corpus carried the signature plainly — `hexagon-pavilion` measured its three SOUTH galleries and
silently dropped the three NORTH ones, because the chord is the horizontal diameter and only the
entrance's cap survived. Fixed with `distPointToArc` and the band extent from `arcExtremes`, reusing
the solve `resolve` had already done.

**Every curved plan therefore had a wrong circulation model**, including everything item 5.8 measured
on one. 5.8's laws still hold, but the numbers they produced for curved plans were wrong in a way
nothing could see.

A second fix was required or the first made things worse: `seedCell`'s polygon branch is a ring scan
bounded by `tol` (200 mm), and a connector sits on its host's **centreline**, so the floor starts half
a thickness away — 400 mm short on a 1200 mm drum. The scan now reaches `tol + host half-thickness`.
Strictly additive: it scans by increasing ring, so every seed that already resolved resolves to the
same cell.

**The residual is now reported: `circulation.unmeasured[]`**, `{ roomId, reason }` from a closed set
of five, emitted only when non-empty so every existing payload is byte-identical. Deliberately **not**
`blocked`, which means *sealed by furniture* — a defect with a piece to move — so widening it would be
the false positive 5.8's furniture-free control exists to prevent. **The classifier order is
load-bearing:** `other_entrance` is tested before `no_threshold`, because a garage with no carved
threshold that is walkable from its own door is better described by "you can walk in, just not from
where we measure".

**The law pinned is TOTALITY, not a count** — every room appears in exactly one of `rooms[]`,
`blocked[]`, `unmeasured[]` whenever `circulation` is non-null. A count rots as the corpus changes;
the law does not.

Census, reproduced independently: `rooms=185 measured=160 blocked=2 unmeasured=0 SILENT=23` →
`measured=164 blocked=2 unmeasured=17 SILENT=2`. The remaining two are `themed`'s, whose plan has no
entrance at all, so there is no `circulation` object to attach a reason to (see G.6). Zero lint
movement and zero of 35 drawings moved.

**Still open (deliberately, and it is now 16 rooms not 12):** `computeCirculation` measures every walk
from `entrances[0]` only. That needs somebody to decide what a multi-dwelling sheet means — a
per-entrance model, or nearest-entrance-per-room — before a line of code is written. Those 16 are
reported as `other_entrance` rather than silently dropped, so the gap is now visible rather than
invisible.


### G.6 · Three shipped examples carry unaddressed lint warnings — `todo`

The same shape `two-bed.arch` was in before the 2026-08 gallery refresh repaired it:

| example | diagnostics |
|---|---|
| `relational.arch` | `W_ROOM_DISCONNECTED` x3, `W_ROOM_NO_FIXTURE` x2, `W_BEDROOM_NO_WINDOW` x1, `W_ROOM_NOT_ENCLOSED` x1 |
| `themed.arch` | `W_NO_ENTRANCE` x1 |
| `imports.arch` | `W_SWING_OBSTRUCTED` x1 |

`relational.arch` is the worst: three of its rooms cannot be entered at all. These are demonstration
plans for `right-of`/`below`, `theme` and `import` respectively, so the warnings are incidental to
what each teaches — but a reader who compiles the relational example and lints it is told the plan is
unsound, which is not what an example should teach. Either repair them (as `two-bed` was) or state in
each source header that the warning is deliberate, the way `hillside-villa` and `garden-house` do.

### G.9 · A full-suite flake, DIAGNOSED — and twice mis-diagnosed first — `done`

Kept as a write-up because the two wrong diagnoses are more instructive than the fix.

**What it actually was.** `test/cli-commands.test.ts`'s `` `watch -o <file> --json` still writes the
artifact on every save `` waited for the output FILE to contain "Alpha", then immediately read
stdout. But `cmdCompile` writes the artifact and only THEN `emitJson`s, and stdout is a pipe whose
data reaches the parent asynchronously — so the file existing says nothing about whether the
envelope has arrived. Fixed by waiting for the envelope, which is what the sibling no-`-o` case
always did, having no file to be misled by. 10/10 green over three consecutive runs.

**Wrong diagnosis 1 — an arming race.** `cmdWatch` awaits `cmdCompile`, then calls `watchFile`,
then prints the banner, so a save landing before the baseline stat is folded into it. That is a real
defect and the case really did have it (fixed in `8e1eb08`), but it was **necessary and not
sufficient**, and fixing it made the remaining failures look like something else.

**Wrong diagnosis 2 — self-inflicted concurrency.** With five agents running suites at once, the
90 s budget looked exhausted, and this entry previously said so and told the reader not to raise the
budget. Wrong: **the budget was never reached.** The case fails in the primary checkout with every
other agent idle.

**The lesson, which is the point of keeping this entry.** Both wrong diagnoses came from reasoning
about the *shape* of the symptom — "a resident process, a filesystem watcher, 90 s, under load" —
when the assertion message said plainly `expected at least 1 JSON envelope(s) on stdout, saw 0`.
That is not a timeout and never was. **Read the assertion text before theorising about timing**, and
never pipe a suite run through `tail`, which discards the failure block AND the exit code:

```bash
npx vitest run --reporter=dot > run.log 2>&1; echo "exit=$?"
grep -E "FAIL|Failed Tests|Error:" run.log
```

**A calibration worth keeping:** the sibling case was measured at **1 failure in 22 runs** before its
arming race was fixed, and this one at 2 of 5 and 2 of 6. Rates like that survive several green runs
comfortably — three greens do not clear a flake, and a single-file run clears nothing at all.

### G.10 · Plan JSON carries a frame's ROTATION but not its REFLECTION — `todo` (tripwire ARMED)

`planToJson` projects the rotation a `place` frame imposes on a fixture and not the reflection.
Before item 5.4 that lost nothing — a mirrored symbol drew identically to its twin — but 5.4 made
**19 of the 83 catalogued families genuinely handed**, so the projection now drops a fact the drawing
depends on. Measured: a plain and a `mirror x` placed `desk` produce payloads differing **only in
`x`**.

**Still unreachable, and therefore still `todo`.** A plan containing `place` never round-trips at
all: `planFromJson` refuses a namespaced id with `E_DOTTED_DECL` (×3 on the minimal fixture). The two
defects mask each other and no fixture can reach the projection bug.

**The tripwire is now armed** (`test/plan-json.test.ts`, "G.10 tripwire"), which is the part of this
entry that has been actioned. Two assertions pin the CURRENT, WRONG state on purpose, each carrying
the sentence that says what its failure means:

1. the two payloads are equal once position is stripped — **fails when the projection learns to carry
   the reflection**;
2. the round-trip is refused with `E_DOTTED_DECL` — **fails when a placed plan starts round-tripping**.

So whoever fixes `E_DOTTED_DECL` lands on a **red test that names this work**, instead of un-masking
the defect silently with no witness but a symbol drawn the wrong way round on someone else's plan.
Do not "fix" that suite by deleting the block; invert it into the real round-trip assertion.

The neighbouring rule, from [ADR 0016](adr/0016-component-instances-and-frames.md) and now stated in
`AGENTS.md`: when a fact crosses a frame, ask **can this be re-expressed in plan coordinates?** A
placement clause cannot (plan space has no word for a local corner) so it is dropped; a symbol's
handedness can, exactly, as one reflection about the footprint's own centre line — so it is flipped.
This item is the third case, and the answer is the same as the handedness one.


### G.11 · A measurement that disagrees with the drawing has NO gate — `todo`

Found while closing G.5, and it is the general form of that defect rather than a leftover of it.

G.5's chord bug — the nav grid rasterising a curved wall as the straight line between its arc
endpoints — surfaced because four rooms went *silently missing* from `circulation.rooms[]`. That was
**luck, not coverage.** A curve only announces itself when it happens to sever a route; where it does
not, the model simply measures a different building and says nothing.

**Measured on `examples/library.arch`, whose eight-arc drum rasterised as an inscribed octagon sitting
up to 608 mm inside the true circle:**

```
r_ref  walkDistanceMm  37900 -> 37100   (-800)
```

No room dropped out. No diagnostic changed. No drawing moved. Nothing in three tiers of testing saw
it.

**State that claim precisely, because the imprecise version is the trap this item is about.** What
was measured is that the figure **moved by 800 mm**, and that the new grid agrees with the drawn wall
where the old one did not. That makes 37,100 *the reading from a grid that matches the drawing* — it
is **not** an independently derived answer. Nobody has computed `r_ref`'s true walk from the geometry
by hand. Saying "the truth is 37,100" would be asserting the new system's output as ground truth,
which is the same move this entry exists to forbid.

**Why every existing guard is blind to this, stated generally — it is not about curves.** The
circulation laws are all **relative**: the monotonicity property, the body-radius ladder and the
blocked-room verdict each compare the grid *to itself* under a perturbation. Every one of them stays
green on a grid that models the wrong building. That is how item 5.8 could be entirely correct in its
own terms and still have produced wrong numbers for every curved plan. **A gate that only ever
compares a system to its own history cannot see a systematic offset** — the byte-identity digests pin
the drawing, the circulation suites pin the model, and both can be internally consistent while
describing different buildings.

Three candidate gates, and the distinction that separates them:

- **A geometric residual**: for each wall, sample the rasterised obstacle set against the lowered
  Scene's own geometry and assert the maximum disagreement is under a cell. Expensive, but it is the
  property that actually matters, and it would have caught this at any facet count. Still relative —
  it checks the model against the *drawing*, so it fails if both are wrong together.
- **A differential**: measure a curved plan and its polygonal approximation, and assert the answers
  converge as the approximation refines. Catches "the model uses a different shape" directly, and
  also relative.
- **A curved-plan fixture with HAND-DERIVED expected walks.** Cheap, and it only guards the plans
  somebody thought to write down — but it is **the only one of the three that can catch both sides
  being wrong together**, because the expectation comes from outside the system. That is the exercise
  this work did not do, and it is the reason to do it.

**Checked and NEGATIVE, so nobody re-checks it:** `src/analyze/occupancy.ts` does **not** have the
sibling instance. It takes `_walls` and never reads it — the per-room flood fill is bounded by the
room box with furniture as the only obstacles — so there is no second chord-wise rasterisation to fix.
That was worth confirming because the two grids are otherwise close cousins and share
`solidFurniture()`.

Related: item 5.8's laws (the monotonicity property, the body-radius ladder, the blocked-room report)
were all measured on the pre-fix grid. They still hold, but every number they produced for a curved
plan was wrong in exactly this invisible way — which is the sharpest argument for the gate.

### G.7 · Fixture-word completion in the VS Code extension — `todo`

Deferred by name in v1.32.0's CHANGELOG and never given a backlog entry until now. The LSP completes
keywords and ids but not the **129 category words**, which is the largest closed vocabulary a plan
author has to remember and the one most worth offering. The bundled server already knows every family
(hover and the fixture lint rules read `FIXTURE_FAMILIES`), so this is a completion-provider change,
not a data one.

### G.8 · A per-category `style` — `todo`

Also deferred by name in v1.32.0 and previously untracked. `style <kind> { … }` reaches the fixture
layer as ONE kind, so there is no way to give `tree` a different pen from `sofa`. The symbols are
drawn with named line weights already, so the seam exists — the syntax does not. Any design has to
say how a per-category rule composes with the existing per-kind one.

---

## Wave 5 — deferred by name in v1.28.0 / v1.29.0

Each of these was **named in `CHANGELOG.md` at the time it was skipped**, not quietly omitted, so
nobody has to guess whether it was overlooked. Two v1.28 entries are already gone from this list:
`rug`, `sofa_l`, `piano` and `sun_lounger` were deferred there and **shipped in v1.29.0**.

### 5.1 · An `arc` edge under `roof overhang` — `todo`

`roof overhang <mm>` mitres a closed wall ring outward in closed form (line–line intersection,
orientation from the shoelace sign). A curved edge has no such offset in the same arithmetic, so
`E_ROOF_CURVED` **refuses** rather than approximating, and the author writes `roof polygon …`
instead. Same shape as the `arc`-inside-a-`room polygon` deferral below, and probably the same
design pass: an offset ring that carries arcs is an offset ring whose whole consumer set has to
learn arcs.

**Gate:** the refusal's own test in `test/roof.test.ts` inverts — an arc-bearing ring must produce
a drawn eaves line at `R ± overhang` on the curved run, and the exact-coordinate assertions on the
straight runs must not move.

### 5.2 · A polygonal `void` — `todo`

`void … size WxH` is rectangle-only in v1. A ring form needs the machinery `room polygon` already
has, and **every consumer here is written on a rectangle**: the nav-grid obstacle, the poly-aware
room attribution, and `frame.ts`'s `transformElement`. Cheap to add to the grammar, not cheap to
add to those three.

### 5.3 · Area subtraction under a `void` — `todo`

A void deliberately does **not** reduce its room's area today; `describe --json`'s `voids[]` gives
the extent so a consumer can subtract. That decision is *pinned* by `test/void.test.ts`, so
changing it is an argument with a test rather than an oversight — which is the point. Before
reopening it, decide what a subtracted area means to `schedule rooms`, to the room label's `m²`
text, and to an intent's area assertion, because those three are what would silently disagree.

### 5.4 · Glyph-aware mirroring in the `place` transform — `done`

Done, and **the survey is the finding — it is bigger than this entry assumed.** The entry treated
`sofa_l` as the case. Probing all 83 catalogued families (render the symbol, reflect the marks about
the footprint's vertical centre line, compare as an unordered multiset of canonical marks) found
**nineteen handed**: `bathtub`, `bed`, `double_bed`, `desk`, `island`, `washer`, `sofa_l`, `piano`,
`shrub`, `bbq`, `bicycle`, `motorcycle`, `mailbox`, `ev_charger`, `mirror`, `microwave`, `chaise`,
`shoe_cabinet`, `reception_desk`.

**And chirality is FOOTPRINT-DEPENDENT.** `counter`, `fridge`, `upper_cabinet`, `hedge` and
`motorcycle` are handed at some aspect ratios and symmetric at others, because their detail is tiled
and the tile count comes from the aspect. So a per-family `chiral` flag does not merely scale badly —
it **cannot express the truth**. That retires the rejected `sofa_l_r` category on far better grounds
than this entry's original reasoning.

So chirality is **derived**: `mirrorGlyph` reflects the marks and keeps the reflection only when it is
a different drawing. "Different" is measured at `fmt4` — the finest precision any backend serializes —
so *symmetric* means exactly *would emit the same bytes*, with no invented epsilon. That choice is
evidenced rather than asserted: an exact float comparison calls **63 of 83** families handed, on the
glyph layer's own trigonometric noise, and a hand-picked tolerance would be a magic number.

The flip lives in `transformElement` beside `transformDeg`, as ADR 0016 requires, and is XORed so a
nested reflection composes back to the identity. One reflection suffices for any reflecting frame
because such a frame factors exactly as `M = R(m)·Fx`, hence `M·R(l) = R(m−l)·Fx` — and `m−l` is
precisely what `transformDeg` already computes. So **`mirror x` and `mirror y` differ only in the
derived quarter-turn**; which axis the author wrote never reaches the glyph.

**Exactly two shipped drawings move, and the changed pieces were identified BY ELEMENT ID** — both
trees compiled with `annotate: true` and the furniture nodes diffed by `elementId`, not attributed by
reading the source:

```
CHANGED: clinic / c4.f_desk, c5.f_desk, c6.f_desk
CHANGED: terrace-row / u2.f_bed, u4.f_bed
74 fixtures drawn across the three placed plans | 5 changed
```

Five of 74 — exactly the handed pieces sitting on a reflecting frame. `desk @ 1600x800` and
`bed @ 1400x1900` are handed; everything else in those mirrored components is symmetric at its
catalogued footprint (`sofa @ 700x1900`, `basin @ 600x450`, `stove @ 600x600`,
`kitchen_sink @ 800x600`, `wardrobe @ 600x1200`, `fridge @ 600x650`).

**Two attributions to get right, because both are easy to guess wrong from the source text.**
`clinic`'s two `counter`s are `f_recept` and `f_tr_counter` — **plan-level statements with no instance
prefix**, so no reflection can reach them. And `terrace-row`'s mirrored units DO contain a `fridge`,
one of the five footprint-dependent families — but it is symmetric at 600×650 and did not move.
Membership of that list is not the same as being handed *here*.

**`museum-wings` is a live test of this path and it must NOT move.** Its own text has no `furniture`
statement, but it `import`s `museum-wing.arch`, which carries two — so the compiled plan has four
fixtures and two of them (`east.bench1`, `east.bench2`) sit inside `place wing() as east … mirror x`.
It is byte-identical because `bench @ 1800x600` is symmetric, which is the symmetry half of the law
holding on the drawing it matters most for — not an absence of fixtures. (An earlier revision of this
entry said it "could never have shown this bug"; that was wrong, and came from grepping the file
rather than following its import.)

`describe()` and `lint()` do not move on any of the 30.

**The `frame.ts` collision with G.4 was resolved by keeping both, and proved rather than reasoned.**
Both items insert at the identical anchor in `transformGeometry`, and git conflicts there — but
neither moved a body the other modified, so this is plain additive adjacency, not the v1.25 near-miss
shape. The two facts are the same species with opposite answers: the placement CLAUSE names a corner
in the instance's local vocabulary and **arrives** at the crossing unable to survive it (plan space
has no word for it, and the reflection renames it), so it is **dropped**; the symbol's handedness
**does not exist** before the crossing — the frame creates it — and is re-expressible exactly as one
flip about the footprint's own centre line, so it is **flipped**. Flip what can be re-expressed; drop
what cannot. `test/glyph-chirality.test.ts`'s pairing case is the fixture neither branch could produce
alone, and disabling the chirality flip fails 5 of that file's 15 cases.

Left open by name: **G.10**, Plan JSON carrying a frame's rotation but not its reflection — latent,
because a `place` plan cannot round-trip at all today.


### 5.5 · A syntax for overhead dashes — `todo` (the CONVENTION is settled; the syntax is not)

`upper_cabinet` is drawn dashed because of *what it is*, and there is no way for an author to say
"draw this piece above the cut plane" about anything else. Any design has to decide whether it is a
clause on `furniture`, a property of a category, or a plan-level convention.

**The half of this item that was open is now closed.** It asked that `upper_cabinet`, `roof` and
`void` "agree about what dashed *means* before a fourth spelling appears" — and v1.31 supplied the
fourth (a `garage` door's overhead projection) and the agreement with it. The convention, stated
once and written into `src/elements/door-panels.ts`'s header, `docs/furniture.md` and the door-kinds
section of `docs/language-reference.md`:

> **A dashed outline means a thing above the horizontal cut a floor plan is taken at.**

Everything that draws one now derives its pattern from the single `dashedPattern(sizes)` helper in
`src/elements/glyph-lib.ts` and sets `lineType: "dashed"` beside it — `upper_cabinet`, `roof`,
`void`, the v1.31 `pergola` and the `shed`'s ridge, and the garage projection. (The three older
dashed rules in `door-panels.ts` — a `barn`'s two wall faces and a `bifold`'s opening line — dash
for a *different* reason, redrawing an edge the leaf covers, and deliberately keep their own raw
pattern with no named line type.)

What is still `todo` is the SYNTAX: an author still cannot say "draw this piece above the cut
plane" about an arbitrary `furniture` statement. The convention above is now the constraint any
such design has to satisfy rather than a question it has to answer.

**Item 5.7 supplied the SEMANTICS and deliberately did not touch this.** `overhead` is catalogue
data on four families (`upper_cabinet`, `wall_cabinet`, `mirror`, `range_hood`); this item is about
giving an author a word. So 5.5 is now a syntax problem, not a drawing one.

**One tripwire to respect when you take it.** `test/overhead-furniture.test.ts` pins that the
overhead set is exactly those four families **and that all four are `requiresWall`**. That premise
is load-bearing: it is why `W_FURN_CLEARANCE` has no `isOverhead` arm — every overhead piece is
already skipped one condition to the left, so an arm today would be unreachable, untested code.
A ceiling-hung family (a pendant, a projector, a ceiling fan hangs off the slab, not the fabric)
breaks both halves of that pin **on purpose** — and that is the moment to add the clearance arm,
which will then be reachable enough to test by consequence. **Deleting the pin instead of adding
the arm is the failure mode.**

### 5.6 · Angled furniture — `todo`

A fixture still draws on an **axis-aligned footprint**, so a piece against a sloped wall is not
turned to it. Deferred by name in v1.28.0. Related but not the same as 3.15 above (which is about
*measuring* against a curved wall, not drawing at an angle); both are instances of the fixture
layer knowing only rectangles.

### 5.7 · An `overhead` exemption in the furniture rules — `done`

Done, and the design question this entry posed — "work out which of the four consumers each flag
feeds" — was answered rather than sidestepped. **The two flags feed different sets, which is why
`overhead` is not `underlay` spelled backwards:**

| consumer | `underlay` (a rug) | `overhead` (hood / wall cabinet / mirror) |
|---|---|---|
| `W_FURNITURE_OVERLAP` | exempt (on the pair) | **exempt (on the pair)** |
| `W_FURN_CLEARANCE` | exempt | **no arm — see below** |
| nav grid (`analyze/circulation.ts`) | dropped | **kept as an obstacle** |
| per-room flood fill (`analyze/occupancy.ts`) | dropped | **kept as an obstacle** |

**The grids keep it, and that is the whole difference from a rug:** a rug is walked *on*; a wall
cabinet is not walked *under* — a body is 1700 mm and a wall unit's underside is about 1400. So
`solidFurniture()` is **untouched**, which also answers the hand-off from 5.8: there is no
per-call-site exemption for its three `buildNav` callers (the main pass, `furnitureSealed`'s
furniture-free control, `measureWaysIn`'s body-radius ladder) to diverge over.

**The rule got simpler, not more conditional.** It now asks one three-valued question of the
catalogue — `cutPlaneLayer()` → `underlay | body | overhead` — instead of comparing two flags: two
pieces can only collide when they sit on the same side of the plane the drawing is cut at. That
generalisation settles for free the pair neither flag's own documentation covered — **a rug with a
wall cabinet over it** — with no third condition written for it. The test stays on the PAIR, so two
rugs still warn and so do two wall cabinets.

**The clearance rule deliberately gets no arm.** Every overhead family is also `requiresWall` and is
already skipped one condition to the left, so a second arm would be unreachable, untested code. A
test pins that premise instead, so a future overhead family that is NOT wall-requiring — a ceiling
pendant hangs off the slab, not the fabric — turns it red rather than passing silently.

Non-vacuity proved by planting two different faults: reverting to the `isUnderlay` comparison fails
2 cases; adding `overhead` to `solidFurniture()` fails 3.

**Corpus effect: none.** A lint sweep over all 30 examples produced 38 diagnostic lines, identical,
twice — once for the source change alone and once with the restored pieces. `furnished-flat` keeps
the one `W_PATH_TOO_NARROW` that item 5.8 gave it, same message and hints.

The moved byte-identity digests were proved to be the SOURCE and not the code, by the substitution
that file's own header prescribes: the pre-5.7 source, fed to the MERGED compiler, reproduces both
old hexes exactly. `examples/furnished-flat.arch` is the only shipped drawing that moves in this
batch, and only because its own source gained two statements.

Still open and NOT closed by this: **5.5**, a *syntax* for saying an arbitrary `furniture` statement
is overhead. This gave the semantics to three catalogued families; it did not give an author a word.

### 5.8 · `W_PATH_TOO_NARROW`'s width was non-monotonic, and went CLEAN as the obstruction grew — `done`

**Three independent defects, and this entry named the cause of none of them.** Both of its stated
leads were false. Recorded rather than deleted, because this file drives the `/loop` burn-down and a
confident wrong cause sends the next agent down the wrong path.

- **"Points at the area-scaled nav-grid resolution" — impossible.** `navCellSizeMm` is
  `max(MIN_CELL_MM, ceil(sqrt(area / MAX_CELLS)))` with `MIN_CELL_MM = 100` and `MAX_CELLS = 250_000`,
  so the pitch only leaves 100 mm **above 2500 m²**. The flat is 90.7 m² and the repro hall 15.6 m² —
  both sit on 100 mm cells. Grid pitch could not have been the difference.
- **"Does not reproduce in a small hand-written corridor" — it does.** An 8 × 3 m two-room plan
  reproduced it immediately, and that probe is what found the third defect below.

The lesson worth keeping: **a localisation written from two observations is a hypothesis, and this one
was wrong in a way that read as authoritative.** Check the arithmetic of a stated cause before building
on it.

**1. The false clean.** `src/analyze/circulation.ts` dropped an unreachable room from `roomFacts` with
a `continue`, and `pathTooNarrow` iterated exactly that array — so a room sealed by furniture left the
rule's domain and warned about nothing. `W_ROOM_NO_CLEAR_PATH` did **not** catch it either: at 500 mm
the whole plan returned zero diagnostics of any code. The rule now walks rooms in SOURCE order and
reads `circulation.blocked`; since `circ.rooms` is itself source-ordered, a plan with nothing blocked
emits byte-identical diagnostics in identical order.

**2. The number.** The clearance distance transform is seeded on **body-radius-eroded** cells, so its
hop count is a body *centre's* freedom — and `(2·hops−1)·cell` was read as a width. **Every
furniture-derived clear width ArchLang had ever reported was one body diameter (600 mm) short.**

**3. The threshold carve.** The connector stitch carved an opening's **centre** first and, if that was
walkable, stopped — the rest of its width was never tried. So a cabinet whose halo just missed the
midpoint left a one-cell doorway pinned at its own corner, while a **deeper** cabinet fell through to a
fallback that opened the whole threshold. *The plan with more furniture measured wider.* Found by the
probe, not by reading. Every walkable part is now carved — strictly more free cells, so a route can
only gain options.

**The message is measured, not fabricated.** A sealed room has no widest-path reading, so
`computeCirculation` re-runs the grid with a descending body radius and reports `widestWayInMm` — paid
only when something is sealed. "Seals every way in / 0 mm" is now reserved for a genuine zero; a room
with a real but too-narrow way in gets that width in the measured-deficit style every other rule uses.
An intermediate revision printed `0 mm` for a kitchenette with a real 300 mm way in, which would have
been **the same defect this item was filed over, one digit smaller** — "100 mm is not a width anything
in that corridor actually has".

**Corpus effect**, swept before and after over all 30 shipped examples: exactly two gain a diagnostic —
`furnished-flat`'s Kitchen (400 mm) and `tiny-house`'s Wet room (400 mm) — both verified from source
coordinates by deletion differential. Nothing loses one; no `ok` flag or exit code moves. 23 of 30
`describe --json` digests move, because the +600 mm correction reaches every plan with circulation; a
field-level diff confirms **only** circulation fields changed, and walk distances fall or stay equal.
22 byte-identity digests were re-blessed with a field-level diff written into each header.

`furnished-flat`'s Kitchen is a real finding in the furniture flagship, whose header claims
strict-clean. Its residual — the rooms still silently absent from `circulation.rooms[]` — is **G.5**.

---

## Wave 4 — P2 language features

Designed and evidenced in `docs/research/2026-08-06-competitor-borrowing-roadmap.md` §5. Each one
**adds tokens**, so each needs: its own design pass, full `gen:*` regeneration, closed value sets
**interpolated from the source of truth, never retyped into a generator**, a byte-identity law
pinned by test ("a plan that does not use it renders, describes and lints exactly as before",
proven by a SHA-256 sweep over the shipped examples), and a corpus entry in the executable-spec gate.

| # | Feature | Status | Note |
|---|---|---|---|
| P2-7 | Four-sided authorable clearances + embedded-insert exemption | `todo` | Most contained — widens `clearanceMm` (`src/fixtures-catalog.ts:21`) to `{front,back,left,right}` plus a per-statement override. **Re-scope before starting:** v1.28.0 took that catalog from 18 categories to **59 across 36 families** and gave `FixtureSpec` two more flags (`directional`, then v1.29's `underlay`), so "one default per category" is now a far larger table to be right about — and an underlay already has a stated exemption (it never blocks a fixture's use-space) that a four-sided rule must not re-litigate |
| P2-10 | Feet-and-inches display formatting (`dimension_units standard`) | `todo` | **Display only** — millimetres stay the internal unit and the measured truth. Route through `fmt()` |
| P2-8 | Targeted dimension selection (dimensions on named walls/fixtures) | `todo` | Composes with the sheet layer |
| P2-2 | Room-relative door hand | `todo` | **Behaviour change for every plan with a reversed wall — must be staged.** (a) an advisory `W_*` naming the doors whose hand would move, zero geometry change; (b) the flip behind a release boundary, goldens re-blessed after review. Check the `place … mirror` goldens specifically: `frame.ts`'s `det < 0` handedness flip must compose with the new rule, not fight it |

**P2-9 is CLOSED** (`outdoor <kind>` + floor-material hatches + auto legend), by the v1.31
ground-elements track — the `outdoor` element with nine kinds, seven scale-aware ground hatches
sharing the wall library's one `META` table, a legend row per material used, plus the `fence`
element and the `site { boundary }` lot line the same track carried. The scale-awareness caveat
its row carried was honoured: every pattern dimension is `c.gap * k * c.scale`, so a hatch is the
same size **on the sheet** at 1:50 and 1:200, and `test/outdoor.test.ts` pins that as an equality
between the tile widths at two denominators rather than by eye.

### 4.5 · Deferred by name in v1.31.0 — `todo`

Four things the ground track decided NOT to do, recorded so the next person finds a decision
rather than an omission:

- **Ground in the circulation model.** An `outdoor` surface obstructs nothing today: you can walk
  on the lawn, and you can walk on the `water`. Fixing the pond without fixing the pond-with-a-
  bridge is the trap — a gate in a fence, a stepping-stone path and a `water` feature all want the
  same answer — so the whole question is one piece of work rather than a per-kind special case.
  Note the nav grid presently models the INSIDE of the building only, so "walk the garden" is a
  larger change than it looks.
- **A curved fence** (`E_FENCE_CURVED`). The post pitch, the panel offset and `length_mm` are all
  measured along a straight run. Wants the per-segment arc lowering `wall` already has, plus an
  arc-length pitch — not a facet.
- **A polygonal balcony** (`E_OUTDOOR_POLY_DEGENERATE` covers it). The railing is derived per named
  EDGE (`top`/`bottom`/`left`/`right`) and carried through a `place` frame by those edges' outward
  normals; a ring has no such names. Wants a per-EDGE rail model first, which is the real work.
- **`outdoor` in Plan JSON.** Deliberately absent — `planToJson` is byte-identical with and without
  ground, pinned in `test/outdoor-byte-identity.test.ts`. Adding it is a schema change and should be
  argued as one, with a consumer that wants it.

A fifth was found while reviewing the flagship for release and is filed on its own, since it is a
defect in an existing rule rather than a scope decision: **4.8**, a `dims auto` chain running across
an `outdoor` surface attached to the facade it measures.

### 4.6 · A balcony door GROUNDS its storey, and that costs a lint false positive — `done` (v1.31)

Found while authoring `examples/garden-house.arch` (v1.31): `verticalReach` (`src/vertical.ts`)
marked a storey **grounded** when it had an exterior door of its own, and a grounded storey got
**no `arrivalRooms` entry** from its stair — the shaft's arrival edge exists precisely to rescue an
upper floor that has no door. `lint`'s reachability rule then ran its BFS from `"exterior"`, which
on such a storey meant *from that door*. Put an `outdoor balcony` on an upper floor with the `door`
that [`W_BALCONY_NO_DOOR`](error-codes.md#w_balcony_no_door) requires, and the storey was grounded
by a door that leads onto a 7 m² slab. In `garden-house` the BFS entered level 2 through the main
bedroom and reported `W_BATH_VIA_BEDROOM` for a bathroom that opens straight off the landing —
`describe --json`'s own `doors[].between` said `["r_landing","r_bath"]`. The plan was right and the
rule was wrong.

**Fixed**, narrowly, as this entry proposed: `levelIsGrounded` (`src/vertical.ts`) discounts an
entrance door whose OUTWARD probe — one host-wall thickness off the door's own centre, on the side
with no room, the same poly-aware pattern `site.ts`'s `windowFacingPage` uses to find a window's
outward side — lands inside an `outdoor balcony` polygon. Every other exterior door keeps its
historical behaviour unchanged, including a genuine hillside entrance with no balcony in sight.
`lint.ts`'s `buildingContexts` and `describe.ts`'s `buildVerticalReport` both call it to build their
`grounded()` callback, so `vertical.reachable_levels` and the reachability lint rules can never
disagree with each other about which door grounds a storey — the second caution below, resolved by
sharing one function rather than by hand-syncing two copies.

Two things this fix deliberately did NOT touch:

- `describe()`'s per-storey `access.hasEntrance` stays the **honest**, undiscounted fact that a
  floor has an exterior door — a reader asking "does this floor have its own door" should not have
  the answer laundered by what that door opens onto. Only the internal `grounded()` predicate feeding
  `verticalReach` changed.
- A **lint sweep over all 30 shipped examples**, before and after, moved exactly one: `garden-house`
  lost its `W_BATH_VIA_BEDROOM`. Nothing else in the corpus has a balcony door on an upper storey, so
  nothing else could have been reachable via one.

`examples/garden-house.arch`'s header now names only the one warning that remains,
`W_ROOM_NOT_EQUATOR_FACING` on Bedroom 2 — `arch validate --strict` confirms it is the only one.
Tests: `test/vertical.test.ts` — "a balcony door is not an arrival point (backlog 4.6)", pinned by a
counterexample PAIR (the plan with the balcony grounds via the stair's landing; the identical plan
with the balcony removed grounds via the door again, and `W_BATH_VIA_BEDROOM` returns).

### 4.7 · The MCP registry publish races npm — `done` (v1.31, in `release.yml`)

The v1.30.0 release failed at `mcp-publisher publish` because the registry's validation of
`server.json` against the just-published npm package 404'd — the npm registry had not yet made a
version this same job had published visible to a third party. `gh run rerun --failed` then
succeeded with **no change**, which is the signature of a race rather than of a bad manifest.

That step now retries up to **6 times, 20 s apart**, and only that step. A genuinely bad manifest
(a case-wrong owner segment, an over-long `description`) still fails loudly, two minutes later.

### 4.8 · A `dims auto` chain runs across an `outdoor` surface attached to the facade — `todo`

Found while reviewing `examples/garden-house.arch` for the v1.31 release, and named in that
release's **Deferred by name** list rather than fixed on release eve.

`dims auto` places its exterior chains at an offset computed from the **building's** extent, which
is right in every plan drawn before this release, because nothing existed outside the wall line to
collide with. It is no longer sufficient: on `garden-house` the level-1 chain crosses the paving
that abuts the front and rear facades, and the level-2 chain crosses the `balcony` slab attached to
the bedroom wall. Nothing is illegible — a dimension line is a thin dark stroke and ground is a
tint under a hatch — but it is not what a drafter would issue: a dimension chain belongs in clear
paper outside everything the drawing shows, not on top of the terrace.

**Why it is not a one-line offset.** The chain offset feeds every plan that asks for `dims auto`, so
widening it unconditionally moves dimension geometry in all 30 shipped examples and every golden.
The honest fix is per-facade: for each chain, take the outdoor extent of the surfaces whose own
extent touches the facade being measured, and push that chain past it — which needs a
facade-to-ground adjacency the dimension pass does not currently compute. Note the same iron law
applies to how "touches the facade" is decided: probe the facade, do not compare bounding boxes.

Related, and worth settling in the same pass: an `outdoor` surface already grows the drawing extent
(that is why a site plan wants a `paper`), so the chain's own paper offset and the ground's extent
are computed from two different notions of "the drawing".

### 4.1 · Joinery pass performance — `todo`

`toScene` got roughly **3× slower** when v1.30 replaced the three wall-lowering paths with one
joinery pass (ADR 0018). The cost was measured, accepted on 2026-08-28 and tracked here; it was
**not** an oversight and the `bench` PR comment is informational and has never gated.

**Measured back-to-back against `main`'s `src/` in one session** (`git checkout main -- src/`,
bench, restore):

| corpus | main | v1.30 | delta |
|---|---|---|---|
| all 29 examples, every storey, total | 57.5 ms | 162.0 ms | +182% |
| mean per storey | 1.98 ms | 5.59 ms | +182% |
| slowest real plan (`library`) | 6.75 ms | 16.0 ms | +137% |
| `bench` OPENING_HEAVY (400 walls, 600 openings) | 5.96 ms | 116.3 ms | +1852% |
| `bench` BALANCED | 120.7 ms | 184.7 ms | +53% |
| `bench` ROOM_HEAVY | 190.8 ms | 235.4 ms | +23% |

`OPENING_HEAVY` is the worst case *because* 400 disjoint axis-aligned segments is exactly what the
retired rectangle sweep was fastest at.

**Phase profile of `joinWalls`** (measured with temporary instrumentation, since reverted):

| plan | split | classify | index | chain | keys |
|---|---|---|---|---|---|
| OPENING_HEAVY | 61.5 ms | 29.1 | 17.0 | 16.7 | 9.6 |
| `library` | 5.4 ms | 3.2 | 1.6 | 1.1 | 0.9 |

Split is the largest phase at ~45% of the pass, so halving it recovers about 11% of `toScene`.
There is no single hot spot to delete.

**The constraint, and it is the whole point of the item.** Any fix must stay **INSIDE the one
algorithm**. Legitimate directions: an exact axis-aligned shortcut within the split phase (a
horizontal/vertical pair needs no general line–line solve), a sweep line instead of the
grid-bucketed pair scan, fewer allocations per group, a cheaper `undirectedKey`. **Never a second
pipeline** — a rectilinear fast path would reintroduce exactly the three-paths structure ADR 0018
removed, and the four defects that came with it. That the joinery's rectilinear outline is
vertex-identical to the old rectangle boolean's (reversed and rotated) makes the shortcut *look*
free; it is not, because the fills and the opening cuts would have to agree too, and then there are
two implementations of the ownership rule to keep in step.

**Two approaches already shown NOT to apply** — do not re-try them without new evidence:

- *Classify per HATCH GROUP so each call sees a fraction of the plan* (proposed in the Stage-A
  notes). The ownership rule is **cross-group by design**: "an edge is on group `g`'s fill iff
  exactly one side is owned by `g`" is what makes two materials tile without a doubled boundary.
  Splitting the call breaks the decision the fills depend on — and `OPENING_HEAVY` is single-material
  anyway, so it would not have helped the worst case.
- *Stop rebuilding the spatial indices per call.* There is exactly **one `joinWalls` call per plan**;
  there is nothing to reuse across.

**Gate for any attempt:** the output must not move by one byte. `test/joinery-oracle.test.ts`,
`test/joinery-pipeline.test.ts` and the whole golden set are the proof, and a re-bless is a red
flag, not a step.

### 4.2 · A door within its own wall thickness of a corner was unflagged — `done`

`W_DOOR_NEAR_CORNER`. The **drawing was always correct** — the nib is drawn and mitred into the
neighbouring run — which is why this was first mis-diagnosed as a rendering fault during the v1.30
joinery review, before it was measured and turned out to be the plan. At page scale such a sliver
stops reading as wall and reads as a chamfer on the corner, and its returned face has nowhere to
carry the frame and architrave a jamb fixes to.

**The threshold is the wall's own thickness** (× `minCornerNibRatio`, default 1.0), and the reasoning
is why it needed no new constant: thickness is the only length in the drawing **intrinsic to the wall
being measured**, so it self-scales — a 100 mm partition asks for 100 mm, a 400 mm shell for 400 —
and it is the dimension the defect is about. **One-limbed**, unlike `W_POCKET_RUN`, which needs an
absolute second limb because it compares a door's *width* against a wall's *run*; here both sides
belong to the same wall and there is no narrow-door pathology to guard against.

**What counts as a corner is defined by exclusion**, so the rule cannot fire where nothing is mitred:
the host segment's run must END at the point and the wall must go somewhere else from it. A wall's
free end, a redundant collinear vertex, a partition teeing into a wall that carries straight past, and
a tangent arc/straight hand-over are all excluded. **On a curve the nib is an ARC LENGTH, not a
chord** — measured at the centreline radius from the radial jambs, in closed form, so the number
cannot move with a facet count.

**No machine fix, deliberately.** Every remedy rewrites a number the author chose. Narrowing the leaf
would also close the gap and is **refused by name** as the constraint-laundering pattern this project
rules out — rewriting the width you asked for to satisfy a checker.

**Zero of the 30 shipped examples fire it**, so no threshold was tuned to keep the corpus quiet — and
the rule is proven to fire on the catalogued case rather than assumed from silence: required 250 mm,
measured 150 mm, 100 mm short, with the corner named by coordinate.

**It found two true positives in TEST fixtures**, both a 900 mm leaf's jamb 50 mm from a 200 mm ring
wall's corner, in plans written for another subject where the door went wherever was handy. Both moved
with every assertion preserved. It also caught an **order pin whose reason had become false** —
`doors.test.ts` asserted that rules after `pocket-run` are harmless *because* they cannot fire on a
plan predating them, true of the two outdoor rules and false of this one — and restated it rather than
extending it in silence.


### Not scheduled — recorded so they are not lost

- **`arc` edge inside a `room polygon` ring.** Was promised in a shipped error message "for v1.25";
  v1.25 shipped without it and the promise has been retracted to point here. Genuinely large: the
  ring's whole analysis layer — effective-vertex count, self-intersection, centroid, adjacency,
  occupancy and nav grids, the `dims auto` vertex chain — is written on literal vertices and must
  learn arcs. Build it on its own merits, not to honour a version number.
- **P2-4** addressable structural grid · **P2-5** measured-vs-drawn edge separation ·
  **P2-6** multi-flight stairs — each needs its own design pass.
- **All of P3** (IFC4 export, occupancy-grid export, 3D axonometric, `arch vary`, `--why`,
  anchor-relative coordinates) — each is a project, not a task. P3-2 is **blocked** on element
  heights and opening sill/head heights, which the language does not have.
- **P3-7 arbitrary rotation** is deliberately NOT built; the trade-off is recorded in the roadmap.
  Any future design must first answer what the handed rules (`hinge left`,
  `against wall … side left`, `anchor top-left`, `right-of`) mean at non-axis angles, plus grid snap
  and `fmt()` stability.

### Settled — never re-propose

`T3` (the diagnostic-loop live experiment) is **permanently declined**; `T6` (area-syntax sugar) is
**parked** behind the frozen reversal triggers in `docs/research/2026-07-g2-verdict.md`. See
AGENTS.md → "Standing decisions & iron laws" before touching either.
