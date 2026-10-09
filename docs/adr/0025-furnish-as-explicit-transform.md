# 25. Furnishing a room is an explicit source transform

- **Status:** Accepted
- **Date:** 2026-10
- **Supersedes in part:** [ADR 0005](0005-no-invisible-architect.md), the words "auto-furnish"
  in its list of what the core may not do. Everything else in ADR 0005 still binds.
- **Relates to:** [ADR 0006](0006-solver-as-explicit-transform.md) (an arranger exists only as
  an explicit command that returns new source and a change log),
  [ADR 0024](0024-finish-as-explicit-transform.md) (`finish` and its stages)
- **Scope:** the `furnish` stage of `finish()` / `arch finish`. No language syntax, no change to
  `compile()`, `describe()` or `lint()`, no new fixture category and no new symbol.

## Context

ADR 0005 lists "auto-furnish" among the things ArchLang never does. The reason it gave still
holds for `compile()`: a compiler that puts a bed in a room the source left empty draws
something the source does not say.

A plan with empty rooms is still an incomplete drawing. Plans written by models from the public
spec routinely leave habitable rooms with no furniture at all. The models know the `furniture`
statement. What is missing is a step that fills the rooms they skipped.

ADR 0006 already says where such a step may live: an explicit, opt-in command whose output is
new `.arch` source and a change log, never inside `compile()`. ADR 0024 built that command for
the sheet and left room for a second stage.

## Decision

**1. Furnishing is allowed as an explicit transform, and only there.** `finish` gains a
`furnish` stage. `compile()` still renders exactly what is written: it never adds, moves or
sizes a piece. That clause of ADR 0005 is unchanged for the compiler; it no longer forbids the
transform.

**2. The stage fills only empty rooms.** A room that holds any furniture or fixture is not
touched. No authored piece is moved, resized or deleted. A plan whose rooms are all furnished
comes back byte-identical.

**3. The room's use is the public one.** It comes from `roomUses()` (`src/analyze.ts`): the
authored `uses`, else the label vocabulary. The stage does not read the intent channel's
concepts or anything under `eval/`. A room with several uses gets the union of their pieces,
use by use: the uses with a wall run first, so the run gets a whole wall before a free-standing
piece claims it, then the use with the larger required footprint. A room whose use is unknown,
or is circulation, storage, a garage or `utility`, is left alone and is not reported.

**4. What goes in a room is a small public table.** `FURNISH_TABLE` (`src/furnish.ts`) is keyed
by use and holds only words `src/fixtures-catalog.ts` already has. The wet-room and kitchen
rows are admitted through the catalogue's own zones. Each piece is required or optional. The
catalogue is not changed: a services fixture uses its catalogued footprint, and a free-standing
piece gets an explicit `size` from the stage's table. `docs/furniture.md` prints the table and
a test holds the two together.

The table describes the rooms of a dwelling. `utility` has no row: the tag does not say
laundry, and a plant room carries it too. A room larger than 100 m² is not a dwelling room
whatever its tag says; it is reported in `unresolved` and left as it is.

**5. Placement uses the language's relative forms.** A services fixture is written
`against wall <id> offset <mm> side <left|right> in <room>`. A free-standing piece is written
`in <room> anchor <point> flush [inset <mm>] size WxH rotate <deg>`. The stage never writes
`at (x,y)`. When the wall behind a fixture has no id a statement can name, the fixture is
written in the anchored form instead.

A use's wall run is one unbroken row. The stove stands next to the sink and the fridge next to
the stove, on the same wall, and the sink is placed only where the stove can follow. Only
`against wall … offset` can say "next to it", so a kitchen whose walls have no id is not given
a run. When a use's required pieces cannot be placed together, that use is left out whole and
reported; its pieces are never scattered round the other uses.

**6. The candidate order is fixed and the work is bounded.** Walls are tried in the order: no
door, then no window, then longest, then top, right, bottom, left. On a wall the corners come
before the middle; a sofa and a desk try the middle of every wall before any corner. A position
under a window comes after every position that is not, and a piece in a corner counts the
windows of both walls it touches. A larger footprint is tried before a smaller one. A candidate
is dropped before any compile when it leaves the room's clear floor, crosses a door's approach
or swing, or overlaps a piece already proposed or the floor kept clear in front of one. The
door clearances are the largest any lint profile asks for. There is no search loop and no randomness. One run makes at most `1 + 13 × rooms`
compile checks.

