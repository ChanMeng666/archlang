# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Seven defects from `docs/backlog.md`. Most made a machine-readable answer quietly **wrong** rather
than visibly absent — the direction a reader never catches by eye. No language change: no new
keyword, no new `E_*`/`W_*` code, nothing removed from the public surface.

**Three drawings move in total, each for a stated reason.** All 30 shipped examples were compiled
under v1.32.0 and under this tree and SHA-256 compared: `furnished-flat` (its source gained a
`range_hood` and a `mirror`), and `clinic` and `terrace-row` (each mirrors a placed component
containing a handed fixture — three `desk`s and two `bed`s, five of the 74 fixtures drawn across the
placed plans, identified by element id rather than by eye). Every other drawing is byte-identical —
so the circulation rewrite, which corrected every furniture-derived clear width by 600 mm, moved not
one pixel of anything.

### Fixed — silent wrong answers

- **A piece drawn through a CURVED wall linted clean** (backlog 3.15). `wallIntrusionDepth` measures
  in a wall segment's own frame, which has no meaning on an arc — the across-wall direction turns
  along the run — so it declined any arc-bearing segment outright. It now measures, in closed form
  and without tessellating: a `t`-thick wall on an arc of radius `R` is the **annular sector**
  restricted to the arc's own sweep, so the across-wall axis is the **radius** and the along-run axis
  the **angle**, and both questions the straight branch asks carry over unchanged. The arc's
  tessellated band is a *drawing* artifact whose facet count is a rendering decision — the same
  reason a circular room's area is exact rather than the 48-gon the grid layer draws — so the
  measurement must not depend on it. `repair` gains no push direction: a curved wall still declines,
  now naming a radius rather than a normal, which the lint rule's widening makes mandatory rather
  than optional. No shipped example changes a single diagnostic.

- **A mirrored `place` drew the wrong-handed symbol** (backlog 5.4) — a left-handed sofa in a
  right-handed wing, every number right and the picture wrong. The survey is the finding: **19 of the
  83 catalogued families are handed**, not one, and chirality is **footprint-dependent** —
  `counter`, `fridge`, `upper_cabinet`, `hedge` and `motorcycle` are handed at some aspect ratios and
  symmetric at others, because their detail is tiled and the tile count comes from the aspect. A
  per-family flag therefore *cannot express the truth*, so chirality is **derived**: the glyph is
  reflected and the reflection kept only when it is a different drawing, measured at the finest
  precision any backend serializes, so *symmetric* means exactly *would emit the same bytes*. The
  flip lives in `transformElement`, per ADR 0016, XORed so a nested reflection composes back to the
  identity; `mirror x` and `mirror y` differ only in the derived quarter-turn.

- **Plan JSON re-emitted a resolver-derived position as an authored one** (backlog G.4), which `grid`
  then re-snapped — so the plan that came back was not the plan that went in. The authored form was
  not recoverable after `resolve()` (its `inset`/`segment`/`offset` are expressions), so the clause is
  now recorded during resolution and emitted **alongside** the resolved coordinates: the round-trip
  re-*derives* the position and there is nothing left to re-snap. `against wall` was affected too and
  is fixed; relational rooms, `strip` and opening attachment are not, because those are still snapped
  at resolve time and re-emitting a snapped value is idempotent.

  **Schema compatibility, measured with ajv rather than reasoned:** backward-compatible, and
  forward-incompatible for exactly one key. `additionalProperties: false` sits on the furniture
  **item** as well as the top level, and the break is **`flush` alone** — every other placement key
  was already *declared* in the published 1.32.0 schema (declared but never emitted). A consumer
  pinned to 1.32.0 rejects payloads for plans using `anchor … flush`: 12 of the 30 shipped examples.

### Fixed — rules that refused correct drawings

- **`W_FURNITURE_OVERLAP` had no notion of a piece above the cut plane** (backlog 5.7), so two of
  v1.32's own correct drawings warned: a `range_hood` over the hob and a `mirror` over the basin.
  Both had been **removed from `examples/furnished-flat.arch` rather than nudged somewhere false** —
  the furniture flagship was missing two correct drawings because of a rule. Both are now restored.

  The rule asks one three-valued question of the catalogue — `cutPlaneLayer()` →
  `underlay | body | overhead` — instead of comparing two flags: two pieces can only collide when
  they sit on the same side of the plane the drawing is cut at. That also settles, for free, the pair
  neither flag's own documentation covered — a rug with a wall cabinet over it. The test stays on the
  **pair**, so two rugs still warn and so do two wall cabinets.

  **The consumer sets deliberately differ**, which is the point of not making this `underlay` spelled
  backwards: an overhead piece is exempt from the overlap rule but is **kept as an obstacle by both
  walkability grids**, because a rug is walked *on* while a wall cabinet is not walked *under* (a body
  is 1700 mm; a wall unit's underside is ~1400). `solidFurniture()` is therefore untouched, so the
  three `buildNav` callers cannot diverge over a per-call-site exemption. The clearance rule gets no
  new arm on purpose — every overhead family is also `requiresWall` and already skipped — and a test
  pins that premise, so a future ceiling-hung family turns it red.

- **`W_PATH_TOO_NARROW` went CLEAN as the obstruction grew** (backlog 5.8) — the failure direction
  a reader never catches by eye. Deepening one cabinet in `examples/furnished-flat.arch` took the
  plan from "squeezes to 300 mm" through "100 mm" to **clean**. Three independent defects, and the
  backlog entry named the cause of none of them:

  1. **The false clean.** An unreachable room was `continue`d out of the circulation facts, and the
     rule iterated exactly that array — so a room sealed by furniture left the rule's domain and
     warned about nothing. `W_ROOM_NO_CLEAR_PATH` did not catch it either: at 500 mm the whole plan
     returned **zero diagnostics of any code**. The rule now walks rooms in source order and reads
     `circulation.blocked`; a plan with nothing blocked emits byte-identical diagnostics in
     identical order.
  2. **The number was one body diameter short — on every plan ArchLang has ever measured.** The
     clearance distance transform is seeded on body-radius-eroded cells, so its hop count is a
     body *centre's* freedom, and that was being read as a width.
  3. **The threshold carve tried an opening's centre and stopped.** A cabinet whose halo just missed
     the midpoint left a one-cell doorway; a **deeper** cabinet fell through to a fallback that
     opened the whole threshold. *The plan with more furniture measured wider.*

  **The reported width is measured, not fabricated.** A sealed room has no widest-path reading, so
  the model re-runs the grid with a descending body radius and reports the widest way in — paid only
  when something is sealed. "Seals every way in / 0 mm" is now reserved for a genuine zero.

  **Two shipped examples gain a warning**, both true positives verified from source coordinates:
  `furnished-flat`'s Kitchen and `tiny-house`'s Wet room, each sealed at 400 mm against a 700 mm
  minimum. Nothing loses a warning; no `ok` flag or exit code moves anywhere in the corpus.

- **Plan JSON silently dropped `dims auto`** (backlog G.3). The setting lived on the resolved
  plan as `ir.autoDims` with no field in `PlanJson`, so `planJsonToArch` never re-emitted it and
  a round-tripped plan came back without its dimension chains. On a plan with no `paper` the
  drawing extent **is** the reference dimension, so losing the chains rescaled every line weight
  and moved the whole title-block band — with **no diagnostic**. Bisected to that one clause;
  three shipped examples were affected, `garden-loft`, `one-room` and **`laneway-house`, the
  signature plan**, the last previously unreported. `dims_auto` is projected **only when
  declared** (the `site` rule), so every pre-existing payload is byte-identical, and
  `AUTO_DIMS_MODES` is interpolated from `src/ast.ts` into the type, the validator and the
  schema rather than retyped into any of them.

  **Schema compatibility, measured with ajv rather than read off the text:** the change is
  backward-compatible but **not forward-compatible**. Every existing document still validates.
  A document the new `planToJson` produces *from a plan that declares `dims auto`* is rejected
  by the published 1.32.0 schema, because the top level is `additionalProperties: false` — so a
  consumer pinned to the old `schemas/plan.schema.json` will refuse payloads for exactly the
  plans this fixes. Plans without `dims auto` emit no key and stay valid under both.

- **`arch compile --json` with no `-o` wrote files nobody asked for** (backlog G.2). `--json`
  requests a structured result on stdout and no `-o` names an output file, yet `compile` still
  dropped `<stem>.svg` — and one `<stem>.L<n>.svg` per storey — beside the source. That is the
  shape of a scripted "just check it compiles" loop, and it littered this repo's own `examples/`
  during the v1.32 integration. It now writes nothing, and says so positively: **`written: false`**
  takes the slot `output`/`outputs[]` occupied, while `bytes` still reports the size of the render.

  The rule is one predicate at two call sites, applied uniformly across every branch — clean plan,
  multi-storey fan-out, and a broken plan under `--error-svg` — because a split rule would be more
  surprising than the behaviour it replaced. Everything that *names* a target is untouched:
  `-o <file>` writes, `-o -` streams, the no-flag default still writes `<stem>.svg`, and
  `preview`/`batch`/`md` are unaffected.

### Changed

- **`describe --json`'s circulation numbers move on 23 of the 30 shipped examples**, and this is a
  correction rather than a regression: every furniture-derived `bottleneckClearWidthMm` had been one
  body diameter (600 mm) short, and walk distances fall or stay equal because the threshold fix gives
  routes strictly more options. A field-level diff confirms **only** circulation fields changed — no
  room, area, adjacency, opening, freedom or totals value moves. `circulation.blockedRoomIds` did not
  exist in a release, so nothing published changes shape; the field ships as `circulation.blocked`,
  an array of `{ roomId, widestWayInMm }`.
- **`arch watch … --json` with no `-o` now re-reports on each save instead of re-writing
  `<stem>.svg`.** `cmdWatch` re-enters `cmdCompile`, so the rule above reaches a second command.
  Pinned by two live end-to-end cases rather than left to follow by construction — `watch` did
  not watch at all for twenty-five releases precisely because nothing invoked it end to end.
- **`--error-svg` is inert in exactly one combination** (`--json` with no `-o`): the card is
  rendered, so `bytes` is real, but nothing is written and the bytes are **not** smuggled into the
  payload. Emitting them there was weighed and rejected — the `--json` envelope reports facts
  about a render and has never carried content, so an unbounded content key appearing only when
  no `-o` was given would make the error path the sole exception to a deliberately bounded
  envelope. Pass `-o <file>` to get the image. The clause is declared per-command, since the
  sentence is false for `preview`/`batch`/`md`.
- Note for consumers of `compile --json`: the payload has **never** carried the drawing — `output`
  is a path and `bytes` a count — so the above removes one accidental route to the bytes. The
  deliberate routes are `-o <file> --json` and `-o -`, both now in the manifest's worked examples.
  It also makes the agent spec's long-standing `# stdin, no temp file` claim true for the first
  time.

### Tests

- `test/plan-json.test.ts` no longer **samples** the corpus, which is why a lossy clause hid for
  so long: every `examples/*.arch` either round-trips or sits in `CANNOT_ROUND_TRIP` with a reason
  **and a `proof` regex asserted to still match the file**, so an exclusion cannot rot into
  decoration. Non-vacuity is proven by reverting the emit line (7 tests fail). One exclusion is
  labelled a **defect rather than a design boundary**: `two-bed.arch`, where `planToJson` re-emits
  a resolver-derived position as an authored `at (x,y)` that `grid` then re-snaps.
- `test/cli.test.ts` gains an 8-case file-writing suite asserting **both** directions with
  `readdirSync` listings — it previously asserted nothing about side effects in either direction.

## [1.32.0] - 2026-08-28

**The furniture catalogue.** v1.28.0 gave every fixture word a symbol; this release makes every
one of those symbols a drawing. Twenty-six new families take the catalogue from 57 families and
96 words to **83 and 129**, and **fourteen symbols that already existed were redrawn** — the ones
that still read as a rectangle with a line in it, several of which were not distinguishable from
each other. No new keyword, no new `E_*`/`W_*` code, nothing removed from the public surface: a
fixture category is DATA, and this is the catalogue growing, not the grammar.

**Three behaviour statements to make plainly.** (1) **`describe()` and `lint()` do not move.**
Held SHA-256 identical, example by example, across all **30** shipped plans against the v1.31.0
release commit — 24 drawings changed, **0 summaries and 0 diagnostic sets** — so the net lint
change across the shipped examples is zero and no `arch describe --json` consumer sees a
different byte. (2) **Only the furniture layer moved.** The diff over the twenty committed
example SVGs is 825 changed lines across 18 drawings, every one attributed to a CAD layer:
**692 on `A-FURN`** and **133 on `A-ANNO`**, the latter being the legend swatches, which are
drawn from the same symbols. No `<text>` element moved, position included, so no room label,
area, dimension, schedule row or legend row shifted. (3) **`island` is no longer `symmetric`**
— a data correction, not a behaviour change, since `orientationMatters` is
`(requiresWall || directional) && !symmetric` and an island is neither, so it still derives no
rotation and still never trips `W_FIXTURE_BACK_TO_ROOM`.

### Added — twenty-six fixture families across five domains

Each is one `FIXTURE_FAMILIES` row plus one `CATALOG` entry plus a draw function — never a new
element, never a `switch` arm. All twenty-six are appended in one block at the **end** of the
table, never slotted in beside their domain neighbours, for the one reason that table has: its
order **is** the legend's order, so slotting `dresser` in beside `wardrobe` would re-order the
legend of every shipped plan that draws a robe.

- **Bath** — `bidet` (400 × 700, wet, 450 mm clearance), `urinal` (400 × 350, wet, 450 mm) and
  `mirror` (900 × 50). A bidet is a WC with no cistern: a small tap block at the back where a WC
  has a full-width tank, and a waste on the bowl centre. A urinal is the only symbol in the
  catalogue drawn as **half** a shape — a wall-hung urinal has no back, so the chord across the
  top of its bowl is the wall face and the symbol runs to the very edge of its footprint. A
  mirror is the glass with five 45° reflection ticks, the one mark that survives being eighteen
  times longer than it is deep.
- **Kitchen & utility** — `laundry_sink` · `laundry_tub` (600 × 500, wet, 600 mm clearance),
  `water_heater` · `boiler` (600 × 600), `range_hood` (900 × 500), `microwave` (500 × 400) and
  `bar_counter` (1800 × 600). A laundry tub is one deep double-rimmed bowl against the kitchen
  sink's pair. A water heater is the cylinder in plan with two pipe ticks to the wall — the pipes
  are what make it a service rather than a `fire_pit`, and are why it is not `symmetric` though
  its outline would be. A range hood is drawn **entirely dashed**. A bar counter derives **one
  stool per ~1.2 counter-depths of run**, capped at eight, so an 1800 mm bar draws four and a 4 m
  bar draws eight.
- **Bedroom** — `bunk_bed` (the lower mattress with its pillow at the head, the upper deck
  **dashed** over it, and the ladder rungs at the foot), `crib` · `cot` (carcass, mattress and
  the rail bars down both long faces, read off the footprint's own long axis), `dresser` ·
  `chest_of_drawers` (the drawer band, its splits and three handles, all on the room side) and
  `vanity` · `dressing_table` (the mirror band **dashed** at the wall side, stool in front).
- **Living & dining** — `fireplace` (the chimney breast with the firebox cut into its *room*
  face), `radiator` (fins ticked across the depth at a clamped pitch), `sideboard` · `buffet`,
  `loveseat` · `sofa_2`, `chaise` (a back down one long side and a raised head — the asymmetry
  is the symbol), `tv` (wall-mounted: a bracket and a panel), `coat_rack` and `shoe_cabinet` (a
  tilt line per door, leaning toward the room).
- **Office & misc** — `meeting_table` (the `dining_table` rule — the footprint includes its
  chairs — with an eased top and **ring** seats), `reception_desk` (an L counter with the chair
  inside the L), `filing_cabinet`, `locker`, `pool_table` (six pockets, the two middle ones found
  off the footprint's own long axis) and `treadmill`.

Five decisions worth stating rather than reading off the rows:

- **Six of the eight kitchen-and-bath families are `requiresWall`**, which is that flag's home
  ground after the outdoor tranche had to argue its way out of it:
  `bidet`/`urinal`/`laundry_sink`/`water_heater` are plumbed, and `mirror`/`range_hood` hang off
  the fabric by definition — the `upper_cabinet` case, not the plumbing one. `microwave` and
  `bar_counter` are `directional` instead: both have an unmistakable front, neither needs a pipe,
  so a bar floated in an open-plan room raises nothing.
- **`fireplace` and `radiator` are `directional`, not `requiresWall`**, even though both are
  plainly serviced. Neither can be flagged without warning on a normal drawing — a radiator is as
  often fed from the floor as from the wall and lives under a window, and a free-standing stove
  mid-room is a plan someone drew on purpose. `requiresWall` keeps its single meaning: **services
  and nothing else**. None of the eighteen living/bedroom/office families carries it.
- **`loveseat` and `chaise` are NOT `directional`**, for the reason `sofa`, `chair`, `bench` and
  `outdoor_chair` are not: seating is arranged, not installed.
- **`tv` is a separate kind from `tv_unit` rather than an alias.** 80 mm of panel and 450 mm of
  console are different amounts of floor, and a plan that draws the first where the second
  belongs has taken 370 mm of walkway away.
- **The dashed outline is now the drawing's convention, not one glyph's.** It means *above the
  cut plane*, and four fixture symbols use it — the wall cabinet, the range hood, a bunk bed's
  upper deck and a vanity's mirror band — alongside `roof`, `void` and the outdoor `pergola` and
  `shed` ridge, all through one `dashedPattern()` helper.

`clearanceMm` is set for exactly four of the new families: `dresser`, `vanity` and
`filing_cabinet` at 600 mm (a drawer or a chair) and `treadmill` at 900, the largest figure in
the catalogue and the one thing a gym plan can be wrong about in a way that matters.

`src/elements/glyph-lib.ts` gains `easedRing`, moved **verbatim** out of `glyphs-living.ts` now
that the reception counter is its second caller, and `drawSofa`'s body becomes a
`sofaBody(r, g, divisions)` in that module that `drawLoveseat` shares — also verbatim. Every
shipped sofa and the L-sofa keep their exact bytes, which is what verbatim buys.

### Changed — fourteen fixture symbols redrawn

Primitive counts are measured at three footprints (900 × 900, 2400 × 700, 1800 × 600), because
several symbols read their own aspect and draw a different piece of equipment either side of a
threshold rather than inventing one answer that is wrong for half the plans.

| Kind | Was | Now | What it gained |
|---|---|---|---|
| `island` | 2 | 7 / 9 | an eased worktop, a seating overhang with cabinet ticks under it, and **by aspect** a hob (four burners, at 1.8 or over) or a sink bowl at one end. It was a slab nosed on all four sides, which is a box inside a box |
| `upper_cabinet` | 2 | 3 / 5 / 6 | a door split per 600 mm module — guarded exactly as the counter's division ticks are, so a legend swatch degrades to the plain outline — and a hinge tick at each end of the back edge. A dashed empty rectangle on a plan is a `void`; this is now cabinetry |
| `dishwasher` | 3 | 7 | two basket lines across the tub and a door leaf with its control strip and handle, replacing a dial in the middle of a box, which is a washing machine's drawing |
| `oven` | 4 | 8 / 12 | three knobs on the back edge, a door seam, a window and a handle bar; **a footprint of aspect 1.6 or over is a range** and gains four burners |
| `fridge` | 4 | 5 | a door face line, a handle **bar** rather than a stub, and a compartment split placed by aspect — down the width of a side-by-side, across the depth of an upright |
| `washer` | 4 | 7 | a control panel across the back with two knobs and a white **porthole** at the drum's centre. `dryer` is untouched and keeps its three chords: the two are the same box at the same size and now differ by more than a circle count |
| `coffee_table` | 2 | 6 / 7 | a generous corner radius, four legs, and a tray line across it past 1.6 : 1 |
| `table` | 2 | 6 / 7 | square corners, four legs, and a board line **along** its length past 1.6 : 1 |
| `stool` | 2 | 3 | the pedestal foot, as a third **concentric** circle |
| `bench` | 3 | 7 / 8 | a clamped run of slats and a support across each end |
| `chair` | 3 | 5 | an armrest each side, and a cushion that no longer crowds its own outline |
| `tv_unit` | 3 | 6 | two drawer splits and a handle, below the shelf line, facing the room |
| `nightstand` | 3 | 6 | the lamp moved into the back third, plus a drawer front and handle at the room side |
| `desk` | 3 | 7 | a drawer pedestal with two drawer lines, and the cable grommet |

`coffee_table` and `table` used to differ only by a corner radius of 0.12 against 0.08 on the
same two primitives, which is not a difference a reader can see; `chair` was a box with a line
across it; `desk` was a `table` with a rule; `washer` and `dryer` were the same box at the same
size. Each pair is now told apart by construction rather than by decoration.

**The stool's third circle is concentric on purpose, and the obvious alternative is wrong.** A
ring of three or four foot dots maps onto itself as a *set* under a quarter-turn while each node
lands where its neighbour was — so the SVG bytes would move for a drawing nobody can tell apart,
and `test/glyphs-living.test.ts`'s byte-identical-rotation law would fail. A circle centred on
the pivot maps onto *itself*.

**The re-bless was reviewed rather than blessed.** Eighteen of the twenty committed README SVGs,
the inline snapshots, and eleven PNG goldens moved; the diff was classified by CAD layer before
it was accepted (see the behaviour statements above). That `describe()` and `lint()` did not move
is proved rather than asserted: the committed `examples/<name>.svg` files are the compiler's own
drift-gated output, so feeding each *pre-release* drawing into the byte-identity digest bodies —
with the summary and diagnostics taken from the **new** code — reproduces all thirteen previous
hexes exactly. Only the drawing moved.

The three byte-identity law suites therefore now carry a **second pin over the summary half
alone** (`semanticDigestWith`: the same payload with the SVG removed). It is blind to the
drawing, so it survives a release like this one untouched — its values are the original v1.30.0
measurement, unchanged — and the next redraw does not have to make the argument again. If one of
*those* numbers moves, the finding is real.

### Changed — the agent spec's size cap, 28,300 → 28,600

Measured, not estimated, from the quantity the test asserts on: 27,940 → **28,191**. All 251
characters are the `furniture` line's catalogued-footprint list growing by the twenty-six new
families, every one of which has a footprint and therefore joins a list the generator
**interpolates** from `CANONICAL_FIXTURES`. The arithmetic closes exactly — 8 kitchen-and-bath
names are 71 characters plus 8 separators = 79, and 18 living/bedroom/office names are 154 plus
18 = 172. Nothing else in the document moved, which is the expected shape for a release that adds
no keyword, no clause and no error code. There is still no duplication left to trim, so this is a
raise with the growth named; 28,600 buys 409 characters of headroom, in the band the last two
raises bought.

### Fixed

- **`test/cli-manifest.test.ts`'s fixture scrape skipped any category name containing a digit.**
  Its `case "([a-z_]+)"` class has no `0-9`, so `sofa_2` — the loveseat's alias, and the first
  catalogued name with a digit — was invisible to the guard, which then reported a category
  advertised by `arch manifest` and *not drawn* while it was drawn three lines away. A
  set-equality gate that under-matches fails in the direction that looks exactly like a real
  defect, which is the worst way for one to fail.
- **`test/glyphs-outdoor.test.ts` pinned the outdoor families as the TAIL of the canonical
  vocabulary.** That was true only while outdoor was the newest tranche, and the table's own
  comment asks every later tranche to append after it — so the assertion was pinning a property
  the suite does not own. It now asserts the block is **contiguous and in order**, which is the
  property that actually protects the legend. (Both furniture tracks found this independently and
  wrote the same fix.)

### Deferred by name

- **Fixture-word completion in the VS Code extension.** The LSP completes keywords and ids but
  not the 129 category words, which is now the largest closed vocabulary a plan author has to
  remember and the one most worth offering.
- **A per-category `style`.** `style <kind> { … }` reaches the fixture layer as one kind; there
  is no way to give `tree` a different pen from `sofa`. The symbols are drawn with named line
  weights already, so the seam exists — the syntax does not.
- **An `overhead` exemption in the furniture rules** — `docs/backlog.md` 5.7.
  `W_FURNITURE_OVERLAP` has no notion of a piece that hangs above the cut plane, so the two
  correct drawings of this release's own additions raise it: a `range_hood` over the hob and a
  `mirror` over the basin. Both were therefore left out of `examples/furnished-flat.arch` rather
  than nudged somewhere false. `underlay` already solves the symmetric case from below through one
  shared predicate; the flag from above wants the same discipline and a different consumer set,
  which is a semantics change and not this release's.
- **`W_PATH_TOO_NARROW`'s reported width is non-monotonic in the obstacle's depth** —
  `docs/backlog.md` 5.8. Found while placing hall furniture in the flagship: deepening one cabinet
  from 200 mm to 600 mm takes the plan from "squeezes to 300 mm" through "squeezes to 100 mm" to
  **clean**. The false clean is the half that matters. It does not reproduce at a small plan's grid
  pitch, which points at the area-scaled nav grid rather than the rule's arithmetic.
- **Angled furniture** — `docs/backlog.md` 5.6. Every symbol is still drawn upright in its
  footprint and quarter-turned; a piece at 30° needs the footprint, the overlap rule and the
  clearance rectangle to learn about rotation together, and doing one of the three is worse than
  doing none.

### Shipped alongside

- **MCP shim `@chanmeng666/archlang-mcp` 0.2.12** — version-bump-only an eighth consecutive time
  (`git diff v1.31.0..HEAD -- packages/mcp` is empty), re-pinned to `^1.32.0`. **Two of its five
  baked resources moved**, and which two is the whole point: `spec.llm.md` and `llms-full.txt`
  carry the widened `furniture` footprint list, because the generator **interpolates** it from
  `CANONICAL_FIXTURES`, while `grammars/archlang.gbnf` and both `schemas/*.json` are SHA-256
  byte-identical to 0.2.11's. That is correct, and it is the 0.2.8 shape rather than the 0.2.11
  one: a fixture category is a catalogue entry, not a grammar token, so a constrained decoder
  pointed at the published GBNF can already emit every one of the twenty-six new words. The bump
  exists because the two documents that TEACH a model which words have a symbol did move, and
  because the dep range must be re-pinned — an unbumped manifest edit silently never publishes.
- **VS Code extension `ChanMeng.archlang` 0.21.0** — dep range `^1.32.0`, rebundled against the
  1.32.0 core, so hover and the fixture lint rules know all 129 category words and the twenty-six
  new families' footprints, clearances and flags. Completion still does **not** offer fixture
  words — that is this release's first deferred item, and it is now the largest closed vocabulary
  a plan author has to remember.

## [1.31.0] - 2026-08-28

**Outside the wall line.** Every previous release drew what is inside a building; this one draws
the ground it sits on, the things that stand on that ground, and the door between the two. Two
parallel tracks: `outdoor`/`fence`/`site … boundary` as drawn, measured, non-room GROUND, and 21
outdoor fixture families plus `uses garage` and the sixth door kind, `door garage`. New flagship
`examples/garden-house.arch`.

**Three behaviour changes to state plainly.** (1) **A yard is not a room.** Ground area is real and
reported — `describe --json` gains `outdoor[]`, `fences[]`, `totals.outdoor_area_m2` and
`site.lot_area_m2` — but it never enters `totals.floor_area_m2`, `rooms[]`, `schedule rooms`, the
access graph or Plan JSON, and a consumer that wants plot coverage adds the two having decided that
is what it means. (2) **The dashed-overhead convention is now settled**, by `door garage` being the
fourth thing to want it: a dashed outline means a thing above the horizontal cut a floor plan is
taken at, and every such outline now comes from one `dashedPattern()` helper. (3)
**`examples/hillside-villa.arch` changes bytes** — its garage door is the `garage` kind and its
garage room is `uses garage`; its three deliberate lint warnings are unchanged.

### Added — ground surfaces, fences and a site lot line

Three new drawing surfaces. None of them is a room, none of them obstructs anything, and
all three are additive: a plan that uses none renders, describes and lints exactly as
before, pinned by SHA-256 over the whole agent-facing surface in
`test/outdoor-byte-identity.test.ts`.

- **`outdoor [id=] <kind> (at (x,y) size WxH | polygon (x,y) …) [label "…"] [rail <edges>]`**
  — the ground a building sits on, in nine kinds: `lawn`, `planting`, `paving`, `deck`,
  `gravel`, `water`, `driveway`, `patio`, `balcony`. Each draws a **scale-aware material
  hatch over a flat tint**, on `L-PLNT` (planting), `L-SITE` (hard landscape) or
  `A-FLOR-BALC` (a balcony slab) — three CAD layers rather than one, because a CAD user
  freezes by trade. Seven new hatch patterns join the existing wall library in one shared
  table; every dimension steps off the drawing's reference dimension, so a pattern is the
  same size **on the sheet** at 1:50 and at 1:200 (`gravel`'s scatter comes from a frozen
  table, never `Math.random()` — `compile()` is deterministic).

  **A ground surface is not a room.** It is absent from `describe().rooms`, from
  `totals.floor_area_m2`, from the drawn `schedule rooms` table, from the access graph,
  from `input_graph`, from the circulation model and from Plan JSON. Its own facts are
  `describe().outdoor[]` and `totals.outdoor_area_m2`, both appended only when a plan
  declares a surface. Area is the exact shoelace on the ring spelling, and the drawn label
  sits at the ring's pole of inaccessibility — the shape, never the bounding box.

  **It obstructs nothing**, water included; that is a stated v1 simplification, deferred by
  name in `docs/backlog.md` rather than half-answered per kind. It does join the page
  bounds, which on a plan with **no** `paper` rescales every line weight exactly as a
  far-flung `column` or a `roof overhang` already does — so a site plan wants a `paper`.

  A `balcony` rails every edge with no wall along it, derived at each edge's own midpoint;
  `rail top|bottom|left|right|all|none` overrides. Under `place … rotate`/`mirror` the edge
  names are carried by their outward normals through the frame, so a mirrored wing's
  railing lands on the mirrored edges. With `legend`, each ground material used adds a row.

- **`fence [id=] [picket|panel|post] { (x,y) … [close] }`** — a posted boundary line on
  `L-SITE`, drawn above the ground fills and below the building. The style word **leads**
  (a trailing `style` word would be ambiguous with the `style <kind> { … }` statement).
  **Not a thin wall:** no thickness, no poché, it hosts no opening, it is absent from
  `describe().walls` and it joins no graph. A gate is deferred by name rather than
  approximated by letting a door host onto a fence. `describe().fences[]` reports
  `length_mm` and `closed`.

- **`site { … boundary (x,y) … }`** — the lot line, drawn as a dash-dot property line on
  `C-PROP` and the one part of `site` that draws anything or joins the page bounds.
  `describe().site` gains `lot_area_m2` (exact shoelace) and `lot_bbox`. A `site` with only
  `street`/`hemisphere` is byte-identical to before, and that law is pinned.

Nine new codes, every one a refusal rather than an approximation: `E_OUTDOOR_SIZE`,
`E_OUTDOOR_POLY_DEGENERATE`, `E_OUTDOOR_POLY_SELF_INTERSECT`, `E_OUTDOOR_RAIL`,
`E_FENCE_CURVED`, `E_SITE_BOUNDARY_DEGENERATE`, `E_SITE_BOUNDARY_SELF_INTERSECT`, plus the
advisory `W_OUTDOOR_OVERLAPS_ROOM` and `W_BALCONY_NO_DOOR`. New Theme keys `lawn`, `water`,
`paving` and `outdoorStroke` across all four palettes, with `STYLE_KEYS` rows for both
elements. Closes backlog item **P2-9**.

### Added — twenty-one outdoor fixture families

`furniture` gains a site vocabulary: **21 families / 37 names**, taking the catalogue from 36
families and 59 names to **57 and 96**, all drawn by a sixth domain module
(`src/elements/glyphs-outdoor.ts`). `tree` (`deciduous_tree`) · `conifer` (`pine`) · `shrub`
(`bush`) · `hedge` · `bbq` (`grill`, `barbecue`) · `outdoor_table` (`patio_table`) ·
`outdoor_chair` (`patio_chair`) · `umbrella` (`parasol`) · `bicycle` (`bike`) · `motorcycle` ·
`hot_tub` (`spa`) · `swing` (`swing_set`) · `trampoline` · `bin` (`wheelie_bin`) · `mailbox`
(`letterbox`) · `ev_charger` · `pergola` · `sandpit` (`sandbox`) · `fire_pit` · `shed`
(`garden_shed`) · `clothesline` (`washing_line`).

No new keyword and no new element: a fixture family is a row in `FIXTURE_FAMILIES`, a `CATALOG`
entry and a draw function, which is exactly what this is. Two conventions are specific to outdoors
and both are decisions, not defaults:

- **Nothing here is `requiresWall`.** That flag means SERVICES, and `W_FIXTURE_FLOATING`'s own
  remedy line says so ("supply/waste/venting runs in the wall"). A `hot_tub` is plumbed and is
  still set *down* on a deck, so a tub mid-terrace is the normal arrangement; an `ev_charger` is
  wired and is as often on a bollard as on a wall. Outdoors the wall is the exception.
- **Planting draws unfilled.** A canopy overhangs ground that has to keep reading through it, so
  `tree`/`conifer`/`hedge`/`pergola` carry no fill, and the pergola outline and the shed's roof
  ridge are dashed for the `upper_cabinet` reason: above the cut plane.

Five are `directional` (`bbq`, `bin`, `mailbox`, `ev_charger`, `shed`) and those same five carry a
footprint, so `against wall` needs no `size`. `outdoor_chair` deliberately is not — seating is
arranged, not installed. Ten are `symmetric`, and that claim is proved against the real
`rotateNode` rather than asserted. `bbq` is the only one with a frontal clearance (900 mm at an
open grill); the hot tub has none, because a symmetric piece has no front to measure one from.

Existing plans are unaffected: no shipped example uses any of the new words, so every committed
SVG, snapshot and golden is byte-identical.

### Added — `uses garage` and `W_GARAGE_TOO_NARROW`

A thirteenth room use. `room … uses garage` classifies a room as a garage, and a room labelled
"Garage" classifies as one from its label alone; "Carport", "Car Port" and "Parking" classify
through an *alias*, which raises the existing advisory `W_ALIAS_MATCH` asking you to pin the tag.
`garage` is appended to `USE_KINDS` and to the label classifier's emission order, so no existing
plan's `describe().rooms[].uses` array changes.

One new warning, **`W_GARAGE_TOO_NARROW`** (advisory, no machine fix — widening a room is a
geometric decision the compiler does not make): a garage whose short side is under **2700 mm per
parked `car`** is too narrow to park in. The warning quotes the width required, the width the room
has, and the shortfall. Three calibration decisions worth stating:

- **2700 mm per bay, not 3000.** A 5500 mm double garage is a normal, buildable layout —
  `examples/hillside-villa.arch` has one — and a rule that warns about it is a false positive.
- **An empty garage is measured against one bay.** A room you could not park in does not become
  sound by having no car drawn in it. `bicycle` and `motorcycle` do not occupy a bay.
- **The rule declines a POLYGON room** rather than measuring its bounding box. A box's short side
  is not a concave floor's clear width, and a measurement taken from a shape's box instead of the
  shape is the defect class this compiler has already shipped six instances of.

In Plan JSON, `garage` maps to the RPLAN `Storage` room_type (where `utility` already goes; RPLAN
has no garage category) and an explicit `uses` tag round-trips unchanged.

### Added — `door garage …`, the sixth door kind

A sectional/roller door: `door [id=] garage (at (x,y) | on <wall> at <pos>) width <mm> [wall <id>]`.
It draws a panel in the reveal, a tick at each jamb, and a **dashed overhead projection** — a
rectangle the opening's width and half that deep, capped at 1200 mm — into the room.

**It takes no clause at all**, the first kind whose `DOOR_KIND_CLAUSES` row is entirely `false`,
and each refusal is its own argument rather than a blanket one:

- `hinge` and `slide` — the leaf travels **up**, not around a jamb and not along the wall.
- `swing` — the panel parks overhead *inside the building*, and which side that is is a fact about
  the plan rather than a choice. The resolver derives it by probing one wall thickness off each
  face and asking which side has floor (the same poly-aware rule `swing into <room>` uses, so it is
  right on a courtyard and on a concave room); when neither side is a room — a garage door in a
  garden wall — it falls back to the wall's own `+normal` side, exactly as before.
- `open` — a sectional door retracts **vertically, out of the plan's cut plane**, so there is no
  intermediate position a plan can draw. A clause that changed nothing would be silent-error
  design.

`doorSwing()` returns `null` for it (so `W_SWING_OBSTRUCTED` cannot apply, as for every non-hinged
kind), `describe().doors[].kind` reports `"garage"`, `arch fmt` round-trips it, and every rule that
measures the *doorway* rather than the leaf is unchanged: it connects the same two spaces, counts
as an entrance, and its clearances measure the same opening. Under a mirrored `place` the
projection stays inside the mirrored building, because it reads `swing`, which `frame.ts` already
flips when the frame reflects.

**This settles the dash convention — half of `docs/backlog.md` item 5.5.** That item asked that
`upper_cabinet`, `roof` and `void` "agree about what dashed means before a fourth spelling
appears"; this is the fourth, and the agreement:

> **A dashed outline means a thing above the horizontal cut a floor plan is taken at.**

Everything that draws one now derives its pattern from the single `dashedPattern()` helper and sets
`lineType: "dashed"` beside it. (The three older dashed rules in `door-panels.ts` dash for a
different reason — redrawing an edge a leaf covers — and keep their own raw pattern with no named
type.) The `todo` half of 5.5, a *syntax* for saying "draw this piece overhead", is unchanged.

### Added — `examples/garden-house.arch`, the outdoor flagship

Thirty shipped examples, up from 29. A two-storey family house on a 22 × 22 m suburban lot, drawn
the way a house is actually issued: as a **site plan**, where the building is half of it and the
other half is ground. A2 landscape at 1:100, with `site … boundary`, `dims auto overall`,
`schedule rooms`, `legend` and a title block.

Twelve ground surfaces across eight of the nine kinds (driveway, front and back paving, patio,
deck, pool, two lawns, gravel, three planting beds, and a level-2 balcony), a `panel` fence round
the pool and a `picket` one along the street, a garage with `uses garage` and a `door garage`, and
15 of the 21 outdoor fixture families at their catalogued footprints with no `label` on any of them.
`describe --json` reports `outdoor_area_m2` 220.7 beside `floor_area_m2` 136.5 — the two numbers
this release exists to keep apart.

`arch validate` is clean. `--strict` reports exactly **one** warning, named in the file header as
deliberate: `W_ROOM_NOT_EQUATOR_FACING` on Bedroom 2 — on a two-band plan one bedroom takes the
street aspect, and the rule is an advisory drafting heuristic, not a daylight measurement.

Authoring it also produced a second warning that turned out to be a **finding rather than a layout
mistake**, and it is fixed in this release rather than shipped: `W_BATH_VIA_BEDROOM` on a bathroom
that opens straight off the landing, which `describe --json`'s own `doors[].between` said all along.
See the balcony-door entry under **Fixed** below and `docs/backlog.md` item **4.6**.

Also `test/v131-cross.test.ts`, the cross-feature gate neither track could produce alone (the v1.29
precedent). A `garage` door derives which side its panel parks on by probing which face has floor,
and the other track introduced a `driveway` on exactly that face — so the same door is asserted
**geometry-identical** with and without it, with a fourth case pinning the paint difference (ground
joins the page bounds, which on a plan with no `paper` rescales every line weight) so the geometry
comparison cannot be misread as a byte-identity law. And the ASCII backend's ground skip is by
LAYER NAME, so a `tree` standing on a lawn must still print while the lawn does not — asserted as a
differential in both directions.

### Changed — `examples/hillside-villa.arch`

`r_garage` is tagged `uses garage` instead of `uses storage`. `describe --json` reports
`uses: ["garage"]` for that one room; **nothing else moves** — both storeys' SVG are byte-identical
and `arch lint` reports the same three warnings the showpiece has always carried
(`W_BATH_VIA_BEDROOM` ×1, `W_ROOM_NOT_EQUATOR_FACING` ×2). The 5500 mm double garage clears
`W_GARAGE_TOO_NARROW`'s 5400 mm by 100 mm, which is the calibration above doing its job.

`d_garage` is the `garage` kind instead of `sliding … slide left` (same 3000 mm width). Measured
before and after: `describe --json` differs in exactly two places (`doors[2].kind`, on the plan and
on level 1), `arch lint` reports the same three warnings, and the drawing changes — a sectional
panel with its overhead projection where two bypass panels on two tracks used to be. The committed
`examples/hillside-villa.svg` is re-rendered accordingly.

### Changed — the agent spec's size cap, 26,000 → 28,300

`spec.llm.md` grew from 25,911 characters to **27,940**, and `test/llm-spec-drift.test.ts`'s cap
moves to 28,300 — 360 characters of headroom, comparable to the 371 the v1.29.0 raise bought. The
whole of the growth is "this language grew", which is the argument that note requires: ~1,100 for
`outdoor` (nine kinds, four refusals, two warnings, and three behavioural facts that are invisible
from the syntax and wrong if guessed), ~470 for `fence`, ~150 for `site … boundary`, +305 for the
sixth door kind, +38 for six new catalogued footprints joining the furniture line's size-optional
list, and +17 for `uses garage`.

Both element lines were written, measured and cut back **before** the raise. The note also records
something the merge itself taught: each track measured its own growth against a document that did
not yet carry the other's, so 25,911 + 1,964 + 360 predicts 28,235 while the merged generator emits
27,940. The number in the cap is the measured one.

### Fixed

- **An `outdoor` surface's name and area now join the same obstacle-aware label pass a
  room's do**, so a `dims auto` chain run across a terrace no longer sits on top of its
  label. `garden-house`'s deck (and, it turns out, its patio, which had the identical
  collision hiding behind the same missing pass) both read clean now; the pass is a no-op
  on every plan with no `outdoor` label, and `test/outdoor-byte-identity.test.ts` stays
  green. `src/label-placement.ts`, `src/elements/outdoor.ts`, `src/scene-build.ts`.
- **A balcony door no longer GROUNDS its storey.** `verticalReach`'s `grounded()` predicate
  treated any exterior door as an arrival point, so an upper storey with only a balcony
  door was "grounded" by a door that leads onto a 7 m² slab — suppressing the stair's own
  `arrivalRooms` entry and routing `garden-house`'s reachability BFS through the main
  bedroom instead of the landing, which raised a spurious `W_BATH_VIA_BEDROOM` on a
  bathroom that in fact opens straight off the landing (`docs/backlog.md` 4.6). Fixed
  narrowly: an entrance door whose outward probe — one host-wall thickness off the door's
  own centre, on the side with no room — lands inside an `outdoor balcony` is now
  discounted from grounding; every other exterior door is unaffected. A lint sweep over
  all 30 shipped examples moved exactly one — `garden-house` loses its
  `W_BATH_VIA_BEDROOM` — and `describe()`'s per-storey `access.hasEntrance` stays the
  honest, undiscounted fact that a floor has a door. `src/analyze.ts` (`levelIsGrounded`),
  `src/lint.ts`, `src/describe.ts`.
- **`A-ROOF` has been missing from the DXF LAYER table since v1.29**, so
  `examples/bungalow.arch` exported a DXF referencing an undeclared layer for two releases.
  The closure test that was supposed to catch it stayed green throughout, because its
  fixture plan had no `roof` in it and `roof` rides a pass that was already covered — a
  gate is only as strong as its corpus. `A-ROOF` and `A-FLOR-OVHD` now have rows, the
  fixture carries one of every element that sets a `layerName`, and the layer-name rule is
  widened from a hardcoded `A-` prefix to the three NCS disciplines the tree now uses.
- **The ASCII backend read ground surfaces as rooms.** It identifies a room structurally —
  a polygon on the `floor` pass — so a lawn drawn round a house printed its own name three
  times and overwrote every room's name with it. Found by looking at `-f txt` output rather
  than by reading the code; the ground is now excluded from the room and furniture passes
  alike.
- **`repair()`'s change log recorded an unrounded float while the emitted source carried
  the rounded value.** `planWrite` promises that the source repair is about to write
  resolves back to the position it reports, but it computed that position in full float
  precision while `formatPlan` prints every number through `fmt3` — so a log could say a
  piece went to `y = 1117.9999999999982` while the plan it handed back said `y 1118`. A
  consumer diffing the change log against its own plan saw a disagreement that was not
  there. **Pre-existing since at least v1.30.0** (reproduced byte-for-byte against that
  tag's `src/`), and found by `test/fuzz.test.ts`'s round-trip property, which failed on
  roughly one run in five — a flake that would have failed `prepublishOnly`, not merely a
  CI leg. Both write forms are fixed at the one place the target is planned: an absolute
  `at` is reported as the printer will write it, and an `inset` rewrite rounds the INSET
  — the number the source actually carries — and reads the position back out of the
  placement's own linear model. No second rounding rule was added; `repair.ts` reads
  `fmt3`'s output back. `src/repair.ts`, `test/repair.test.ts`.

- **Two hand-typed copies of the `uses` value set in Plan JSON.** `src/plan-json.ts` kept its
  validator's allow-list **and** `PLAN_JSON_SCHEMA`'s `uses` enum as hand-typed twelve-name
  literals. Both are interpolated from `USE_KINDS` now. This was not theoretical: adding a
  thirteenth use kind left `planToJson` emitting a document its own `planFromJson` rejected with
  `E_JSON_SCHEMA` — a round trip failing on a plan the compiler accepts, with `check:drift` green
  throughout, which is precisely the v1.26.0 defect class.

### Infrastructure

- **`release.yml` retries the MCP registry publish**, up to 6 times 20 s apart, and only that step.
  The v1.30.0 release failed there because the registry's validation of `server.json` against the
  just-published npm package 404'd on a version the same job had published moments earlier;
  `gh run rerun --failed` then succeeded with no change, which is the signature of a race. A
  genuinely bad manifest still fails loudly, two minutes later. (`docs/backlog.md` 4.7.)
- **`README_SVGS` is 20**, up from 19, and the README gallery leads with `hillside-villa` and then
  `garden-house`.

### Deferred by name

Recorded so the next reader finds a decision rather than an omission; the full text is in
`docs/backlog.md` §4.5 and §4.8.

- **Ground in the circulation model.** An `outdoor` surface obstructs nothing — you can walk on the
  lawn, and on the `water`. A pond, a gate in a fence and a stepping-stone path all want the same
  answer, so the question is one piece of work rather than a per-kind special case.
- **A curved fence** (`E_FENCE_CURVED`) — the post pitch, the panel offset and `length_mm` are all
  measured along a straight run.
- **A polygonal balcony** (covered by `E_OUTDOOR_POLY_DEGENERATE`) — the railing is derived per
  named EDGE, and a ring has no such names.
- **`outdoor` in Plan JSON** — deliberately absent, and pinned so: `planToJson` is byte-identical
  with and without ground. Adding it is a schema change and should be argued as one.
- **`dims auto` chains cross an `outdoor` surface attached to a facade.** On `garden-house` both
  storeys' exterior chains run over the paving and the balcony that abut the walls they measure —
  legible, because a dimension line is thin and the ground is a tint, but not what a drafter would
  issue. The chain offset is computed from the BUILDING's extent, and ground is not part of it; the
  fix offsets the chain past the outdoor extent of the facade it is measuring, which is a change to
  a rule every plan uses and wants its own pass rather than a release-eve edit
  (`docs/backlog.md` **4.8**).

### Shipped alongside

- **MCP shim `@chanmeng666/archlang-mcp` 0.2.11** — version-bump-only again (`git diff
  v1.30.0..HEAD -- packages/mcp` is empty), re-pinned to `^1.31.0`. Unlike 0.2.10, this one exists
  for the reason the pack-time law describes: **four of its five baked resources moved**, because
  this release does change the language surface. `spec.llm.md`, `llms-full.txt` and
  `grammars/archlang.gbnf` all carry `outdoor`, `fence`, `site … boundary`, `door garage` and
  `uses garage`, and `schemas/plan.schema.json`'s `uses` enum gains `garage` — so published 0.2.10's
  GBNF cannot DERIVE any of the new statements, and a constrained decoder pointed at it is unable to
  emit them at all. `schemas/intent.schema.json` is byte-unchanged, correctly: none of the new
  surface enters an intent contract.
- **VS Code extension `ChanMeng.archlang` 0.20.0** — dep range `^1.31.0`, rebundled against the
  1.31.0 core, so completion, hover and the lint rules know the new keywords, the nine ground kinds,
  the twenty-one outdoor fixture families and the nine new diagnostic codes.

## [1.30.0] - 2026-08-28

**"one boundary for a set of walls, and the optional dependency a drawing no longer needs"**, a
MINOR. No language change — no new keyword, no new `E_*`/`W_*` code, nothing removed from the public
surface. What changed is how a wall becomes a drawing. The three lowering paths a plan used to be
routed between — an axis-aligned rectangle boolean for orthogonal walls, a `clipper2-wasm` polygon
boolean for angled ones *when that optional dependency happened to be installed*, and per-segment
rectangles with untrimmed face lines for anything curved — are replaced by **one closed-form pass
with no dependency**, so junctions are trimmed, corners are mitred exactly at any angle, and every
opening is cut on every host: straight, angled and curved alike. See
[ADR 0018](docs/adr/0018-zero-dep-wall-joinery.md).

**Every shipped example renders different bytes**, and `describe()` and `lint()` do not move — held
SHA-256 identical across all 29 examples and every storey, measured example by example before and
after. This is a rendering change and nothing else. One new Scene primitive, `path`, carries a wall
outline with a curve in it; `ScenePrim` stays append-only and all five backends handle it.
`clipper2-wasm` moves from `optionalDependencies` to `devDependencies`, where it remains the angled
oracle for the test suite, and the `GeometryBackend` API is kept, documented deprecated, and a no-op
for rendering. `toScene` gets about 3× slower; the cost is measured, stated plainly below, and
accepted as backlog item 4.1.

Also in the tag, with no `src/` change: the examples-and-gallery refresh — a new showpiece flagship
`examples/hillside-villa.arch` (29 shipped examples, up from 28), a repaired `two-bed.arch`, a
furnishing and eaves sweep across the corpus, a re-rendered showcase, and a 19-picture README
gallery.

### Wall joinery — one zero-dependency pass for every wall

Until now a plan's poché and wall faces came from **one of three** lowering paths chosen by the
shape of the walls: an axis-aligned rectangle boolean for orthogonal walls, a `clipper2-wasm`
polygon boolean for angled ones *when that optional dependency happened to be installed*, and
per-segment rectangles with untrimmed face lines for anything curved. There is one path now, in
closed form, with no dependency. See [ADR 0018](docs/adr/0018-zero-dep-wall-joinery.md).

**Every shipped example renders different bytes.** `describe()` and `lint()` do not move: held
SHA-256 identical across all 29 examples and every storey, measured example by example before and
after. This is a rendering change and nothing else.

#### Fixed

- **Junction lines drawn inside another wall's solid.** A partition met an exterior wall and its two
  face lines carried straight on through the poché, stopping mid-hatch. Visible at every junction in
  every multi-material plan, and at every junction with a curve.
- **Loose per-segment rectangles on angled and curved walls.** An oblique or curved wall was a row of
  separate square-capped boxes; where two segments shared a corner both drew their own cap and the
  seam showed. Corners are mitred now, exactly, at any angle, and bevelled past `MITER_LIMIT · h` so
  the fill and the stroke agree about where a spike stops.
- **Openings that did not open.** Only the rectilinear boolean subtracted anything, so on an angled
  or curved wall a "doorway" was an opaque cover painted over unbroken wall, overhanging the faces
  onto the floor. `examples/hexagon-pavilion.arch`'s 1200 mm drum drew both of its face circles
  running *through* all six of its doorways. Every opening is cut on every host now — straight,
  angled and curved — with radial jambs on a curve.
- **A drawing that depended on an optional install.** Registering `clipper2-wasm` changed an angled
  plan's bytes. It cannot any more, and `test/union.test.ts` asserts that in both directions.
- **A closed curve was capped at its seam.** `wallBand` read the `close` keyword to decide whether a
  run was a ring. That keyword is what makes `segmentsOfWall` *add* a closing segment, not a
  declaration about the result — and for a curve it is unavailable, since a closed curve is written
  as the two halves it is. The drum picked up two square caps at its seam, each standing `h` proud of
  the curving face: a 100 mm step, 1200 mm tall, at 3 o'clock only.
- **The cased opening's dashed lintel lines.** Two per opening, one at each wall face. They were a
  convention borrowed from a drawing where the wall was not severed; over a real hole they re-bridge
  the gap. Removed, with no opt-in.

#### Changed

- **New Scene primitive `path`** — a start point plus line and *minor* arc edges, carrying a wall
  outline that has a curve in it. `region` is unchanged and is still what an all-straight wall set
  emits, which is what keeps every rectilinear plan on the bytes it had. `ScenePrim` is append-only;
  all five backends handle it.
- **`RenderCtx.openingsVoided` is now always `true`.** It existed because the answer used to depend
  on the shape of the plan. The field stays (append-only) and stays optional, so a hand-built
  `RenderCtx` keeps the safe opaque default. The door's and the cased opening's covers are therefore
  emitted `fill: "none"` at the wall's own half-extent, not painted at `h + wallStroke`.
- **`Runtime.backend`, `setGeometryBackend`, `getGeometryBackend` and `loadClipperBackend` are
  no-ops for rendering.** All are kept and documented deprecated in every place a reader lands.
- **`clipper2-wasm` moves from `optionalDependencies` to `devDependencies`**, where it remains the
  angled oracle for `test/joinery-oracle.test.ts`. The `webpackIgnore`/`@vite-ignore` comments and
  every bundler `external` list are unchanged.
- **`wall.bounds` measures the band**, so a plan's extent — and on a plan with no `paper` every
  derived line weight — can move at a non-right-angled corner. `segmentRectangle` square-caps both
  ends of every segment, and at a corner those caps are phantom. The extent SHRINKS at an obtuse
  corner, GROWS at an acute one up to the bevel limit, and is exactly equal at a right angle. Exactly
  two shipped examples are affected and both shrink: `gallery-l` by 61 mm each way and
  `hexagon-pavilion` by 45 × 120 mm. No rectilinear plan moves.

#### Re-blessed, every one reviewed

33 SVG snapshots, 23 PNG goldens, the 19 committed README SVGs, and the four
`test/roof-void-byte-identity.test.ts` digests. The snapshot diff was classified by primitive and
each PNG pixel-diffed against its predecessor to confirm the changed pixels land where the geometry
changed. `test/fixture-byte-identity.test.ts` and every rectilinear `test/__ascii__/*` golden did
**not** move, and that is asserted rather than assumed.

#### Performance — a measured regression, stated plainly

`toScene` gets slower. Across all 29 shipped examples and every storey, measured
back-to-back against `main`: **57.5 ms → 162.0 ms, +182%** (mean per storey 1.98 → 5.59 ms;
slowest single plan `library`, 6.75 → 16.0 ms). On the `bench` harness: OPENING_HEAVY (400
disjoint walls, 600 openings) **5.96 → 116.3 ms**, BALANCED +53%, ROOM_HEAVY +23%.

OPENING_HEAVY is the honest worst case: it is exactly what the retired axis-aligned
rectangle sweep was fastest at, and exactly what an exact split-classify-chain algorithm
cannot match. The gap is algorithmic, not constant-factor — halving the largest single
phase would recover about 11% of `toScene`.

**Accepted 2026-08-28; tracked as backlog item 4.1.** Correctness at every junction on
every shape of wall, with no optional native dependency, is worth roughly 3× a pass that
costs 5.6 ms per storey on average and 16 ms on the slowest real plan. A rectilinear fast
path was considered and rejected — one algorithm is the point of ADR 0018. The phase
profile and the directions that stay inside the one algorithm are in backlog 4.1.

#### Deferred, by name

- The **window's** cover still paints opaque at `h + wallStroke`; it has never consulted
  `openingsVoided`, so nothing about a window's drawing changed here. Bringing it to `fill: "none"`
  at half-extent is its own change, with its own golden churn.
- **DXF `LWPOLYLINE` with bulge** for curved outlines (native `ARC` + `LINE` entities today).
- **Join styles other than mitre** (round, square). `band.ts` mitres and bevels at the limit.
- **Removing the `GeometryBackend` API** — a MAJOR.
- **A near-corner lint.** Nothing warns when a door's jamb leaves less wall between it and a corner
  than the wall is thick. The nib draws correctly; it just reads as a chamfer at page scale.
  `W_DOOR_CLEARANCE` and `W_POCKET_RUN` ask different questions.

### Examples & galleries

A source-only refresh — no `src/` change, no new keyword, no new `E_*`/`W_*` code. Four parallel
tracks landed together (`feat/example-villa`, `feat/examples-homes`, `feat/examples-public`,
`feat/showcase-129`) and merged clean onto disjoint files.

- **New flagship `examples/hillside-villa.arch`** — the SHOWPIECE: a two-storey villa with an
  attached garage on one A2 sheet at 1:50, putting the whole language in one plan — `site`
  orientation, a polygon reading nook and an L-shaped master suite, a bowed `arc` bay, all five door
  kinds, a two-level `stair` shaft, a `void` over the double-height living room, a `roof overhang`,
  and a mirrored pair of ensuite bathrooms composed from one `component` (`place … mirror x`). Every
  room is reachable and every doorway clears; three `arch lint` warnings — `W_BATH_VIA_BEDROOM` ×1,
  `W_ROOM_NOT_EQUATOR_FACING` ×2 — are left in on purpose and explained in the source, so it is NOT
  strict-clean by design. 29 shipped examples, up from 28.
- **`examples/two-bed.arch` repaired** — it shipped `arch validate` `ok:false` with six warnings
  including `W_NO_ENTRANCE` (no real front door) since it entered the README front page; it now
  compiles clean, has a proper entrance, `roof overhang 500`, and is furnished throughout.
- **Furnishing sweep across the corpus**: `laneway-house` (a `rug` under the living group),
  `furnished-flat` (now on a sheet — A3 portrait, `schedule`), `bungalow` (now on a sheet — A3
  landscape, `schedule`), and light-to-full furniture passes on `museum`, `aquarium`, `gallery-l`
  (also tried against `theme presentation`), `library`, `transit-hall`, `clinic`, `accessible`,
  `relational`, `themed`, `materials`.
- **Eaves (`roof overhang`) added** to `tiny-house`, `courtyard-house`, `townhouse` (top storey) and
  `two-storey` (L2).
- **Showcase re-rendered under v1.29.0**: all ten `docs-site/public/showcase/*.png` and
  `docs/showcase.md`'s numbers refreshed against the current compiler (e.g. `tweet-house` now 290
  bytes, `railroad-apartment` now 14 warnings) — the drawings had rotted behind the roof/void and
  furniture-glyph releases.
- **README gallery restructured**: `hillside-villa` leads as the hero drawing; `two-storey`,
  `tiny-house`, `gallery-l`, `museum` and `materials` join the picture gallery (none had an image
  before); `README_SVGS` grows from 13 to 19 entries, all pinned bidirectionally against the README's
  own `<img>` tags by `test/example-svgs-drift.test.ts`. Every changed example's playground `#z=`
  permalink was regenerated across the docs.
- **Playground**: a new leading "Showpiece" preset group (Hillside Villa) and the previously-missing
  "Furnished Flat" preset (Homes group); `DEFAULT_EXAMPLE` is now Hillside Villa, was Laneway House.
- **Docs site**: `docs-site/examples.md` opens with a new "The whole language on one sheet" section
  for the villa, ahead of "Start here"; the homepage's `SheetGrid.vue` grows a sixth sheet card
  (A-101, "The whole language on one sheet") and its "Reads its own plans" card renumbers to A-106.
- **Test-suite consequences worth reading, not just re-blessing**: `two-bed.arch` moving off
  `W_NO_ENTRANCE` and gaining a `roof` broke three pins that had quietly assumed it would never
  change — the corpus-wide `W_NO_ENTRANCE` list (`test/lint.test.ts`), the "no modeled entrance"
  fixture for the circulation-overlay suite (`test/overlay.test.ts`, now an inline door-free plan
  instead of a real example), and the Plan-JSON round-trip suite (`test/plan-json.test.ts`, moved to
  `attached.arch` — `roof`/`void` are deliberately absent from the JSON projection by design, so a
  plan using either can never round-trip byte-identically). `courtyard-house.arch` gaining its own
  `roof overhang` retired it from `test/roof-void-byte-identity.test.ts`'s baseline set (it no longer
  qualifies as "uses neither"); `gallery-l.arch` takes its slot as the CONCAVE-polygon representative.
  Furniture landing under two room names — `museum`'s cafe, `relational`'s kitchen — is a correct,
  asserted relocation in `test/label-placement.test.ts`, not a regression. `test/vocabulary-equivalence.test.ts`'s
  corpus pin gained `hillside-villa.arch`'s 20 rows (11 on the ground floor, 9 upstairs). While
  investigating the Plan-JSON round-trip fixture, found that `examples/garden-loft.arch` and
  `examples/one-room.arch` do **not** round-trip byte-identically through `planToJson`/`planFromJson`
  today — filed as a backlog item rather than silently worked around.

### Shipped alongside

- **MCP shim `@chanmeng666/archlang-mcp` 0.2.10** — version-bump-only (`git diff v1.29.0..HEAD --
  packages/mcp` is empty), re-pinned to `^1.30.0`. Of its five pack-time-baked resources **none
  moved**: `spec.llm.md`, `llms-full.txt`, `grammars/archlang.gbnf` and both schemas are
  byte-identical to v1.29.0's, correctly so, because this release changes no language surface. The
  bump exists to keep the shim's declared core range and its published version in lockstep with a
  core whose *rendering* moved, which is what a host gets when it resolves `^1.30.0`.
- **VS Code extension `ChanMeng.archlang` 0.19.0** — dep range `^1.30.0`, rebundled against the
  1.30.0 core (the extension bundles the core at build time, so a stale bundle would ship the old
  three-path lowering to every hover and diagnostic).

## [1.29.0] - 2026-08-26

**"two drawing-only elements, four furniture families, and one word for a thing you stand on"**, a
MINOR. Two independent tracks: `roof` and `void` — elements that draw and do nothing else — and four
new fixture families carrying one new piece of catalog semantics, `underlay`. Nothing is removed or
renamed, no `Theme` key is added, and **no existing plan changes bytes unless its own source gained
one of the new statements** — three of the 28 shipped examples take up the new syntax, and the other
25 render byte-identically to what `@chanmeng666/archlang@1.28.0` renders. The diagnostic catalog
grows from 74 errors to 82; the 42 warnings are unchanged.

### Added — `roof`, the eaves projection line

```
roof overhang <mm> [wall <id>]
roof polygon (x,y) (x,y) (x,y) …
```

One dashed outline of what oversails, on the `A-ROOF` CAD layer. **Drawing-only**: it adds no
`describe()` key, no lint rule and no schedule row, and `planToJson` is byte-unchanged by it — but
it *does* contribute to the drawing extent (see the bounds note below).

`overhang` offsets a **closed** wall ring outward by `thickness/2 + <mm>`, mitred in closed form
(line–line intersection, orientation from the shoelace sign), so it is exact at any angle and on
either winding. The ring is the named `wall`, else the plan's single closed `exterior` wall. It
**refuses rather than approximates**, with seven catalogued codes:

| Code | Raised when |
|---|---|
| `E_ROOF_AMBIGUOUS` | no closed `exterior` wall, or several — name one, or use `roof polygon` |
| `E_ROOF_WALL` | `wall <id>` names a wall that is unknown or not `close`d |
| `E_ROOF_OVERHANG` | the projection is zero or negative |
| `E_ROOF_CURVED` | the ring has an `arc` edge — the offset of a curve is deferred, so state the outline instead |
| `E_ROOF_SELF_INTERSECT` | the offset ring crosses itself (an overhang wider than a re-entrant notch) |
| `E_ROOF_POLY_DEGENERATE` | `roof polygon` has fewer than 3 effective vertices |
| `E_ROOF_PLACEMENT` | `roof` written inside a `component` body |

### Added — `void`, a hole in this storey's floor plate

```
void [id=<name>] at (x,y) size <W>x<H>
```

A stair well, an atrium, the gallery over a double-height room. Drawn as the conventional dashed
rectangle crossed by both diagonals, on its own `A-FLOR-OVHD` layer (AIA's overhead/open floor
layer), so a CAD user can freeze the voids without freezing the furniture. `E_VOID_SIZE` on a
non-positive size; rectangle-only in v1 — a polygonal void is deferred by name, not silently.

Three semantics worth stating, because each could have gone the other way:

- **It obstructs circulation, with its walkable halo suppressed on every edge.** You cannot walk
  across a hole, so its cells are blocked — but you can stand at the railing, so the body-radius
  halo is lifted on all four sides. That is the same `VerticalObstacle.open` mechanism a stair's
  entry edge already uses; blocking the approach too would report a landing beside an atrium as
  unreachable.
- **It does NOT subtract from the containing room's area.** A room's area is its floor area, and it
  is the one number `describe()`, `schedule rooms` and the drawn area label all report. `describe
  --json` gains a `voids[]` key (`id`, `at`, `size`, and the `room` whose floor holds the opening's
  **centre** — through the poly-aware containment test, never a bounding box) so a consumer needing
  the net figure can subtract it. **Area subtraction under a void is deferred by name.**
- **It rides the `furniture` render pass**, so the label-relocation post-pass already treats it as
  something a room name must not sit under — no new rule needed for that.

### Added — four furniture families, and the `underlay` mechanic

`rug` (`carpet`), `sofa_l` (`corner_sofa`), `piano` (`grand_piano`) and `sun_lounger` (`lounger`).
`sofa_l` is the only one with a catalogued footprint (2600 × 1600, the whole bounding rectangle of
the L); the other three carry none on purpose — a rug has no conventional size, and deriving a
`piano`'s rotation from a wall would face its keyboard into the wall.

**`underlay` is the new catalog flag**, and the rug is the whole reason for it: a piece that lies
flat on the floor, that other furniture stands on and people walk over. **One predicate,
`solidFurniture()`, is shared by all four consumers**, so the overlap rule, the clearance rule and
the two walkability grids can never disagree about what a rug is:

- `W_FURNITURE_OVERLAP` skips an underlay ⇄ non-underlay pair (a sofa on a rug is the arrangement,
  not a collision). **Two rugs overlapping each other still warn.**
- `W_FURN_CLEARANCE` never counts an underlay as blocking a fixture's frontal use-space.
- The nav grid (`analyze/circulation.ts`) and the per-room flood fill (`analyze/occupancy.ts`) both
  drop it from their obstacle list, so a rug across the only route into a room does not seal it off.
- `W_FURNITURE_WALL_COLLISION` deliberately **still** applies — a rug drawn through a wall solid is a
  drawing error whatever you can walk on.

The rug is also the only symbol drawn with **no fill at all**, so paint order cannot matter: a rug
written after the sofa standing on it still cannot hide it.

### Changed — examples whose bytes moved

Exactly three, each attributed to its own source edit before its snapshot and golden were re-blessed:

- **`examples/bungalow.arch`** gains `roof overhang 600`. Its one new element is an `A-ROOF` polygon
  at `-700,-700 12700,-700 12700,9200 -700,9200`; every other layer's element count and every
  geometry coordinate are unchanged, and the source with that single line removed renders
  **byte-identical** to the previous release.
- **`examples/two-storey.arch`** gains `void id=gallery` on level 2. **L1 is byte-identical**; L2
  gains exactly three elements on `A-FLOR-OVHD` and its A3 sheet does not re-fit.
- **`examples/furnished-flat.arch`** takes up the four new families (and `examples/lib/furniture.arch`
  grows to match): +32 elements on `A-FURN`, viewBox unchanged. Its lint goes from three
  `W_FURNITURE_OVERLAP` warnings to none — that is the `underlay` exemption working, since the three
  pieces now standing on the rug used to have no word for what they were standing on.

**Net lint change across all 25 untouched examples: zero** — swept before and after against a build
of the previous release, over `lint()`, `describe()` and the rendered SVG alike.

### Bounds growth — the one thing a `roof` can change about a plan that is not the roof

A `roof` contributes to the drawing extent, and **on a plan with no `paper` that rescales the whole
drawing's chrome**. This is the pre-existing unpapered-plan rule, not a roof behaviour: with no
sheet, `refDim = max(drawW, drawH)` and every stroke width, font size and margin is a fixed fraction
of it (`src/scene-build.ts`). `bungalow` declares `scale 1:100` and no `paper`, so its eaves grew
`refDim` from the 12200 mm wall span to the 13400 mm eaves span and every line weight scaled by that
ratio. Geometry did not move, no scale was re-fitted, and there is no `W_SCALE_OVERFLOW` — a plan
that declares `paper` sizes from the sheet instead, and a roof adds a layer there without touching
one other byte.

### Deferred by name, not silently

- The **offset of an `arc` edge** under `roof overhang` (`E_ROOF_CURVED` refuses; write `roof polygon`).
- A **polygonal `void`** — it needs the ring machinery `room polygon` has, and every consumer here
  (the nav grid, the room attribution, `frame.ts`) is written on a rectangle.
- **Area subtraction under a void** — `describe --json`'s `voids[]` gives the extent to subtract.
- **`sofa_l` chirality.** Its return is always on the LEFT and there is no right-handed twin;
  `place … mirror` will not produce one, because a reflection transforms a resolved element's
  position and not the symbol drawn inside it. A `sofa_l_r` category was rejected rather than
  forgotten — it would put the fix in the vocabulary, where every future handed symbol needs its own
  twin. The real fix is **glyph-aware mirroring in the `place` transform**.

### Notes

- **Neither new element adds a `Theme` key.** `roof` paints from the existing `annotationMuted` and
  `void` from `annotation`, reached through `STYLE_KEYS`, so `style roof { stroke … }` and `style
  void { stroke … }` work with no new palette entry. Both draw an unfilled dashed outline and
  nothing else, so `stroke` is the entire palette either one could have; `STYLE_KINDS` is derived
  from `STYLE_KEYS` rather than retyped; and `gen-llm-spec.ts` throws if the `opening` exception
  stops being exactly one word, so a silently unstyled element cannot appear.
- **`spec.llm.md`'s `## Keyword reference` loses its "Element clauses" bullet** (~475 characters of a
  hard per-request budget). It listed 48 attribute words as bare names a few lines below the element
  lines that already spell each one out. The partition guard only proved every attribute was
  *classified* as a clause, never that the classification was true; a new guard now proves each one
  is **rendered** in a code span or fence elsewhere in the document, which is what makes the bullet
  redundant rather than merely repetitive. If it goes red, render the clause in its element's
  grammar line — do not bring the bullet back.
- The diagnostic catalog grows from **74 errors to 82** (seven `E_ROOF_*` plus `E_VOID_SIZE`); the
  warning count is unchanged at 42.
- `arch describe --select voids` works, and `--level` correctly drops a storey's `voids` key. Both
  were holes found by driving the CLI: `DESCRIBE_KEYS` is now pinned by **set equality** over
  fixtures chosen to emit every conditional key, and the per-storey key list is a named list that a
  third such key joins for free.

## [1.28.0] - 2026-08-26

**"the furniture vocabulary the examples were already using, and the symbols it now draws"**, a
MINOR. `arch manifest` advertises **51 fixture categories across 32 families** where it advertised
18 across 9, and — the half that matters — **every one of the 51 has a plan symbol**. The words the
shipped examples had been writing for months (`bed`, `sofa`, `desk`, `wardrobe`, `dining_table`,
`car`…) used to fall through to "unknown category": no footprint, no wall semantics, and a labelled
rectangle where a drawing should be. They are now catalogued and drawn, across five domain modules
built on one shared drawing vocabulary (`src/elements/glyph-lib.ts`).

**Three behaviour changes to state plainly.** (1) **A drawn symbol ignores its `label`** — long-
standing for `wc` and `basin`, and now true of twenty shipped examples whose fixture labels stop
appearing in the drawing; the words remain in the source and in `describe()`. (2) **`requiresWall`
now means services, and only services** — flagging the new room furniture raised 23 spurious
floating-fixture warnings across nine shipped plans, so the flag stayed with the plumbed and vented
goods, and the derived quarter-turn moved to a **new `directional` flag** carried by the eleven
categories whose symbol has a back worth turning to a wall. Net lint change across every shipped
example, eval golden and fault fixture: **zero**, swept before and after. (3) **Every one of the 27
shipped examples that places a fixture renders different bytes** — 25 golden SVG snapshots, 21 PNG
visual goldens and eleven of the twelve committed `examples/*.svg` re-blessed in one reviewed pass
(`aquarium`, the one that places no fixture, is byte-identical), with the diff accounted for layer
by layer below. No new keyword, no new `E_*`/`W_*` code, no
`src/index.ts` removal. Also in the release: `examples/furnished-flat.arch` and
`examples/lib/furniture.arch`, a new `/showcase` docs page, and the extraction of `paper/` to a
private repository.

### Added — the room-furniture vocabulary, and the glyph layer it will be drawn on

**Thirty-three new fixture categories in twenty-three families** — `arch manifest` now advertises
**51 categories across 32 families**, up from 18 across 9 — `bed`, `double_bed`, `nightstand`
(`bedside_table`), `wardrobe` (`robe`/`closet`), `sofa` (`couch`), `armchair`, `coffee_table`,
`tv_unit`, `table`, `dining_table`, `chair`, `stool` (`barstool`), `bench`, `desk`, `office_chair`,
`bookshelf` (`bookcase`/`shelf`), `dishwasher`, `island`, `upper_cabinet` (`wall_cabinet`), `washer`
(`washing_machine`), `dryer`, `plant` (`planter`), `car`. These are words the shipped examples
already use and that fell through to "unknown category" until now: no footprint, no wall
requirement, no lint semantics. **`oven` is the one category that is not new** — it was catalogued
as a zone-only entry (it counted as a kitchen fixture and nothing else), and it gains a footprint
and a symbol here like the rest.

**All of them are now DRAWN**, across five domain modules. Every catalogued category has a plan
symbol — `hasFixtureGlyph` is true for all 51, and `test/fixture-classifier-drift.test.ts` asserts
that as an equality with the category list rather than a name literal, so a category added without a
symbol goes red. What each family draws:

- **Bath** (`glyphs-bath.ts`) — `wc` with cistern, lid lip, flush button and the seat ring inside
  its bowl; `basin` with tap block, spout and drain, plus a **double-bowl** branch above an
  integer-guarded aspect of 2.2; `shower` as the symmetric tray (outline, both diagonals, centre
  drain); `bathtub` with an uneven rim, thicker at the tap end.
- **Kitchen / utility** (`glyphs-kitchen.ts`) — `kitchen_sink`, `counter` with its 600 mm module
  ticks (capped at 64 runs), `stove` as four burner rings, `fridge` with door split and handle, and
  the new `oven`, `dishwasher`, `island`, `washer`, `dryer`, plus `upper_cabinet` drawn **entirely
  dashed**, the convention for a carcass above the cut plane.
- **Bedroom** (`glyphs-bedroom.ts`) — `bed` / `double_bed` with headboard band, turned-down sheet
  and one or two pillows (a property of the footprint, not the category name); `nightstand`;
  `wardrobe` with true-arc hanger scallops.
- **Living / dining** (`glyphs-living.ts`) — `sofa` with back band, an arm at each end and derived
  cushion divisions; `armchair`, `coffee_table`, `table`, `dining_table` with chairs, `chair`,
  `stool`, `bench`, `tv_unit`.
- **Office / misc** (`glyphs-misc.ts`) — `desk` with modesty panel, `office_chair`, `bookshelf`,
  `plant`, `car`.

**A drawn symbol ignores its `label`** — long-standing behaviour for `wc` and `basin`, and the one
consequence of this release an author will notice first. Twenty shipped examples carry a `label` on
a category that now draws, and those words stop appearing in the drawing; `examples/library.arch`
loses the most meaning, where `"Stacks"`, `"Reference"`, `"Picture books"`, `"Reading table"` and
`"Story bench"` were doing real annotation work. The labels remain in the source and in
`describe()`; only the rendered text goes. An uncatalogued word still takes the labelled-rectangle
fallback, which is now the ONLY path that renders a furniture label —
`test/fixture-byte-identity.test.ts` pins both halves.

**Not visible in the ASCII plan.** `arch compile -f txt` marks each fixture with the first letter of
its category at the piece's centre, and always has, so none of this detail reaches the text backend
and no ASCII golden moved for it. (`test/__ascii__/two-bed.arch.txt` did move, but because that
plan's bed was repositioned — see below — not because it is drawn.)

**Known limitation: a mirrored `place` does not mirror a symbol's handedness.** A glyph is generated
from its element's already-transformed rect at render time, so a reflection cannot reach inside the
symbol. Placing a component twice, once `mirror x`, leaves a fridge's handle 84 mm from its own right
edge in **both** instances where a true mirror would move it to the left. This predates the release —
`fridge` and `basin` were handed already — but it now applies to far more pieces. The footprint,
position and door swings mirror correctly; only detail inside a symbol does not.

**`requiresWall` now means SERVICES, and only services.** Every category that carried the flag
before was a plumbing or kitchen fixture, so its two jobs — "this needs a wall behind it"
(`W_FIXTURE_FLOATING`) and, through `orientationMatters`, the derived quarter-turn and
`W_FIXTURE_BACK_TO_ROOM` — never had to be told apart. Room furniture separates them, and the
separation was measured rather than decided: flagging the furniture pieces raised **23 new warnings
across nine shipped plans**, the largest group being **twelve** floating-stack warnings on
`examples/library.arch`, whose stacks are free-standing runs mid-floor. `W_FIXTURE_FLOATING`'s own
remedy line reads "supply/waste/venting runs in the wall", which is simply false about a bookcase.
So only the plumbed and vented white goods carry the flag, plus `upper_cabinet`, which hangs off a
wall by definition. A 550 mm wardrobe clearance was dropped for the same reason: it warned on
`examples/garden-loft.arch`, whose 3200 mm bedroom **cannot** satisfy it (600 + 550 + 2000 exceeds
the 3100 mm of clear depth), and the field's own calibration rule is "tight enough that a normal
layout never trips it". **Net lint change across every shipped example, eval golden and fault
fixture: zero**, swept before and after.

**New `directional` fixture flag — "this symbol has a back worth turning toward a wall, though it
needs no services."** Splitting `requiresWall` down to services alone left the derived quarter-turn
with no owner: `orientationMatters` read that flag, so an anchored bed stopped deriving a rotation.
That was correct while a bed drew as a labelled rectangle — a box has no back, so the rotation would
have been an invisible, unverifiable claim — and it is wrong now that the symbol has a headboard. So
`orientationMatters` becomes `(requiresWall || directional) && !symmetric`, and eleven categories
carry the new flag: `bed`, `double_bed`, `nightstand`, `bedside_table`, `wardrobe`, `robe`, `closet`,
`tv_unit`, `bookshelf`, `bookcase`, `shelf`. **`sofa`, `chair`, `bench` and `desk` deliberately do
not** — seating is arranged rather than installed, and a sofa's back to the room is a room-divider
layout, not a defect. Nor does anything `symmetric`, which still outranks both flags.
`W_FIXTURE_FLOATING` stays keyed on `requiresWall` alone, since its remedy prose is about supply and
waste runs. `against wall` was never affected either way; `placeAgainst` takes its rotation from the
wall for every category.

`W_FIXTURE_BACK_TO_ROOM`'s catalogue entry described only plumbing (a cistern, a tap, a nosing); it
now also names a headboard, a wardrobe's door line and a bookshelf's open face, and says plainly
that arranged seating does not trip it.

**`src/elements/glyph-lib.ts`** — the drawing vocabulary the symbols are built from: `poly`, `seg`,
`dot`, `ring`, `arcSeg`, the `ellipsePoly`/`roundedRectPoly` helpers moved up verbatim, and
`insetRect`/`insetRectXY`. Every factory sets **both** `paint.width` and a semantic `lineWeight`,
because the backends disagree about which they read — the SVG serializer prefers the name, the PDF
backend reads `paint.width` and nothing else, so setting one alone drops a glyph's stroke width from
one export. `weightWidth` moved out of `backends/svg.ts` into `scene.ts` beside `LINE_WEIGHTS` so
both callers resolve one ramp. The eight shipped families moved verbatim onto it.
`fixtures-glyphs.ts` keeps the vocabulary table and the dispatch
switch, and `FIXTURE_CATEGORIES` + the new `CANONICAL_FIXTURES` are now **derived** from one
`FIXTURE_FAMILIES` table rather than a hand-flattened list.

The five domain modules were written in parallel, each touching only its own file, then consolidated:
four helpers that all of them had derived independently — the short side of a footprint (all five,
three of them inline), a rect's centre, a NaN-safe clamp and an uneven four-sided inset — moved into
`glyph-lib.ts`, along with a dashed-polygon factory that had been rebuilding a furniture node by
hand. The lift is **render-byte-neutral**, proven by compiling six fixture-heavy plans to
SHA-256-identical SVGs before and after rather than asserted. Two helpers stayed local on purpose:
kitchen's `insetOutline` (an appliance-drawing convention, not a shape) and misc's `polar` (the only
module that uses trigonometry at all).

### Fixed

- **`rotateNode` passed an `arc` through unrotated.** A glyph's straight linework would turn and its
  curve stay facing north, with nothing to fail. Unreachable until `glyph-lib` handed every glyph an
  `arcSeg`; the switch is now exhaustive with no `default`, the guard `pdf.ts`'s `drawNode` grew
  after poché fell through its missing one. `test/furniture-curves-backends.test.ts` proves, by
  invocation rather than by reading, that a furniture-pass `arc` and `circle` reach all four
  backends.
- **`spec.llm.md`'s size-optional fixture list was retyped into the generator**, eight names and an
  ellipsis, and had already lost `lavatory` and `oven`. It is now interpolated from
  `CANONICAL_FIXTURES` filtered by `defaultFootprint` — exactly the predicate
  `furniture.resolve()` applies — guarded by `assertVocabRendered`, and **executed**: every named
  category must resolve `against wall` with no `size`, every unnamed one must raise `E_FURN_SIZE`.
- **`legendEntries` listed a row per catalogued category present**, on the assumption that
  catalogued and drawn are the same set. They no longer are, so it filters on `hasFixtureGlyph` —
  which asks the glyph rather than reading a flag beside it, so filling a stub brings its legend row
  with it.
- **The escape fuzzer's furniture-label injection site had stopped testing anything.** It drew a
  `desk`, and once `desk` drew a symbol the hostile payload no longer reached the SVG at all. The
  property FAILED rather than passing vacuously — which is the property working — and the site now
  uses an uncatalogued word, the one path that renders a furniture label. Six other assertions
  across `import`, `schedule` and `windows-furniture` used a label the same way, as a proxy for "the
  component rendered"; each now asserts on what the furniture layer actually emits.
- `examples/courtyard-house.arch`'s washer now carries `rotate 90`, putting the machine's back —
  where its supply and waste run — on the east wall it stands against. Nothing in the drawing moves
  (it is a plain rectangle); the SVG's vertex order does.
- **Six real defects the drawing could not previously show**, surfaced by `directional` across five
  plans and every one a piece standing against a wall with its back to the room. Three took the
  machine-applicable fix (`arch fix`): `examples/tiny-house.arch`'s wardrobe and
  `examples/courtyard-house.arch`'s bookcase and wardrobe each gained `rotate 180`. The three beds
  could not, and that is the rule working rather than failing — a 1500 mm-wide head cannot back onto
  the side wall each was standing against, so no unique target existed to offer:
  - `examples/attached.arch` — `anchor right` → `anchor top-right`. The east wall is the one edge
    that bed cannot back onto and it carries the window; the corner keeps the bed clear of the
    bedroom door's swing while still deriving a unique rotation.
  - `examples/relational.arch` — moved to the south wall with `rotate 180`; the room's boundary with
    the living room carries no wall, so it was the only candidate.
  - `examples/two-bed.arch` — bedroom 2's bed moved to the south wall with `rotate 180`, matching
    what the master bed already does against the north.

  After these five edits the whole example set lints **exactly** as it did before the flag: 15
  diagnostics, none gained, none lost, `examples/studio.arch` still clean and every plan's
  `validate --strict` verdict unchanged.

### Changed — every drawing with furniture in it

**All 27 shipped examples that place a fixture render different bytes**, on purpose: 25 golden SVG
snapshots, 21 PNG visual goldens and **eleven of the twelve** committed `examples/*.svg` the README
embeds were re-blessed in one pass — the twelfth, `aquarium`, places no fixture at all and is
byte-identical to v1.27.0, which is the byte-identity law doing its job on the README's own
drawings. `furnished-flat` joins `README_SVGS` as the thirteenth. The snapshot diff was reviewed per SVG layer, per example, and only three
kinds of thing moved:

- **`A-FURN` in all 25** — the release itself.
- **`A-ANNO` in exactly the four legend-bearing plans** — `clinic`, `courtyard-house`, `library`,
  `materials`. The legend lists one row per DRAWN symbol, so newly-drawing categories earn rows:
  `courtyard-house` gains nine (`bed`, `wardrobe`, `sofa`, `table`, `bench`, `desk`, `bookcase`,
  `washer`, `planter`), `library` three (`sofa`, `table`, `desk`), `clinic` and `materials` two each
  (`table`, `desk`). Each legend frame grew to fit, and `materials`' sheet re-centred by 170 mm on an
  unchanged A3 page as v1.27's `usablePlanMm` band reservation absorbed the taller table. **No plan
  raises `W_SCALE_OVERFLOW`** and none overflows its sheet.
- **`A-ANNO-TEXT` in three** — room labels the placement post-pass moved off newly-drawn furniture:
  `attached` and `two-bed` because their beds moved, `library` because its sofas, tables and desks
  now paint something to avoid.

`A-WALL`, `A-DIM` and `A-DOOR` did not move in a single snapshot. The two permanent byte-identity
pins — a plan with no furniture, and the unknown-`widget` fallback — are byte-identical to the day
they were written, checked line-for-line rather than eyeballed.

### Added — the flagship, the library, and four documents that named the wrong things

**New `examples/furnished-flat.arch` — the FURNITURE flagship.** Twenty-six of the thirty-two
catalogued kinds in one 90.7 m² two-bedroom flat, across all five symbol domains: a fitted kitchen
run with an island and a dashed overhead cabinet, a plumbed bathroom, two furnished bedrooms, a
lounge and dining zone, and a utility room where a washer stands beside a dryer — the same box at
the same size, told apart only by the chords across its drum. Every other shipped example draws a
fixture or two in passing; none of them exercises the glyph layer, so nothing in `examples/` would
have shown a reader what this release actually did. It is also the worked example for the two
things the layer changed about AUTHORING, both readable in the source rather than the drawing: not
one piece carries a `label`, because a drawn symbol ignores it, and most carry no `size` either —
`against wall <id> … in <room>` takes the catalogued footprint and derives the rotation from the
wall, so the whole kitchen, the whole bathroom and both beds are written without a hand-computed
number. `arch validate --strict` is clean, 0 diagnostics, none waived. Wired in the way every other
example is (snapshot, PNG visual golden, `README_SVGS` + a README embed, the docs gallery, and the
vocabulary corpus pin); `UPDATE_GOLDENS=1` wrote exactly one file and `vitest -u` added lines
without removing any, so no existing drawing moved.

**`examples/lib/furniture.arch` rebuilt** — thirteen components instead of five, no `label` on any
of them (each named a kind that now draws, so each word was reaching `describe()` and nothing
else), and the pieces with a catalogued footprint use it, so a component and the equivalent
`against wall` with no `size` draw the same rectangle. `double_bed` places the `double_bed`
category rather than a `bed` widened to 1800 — identical drawing, since the second pillow is a
property of the footprint, but it says what it means. `examples/imports.arch`, the one plan that
imports the file, compiles to a byte-identical SVG.

### Fixed — documentation that named the wrong symbol

**`docs/furniture.md` carried two rows that were wrong rather than merely stale**, in a way a
reader would act on. It listed "`basin` · `sink` — bathroom basin": `sink` is an alias of
`kitchen_sink`, not of `basin`, and it draws the KITCHEN sink — a counter slab with two bowls,
drains and a tap — so anyone reaching for `sink` in a bathroom on the strength of that row got a
two-bowl kitchen run. And it listed `oven` as an alias of `stove` drawing the cooktop symbol:
`oven` has its own glyph, no catalogued footprint and no wall requirement. A third error sat in the
placement section — "`offset <mm>` slides the piece along that segment from its start", when
`placeAgainst` puts the piece's CENTRE at `offset`, which is a metre out on a two-metre run.

The page is rewritten as five tables grouped by room domain, every canonical name with its aliases,
what its symbol draws, its footprint and its facing — transcribed from `fixtureSpec` /
`defaultFootprint` / `orientationMatters` by script rather than retyped, which is how the two alias
divergences worth documenting were found (`lavatory` satisfies no wet-fixture check, `sink`
satisfies both zones). It also writes down, for the first time anywhere, the label-free contract
and why the labelled rectangle is a deliberate escape hatch; the two aspect-driven branches and why
both read the footprint instead of the category word; `upper_cabinet`'s above-the-cut-plane dashes;
that a `dining_table`'s declared footprint is the whole eating zone, chairs included; and what
`-f txt` does with a drawn piece.

**Four more documents retyped the same eight-name fixture list** — `docs/language-reference.md`,
`SKILL.md`, `llms.txt` and the README — and all four were false by twenty-four families. One of
them, `SKILL.md`, feeds `llms-full.txt`, so the stale list was being served to cold-start agents as
bundled context. Each now states the rule and NAMES the machine-readable source
(`arch manifest --json` → `fixtureCategories`) instead of spelling out members a release can add
to; `docs/furniture.md` is the one place the catalogue is written out, and it earns that by putting
a footprint and a facing beside each name. `spec.llm.md` already interpolates its own list from
`CANONICAL_FIXTURES` and needed no change. `src/elements/furniture.ts`'s dispatch comment carried
the same stale claim and is corrected in the same pass (comment only, no behaviour change).

### Deferred, by name

Named rather than silently omitted, so nobody assumes they were overlooked: **angled furniture** (a
fixture still draws on an axis-aligned footprint, so a piece against a sloped wall is not turned to
it), **`rug`**, **`sofa_l`** (an L-shaped sectional needs a footprint the rectangle cannot express),
**`piano`**, **`sun_lounger`**, and a **syntax for overhead dashes** (`upper_cabinet` is dashed
because of what it is, and there is no way for an author to say "draw this piece above the cut
plane" about anything else).

### Added — the showcase gallery

**A new `/showcase` page on the docs site** carrying eleven compiled plans: the West Wing, Villa La
Rotonda, Bag End, de_dust2, The Skeld, Tweet House, the Friends apartments, 742 Evergreen Terrace,
Dunder Mifflin Scranton, a railroad walk-up and the McCallister house. Each plate gets its rendered
drawing, a short account of what the plan exercises, an "Open in playground" `#z=` permalink that
loads the real source, and a link to that plan's directory on GitHub. The sources live in the
separate [archlang-showcase](https://github.com/ChanMeng666/archlang-showcase) repository, not in
`examples/` — which is why the drawings are self-hosted PNGs under `docs-site/public/showcase/`
rather than live `<ArchLive>` widgets (the sources run 7–18 KB apiece), and why the page is
deliberately **absent** from `test/readme-permalink.test.ts`'s list: that guard asserts a permalink
decodes to an example that still exists, which would fail here by construction. All eleven were
verified by hand instead — each decodes to its `plan.arch` byte-for-byte and compiles with zero
errors. The page joins `test/docs-flags.test.ts`'s `DOCS` list, so the `arch` flags it names must
stay flags those commands declare. The README gains a compact Showcase section after the examples
gallery, hotlinking three images from the showcase repo; it adds no `<img>` pointing at
`examples/*.svg` and no `#z=` permalink, so the `README_SVGS` pinning and the permalink drift guard
are untouched.

### Changed — repository contents only; no `src/`, no language, no published artifact

**The papers moved out, to the private repository `ChanMeng666/archlang-paper`.** `paper/` (56
tracked files) plus `scripts/gen-paper-facts.ts` and `scripts/snapshot-paper-scale.ts` were
extracted on 2026-08-26 and removed here. The reason is not tidiness: one of the three targets is a
**double-anonymous** ICSE 2027 NIER submission, and its source was sitting in a public repository
named after its author. `paper/check-anon.mjs` reads the LaTeX and cannot see where the LaTeX is
hosted, so it reported a clean bill on a paper anyone could attribute in one click — a guard that is
sound about what it inspects and blind to the thing that actually mattered, which is the subject of
those very papers.

What that removes from this repository: the `paper:build` / `paper:check` / `paper:snapshot`
scripts, `gen:paper-facts` (also dropped from `gen:all`), the `paper/facts.{json,tex}` entry in
`scripts/check-drift.ts` — so `check:drift` now gates 22 artifacts across 9 generators, not 24
across 10 — and three `paper/`
exemptions in `biome.jsonc`. **The drift gate was not dropped, it MOVED**: it is
`scripts/check-drift.mjs` in the new repository, run first by that repo's `paper:check`, still
deriving every count from this repo's own `ERROR_CATALOG` / `KEYWORDS` / `LINT_RULES` /
`buildManifest()` through a sibling checkout. Regenerated there, `facts.json` and `facts.tex` come
out byte-identical to the copies committed here. `CITATION.cff` stays — it cites the software, not
the papers — with its `ZENODO.md` pointers re-aimed.

**Historical narrative moved to the private growth repository**, under
`archcanvas-growth/archive/archlang/`: `docs/archive/` (5 files, including
`agents-status-history-2026-07.md` and the frozen `WORK-LOG-v0.7-v1.15.md`), `docs/superpowers/` (3
design/plan documents), and the untracked `.superpowers/` agent logs. `AGENTS.md` and
`docs/adr/0013` now cite that path as inline code rather than as links — a relative link out of
`docs/adr/` breaks `docs:build`, since ADRs are copied flat onto the site.

**Seven unreferenced brand rasters removed** (`brand/archlang-icon.png`, `-black.png`, `-plum.png`,
`-app.png`, `-app-plum.png`, `archlang-wordmark-dark.png`, `-light.png`; 399 KB), archived to
`archcanvas-growth/archive/archlang/brand-rasters/`. Neither site mirrored them and
`test/brand-assets.test.ts` never named them. Each is a fill-swap render of the byte-sacred
`archlang-logo-master.svg`, so the master remains the way to produce one — restoring an archived PNG
never is.

Also deleted from the working tree, all untracked and regenerable: the 3.21 GB ecosystem-scan
package cache under `paper/experiments/ecosystem/cache/`, and 17 superseded `.vsix` builds under
`editors/vscode/` (`archlang-0.16.0.vsix` is **kept** — it is packaged and not yet uploaded to the
Marketplace).

## [1.27.0] - 2026-08-25

**One new language form, four lint rules that had been answering a narrower question than the
sentence describing them, and three sheet promises the drawing was not keeping.**
`door|window|opening … on <wall> at <pos>` now takes a full expression, which is what makes the
attachment form reachable from a `for` loop at all; and every lexer and parser refusal in the
language finally carries a code (`E_PARSE`), so the most common failure a generating model hits is
selectable by `--code` and explainable by `arch explain`. `arch repair` is idempotent by a pinned
law rather than by hope — 60 of 400 generated plans used to ping-pong forever, so which arrangement
it shipped depended on how many times you had run it. The sheet layer stopped writing
wall-thickness readings inside the poché they measure and started reserving the band its own margin
tables occupy. And the docs site can finally read the language it documents.

**Behaviour change: `arch lint` may warn on plans it previously passed.** Three of the four rule
fixes are widenings — an angled wall is now measured instead of skipped, a fixture is judged by its
footprint instead of its centre, and `W_NO_ENTRANCE` no longer stands down when a shell is drawn
without `exterior` walls. Every such warning is a real defect the rule already claimed to catch, and
one of them was hiding in a shipped example. No new `E_*`/`W_*` code for any of it.

**Type-level breaking change (advanced export, no runtime break).** `SheetFitInput.tableRows` is now
**required**, not optional. It is consumed by `resolveSheetSpec` / `fitsOnSheet` /
`chooseScaleDenominator` / `usablePlanMm`, so a TypeScript caller that constructs that object by hand
will fail to compile until it supplies the field. Nothing changes at runtime, and nothing changes for
`compile()`, the CLI, or any other public entry point. Required rather than optional is deliberate: a
caller that *can* forget the field is exactly how the margin band went unreserved for three releases.

**Output moves, on purpose, and every changed drawing is named below.** Fifteen of the 27 shipped
examples change bytes — precisely the fifteen that declare `dims auto all` — plus
`hexagon-pavilion`, `materials` and `terrace-row` from the lint and `flush`/`grid` fixes.
`examples/materials.arch` changes verdict to `fits: false` with `W_SCALE_OVERFLOW` (a true statement
about its margin, not about its page), and `clinic.arch` and `museum-wings.arch` change source.

### `arch repair` is idempotent

`repair(repair(s))` now equals `repair(s)`, byte for byte, and that is a **pinned law**
(`test/fuzz.test.ts`, a property over 300 generated plans, plus two named regression specimens).
Until now it was false and known to be false (`docs/backlog.md` 3.11): **60 of 400 generated plans
never reached a fixpoint**, ping-ponging with period 2, 3 or 4, so which arrangement `arch repair`
shipped depended on how many times you happened to have run it. Now: 0 of 400, and 0 of 2000 across
four seeds.

**Two causes, and only one of them is a cycle.**

The first is not: a `in <room> …` placement is resolver-derived and so is *not* grid-snapped, while
an absolute `at` **is**. When a move could not be expressed as an `inset` and the placement became an
absolute `at`, the coordinate repair had computed was snapped somewhere it had never evaluated — so
the change log reported a `to` the output did not contain (**37 of 400 plans**), and the next call
began from a piece nobody had looked at. The rewrite is now planned *before* anything downstream
reads a position, and repair adopts the point that write will land on — the forward check
`insetForTarget` had always performed for the `inset` branch, finally applied to the `at` one.

The second has no closed-form cause fix, because nothing is miscomputed: the two remedies are each
individually right and jointly unsatisfiable. A 300 mm shell leaves an interior exactly 1800 mm wide
holding an 1800 mm piece, so the only position that clears both walls is x = 150 — a coordinate
`grid 100` does not have. Push off the left wall and it snaps 50 mm into the right; push off the
right and it snaps 50 mm into the left. What *can* be fixed is the arbitrariness of where the pass
banked, and the same trick works at both levels: park on the **canonical member of the cycle**, by a
key that reads only the members and never the order they were reached in. A piece that returns to a
position it has held is parked on the lowest `(x,y)` of its cycle; the pass is then run until the
emitted source repeats, and the lexicographically smallest source of *that* cycle is what ships.
Every member of a cycle has that same cycle as its orbit, so re-running from the canonical member
returns it unchanged.

**Output changes for 17 of 400 generated plans, and for none of the 27 shipped examples.** Every one
of the 17 is the first cause: the written coordinate becomes the one the resolver was already using,
and all 17 re-render **byte-identically** — the drawing never moved, only the number in the source
became honest. Plans that already reached a fixpoint are byte-identical by construction (their cycle
has one member).

Repair stays as honest as before about what it could not do: a piece parked mid-cycle gets an
`unresolved` entry naming every position it alternates between, and a change entry whose net effect
is nothing is dropped rather than reported.

### An opening's position along a wall is an expression — and every refusal in the language is now coded

Two recorded defects (`docs/backlog.md` S.2 and 3.14) that share nothing except being invisible from
inside the repo.

**`door|window|opening … on <wall> at <pos>` now takes a full expression.** `<pos>` used to be a
single `number` token, so neither a `let` binding nor any arithmetic was legal there. That is not a
cosmetic gap: it made the attachment form **unreachable from a `for` loop**, which is the case it
exists to serve — a generated run of openings had to fall back to the absolute
`at (x,y) … wall <id>` form and hand-compute the very coordinate `on … at` removes.
`examples/transit-hall.arch` is the shipped instance. It is parsed by the same
`ctx.parseExpr` every other numeric slot uses, so there is no second expression grammar, and `let`
bindings are in scope exactly as they are for `width`:

```arch
let bay = 900
for i in 0..4 {
  window on w1 at bay * i + 600 width 700
}
```

**The byte-identity law holds:** a plan that does not use an expression there compiles, describes,
lints and formats exactly as before, because a literal `1200` parses to `{ t: "num", value: 1200 }`
and evaluates to the number it always did. A SHA-256 sweep over all 27 shipped examples across all
four surfaces shows zero changes, and a literal-versus-expression twin pins it directly. `arch fmt`
re-emits the **authored** expression rather than the resolved number — printing `1500` would silently
constant-fold a plan's source, and inside a `for` would collapse the whole run onto one coordinate.

One grammar consequence, decided rather than left to fall out: inside `<pos>` a `%` is the percent
**suffix**, so it always ends the expression and never means modulo. `at 5000 % 3000` is refused;
`at (5000 % 3000)` is fine, because a parenthesised sub-expression re-enters the full grammar — which
is exactly what the parser does when it recurses with no options. `grammars/archlang.gbnf` mirrors it
with an `attach-expr` cascade instead of pinning the divergence, so a constrained decoder cannot emit
the one shape the parser rejects, and fourteen agreement-corpus rows hold the two to it.

**Every parse and lex refusal now carries `E_PARSE`.** The backlog entry noted in passing that the
two failures above came back with no `E_*` code. That was true of *every* parse and lex error in the
language, not just these — so `arch lint --code`/`--severity` could not select the most common
failure a generating model hits, and `arch explain` had nothing to say about it. `E_PARSE` is
catalogued, and its entry says what makes it unlike every other code: resolution never ran, so there
is never a `fix` to apply and nothing about what the plan *means* has been judged. The distinction
the project cares about is parse-versus-resolve, and this names it rather than erasing it —
`test/spec-forms.test.ts` still holds the spec's documented illegalities to being shape refusals,
now by code instead of by absence of one.

That also retired a heuristic. `test/gbnf-drift.test.ts` defined "the compiler parses this" as *no
error diagnostic lacking a code* — which worked only because parse errors happened to be the one
uncoded kind, a property nothing asserted and any new uncoded `diag()` call would have quietly
broken, turning a refusal into a "parses". `test/explain.test.ts` now asserts the invariant
generically over a corpus chosen to fail in each layer (lexer, header, statement, block, evaluator,
resolve, analysis): every diagnostic the compiler emits carries a catalogued code and a byte span,
with a pruned allowlist for the whole-plan verdicts that legitimately have no span.

Two things the audit turned up that the entry did not mention:

- **`E_DIV_ZERO` and `E_TYPE` from a binary expression were unlocatable.** `parseBin` took the node's
  span from `spanOf(left)`, and a `num` (or `bool`) atom carries no span — so every `bin`/`range`
  built over a literal had `span: undefined`, and the evaluator's diagnostics came back with a real
  code, a real message and nothing for an editor or `arch fix` to point at. `1200 / 0` in a `width`
  had the same hole. The span is now taken from the token stream, first token to last, which also
  makes it the whole expression rather than its left half. **Observable change:** these diagnostics
  gain a span, and `arch ast --json` reports spans on `bin`/`range` nodes that previously had none.
- **A non-finite position would have reached the drawing.** `mm < 0 || mm > total` is false on *both*
  sides for `NaN`, so it walks past the range check into `segmentPointAlong`. Only an expression can
  produce one — a literal never could — so the finiteness guard arrives with the feature, reported as
  `E_ATTACH_POS_RANGE` with no fix, since there is no nearest legal value to clamp `NaN` to.

**Also observable:** `arch ast --json` reports an attached opening's position as an expression node
(`{"t":"num","value":40}`) rather than a bare number, which is how `width` and `at (x,y)` have always
appeared there.

**The VS Code build now refuses to bundle another checkout's core.** Running `vscode:build:only` or
`npm run package` from a `.claude/worktrees/*` checkout resolved `@chanmeng666/archlang` by walking
**up** to the shared repo's `node_modules` and inlined *that* checkout's language — and the
`__CORE_VERSION__` freshness stamp passed throughout, correctly by its own contract, because both
checkouts stamp the same version. Every visible signal agreed while the artifact was wrong. The walk
moved to `editors/vscode/resolve-core.mjs`, which now reports *where* the core resolved as well as
its version; `assertCoreIsOurs` throws unless that real path lies inside the repo root of the tree
being built (derived by walking up to the manifest whose `name` is the core's, not assumed to be
`../..`), naming both paths. It fires for a **junctioned** worktree too, and that is right rather
than over-strict: npm links a workspace package by absolute path to the main tree's root, so a
junction moves the walk one step and changes nothing about which core is bundled.
`editors/vscode/test/wrong-core.test.ts` builds two throwaway checkouts on disk **at the same
version** — reproducing the exact configuration the stamp cannot discriminate — and asserts the guard
does; its non-vacuity is the other direction, that the real checkout still passes.

### Three sheet-layer promises the drawing was not keeping

Three recorded defects (`docs/backlog.md` S.4, S.5, S.1), each one a place where the *sheet* — the
drawing's furniture, as opposed to its geometry — did something other than what it said. All three
change output on purpose, and every changed example is named below.

**A wall-thickness reading was drawn inside the poché it measures.** `dims auto walls` (and so
`dims auto all`) emits one call-out per distinct wall thickness: a dimension line running face to
face across the wall, at zero offset, with the thickness as its text. The number is far wider than
the thing it measures — "100" needs about 4.6 mm of paper at a 2.5 mm dimension font and has 0.5 mm
of wall to sit in — so it was drawn straight through the hatch, rotated, illegible. Not on some
plans: on **every** plan that asked for wall dimensions. A region-level probe over the 27 shipped
examples found **29 readings in poché across 13 of them**; the backlog entry, written by eye, had
recorded eight across three. `arch lint` says nothing about any of it, because where a number is
printed is a drawing fact and not a measured one.

The remedy is ISO 129-1's and GB/T 50001's: **where the value cannot fit between the stations, it is
written outside them.** Three closed-form pieces, each deriving its position from the shape rather
than from a box:

- `outsideStations` (`src/elements/dim.ts`) pushes the number past a station — but only for a
  **zero-offset** dim (a chain span's remedy is the stagger, and the space outside its stations
  belongs to its neighbour), and only when the number plus a clear `DIM_TEXT_GAP` at each end really
  does exceed the measured length. Strict `>`, so a dimension that already fitted is byte-identical.
- `thicknessStation` (`src/scene-build.ts`) picks **where along the wall** the call-out is taken: the
  middle of the widest run no other wall crosses. This is the case the report named — "where a
  partition meets the shell" — and the segment midpoint is very often exactly there.
- `thicknessSideFlipped` picks **which side**, by probing one wall thickness clear of each face at
  three stations and asking which has floor. On an exterior wall the other side is the band the
  `dims auto` chains occupy, and a call-out dropped into it lands on a chain's numbers.

The side is carried as `RDim.calloutFrom`, **never** by swapping the dim's endpoints: endpoint order
also decides whether a vertical number reads bottom-to-top or top-to-bottom, and only the first is
the convention. `DIM_TEXT_GAP` moves from `sheet.ts` to `text-metrics.ts` (re-exported, so no
importer changes) because an element module cannot reach the sheet layer without closing a load-time
cycle through the element registry — a cycle that left `BUILTIN_DEFS` undefined for whichever test
file entered the graph first. `test/dim-thickness-callout.test.ts` states the invariant over every
shipped example and guards the cycle at source level.

**The margin tables were invisible to the sheet fit rule.** `schedule rooms` and `legend` lay out in
a band below the bottom chrome, and `usablePlanMm` reserved not a millimetre of it — so a plan could
be issued on a page **taller than the paper it declares** while `describe().sheet.fits` said `true`
and `validate --strict` was silent. The fit rule measured the drawing, and the drawing was never
what overflowed. `SheetFitInput` now carries a **required** `tableRows`, `tableBandDepth`
(`src/chrome-layout.ts`) turns it into a depth, and the row count comes from `scheduleRowCount` /
`legendRowCount` — the same two expressions `layoutSheetTables` sizes the drawn boxes with, so the
reservation and the layout cannot drift apart again. `resolve()` derives it through `planTableRows`
before any Scene exists; a multi-storey plan reserves the deepest storey's, as it already does for
the extent. **`SheetFitInput` gaining a required field is a type-level breaking change** on an
advanced export (`resolveSheetSpec` / `fitsOnSheet` / `chooseScaleDenominator` / `usablePlanMm`);
required rather than optional on purpose, since a caller that can forget the field is how the band
went unreserved for three releases. One shipped example changes verdict: **`materials.arch`** (A3
landscape at 1:50, schedule + legend) now reports `fits: false` and raises `W_SCALE_OVERFLOW`. Its
bytes do not move — the page is still exactly A3 — but its legend reaches to **14.3 mm** of the
trimmed edge against the 15 mm sheet margin the rule reserves, so the warning is a true statement
about the margin rather than about the page. Every other paper example keeps 23 mm or more.

**Every `place`d instance was a schedule group.** An instance is implicitly a zone, which is how
`describe --zone c4` addresses its contents — and `schedule rooms` groups by the innermost zone, so
a plan that placed one component six times printed **six one-row groups with six subtotals**.
`examples/clinic.arch` shipped a `legend` and no `schedule` for exactly that reason, and said so in
a comment. An instance's zone is now **transparent to schedule grouping**: rows group by the
innermost zone the author *wrote*, an instance inside one inherits it, and an instance inside none
falls to the un-zoned tail. `describe().zones` and `--zone` are untouched — an instance is still a
zone, still rolls up, still addressable; it is simply not a heading. `RZone.instance` carries the
distinction and is absent on a written `zone`, so an unplaced plan's IR is byte-identical. Grouped
subtotals still partition the total.

**Two examples change source, both to say what they mean.** `examples/clinic.arch` gains the
`schedule rooms` it could not have — seven rooms under **Public** and **Clinical**, the six placed
consult rooms among them — and its comment now records the limitation as history. `examples/museum-
wings.arch` had relied on instance zones to group its schedule by wing, so it now declares them:
`zone west "West wing" { place wing() as west … }`. That changes nothing else — a zone has no
geometric semantics, and ids namespace by the *instance* path, so `west.shell` is still
`west.shell` — and the headings improve from `west`/`east` to the labels.

**Fifteen of the 27 shipped examples change bytes, and they are exactly the fifteen that declare
`dims auto all`** (aquarium, bungalow, clinic, courtyard-house, gallery-l, garden-loft,
laneway-house, library, materials, museum, museum-wing, museum-wings, townhouse, transit-hall,
two-storey). Every `dims auto overall` / `dims auto rooms` / undimensioned example is byte-identical,
which is the compatibility half of the first fix. Inside the changed fifteen the diff is confined to
the thickness call-outs' text, line and ticks — plus, in five of them, one room label that
`relocateRoomLabels` moves because the call-out is now where the label was, and plus the two source
edits above. No wall, opening, fixture, chrome, page or margin geometry moves. Snapshots, visual
goldens and the twelve committed `examples/*.svg` are regenerated after review.

### Four lint blind spots, and the one thing they had in common

Every rule below was **shipped, documented and tested**, and every one of them answered a narrower
question than the sentence describing it. None was found by a failing test, because a test written
against a narrower question passes. They were found by asking each rule what it would say about a
plan slightly unlike the fixtures it was born with.

**Behaviour change: `arch lint` may now warn on plans it silently passed.** Three of the four are
widenings, so a plan that lint called clean can now carry a `W_FURNITURE_WALL_COLLISION`,
`W_FIXTURE_WRONG_ROOM` or `W_NO_ENTRANCE`. Every such warning is a real defect the rule was already
supposed to catch — one of them was hiding in a shipped example (below). No new `E_*`/`W_*` code, no
new syntax, no change to `src/index.ts`'s surface.

**`W_FURNITURE_WALL_COLLISION` could not see a wall that was not axis-aligned.** The measurement
opened with `if (horiz === vert) return 0; // diagonal or degenerate — skip`, so a sofa drawn
straight through a 45° wall linted clean. The across-wall depth is now taken in the **wall segment's
own frame** — its direction and its normal — with the plan's x/y axes completing a four-axis
separating-axis test, so an angled wall is measured exactly and an axis-aligned one reduces to the
identical arithmetic (which is why no orthogonal plan moved a byte). A **curved** segment is now
declined outright rather than measured, which is a correction and not just a gap: an arc carries its
CHORD in `a`/`b`, so a curve whose chord happened to be axis-aligned was being measured against a
straight line the wall is not on. Both branches are pinned; the radial fix an arc actually wants is
`docs/backlog.md` 3.15.

This found a real error in `examples/hexagon-pavilion.arch`, where nothing had ever checked: two
benches in the wedge galleries sat **100 mm and 130 mm inside a wall solid** — an axis-aligned piece
in a wedge reaches a sloped wall by its far corner, not its edge. Both are moved west, and the
example's drawing is regenerated.

`repair` is widened in step, because `test/repair-coverage.test.ts` requires that every piece lint
flags gets a change entry or an `unresolved` entry and never nothing. It pushes only along x and y,
and clearing an angled wall is a move along that wall's normal — off-axis and, on any real grid, off
grid — so it **reports** the piece by name and leaves it alone (ADR 0005: never guess).

**`W_FIXTURE_WRONG_ROOM` asked only where the fixture's centre was.** That is a far weaker question
than it looks at a corner: crossing both the x and the y edge of a room leaves as little as a
quarter of the footprint inside while the centre stays comfortably in. A bed with **72% of itself in
three other rooms** passed. The rule now measures the footprint against the room's own floor
(`rectInRoomBox`, poly-aware, so a `polygon` or `circle` room is judged by its shape and not a
bounding box), allowing a named 100 mm of overhang — half the 200 mm shell every shipped example
draws, because a room's outline runs down wall centrelines and a piece pushed against a room edge
legitimately shares that band. `repair` uses the same predicate, so what it clears is exactly what
lint flags.

**`W_NO_ENTRANCE` stood down whenever no wall was categorised `exterior`.** A closed shell drawn
entirely from `partition` walls — or a plan with rooms and no walls at all — was never asked whether
you could get in, while `describe().access.hasEntrance` reported plainly that you could not. The
rule now reads the **same access graph `describe()` reads**, shared once per run on the lint context
(`LintContext.access`, which `circulation-facts.ts` now consumes too, so there is one graph and one
answer). Component libraries — the case the wall test was standing in for — are covered by
`rooms.length > 0` on its own: a library file declares no rooms. Pinned corpus-wide: across all 27
shipped examples exactly `themed` and `two-bed` report it, the same two as before.

### `flush` and `grid` no longer fight (backlog 3.12)

A fixture placed `flush` against a 100 mm partition lands on a `…50` coordinate, and `grid 100`
rounded it straight back **into** the wall — raising `W_FURNITURE_WALL_COLLISION` on a correct plan,
and making the one clause that exists so nobody writes a half-thickness by hand useless at the most
ordinary grid there is.

The cause was neither `flush` nor the diagnostic. `resolve` was grid-snapping a coordinate **it had
derived itself** from wall geometry. The grid is a drafting aid for the numbers an author writes,
and a `flush` / `against wall` position is not one of them — `describe().freedom` already draws that
exact line between authored-absolute and resolver-derived placement. The `against` and `place`
branches of `elements/furniture.ts` no longer snap; the absolute `at (x,y)` branch still does, and
so does everything else the grid governs (including a wall's own `thickness`).

**Two shipped examples move, both toward correctness**, and both are regenerated:
`examples/materials.arch` (`grid 10`) had two `flush` fixtures sitting 5 mm *inside* the wall face,
and `examples/terrace-row.arch` (`grid 50`) had every `flush` fixture 25 mm *off* it.
`examples/bungalow.arch` keeps its `grid 50` and is byte-identical — its numbers were already on
that grid — and its comment now records the workaround as history.

### `arch watch` announced itself before it was watching

v1.26.1 found that `arch watch` had not watched for twenty-five minor releases. It fixed the
command and left a window in it.

`watchFile` takes its baseline `stat` at the moment it is called, and the readiness banner —
`watching … (Ctrl+C to stop)` — was written on the line **above** that call. Any save landing in
between is folded into the baseline and never produces a change event. Silently, and only for the
very first save: start `arch watch`, save immediately, watch nothing happen once, and then have it
work forever after. **The readiness signal was true a moment before the thing it announced was.**

Fixed by arming the watcher first and announcing second — one reordering, no behaviour change for
anyone who does not hit the window.

**How it surfaced is the part worth keeping.** The end-to-end case in `test/cli-commands.test.ts`
uses that banner as its "ready" signal, so it was *probabilistically* sensitive to the race: it
went red on one CI leg of one run and green on a re-run, which reads as flakiness. It is not.
Inserting a 1.5 s delay between the two lines makes it fail every time; moving the delay to the
other side of the reordered pair makes it pass. That pair of runs is the proof, and neither the
red run nor the green one was.

`test/watch-arming.test.ts` pins the ordering, and pins that nothing `await`s between the two —
correct order alone is not enough, since a suspension point reopens the same window. It is a
structural test and says so: a timing test for a race is a test that reports the race as
flakiness.

### The docs site can read the language it documents

ArchLang source rendered in **one flat colour** everywhere the documentation site showed it —
which is nearly everywhere, since every plain ```` ```arch ```` fence becomes a live `<ArchLive>`
editor. The cause was a hand-typed keyword `Set` of about two hundred words inside
`CompileSeam.vue`, carrying a comment asking the next person to keep it in step with
`src/grammar/tokens.ts`. It was already behind it, and nothing could have said so: a highlighter
that misses a word does not fail, it just draws that word as an identifier.

`docs-site/.vitepress/theme/arch-highlight.js` replaces it, **generated by
`scripts/gen-grammars.ts` from the same `KEYWORDS`/`RULES` tables as the TextMate grammar and the
playground's CodeMirror mode** — a third renderer off one source rather than a fourth hand-typed
copy. It deliberately adds no fifth copy of the palette either: it emits `ahl-<name>` classes
whose suffix *is* a token category, coloured once by `.ahl-*` rules at the foot of `style.css`.

Two tests hold it there. `test/arch-highlight.test.ts` welds the generator's vocabulary to
`KEYWORDS` and its class list to those CSS rules, and pins the three properties its `v-html` call
sites depend on. `test/grammar-drift.test.ts` welds the committed artifact to the generator.

**And the vocabulary gate found something.** `test/closed-vocabularies.test.ts` asserts that every
member of every closed value set — `AUTO_DIMS_MODES`, `NORTH_DIRS`, `PAPER_SIZES`, `DOOR_KINDS`
and the rest, which have lived once in `src/ast.ts` since v1.26.0 — also appears in `KEYWORDS`.
`street` and `hemisphere` did not. They shipped in **v1.25.0**, are documented in the spec's own
`site` grammar line, and are accepted by the parser — and every renderer had been drawing them as
bare identifiers ever since, because a word that leads a clause is a setting keyword and nobody
had put them in the table. Adding them moves `KEYWORDS` from 136 entries to 142 and changes no
behaviour beyond how the three grammars colour them.

**The home page's drawings are now doors.** Each plan pictured on the landing page carries an
"Open in Playground" link whose `#z=` payload is minted at build time by `sync-docs.mjs`, reusing
`gen-permalink.mjs`'s `encodePlanHash` — so they are real `<a href>`s: middle-clickable,
crawlable, no async handler. That also means nothing in a browser would ever notice the map going
stale, or a card pointing at a plan it is not showing. `docs-site/e2e/homepage-links.spec.ts`
decodes each real href through the **playground's own** decoder and byte-compares the result
against `examples/<name>.arch` on disk.

No `src/` behaviour change beyond the two table entries; no golden, snapshot or example SVG moved.

### `paper/` — three papers, and the numbers in them are generated

Adds `CITATION.cff` and a `paper/` working set: three papers (a full-length preprint, a
double-anonymous 4-page cut, and a tool paper), a 136-entry bibliography, the harnesses and
datasets behind every empirical claim, and three checkers that gate them. **No `src/` change, no
language change, and nothing in the npm tarball moves** — `package.json`'s `files` field does not
include any of it.

The reason it lives in the repository rather than beside it is the papers' own argument. Every
structural number they cite — error-code counts, keyword counts, lint rules, CLI commands — is
interpolated from the compiler's own tables by `npm run gen:paper-facts` and **drift-gated by
`npm run check:drift`**, so a `.tex` file cannot state a count the compiler disagrees with. A
paper claiming that hand-copied facts rot, whose own facts were hand-copied, would be the defect
it documents. It earned that twice within a day. An audit written before the generator existed
reported "136 keywords" alongside component counts summing to 142 — not a miscount, but a file
sampled twice while a change to the keyword table was in flight, so the total described the
committed source and the components described the working tree. The generator then made the
same mistake in the other direction: it was run against that same uncommitted tree, so the
committed facts claimed 142 while the committed source said 136, and **the drift gate this
working set adds failed CI on the very next push**. A description taken by hand from a moving
subject can be wrong about which version of the subject it describes.

Scale facts (lines of code, commit counts, test counts) deliberately go the other way. They move
on every commit, so gating them would fail `check:drift` on unrelated work and train people to
regenerate without looking. They live in `paper/scale-snapshot.json`, written on purpose by
`npm run paper:snapshot -- --date YYYY-MM-DD`, with the date an argument rather than a clock read.

- **`npm run paper:check`** — one command over all three papers: banned claims and retracted
  figures, anonymity for the double-anonymous cut, and the build with its page limits and citation
  closure. **All three checkers are proven non-vacuous by planting a fault and watching them
  fail**, and each records in its source what it missed before that proof: a page counter that
  scraped compressed object streams and reported a one-page paper as 47; a citation check that
  short-circuited on `\nocite{*}` and waved a misspelled key through; and a banned-claim check
  that matched against unwrapped source, so a phrase split across a newline evaded it.
- **`paper/experiments/`** — the corroboration scripts (each takes a clone path, exits non-zero
  when its evidence is absent), the mutation harness with a `--check`/`--recover` pair and a
  `SAFETY.md`, the ecosystem scan, and `verify-findings.mjs`, which recomputes every figure in the
  ecosystem write-up and asserts eight identities between the tally and the per-package rows.
- **`CITATION.cff`** — validated against CFF 1.2.0 with `cffconvert`. `.zenodo.json` is
  deliberately **absent**: Zenodo ignores `CITATION.cff` entirely when both are present, and
  adding it would leave two descriptions of one artifact with one silently unread.

### The showcase, redrawn

Twenty-seven examples where there were fifteen, every drawing in the README generated rather than
hand-committed, and a gate so the pictures cannot drift from the compiler again. No language change:
**no new keyword, no new `E_*`/`W_*` code, no `src/index.ts` change**, and every existing example is
byte-unchanged.

The finding that made this more than an authoring exercise: **the three example SVGs the README had
always shown were hand-committed and never re-rendered.** Nothing regenerated them, nothing compared
them to the compiler, and the only way to notice was to look at the picture — so for months the
project's front page showed `studio`, `two-bed` and `attached` as they compiled *before* the
opening-void fix, the fixture-orientation fix, the miter-limit cap and the label-placement pass. Four
separate rendering changes, invisible. Every other artifact in this repo derived from `src/` has a
generator and a drift gate; these did not, purely because nobody thought of an SVG as generated.

#### Added

- **Twelve new examples**, each the flagship of exactly one thing:
  - `laneway-house` — the SIGNATURE plan, and the new README hero. 49 m² in which **nothing is
    positioned by hand**: every opening is pinned to a run distance along a named wall, every fixture
    resolves against a room or a wall, the bath/bedroom pair is laid out by `strip`, and `site`
    names the two facades the plan turns on.
  - `one-room` — the smallest plan that draws anything at all. One room, one door, one window; the
    plan you read first, and the golden that has nothing else to blame when the common path moves.
  - `tiny-house` — a dwelling on a trailer footprint: one wet room, one everything-else.
  - `garden-loft` — a studio over a garage: `strip`, an on-wall run, and a single stair.
  - `courtyard-house` — a ring of rooms round an open court, and the first shipped plan whose room
    centroid lands **off its own floor**. The case where a window's outward face is not the side its
    bounding box suggests.
  - `townhouse` — three storeys in one file (A3 portrait at 1:50), one stair shaft, one drawing per
    page. The first example with a *middle* storey, where a per-level fault has a page above and
    below it to hide between.
  - `terrace-row` — one inline `component`, `place`d four times with alternating `mirror x`, unit widths from a `let` array, `theme blueprint`; the whole row is written once.
  - `hexagon-pavilion` — six wedge-shaped `room … polygon` galleries round a hexagonal core: oblique
    mitres, and every room labelled by hand because a wedge's centroid is the worst place available.
  - `library` — a public building on a real sheet (A2 at 1:200) with axes, a room schedule and a
    legend, wrapped round a circular reading room.
  - `transit-hall` — a station concourse: paid and unpaid sides, a generated run of gates, kiosks
    and WCs (A2 at 1:200).
  - `clinic` — six consult rooms as `place`d instances off one corridor, grouped by `zone`.
  - `materials` — the first and only shipped example to use `style <kind> { … }` and wall
    `material`, which is how the formatter bug below was found.
- **`npm run gen:example-svgs`** (`scripts/gen-example-svgs.ts`) — the ninth drift generator. It
  renders the twelve `examples/*.svg` the README embeds from their `.arch` sources, and its curated
  `README_SVGS` list is **imported** by `scripts/check-drift.ts` rather than retyped, so a name added
  in one place is gated in the other with no second edit. Added to `gen:all` and to CI's
  `check:drift`; the artifact count goes from nine to twenty-one.
- **`test/example-svgs-drift.test.ts`** — the gate, with two laws. Every `README_SVGS` file on disk
  must equal an in-memory `compile()` of its source; and the curated list and the README's `<img>`
  tags must agree **in both directions** — a drawing the README embeds with no generator entry is
  one that will rot, and a listed name the page never shows is dead weight. The second law is what
  keeps a *curated* list honest, which is the only reason a curated list is acceptable here (an SVG
  per `.arch` would put ~27 large blobs in every diff for no reader).
- Nine new visual goldens plus three per-page `townhouse` goldens, and fourteen new SVG snapshots.
  No existing golden or snapshot moved.

#### Changed

- **README hero and gallery, rewritten around the new corpus.** The hero fence is
  `examples/laneway-house.arch` verbatim, its prose re-cut to what that plan actually demonstrates,
  and both of its permalinks re-minted with `scripts/gen-permalink.mjs`. The gallery is a nine-cell
  table chosen for what reads at 270 px, plus a two-cell row for the A3 sheet drawings, and the
  "Also in `examples/`" paragraph is now the whole corpus grouped by what each plan is there to show.
  Every drawing on the page is now generated, so the README and the compiler cannot disagree.
- **`examples/studio.svg`, `two-bed.svg` and `attached.svg` re-rendered** — the first time since they
  were committed. They now show what the current compiler produces: opening voids that cut the wall
  instead of painting over it, correctly oriented fixtures, mitre-capped wall joints, and room labels
  relocated off the furniture and dimension text they used to sit under.
- **`test/levels.test.ts`'s corpus sweep is now derived, not listed.** It excluded `two-storey.arch`
  **by filename**, which meant a second multi-storey example could silently join the level-free sweep
  or silently dodge it. The predicate is now `HAS_LEVEL = /^\s*level\s+-?\d+/m` read from the source,
  both sides are asserted non-empty, and a companion case requires every multi-storey example to
  compile to more than one page. `townhouse.arch` joined both with no edit to the test.
- **`test/schedule.test.ts`'s `TABLE_EXAMPLES` allow-list is now derived too**, for the same reason:
  a hand-written two-name list was fine while the answer was two names, and six examples opt into
  `schedule`/`legend` now. The replacement asserts something the old comment could only *state* —
  that an example may opt in only together with a golden rendered from it.
- **Docs site and playground rewired** to the new corpus (docs home hero, cards, facts band and
  guide; playground grouped presets, a new default plan, and the embed fallback).
- `test/fixtures/vocabulary-equivalence.json` gains a pinned row set per new example (additions
  only — no existing row changed).

#### Fixed

- **`arch fmt` silently rewrote every `style <kind> { … }` block into one the parser rejects.** The parser resolves a friendly attribute (`stroke`, `fill`, `label`, `hatch`, `leaf`, `pane`, `opening`, `area`) to a canonical `Theme` key and stores *that*; the formatter printed the canonical key straight back out (`style wall { wallStroke: "#…" }`), which the next parse refuses with `W_UNKNOWN_STYLE_KEY` — so `format(format(src))` emitted an **empty** style block and a formatted file rendered in different colours than the file it came from. `src/theme.ts` now exports `styleKeyFor()`, the inverse of `resolveStyleKey()` derived from `STYLE_KEYS` itself, and the formatter prints the friendly key (falling back to the raw key if a kind exposes none, so nothing is dropped unseen). Same defect class as v1.26.1's door-kind fix: *the one operation a user assumes is safe, quietly changing the drawing.* Pinned by a round-trip law over every `(kind, attribute)` pair in `STYLE_KEYS`, so a new kind or attribute joins it with no edit to the test. `theme { … }` was audited for the same shape and is **not** affected — `resolveThemeKey` accepts the canonical key the formatter prints — and that is now pinned rather than assumed. Found by `examples/materials.arch`, the first shipped example to use `style`.

#### Documented, not fixed

Five findings the new examples ran into are recorded in `docs/backlog.md` → "Found while redrawing
the showcase", each with its reproduction: `schedule rooms` and `place` are effectively unusable
together (every instance is an implicit zone, so N components print N one-row groups); `on <wall> at
<pos>` takes a literal, so a generated run of openings must fall back to absolute coordinates;
`strip` cannot nest inside `zone`, so strip rooms fall into the schedule's `(no zone)` group;
`dims auto all` prints wall-thickness readings inside the poché; and the margin tables can push a
page **past its own declared paper** while `describe().sheet.fits` stays `true` and no
`W_SCALE_OVERFLOW` is raised — the same "a promise quietly not kept" class v1.26.1 closed.

### A mutation survivor that turned out not to be a bug

**`transformArc` is correct. Nothing was checking that it was.** Two hand-authored mutations of
`src/frame.ts` — drop the sweep flip a reflection owes a curve, and swap `atan2`'s arguments when
re-deriving `start` — both change rendered SVG bytes on a plan a user can write, so neither is an
equivalent mutant. The second survived **all 2709 tests in the repo**. The verdict is the one worth
writing down: the shipped code was right, and no test could have told you.

Why it hid. `place` carries a resolved element into plan coordinates through one exact isometry, and
for a straight edge "exact" is the whole story — integer arithmetic, asserted bit-for-bit in
`test/frame.test.ts`. A curve is the one thing a frame touches that is not a point: an `Arc` carries
`start` as an **angle**, so the transform has to re-derive it from the transformed centre and
endpoint, and the sweep's rotational sense has to reverse when the frame reflects. The suite's only
assertion about any of that compared two `Math.sign`s — enough to say a mirrored counter-clockwise
curve reads clockwise, not enough to say **where the curve went**. Nothing anywhere asserted where a
transformed arc's points actually land, and `start` — the angle every point of the drawn curve is
measured from — had no assertion at all. Nor is it reflection-only: a component `place`d with a plain
translation goes through the same re-derivation, which is why its mutant survives a suite that
renders a curved flagship (`examples/aquarium.arch`) on every run.

- **Seven tests added to `test/frame.test.ts`**, pinning the law rather than the bytes. A snapshot
  here would have pinned whatever the code did, right or wrong; what is asserted instead is that **a
  frame carries a curve pointwise** — `arcPointAt(t) ∘ transform === transform ∘ arcPointAt(t)`,
  which is what "a frame is an isometry" *means* for an arc, and which endpoints alone cannot say
  (the two arcs of a circle through the same pair of points differ only in which way round they go,
  and that is exactly what a reflection changes). Alongside it: the radius, centre and both endpoints
  ride the frame exactly; the sweep is exactly negated under `det < 0` and exactly preserved
  otherwise; and `start` is checked non-tautologically — walking `r` out of the transformed centre
  along it must arrive at the transformed endpoint, rather than reading the angle back with the same
  `atan2` the implementation used. All twelve frames a `place` can spell, on a deliberately lopsided
  arc, because a symmetric fixture lets a swapped `atan2` pass by accident.
- **One end-to-end case on the drawn primitives**, in the units a reader can check by eye: a
  semicircular bay bulging 2000 mm left of its own origin, placed twice with the second mirrored
  about `x = 10000`, must span `[10000, 12100]` and carry the clockwise SVG sweep flag. Keep the
  sweep and it spans `[7900, 10000]` instead — the same two endpoints, the same radius, and a bay
  curving into the building.
- **`test/frame.test.ts`'s "no epsilon anywhere" header is now "no epsilon, with one bounded
  exception", and says which.** Everything a frame's integer arithmetic touches stays exact; the
  tolerance appears only on the two laws that sample a curve through `cos`/`sin`, at ~1e-12 relative
  — twelve orders below `fmt()`'s output quantum, against mutants that miss by hundreds of
  millimetres.

**No `src/` change, and no golden, snapshot or example SVG moved** — the byte-identity law is
satisfied structurally here, not measured, because the compiler was already right. One process note
worth carrying: the sweep mutant read as a survivor only against the suite list the experiment
declares for `src/frame.ts`; the full run does kill it, from `test/curves.test.ts`. A mutation score
is only ever a statement about the suites you pointed at.

## [1.26.1] - 2026-08-13

**Five shipped surfaces that no test ever executed.** v1.26.0 made the language's *descriptions* of
itself agree with the parser. This release does the same thing one layer out, for the language's
*behaviour*: every fix below is a documented promise that the code had quietly stopped keeping, and
every one was found by **running** the surface rather than reading it. `arch watch` had not watched
since v1.1.0 — twenty-five minor releases — while the manifest and `docs/cli-reference.md` both
advertised "recompile on save". Poché was dropped from **every PDF ArchLang has ever exported**.
`arch fmt`, the one operation a user is entitled to assume is safe, silently turned a pocket door
into a hinged one. `W_DIM_INSIDE` offered a machine-applicable fix that 2-cycled forever. And
`toPdf` was the single shipped output format without the byte-determinism this project treats as an
iron law.

None of these are subtle once executed, and that is the finding: the gap was never analysis, it was
**invocation**. `arch watch`, `arch fmt` and `arch manifest` had zero end-to-end execution in the
suite; `src/lint/measure.ts` and `src/frame.ts` had no direct caller in any test; the flagship
determinism property fed `fc.string()` into a plan body and produced **zero** walls, rooms, openings
or fixtures across 5000 samples; and three separate gates opened with an `if (…) return;` that
reported a pass having asserted nothing. Those are all closed here too, which is why a patch release
carries +4900 lines.

Everything here is a bug fix restoring documented behaviour: **no new keyword, no new `E_*`/`W_*`
code, no new public export** (the new `dimLineMid`/`dimSwapped`/`dimReadsInside` in `src/geometry.ts`
and `RESIDENT`/`CommandResult` in `src/cli/io.ts` are internal — `src/index.ts` is unchanged).

> **Three of these fixes change observable output or behaviour, on purpose.** A PDF exported by
> 1.26.1 differs from one exported by 1.26.0 — it gains one filled path per hatch primitive
> (+31 B on `studio.arch`) and its `/CreationDate` and trailer `/ID` become constants. `arch fmt`
> now emits door-kind clauses it previously dropped, so a formatted file can differ. And `arch
> watch` no longer exits after its first compile, so a script that relied on it terminating will
> now block. Each restores what the docs already promised, which is why these are patches and not
> breaking changes — but if you diff PDF bytes across the upgrade, you will see a change.

### Fixed

- **`arch watch` did not watch, and had not since v1.1.0.** `src/cli.ts` dispatched
  `process.exit(await cmdWatch(args))` while `cmdWatch` returned `EXIT.OK` immediately after
  installing `watchFile` — so the exit killed the process the watcher had just armed. It compiled
  exactly once, printed `watching <file> … (Ctrl+C to stop)`, and died at ~622 ms. It regressed in
  `3a368eb`, the refactor that turned an if/else chain into `switch` + `process.exit(await
  cmdX())`; the pre-refactor branch had no exit and stayed alive on the handle.

  The real defect is that `number` cannot express *"this command does not return"*, so `EXIT.OK`
  and "finished" had been silently identified. Fixed with a `RESIDENT` sentinel
  (`CommandResult = number | typeof RESIDENT`) that `cmdWatch` returns after installing the
  watcher, and one `finish()` helper in `cli.ts` that every dispatch arm routes through — chosen
  over a local `if (code !== EXIT.OK) exit(code)`, which reproduces the exact conflation that caused
  this, and over a `resident: true` manifest flag, because a resident command can still fail before
  becoming resident (`watch -` exits 3), making residency a property of the *run*, not the verb.
  A second latent bug fixed inside `cmdWatch`: the recompile promise was not caught, and an
  unhandled rejection is a hard process exit in Node ≥ 15 — so a single unwritable output would
  have killed the watcher that exists to survive exactly that. A failing *initial* compile still
  deliberately does not stop the watch.
- **Poché was dropped from every PDF ArchLang has ever exported.** `drawNode`'s switch had no
  `hatch` case and no `default`, and the `wallFill` layer is exactly one hatch primitive — so every
  wall printed as a hollow outline. Poché is how a floor plan distinguishes structure from space,
  so this was an incomplete drawing rather than a variant rendering. Nobody chose it: the module
  header already documented the intended behaviour and `fillColor`'s `url(…) → theme.pocheBase`
  branch already existed, dead purely because the primitive never reached the switch. A hatch *is*
  the same multi-loop nonzero path a region is, so the two now share one case. The absent `default`
  was half the finding, so there is now an exhaustiveness guard (`const unhandled: never = prim`):
  a new `ScenePrim` fails the typecheck at that line instead of being dropped the same silent way.
- **`toPdf` was not byte-deterministic.** pdfkit defaults `info.CreationDate` to `new Date()` and
  derives the trailer `/ID` as an MD5 over the info dict, so two renders of the same Scene differed
  — leaving PDF the one shipped format without the guarantee this project treats as an iron law.
  Fixed by passing the Unix epoch, `(D:19700101000000Z)`: a sentinel two decades older than the PDF
  format reads correctly as "this is not a timestamp", where a plausible date would be worse than
  useless because it would be believed. `SOURCE_DATE_EPOCH` is deliberately **not** honoured —
  reading `process.env` in `src/` outside the CLI would violate the purity law, and the `World` seam
  exists for that. Both fields are fixed-width, so no offset, xref entry or `startxref` shifts.
- **`arch fmt` silently turned a pocket door into a hinged one.** `format()` printed neither a
  door's leading kind word nor its `slide`/`open` clauses, so
  `door id=d1 pocket on w1 at 50% width 900 slide left` came back as
  `door id=d1 on w1 at 50% width 900` — a swing arc that should not exist, a different SVG,
  `describe().doors[].kind` gone, and `W_POCKET_RUN` no longer applying to a panel that still has
  nowhere to slide. Shipped in v1.25.0 alongside the door kinds and live through v1.26.0, in the
  CLI, in `arch fix`'s write path, and behind the playground's Format button. The suite could not
  see it because every hand-written fixture that formats a door uses `hinged`, which the resolver
  drops anyway, so it round-tripped by accident. Note that `open 0` is legal *and falsy*: the
  printer tests for **presence**, so a shut panel is not re-formatted to the default.
- **`W_DIM_INSIDE` offered a machine-applicable fix that never converged.** The fix swapped a
  dimension's endpoints, which flips which side the offset falls on — but on a dimension running
  *through* the building the line reads inside either way, so the warning fired again next pass, the
  same fix was offered again, and it swapped back. Forever. `arch fix` therefore burned its whole
  bounded pass budget on such a plan and the output depended on the **parity** of the budget, which
  is worse than offering no fix at all (ADR 0011's premise is that a machine-applicable fix moves
  the plan toward correctness). Root cause was structural: the detection logic lived inline in the
  lint rule, so the fix producer had no way to ask it anything and offered a swap it had never
  evaluated. Extracted to `src/geometry.ts` as `dimLineMid` / `dimSwapped` / `dimReadsInside`,
  beside `doorSwing` for the same reason — derived geometry shared by a rule and a producer.
  `dimSwapFix` now re-asks that predicate of the *swapped* dimension and returns `null` when the
  answer is still "inside". **No offset is invented in its place** — guessing one would be the
  invisible architect ADR 0005 rejects. The hint and the catalog's fix prose follow the same
  predicate, so neither promises an automatic fix that does not exist.
- **The playground's status flash could be wiped by its own predecessor.** `flash()` never cleared
  the previous restore timer, so two flashes inside 1200 ms let the first one's timer erase the
  second; and it captured `prev` on every call, so that timer restored a stale flash message as if
  it were the resting status.

### Added

- **`examples/bungalow.arch` — the orientation-and-openings flagship.** Zero of the 18 shipped
  examples used `site`, `street`, `hemisphere`, `pocket`, `sliding`, `barn`, `bifold` or `slide` —
  the entire v1.25 language surface was invisible to readers and to models, which learn far more
  from a worked plan than from a grammar line. A single-storey suburban house, 102 m², 8 rooms,
  whose plot fronts the street on the **south in the southern hemisphere**; that one declared fact
  drives the layout, because `back` and `equator_side` are then the same side, so the house turns
  away from the road — living room and both bedrooms on the north facade, service band along the
  street. The three non-default door kinds are each where a builder would put one (a garden slider,
  a pocket off a 1500 mm corridor, a bifold into the laundry). Both orientation claims were verified
  by **counterfactual**: reversing the pocket's `slide right` produces *"needs 850 mm, only 500 mm
  available, 350 mm short"*, and deleting Bedroom 2's north window produces
  `W_ROOM_NOT_EQUATOR_FACING`. It immediately earned its keep — `test/format.test.ts` already
  compared `compile(src)` to `compile(format(src))` across `examples/`, so the gate was real and its
  corpus was empty of every form that could fail it; adding this file turned it red against the
  unfixed formatter. A SHA-256 sweep over all 14 pre-existing examples on four artifacts (SVG
  including `pages[]`, ASCII, `describe()`, `lint()`) shows every hash identical.
- **`test/arbitrary-plan.ts` — a generator that emits valid plans by construction.** The flagship
  determinism property fed `fc.string()` into a plan body: of 5000 samples, 523 compiled clean —
  every one an empty or whitespace body — and **zero** produced a single wall, room, opening or
  fixture, so the property that reads as "compile is deterministic" was asserting almost nothing
  about the rendering path. The new generator builds a small grid inside one closed shell with
  everything the grid cannot express (polygon and circular rooms, arc walls, relational placement)
  in an annex clear of it; all 3000 samples render, ~158 geometry elements each. Every closed value
  set is imported from its owner, so a new door kind or anchor joins the corpus with no edit.
  Proof it was worth doing, via a planted iteration-order bug in `lowerWalls`: the old property
  passed 300 runs, the new one failed after 5 tests and shrank to 6 readable lines. Both
  `fc.string()` properties are **kept** — hostile input is the right corpus for "never throws". New
  properties cover determinism over `svg` *and* diagnostics, cache transparency, byte-identity under
  adding `site` and under wrapping in `zone` (the law every feature currently pins with a
  hand-written fixture pair, now generalised), format idempotence, format-preserves-the-drawing,
  `repair` determinism / never-breaks / moves-no-room, and `applyFixes` convergence.
- **End-to-end coverage for the three commands no test had ever invoked** — `arch watch`, `arch fmt`
  and `arch manifest`, plus `serialize.ts`'s `runPool` / `aggregateExit` / `perFileJson`, the
  concurrency and exit-code aggregation behind `arch batch`, which had zero references anywhere in
  the suite. Exit codes are the agent contract, so a wrong one ships silently — the batch tests pin
  the documented contract against real mixed inputs including the precedence rule (a missing file
  alongside a bad plan must report `2`, user-source outranking IO), and `runPool`'s bounded
  concurrency is proven with hand-controlled deferreds rather than timers.
- **Direct coverage for `src/lint/measure.ts` and `src/frame.ts`,** neither of which any test
  imported. 36 tests for the measurement arithmetic that decides both the numbers a reader is told
  and, through `shortfall()`, whether a deficit is reported at all — the strongest being
  cross-module and unreadable from either side alone: `frontGapMm` agrees with `frontClearanceRect`
  about which way a fixture faces for all four quarter-turns. 43 tests for the exact-isometry layer
  behind `level` and `place`, with no epsilon anywhere: `compose ∘ inverse` exact both ways,
  `det` negative *exactly* for reflections, and the handed rules asserted on the fields — `swing`
  flips for all eight reflecting frames and none of the four rotations, `hinge` deliberately does
  not. 27 of 28 planted faults were killed; the survivor is provably an equivalent mutant.
- **`editors/vscode/test/lockstep.test.ts`** — the extension's core dep range must now be a
  **string** equal to `^` + the root version, mirroring the MCP shim's guard, so every core release
  reddens it on purpose until someone consciously re-pins. The range had sat two releases stale at
  `^1.24.0` precisely because nothing checked it. It is not redundant with `stdio.test.ts`: the
  `__CORE_VERSION__` stamp asserts the *bundle* is fresh and stayed green the whole time, because
  esbuild resolves the workspace symlink regardless of what the manifest declares. Only the manifest
  had rotted.
- **`scripts/coverage-zero-report.mjs`** — names modules sitting at zero coverage in the Node-22 CI
  step summary, which a four-line total cannot show. Advisory in the strongest sense: it catches its
  own errors and forces exit 0, so it cannot turn a green run red, and it adds no thresholds and no
  allowlist.

### Changed

- **Three gates that could not fail now fail visibly.** `test/png.test.ts` opened each case with
  `if (!(await hasResvg())) return;`, so on any machine without the raster dep all three reported
  **passing** having asserted nothing about the PNG backend — including a CI run whose install had
  quietly stopped pulling `optionalDependencies`, which is the one situation where the silence
  matters. Both pdfkit gates (`test/export-pdf.test.ts`, `test/sheet.test.ts`) used `skipIf`, honest
  in the reporter but never hard-failing, so the same broken install would silently stop testing a
  **published** output format. All are now required in CI and skip visibly by name locally, proven
  against copies with the specifier mangled. `test/readme-permalink.test.ts`'s `deflate-raw` gate
  becomes `it.skipIf` — deliberately **not** a CI throw, since the Node 18/20 matrix legs
  legitimately lack the capability and a hard fail would redden two thirds of the matrix for a
  supported runtime. PDF backend coverage went 4 → 16 tests, `src/export/pdf.ts` 83.79% → 95.83%
  lines.
- **A flaky playground E2E spec was reproduced rather than guessed at** — 6 failures in 20
  full-suite runs, all `Received: "ready"`, i.e. the poll never saw the flash at all.
  `loadSource()` restarts the 250 ms debounce whose `render()` paints over the status, so the
  assertion was polling a value with a ~250 ms lifetime and a longer timeout only widens the window
  it is already inside. Replaced with a causal witness: a `MutationObserver` installed before the
  action records every value painted, so a paint that survived 5 ms is as assertable as one that
  survived 5 s. Six assertions had the defect, not one. Result: 0 failures across the reproduction
  command and 500 consecutive passes.
- **`W_DIM_INSIDE`'s catalog remedy prose** no longer promises a machine-applicable fix
  unconditionally; it states when there is one and what to do when there is not.
  `docs/error-codes.md` and `llms-full.txt` regenerated.
- **MCP shim 0.2.6** and **VS Code extension 0.15.1**, both re-pinned to `^1.26.1`. The shim's bump
  is mandatory and version-bump-only for the familiar reason: `llms-full.txt` is one of its five
  **pack-time-baked** resources and it changed, so under the pack-time law only a version bump ships
  the refreshed text — published 0.2.5 would keep handing hosts the old `W_DIM_INSIDE` prose. (It is
  the only one of the five that moved this release.) The extension bundles the core at build time,
  and nine core `src/` files changed including `format.ts`, `fix-producers.ts`,
  `lint/rules/dims.ts` and `geometry.ts`, all of which reach the bundled LSP server — so its
  diagnostics and quick fixes differ.

## [1.26.0] - 2026-08-12

**The language's descriptions of itself, made honest.** No new syntax — instead, the four artifacts
that *tell a model what ArchLang is* were checked against the parser for the first time, and every
one of them was wrong. `spec.llm.md` taught seven incorrect grammar lines, four of which do not
compile. `grammars/archlang.gbnf` — a constrained-decoding grammar whose entire job is to make
invalid output impossible — derived eleven forms the parser rejects. `src/index.ts` withheld seven
types that `describe()` hands you at runtime, leaving them readable but unnameable. And `room …
align <word>` accepted any word at all, silently drawing the plan as if the clause were absent.

The root cause is one shape repeated: **a fact about the language, retyped by hand into something
that describes the language.** `check:drift` cannot see it — it proves a generator reproduces its
own output, never that the output is true, and the proof is that the two hand-typed generators had
the *same* forms right and wrong in different places while both stayed green. So the fix is
structural rather than textual: the value sets now live once in `src/ast.ts` and interpolate into
every description of them, and `test/spec-forms.test.ts` **executes** the reference — 44 documented
forms must compile, 19 documented illegalities must be refused with their catalogued code. A
grammar line that is wrong no longer merely reads wrong; it fails.

Measured downstream in ArchCanvas before the fix: **11 of 18 generations failed to compile**,
dominated by the furniture forms the reference taught.

### Added

- **`E_ROOM_ALIGN` and `E_ROOM_ALIGN_AXIS`** — two catalogued codes for a relational room's `align`
  clause, both replacing a silent wrong position. They are deliberately separate codes, not one
  with two messages: "unknown edge" is literally false when the word *is* a known edge, and
  `arch lint --code` can now separate "I typo'd" from "I used the wrong axis". Both carry a
  machine-applicable fix that rewrites the offending word alone, so labels, `gap` and expressions
  survive and two bad rooms fix in one pass.
- **`test/spec-forms.test.ts` — the agent reference is now executable.** 44 positive snippets assert
  every documented form compiles with zero errors; 19 negative snippets assert every illegality the
  page names is refused *with its catalogued code*, distinguishing a code-less parse error from a
  resolve-time `E_*` and routing the soundness codes through `lint()` rather than `compile()`. What
  makes it permanent is the binding: keyword set-equality catches a new keyword, a new pure
  `clauseAtoms()` catches a new clause, and the positive corpus catches a wrong *order* — a snippet
  written by copying a grammar line will not compile if the line is wrong. `clauseAtoms` is the exact
  inverse of `assertDoorEnumsRendered`: that asserts a table entry has a rendering, this asserts a
  rendering has an exercise. Non-vacuity is proven rather than asserted — a planted clause with no
  snippet is shown to be caught while the unplanted line is shown clean, so the miss is the plant.
  The eight whole-plan spatial codes it cannot reproduce live in a `NOT_REPRODUCED_HERE` map, each
  naming its owning suite, with a second assertion that deletes stale entries.
- **An agreement corpus in `test/gbnf-drift.test.ts`** — 71 plans run through both the bundled GBNF
  recognizer and the real `compile()`, asserting the two verdicts match. The expected verdict is
  taken from the compiler on every run, so there is no column to edit: it can only be greened by
  fixing the grammar or changing the language. Against the previous grammar it fails 24 agreement
  cases; against this one, 113/113.
- **Seven public type exports that were missing from `src/index.ts`** (issue #61 item 3). Types
  reachable from `describe()`'s `SceneSummary` were readable but **unnameable** by a TypeScript
  consumer — you could read `summary.access.rooms[0].reachable` and never annotate, wrap or narrow
  it in a signature. Now exported: `OpeningSummary`, `InstanceSummary`, `AccessGraph`,
  `AccessRoomNode`, `AccessEdge` (the three the agent self-correction loop tells models to read),
  plus `DoorKind` and `RelatedSpan`, which the new guard found on its first run. The `Access*` trio
  is declared in `analyze.ts` but leaves through `describe.ts`, because `describe()` is the only
  public value that surfaces them — the export path matches the consumption path. Exports only:
  no behaviour, no output byte, and `CompileResult` stays append-only.
- **`test/public-surface.test.ts`** — the guard that makes the above non-recurring. It runs the
  TypeScript compiler over `src/index.ts`, walks `SceneSummary`'s declaration **transitively**
  through every type reference into whatever `src/` module declares it, and asserts each name is in
  the index's export set. The requirement list is **derived, never retyped**: add a field whose type
  lives in an unexported module and it goes red with no edit to the test. Documented in
  `docs/testing.md`.

### Fixed

- **`room … align <word>` accepted any identifier and silently drew the leading edge.** `align
  sideways` compiled clean and laid out exactly as `align top` — a typo produced a wrong plan and
  reported nothing, while every other closed value set in that statement refuses. This is the
  project's own silent-wrong-position family, one level up from geometry. Parse now checks membership
  against `REL_ALIGNS` and records the offending word and its span; resolve raises **`E_ROOM_ALIGN`**,
  which is what buys a catalogued code, a fix and `file` provenance. `botom` and `centre` get
  did-you-mean fixes; `sideways` gets hints but no fix, because it is beyond `closest()`'s two-edit
  limit and guessing would be worse than declining. `arch fmt` re-emits an invalid word verbatim
  rather than silently deleting it. Nothing was relying on the fallback: a sweep of the examples,
  fixtures, eval corpus and dataset templates found only axis-correct words, and no snapshot, golden
  or example moved.
- **An in-set `align` word on the wrong axis still fell through.** `right-of a align left` drew
  exactly as `align top`, with zero diagnostics, because `alignOffset` falls back to the leading edge
  on any axis mismatch — the same class as the word check, one level down. It now raises
  **`E_ROOM_ALIGN_AXIS`**. The mapping is *not* the clean 3/3 split it looks like: `alignOffset` tests
  for centring before anything axis-specific, so `middle` and `center` are honoured on **both** axes.
  The per-direction accept sets are therefore 4/4 with 8 mismatches, not 12 — refusing all three
  off-axis words would have broken `right-of a align center` and `below a align middle`, which draw
  correctly today. That also makes the fix a translation rather than a guess: every mismatched word is
  the other axis's leading or trailing edge, so `relAlignCounterpart()` names the counterpart directly
  and never declines (`closest()` is the wrong tool here — it would rank the refused word nearest to
  itself). `AXIS_ALIGNS` owns the two per-axis tables and `REL_ALIGNS` is concatenated from it,
  preserving the six-word union byte-for-byte. The sweep found no shipped drawing relying on the
  fallback, but it did find the repo's one cross-axis specimen **inside the fixture added by the
  previous fix**: it pinned all six edges to `right-of`, so two rows were cross-axis and passed only
  *because* the fallback was silent — a test written to prove the accept-set was asserting that the
  silence was fine.
- **`grammars/archlang.gbnf` derived eleven forms the parser rejects.** It is a constrained-decoding
  grammar shipped in the repo, served at archlang.uk and baked into the MCP shim; accepting token
  sequences the parser refuses defeats the one job it exists to do. The dominant defect is a **class,
  not an instance**: every element's optional clauses were rendered `( clause )*`, but the parser
  reads them as a fixed sequence of `if` tests, so both re-ordering and repetition are parse errors —
  `door … swing in hinge left` and `furniture … label "b" size 1000x2000` both derived and both fail
  to compile. Runs of optionals now render in the parser's own order, with `DOOR_ENUMS` key order
  injected rather than retyped and a build-time guard that the order still matches. Also fixed: the
  trailing `wall` clause on `door`/`window`/`opening` (it is `at`-form-only; after `on <wall>` it is a
  parse error — the same defect found while correcting `spec.llm.md`, now consistent between the two
  generators), an empty or single-point wall body, an `arc` as a wall body's first vertex, a two-point
  `room polygon`, `strip`'s cross keyword (which is chosen *by* the direction), `at` inside a strip
  room, and a non-string `style` value. Three **under**-permissive defects — valid forms a decoder
  simply could not express — are fixed too: `paper a4` (the parser upper-cases the size but compares
  the orientation exactly; the asymmetry is now derived from `PAPER_SIZES`), a bare `theme`, and a
  leading-dot number. `ref ::=` was also defined twice, which some GBNF loaders reject outright.
  Three known divergences are **pinned rather than fixed**, each with its recipe: `theme { wall 5 }`
  needs `theme.ts`'s private alias map exported; `place … rotate 45` needs a `PLACE_ROTATIONS` table
  (typing the set into the generator would be the third-copy sin these guards exist to prevent); and
  `level 1.5` is not expressible, because integrality is a property of the value after unit folding.
- **Two structural holes in the spec generator's own guards.** `dims` was a `KEYWORDS.attribute`
  entry that is a *statement*, so it fell between the element-table and control-table set-equality
  guards and was documented nowhere — the same hole that once let `strip` ship unspecced. It was
  wider than diagnosed: `accTitle` and `accDescr` sat in exactly that position too, appearing only as
  bare words in a keyword bullet. A third table now partitions `KEYWORDS.attribute` between statements
  and element clauses, and the five pre-existing setting lines render byte-identically from it.
  Separately, `SCRIPTING_KEYWORDS` carried an unfalsifiable claim — "the prose covers these" — that
  was false for `theme` and `style`; it is now a check that each keyword appears in a code context in
  the *rendered* body, with the generated keyword reference cut first so the check cannot test its own
  input. It failed on exactly those two, which is what forced the missing bullet to be written.
- **Eight closed value sets that existed only as a TypeScript union plus a literal conditional** now
  live in `src/ast.ts` with two real consumers each (a parser accept-list *and* a diagnostic, or an
  element parse *and* its params doc): the relational directions and alignments, the `dims auto`
  modes, the north cardinals, the `strip` directions, the vertical directions, the dim refs and the
  arc directions. Fifteen sets now interpolate into the grammar strings instead of being retyped,
  every one rendering byte-identically — they matched today, and `assertVocabRendered` is what keeps
  them matching: add a value with no rendering and `gen:spec` throws. Two silent documentation gaps
  close alongside them — the wall material list (a wrong guess degrades the drawing with only a
  warning) and the fact that `dims auto`'s mode set is closed at four.
- **Seven of the nineteen grammar lines in `spec.llm.md` were factually wrong, and four taught forms
  that do not compile** (issue #61). The spec is injected verbatim into agent system prompts, shipped
  in the npm tarball, baked into the MCP shim and served at archlang.uk, so a wrong line is a wrong
  model. Measured downstream in ArchCanvas: **11 of 18 generations failed to compile**, dominated by
  the furniture forms the reference taught.
  - `furniture` printed `<category> [id=…]`; the parser takes `id=` **first**, so every id-bearing
    furniture form on the page raised `Expected "at" but found "id"`.
  - The `wall` line **omitted `[id=<name>]` entirely** — the reference never taught how to name a
    wall, while four other lines (`door on`, `window on`, `furniture against wall`, `dim radius`)
    require a wall id. Arguably worse than the reported bug: an agent could not write a valid door
    from the reference alone.
  - `door`/`window`/`opening` read as if the trailing `wall <id|category>` clause pairs with either
    placement form. It is `at`-form-only; after `on <wall>` it is a parse error.
  - `furniture` showed `rotate` on all four position forms, but an `against` piece takes its rotation
    from the wall (`E_FURN_AGAINST`).
  - The **Common-mistakes** table — the most-copied section on the page — taught
    `label "{aream2(W,H)}"` as though `aream2` were a builtin. It is a `let` in
    `examples/parametric.arch`, so the row raised `E_UNKNOWN_FN`.
  - Also: `dim`'s `offset` printed as required (it is optional, default 300), the curve call-outs'
    `[offset]`/`[text]`, `wall`'s `[material … scale/angle]` sub-clauses, and `align center`.

  Rule 6 now leads with **"`id=` comes FIRST"**, correcting the teaching for all ten id-bearing lines
  at once. Root cause: the lines are hand-typed in `scripts/gen-llm-spec.ts`, so `check:drift` — which
  proves *reproducibility*, never correctness — stayed green while the generator reproduced the same
  wrong text every run. The proof that no text-level guard can close this: `grammars/archlang.gbnf`,
  produced by a *different* hand-typed generator, had `wall` and `furniture` **right** the whole
  time. Two generators, the same shapes, disagreeing, both passing drift.
- **A runtime error message promised a release that shipped without the feature.** `room polygon`
  with an `arc` edge said "planned for v1.25" — so a user running 1.25.0 was told to wait for the
  release they were already on. The message (and the matching prose in
  `docs/language-reference.md`) now points at the roadmap and promises no release; the test that
  pinned the version string now pins its **absence** alongside the guidance that must survive.
- **`column`'s `at` was documented as a centre and implemented as a top-left corner.** `resolve`,
  `bounds` and `render` all lay it out with `rectCorners(at.x, at.y, w, h)`, whose first corner *is*
  `at` — consistent with a room's `at` and with every other rectangle in the language (the opening
  elements are the ones that centre on `at`, because they sit on a wall). The **doc** was wrong, not
  the code: the param doc — which surfaces in LSP hover — and the language reference now say
  top-left. No behaviour change.
- **`package-lock.json` recorded the pre-release versions from before v1.25.0 shipped** — root
  1.24.0, vscode 0.13.0, mcp 0.2.3 with range `^1.24.0` — while every `package.json` carried the
  released ones. A plain `npm install` therefore dirtied any clean tree, and CI's `npm ci` installed
  against version metadata that disagreed with the packages.
- **ADR 0010 showed markup two other documents forbid.** Its §9 cited `<meta name="color-scheme"
  content="light dark">` while what ships is `content="light"`, and both ADR 0014 and `CLAUDE.md`
  forbid restoring the two-value form (it re-arms Chromium's Auto Dark Mode, which has inverted this
  site before). The header's binding/superseded split now carves out that clause by name and the line
  is struck with a dated note.
- **`npm run typecheck:all` fails in a fresh worktree with ~67 spurious errors**, and `AGENTS.md` now
  says so. `playground/tsconfig.json` maps the bare `archlang` specifier to `../dist/index.d.ts`; with
  no `dist/` that path misses and TS falls back to the repo-root `node_modules/archlang` symlink,
  which points at `editors/vscode` rather than the core. The 46 `TS2305 "has no exported member"`
  plus 21 knock-on implicit-anys read exactly like a broken public surface, which is maximally
  misleading for anyone working on one. Build first.

### Added — docs

- **`docs/backlog.md`**, the forward-looking work queue: what is deliberately not being done yet, in
  waves, with the trigger that would promote each item.

### MCP shim (`@chanmeng666/archlang-mcp` 0.2.5)

- **Version-bump-only, and the bump is the point.** The shipped sources did not change; `spec.llm.md`,
  `llms-full.txt` **and** `grammars/archlang.gbnf` all did, and all three are copied into the tarball
  at **pack time**, so published 0.2.4 hands hosts the wrong furniture syntax *and* a grammar that
  lets a constrained decoder emit uncompilable output. Only a version bump ships the refreshed
  resources. The core dependency range is re-pinned to `^1.26.0`.

### VS Code extension (`ChanMeng.archlang` 0.15.0)

- Rebundled against core 1.26.0, so the bundled language services learn `E_ROOM_ALIGN` and
  `E_ROOM_ALIGN_AXIS` with their quick fixes. Its `@chanmeng666/archlang` devDependency was pinned at
  `^1.24.0` — **two releases stale**, because unlike the shim's, that range has no lockstep test; it
  is re-pinned to `^1.26.0`. Marketplace upload remains a human web step. Details in
  [`editors/vscode/CHANGELOG.md`](editors/vscode/CHANGELOG.md).

## [1.25.0] - 2026-08-11

**Orientation, openings, and the end of a defect class.** Two new language surfaces — a `site`
block that names the four compass directions a brief actually speaks in, and four door kinds
beside the default `hinged` — plus the closure of a whole family of silent bugs: a position
derived from a shape's *bounding box or centroid* rather than from the shape itself. Six
instances of that class were found and fixed this cycle; the search that locates them is
recorded in `docs/research/2026-08-06-competitor-borrowing-roadmap.md` §9.1.

Every new form obeys a byte-identity law: a plan that does not use it renders, describes and
lints exactly as before. `site`, `door hinged …`, and every unchanged plan are byte-identical,
verified by SHA-256 sweeps over all fourteen shipped examples.

### Added (the two P2 language features)

- **Site & orientation** — `site { street north|south|east|west [hemisphere north|south] }`, a
  plan-level setting that **draws nothing** and names five directions on `describe --json`'s new
  `site` key: `street`, `back`, `equator_side`, `sunrise_side`, `sunset_side`. Those names are
  assertable by name in an intent's `windows.facing` (with `E_INTENT_NO_SITE` when the plan declares
  no site — never a silent pass), and read by one advisory rule, `W_ROOM_NOT_EQUATOR_FACING`.
  **The `_side` names are a drafting heuristic for an aspect, not a daylight measurement** —
  ArchLang still has no sun model, no latitude and no date, and every surface that emits them says
  so. A plan with no `site` is byte-identical everywhere.
- **Door vocabulary** — a bare kind word may lead a `door` statement
  (`door pocket on w1 at 40% width 900 slide left`): `sliding`, `barn`, `bifold` and `pocket` beside
  the default `hinged`, plus `slide left|right` and a drawing-only `open <0..1>`. A non-hinged leaf
  sweeps nothing, so `doorSwing()` returns `null` for it and `W_SWING_OBSTRUCTED` stops applying —
  its remedy set now names the kinds that solve it — while every doorway rule (adjacency, landing,
  clear width) is unchanged. New codes `E_DOOR_KIND_CLAUSE`, `E_DOOR_OPEN_RANGE` and
  `E_DOOR_KIND_CURVED` **refuse** a wrong pairing rather than draw it as if the clause were absent,
  and the new `W_POCKET_RUN` measures the wall a pocket panel must slide into — truncated at any
  intervening opening — against `width + max(50 mm, width × 5%)`, carrying the reverse-slide rewrite
  as its only applicable fix. A plan naming no kind is byte-identical, and `door hinged …` is
  identical to omitting the word.

### Fixed (follow-ups opened by the Batch-3 pass)

- **`describe().windows[].facing` found a window's outward side by comparing it to the bounding-box
  midpoint of the room union.** A **courtyard** plan puts that midpoint *inside the courtyard*, so
  every window on a courtyard wall was silently reported facing backwards — as was every window on a
  `polygon` or `circle` host room's wall, which takes the same branch because such a room has no four
  sides to pick the nearest of. The outward side is now found by **probing one wall thickness off
  each face of the window's own host segment and taking the side with no room on it**, which is exact
  at any wall angle (an `arc` wall is probed along its true normal, not its chord's). The old rule
  remains as the stated tie-break for the two cases a probe cannot decide — rooms on both sides, or
  on neither. Every shipped example is byte-identical.

- **Lint fixes now carry the file their spans belong to.** A lint diagnostic raised on an element
  written in an `import`ed module — and every machine-applicable fix on it — now carries `file`, so
  `applyFixes` **refuses** it instead of splicing that module's byte offsets into the middle of the
  importing source. Reproduced on an unmodified `W_DIM_INSIDE`, which rewrote a `room … size` statement
  into gibberish. Resolve-raised fixes already had this via `stampProvenance`; lint runs after resolve
  and `RBase` carried no `file`, so the guard could never fire. `--json` now projects `file` and
  **drops the `line`/`col` it could only guess at** (they were being computed against the compiled
  source for a span belonging to another file), and `arch fix` reports the skip reason on a pass where
  every fix is declined. A plan with no `import` is unchanged, byte for byte.
- **`swing into <room>` and `furniture … against wall <w> in <room>` now ask the room's floor rather
  than its bounding box.** On a `polygon` or `circle` room the bbox test silently gave a door a swing
  into a wall the room does not border (and raised a false `W_SWING_ROOM_NOT_ADJACENT` on an edge it
  genuinely does), and backed a fixture onto a wall outside the room while `describe()` still reported
  it as inside. Rectangular rooms are byte-identical.
- **A rectangular room's `label "…" at (x,y)` is no longer parsed and then silently dropped.** The
  anchor now reaches the IR from both rect paths, so it is honoured in the drawing (area text
  included), is exempt from the label-placement post-pass like every other explicit anchor, and can
  raise `W_ROOM_LABEL_OUTSIDE` — checked at resolve on the absolute path, and deferred to
  `placeRelational` on the relational one, where a room first knows its own floor. Present since
  v1.23, so "an explicit `label at` always wins" had been true only for `polygon` and `circle` rooms.
  A rect room with no `label at` is byte-identical and `describe()` is untouched.

### Added

- **`W_DIM_OVERLAP`** — an advisory lint warning when two hand-written `dim` statements measuring
  parallel runs land in the same chain tier and draw over each other, with a machine-applicable fix
  that moves one out by the smallest whole number of `CHAIN_STEP` tiers that clears the other's line
  and text. Adjacent members of one chain sharing a station tick, dims crossing at a corner, and
  repeated instances of a single `for`-generated statement are all deliberately **not** flagged, and
  nothing in the compiler ever re-stages an author's dimension on its own — the `offset` is the tier
  control, and this only ever advises.
- **The eval gains an intent-fidelity slice** (`npm run eval:fidelity`): deliberately infeasible
  briefs where *declaring infeasibility* is the scored-correct answer, plus a deterministic,
  **judge-free** measure of a plan and of a presented contract against a brief's *stated* numbers — so
  a repair loop can never buy points by silently rewriting the requirement it could not meet. It ships
  as a separately-reported slice in its own corpus file: `eval/corpus.json`, `eval/judge-fixture.json`,
  `eval/live-baseline.json`, `eval/results.md` and `JUDGE_VERSION` are all **untouched**, so the
  26-brief authorability rate keeps its ruler and stays comparable to every historical run. The
  refusal protocol lives only in the new slice's prompt, for the same reason.

### Fixed

- **Room labels no longer print on top of the drawing.** A post-pass over the lowered Scene
  (`src/label-placement.ts`, run inside `toScene` after the walls are lowered and after `dims auto` —
  the only place a dimension number is visible at all) moves a room's name and its area text off
  furniture, door swings, stair symbols and dimension text, but **only when more than 2% of the
  label's own box is genuinely buried**, so a plan whose labels are already clear keeps its exact
  previous bytes. An explicit `label "…" at (x,y)` is never relocated, and `describe()` is untouched —
  a label is a drawing fact, not a measured one.
- **`dims auto` extension (witness) lines now terminate on the facade they point at** rather than on
  the chain's straight baseline. A stepped or angled exterior — such as `examples/gallery-l.arch`'s
  40° south-west run — used to draw witness lines beginning metres away over blank page, with no
  diagnostic of any kind. A tick standing over a *curved* facade keeps the previous flat terminus
  (arcs deferred by name; `examples/aquarium.arch` is byte-identical), and no dimension's measured
  value, `describe()` output, or rectilinear plan's bytes change.
- **`dims auto` staggers a crowded chain's numbers.** A run of narrow bays tiered correctly but
  overprinted its own values (twelve 200 mm bays cannot each hold a ~309 mm-wide "200"). The
  GB/T 50104 · ISO 129 remedy now alternates every other value across its dimension line, decided per
  chain from one shared closed-form width estimate (`src/text-metrics.ts`, which the `W_DIM_OVERLAP`
  rule and the error card now share) and applied **only when the numbers actually collide** — a plan
  whose dimensions already fit is byte-identical. Because a staggered number flips *inward*, the
  annotation band `DIM_BAND_FONTS` reserves is unchanged, so no papered plan was re-fit.
- **Circulation on a concave floor.** A room's routing anchor is now seeded from its label point (the
  centroid whenever the centroid is on the floor, the ring's pole of inaccessibility only when it is
  not) instead of the raw centroid. The nearest legal cell to an off-floor point is the **lip of the
  notch**, so an L/U/C room's walk, detour ratio, route targets and drawn overlay path were measured
  from the wrong end of the room — on a test U, a 10.9 m walk was reported as 5.6 m. Output is
  unchanged wherever the centroid was already legal, which is every shipped example.
- **DXF export declares every layer its entities reference.** `stair`/`elevator`/`escalator` draw on
  the `A-FLOR-STRS` / `A-FLOR-EVTR` sublayers, which the LAYER table did not declare, so a plan with a
  shaft shipped entities on layers a CAD reader had to invent. The only output change is two extra
  LAYER records in the header.

### Changed

- **`W_SWING_OBSTRUCTED`, `W_DOORWAY_BLOCKED`, `W_FURN_CLEARANCE` and `W_PATH_TOO_NARROW` now state
  the value required, the value measured, and the shortfall**, and carry the closed remedy set in
  `hints` — with a machine-applicable `hinge` flip on an obstructed swing *when the flipped
  quarter-disc is proved clear*. Remedies that need a choice of geometry stay hints (no invisible
  architect), and "narrow the door" **refuses itself** below the minimum passable width rather than
  relocating the violation into `W_DOOR_CLEARANCE`. The `W_SWING_OBSTRUCTED` hint no longer suggests a
  sliding door — the language has no way to express one.

- **`describe().windows[].facing` ignored the plan's `north` — it was a PAGE direction wearing
  compass letters.** A plan declaring `north right` still reported a window on the top edge as
  `"N"`, so an intent assertion `windows: { facing: "S" }` silently meant "toward the bottom of the
  drawing", not compass south — the one place the language already knows where north is
  (`north`, which the SVG/PDF north arrow is drawn from) was never consulted. `facing` is now a
  **true compass direction**: the page-relative answer turned by the declared north, which under
  the default `north up` is the same answer as before. A `north <deg>` bearing snaps to the nearest
  cardinal, with an exact 45° tie rounding **clockwise** (`north 45` reads as `right`); the arrow
  keeps being drawn at the exact bearing. The page-relative direction is not lost — it comes back as
  the new append-only `windows[].facingPage`, emitted **only when north actually turns the answer**,
  so a plan on the default north (which is every plan that declares no `north`) has a
  byte-identical summary. `examples/two-bed.arch` (`north right`) is the visible case: its
  top-edge windows now read `facing: "W"`, `facingPage: "N"`. Rendering is untouched.
- **A concave room's label could be drawn off its own floor.** Since v1.23 a `room … polygon` ring
  was labelled at its exact area centroid, and a deep C, a U or an L with thin legs puts that
  centroid in its own notch — outside the floor, on top of whatever is drawn there. The automatic
  anchor now falls back to the ring's **pole of inaccessibility** (`polygonLabelPoint` in
  `src/geometry/polygon.ts`): the interior point furthest from any edge, i.e. the middle of the
  widest place the text can sit. **The centroid is returned unchanged whenever it is legal**, so the
  fallback is unreachable for a rectangle, a circle, any convex ring and most concave ones, and no
  existing drawing moves by a byte (`examples/gallery-l.arch` included — pinned by a test). The
  search is a fixed lattice plus a fixed number of halving rounds, all pinned in source, with ties
  settled by visit order: a pure, deterministic function of the vertex ring, not a loop with a stop
  condition. An explicit `label "…" at (x,y)` still wins, and `W_ROOM_LABEL_OUTSIDE` still fires on
  it — it was always a diagnostic about the *author's* anchor, never about the automatic one — but
  its catalog fix text no longer tells you the centroid is the only alternative.
- **Control characters and unpaired surrogates in string literals reached every backend.** A label
  containing a raw control char or a lone surrogate produced SVG that is not well-formed XML, an
  ASCII plan with control bytes in it, and DXF whose group-code pairing could be broken. New
  `src/text-safe.ts` (`xmlText` / `plainText`) is wired into the SVG, ASCII, DXF, theme and PDF
  paths. It is the **identity on well-formed text**, so every existing snapshot and golden is
  byte-unchanged.
- **`RoomSummary.floor_circle` was emitted at runtime but missing from the public type** since
  v1.24.0 — a consumer typing `describe()`'s output could not see a circular room's exact centre
  and radius. Append-only type fix.
- **Playground: click-to-source never fired with a real mouse.** The pan/zoom controller's
  `setPointerCapture` retargets the click away from the drawn element, so reading `e.target` always
  missed; `interact.ts` now hit-tests the POINT via `elementFromPoint`. Invisible to the type
  checker, the unit suite and `vite build` alike — found by the first Playwright run.
- **Docs site: live `arch` fences that could not compile.** A plain ```` ```arch ```` fence becomes
  a running `<ArchLive>` widget in the reader's browser, so `/relational`'s opening fragment
  rendered a red error card and `/errors` rendered 104 widgets of which 103 showed a generic
  parse error instead of the code each section documents. Fixed at the source
  (`scripts/gen-error-codes.ts` emits `arch static`) and gated by `test/docs-fences.test.ts`.

### Changed (infrastructure — no language or output change)

- **Door enum single-sourcing.** `hinge`/`swing` (and the `hinge near start|end` spelling) now come
  from one `DOOR_ENUMS` table in `src/grammar/tokens.ts` instead of seven hand-kept copies — parser,
  resolver, Plan-JSON validator, Plan-JSON schema, the LSP hover type, and the two **generators**.
  `gen:gbnf` and `gen:spec` now **fail the build** when a door clause has no rendering, closing the
  class of bug where a literal typed inside a generator ships a stale grammar while `check:drift`
  stays green (a v1.19 GBNF that could not decode `arc`/`polygon`/`zone` was exactly this). No
  language change and no output change: every generated artifact regenerates byte-identically.
- **`npm run check:test-wiring`** — a new zero-dep guard (`scripts/check-test-wiring.mjs`, in
  `npm run check` and CI's `builds` job) that fails if any tracked `*.test.ts` falls outside
  `vitest.config.ts`'s `test.include` globs, **or if any include glob matches nothing**. A test file
  outside that list is never collected, never skipped and never reported, so it reads as coverage
  while `npm test` stays green; a dead glob is the same fault from the other end. The guard *parses*
  the globs out of the config rather than carrying a copy that could go stale.
- **`test/axes.test.ts` spawns the CLI the worktree-safe way** — the house `process.execPath` +
  `--import tsx` idiom with repo-relative paths, instead of reaching into an absolute
  `node_modules/tsx/dist/cli.mjs`. The suite no longer fails in a git worktree that has no
  `node_modules` of its own, which is now the normal way work happens in this repo.

- **Automated testing buildout.** The verification system is now mapped end to end in the new
  **`docs/testing.md`**: the three tiers (local, PR, nightly), every guard with the law it enforces
  and what to do when it goes red, and the house patterns for adding tests.
  - **PR CI** gained a `builds` job (all four workspaces compile, `typecheck:all`, MCP baked-resource
    freshness, VS Code bundle tests), a Windows leg (tests + drift at runner-default line endings),
    two Playwright E2E jobs (playground, docs) and CodeQL; the Node 22 leg now also collects
    report-only coverage over `src/` (no thresholds — `npm test` stays the single pass/fail signal).
  - **New `nightly.yml`**: production smoke, a report-only dependency audit into a pinned issue,
    a full-history secret scan, a wider OS×Node matrix, and the read-only `@prod` Playwright subset
    against the live sites (also a deploy-staleness probe).
  - **Three by-hand release probes became gates**: MCP pack-time resource staleness
    (`packages/mcp/scripts/check-dist-resources.mjs` + the string-equality dep-range pin in
    `packages/mcp/test/lockstep.test.ts`), the MCP `server.json` ↔ `package.json` version lockstep,
    and the VS Code "did the rebundle take" symbol count (now the `__CORE_VERSION__` bundle stamp).
    Post-deploy verification moved from a root-URL `curl` to `scripts/smoke.mjs`, which checks every
    machine route and asset, parsed from `sync-docs.mjs`'s own tables.
  - **New suites**: site/brand/share-codec/docs-sync lockstep guards, the GFM `\|`-in-table and
    live-`arch`-fence docs tripwires, output-escaping fuzz over SVG/ASCII/DXF, full MCP
    tool/resource/lockstep/fuzz coverage, VS Code LSP handler + stdio + bundle-freshness tests, and
    Playwright suites for both sites. `test/visual.test.ts`'s missing-`@resvg/resvg-js` case is now
    a hard failure in CI instead of a silent vacuous pass.
  - **New scripts**: `typecheck:all`, `test:coverage`, `e2e:playground`, `e2e:docs`,
    `build:workspaces` and the four `*:only` workspace builds.

## [1.24.0] - 2026-07-26

### Added

- **`arc (x,y) radius R [cw|ccw] [major]` — curved wall edges.** Written where a vertex goes
  inside a `wall` body, an `arc` clause makes **that edge** a circular arc from the previous
  vertex instead of a straight run, so a bowed facade or a cylindrical drum is one statement.
  Two endpoints and a radius describe four arcs; the defaults pick the common one (the **minor**
  arc turning **`ccw` as drawn**, bulging left of travel) and `cw` / `major` select the other
  circle / the long way round. A closed curve is written as its halves — there is no
  "arc back to the start" form, so every edge's radius stays visible in the source.

  - **The visible faces are TRUE arcs** at `r ± t/2` — SVG `A` commands, native DXF `ARC`
    entities — so a curve is never drawn faceted at any zoom. Only the poché *fill* is
    tessellated, at a fixed 7.5° step (48 chords to the full circle).
  - **Openings work on a curve.** `on <wall> at <pos>` walks the wall by **run length**, and an
    arc contributes its arc length `R·θ` rather than its chord, so `at 50%` lands halfway along
    the wall *as walked*; an absolute `at (x,y)` is attributed by distance to the arc itself. A
    door's leaf and swing, and a window's pane and jambs, are taken from the **tangent at the
    opening**, so `hinge left|right` keeps its traversal-relative meaning.
  - **A `place`d component's curve is mapped exactly** — a frame is an integer isometry, so the
    radius and the swept angle survive a quarter turn, and a reflection reverses the arc's
    rotational sense.

- **`room [id=…] circle at (cx,cy) radius R` — circular floors.** The area is **exact πR²**,
  in closed form, through the one shared expression that feeds the drawn label,
  `describe().rooms[].area_m2`, the `schedule rooms` row and Plan JSON — never the tessellation
  the grid layer uses (a 48-gon is 0.14% short, enough to move the label). `describe()` reports
  the exact centre and radius as **`floor_circle`** (append-only) and leaves `floor_polygon`
  empty; `at`/`size` remain the enclosing square, so rectangle-shaped readers stay truthful. The
  floor is drawn as a real `<circle>`.

- **GB/T dimensioning for curves.** A linear chain cannot describe an arc, so `dims auto` now
  emits the round-geometry forms: one **`R<r>` leader** per distinct arc (deduplicated by centre
  and radius, so a circle written as two semicircles gets one call-out) and one **`φ<d>`**
  call-out across every circular room, while the exterior chains stay on the straight facades —
  a curved facade carries no chain and no tick. The manual forms **`dim radius <wallId>
  [segment <n>]`** and **`dim diameter <roomId>`** derive both geometry and text from the element
  they name, so the number can never disagree with the drawing.

- **`examples/aquarium.arch`** — a ~60 × 46 m public aquarium, the curved-geometry flagship and
  the first non-rectilinear example in the corpus: a cylindrical tank as a `room circle` inside a
  drum wall of two arcs, a south-east frontage turned as a quarter circle of R12000, doors **on**
  the curve, straight service wings, A2 at 1:200 with `dims auto all` + `schedule rooms` and
  positioning axes on the straight structural grid only. `validate --strict` clean.

### Changed

- **A wall carrying an `arc` is lowered per segment, never through the polygon boolean.** That is
  what keeps a curved plan's bytes independent of the **optional** `clipper2-wasm` dependency
  (the determinism suite compiles with the backend both registered and cleared), and what keeps
  the faces true arcs rather than a unioned 48-gon path. The split is **per wall**, so a plan
  mixing a curved facade with straight service wings keeps the straight walls' existing union —
  and therefore their bytes. A plan with no `arc` is **byte-identical**.
- Like any non-orthogonal wall, a curved wall's openings are drawn with an opaque cover rather
  than a real hole punched in the solid, so a doorway on a curve paints over the floor
  immediately either side of it. `WallSegment.arcWall` now marks **every** segment of an
  arc-bearing wall — including its straight ones — so an opening on such a wall no longer
  wrongly believes the boolean voided it.
- `docs/analysis.md` documents the deliberate **exact-vs-chordal** split: areas, call-outs, the
  drawing extent and opening attribution are exact; the occupancy/circulation grids, room overlap
  and the poché fill are chordal on an inscribed 48-gon. It also records why a circular room
  legitimately reports no **`adjacent`** rooms (a circle meets a straight wall at a point, and
  `adjacent` has always meant a shared *run*) and carries its connectivity through its doors.

### MCP shim (`@chanmeng666/archlang-mcp` 0.2.3)

- **Its shipped context resources were five releases stale.** `archlang://spec`,
  `archlang://context` and `archlang://grammar` are copied into the package at pack time, so the
  published 0.2.2 described the **v1.19** language while its dependency range resolved to a current
  core — an MCP-native agent was told nothing about `paper`/`scale`, `level`, `place`, `zone`,
  `room polygon` or `arc`, and the GBNF grammar it was handed could not *decode* them at all. This
  republish refreshes all five resources; the dependency range is now `^1.24.0`, so the range can
  no longer promise a surface the installed core lacks.
- **`compile` no longer answers a multi-storey plan with the ground floor alone.** It returns every
  storey in `pages[]` (`{ level, name, output }`) and takes a `level` selector; `output` still holds
  the lowest storey, so a level-unaware caller is unchanged, and a single-storey result carries no
  `pages` key. An undeclared `level` comes back as an error naming the real `levels` — never a
  silent substitution that would read as a successful render of the storey you asked for.
- **The handshake reports the shim's real version.** It was a hardcoded `"0.2.0"` from 0.2.1 on, so
  the server misintroduced itself to every host; it is now derived from `package.json` the way the
  core CLI derives its own, and a test pins the two together.
- Tool descriptions now name the current surface (the shape facts `floor_polygon` / `floor_circle`,
  `zones`, `levels`, `vertical`, `bbox_outer`, `freedom`) instead of the v1.14 one.

### Diagnostics

- **`E_ARC_RADIUS`** — a radius under half the chord describes no circle through the two
  endpoints. Carries a **machine-applicable fix** substituting the minimum radius; the offending
  edge stays straight so the rest of the plan still draws.
- **`E_ROOM_RADIUS`** — a `room circle` with a non-positive radius.
- **`E_DIM_CURVE_REF`** — a `dim radius`/`dim diameter` naming a missing, ambiguous or
  wrong-shaped element (a `diameter` on a rectangular room, a `radius` on a wall with no arc, or
  a multi-arc wall with no `segment <n>`). Never a guess.
- **`E_FURN_AGAINST`** now covers `furniture … against wall <id>` on an **arc** segment: a curve
  has no single back direction, so the message points at `at (x,y)` + `rotate`. Relatedly, an arc
  segment never "backs" a fixture edge — its chord can be collinear with a room side while the
  wall bows metres away — so `W_FIXTURE_BACK_TO_ROOM` declines instead of deriving a wrong
  rotation.

### Deferred (named, not silent)

- An `arc` edge **inside a `room polygon` ring** is refused at parse time, naming **v1.25**: the
  ring's whole analysis layer (effective-vertex count, self-intersection, centroid, adjacency) is
  written on literal vertices. Use `room circle`, or a curved wall with a straight-edged room.
- **No annulus form** (a ring-shaped gallery is two rooms and two walls) and **no arc-length
  dimensions**.

## [1.23.0] - 2026-07-26

### Added

- **`room [id=…] polygon (x,y) (x,y) (x,y) …` — rooms that are not rectangles.** An
  implicitly-closed **simple polygon** of three or more grid-snapped vertices replaces `at` +
  `size`, so an L-shaped gallery, a trapezoid lobby with an angled facade or a chamfered corner is
  one statement. The resolved room still carries `at`/`size` as the ring's **bounding box**, so
  every reader written for rectangles sees a truthful extent — but nothing measures the room by it:

  - **area is the exact shoelace area** (an L reports 132 m², not the 168 m² its box would claim),
    through one shared expression feeding the drawn label, `describe().rooms[].area_m2`, the
    `schedule rooms` row and Plan JSON's `area`;
  - **the label sits at the polygon's area centroid** (closed-form), overridable for a concave room
    with `label "…" at (x,y)` — advisory `W_ROOM_LABEL_OUTSIDE` when that point is off the floor;
  - **adjacency is a shared boundary run** between two rooms' edges at any angle, **doors and
    windows attribute by distance to the room's own edges** (so an entrance on an angled facade
    connects the room behind it), and the **occupancy / nav grids** drop every cell whose centre
    falls outside the ring, so an L's notch is never counted as floor;
  - **`W_ROOM_OVERLAP` became exact** — a room tucked into an L's notch has an overlapping bounding
    box and a disjoint floor, and no longer warns; two floors that really intersect still do;
  - `dims auto`'s room chain takes polygon **vertex** coordinates, and a `place`d instance
    transforms the ring vertex-by-vertex (a frame is an integer isometry, so the turn is exact).

  **Rectangle-only clauses refuse rather than approximate** — the discipline of the feature. New
  `E_PLACE_POLY` covers relational placement against a polygon reference and
  `furniture … in <poly> anchor|centered`, each naming the way out (`at (x,y)`, plus `rotate`);
  `against wall` and absolute `at` are unaffected. `W_FIXTURE_BACK_TO_ROOM` does not fire inside a
  polygon room (there is no north/south/east/west side to be a fixture's back), `arch repair`
  declines and says so in `unresolved`, and `arch suggest` proposes no opening on an edge the room
  does not have. A crossing ring is `E_ROOM_POLY_SELF_INTERSECT`, one with fewer than three
  effective vertices `E_ROOM_POLY_DEGENERATE`.

  New flagship `examples/gallery-l.arch` (lint-clean under `--strict`). **An all-rectangle plan is
  byte-identical**, `poly` being simply absent from its IR.

### Fixed

- **Acute wall joints can no longer grow a mitre spike.** A mitred join's point grows as
  `1 / sin(θ/2)` — 1.41 × the line weight at the 90° corners the rectilinear boolean produces,
  23 × at 5°. The cap now rides on the Scene `Paint` (`miterLimit`) instead of being left to each
  backend, because the backends' defaults **disagree**: SVG's is 4, PDF's is 10, so the same
  drawing spiked in the PDF export and not in the SVG. SVG now emits `stroke-miterlimit="4"`
  (the spec default — rendered output is unchanged), the PDF export emits `4 M`, and the clipper2
  offset uses the same limit.

## [1.22.0] - 2026-07-26

### Added

- **`zone <id> ["Label"] { … }` — declarative wing / department / phase grouping.** A large brief
  does not talk about rooms, it talks about *the west wing*, *the clinical block*, *phase 2* — and
  until now the language had no word for that. `zone` is a purely **lexical** container with **zero
  geometric semantics**: everything inside resolves exactly as if the wrapper were deleted (same
  coordinates, same ids, same auto-id numbering, same `let`/`set` visibility — a zone is
  deliberately **not** a scope), so **wrapping a plan in zones compiles to byte-identical SVG**.

  ```
  zone west "West Wing" {
    room main at (0,0) size 12000x9000 uses gallery
  }
  ```

  - **Membership is by DECLARATION, never inferred from position** (ADR 0005): a room is in the
    west wing because it was written there, not because a solver decided it looks western.
  - Zones **nest** (`west.galleries`, innermost wins) and are legal wherever a statement is,
    including inside a `level` block and a `component` body.
  - **`describe().zones[]`** — id/label/path/level/rooms/room_count/floor_area_m2, present only when
    the plan declares a zone. Nesting **rolls up**, so a parent zone's area deliberately overlaps
    its children's and is not the plan total.
  - **`arch describe --zone <path[,…]>`** — a DISPLAY filter over the zone's member rooms, composing
    with `--level`/`--room`/`--select`. As with every other filter, `ok`, the diagnostics and the
    exit code still come from the whole plan.
  - **`schedule rooms` groups by zone**: the drawn table groups rows by innermost zone with a
    per-group **subtotal** (a partition, so the subtotals add to the TOTAL). An unzoned plan draws
    the flat table byte for byte as before.
  - No new lint rules — zones are declarative metadata with no geometry, so no soundness rule can
    key off them without inventing spatial meaning.

- **`place <component>(…) as <name> at (x,y) [rotate 0|90|180|270] [mirror x|y]` — component v2:
  a component becomes an addressable, transformable INSTANCE.** Until now a component was a text
  macro: it spliced its body into the caller's coordinate system and the caller's id space, so
  drawing the same wing twice meant re-deriving every coordinate and every id by hand. `place`
  makes one `.arch` body — authored in **local coordinates from `(0,0)`** — into a piece of
  building you compose:

  ```
  place wing() as west at (0,0)
  place wing() as east at (42000,0) mirror x
  ```

  If you know React, you already know the shape: `component` is the component, `place … as` is the
  element, `at`/`rotate`/`mirror` are its props, and `west.main` is how the parent reaches a child.

  - **`as` and `at` are required.** An instance that cannot be addressed is not a component, and
    one that lands wherever its literals point is the old macro (still spelled `wing()`, semantics
    untouched). The grammar refuses to blur the two.
  - **Ids are namespaced per instance** (`west.main`, `east.main`) with auto-id counters restarting
    per instance, so two instances are **order-independent**. Dotted names work in every REFERENCE
    position — `door … wall west.shell`, `furniture … in west.main`, `arch describe --room west.main`
    — and are rejected in DECLARATION positions (**`E_DOTTED_DECL`**). A repeated instance name is
    **`E_DUP_INSTANCE`**.
  - **`rotate`/`mirror` are exact integer isometries** (a 2×2 signed-permutation matrix in the new
    `src/frame.ts`; no trigonometry, no float drift) and they **compose**, so a `place` inside a
    component body just multiplies frames. A mirror is real physics: door swings, fire exits and
    fixture facings all come out mirror-image.
  - **An instance is a closed world going out.** It resolves entirely in its own frame, against its
    own walls and rooms, and one rigid transform carries the result into the plan — which is what
    makes `anchor top-left`, `against wall … side`, `swing into`, `right-of` and `hinge left` mean
    inside a rotated instance exactly what they mean when the component is drawn alone. The plan can
    reach into an instance; a component cannot reach out of itself.
  - **Analysis still sees one building.** Flattening happens before `lint`, `describe()` and the wall
    union, so cross-instance room overlap fires, `dims auto` measures the composed facade, and the
    positioning axes pick up instance openings.
  - **A `place`d instance is implicitly a `zone`** named after the instance, so
    `describe().zones`, `arch describe --zone west` and the grouped `schedule rooms` table all work
    with no `zone` declaration.

- **`import "wing.arch" as wing` — a whole FILE is a component.** With `as` instead of an item list,
  `import` binds the module's own top-level drawable statements as an implicit zero-parameter
  component: one `.arch` file authors one room, one wing, one unit. The module's plan-level settings
  (`units`/`grid`/`paper`/`scale`/`north`/`title`/`axes`/`schedule`/`legend`) are deliberately
  **ignored** — one drawing is issued on one sheet at one scale, and the root plan owns it — and its
  `level` blocks are dropped (a storey is a page). A module with no drawable body warns with
  **`W_IMPORT_EMPTY_FILE`** rather than binding silence. A module's own `component`s stay available
  to its body, so a file may call its private helpers.

- **`describe()` reports the composition.** New append-only `instances[]` (name, component, origin,
  transform); `instance`/`component` on rooms and fixtures, `instance` on doors, and `instance` on
  every `freedom.elements` row; `rotate` on `FurnitureSummary`. `--select instances` reads it alone.

- **`examples/museum-wing.arch` + `examples/museum-wings.arch`** — the multi-file flagship: a
  gallery wing that is a complete plan in its own right, and the 42 × 12 m building that imports
  that FILE and places it on both sides of a shared entrance hall, the east one mirrored. Both are
  `validate --strict` clean; both carry SVG snapshots and visual goldens.

### Fixed

- **A diagnostic raised inside an `import`ed component body no longer points at the wrong file — and
  `arch fix` no longer corrupts the importer.** A component's statements carry spans into the file
  they were *written* in, while the diagnostic is reported against the file being *compiled*, so
  those offsets silently addressed unrelated bytes of the importer. Worse, the offsets rode along in
  `diagnostics[].fixes`, and `applyFixes` spliced them in: an off-wall door inside an imported
  component rewrote the middle of the importer's `wall` statement. `Diagnostic` now carries
  append-only **`file`** (the module the span is measured in) plus **`instance`**/**`component`**,
  `FixSuggestion` carries **`file`**, and **`applyFixes` skips any suggestion carrying one**, with a
  reason naming the file the edit belongs to. Present since imports shipped in v0.10.

### Changed

- Identifiers may now contain a **dotted tail** (`west.perimeter`). Only a dot followed by an
  identifier start continues the word, so the `1..5` range operator is untouched.
- `arch repair` walks into a `place`d component body and reports each site as `unresolved`, naming
  the component and the instance, rather than rewriting a body whose local coordinates are not the
  plan coordinates the move was computed in. The v1.19 postcondition — every flagged piece gets a
  change entry or an `unresolved` entry, never nothing — holds for a twice-placed component.

## [1.21.0] - 2026-07-26

**"Vertical"** — the second sub-release of the large-building batch. v1.20.0 gave a plan a sheet; a
building still had exactly one floor. This release makes a plan a **set of drawings**: `level` blocks
render one complete sheet per storey, `stair` / `elevator` / `escalator` draw the conventional plan
symbols and carry the only rule in the language that joins two floors, and the circulation analysis
stops being scale-relative so a 100 m building's clear widths mean what they say.

`compile()` stays pure, synchronous and deterministic, and a single-storey plan with no vertical
element is **byte-for-byte unchanged**. The language gains four statement keywords (`level`, `stair`,
`elevator`, `escalator`) plus the `dir up|down` clause, six catalogued codes (**`E_LEVEL_MIX`**,
**`E_LEVEL_DUP`**, **`E_LEVEL_NEST`**, **`E_VERT_SIZE`**, **`E_STAIR_WIDTH`**, **`W_STAIR_UNMATCHED`**);
`compile()` gains the append-only `pages`, `describe()` the append-only `levels` / `vertical`, and
`Diagnostic` an append-only `level`.

### Added

- **`level <n> ["Name"] { … }` — multi-storey plans: one drawing per storey.** A building is not one
  drawing; it is a drawing per floor. A plan can now be written as `level` blocks, each of which
  resolves and renders as its **own complete sheet** — its own walls, rooms, dimension chains, axes,
  schedule and title block:

  ```arch
  plan "Two-storey house" {
    paper A3 landscape        # settings are SHARED: one building, one sheet, one scale
    let W = 8000
    level 1 "Ground floor" { … }
    level 2 "First floor"  { … }
  }
  ```

  - **Either/or, never mixed.** A plan is single-storey (no `level` block anywhere — the historical
    shape, byte-for-byte unchanged) or entirely levels. A drawable statement beside a `level` block
    has no floor to belong to: new catalogued **`E_LEVEL_MIX`**, spanned on the offender. Settings
    (`units`/`grid`/`paper`/`scale`/`north`/`dims`/`title`/`axes`/`schedule`/`legend`/`theme`),
    `component`/`import` declarations, and the plan-global `let`/`set` stay OUTSIDE and apply to
    **every** level.
  - **Numbering.** Integers, unique (**`E_LEVEL_DUP`**), `0`/negative legal (`level -1 "Basement"`),
    drawn ascending — the lowest storey is page 1. A nested `level` is **`E_LEVEL_NEST`**.
  - **Ids are unique WITHIN a level**, so the same id on two storeys is legal and means vertical
    identity (a stair, a riser, a column). Auto-id counters restart per storey.
  - **One building, one sheet.** `paper`/`scale` resolve once for the whole building, measured on the
    largest storey, so auto-fit cannot draw the small top floor at a finer scale than the ground
    floor; `W_SCALE_OVERFLOW` is raised once for the building, not once per page.
  - Every page's title block carries a **`LEVEL` row** (`1 — Ground floor`), so a set is readable.
- **`compile().pages`** (append-only): `{ level, name?, svg, scene }` per storey, ascending. `svg`,
  `scene` and `ast` keep meaning **page 1** (the lowest storey), so a level-unaware consumer still
  gets a complete drawing.
- **`describe().levels`** (append-only): one full single-plan summary per storey. The top-level facts
  describe the lowest storey (rooms and adjacency only mean something within a floor); `levels[0]`
  repeats them. `lint()` runs the rules per storey and concatenates.
- **`Diagnostic.level`** (append-only, also in `--json`): which storey raised it. Diagnostics
  aggregate across storeys, so a fault on the top floor can never slip past a gate.
- **CLI.** `arch compile house.arch` writes one file per storey — `<stem>.L<level>.<ext>`
  (`house.L1.svg`, `house.L2.svg`, …) — and reports `outputs[]` + `pages[]` in `--json`, for every
  format. New **`--level <n>`** (compile/watch/preview/describe) renders or reads a single storey;
  `-o -` on a multi-storey plan is a usage error (exit 3) unless `--level` picks one, and an unknown
  `--level` (or `--level` on a single-storey plan) exits 3 naming the levels the plan has.
  `describe --level` is a DISPLAY filter: `ok` and the exit code still weigh the whole building.
- **`examples/two-storey.arch`** — a lint-clean two-storey house (A3, `dims auto all`, a real `stair`
  on both floors), with a golden + snapshot per page.
- Library exports `resolveAll` / `levelBlocks` and the `CompilePage`, `LevelSummary`, `ResolvedLevel`,
  `PlanResolution` types.
- **`stair` / `elevator` / `escalator` — vertical circulation, as access-graph facts.** Three new
  elements (one module each in `src/elements/`, registered in `defs.ts` — no switch anywhere) that
  draw the conventional plan symbols AND carry the only rule in the language that joins two floors:

  ```arch
  stair     [id=<id>] at (x,y) size <w>x<h> dir up|down [width <mm>]
  elevator  [id=<id>] at (x,y) size <w>x<h>
  escalator [id=<id>] at (x,y) size <w>x<h> dir up|down
  ```

  - **The symbols.** A stair draws tread lines at a 280 mm nominal going, a mid-flight **break line**
    (the paired-diagonal cut, with the treads it crosses omitted) and an `UP`/`DN` direction arrow; an
    elevator the car rectangle with crossed diagonals; an escalator parallel chevrons plus the same
    arrow. They draw on the furniture pass, on CAD layers `A-FLOR-STRS` (stair, escalator) and
    `A-FLOR-EVTR` (elevator).
  - **Which way a run reads** is closed-form and shared by the renderer and the analysis layer
    (`src/vertical.ts`): the flight lies along the footprint's LONG axis; a *rising* flight starts at
    that axis's larger-coordinate end (so `dir up` points north/west) and a *descending* one is met at
    its head, so `dir down` is entered from the opposite end with its arrow reversed. One shaft
    therefore reads correctly on both storeys — `UP` below, `DN` above, pointing opposite ways — with
    no cross-level inference beyond the shared id (ADR 0005). `dir` is declared **per storey**.
  - **`width`** (stairs) is the FLIGHT width across the run, defaulting to the footprint's cross
    extent; wider is the new **`E_STAIR_WIDTH`**. v1 always draws one straight flight — a narrower
    `width` centres the band and leaves the rest as an un-drawn return/void. A non-positive footprint
    is **`E_VERT_SIZE`**.
  - **Circulation.** A footprint obstructs the nav grid exactly like furniture, EXCEPT that the
    body-radius halo is lifted outside its entry edge(s), so the landing you cross to reach the run
    stays walkable. A stair has one entry edge, an escalator both narrow ends, a lift car its south
    edge.
  - **Vertical identity.** In a multi-storey plan the SAME id on two `level` blocks is **one shaft**.
    `describe()` gains an append-only **`vertical`** block at the top level —
    `{ connections: [{ id, kind, levels[], stops[] }], reachable_levels }` — present only when a run
    actually spans two storeys, plus a per-storey **`levels[i].verticals`** list. Both are selectable
    through `describe --select`.
  - **Reachability through a shaft.** A storey with no exterior door of its own is reachable when a
    shaft joins it to one that has: `W_NO_ENTRANCE` stands down there and `W_ROOM_UNREACHABLE` treats
    the room the shaft lands in as an arrival point. Each storey's own `access.hasEntrance` stays
    honest (it reports that floor's doors); the cross-storey answer is `vertical.reachable_levels`.
    `examples/two-storey.arch` no longer needs its invented balcony door.
  - **New `W_STAIR_UNMATCHED`**: a run whose id appears on exactly one storey of a multi-storey plan
    connects nothing. Advisory and deliberately simple — a top-floor flight to a roof hatch, and a
    lift that stops short of a storey, both carry it (documented in the catalog entry).
  - **`validate --graph` spans floors.** For a multi-storey plan the intended-graph check is the whole
    building's: storeys are pooled in ascending order (a repeated room id resolves to the lower
    storey), and a shaft contributes one undirected edge per ADJACENT pair of its storeys, between the
    rooms it lands in on each.

### Changed

- **The circulation and occupancy grids now scale with the plan's area, so a big building's numbers
  discriminate.** Both grids picked their cell from a fixed cell COUNT (10k whole-plan, 2500 per room,
  clamped per axis), which made every grid measurement scale-relative: on a 100 × 60 m plan the nav
  cell reached 775 mm, so a 900 mm door was one cell, the 300 mm body-radius erosion was a third of
  one, and clear width quantised in ~775 mm steps — all 14 rooms of the museum fixture reported an
  identical 1940 mm bottleneck and a compliant 1.8 m corridor read the same as an illegal 1.0 m one.
  The count is replaced by a target cell SIZE bounded by a total cell BUDGET —
  `cell = max(100 mm, ceil(sqrt(area / 250_000)))` for the nav grid and `/ 25_000` for per-room
  occupancy — and the per-axis clamp is **dropped**, not re-tuned (the budget alone bounds the grid;
  a per-axis cap would re-introduce exactly this quantisation on a long, thin building). `MIN_CELL_MM`
  is unchanged, so the floor holds to 2500 m² (nav) / 250 m² (room) and **every dwelling-scale plan is
  byte-for-byte unaffected** — verified across all of `examples/`; the museum drops to a 155 mm cell
  and its bottlenecks separate (1140 vs 1940 mm). The ~25× extra cells are paid for by turning the two
  O(cells × rects) scans into per-rect bbox scans and dropping a per-swap allocation in the
  widest-path heap. `describe()` reports the cell actually used as `cellSizeMm`; both formulas are
  closed-form, integral and monotonic in the area, so determinism is preserved. See `docs/analysis.md`
  → "Grid resolution" and the ADR 0008 addendum.
- **The threshold carve tries the connector's centre first, then only the walkable part of the
  opening.** A finer cell exposed a latent assumption: a connector was modelled as the single cell at
  its centre point, which is fine while an opening is about one cell wide. At 155 mm a 4 m opening
  spans two dozen cells, and a 6 m servery parked across half of a 4 m threshold read as SEALED. Any
  plan that already carves is untouched, and a fully covered opening still reports the room
  unreachable — no room is connected by fiat.

### Notes

- A multi-page PDF is deliberately not built — `-f pdf` writes one file per storey, one drawing per
  sheet. `md` and `batch` render the lowest storey.
- Vertical circulation's entry edge is a **fixed drafting convention**, not a search for the nearest
  door — the same answer in the renderer and in the analysis layer, on every storey. A flight
  genuinely approached from the north or the west draws its arrow the wrong way round in v1; swap the
  authored coordinates, or wait for an `entry <edge>` clause. The three elements are deliberately NOT
  in Plan JSON yet (`compile --from-json` covers rooms/walls/openings/furniture/dims/columns).
- The `spec.llm.md` size budget was raised 18.5k → 19.5k chars for the three new element lines (they
  were trimmed from 1,230 to 800 chars first); see the comment in `test/llm-spec-drift.test.ts`.

## [1.20.0] - 2026-07-26

**"Sheet & datum"** — the first sub-release of the large-building batch. Until now a plan was a
drawing with no paper and no datum: every annotation size was a fixed fraction of the drawing's own
extent (self-similar, so a dwelling looked right at any zoom but a 100 m museum got 3 m room labels),
dimensions ran from the building's own faces rather than a structural grid, and nothing in the margin
let a reader audit the rooms without measuring them. This release adds the three things a real sheet
has: a **paper size with an operative scale**, a **GB/T 50001 positioning-axis grid**, and **tabular
margin blocks** (room schedule + legend). Every one of them is opt-in, and a plan that declares none
of `paper` / `axes` / `schedule` / `legend` is **byte-for-byte unchanged**.

`compile()` stays pure, synchronous and deterministic. The language gains four statement keywords
(`paper`, `axes`, `schedule`, `legend`) plus the `A4`…`A0` / `landscape` / `portrait` value
vocabulary, and one catalogued code (**`W_SCALE_OVERFLOW`**); `describe()` gains three append-only
keys (`axes`, `sheet`, `schedule`).

### Added

- **`axes { … }` — GB/T 50001 positioning axes (定位轴线).** An architectural drawing is not
  dimensioned from the paper edge; it is dimensioned from a named grid of structural datum lines.
  A plan can now declare that grid:

  ```arch
  axes {
    x at 0, 6000, 12000, 18000
    y at 0, 8000, 16000
  }
  ```

  Positions are ordinary expressions (`let BAY = 6000` … `x at 0, BAY, 2 * BAY`), grid-snapped like
  every other coordinate, and **sorted + deduped** — declaring the same datum twice collapses
  silently, which is declarative idempotence rather than an error. Rows may repeat, appear in either
  order, and repeated `axes` blocks merge, like `theme`.

  **Positions are author-declared; labels are always derived.** Per GB/T 50001, `x` axes are numbered
  `1 2 3 …` **left to right** and `y` axes lettered `A B C …` **bottom to top** — and since ArchLang's
  `+y` points DOWN, bottom-to-top means descending `y`, so the axis with the largest `y` is `A`. The
  letter sequence **skips `I`, `O` and `Z`** (they misread as `1`, `0`, `2` at drawing scale), giving
  23 letters, and continues `AA`, `AB`, … `BA` past them (the standard permits a doubled letter or a
  subscript; we take the doubled form so no drawing font needs a subscript glyph). There is
  deliberately no label syntax: inserting an axis renumbers everything after it exactly as a
  draughtsman would. Which axes exist is never inferred from the walls
  ([ADR 0005](docs/adr/0005-no-invisible-architect.md)).
- **The axes render as a real drawing convention.** Each is a thin **dash-dot** line spanning the
  drawing with a short protrusion past each end, tagged with a **circle bubble + label** at the bottom
  end (`x`) or the left end (`y`), placed *outside* whatever dimension chains that side already
  carries. The label is a plain glyph inside a drawn circle, never a `①`/`Ⓐ` codepoint, so it survives
  the PNG backend's bundled font and a CAD backend that has no such glyph. Nodes go on a new `axes`
  render pass and land on the AIA layer **`A-GRID`** (declared in the DXF layer table, so a CAD user can
  freeze the datum grid on its own); the page margins grow so no bubble clips. The Scene IR gains a
  `circle` primitive — the DXF backend emits one native `CIRCLE` entity for it rather than two arcs.
- **`dims auto` chain 2 becomes the true axis chain.** With `dims auto rooms` or `all`, the middle
  chain's ticks are the declared axis positions on that facade's direction (轴线间距) instead of the
  room-boundary coordinates. The switch is **per direction** — declaring only `x` axes leaves the
  vertical facades' chains on room boundaries — and the chain stays outside the building at the same
  slot offset, measured from the same outer faces: only the ticks move.
- **`describe().axes`** reports the grid as facts (`{ x: [{ pos, label }…], y: […] }`, in label order),
  absent entirely on a plan that declares none, and selectable via `describe --select axes`. Also
  exported: `numberAxes` / `axisLetter` / `AXIS_LETTERS` and the `RAxis` / `AxesSummary` types.

A plan that declares no `axes` block is **byte-identical** to before — no node on the new pass, no
`axes` key in `describe()`, no change to any dimension chain.

- **`paper <size> [orientation]` — a real sheet, and an OPERATIVE drawing scale.** Until now every
  drawn size was a fixed fraction of the drawing's own reference dimension (`max(width, height)`), and
  `scale` was annotation only — a title-block row that drove nothing. That is self-similar, so a
  dwelling looks right at any zoom, but it does not scale to a building: a 100 × 60 m museum got 3 m
  room labels, 280 mm wall strokes (wider than the partition they outline), 1.3 m hatch pitch and 17 m
  page margins, and its labels physically collided. `paper A1 landscape` + `scale 1:200` inverts the
  rule the way a drawing board does — **every annotation size becomes a constant number of millimetres
  ON THE SHEET × the scale denominator**: 3.5 mm room names, 2.5 mm area and dimension text, 2 mm
  fixture labels, a 0.5 mm / 0.18 mm heavy-thin pen pair, 1.2 mm poché pitch, 15 mm margins (GB/T
  50001 practice, one table in `src/sheet.ts`). A 3.5 mm label is 3.5 mm of ink whether the building is
  7 m or 100 m across. Sizes are the ISO 216 series `A4`…`A0`; orientation defaults to **`landscape`**
  (floor plans are wide).
- **Auto-fit.** Declare `paper` and omit `scale`, and the sheet picks the **finest** scale that still
  fits from a fixed candidate list — 1:50, 1:100, 1:200, 1:500 — and stamps it into the title block,
  the scale bar and `describe()`. Closed form: four fit tests, no search. The fit rule is one
  function of the building's **outer-face** extent versus the sheet minus its margins, the `dims auto`
  chain bands and the bottom chrome band, and it lives in exactly one place, so `resolve()`,
  `describe()` and the drawing can never disagree about the scale in force.
- **`W_SCALE_OVERFLOW`** — a declared `paper` + `scale` the building does not fit. Your scale is
  **never** silently overridden (a drawing is issued at the scale printed in its own title block):
  the warning is advisory and the page grows past the sheet so nothing is clipped.
- **`describe().sheet`** — `{ paper, orientation, scale_denominator, scale_auto, fits }`, and
  `describe().scale` now reports the *effective* scale (auto-fit's choice included). Append-only: the
  whole `sheet` key is absent for a plan with no `paper`, and it is selectable via `describe --select`.
- **True-size output in paper mode.** The SVG root carries the real paper size
  (`width="841mm" height="594mm"`) over a viewBox that is the whole sheet in plan mm, with the drawing
  centred and the scale bar / title block moved to the sheet's bottom corners; PDF export emits the
  true ISO page in PostScript points. So an A1 1:200 file opens, prints and measures at 1:200. (A
  side-effect worth knowing: a 100 m plan without `paper` has no intrinsic size, so rasterising it
  needed an explicit `--width`; on a sheet, `-f png` just works.)
- **`examples/museum.arch`** — a ~100 × 60 m, 14-room, 6000 m² single-level museum on `paper A1` at
  1:200: a full-width concourse spine, five galleries with `for`-generated column bays, a service wing,
  a WC stack whose fixture rows are placed by `against wall <id> offset …`, and `dims auto all`.
  Lint-clean under `arch validate --strict`.

- **`schedule rooms` — the ROOM SCHEDULE table.** A finished sheet carries tabular blocks in the
  margin that let a reader audit the plan without measuring it (GB/T's 房间明细表). A plan can now ask
  for one:

  ```arch
  schedule rooms
  ```

  Columns are `NO.` (1-based **source order**, zero-padded to one uniform width across the table —
  `01`…`09`, `001`…`100`), `NAME` (the room's `label`, falling back to its `id`) and `AREA (m²)` to two
  decimals, closed by a **`TOTAL`** row. Every row is **derived from the rooms, never authored**, by the
  one `roomSchedule()` that both the renderer and `describe()` call — so the drawn areas are literally
  `describe().rooms[].area_m2` and the drawn total is literally `totals.floor_area_m2`; the table and
  the JSON cannot disagree by a rounding step. `rooms` is the only subject, but the keyword takes one
  anyway so `doors`/`windows`/`finishes` can arrive later without a respelling — anything else is a
  parse error carrying a `closest()` did-you-mean and the available list, spanned on the offending
  word, never a silently ignored setting.
- **`legend` — a legend that cannot drift from the drawing.** One row per wall hatch spec actually in
  use, its swatch filled with the very `<pattern>` the walls are filled with; one row per placed
  fixture category that has a plan symbol, its swatch drawn with the real glyph from
  `elements/fixtures-glyphs.ts`, in catalog order. Nothing is listed that is not drawn, a category that
  renders as a plain labelled rectangle gets no row, and there is **nothing to configure** — which is
  the point.
- **Both tables are Scene primitives, not per-backend chrome.** They lay out in `layoutChrome` in a row
  **below** the scale bar / title block band (so they never cross a dimension chain or an axis bubble),
  and lower to ordinary `annotations`-pass nodes on the AIA layer **`A-ANNO`** — so SVG, PNG, PDF and DXF
  all draw them from the one `src/sheet-tables.ts`, rather than each redrawing the geometry as they
  still do for the title block. The page margins grow to contain them. On a `paper` sheet they
  re-anchor with the bottom chrome to the sheet's margin, in the row just **above** the corner band,
  and every size reads from `RenderSizes`, so a 1:50 A1 gets 3.4 mm rows on the sheet automatically.
- **`describe().schedule`** reports the drawn table as data (`[{ no, id, name, area_m2 }…]`) so an agent
  can read the schedule it just rendered without OCR'ing the image — present only when the plan opts
  in, and selectable via `describe --select schedule`. Also exported: `roomSchedule` / `legendEntries`
  and the `ScheduleRow` / `RoomSchedule` / `LegendEntry` types. `legend` deliberately gets **no**
  `describe()` field: it is pure rendering, and every fact it shows is already in `furniture`.

### Compatibility

- **A plan with no `paper` is byte-for-byte unchanged** — `scale` included. The reference-dimension
  size formulas are untouched (and now pinned by their own test), no `sheet` appears on the Scene or
  in `describe()`, and the SVG root emits no `width`/`height`. Adding the museum example touched no
  existing golden, snapshot or vocabulary-pin row.
- **A plan with no `schedule`/`legend` is byte-for-byte unchanged** — no node on the `annotations`
  pass, no `tables` key on the chrome layout, and every `layoutChrome` margin expression reduces to
  exactly the previous arithmetic. No shipped example opts in (asserted by a test, not assumed), so no
  golden or snapshot churned; the ASCII plan (`-f txt`) reads only the fabric layers and stays
  chrome-free. Table text is ASCII + `m²` only rather than 编号/名称/面积, because the PNG backend
  rasterizes with a bundled Roboto that carries no Han glyphs — the same portability constraint that
  keeps the axis bubbles off `①`/`Ⓐ`. No `area`/`m2` token enters the grammar: printing a computed area
  in the sheet chrome is rendering, which the parked area-syntax decision never covered.

### Meta

- **VS Code extension 0.8.0** was packaged and published to the Marketplace in this window,
  rebundling core 1.19.0 (`flush`, `dim faces`/`clear`, the three new warnings) — see
  [`editors/vscode/CHANGELOG.md`](editors/vscode/CHANGELOG.md). The extension bundles the core at
  build time, so this release's grammar surface needs its own republish.
- **The `release-check` skill now opens with a mandatory true-latest-version probe** (`npm view` +
  `git tag` + `gh release list` + the `CHANGELOG.md` headings) and requires the target to be strictly
  greater than all four with a semver class matched against the real diff — after a stale AGENTS.md
  status table caused an approved plan to target a version that was already published.

## [1.19.0] - 2026-07-25

Professional-drawing-quality round: six independent defects and gaps found by reading the rendered
output against how the drawings are actually produced and read — GB/T 50104 dimensioning, wall-face
referencing, fixture orientation — rather than against the test suite, which was green throughout.
`compile()` stays pure, synchronous and deterministic; the language gains one keyword (`flush`) and
one statement form (`dim faces` / `dim clear`).

**Rendering output changes for two existing inputs** (no API break, but regenerate any golden you
keep): `dims auto` now emits GB/T exterior dimension chains instead of per-room centerline dims, and
cased openings / interior doorways no longer paint an opaque band across the floor.

### Added

- **`flush` — wall-face-referenced in-room placement.** A room's rectangle is drawn on wall
  *centerlines*, so `furniture wc in r_bath anchor bottom` put the piece half a wall thickness inside
  the solid (a built-in `W_FURNITURE_WALL_COLLISION`); the workaround was to hand-compute the
  half-thickness of a wall you never named. `flush` changes what `inset` is measured **from** — for each
  anchored edge that has a wall behind it, the reference becomes that wall's **inner face** instead of
  the room rectangle's edge — not what `inset` means (it still defaults to `0`, so
  `anchor bottom flush inset 50` is 50 mm off the face). It applies per edge independently, so a corner
  anchor can be flush on one edge and room-referenced on the other, and an anchored edge with no wall
  behind it simply keeps the room reference (a no-op, not an error). It composes with the derived
  rotation below — both ask the same "is there a wall behind this edge?" question, so they can never
  disagree about which wall the piece is on. Needs an anchored edge: `centered` touches none, which is
  the new catalogued **`E_FURN_FLUSH`**, reported on the `flush` keyword's own span.
- **`dim faces` / `dim clear` — let the walls place the endpoints.** Each endpoint is pushed along the
  measurement axis, away from the other, onto the outer (`faces`) or inner (`clear`) face of the wall it
  runs into, so `dim faces (0,4000)->(5000,4000)` prints the outside-to-outside 5200 and `dim clear`
  the 4800 clear width, with no hand arithmetic. Only segments *perpendicular* to the measurement are
  candidates; closed-form and idempotent. An endpoint with no wall across the axis keeps its written
  coordinate and raises the new advisory **`W_DIM_NO_WALL`**.
- **Fixture orientation is derived for room-anchored placement, and `W_FIXTURE_BACK_TO_ROOM` flags what
  isn't.** Fixture glyphs draw with their back on the top edge of the footprint, so which way a WC's
  cistern (or a basin's tap, or a counter's nosing) faces is entirely its quarter-turn `rotate` — and
  only `against wall` ever derived one. `in <room> anchor <edge>` now derives it too, closed-form and
  only when the answer is **unique** ([ADR 0005](docs/adr/0005-facts-and-lint-not-an-architect.md)):
  the anchored edge must be walled *and* the footprint's aspect must allow that edge as a back (a
  400 × 700 WC is 400 along the wall and 700 deep, so only a horizontal edge can be its back). An
  explicit `rotate` always wins. `W_FIXTURE_BACK_TO_ROOM` is the new advisory for a fixture that *is*
  against a wall but faces its back into the room — distinct from `W_FIXTURE_FLOATING`, which still owns
  "touches no wall at all" — and carries a machine-applicable `rotate <n>` fix that rewrites an
  authored clause or inserts one before the trailing `in <room>`. A rotation-symmetric symbol
  (`shower`) never fires and is never turned. The back-edge ⇄ quarter-turn mapping, per-edge wall
  backing and the footprint-aspect constraint now live once, in `src/fixture-orientation.ts`.
- **`W_DIM_INSIDE`** — a hand dim whose line lands inside the room-extents box, almost always reversed
  endpoints (the offset runs along the left normal of from→to). The machine-applicable fix **swaps
  them**, re-emitted from the AST so authored expressions and interpolated `text` survive. One warning
  per source statement. Zero hits across `examples/` and `eval/goldens/`.
- **`describe()` appends `bbox_outer`** — the outer-face extent (studio: 7200 × 6200). `bbox` stays
  centerline and normative; both are documented in [`docs/analysis.md`](docs/analysis.md).
- **`arch repair` gains an orientation pass** and `RepairChange.kind: "rotated"` (append-only, with
  `fromRotate`/`toRotate`), rendered as `rotated wc#1 0° → 180°` in the change log. It runs after every
  position is final, reports instead of guessing when no single wall is the back, and moves nothing —
  so the circulation guard has nothing to re-check.

### Changed

- **`dims auto` is now GB/T 50104 exterior dimensioning.** It measured the wrong thing in the wrong
  place: per-room dims measured room *rectangles* (wall centerlines), so every number was short by half
  a thickness at each end and the witness lines started inside the wall poché. It now emits parallel
  **chains** per facade — all outside the building, all measured from the **outer wall faces**, stepping
  outward in fixed `dimFont` slots: openings (every opening edge between the two outer corners →
  corner · pier · opening · pier · corner) innermost, then the centerline/axis chain (the sorted unique
  room-boundary coordinates — the classic `4000 · 3000` chain, which **replaces the per-room dims**;
  `dims auto rooms` emits exactly this), then one overall span outer-face to outer-face. Bottom and left
  always; top and right when `all` finds openings of their own to chain there. The per-side outer face
  comes from the nearest wall segment *parallel* to that facade, so per-side thicknesses dimension
  correctly and a side with no wall falls back to the room extent. Presentation only — the chains never
  touch the IR, `describe()` or `lint()`.
- **A cased opening is a door-family void, not glazing, and no longer repaints the floor.** The wall
  boolean union already severs the wall solid at every registered opening, but `opening.render()` and
  `door.render()` then painted an **opaque cover polygon** over that gap filled with the page
  background — a bright white band across the floor either side of every cased opening and every
  interior doorway (on `examples/themed.arch` the cover stayed `#ffffff` against a `#1e2127` page, so
  the doorway read as a glowing white slab). The cover is now painted **only when nothing else voided
  the wall** — a plan with an angled wall drops out of the boolean and falls back to per-segment
  rectangles that subtract nothing, where the cover is still the sole void mechanism — and is otherwise
  `fill: "none"` and shrunk to `thickness/2`, kept because the ASCII and DXF backends *locate* the
  passage by it. Alongside: a new **`openings` render pass** mapped to DXF layer **`A-DOOR`** (it used
  to ride the `windows` pass, so a passage was filed under `A-GLAZ` and drawn by ASCII as the window
  glyph `=`; it is now the door-style `·`), and the opening's two solid full-length face lines — which
  visually re-bridged the very gap the union had opened — become **dashed lintels**, the professional
  cased-opening convention. Door leaf, swing arc, and `window.ts` are untouched. All five visual
  goldens move, confined to the door/opening cover bands.
- **`-o -` combined with `--json` is a usage error (exit 3)** on `compile`, `preview` and `md`. It used
  to be resolved *silently* in favour of `--json`, so `arch compile - -o - --json` wrote `./out.svg` — a
  file the caller never named and is never told about. The guards run before any read or render, so
  nothing is compiled, rasterized or written on the way to the error. `batch -o -` is now rejected with
  or without `--json` (`batch -o` is an output *directory*; `-o -` used to be dropped on the floor and
  every render landed next to its input) — a behaviour change for anyone who passed it and relied on
  that. The non-JSON stream `arch compile plan.arch -o -` is unchanged. One shared `usageErrorFor()` in
  `src/cli/io.ts` now backs both this and the unknown-flag path.
- **Dim endpoints are no longer grid-snapped.** A dimension annotates; it is not built, and half a wall
  thickness is legitimately off-grid. This also makes the Plan JSON round-trip exact (the emitted source
  is re-resolved with the same grid).
- **Both public sites moved to the `archlang.uk` custom domain** (Cloudflare DNS + Vercel), live
  2026-07-15. Docs → `https://archlang.uk` (apex), playground → `https://playground.archlang.uk`. All
  hard-coded `*.vercel.app` URLs across the site configs, cross-links, OG/Twitter images, agent-context
  files (`SKILL.md`, `llms.txt`), README permalinks, and CI were swapped; the plan/intent JSON Schema
  `$id`s moved to `archlang.uk` (edited in `src/plan-json.ts` / `src/intent.ts`, `schemas/*.json`
  regenerated). Added a VitePress `sitemap.hostname`. The old `*.vercel.app` hosts are kept and
  **301**-redirect to the new ones (no broken links); the Vercel project and npm workspace names
  (`archlang-docs`, `archlang-playground`) are unchanged. No change to the published core package's
  runtime behaviour. Operational recipe: [`docs/hosting-and-domains.md`](docs/hosting-and-domains.md).

### Fixed

- **`repair()` no longer returns a silent no-op for furniture it cannot see.** Its statement scan read
  only *top-level* `furniture … at (x,y)` statements with literal coordinates, so a plan whose pieces
  came out of a `for`/`while`/`if` body, a component, or an `in <room> anchor …` placement got back
  `{ changed: false, changes: [], unresolved: [] }` — a clean-looking run while `lint` reported real
  collisions (verified: three heavily-overlapping benches from one `for` statement → 3 ×
  `W_FURNITURE_OVERLAP`, repair reported nothing). The scan now walks into every nested body and reads
  each statement's *resolved instances*, and the postcondition is a test: **every piece the
  wall/room/overlap/landing/swing/floating/orientation passes flag ends up with a change entry or an
  `unresolved` entry — never nothing.**
  - A statement with exactly one resolved instance and literal coordinates is rewritten (so a
    component instantiated once, or a taken `if` branch, is repaired in place).
  - `in <room> anchor <a> [flush] [inset N]` is repaired **in its own form**: a minimal `inset` edit
    when the move runs along the anchored axis — computed in the wall-face reference frame when the
    placement is `flush` — else the whole placement becomes an absolute `at`, which now also writes out
    the `rotate` the anchor had *derived* (dropping it would have silently spun the fixture).
  - A statement repair may not rewrite — more than one resolved instance, expression coordinates or
    `inset`, an `against wall` anchor — is left byte-identical and **reported**, with the fault and the
    reason it was left alone (naming the `for`/component and the resolved piece ids for a scripted
    statement). A plan that does not parse or resolve is reported too, instead of a quiet no-op.
  - A wall-anchored (`against wall`) fixture is now an **obstacle** the mover respects: a movable piece
    placed after it is separated off it (previously it was invisible to overlap separation).
  - `RepairChange`/`RepairNote` gain (append-only) `via` — which clause was rewritten (`at` \| `inset`
    \| `placement` \| `rotate`) — and `span`, the statement's byte range. `arch repair`'s human change
    log shows the clause and, on a no-op with a non-empty `unresolved`, says how many problems it
    declined to guess at.
  - `ANCHOR_BACK_EDGES` moved into `src/fixture-orientation.ts`, so resolve's placement arithmetic and
    repair's inverse read one table — the `flush` inset reference frame cannot drift from the derivation.
- **`dims auto` drew interior dimensions inside the building.** Any room touching no perimeter fell
  through to a fallback that placed its dimension *on top of the plan*, contradicting the documented
  "placed in the page margin" promise (reproducible on `eval/goldens/bungalow.arch`, where the hall and
  bath numbers landed over the rooms). The GB/T chains above are all exterior by construction.
- **A zero-offset dim no longer emits two zero-length witness lines** (wall-thickness call-outs at
  `offset 0` emitted one pair each).
- **Four shipped examples printed dimension text the building is not.** `examples/two-bed.arch` said
  `10000` where its walls measure `10300`; `two-bed`, `relational`, `themed` and `imports` are converted
  to `dim faces` with the hardcoded `text` deleted, so the numbers are now derived → `10300 × 8300`,
  `8200`, `6250`, `5200`. `studio.arch` and `parametric.arch` keep their hand dims deliberately (already
  correct, deliberately centerline, or carrying computed text).
- **`examples/studio.arch`'s WC faced the wrong way and linted clean.** Line 52 read
  `furniture wc at (5200,5200) size 400x700   # back to the south wall` while drawing the cistern *into*
  the room — and because `frontClearanceRect` is rotation-aware, the WC's activity clearance was being
  computed inside the wall. It is now `in r_bath anchor bottom flush`, so `rotate 180` is derived and the
  position is byte-identical to the hand-computed one it replaces. The flagship stays lint-clean and
  import-free.

### Internal

- `eval/results.md` regenerated (offline, no API call) after `W_FIXTURE_BACK_TO_ROOM`: **sound 25/26
  (96%) → 8/26 (31%)**, valid and intent unchanged at 100%, header still judge v2 · synonyms v1, so the
  rates stay comparable. The drop is the new advisory rule surfacing a **real systematic model failure**,
  not a regression — of the 39 warnings the goldens now raise, 38 are `W_FIXTURE_BACK_TO_ROOM`
  (model-authored plans put a WC's cistern or a basin's tap facing the room). No golden `.arch`,
  `JUDGE_VERSION`, rubric or corpus entry was touched; `eval/judge-fixture.json` was re-pinned in its own
  commit after verifying field-by-field that **only `Score.lintWarnings` moved**.
- `mergedLength` moved to `geometry/rect.ts` so both edge-coverage scans share it; new
  `RenderCtx.openingsVoided` (optional, derived from wall geometry only — never from backend presence,
  so output stays byte-identical with and without a registered geometry backend).
- Suite: **1269 tests across 113 files** (was 1159), including `test/fixture-orientation.test.ts`,
  `test/furniture-flush.test.ts`, `test/opening.test.ts` and `test/repair-coverage.test.ts`.
- **`@chanmeng666/archlang-mcp` 0.2.1 → 0.2.2** — no code change; the shim carries two unpublished
  prose/metadata edits from the 1.18.0 → 1.19.0 window (the npm README's `suggest` row rewritten for
  the stable-ref emission, and `server.json`'s `websiteUrl` moved to `https://archlang.uk`), and the
  release workflow `npm view`-skips a version that already exists — so an unbumped edit would never
  have reached npm or the MCP registry. Its `^1.14.0` core range already covers 1.19.0.

## [1.18.0] - 2026-07-15

Two behaviour improvements to `arch suggest` (`suggestTopology`), requested by the downstream
ArchCanvas product, which persists a chosen candidate's `insertText` back into `.arch` source. Both
are **unconditional** — per [ADR 0005](docs/adr/0005-facts-and-lint-not-an-architect.md) suggestions
are deterministic data, and the new behaviour is strictly more correct, so there is no opt-in flag.
The public `Suggestion` / `SuggestionCandidate` types are **unchanged**; only the string a candidate
carries (and, for one fault, candidate order) changes.

### Changed

- **Candidates reference walls only by a STABLE ref.** A candidate's `insertText` used to be able to
  name a wall by its *positional* auto-id (e.g. `door on partition_3 at 50%`), which re-indexes
  silently when a later edit inserts an earlier same-category wall — corrupting any persisted
  suggestion. Each candidate now composes its placement as the first available of: an **author-declared
  wall id** (`on <id>`), a **unique wall category** (`on <category>`, valid iff exactly one wall carries
  it), or **absolute coordinates** (`at (x, y)`, which name no wall — the compiler's nearest-wall
  hosting binds the intended one). A positional auto-id is never emitted. Applies to all four
  builders (entrance, unreachable-room, bedroom-window, bath-via-bedroom).
- **A private unreachable room prefers reconnecting inward.** For `W_ROOM_UNREACHABLE` on a **private**
  room (bedroom or wet room), interior candidates that reconnect to a space already reaching the
  entrance now rank **above** exterior (new-outside-door) candidates, regardless of run length; within
  each group the existing longest-free-run order is kept. Non-private rooms keep the pure geometric
  order. `W_NO_ENTRANCE` (exterior-first by design), `W_BATH_VIA_BEDROOM` (already interior-preferred),
  and `W_BEDROOM_NO_WINDOW` (windows are exterior-only) are unchanged.

### Internal

- `RWall` carries an internal `_idAuthored` marker (set in `resolve` from `assignIds`' knowledge of
  whether the id was author-declared; `_`-prefixed, never serialized into the Scene/exports), so
  `suggestTopology` can tell an authored id from an assigned positional one.

## [1.17.0] - 2026-07-14

Agent-CLI round: the `arch` CLI audited against the **[7 Principles for Agent-Friendly
CLIs](https://x.com/trevin/status/2037250000821059933)** rubric and hardened where it fell short.
The audit's good news is that the foundations already held — zero interactive prompts, zero ANSI
colour, `--json` almost everywhere, a documented `0/2/1/3` exit contract, a uniform stdin `-` seam,
and JSON diagnostics that already carry their own fixes. What it found was **one blocker** (a CLI an
agent literally could not ask for help), a parser that **silently swallowed typo'd flags as
filenames**, a `fix` that **clobbered your source with no preview and no recovery**, and reads that
had **no way to be narrowed**. All four are closed here. The language is untouched; `compile()` stays
pure and its default output byte-identical.

### Added

- **Per-command help — the blocker.** `arch <cmd> --help` and `arch help <cmd>` now print help.
  Before this, `--help` after a verb fell through `parseArgs` into the positionals and was read as a
  *filename* (`cannot read --help`), so the standard two-hop probe an agent uses to learn a CLI —
  top-level help, then subcommand help — was broken at the second hop.
- **The manifest now carries worked `examples[]` per command** (a required field), and a new
  `src/cli/help.ts` renders **both** the top-level and the per-command help **from the manifest**.
  The hand-maintained `HELP` string — a second, un-drift-tested source of truth for the command list
  — is gone, so help can no longer advertise a flag a command doesn't take.
- **`arch --version`.**
- **`arch fix --backup`** — saves the original bytes to `<file>.bak` before rewriting in place
  (opt-in, so no `.bak` litter by default), and `fix` now prints the **unified diff it would write**
  to stderr, `--dry-run` included. `fix` rewrites your *source*; it should be previewable and
  reversible.
- **Bounded reads** (so one big plan can't blow an agent's context window):
  `arch describe --select <keys>` / `--room <ids>`, `arch lint|validate --code <CODE>` /
  `--severity <sev>`, and `arch context --section <spec|workflow|cli|errors>` — the error catalog
  alone drops the bundle from **60,187 → 13,161 bytes**.
- `unifiedDiff` moves from `dataset/` into the pure core as `src/unified-diff.ts` (zero-dep,
  deterministic); `dataset/diff.ts` re-exports it.

### Changed

- **An unrecognized flag or verb is now a usage error (exit 3), not a silently-swallowed filename.**
  A `FLAG_KEYS` parse table replaces the old if/else chain and is **bidirectionally drift-tested
  against the manifest**, so the parser, the help, and the docs cannot disagree about what a command
  accepts. `arch lint --jsn` now exits 3 with `did you mean \`--json\`?` and a `usage:` echo;
  `arch comple` suggests `compile`.
- **Human-mode diagnostics print the catalog's `= fix:` line.** JSON mode already carried it; a
  human (or an agent reading stderr) previously had to make a second call to `arch explain <CODE>`.
- `arch lint --profile <bogus>` routes through `usageError` like every other bad-usage path (it used
  to return a bare `3` with an ad-hoc, prefix-less message).
- `arch md` validates `-f` through the shared `parseFormat` instead of a hand-rolled check, so an
  unknown format gives the same error everywhere.
- Bare `arch` prints its help to **stderr** (exit code 3, unchanged) rather than stdout — a missing
  command is a usage error, and its output shouldn't pollute a pipe.
- Previously-ignored misplaced flags (e.g. `arch describe --strict`, on a command that takes no such
  flag) now exit 3 instead of being ignored.

### Invariants pinned by tests

- **A display filter never changes gating.** `--code` / `--severity` / `--select` / `--room` filter
  what is *shown*; the exit code and `ok` are computed from the **unfiltered** diagnostic set, so
  `lint --code W_FOO` on a plan failing for a different reason still fails.
- **The `context --section` splitter is welded to its generator** by a test that regenerates
  `llms-full.txt` in memory and asserts the split — a format change breaks loudly instead of
  silently slicing garbage.

## [1.16.0] - 2026-07-14

Downstream-driven round: ArchCanvas's archlang-1.15 adoption surfaced two upstream gaps its own
ship gate + topology fixer had already filled locally, so those capabilities move **upstream as
advisory data** and the generated agent docs are re-pointed to teach the v1.13 placement sugar
where models actually imitate it — the worked examples. Core stays zero runtime dependencies; the
default SVG output is byte-identical throughout.

### Added

- **`suggestTopology` gains two connectivity-fault kinds** — `Suggestion.code` widens 2 → 4 to
  `W_ROOM_UNREACHABLE | W_BEDROOM_NO_WINDOW | W_NO_ENTRANCE | W_BATH_VIA_BEDROOM`. Both new builders
  are ported from capabilities proven in ArchCanvas's production topology fixer and each mirrors the
  semantics of the matching `arch lint` rule so a suggestion fires iff the lint fires:
  - **`W_NO_ENTRANCE`** — fires when the plan has an exterior wall but no entrance
    (`access.hasEntrance === false`). Emits `door on <wall> at <pct>% width 900` candidates on the
    longest opening-free exterior run of an entrance-suitable room (not a bedroom, not a wet room),
    falling back to the remaining rooms only when no suitable room touches an exterior wall; the
    rationale names the room and that this creates the building's entrance.
  - **`W_BATH_VIA_BEDROOM`** — reuses the two-BFS pattern from the reachability lint (reach-all vs
    reach-excluding-bedrooms) to find a wet room reachable only through a bedroom, and suggests a
    door onto a neighbour that itself has a bedroom-free route (non-bedroom neighbours preferred over
    an exterior-wall fallback regardless of run length — reconnecting to circulation is the real fix).
    One suggestion per affected wet room.

  Both stay ADR 0005-compliant ([facts and lint, not an architect](docs/adr/0005-facts-and-lint-not-an-architect.md)):
  deterministic, closed-form, data-only, fail-open (`[]` on ambiguity or a resolve error), ordered by
  the existing free-run-length → wall-id → position tie-break, top 3 — never applied.
- **Furniture-aware door candidates.** For **door** candidates only, the blocked-span computation now
  also subtracts wall runs where a furniture footprint intrudes into the door's approach corridor — the
  strip inside the target room along that wall, `APPROACH_DEPTH = 900` mm deep — so a suggested door
  never opens straight onto a piece. Windows are exempt (furniture under a window is normal). The three
  door builders (`W_NO_ENTRANCE`, `W_ROOM_UNREACHABLE`, `W_BATH_VIA_BEDROOM`) feed the furniture-blocked
  runs into `longestFreeRun`; the window builder is unchanged. Fail-open — a furniture-free plan yields
  no blocked runs, so every pinned golden (all furniture-free fixtures) stays byte-identical.

### Changed

- **The generated agent spec now teaches attachment-first through its worked example.**
  `scripts/gen-llm-spec.ts`'s `SPEC_EXAMPLES` swaps the coordinate-math `studio.arch` for the
  attachment/strip/anchor `attached.arch` as the flagship worked example (`parametric.arch` stays second
  as the sanctioned computed-`at` idiom); neither `examples/*.arch` file changed. The `## Common
  mistakes` table is rewritten from coordinate fixes to attachment-first guidance (off-wall opening →
  `on <wall> at <pos>`, hosted by construction; hand-summed room offsets → `strip`; a guessed furniture
  `at` → `in <room> anchor <9-point>`), keeping the genuinely universal rows (mm units, +y down, unique
  ids). The fix-topology prose now names all four suggest kinds and leads with `arch suggest --json`.
  `spec.llm.md` regenerated (~15.9 → ~14.8 KB; `llms-full.txt` regenerated in the same chain).
- **`SKILL.md` anchor grammar corrected.** The stale `anchor <corner|edge>` placeholder becomes the real
  nine-point token list (`top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right`),
  and the topology section names all four suggest faults and notes the candidates are furniture-aware.
- **CLI / MCP prose lists all four suggest kinds.** The `arch suggest` usage line (`src/cli.ts`), the
  `cmdSuggest` doc comment (`src/cli/commands-author.ts`), and the MCP `suggest` tool description
  (`packages/mcp/src/server.ts`) now name unreachable / no-entrance / bath-via-bedroom / windowless-bedroom
  and note the attachment form + furniture-awareness. No wiring change — the raw `Suggestion[]` passes
  through untouched. The MCP shim republishes as **`@chanmeng666/archlang-mcp@0.2.1`** (version-bump-only
  release so the refreshed tool description actually reaches npm and the MCP registry — the release
  workflow's idempotency guard would have skipped an unbumped 0.2.0).
- **`suggestTopology`'s pre-existing `W_ROOM_UNREACHABLE` builder is now gated on the plan having an
  entrance.** An entrance-less plan previously produced per-room `W_ROOM_UNREACHABLE` suggestions; it now
  yields the single `W_NO_ENTRANCE` suggestion instead, matching the lint's own suppression behavior (the
  reachability rule reports no-entrance, not per-room unreachability, when there is no way in). No pinned
  golden is affected — the existing `faulty` fixture has an entrance.
- **Note (eval baseline):** `spec.llm.md` is the eval's author prompt, and this change replaces a worked
  example in it, so it now differs from the prompt behind the calibrated live baseline. No scoring/judge/fixture
  code changed; re-running the paid live baseline under the new prompt stays a separate, owner-approved action
  (default: not run).

## [Unversioned] - 2026-07-13

Repo tooling only — **no core code change; the published core stays at 1.15.0** (no new tag, no
release). Roadmap Tranche 5.

### Added

- **`dataset/` — the repair-trajectory + authoring dataset generator** (`npm run dataset:gen`;
  tsx, no new dependency). Produces two fully synthetic, self-verifying splits, deterministic from
  a pinned seed (default `20260712`), with `archlang_version` pinned to 1.15.0:
  - `repair` — a procedurally generated base plan, one injected fault (mirroring the six classes of
    the repository's fault-injection gate), the machine-readable diagnostics it raises, the source
    healed by the deterministic `fix` → `repair` pipeline, a unified diff, per-stage healing steps,
    and a `fix_kind` (`fix`/`repair`/`both`) that preserves the ADR 0011/0006 boundary in the data;
  - `authoring` — an NL brief, its golden `.arch`, the `describe()` facts, and a machine-checkable
    intent contract, all descending from one ground truth.

  Every row is constructed and re-checked by the deterministic compiler at generation time; a
  candidate that fails any gate is rejected and counted in `report.json`, never silently emitted.
  The generator imports only the pure core surface and nothing from `eval/`.
- **`test/dataset.test.ts` — the permanent contamination CI guard.** Generates a small fixed-seed
  corpus and asserts zero leakage against the private 26-brief eval holdout (dual dedup: normalized
  text Jaccard + 8-word n-gram, and structural `describe()` fingerprint), that the canary appears in
  every row's field and source comment, that generation is deterministic, and that a sample of rows
  replays its own verification. The private holdout is never published.

Consistent with the permanently-declined T3 experiment, the dataset and its card make **no claim
that a diagnostic-feedback loop does or does not beat equal-token-budget resampling** — only
structural facts. Published to HF as `ChanMeng666/archlang-repair-trajectories` (CC0-1.0) on
2026-07-13 — repair 1200 + authoring 400 rows.

## [1.15.0] - 2026-07-12

Roadmap Tranche 6 resolved (2026-07-12): **Gate G2 closed with residual area failures = 0/8**
on the calibrated baseline (`docs/research/2026-07-g2-verdict.md`) — the T6 area-syntax sugar
is **parked** behind frozen reversal triggers, and only the tranche's unconditional Track B
items ship below.

### Added

- **`matchVocabulary` — one shared closed-vocabulary matcher, and the advisory `W_ALIAS_MATCH`.**
  The token-bounded matcher core (`normalizeLabel`/`synonymMatchesLabel`) moved from
  `src/intent-concepts.ts` into new `src/vocabulary.ts`, and the scattered room-label regexes in
  `analyze.ts`/`analyze/circulation.ts` are re-expressed as its data-driven `USE_VOCABULARY`
  (canonical vs alias words per use kind). One matcher core, two vocabularies at two layers — the
  brief-level `CONCEPTS` table and `SYNONYMS_VERSION` are untouched (judge fixture byte-green; no
  second concept table). New advisory **`W_ALIAS_MATCH`** fires when a room with no authored
  `uses` classifies only via an indirect alias ("Powder" → WC, "Foyer" → entry), carrying a
  machine-applicable fix that inserts the explicit `uses …`; corpus classification is pinned
  byte-identical by `test/vocabulary-equivalence.test.ts` over every example and eval golden.
- **`rankFixes` — deterministic cost ordering for a diagnostic's fix alternatives** (exported).
  Orders the mutually-exclusive `fixes` on one diagnostic by applicability rank → total edit
  magnitude (smallest change wins) → earliest offset → stable index. `arch fix` now applies only
  the top-ranked alternative per diagnostic; LSP code actions present alternatives in the same
  canonical order. Identity on today's singleton arrays, so existing behavior is byte-identical.
- **`describe().freedom` — a degrees-of-freedom placement report** (append-only). Per placed
  element, whether its position was authored absolutely or derived by the resolver — rooms
  `absolute`/`relational`/`strip`, openings `attached`/`absolute`, furniture
  `anchored`/`against-wall`/`absolute` — as per-family counts plus one `elements` row each.
  Facts only (ADR 0005); the internal marker never reaches the Scene, so rendered output is
  unchanged.
- **Optional metric unit suffixes on numeric literals** (roadmap Tranche 6 Track B). A number may
  carry a `mm`/`cm`/`m` suffix, folded to millimetres at lex time: `3m` → `3000`, `3.5m` → `3500`,
  `3cm` → `30`, `3mm` → `3` (an explicit no-op). Bare numbers still mean millimetres, so **every
  existing plan's output is byte-identical** (a determinism/byte-equality test compiles a suffixed
  plan and its bare-mm twin and asserts equal SVG). The conversion is exact — decimal-point
  shifting on the digit string, never a floating-point multiply — so `3.333m` is exactly `3333` and
  `0.0005m` is exactly `0.5` mm. The suffix must sit immediately after the digits (no space) and
  does not fire when a letter follows (`3meters` = number `3` + ident `meters`); each component of a
  `WxH` literal may carry its own suffix (`3mx4m`, `3.5mx4200`). Deliberately **no area unit**
  (`m²`) — that belongs to the parked T6 area syntax (Gate G2 closed; see
  `docs/research/2026-07-g2-verdict.md`). The formatter normalises a suffixed literal to its mm
  value (`3.5m` → `3500`). Folded in the lexer (`src/lexer.ts`); the grammar source of truth
  (`src/grammar/tokens.ts`) and every generated artifact — editor grammars, `grammars/archlang.gbnf`,
  `spec.llm.md`, `llms-full.txt` — carry the optional suffix.
- **Note (eval baseline):** `spec.llm.md` is the eval's author prompt, and this change adds a line
  to it, so it now differs from the prompt behind the 2026-07-11/12 calibrated live baseline. No
  scoring/judge/fixture code changed; re-running the paid live baseline under the new prompt stays a
  separate, owner-approved action (default: not run).

### Changed

- **`arch fix` now collects fixes from lint diagnostics too** (previously compile-stage
  diagnostics only). `W_ALIAS_MATCH` is the first lint rule to carry a fix; the L1 gate's
  `l1Pipeline` remains the compile-stage-fix + `repair` reference pipeline and is unaffected.
- **A room labelled with a WC-only alias (e.g. "Powder") now classifies as a WC.** The word was
  dead in the old regex cascade (`WC_RE` was only consulted after `WET_RE`, which never matched
  it); the vocabulary form resolves it, flagged by `W_ALIAS_MATCH`. The one deliberate
  reclassification — every other label classifies exactly as before (pinned by test).

## [1.14.0] - 2026-07-12

v1.14 Tranches 1–2 + 4 — **the measurement foundation, then the intent channel it licensed**
(roadmap `docs/research/2026-07-roadmap-proposal.md`). Tranches 1–2 were repo-internal (eval/ and
CI only; the one core exception is the `repair()` purity fix under _Fixed_): **fix the ruler before
measuring capability**. Gate G1's PASS then cleared **Tranche 4**, which DOES extend the published
surface — the intent channel below.

### Added — Tranche 4: the intent channel (2026-07-12; core + CLI, zero new runtime deps)

- **`src/intent.ts` — the judge-v2 scoring core, lifted into the core package.** A brief's
  checkable expectations as data (`Intent`), lowered to the shallow predicate kinds
  (`room-count` / `room-exists` / `room-area` / `total-area` / `adjacent` / `reachable`, plus a
  new gating `room-windows`), checked against `describe()` facts.
  **`validateIntent(source, intent)`** → `{ ok, satisfied, total, violations, subscores,
  assertions, diagnostics }` with typed, catalogued violations and Nickel-style spanless blame
  messages (`intent /roomsInclude/1: no room matching concept "bathroom" …`);
  **`intentFromJson`** (zero-dep pathed shape walker); **`feedbackForResult`** (deterministic
  per-violation correction prompts — advisory data, ADR 0005, never auto-applied).
- **`src/intent-concepts.ts` — the concept vocabulary, now production name resolution.** Byte-
  mirrors the eval's table; a known concept resolves exactly as the eval judges (label →
  `room_type` → `uses`, token-bounded), an unknown one falls back to a literal
  id → label → uses → room_type match.
- **Eight catalogued codes**: `E_INTENT_ROOM_MISSING` / `_ROOM_COUNT` / `_ROOM_AREA` /
  `_TOTAL_AREA` / `_NO_WINDOW` gate; `E_INTENT_NOT_ADJACENT` / `_NO_DOOR` / `_UNREACHABLE` are
  advisory (`gate: false` — scored, never failing `ok`; `reachable` blames by cause: no entrance
  → `NO_DOOR`, cut-off rooms → `UNREACHABLE`). Promoting adjacency/reachability to gating stays
  parked on T3's still-open loop-vs-resampling question.
- **`schemas/intent.schema.json`** (`npm run gen:intent-schema`, drift-tested, served by the docs
  site). Its field docs make Gate G1's two lessons **normative**: the area **band conventions**
  ("about/~/bare N m²" → ±10%; "at least N" → `min` only; qualitative words → no assertion) and
  the **count discipline** ("assert a room count only when the brief enumerates it").
- **CLI**: `arch validate --intent <intent.json>` (the gate — exit 2 on a gating violation;
  composes with `--graph`/`--strict`; `--feedback` appends the correction prompts) and
  **`arch score <file> --brief <intent.json>`** (the continuous meter — `satisfied/total` +
  subscores, exit 0 on any successful measurement).
- **`describe()` windows gain `facing: "N"|"S"|"E"|"W"`** (append-only; the outward normal of the
  window's host wall), and intent `windows` assertions take an optional `facing`.
- **The eval now consumes the same implementation** (`eval/assertions.ts`/`synonyms.ts` are thin
  re-export shims; run.ts's `Expect` *is* the production `Intent`) — one judge, zero eval↔prod
  skew. **`JUDGE_VERSION` stays "2"**, proven by a pinned fixture (`eval/judge-fixture.json` +
  `test/eval-fixture.test.ts`) that every corpus per-assertion judgment is byte-identical across
  the lift; the fixture is regenerated only to record an approved bump, never to green a red suite.

### Added — release engineering: tokenless OIDC publishing (npm + MCP registry)

- **`.github/workflows/release.yml`** — a `v*` tag push (or manual dispatch) publishes the core,
  then the MCP shim, to npm via **OIDC trusted publishing with provenance** (no npm token exists
  anywhere; each package carries a one-time Trusted Publisher registration on npmjs.com pointing
  at this workflow), then syncs the **MCP registry** with `mcp-publisher login github-oidc` —
  also tokenless. Every step is idempotent (versions already on a registry are skipped, and the
  registry sync is guarded by the registry's own state), so partial failures re-run safely.
  Replaces the local granular-token publish flow that npm is deprecating through 2026–2027.
- **MCP shim 0.2.0** (`@chanmeng666/archlang-mcp`, registry entry updated): the `validate` tool
  takes an optional `intent` (gating assertions fail it; advisory ones score), a new **`score`**
  tool is the continuous satisfaction meter, and `intent.schema.json` ships as the
  `intent-schema` resource — the same `intentFromJson`/`validateIntent`/`feedbackForResult` path
  the CLI uses.
- Provenance gotcha, recorded: npm E422-rejects a publish whose `package.json`
  `repository.url` casing differs from the OIDC-attested repo (`ChanMeng666`, not
  `chanmeng666`) — fixed in both package.json files + server.json.

### Added — Gate G1 verdict + the L2 experiment harness (2026-07-12; still repo-internal)

- **Gate G1: PASS** (`eval/g1/` — generator harness, generated intents, double-blind scores,
  report). NL→intent-JSON per-assertion faithfulness on all 26 briefs: **154/157 (98.1%)** vs
  93.4% per-assertion accuracy of direct `.arch` generation (one-tailed z = 2.08, p = .019;
  valid-only sensitivity variant below resolution — recorded). The intent channel (roadmap T4:
  `src/intent.ts`, `arch validate --intent`, `intent.schema.json`) is **cleared** for a future
  release. The generation prompt is oracle-isolated and `test/g1.test.ts` enforces it.
- **T3 harness: the L2 tier** (`eval/l2.ts` + `eval/l2-run.ts` + `.github/workflows/eval-l2.yml`,
  `npm run eval:l2`). Diagnostic feedback loop (≤2 rounds, fed only compile/lint diagnostics +
  `fix --dry-run` previews + trimmed `describe()` — oracle-isolated) against an **equal-token-budget
  i.i.d. resampling control** (Olausson accounting, round-up favours the control), per-metric
  best-of, mean±σ across trials, `pass@n`/`pass^n`, retrying author + per-brief error isolation.
  Offline-tested (14 tests). **The live experiment has not been run** (cost declined) — the
  loop-vs-resampling question remains open and no loop-gain claim is made.

### Added — judge v2: brief-grounded intent scoring

- **Intent-assertion scoring core** (`eval/assertions.ts`, `JUDGE_VERSION = "2"`). `scoreSource` no
  longer greps the goldens for label substrings and golden-derived area bands; it lowers each brief
  to a small **intent-assertion data structure** — the shallow five kinds `room-count` /
  `room-exists` / `room-area` / `total-area` / `adjacent` / `reachable` — and checks the model's
  plan against *those*. The five-kind boundary is deliberately the one a future `src/intent.ts` can
  lift wholesale (Tranche 4 hook). `Score` gains append-only `subscores` / `assertions` /
  `judgeVersion` fields.
- **Oracle-isolated synonym table** (`eval/synonyms.ts`, `SYNONYMS_VERSION = 1`). Room-label matching
  runs through a versioned, **never-shown-to-the-model** concept table with token-bounded,
  one-room-one-concept greedy assignment — so "wc"/"toilet"/"bath" resolve to one concept without
  leaking the answer into the prompt.
- **Brief-grounded area checks.** Area is verified **only where the brief states a number**, in a
  ±10–15% band around *the brief's* number; all 20 golden-derived bands were deleted. Qualitative
  size words ("compact", "generous") carry **no** cap yet (a documented tier-b hook, added the day a
  real "oversized compact" instance appears).
- **Frozen corpus-review rubric** (`eval/rubric.md`). Blind-drafted by an isolated agent, then frozen
  with the approver's decisions: **room-count policy B** (a ±1 surplus passes the gate *only* when the
  extra room is pure circulation, operationalized as `planCirc >= expectedCirc + 1`); one-room-one-concept
  greedy assignment; qualitative size words carry no cap. Adjacency and reachability score as
  **subscores only, never a gate** (Tranche 4 hook).
- **Corpus 22 → 26.** Three prompts amended so every room count is brief-derivable
  (`two-bath-flat`, `against-wall-bath`, `accessible-bath`), plus a new **per-room-area slice**
  (`sized-kitchen-flat`, `sized-bedrooms`, `sized-wet-room`, `sized-office-mix`) so the area dimension
  is no longer total-only (H5) — every band carries the brief-source quote it came from.
- **L1 deterministic-tool gate** (`eval/faults/`, `eval/l1.ts`, `test/fault-injection.test.ts`, in CI
  via `npm test`). Six single-defect fixtures (off-wall door/window/opening, furniture-through-wall,
  blocked-doorway, and a combined case) prove the `l1Pipeline` — a bounded machine-applicable-`fix`
  fixpoint (mirroring `arch fix`) followed by `repair()`, in the ADR 0011 → ADR 0006 order — **heals
  every defect class deterministically and idempotently**, and is a byte no-op on a clean golden.
- **`--l1` live overlay** (`eval/run.ts`, live runs only). Reports the **deterministic dividend**
  ΔL0→L1 (what `fix`+`repair` recover for free, **zero extra API calls**) with a per-row heal column;
  the committed baseline delta stays L0-only so cross-run comparisons don't silently fold the tool
  tier into a model score.
- **eval-live workflow inputs** (`.github/workflows/eval-live.yml`): a `--l1` toggle (default on) and
  the corpus-covering `max` default of 26.

### Changed — live-harness integrity

- **Token budget & determinism.** Anthropic `max_tokens` 2048 → **16384** (reasoning models spend
  thinking tokens out of the completion cap — the 2048 ceiling truncated output into false
  invalidity) with `temperature: 0` and ephemeral **prompt caching**; the OpenAI path pins
  `seed = 20260711` and records `system_fingerprint` (temperature deliberately not sent).
- **`--budget <n>tok|<n>usd` circuit breaker** — a pre-call estimate halts the run before it
  overspends; skipped briefs are excluded from the denominators (over-estimating direction, verified
  price map).
- **Cross-judge guard.** `Baseline` now carries a `judge` field and `renderDelta` flags any delta
  taken across a judge-version change as **non-comparable** — a judge change is never a capability
  result.
- **Calibrated judge-v2 baseline** (`eval/live-baseline.json`; 26 briefs, `gpt-5.5-2026-04-23`,
  seed-pinned, GitHub Actions): **L0 valid 25/26 (96%) · intent 13/26 (50%) · sound 4/26 (15%)**;
  the `--l1` overlay lifts it to **intent 18/26 (69%, ΔL0→L1 +5) · sound 6/26 (+2)** — 7 briefs
  healed by 47 repair moves, 0 `fix` edits. The old 9% one-shot intent was ~55–65% **measurement
  artifact** (deep-dive H2); the calibrated 50% sits inside the roadmap's predicted 45–60% band.
  Residual true failures are dominated by physical violations (which L1 clears), with a few
  room-count and placeholder-label misses and one compile failure (the model inventing a `label`
  statement). Judge-v1 numbers are kept only as history.

### Fixed

- **`repair()` is pure again across repeated calls.** It mutated the shared parse-stage
  memo's AST in place (moving furniture `at` nodes), so a second `repair()` of the
  byte-identical source saw already-moved pieces and reported zero changes — same input,
  history-dependent output, violating ADR 0006's determinism promise. `repair` now works
  on a private deep clone of the parsed plan; `compile()` output was never affected
  (regression-tested in `test/repair.test.ts`). Found by the new fault-injection L1 gate.

## [1.13.0] - 2026-07-11

AI-native authoring release: make ArchLang **easier to write correctly the first time**
(placement sugar), **self-correcting as data** (machine-applicable fixes), **structured
in and out** (Plan JSON + a constrained-decoding grammar), **visible without a raster**
(ASCII), and **discoverable** where MCP hosts look (an optional server). The core stays
zero runtime dependencies; the default SVG output is byte-identical throughout.

### Added — placement sugar: write plans without hand-computed coordinates

- **Opening attachment.** `door` / `window` / `opening` can attach to a wall **by
  position** instead of absolute coordinates: `door on <wall> at <pos> …`, where `<pos>`
  is millimetres along the wall or a percentage (`50%`). `swing into <room>` picks the
  hinge/swing direction toward a named room; `hinge near start|end` hinges at the
  segment end nearer a wall end. Off-wall or ambiguous references are the catalogued
  `E_ATTACH_WALL_REF`; a position past the wall is `E_ATTACH_POS_RANGE`.
- **`strip` layout.** `strip <right|left|down|up> at (x,y) gap <mm> [height|width <mm>] {
  room … room … }` lays a row/column of rooms end to end, each sized on the run axis and
  sharing the strip's cross dimension. Pure sugar — it expands to ordinary absolute-placed
  rooms during resolve, so walls, doors, and relational references downstream are
  unchanged (`E_STRIP_NEST`, `E_STRIP_SIZE`).
- **Furniture by anchor.** `furniture <kind> in <room> anchor <corner|edge> [inset <mm>]
  …` snaps a piece to a room corner/edge with an optional inset, so furniture never needs
  a raw coordinate. New flagship example `examples/attached.arch` authors a full 1-BR with
  no hand-computed openings or furniture. See the [language reference](docs/language-reference.md).

### Added — machine-applicable fixes ([ADR 0011](docs/adr/0011-machine-applicable-fixes.md))

- **Structured `Diagnostic.fixes`.** Alongside the prose `fix`, a diagnostic can carry
  `FixSuggestion[]` — each a `title` plus byte-span edits and one of four rustc-style
  applicability tiers (`machine-applicable` · `maybe-incorrect` · `has-placeholders` ·
  `unspecified`). `diagnosticToJson` projects them; producers attach them (e.g. an
  off-wall opening → the attachment form, `machine-applicable` only when the nearest wall
  is unambiguous, else `maybe-incorrect`).
- **`applyFixes`** (exported): a pure piece-table replacer ported from rustfix — applies
  each suggestion atomically, rejects (never half-applies) any that overlaps an earlier
  edit, and reports what it skipped.
- **`arch fix`**: a bounded, self-checking fixpoint (compile → collect fixes → apply →
  recompile, ≤4 passes) that applies **only `machine-applicable`** by default; `--unsafe`
  widens to `maybe-incorrect`, `--dry-run` previews, `--force` keeps a pass that would
  otherwise be rolled back for raising the error count. Distinct from `arch repair`, which
  stays the geometric furniture solver ([ADR 0006](docs/adr/0006-solver-as-explicit-transform.md)).
- **`arch suggest`**: advisory topology suggestions as data (`suggestTopology`, exported)
  — ready-to-paste `door`/`window` statements (attachment form) that resolve an
  unreachable room or a windowless bedroom, never applied (ADR 0005).
- **LSP quick-fixes**: `codeActions` surfaces the same suggestions in-editor; a lone
  `machine-applicable` fix is marked the preferred action.

### Added — structured Plan JSON in & out, and a constrained-decoding grammar

- **Plan JSON** (RPLAN / DStruct2Design shape): `planFromJson` builds a plan from a JSON
  object, `planToJson`/`resolvedToJson` project a resolved plan out with enrichments
  (area, floor polygon, `input_graph`, edges), and `astToJson` is a span-bearing AST
  projection — all pure, deterministic, zero-dep, exported. Surfaced as **`arch compile
  --from-json`** and **`arch ast`**. Bad shapes are catalogued `E_JSON_SCHEMA` /
  `E_JSON_KIND`.
- **`schemas/plan.schema.json`** — the Plan-JSON JSON Schema (2020-12), generated from the
  `PLAN_JSON_SCHEMA` source (`npm run gen:plan-schema`, drift-tested).
- **Intent-graph check.** `checkGraph(source, intent)` compares a plan's interior-door
  adjacency to an intended `{ room: [neighbours] }` graph; surfaced as **`arch validate
  --graph <g.json>`** (a mismatch is a user-source error).
- **`grammars/archlang.gbnf`** — a GBNF constrained-decoding grammar generated from the
  token source (`npm run gen:gbnf`, drift-tested), so a local model can be constrained to
  emit only parseable ArchLang.
- **`arch complete --at <offset>`** — the LSP `completion()` core as a CLI command.

### Added — zero-dependency ASCII rendering

- **`renderAscii(scene)`** (exported): serializes a Scene to a fixed-width text floor
  plan — the channel a sandboxed, text-only agent uses to *see* its plan with no raster
  binary. Surfaced as **`arch compile -f txt`** and **`arch preview --ascii`**, with
  `--cols` (grid width) and `--charset unicode|ascii`. Deterministic; default output of
  every other format is unchanged.

### Added — MCP server ([ADR 0012](docs/adr/0012-mcp-shim-discoverability.md))

- **`@chanmeng666/archlang-mcp`** (new `packages/mcp/` workspace, published `0.1.1`): an optional
  stdio Model Context Protocol server that wraps the **library** (never a CLI subprocess)
  — tools `compile` / `describe` / `lint` / `validate` (with the optional intent-graph
  check) / `repair` / `fix` / `suggest` / `complete`, and resources `archlang://spec`,
  `archlang://context`, `archlang://schema`, `archlang://grammar`. **The core stays
  zero-dependency — the MCP SDK lives only in this package.** The CLI remains the primary,
  token-cheaper interface; the server is the *discoverability* channel (registry),
  amending [ADR 0009](docs/adr/0009-ai-first-context-and-distribution.md)'s
  distribution-over-protocol stance. Published to the official MCP registry as
  **`io.github.ChanMeng666/archlang-mcp`** (live on registry.modelcontextprotocol.io).
  `0.1.0` was published then superseded the same day by `0.1.1`: the registry namespace is
  case-sensitive and exact-matches the npm package's `mcpName` against `server.json`'s `name`,
  and caps the server description at 100 chars — `0.1.1` fixed the casing
  (`io.github.ChanMeng666/…`) and shortened the description.
- **Docs site**: every generated doc page is now also served as **raw markdown at
  `/<route>.md`** (e.g. `/spec.md`, `/reference.md`), and the machine-native
  **`/plan.schema.json`** and **`/archlang.gbnf`** artifacts are served at the site root
  (advertised in `llms.txt`).
- **VS Code extension** repacked and published as **`ChanMeng.archlang@0.5.0`** (bundles core
  1.13.0, so the language-surface additions — the attachment / `strip` / `anchor` grammar and the
  new codes — and the LSP quick-fix `codeActions` reach extension users). Marketplace upload stays a
  manual web step.

## [1.12.1] - 2026-07-07

### Fixed

- The PNG backend's lazy `import("node:fs")` / `import("node:url")` (font lookup) now carry
  `/* webpackIgnore: true */ /* @vite-ignore */` like every other Node-only lazy import, so a
  webpack/Next.js consumer importing the core **client-side** no longer fails its build trying to
  resolve `fs` for the browser (the code path never runs in a browser; same class of bug as the
  1.0.0 → 1.0.1 fix). Found by ArchCanvas's first in-browser use of the core.

## [1.12.0] - 2026-07-06

AI-first release (Mermaid-inspired): make ArchLang maximally discoverable, self-describing and
distributable for AI agents. Default SVG output stays byte-identical throughout; every new output
behavior is opt-in (ADR 0007 discipline).

### Added — agent context & diagnostics

- **`llms-full.txt`** (generated, drift-tested via `npm run gen:llms` / `scripts/gen-llms-full.ts`):
  the full language spec, the `SKILL.md` agent workflow, a manifest-derived CLI reference and the
  complete diagnostic catalog bundled into one system-prompt-ready document (~40 KB). Ships in the
  npm package; the docs site now serves **`/llms.txt`** and **`/llms-full.txt`** at its root
  (copied into `docs-site/public/` by `sync-docs.mjs`, per llmstxt.org convention).
- **`arch context`**: prints the bundle — one command gives a cold-start agent everything
  (`arch spec` remains the language-only view).
- **`diagnosticToJson(source, d)` + `DiagnosticJson`** (new `src/diagnostic-json.ts`, exported):
  the CLI's agent-facing diagnostic projection (line/col from byte spans + catalogued `fix`) is now
  public API for SDK/playground/LSP consumers. CLI JSON output is byte-identical.

### Added — always-visible errors & eval spine

- **Opt-in error-card SVG**: `compile(src, { onError: "svg" })` / `--error-svg` on
  `compile`/`preview`/`md` — a plan that fails to compile still renders a deterministic,
  self-describing SVG card (severity, code chip, line:col, message, catalogued fix; new
  `src/backends/error-svg.ts`, exported `renderErrorSvg`). Errors/diagnostics/exit codes are
  unchanged; without the opt-in, a broken plan still produces no bytes. `arch md --error-svg`
  renders failing fenced blocks as error cards instead of skipping them. Also exported:
  `renderPngFromSvg` (raster core extracted from the PNG backend).
- **Authorability eval hardened**: corpus grown 3 → **18 briefs** with hand-verified goldens
  (relational placement, `dims auto`, `against wall`, multi-bath topology, open-plan `opening`,
  accessibility briefs, scripting, an intentional-warning shell, 30–126 m²); offline golden
  regression gate wired into CI (**`npm run eval:ci`**, no API key); default live-eval model id
  updated.

### Added — distribution

- **Docs site**: plain ```` ```arch ```` fences in any docs page now render as live, editable
  `<ArchLive>` widgets (markdown-it fence transform; SSR/no-JS keeps the highlighted block;
  ```` ```arch static ```` opts out). Explicit `<ArchLive>` usage is untouched.
- **GitHub Action** `.github/actions/arch-render` (composite, in-repo): render every fenced
  ` ```arch ` block in a repo's Markdown via `arch md` — inputs `files`/`format`/`out-dir`/
  `error-svg`/`version`, with a self-test workflow. With `error-svg: true` (default) broken blocks
  become error-card images and the job stays green.
- **Playground**: **Copy-for-LLM** button (current source + `describe()` facts + diagnostics with
  fixes + spec pointer as one paste-ready prompt; pure `buildLlmPrompt` helper) and diagnostics
  now show their catalogued fix inline (full cause/example still behind the disclosure).

### Added — accessibility as a language feature

- **`compile(src, { accessible: true })` / `arch compile --accessible`**: the SVG carries
  `<title>` (plan name), `<desc>` (a derived one-sentence caption) and `role="img"` +
  `aria-labelledby`. The caption is also exposed as **`describe().caption`** (same sentence,
  guaranteed identical). Default output byte-identical without the flag.
- **`accTitle` / `accDescr`** plan-level keywords (the release's one language-surface change):
  explicit accessible metadata overriding the derived title/caption. Duplicate → new
  `W_DUP_ACC_METADATA` (last wins); misplaced → new `E_ACC_PLACEMENT`. Grammar/spec/editor
  artifacts regenerated; new `examples/accessible.arch`; `arch fmt` prints and preserves both.
  **VS Code extension repack required** (it bundles the core).

## [1.11.0] - 2026-07-03

### Added

- Annotate mode now stamps `data-arch-id` / `data-arch-kind` on element primitives.
  `data-arch-kind` is stamped for **every element kind except `wall`** — currently `room`,
  `door`, `window`, `opening`, `furniture`, `dim`, and `column` (the non-wall members of
  `ElementKind`; the set is open-ended and grows as kinds are added). Walls are excluded —
  their SVG is unioned geometry stitched across many statements, so per-element attribution
  is ambiguous. Default (non-annotate) output remains byte-identical.
- `diffPlans(sourceA, sourceB, opts?)`: deterministic semantic diff of two plans built on
  `describe()` — room/opening/furniture changes, per-room bbox edge deltas, circulation deltas,
  and human-readable summary sentences.

## [1.10.0] - 2026-07-02

### Added — human circulation: facts, lint, overlay & repair guard (ADR 0008)

Circulation analysis grows from "is every room reachable?" to "how far, how wide, how direct is
the walk?" — strictly as **facts + advisory + explicit transform** (ADR 0005/0006 discipline; no
generative layout). The authoring language is untouched and **default output stays byte-identical**
(pinned by tests).

- **Facts** (`describe().circulation`, new `src/analyze/circulation.ts`): a whole-plan navigation
  grid — walls rasterised, rooms stitched through door/opening portals, obstacles inflated by a
  300 mm body radius — yields per-room `walkDistanceMm`, `bottleneckClearWidthMm` (widest-path
  pinch) and `detourRatio` from the entrance, plus key-pair routes (kitchen↔living/dining,
  bedroom↔bath). `null` when the plan has no entrance. Deterministic BFS; pure; zero-dep.
- **Lint**: `W_PATH_TOO_NARROW` (a walk's unavoidable pinch below `minPathClearWidthMm`, default
  700 mm = a standard door's clear opening; the `accessibility-advisory` profile raises it to
  900 mm) and `W_CIRCUITOUS_PATH` (entrance walk > `maxDetourRatio` × straight-line, default 3.0).
  Appended after all existing rules, so prior lint output order is unchanged; `examples/studio.arch`
  stays lint-clean at defaults.
- **Overlay** (opt-in, ADR 0007 pattern): `compile(src, { overlays: ["circulation"] })` /
  `arch compile --overlay circulation` draws the entrance walks (dashed), key routes, and a
  bottleneck marker + clear-width label per room on the annotations layer — appended after all
  existing nodes, folded into the compile cache key; without the option the SVG is byte-equal to
  the default (tested). The playground gains an off-by-default **Paths** toggle; exports stay
  overlay-free.
- **Repair guard**: `arch repair` now rejects a candidate furniture move that would *newly* pinch
  any entrance walk or key route below `minPathClearWidthMm`, leaving the piece in place and
  reporting it in `unresolved` (report-don't-guess; fixpoint convergence and all pre-existing
  repair outputs verified byte-identical).

### Changed — foundation refactor: perf, architecture & tooling (default output byte-identical)

A ground-up hardening pass. **Every default artifact is byte-identical** — SVG/PNG goldens, scene
snapshots, DXF, the formatter and all `--json` outputs are unchanged (`UPDATE_GOLDENS` was never
used); the public API only grew (`COMPLETION_KINDS`, `EXPORT_FORMATS`, `Scene.chrome`).

- **Perf — wall union rewritten** (`src/geometry/union.ts`): coverage is rasterized once into a flat
  cell grid with packed-integer edge keys instead of per-cell centre-in-rect scans over every
  rectangle. Opening-heavy plans: `toScene` ~19.5 → ~2.6 ms (full compile ~42 → ~24 ms).
  `toScene` also computes `hatchesUsed`/`layoutChrome` once and carries the chrome on the Scene
  (new optional `Scene.chrome`; backends fall back for hand-built Scenes).
- **Perf — `arch validate`/`arch lint` no longer render the SVG they discard**: both use the
  internal resolve pipeline (diagnostics verified byte-identical), so the ship-gate path skips the
  most expensive compile stage entirely.
- **Bench told the truth for the first time**: stage rows had measured memo-cache hits (~0.08 ms)
  and the generated BALANCED plan had 100 furniture parse errors from a stale `id=` slot. Timed
  closures now clear the stage caches, `render` split into `toScene`/`renderSvg`, new `lint`/
  `describe` rows, baseline regenerated (old numbers not comparable).
- **Architecture**: `lint()`'s 290-line body is now one module per rule (`src/lint/rules/*`) over a
  shared precomputed `LintContext`, with the emission order documented as contract; the duplicated
  rect/wall-intrusion/door-landing math lives once in `src/geometry/rect.ts`; the deterministic
  number formatter lives once in `src/num-format.ts` (per-site precisions preserved); the three
  long orchestrators (`parsePlan`, `resolveImpl`, `synthDims`) are decomposed; the legacy
  `render.ts` shim is gone.
- **Drift joints pinned by tests**: `KEYWORDS.element` ↔ `BUILTIN_DEFS` (both directions + order),
  fixture zone classification derived from the catalog (`zones` field; membership pinned to the
  historical lint literals), glyph categories ⊆ catalog, and the VS Code completion-icon map is now
  compile-time exhaustive over the new `COMPLETION_KINDS` core export. Export formats single-source
  from `EXPORT_FORMATS` (deliberately not a public registry seam — documented in AGENTS.md).
- **Tooling**: Biome adopted repo-wide (format + lint, CI-gated); `noUncheckedIndexedAccess`
  enabled and fixed across `src/`; CI matrix gains Node 22 and an explicit `gen:spec` drift step.
- **Playground is TypeScript**: all hand-written modules migrated under `strict` (the generated
  `arch-language.js` stays JS), `main` split into focused modules (~695 → ~290 lines), and the
  share codec / storage / snapshots / completion map gained 22 vitest tests wired into the root
  suite. Suite: 488 → **515 tests**.
- **Docs**: completed build plans archived under `docs/archive/`; AGENTS.md's headline no longer
  embeds a version.

### Added — embeddable playground viewer + live docs examples (sites only; core untouched)

Two ZenUML-inspired distribution/UX wins, both entirely in the deployed sites — **no change to the
published `@chanmeng666/archlang` core** (its `src/`, output, goldens, and 488-test suite are
untouched):

- **Playground — embeddable widget.** A new chrome-less `embed.html` page renders any plan from the
  existing `#z=` share hash, so a floor plan can be dropped into a blog / Confluence / GitHub-Pages
  via a single `<iframe>`. A new **Embed** button generates the iframe + Markdown snippet; the embed
  supports `&editable=1` (live editor), `&theme=`, pan/zoom, and an attribution chip. The share codec
  moved to `playground/src/share.js` (one scheme for both pages); SVG-sizing to `playground/src/viewer.js`.
- **Playground — IDE-parity actions** wiring already-shipped core APIs into the UI: a **Format**
  button (`format()`), a **Repair furniture** panel (`repair()`) that shows the change log with an
  **Apply fixes** action (opt-in, reviewable — ADR 0006 preserved), and **clickable diagnostics** that
  jump the caret to the source span and reveal the error-catalog cause/fix/example (`ERROR_CATALOG`).
- **Docs — live, editable examples.** A new `<ArchLive>` VitePress component compiles a plan in the
  browser (SSR-safe, so no-JS visitors still get the SVG) with a live editor, a `describe()` facts
  strip, and an **Open in Playground** link. The examples gallery and the guide hero are now live;
  example sources are generated into `examples-data.js` from `examples/*.arch` by `sync-docs.mjs`.

## [1.9.0] - 2026-07-01

### Added — opt-in source annotation (`compile(src, { annotate: true })`)

An additive, opt-in compile option that stamps `data-span="start:end"` (the source byte range) on
each drawn SVG primitive that carries a span, so a tool can map a clicked element back to the source
that produced it. **Default output is byte-identical** — with the flag off, the Scene IR and the SVG
string are unchanged (existing goldens/snapshots untouched; exported files stay clean). `toScene`
copies the resolved element's span onto its nodes only in this mode; walls are unioned across
statements, so their per-node span is intentionally left unset. The option is folded into the compile
cache key. The core stays zero-dependency and deterministic (the annotated output is itself stable).
See **[ADR 0007](docs/adr/0007-opt-in-source-annotation.md)**. Programmatic only — not a CLI flag.

### Changed — playground: mermaid-live-editor–grade editing + click-to-source

The deployed playground (the Vite app, not the published package) was brought to
mermaid-live-editor parity and given two floor-plan-specific affordances:

- Preview **pan / zoom / fit** with a floating toolbar (zero-dep CSS-transform controller);
- **Editor autocomplete**, reusing the core `completion()` language service;
- **Compressed share links** (`#z=` deflate-raw via native `CompressionStream`; still reads the
  legacy `#src=` form);
- **Autosave + named snapshot history** in `localStorage`;
- **Copy SVG / Copy PNG** to the clipboard, and **draggable resizable panes**;
- An always-visible **facts strip** (`describe()` totals: rooms/doors/windows/area/entrance);
- **Click any element → jump the editor caret to its source** (via the new `annotate` `data-span`);
- **Hover a room → area/size tooltip** (geometric hit-test against `describe()` bboxes).

Every export/copy strips the `data-span` annotations, so downloaded SVG/PNG/PDF stay clean.

## [1.8.0] - 2026-07-01

### Added — agent CLI ergonomics (mermaid-cli-inspired): preview · batch · md · manifest

Four additive commands close the gaps between the `arch` CLI and a frictionless agent workflow,
without touching the zero-runtime-dependency, deterministic core:

- **`arch preview <plan> -o out.png`** — render a PNG an agent can *look at*, PNG-first at `scale 2`.
  Zero-install where the optional `@resvg/resvg-js` binary is present (a normal `npm i`/`npx`
  installs it); when it is genuinely absent the failure is the catalogued, self-correcting
  **`E_PNG_DEPENDENCY`** (with a `fix`) instead of an opaque thrown error, and `--install` fetches
  the dep (detecting npm/pnpm/yarn) and retries. The auto-install is the one opt-in, networked CLI
  action — confined to the CLI seam, never the core.
- **`arch batch <a.arch> <b.arch> …`** — render many files concurrently (`-j` jobs, default CPU
  count; `-o <dir>`), with a stable `{ ok, results: [...] }` JSON shape for exploring design variants.
- **`arch md <doc.md> -o out.md`** — render every ` ```arch ` block in a Markdown file and rewrite
  each to an image link (mermaid-cli's markdown mode). Pure `extractArchBlocks`/`rewriteMarkdown`
  helpers back it.
- **`arch manifest --json`** (alias `capabilities`) — the whole CLI API as one structured document
  (commands, flags, formats + their optional deps, elements, keywords, lint profiles, fixture
  categories, error codes) so an agent discovers the surface without parsing prose. A drift test
  keeps it in lockstep with the command dispatch and the fixture glyphs.

`spec.llm.md` (`arch spec`), `SKILL.md`, and the README agent section document the new commands;
`--install` is opt-in and the core stays zero-dependency.

## [1.7.1] - 2026-06-30

### Added — agent guidance: repair topology (doors/windows) from the access graph

`SKILL.md` (and a pointer in the generated `spec.llm.md` / `arch spec`) now documents a concrete,
verified procedure for the agent layer to make every room reachable and every bedroom lit by **adding
doors/windows** — the design choice the core deliberately won't make (ADR 0005). It drives off
`describe --json` (access graph, room bboxes/adjacency, building extent), with exact on-centerline
coordinate arithmetic, a priority that gives a cut-off living space its own exterior entrance rather
than routing circulation through a bedroom, and a re-`repair` → `validate --strict` loop. Verified
end-to-end on two ArchCanvas plans (broken AI plan → `repair` + this procedure → fully clean). No core
code change.

## [1.7.0] - 2026-06-30

### Changed — `arch repair` also clears door-swing arcs

`arch repair` now fixes six furniture-placement faults (was five): a piece sitting in a
door's **swing arc** (`W_SWING_OBSTRUCTED`) is moved out of the quarter-disc the leaf
sweeps. Because the swing is a 90° sector (not a box), the minimal clearing shift along
each axis is found by grid-stepping against the *same* predicate the lint uses
(`sectorIntersectsRect`), so repair clears exactly what the warning flags — preferring a
shift that doesn't drive the piece into a wall, reporting an exact tie. Priority is now
wall → wrong-room → overlap → doorway → **swing** → floating. On the three motivating
ArchCanvas plans, repair now drives every furniture-placement *and* swing warning to zero.

## [1.6.0] - 2026-06-30

### Changed — `arch repair` also separates overlaps and relocates wrong-room fixtures

`arch repair` now fixes five furniture-placement faults (was three), via a global
fixpoint that iterates every piece to a stable arrangement:

- **Separates overlapping pieces** (`W_FURNITURE_OVERLAP`) — the later piece in source
  order yields, pushed along the axis of least overlap (a deterministic mover order, so
  a pair never chases itself).
- **Relocates a fixture to its declared room** (`W_FIXTURE_WRONG_ROOM`) — a piece placed
  `in <room>` but drawn outside it is moved back inside (fully inside when it fits).

These compose with the existing wall / doorway / floating fixes (priority: wall →
wrong-room → overlap → doorway → floating), so e.g. a wrongly-placed fixture is moved
into its room *and then* snapped to that room's wall in one repair. Still deterministic,
closed-form, and report-don't-guess (cycling / ambiguous / too-far pieces go to
`unresolved`).

## [1.5.0] - 2026-06-30

### Changed — `arch repair` now fixes all three furniture-placement faults

`arch repair` previously only pushed furniture out of walls. It now iterates each piece
to a stable position across three closed-form fixes (priority wall → doorway → floating):

- **Clears door landings** — a piece in a door's clear approach is pushed out, preferring
  an exit that doesn't drive it into a wall (so a fixture by a doorway moves into the room,
  not into the wall behind it).
- **Snaps floating fixtures** — a wall-requiring fixture floating mid-room is snapped onto
  its nearest wall (within a sane distance; farther pieces are reported, not dragged).
- **Convergence + honest reporting** — a piece that would cycle, sits with no majority
  side, or floats too far is left at its best position and reported in `unresolved`.

On the three motivating ArchCanvas plans, `arch repair` now drives every furniture
placement warning (`W_FURNITURE_WALL_COLLISION` / `W_DOORWAY_BLOCKED` /
`W_FIXTURE_FLOATING`) to **zero**, and is idempotent.

`RepairChange.kind` is now `"moved"` (a single move may combine fixes); the per-piece
`reason` string summarises every fix applied.

## [1.4.0] - 2026-06-30

### Added — physical-correctness & circulation (Claude × Codex adversarial pass)

A second Claude Code × Codex review (prompted by AI-generated plans that rendered with furniture
through walls, fixtures piled in doorways, and rooms with no door) hardened the renderer and the
soundness layer, **without** turning `compile()` into an arranger. See the new
[ADR 0006](docs/adr/0006-solver-as-explicit-transform.md): a solver may exist only as an explicit
source-to-source transform, never as invisible render behavior.

- **Render fidelity:** `dims auto walls` annotates each distinct wall thickness once (deduped); the
  new mode is also included in `dims auto all`. Per-room dimensions (`dims auto rooms`) now sit in the
  page margin on the side each room faces, instead of overlapping the room label/area inside the room.
- **New lint rules (advisory, deterministic facts — ADR 0005-compliant):**
  `W_FURNITURE_WALL_COLLISION` (a piece drawn through a wall solid, via AABB intrusion over
  `segmentRectangle`, opening-aware), `W_DOORWAY_BLOCKED` (furniture in a door's clear landing — the
  walk-through path, distinct from the swing arc), and `W_ROOM_NO_CLEAR_PATH` (a grid flood-fill in
  `analyze/occupancy.ts` finds a room whose doorways can't reach a usable patch of floor). New ruleset
  knobs `doorwayLandingMm` and `minClearAreaM2`; the accessibility profile tightens the landing depth.
- **Strict gating:** `arch validate --strict` (alias `--fail-on-warning`) makes advisory warnings
  fail too (exit `2`) — the gate a generation pipeline runs so it can't ship a plan lint flagged. The
  agent contract (`SKILL.md`, `spec.llm.md`) now mandates this gate and an explicit furniture-placement
  discipline (back fixtures to walls with `against wall`, keep every room reachable, keep doorways
  clear).
- **Catalogued footprints:** a known fixture placed `against wall` may omit `size` and take its
  conventional footprint from `fixtures-catalog.ts` (closed-form, never a guess).
- **`arch repair`:** a new opt-in, source-to-source corrector. It pushes furniture out of walls and
  emits **new `.arch` source plus a change log** (never an invisible edit); ambiguous, scripted, or
  `against wall` pieces are reported, not guessed. Exported as `repair()` from the public API.
- **eval:** the offline harness now fails any golden that has a physical-correctness violation (the
  three new codes), guarding authorability regressions.

### Fixed

- The formatter (`arch fmt`) silently dropped the `dims auto` directive; it is now preserved.

## [1.3.2] - 2026-06-28

### Changed — docs site & playground brought up to v1.3 (no compiler changes)

A documentation/UX patch: the compiled core (`dist/`) is **byte-identical** to 1.3.0/1.3.1 — only the
two visitor-facing surfaces changed. They had fallen a release behind the language and didn't show
the v1.3 features (`opening`, room `uses`, wall-anchored furniture, the access graph, lint profiles).

**Docs site (`docs/`, `docs-site/`):**

- **`docs/language-reference.md` rewritten to v1.3** (synced verbatim to the site's `/reference`):
  documents the cased **`opening`** element, room **`uses`** tags, the v1.3 furniture grammar
  (`against wall [segment|offset|side]`, `rotate`, `in <room>`), lint **profiles**, and an Analysis
  pointer.
- **Two new pages**: `docs/furniture.md` (absolute vs wall-anchored placement, the fixture-symbol
  catalogue, the importable fixture library, fixture lint rules) and `docs/analysis.md`
  (`describe` schema, the modelled **access graph**, the lint rule families + profiles, the ADR-0005
  "facts not an architect" framing). The JSON in both is pasted **verbatim from real
  `arch describe` / `arch lint` output**.
- **Wiring**: `sync-docs.mjs` copies the two pages; the VitePress sidebar/nav add them and surface
  the previously-missing **ADR 0005**. The home/guide/agents/examples pages were refreshed (and the
  agents page's stale `describe` example — wrong areas/adjacencies/room count — corrected).

**Playground (`playground/`):**

- **All canonical examples** in the picker as a learning progression (Single room → Studio →
  Two-bed → Relational → Themed → Parametric), imported via Vite `?raw` so they can't drift.
- **Theme switcher** (re-render in blueprint/dark/mono/presentation via `CompileOptions.theme`),
  **lint-profile toggle** (`residential-basic` ↔ `accessibility-advisory`), an **access-graph
  visual** in the Describe tab (rooms bucketed by depth-from-entrance with clear-width + reachability,
  raw JSON kept in a `<details>`), and a backend-free **shareable permalink** (`#src=` base64url) with
  a Copy-link button. No new dependencies.

439 tests pass; typecheck, `docs:build`, and `playground:build` all clean; no codegen drift. Verified
in-browser: every example renders, all four playground controls work, and the permalink round-trips.

## [1.3.1] - 2026-06-28

### Fixed — bundled examples & agent spec (no compiler changes)

A content/documentation patch: the compiled core (`dist/`) is **byte-identical** to 1.3.0 — only the
shipped example sources and the generated agent spec changed. The flagship examples are embedded
verbatim in `spec.llm.md` (what an agent ingests via `arch spec`) and consumed by the playground and
docs gallery, and they taught a few unprofessional patterns. Fixed at the source:

- **`examples/studio.arch`** — the bath door's inside entry path was blocked by the shower
  (re-laid the fixtures: shower to the far corner, basin/WC against the walls, so the entry stays
  clear); replaced the redundant living↔hall swing door with a leaf-less **`opening`** (circulation
  stays sound — the bath is reached via the hall, never the bedroom); and referenced the perimeter
  dimensions to the building's **outer faces** so the extension lines start at the wall and read
  outward instead of denting back into it (spans unchanged: 4000 · 3000 · 7000 · 6000).
- **`examples/parametric.arch`** — the overall "units" dimension ran left-to-right and landed
  *inside* the building; reversed it and referenced the outer face so it sits above the row.
- **`spec.llm.md`** regenerated from the corrected examples; SVG/scene snapshots and visual goldens
  updated.
- **Playground** now imports the canonical `examples/*.arch` via Vite `?raw` instead of a
  hand-copied duplicate, so the live demo can no longer drift from the shipped source.

439 tests pass; `arch lint examples/studio.arch` is clean; no codegen drift.

## [1.3.0] - 2026-06-28

### Added — architectural soundness, circulation facts & professional placement

A Claude × Codex adversarial design pass. The compiler stays a faithful, deterministic renderer; the
new "design intelligence" ships as **facts** (`describe`) and **advisory `lint`** — never as an
auto-arranger (codified in `docs/adr/0005-no-invisible-architect.md`).

- **Room `uses` tags** — `room … uses living|kitchen|bedroom|bath|wc|hall|…` makes room
  classification authored intent instead of a label-regex guess. A central `roomUses()` classifier
  (`src/analyze.ts`) wins over the regex; untagged plans behave identically. Surfaced as
  `describe().rooms[].uses`.
- **Modeled door/opening access graph** (`buildDoorAccessGraph`) — entrances, per-room
  reachability + depth from a synthetic exterior node, and a widest-path clear-width bottleneck
  (nominal vs estimated clear width). Surfaced append-only as `describe().access`.
- **Cased `opening` element** — `opening at (x,y) width N [wall …]`, a leaf-less gap that voids the
  wall and connects two spaces, so open-plan layouts read as connected in the access graph.
- **`furniture rotate 0|90|180|270`** — quarter-turn the drawn symbol (exact integer rotation,
  byte-stable), and **`furniture … against wall <id> [segment <n>] [offset <d>] [side left|right]
  size <along>×<depth>`** — closed-form wall-anchored placement that derives position + rotation so
  the symbol's back sits flush; `side` is inferred from `in <room>` when omitted.
- **Furniture ownership** — `furniture … in <roomId>` declares the owning room.
- **New lint rules**: `W_ROOM_UNREACHABLE`, `W_FURNITURE_OVERLAP`, `W_FIXTURE_FLOATING`,
  `W_FIXTURE_WRONG_ROOM`, `W_FURN_CLEARANCE` (a fixture's use-space blocked by free-standing
  furniture). New errors `E_OPENING_WIDTH`, `E_FURN_ROOM`, `E_FURN_ROTATE`, `E_FURN_AGAINST`.
- **Advisory lint profiles** — `arch lint --profile residential-basic|accessibility-advisory`.
  Honestly named (never `ada`/`iso`): an advisory check, not a compliance guarantee.

### Fixed

- **Door swing arcs were concave.** The SVG sweep flag in `doorSwing` was inverted, selecting the
  wrong candidate circle; arcs are now convex quarter-discs centred on the hinge (SVG + PDF; DXF was
  already correct).
- **Overall/right-edge dimensions were drawn into the building.** Corrected the `synthDims` endpoint
  order and the studio example so a positive `offset` always lands outside the footprint.
- **The title block was crossed by the bottom dimension.** A new shared `src/chrome-layout.ts` stacks
  the scale bar + title block below the dimension band and grows per-side page margins; the SVG and
  PDF backends now build chrome from the one source.

### Changed

- `examples/studio.arch` now demonstrates `uses` tags and stays lint-clean. Snapshots, visual
  goldens, the editor grammars, the embedded spec, and `docs/error-codes.md` were regenerated.
- `WallSegment` carries `wallId` + `index`, so every opening host knows which wall (`AccessEdge.hostWallId`).

## [1.2.0] - 2026-06-27

### Added — architectural soundness, fixtures, auto-dimensioning

The mechanical compiler was sound but blind to tacit architectural knowledge: the canonical studio
passed `arch lint` despite a bathroom open to the living room and reachable only through the bedroom.
This release makes wrong plans hard to ship and easy to detect, and makes wet rooms read
professionally. Existing rendered output is unchanged except where a fixture symbol now draws.

- **Four architectural lint rules** (`src/lint.ts`), tunable via the existing `LintRuleset`:
  `W_BATH_VIA_BEDROOM` (a bath reachable from the entrance only by passing through a bedroom —
  door-graph BFS), `W_ROOM_NOT_ENCLOSED` (a wet room with an unwalled perimeter run),
  `W_SWING_OBSTRUCTED` (a door leaf sweeping onto furniture or another door's swing), and
  `W_ROOM_NO_FIXTURE` (a bath/kitchen with no fixtures). Documented in the catalog (`arch explain`).
- **Drawn fixture symbols** (`src/elements/fixtures-glyphs.ts`). `furniture wc|basin|shower|bathtub|
  kitchen_sink|counter|fridge|stove …` draws a real plan symbol instead of an empty labelled box,
  with a safe fallback to the rectangle for any other kind. Standard fixtures also ship as a
  component library (`examples/lib/fixtures.arch`).
- **`dims auto [overall|rooms|all]`** — synthesize dimension strings without hand-placing each `dim`.
  Presentation-only (lowered in `scene-build.ts`), so `describe`/`lint` and the resolve cache are
  unaffected.
- Shared geometry — the door-swing quarter-disc, the room-connectivity graph, and perimeter
  enclosure — is factored into `src/geometry.ts` / `src/analyze.ts` and reused by both the renderer
  and the linter (no duplicated geometry).

### Changed

- **`examples/studio.arch`** rewritten to be architecturally sound: an enclosed bath off a central
  hall (no longer reached through the bedroom), a fitted kitchen and bath, non-colliding door swings,
  and dimension strings. It now lints clean. Snapshots, the visual golden, and the embedded spec were
  regenerated; the editor grammars gained the `dims`/`auto` keywords.

## [1.1.0] - 2026-06-27

### Added — AI-agent-native interface (CLI-first)

ArchLang's interface for AI agents is its **CLI** — token-cheap, harness-agnostic, and
self-correcting — not an MCP server (a CLI costs nothing in context until called, where an MCP
schema sits in the window permanently). All additions are pure and keep existing rendered output
byte-identical.

- **`describe(source)` → semantic JSON** (`src/describe.ts`). A text-only verification channel:
  rooms (areas, bounding boxes, edge-touch adjacency), doors (what spaces they connect), windows
  (the room they serve), and totals. Exported from the public surface and surfaced as
  `arch describe --json`.
- **`lint(source)` → architectural soundness** (`src/lint.ts`). Habitability rules as `W_*`
  diagnostics: `W_ROOM_TOO_SMALL`, `W_ROOM_DISCONNECTED`, `W_BEDROOM_NO_WINDOW`, `W_DOOR_CLEARANCE`,
  `W_NO_ENTRANCE`. Configurable ruleset; surfaced as `arch lint --json`. Codes documented in the
  catalog (`arch explain`).
- **Agent-native CLI** (`src/cli.ts`). Every command takes `--json` (result on stdout, messages on
  stderr) with deterministic exit codes (`0` ok · `2` user-source error · `1` IO · `3` usage); each
  JSON diagnostic carries the catalog `fix`. Source reads from stdin (`-`); artifacts write to
  stdout (`-o -`). New verbs: `validate`, `describe`, `lint`, `spec`, `new`/`init`.
- **`arch spec` / `spec.llm.md`** — the whole language in one page (~2k tokens), generated from
  `src/grammar/tokens.ts` + `examples/` by `npm run gen:spec` (drift-guarded in CI).
- **`SKILL.md`** — a filesystem agent Skill that teaches the `spec → write → compile/describe/lint`
  loop. `llms.txt`, `AGENTS.md`, and the README now document the zero-install CLI loop
  (`npx @chanmeng666/archlang …`).
- **NL→ArchLang eval harness** (`eval/`). Scores natural-language prompts against semantic
  expectations; offline mode (`npm run eval`) is a CI authorability-regression guard, live mode
  (`--live`, needs `ANTHROPIC_API_KEY`) produces the headline number.
- Shared pure analysis layer (`src/analyze.ts`) backs `describe` and `lint` (resolve pipeline +
  rectilinear geometry, no duplication).

## [1.0.1] - 2026-06-26

### Fixed

- **Bundler builds in downstream consumers (webpack / Next.js).** The lazy
  `import()`s of the optional native/wasm dependencies (`@resvg/resvg-js`,
  `pdfkit`, `clipper2-wasm`) are now annotated with `/* webpackIgnore: true */`
  and `/* @vite-ignore */`, so a consumer's bundler no longer follows them into a
  native `.node` binary at build time (which failed with *"Module parse failed:
  Unexpected character"*). These dependencies are still loaded lazily at runtime
  under Node when the relevant export (`renderPng`/`toPdf`/angled-wall geometry)
  is used; nothing changes for the zero-dependency SVG/DXF path.

## [1.0.0] - 2026-06-26

### Added — Polish, ecosystem & launch (v1.0)

The 1.0 release rounds out the language and ships the public surface that makes
ArchLang adoptable: relational placement, a PNG backend, a visual-regression
safety net, a multi-format playground, a docs site, and a workspaces monorepo.
The core stays pure, deterministic, and zero-runtime-dependency, and **every
existing rendered output (the absolute/manual coordinate path) is byte-identical**
to v0.11.

- **Relational placement (`right-of` / `left-of` / `below` / `above`).** A room
  can be positioned relative to another with an optional `align` (`top|middle|
  bottom` or `left|center|right`) and `gap`, instead of absolute `at (x,y)`.
  Positions resolve to absolute coordinates by **pure arithmetic in dependency
  order** (a topological pass in `src/layout.ts`) — deterministic sugar, not an
  optimizer. Reference cycles raise `E_LAYOUT_CYCLE`; unknown references raise
  `E_LAYOUT_REF`. The absolute path is unchanged and remains the default. The
  lexer learns `right-of`/`left-of` as compound keywords; the formatter, error
  catalog, and editor grammars are updated; new `examples/relational.arch`.
- **PNG export backend.** `renderPng(scene)` (exported) and `arch compile -f png`
  rasterize the Scene's SVG with the **optional, lazily-loaded** `@resvg/resvg-js`
  and a **bundled font** (system fonts disabled), so output is deterministic and
  byte-identical across machines. The dependency is absent from the default
  bundle (`optionalDependencies`, external to the build, font read lazily).
- **Visual-regression suite.** Golden PNGs are pixel-diffed with `pixelmatch`
  (strict threshold) so geometry changes are caught visually; refresh with
  `UPDATE_GOLDENS=1`. Skips when the optional raster dep is absent.
- **Playground multi-format download.** The Vite + CodeMirror playground now
  downloads **SVG, PNG, DXF, and PDF** (PNG/PDF via canvas + lazily-loaded jsPDF,
  bounded so large plans don't overflow the canvas limit).
- **Documentation site.** A VitePress site (`docs-site/`) with a guide, the
  language reference, the error catalog, a relational-placement page, an examples
  gallery, and the ADRs — all generated from the canonical repo sources so it
  cannot drift.
- **Workspaces monorepo.** The core stays the published root package; `editors/
  vscode`, `playground`, and `docs-site` are npm-workspace members sharing one
  root lockfile, so a single `npm install` bootstraps everything.
- **Architecture Decision Records** (`docs/adr/`): hand-written parser vs Lezer;
  optional-dependency geometry; expand-time scripting; relational placement is
  not an optimizer.
- **Benchmarks in CI.** `bench/run.ts --json` + `bench/compare.mjs` post an
  informational per-stage regression comment on PRs (never gates the build).

### Changed

- `CompileResult` is unchanged in shape (append-only); the PNG output is produced
  on demand from `scene`, not added as a field.
- `docs/language-reference.md` folded forward to v1.0 (relational placement, the
  four export formats); `AGENTS.md` and `README.md` refreshed to the current
  Scene-IR / registry / World architecture and the v1.0 surface.
- Repo-wide LF line endings enforced via `.gitattributes` (determinism hygiene).

## [0.11.0] - 2026-06-26

### Added — IDE-grade tooling & DX

The compiler grows a proper toolchain: a comment-preserving formatter, a full
language server, one grammar source of truth, and a documented error catalog.
The parser becomes lossless and never throws. All of this is tooling/internal —
the core stays pure, deterministic, and zero-runtime-dependency, and **every
existing rendered output (SVG/DXF/PDF) is byte-identical**.

- **Lossless, error-recovering parse tree.** The lexer captures comments as
  trivia (`LexResult.comments`); the AST gains an `ErrorNode` statement variant,
  `PlanNode.comments`, and a `bodyStart` offset. The parser never throws on user
  source: a malformed header recovers (so `CompileResult.ast` is present even on
  partial input), and a broken line emits an `Error` node + diagnostic and keeps
  the rest of the tree instead of dropping it (progress-aware `synchronize`; the
  expression parser refuses to swallow a new-line statement keyword). New
  read-only AST cursor (`src/cursor.ts`).
- **`arch fmt` formatter.** A ~150-line zero-dep Wadler/Prettier `Doc` IR
  (`src/doc.ts`) + `format(source)` (`src/format.ts`, exported): deterministic,
  idempotent, comment-preserving, and semantics-preserving (`compile(x) ===
  compile(format(x))`). Precedence-correct expressions, `WxH` vs `<expr> x
  <expr>` sizing, and long wall point-lists that wrap one-per-line. CLI: `arch
  fmt <in.arch> [--write]`. Returns source unchanged on parse error.
- **Full LSP.** Promoted from diagnostics-only to hover, completion,
  go-to-definition, scope-aware rename, and signature help — a pure, isomorphic,
  unit-tested core (`src/lsp.ts`, exported) driven by an append-only `params`
  schema on `ElementDef` (one source for the LSP and the docs). The VS Code
  server advertises and delegates to it.
- **One grammar source of truth.** `src/grammar/tokens.ts` is the single source
  for keyword categories, operators, and statement-start keywords; the parser
  derives its statement set from it, and `scripts/gen-grammars.ts`
  (`npm run gen:grammars`) generates the TextMate grammar and the playground
  StreamLanguage. A drift test + CI step keep them in sync.
- **Error-code catalog + richer diagnostics.** `src/error-catalog.ts` documents
  every `E_*`/`W_*` code (cause/fix/example); `arch explain <CODE>` prints an
  entry; `scripts/gen-error-codes.ts` (`npm run gen:errors`) generates
  `docs/error-codes.md` (drift-checked). `Diagnostic` gains `relatedSpans`, and a
  door/window off every wall now points at the nearest wall.

## [0.10.0] - 2026-06-26

### Added — extensible platform

ArchLang becomes a platform: third-party elements, a clean environment seam, an
import system for `.arch` libraries, a richer theming cascade, and config
sanitization with per-stage memoization. All additive and infrastructural — the
core stays pure, deterministic, and zero-runtime-dependency, and **every existing
rendered output is byte-identical**.

- **Open, per-call plugin registry.** `compile(src, { plugins })` merges
  third-party `ElementDef`s into a registry built fresh **per call** — no global
  mutation, so the compile cache stays correct. A new element type now compiles
  with zero core edits. `register{Element,Theme,Hatch,Backend}` validate/construct
  extensions; `createRegistry`/`BUILTIN_REGISTRY` are exported. Plugin, theme,
  backend, hatch, and World **identity is folded into the compile cache key** (via
  stable process-local id tokens), so distinct extension sets never bleed across
  compiles. `CompileOptions` gains `plugins`, `backend`, `hatches`, `themes`.
- **`World` seam.** New `World { read(path): string | null; now?(): Date }` is the
  compiler's single, injectable window onto its environment, keeping `compile()`
  pure/synchronous/isomorphic. `NULL_WORLD` (default) and `makeVirtualWorld(files)`
  ship for browser/test use; the CLI builds a real-fs World. `now` makes
  time-dependent output injectable (never a hidden `Date.now()`). An import-free
  plan compiles byte-identically with or without a World.
- **Import system.** `import "<spec>": a, b as c` (named items, `as`, `*`) brings a
  module's components into a plan. A new `link` phase — the compiler's only I/O,
  behind `World.read` — resolves specs (relative `.arch` paths and namespaced
  `@local/name:1.0.0`), parses each module, and merges components. Cyclic imports
  yield `E_IMPORT_CYCLE` (no hang); missing/unexported/conflicting/bad-spec each get
  a diagnostic. Seeded standard libraries under `examples/lib/` (`furniture.arch`,
  `doors.arch`) + an `examples/imports.arch` demo. Works in Node and the browser.
- **Theming cascade.** Built-in named themes (`THEMES`: `blueprint`, `mono`, `dark`,
  `presentation`) via `theme <name> { … }` (named base + overrides; one-liner
  `theme <name>` works too). Per-element `style <kind> { fill … }` overrides resolve
  element → theme → default. Opt-in `theme from "#color"` derives a finished poché
  from one wall colour (deterministic, zero-dep HSL). `registerTheme` adds named
  themes per call. Theme stays **out of the IR** (re-theming never re-resolves);
  cascade order is default → named base → `theme{}` → `theme from` → per-element
  `style` → `CompileOptions.theme` (always wins). Opt-in derivation keeps all golden
  snapshots byte-identical.
- **Config sanitization.** `sanitizeConfig()` denylist for **untrusted** `.arch`
  config: drops prototype-polluting keys (`__proto__`/`constructor`/`prototype`) and
  blanks string values carrying markup (`<`/`>`) or a `data:` URL. Applied to source
  theme/style values; trusted `CompileOptions` skip it. Theme/style key resolution
  hardened to own-property checks.
- **Per-stage memoization.** Content-hash/identity caches for `lex → tokens`,
  `parse → ast`, and `resolve → ir` (FNV-1a; registry/World identity in the keys),
  bounded and cleared by `clearCache()`. ~22× faster re-render on reparse (e.g.
  re-theming or resizing the same source). Stages are pure, so cached objects are
  shared transparently — determinism intact.

## [0.9.0] - 2026-06-26

### Added — professional CAD fidelity

Output that reads as a real drawing: line-weight hierarchy and line types, CAD
layers, openings that truly cut walls, clean angled joinery, data-driven hatches,
self-consistent dimensions, and sub-linear geometry. Everything stays pure and
deterministic; the core remains zero-runtime-dependency.

- **Style metadata on the Scene.** `SceneNode` gains optional `lineWeight`
  (`heavy|medium|thin|extraThin`), `lineType` (`continuous|dashed|center|hidden`),
  and `layerName`. SVG maps weight → `stroke-width` and type → `stroke-dasharray`;
  DXF emits an `LTYPE` table (before `LAYER`) with group codes `6`/`8`. Additive —
  nodes that set none render as before.
- **AIA CAD layers.** Element kinds map to standard layer names (`A-WALL`,
  `A-FLOR`, `A-DOOR`, `A-GLAZ`, `A-FURN`, `A-COLS`, `A-ANNO-TEXT`, `A-ANNO-DIMS`).
  SVG wraps each layer in an Inkscape `<g>`; DXF declares the layers with colours.
- **Openings void walls (IFC-style).** A hosted door/window registers an opening
  on its wall; the wall solid is the boolean difference of its offset segments and
  the opening rectangles, so an opening genuinely cuts the wall. Orthogonal case is
  fully zero-dependency.
- **Optional angled-wall geometry engine.** A new `GeometryBackend` seam unions
  angled (non-axis-aligned) walls into one seamless outline. The optional
  `clipper2-wasm` adapter (declared in `optionalDependencies`, lazily `import()`ed
  only for angled geometry) is registered by the CLI when present; otherwise angled
  walls fall back to per-segment rendering. The default build pulls no new
  dependency, and **orthogonal output is byte-identical with or without** the engine.
- **Data-driven hatches.** Wall poché is now a backend-neutral `hatch` Scene
  primitive. SVG emits a tiled `<pattern>` and DXF a real `HATCH` entity. Tune with
  `material <name> [scale <n>] [angle <deg>]`.
- **Computed dimensions.** A `dim` with no explicit `text` shows its measured
  length `|to−from|`, formatted via a shared formatter so SVG and DXF agree.
- **Spatial grid index.** Host lookup and room-overlap detection are backed by a
  uniform-grid index (~O(n) for distributed plans), provably byte-identical to the
  former O(n²) scans (fast-check equivalence tests).

### Changed

- **Rendered output intentionally changed** (per-layer `<g>` grouping, line
  weights/types, walls cut by openings, hatch fills). SVG goldens for the orthogonal
  examples remain byte-identical; the Scene-IR golden was updated deliberately.
- **DXF version bumped `AC1009` → `AC1015`** (AutoCAD 2000) so the new `HATCH`
  entity is supported; `LINE`/`ARC`/`TEXT` entities stay R12-style.

## [0.8.0] - 2026-06-25

### Added — a full (pure, expand-time) scripting language

The expression calculator (`Value === number`) is promoted to a small scripting
language. Everything stays **expand-time and deterministic**: loops,
conditionals, and function calls are evaluated while the drawing is built — no
runtime, no I/O, no clock — so the same source still produces byte-identical
output. Numbers remain unitless millimetres.

- **Generalized values.** `Value` is now `number | boolean | string | array |
  function` (`src/expr.ts`). Using a non-number where a number is required is a
  typed diagnostic (`E_TYPE`) with a safe default — never a throw.
- **Richer expressions.** Comparisons (`< > <= >= == !=`), logical operators
  (`&& ||`, short-circuiting), `!`, array literals `[a, b]`, half-open ranges
  `a..b`, indexing `arr[i]` (bounds-checked), function calls, and `if … else`
  **as an expression**.
- **Control flow** that expands into the element stream: `for x in <array|range>
  { … }`, `if <cond> { … } else { … }`, and bounded `while` (10k-iteration cap).
  `name = <expr>` reassigns an existing binding (so `while` loops can progress).
- **Value-functions / closures.** `let area(w, h) = w * h` defines a pure
  closure (recursion bounded; arity checked). Distinct from `component`, which
  emits elements.
- **Built-in functions** (a frozen, pure set): `min, max, abs, sqrt, floor,
  ceil, round, len, str`. Shadowable by a user `let`.
- **Scoped `set` rules.** `set door(swing: out)` overrides defaults for
  subsequent doors in scope; an explicit attribute still wins.
- **String interpolation.** `label "Studio {i}"` interpolates expressions into
  labels/dimension text; interpolated content is escaped at the serialization
  boundary (XSS-safe).
- **Lexical scope chain** with shadowing; `ResolveCtx` gains `evalStr`, and
  `ParseCtx` gains `parseStringExpr`.

### Changed
- `examples/parametric.arch` is rewritten to showcase the new language (a
  `for`-loop row, a value-function, an array, a scoped `set`, an `if`, and
  interpolated labels). Its golden snapshot updates accordingly.
- Existing non-scripting examples (`studio`, `two-bed`, `themed`) render
  **byte-identically** — the value generalization changes nothing for plans that
  use no new constructs.
- `docs/language-reference.md` documents values, operators, arrays/ranges,
  conditional expressions, interpolation, reassignment, functions, control flow,
  built-ins, and `set` rules.

## [0.7.0] - 2026-06-25

### Added
- **Backend-neutral Scene IR.** A new positioned-primitive drawing IR
  (`src/scene.ts`: `Scene`, `SceneNode`, `ScenePrim`, `Paint`) sits between
  `resolve` and the backends, so geometry is defined **exactly once** and every
  backend is a thin, pure serializer. Inspired by Typst's `Frame` and D2's
  `d2target`.
  - `toScene(ir, opts)` (`src/scene-build.ts`) lowers the resolved IR to a Scene
    (elements emit primitives; orthogonal walls union into clean multi-loop
    regions). Exported, plus the Scene types.
  - `compile().scene` exposes the Scene (append-only `CompileResult` field) so
    consumers can target alternate backends without re-resolving.
- **Vector PDF.** `toPdf(scene)` now emits **true vector** PDF via `pdfkit`
  (strokes are real paths, text is selectable) instead of rasterizing the SVG.

### Changed
- **SVG rendering is now a pure serializer** of the Scene (`src/backends/svg.ts`);
  `render(ir)` is a thin composition. Output is **byte-identical** to v0.6 (golden
  snapshots unchanged).
- **DXF backend (`toDxf`) is now a pure Scene serializer** and no longer
  re-derives door arcs / window panes / dimension geometry (the duplicated
  `emitDoor`/`emitWindow`/`emitDim` are deleted). DXF output is correspondingly
  richer (full dimension geometry + computed room areas).
- **API:** `toDxf` and `toPdf` now take a `Scene` (was the IR / an SVG string);
  build one with `toScene(ir)` or read `compile().scene`.

### Removed
- The `svg-to-pdfkit` optional dependency (the PDF backend no longer round-trips
  through SVG). `pdfkit` remains the only optional, lazy-loaded dependency; the
  default SVG/DXF path stays zero-dependency.

## [0.6.0] - 2026-06-25

### Added
- **Export backends.** `arch compile … --format svg|dxf|pdf` (default `svg`), plus
  programmatic `toDxf(ir)` / `toPdf(svg)`:
  - **DXF** — a pure, synchronous, **zero-dependency** ASCII DXF (R12) writer from
    the resolved IR (wall faces, room/furniture/column rectangles, door swing
    arcs, window glazing, dimension lines + labels; Y-flipped for CAD).
    Deterministic.
  - **PDF** — `pdfkit` + `svg-to-pdfkit` lazy-loaded under `optionalDependencies`,
    so the core never hard-requires them (clear error if absent).
- **Public IR access.** `resolve(ast)` and the IR types (`ResolvedPlan`,
  `ResolvedElement`, `RWall`, `RRoom`, `RDoor`, `RWindow`, `RFurniture`, `RDim`,
  `RColumn`) are now exported for consumers that want resolved geometry or custom
  backends.
- **Editor tooling** (in-repo, not shipped in the package; the published core
  stays zero-dependency):
  - A **TextMate grammar** (`editors/archlang.tmLanguage.json`) for `.arch`
    highlighting, TextMate-engine verified.
  - The **playground** rebuilt as a Vite + CodeMirror 6 app with syntax
    highlighting and live inline lint fed by `compile().diagnostics`.
  - A minimal **VS Code extension + LSP server** (`editors/vscode`) that
    publishes the compiler's diagnostics for open `.arch` documents.
- **Benchmark harness** (`npm run bench`): a deterministic ~1000-element plan with
  per-stage timings.
- **CI** (`.github/workflows/ci.yml`): `npm ci → typecheck → test` on Node 18 + 20.

### Changed
- **Performance**: each opening's `isOnWall` + `hostSegment` checks are fused into
  a single wall scan (`hostInfoForWalls`), roughly halving the dominant resolve
  cost. Output is byte-identical (golden snapshots + a fast-check equivalence
  property guard).

### Fixed / Security
- **SVG output XSS hardening.** Theme strings (colours/font) from the `theme { … }`
  directive or `CompileOptions.theme` are now escaped once at the render boundary
  (`sanitizeTheme`), closing an attribute-breakout vector introduced with v0.5
  theming. Output is byte-identical for well-formed themes; the XSS-safety
  guarantee (fixed element allowlist, escaped user text) is documented in
  `SECURITY.md` and covered by `test/security.test.ts`.

## [0.5.0] - 2026-06-25

### Added
- **Clean wall joins**: orthogonal walls are boolean-unioned into a single
  poché fill + mitred outline, so corners and T-junctions render with no
  internal seams (zero-dep, deterministic). Angled walls fall back to
  per-segment outlines.
- **Material hatches**: `wall <kind> thickness N material <name> { … }` with
  `poche` (default), `concrete`, `brick`, `insulation`, `tile`, `none`. Unknown
  materials warn and fall back to the default hatch.
- **Theming**: a `theme { … }` plan directive and `CompileOptions.theme` control
  colours, `lineWeight`, and `font`. Resolution: defaults < directive < options.
  Friendly directive aliases (`wall`, `room`, `wallFill`, …) map to theme fields.
- New diagnostics: `W_UNKNOWN_MATERIAL`, `W_UNKNOWN_THEME_KEY`.
- `examples/themed.arch` — a dark, brick-walled themed plan.

### Changed
- Walls are rendered centrally (unioned by material) rather than per element.
  Default-material, default-theme output is unchanged for non-wall-seam content;
  wall rendering is cleaner (golden snapshots updated + visually verified).
- The memoization cache key now includes `CompileOptions.theme`.

## [0.4.0] - 2026-06-25

### Added
- **Arithmetic expressions** anywhere a number appears (coordinates, sizes,
  widths, thickness, offsets): `+ - * / %`, unary minus, and parentheses with
  the usual precedence. Sizes accept `WxH` or `<expr> x <expr>`. Division by
  zero is a compile error.
- **`let` bindings**: `let NAME = <expr>`, evaluated top-to-bottom (no forward
  references); unknown names get a `did you mean …?` hint.
- **Components**: `component NAME(params) { … }` plus `NAME(args)` instantiation
  — reusable, parameterised sub-plans that compose. Component bodies see their
  params, own `let`s, and plan-level `let`s. Auto-ids stay unique across
  instantiations; infinite recursion is bounded and reported.
- New diagnostics: `E_UNKNOWN_REF`, `E_REDEF`, `E_DIV_ZERO`, `E_ARGCOUNT`,
  `E_UNKNOWN_COMPONENT`, `E_RECURSION`.
- `examples/parametric.arch` — a parametric studio row built from one component.

### Changed
- Lexer: added `+ - * / %` operator tokens; bare numbers are non-negative
  (negation is a unary operator). The `WxH` dimension literal still works.
- AST: element numeric fields are expressions evaluated during `resolve`; the
  plan body is a statement stream (`elements` + `let`s + component instances).
  SVG output is byte-identical for non-parametric plans (golden-snapshot
  verified for `studio.arch` and `two-bed.arch`).

## [0.3.0] - 2026-06-25

### Added
- **Element registry + AST→IR layering.** Each element type (wall, room, door,
  window, furniture, dim) is now a single self-contained module in
  `src/elements/` implementing a common `ElementDef`; parse/resolve/render
  iterate the registry instead of hard-coded switches. Adding an element type is
  one new module + one `register()` line.
- **`column`** element: `column [id=] at (x,y) size WxH` — a solid structural
  column, and the worked example of the new one-file extensibility.
- Pure `resolve(ast) → IR` (`src/ir.ts`): grid-snap, id assignment, opening
  hosting, and semantic checks now produce a new immutable IR — the input AST is
  no longer mutated. `render()` consumes the IR only (backend-ready).

### Changed
- `compile()` pipeline is now `parse → resolve → render`. `CompileResult.ast`
  is the raw parsed AST (unmutated); snapped/resolved geometry lives in the IR.
- AST: elements live in a single discriminated `PlanNode.elements` array (each
  node carries a `kind`); wall/furniture's category field renamed `kind` →
  `category`. SVG output is byte-identical to v0.2 (golden-snapshot verified).

## [0.2.0] - 2026-06-25

### Added
- **Resilient parsing + professional diagnostics.** The compiler now recovers from syntax
  errors and reports **all** problems in a single pass instead of throwing on the first one.
- `CompileResult.diagnostics: Diagnostic[]` — every problem with a byte-offset `span`, a
  stable `code` (e.g. `E_ROOM_SIZE`), and optional `hints`. `errors`/`warnings` are now
  derived projections of this list (back-compatible).
- New `diagnostics` module: `Diagnostic`/`Span`/`Severity` types, `offsetToLineCol()`, and
  `formatDiagnostic()` which renders a zero-dependency, caret-framed source snippet.
- Tokens now carry `start`/`end` byte offsets; the lexer collects every lexical error.
- AST element nodes carry an optional `span`.
- `arch` CLI prints framed diagnostics for every problem.
- Tests: error-recovery, span accuracy, `formatDiagnostic` snapshots, golden-SVG snapshots
  for the example plans, and `fast-check` fuzz properties (never throws, deterministic).

### Changed
- `validate()` now returns `Diagnostic[]` (was `{ errors, warnings }`).

## [0.1.0] - 2026-06-25

### Added
- Initial release of **ArchLang** — a declarative language that compiles `.arch` source to
  professional SVG floor plans.
- Compiler pipeline (lexer → parser → validate → geometry → render) in pure TypeScript with
  **zero runtime dependencies**; runs in Node and the browser.
- Public `compile(source, opts)` API returning `{ svg, errors, warnings, ast }` (errors are
  returned, never thrown), with source-keyed memoization.
- Language elements: `wall` (poché-hatched, thickness), `room` (label + computed area),
  `door` (opening + leaf + swing arc), `window` (glazing), `furniture`, `dim` (dimension
  lines), `title`; plan settings `units`, `grid` (snap), `scale`, `north`.
- Drawing features: north arrow, scale bar, title block, grid snapping, auto-assigned ids,
  XML-escaped labels.
- `arch` CLI (`compile`, `watch`) and a fully client-side web playground.
- Documentation: language reference, examples (`studio.arch`, `two-bed.arch`), and a test
  suite covering validity, determinism, grid-snap, escaping, and error/warning cases.
