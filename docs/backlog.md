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

### 3.13 · `SKILL.md` never mentions `site` or the door kinds — `todo`

The agent Skill — the loop a cold-start model follows — documents neither the v1.25 orientation
layer nor the four non-default door kinds. `examples/bungalow.arch` now demonstrates both, but
there is nowhere in `SKILL.md` to reference it from.

Note the constraint before starting: `SKILL.md` feeds `gen:llms`, and `spec.llm.md` is under a hard
character cap asserted by `test/llm-spec-drift.test.ts`. **Re-measure both numbers rather than
trusting this line** — they have moved twice since it was written (the cap was 25,000; v1.29.0
raised it to **26,000** after trimming a redundant keyword bullet, and the file is **25,636** as of
2026-08-27, leaving 364). The standing instruction is unchanged and is the point of the cap:
`spec.llm.md` is injected verbatim into agent prompts, so its size is a recurring per-request token
cost — **trim duplication before raising.**

### 3.15 · `W_FURNITURE_WALL_COLLISION` does not check a CURVED wall — `todo`

The furniture-vs-wall rule measures in the wall segment's own frame, which is exact for a straight
run at any angle but has no meaning on an arc: the across-wall direction turns along the run, so
there is no single normal to project onto. `wallIntrusionDepth` therefore declines a segment
carrying an `arc` outright, and a piece drawn straight through a curved wall lints clean.

That is a **deliberate and strictly better** position than before, and worth stating plainly. An arc
carries its CHORD in `a`/`b`, so the rule this replaced measured the chord whenever it happened
to be axis-aligned — flagging furniture near a straight line the wall is not on, and missing the wall
itself. Both branches are pinned in `test/furniture-lint.test.ts`.

The honest fix is radial: intersect the piece's radial extent, restricted to the arc's angular
sweep, with the band `[R − t/2, R + t/2]`. Closed form, no tessellation — the arc's own tessellated
band is a drawing artifact and must not become the measurement (see the exact-vs-chordal note in
`docs/analysis.md`). `examples/aquarium.arch` is the fixture to prove it on.

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

### 5.4 · Glyph-aware mirroring in the `place` transform — `todo`

**`sofa_l`'s return is always on the LEFT and there is no right-handed twin.** `place … mirror`
will not produce one, because a reflection transforms a resolved element's *position* and not the
symbol drawn inside it — so a mirrored wing draws a left-hand sofa. A `sofa_l_r` category was
**rejected rather than forgotten**: it would put the fix in the vocabulary, where every future
handed symbol then needs its own twin. The real fix is for `frame.ts` to hand the glyph its own
chirality when `det < 0`, which is the same place the handed door/furniture rules already flip.

Note the standing rule it must obey: add a handed rule ⇒ add its flip to `transformElement`, never
a frame parameter to the element ([ADR 0016](adr/0016-component-instances-and-frames.md)).

### 5.5 · A syntax for overhead dashes — `todo`

`upper_cabinet` is drawn dashed because of *what it is*, and there is no way for an author to say
"draw this piece above the cut plane" about anything else. Any design has to decide whether it is a
clause on `furniture`, a property of a category, or a plan-level convention — and a dashed overhead
line is also what `roof` and `void` now draw, so the three should agree about what dashed *means*
before a fourth spelling appears.

### 5.6 · Angled furniture — `todo`

A fixture still draws on an **axis-aligned footprint**, so a piece against a sloped wall is not
turned to it. Deferred by name in v1.28.0. Related but not the same as 3.15 above (which is about
*measuring* against a curved wall, not drawing at an angle); both are instances of the fixture
layer knowing only rectangles.

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
| P2-9 | `outdoor <kind>` + floor-material hatches + auto legend | `todo` | Hatches must be **scale-aware**; do not copy `patternUnits="userSpaceOnUse"` with fixed pixel sizes, which does not scale with drawing scale |
| P2-8 | Targeted dimension selection (dimensions on named walls/fixtures) | `todo` | Composes with the sheet layer |
| P2-2 | Room-relative door hand | `todo` | **Behaviour change for every plan with a reversed wall — must be staged.** (a) an advisory `W_*` naming the doors whose hand would move, zero geometry change; (b) the flip behind a release boundary, goldens re-blessed after review. Check the `place … mirror` goldens specifically: `frame.ts`'s `det < 0` handedness flip must compose with the new rule, not fight it |

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