**7. Never worse, room by room.** A room's pieces are kept only when the plan with them
compiles and raises no diagnostic code (compile and lint, counted) and no furniture conflict
that it did not have before that room. Lint is counted under the default ruleset and under
every named profile in `LINT_PROFILES`, so the law holds whichever profile the reader lints
with. If the first proposal is refused, the pieces are placed one at a time, each on its next
candidate. If a required piece cannot be placed, its use is left out; when no use is left, the
room is left empty. Both are reported in `unresolved` with the blocking code. An optional
piece that cannot be placed is left out.

**8. This version furnishes rectangular rooms of single-storey plans.** A polygon or circular
room, and every empty room of a plan with `level` blocks, is reported in `unresolved` and left
as it is. A polygon room is not approximated by its bounding box or by a rectangle inscribed in
it: a derived position comes from the shape. A room with no `id=` of its own, or one inside a
placed component instance, is reported too, because no statement in the plan body can name it.

A room placed relationally (`right-of`, `below`, …) has no fixed `at` to anchor in:
`in <room> anchor` is `E_PLACE_REF` there. `against wall` does work, so such a room is
furnished when every required piece of its uses is a wall fixture (a kitchen, a bathroom, a
WC), with the wall fixtures only. A relational room that needs an anchored piece (a bed, a
sofa, a table, a desk) is reported with that reason and left empty. This is decided before any
compile check.

**9. The edits are one insertion.** The statements go after the last `furniture` statement of
the plan body, or after its last room, wall, door, window or opening. They are never written
inside a `for`, an `if`, a `zone`, a `level` or a component body. They go through the `Data`
piece table, so every authored byte and comment survives.

**10. A full run furnishes first.** `finish` with no `--only` runs `furnish`, then `sheet`,
because the legend lists the furniture. Each stage is then run once more on the result; a
result a stage would edit again is not returned, and the source comes back untouched.
`--only furnish` and `--only sheet` run one stage.

**11. Laws, each pinned by test** (`test/finish-furnish.test.ts`, `test/finish.test.ts`,
`test/fuzz.test.ts`):

| Law | Statement |
|---|---|
| Fixpoint | a second run changes nothing |
| Never worse | no compile error, no new diagnostic code under any lint profile, no new furniture conflict |
| Run | a use's wall fixtures sit on one wall, each touching the next |
| Fill only | a furnished room is untouched; an all-furnished plan is a byte no-op |
| Pure insertion | the result is the source with one run of statements inserted |
| Relative | every statement written is `against wall` or `in <room> anchor`, never `at (x,y)` |
| Bounded | the compile checks of a run do not exceed `1 + 13 × rooms` |
| Untouched | a source that does not compile is returned byte-identical |
| Order | a full run writes the furniture before the sheet |
| No core path moved | SVG, `describe()` and `lint()` of every example are the pinned ones |

## Why this does not reopen ADR 0005

ADR 0005 protects two things: the determinism of `compile()`, and the honesty of what a drawing
claims. Neither is given up.

`compile()` is not changed. A source nobody runs `finish` on renders as it did, so no
byte-identity baseline moves. The choice the stage makes is written into the source as ordinary
statements. The author reads the diff, and from then on the plan states its own furniture.

The stage does not claim a good layout. It claims a complete drawing that is no worse by the
compiler's own checks than the one it was given. Where it cannot keep that claim for a room, it
leaves the room empty and says why.

## Consequences

- An agent gets a furnished, sheeted drawing from one command, after lint is clean.
- The pieces are conventional, not designed. An author who wants a different arrangement edits
  the statements or furnishes the room first; a furnished room is never revisited.
- A multi-storey plan and a polygon room get no furniture from this stage. Both are reported.
- A relational room gets wall fixtures only, and none when its use needs an anchored piece.
- The table is public data. Adding a use or a piece is an edit to `FURNISH_TABLE` and to the
  table in `docs/furniture.md`, which a test compares.

## Provenance

A fit-out pass over generated plans exists in ArchCanvas, a closed product by the same owner.
This is an independent implementation under the MIT licence, written against ArchLang's own
catalogue and placement forms. No code was copied. It does not replace authored furniture, has
no inscribed-rectangle path for polygon rooms, and has no absolute-coordinate fallback.
