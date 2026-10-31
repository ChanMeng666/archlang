# G10: quarter-turn and half-turn stairs (issue #362)

A written design, card G10 of `cards.md`. Nothing here is built. Measured on `main@4b42ceea`, which is
core 1.47.0. File references are to that commit. Probes are in
`D:\.claude-scratch\2026-10-31\g10\p362\`. Unlike the L-room design, no prototype was built: the
claims about the future form below are designed from the code, not run.

**Decision.** One `stair` made of ordered rectangular pieces, the issue's step 1: a new block form of
`stair`, with flights and landings, where order is climbing order and each flight's direction comes
from what it touches. Straight stairs are untouched. Shortcuts (`shape quarter-turn`) and winders are not
in this round. The issue's lint rule changes: a landing replaces one going (§3 item 1).

## 1. The need and its reproduction

A straight flight for a 2.6–2.8 m storey takes more floor than a compact house has, so German houses
use L and U stairs, often with winders. The user's agents draw these today as two stairs. Lint then
judges each flight against the whole storey. Run against 1.47.0:

| Plan | Result on 1.47.0 |
|---|---|
| The issue's quarter-turn, `height 2750` | `W_STAIR_TOO_STEEP` ×2 (1640 and 1240 mm short), as filed |
| The same, `describe --facts clearances` | Two stairs, `run_mm` 1000 and 1400, each `min_run_mm` 2640, as filed |
| The same without `height` | No stair warning, as filed |
| `arch explain W_STAIR_TOO_STEEP` | Still advises "two flights with a landing between", as does the hint at `src/lint/rules/stairs.ts:793` |

1.47.0 adds one unrelated warning on that plan (`W_ANNOTATION_OVERLAP`, from #367's fix): the label sits
under the door swing.

The advice loops: following it gives the same warning twice. Until the form ships that sentence promises
something the language cannot do.

## 2. What the language can do today

A `stair` is one rectangle (`src/elements/stair.ts:53-56`), its flight along the long side
(`flightAxis`, `src/vertical.ts:66`), entered at a fixed end (`tailEdge`, `:112`). Measured limits:

- **The second flight of a U cannot be drawn at the root.** Two portrait flights side by side both
  print UP at the same end: both enter from the bottom, so the second flight's arrow points the wrong
  way. `dir down` would print DN. `place … mirror y` reaches the other end (#370).
- **A run along the short side cannot be said.** `size 1000x840` compiles and reads as a flight
  along the 1000, which is the wrong axis for three steps 1000 wide.
- **Two flights cannot share an id on one storey** (`E_DUP_ID`), and a shaft is identity by id, so
  a faked stair is two shafts: `describe` reports two connections.
- **`width` narrower than the footprint** leaves an undrawn return (`src/elements/vertical-glyphs.ts:179-183`,
  "v1 draws a single straight flight"). No corpus plan uses it: 50 stairs in 32 files, all straight, none
  narrower, none square, 10 with an authored height.
- **Plan JSON has no stair** (`src/plan-json.ts:2143`). `compile -f json` now says so (#366).

## 3. Where the issue is wrong against the code

1. **"The run for `W_STAIR_TOO_STEEP` is the sum of the flights" is one going short per landing.**
   `minimumRun` needs `n − 1` goings because the top step is the floor above
   (`src/lint/rules/stairs.ts:742`). Each flight ends the same way, on its landing. So two flights have
   `(k − 1) + (n − k − 1) = n − 2` goings: **`n − 1 − L` for `L` landings**. At 2750 mm, default limits, one
   landing: 11 × 220 = 2420, not 2640. Under `uk-residential-advisory`, 11 × 234.9 ≈ 2584, not 2819. The
   rule as the issue states it would over-warn on a correct stair.
2. **The issue's example would still warn, correctly.** Its flights sum to 2400, 20 mm short of 2420.
   Its second flight also ends at x 100, against the wall at x 0: on the storey above, the faked plan gets
   `W_STAIR_NO_LANDING` at the head, 1000 mm short. The form would keep that warning.
3. **"A multi-storey shaft id works as today" hides real work.** Three readers assume one rectangle:
   `W_SHAFT_FOOTPRINT_MISMATCH` (`src/lint/rules/vertical.ts:93-106`), the head of a flight from below
   (`landingsOf`, `src/lint/rules/stairs.ts:148-153`) and the arrival edge (`arrivalEdges`,
   `src/vertical.ts:568`). The id semantics hold; those three change (§5).
4. **"One cut line" cannot be placed where a drafter would put it.** The cut falls at a fixed height
   above the floor, which depends on the riser, so reading it would make a height draw. That is a
   hard limit. §4.3 places it by geometry alone.
5. **`at`/`size` readers.** The issue does not mention them. A turning stair's bounding box contains
   floor that is not stair: in its example, the notch at x 100–1500, y 1100–2100 is where the hall is
   walked. Reading the box for circulation breaks an iron law and blocks that floor.

The card's description has nothing to correct.

## 4. The design

### 4.1 Syntax

```arch static
stair id=s dir up width 1000 {
  flight at (1500,1100) size 1000x1000
  landing at (1500,100) size 1000x1000
  flight at (100,100) size 1400x1000
}
```

Written as the issue proposes it. A half-turn is the same with the second flight beside the first. A
straight stair with a mid landing is the same with the pieces in line, which is what makes the
`W_STAIR_TOO_STEEP` advice true.

Rules, each a refusal under a new `E_STAIR_PIECES` unless noted:

- Pieces alternate, starting and ending with a `flight`, with at least two flights.
- Consecutive pieces share an edge, overlapping at least `width`, and no two pieces overlap in area.
  Non-consecutive pieces may touch (a U with no well).
- `width` is required on the block and is the flight width. It may not exceed a flight's extent across
  its travel (`E_STAIR_WIDTH`). A landing wider or longer than the flight is legal: it is a footprint.
- `E_RUN_TOO_LONG` per flight. Pieces are charged to the step meter before allocating, and `drawCost` is
  the sum over them.

**Direction comes from touching, never from the long side.** A flight travels perpendicular to the edge
it shares with its neighbour, toward the next piece. That settles the square first flight in the
issue's own example and a short-axis flight, and it needs no `entry` word. It is arithmetic on what the
author wrote (ADR 0004).

**Order is climbing order on every storey.** The author copies the block between storeys and changes only
`dir`: `dir up` boards the first flight's foot, `dir down` boards the last flight's head.

`flight` and `landing` are recognised only inside the block. Keywords are read at parse time and every
word lexes as an `ident` (`src/grammar/tokens.ts:13`), so `room id=landing`, which `examples/two-storey.arch`
has, is safe, provided neither joins `STATEMENT_STARTS`. The block branch is `dir` straight after the
id, today an `E_PARSE` at `src/elements/stair.ts:53`.

### 4.2 Resolved form

`RStair` keeps `at` and `size`, now the union box, and gains optional `flights` (each with its rectangle
and tail side) and `landings`. Absent on a straight stair, which is what makes the law cheap. A single
helper, `flightsOf(v)`, returns one flight for a straight stair, so readers have one path. `runFrame`
already reads its axis from `_tail` (`vertical-glyphs.ts:61-80`, through `runAxis`), so a flight record
works there, short-axis runs included.

### 4.3 Drawing

Each flight draws as today: treads through `runFrame`, at the nominal going. Each landing draws its
footprint with no treads. One walking line runs through every piece's centreline to one arrowhead,
with one UP or DN in the boarded flight's first tread cell. One break line sits at mid-run of the
flight holding the walking line's midpoint, or of the flight before it if that midpoint is on a landing.
Fixed fractions of authored geometry, so no height enters the drawing.

## 5. Consequences

| Surface | Consequence |
|---|---|
| Resolver | §4.1–4.2. `place`: each piece through `t.rect`, each tail through `t.side`, as `stair.transform` does (`src/elements/stair.ts:120`) |
| Circulation | One obstacle per piece, `open` only on the boarded end. `verticalObstacles` (`src/vertical.ts:158`) goes from `map` to `flatMap`. **`withArrivalEdges` pairs obstacles with verticals by position** (`src/analyze/circulation.ts:1301`), so it must change with it. `landingCells`, `runWidth` and `entryMidpoint` read the run's rectangle and take the flight |
| Room of a stair | `roomOfVertical` (`src/vertical.ts:186`) tests the box centre, which can be off the stair. It reads the boarded flight, so a stair spanning two rooms belongs to where you step on |
| Lint, too steep | `runLength` sums flights; `minimumRun` takes `L` (§3 item 1). The message says "11 goings and a landing" |
| Lint, landings | Foot on the first flight, head on the last, through the existing `Landing.rect` and `edge`. A landing shorter than `width` along the walking line reports `W_STAIR_NO_LANDING`, with a new `end: "turn"` |
| Lint, others | `W_SWING_OVER_STAIR`, `W_STAIR_SIDE_ENTRY`, `W_FURNITURE_ON_STAIR` read per piece. `lowPart`'s `reach` becomes a walk along the flights, rise spread over flights only, landings level (a landing at half a storey has under 2 m beneath it, so all of it stands in the way) |
| Shaft | Mismatch compares pieces: same block on both stops. `landingsOf` and `arrivalEdges` read the lower stop's last flight, and `ArrivingRun` carries that flight's rectangle |
| `describe` | `bbox` stays, the union. Additive, on this form only: `flights[]`, `landings[]`, `turn` (`left`, `right`, `half`, `none`). `clearances.stairs[]`: `run_mm` is the sum, `min_run_mm` allows for landings, plus `landings[].end: "turn"`. Symmetry reads each piece, or a mirrored stair reads as unhanded |
| Plan JSON | No change. It has no stair, and `dropped` reports this one (#366) |
| DXF, PDF | Through the Scene on `A-FLOR-STRS` (`STAIR_LAYER`). No new layer. U.13's blocks are not affected |
| `finish` | Furnish keeps off every piece through `stairZones` (`src/furnish.ts:343`). It needs nothing of its own once the zones are per piece. `W_FURNITURE_ON_STAIR` stays in step, because they share that function |
| `takeoff` | No stair figures today, none added |
| Tooling | Must branch where `at` is assumed: `src/cursor.ts:139`, `src/statement-print.ts:265`, `src/keep.ts:1531` (`keep stacked`, on the box until asked), plus `ElementDef.params`, grammars and `gen:*`. `at` becoming optional on `StairNode` makes the type checker find the rest |
| 3D | `packages/archlang-3d` omits stairs (`src/mesh/build.ts:586`, ledger `m1-omits-stairs-outdoor-fences`), and `stairOf` reads the box, which stays valid. Additive `RStair` fields fit ADR 0031. Nothing in the core |

`void` is rectangular, so an L stairwell upstairs is two abutting voids. `holeCover` already accepts several
covers (`src/room-tiling.ts:799`), and #370's L-shaped void is a separate ask.

## 6. The byte-identity law

A plan with no block stair resolves, draws, describes and lints exactly as before, diagnostics included:
SHA-256 of SVG + `describe()` + `lint()` + `compile().diagnostics` with the test's own digest body. It
is reachable by construction, since every new field is absent and `flightsOf` returns the old values, but
that is an argument, not a measurement. The sweep method that discriminated on the L-room spike (a
real mutation moved 33 files) is the one to reuse. The changed `minimumRun` with `L = 0` must return
identical figures: pinned on its own.

Further laws: a straight-in-line block with one landing agrees with a straight flight on foot and
head facts; each block stair under all eight frames through the D4 oracle (`test/d4-oracle.ts`), which
reports a new fact `NEW` rather than passing it silently. The `W_STAIR_TOO_STEEP` hint changes for all
stairs if reworded: that is the sanctioned third class of moved digest (`test/byte-identity-baseline.ts`), so
reword it only when the form ships.

## 7. Hard limits

No dependency, no raster. Heights do not draw: §3 item 4 is the one place this design had to give way,
and treads stay at the nominal going whatever `height` says. 3D stays in its package. IFC: no field exists
for its sake and none is promised. Drawing changes do not move `describe()` or `lint()` on existing plans,
because the drawing changes only for the new form. On a new-form plan the drafting-layer rules
(`W_ANNOTATION_OVERLAP`) read the new symbol, which is their job. Lint carries no compliance claim: figures
stay as the profiles state them.

## 8. Alternatives rejected

- **`shape quarter-turn left` first.** Shorter, but it needs a start corner and a fill rule, and it
  cannot express what a catalogue plan measures (a long first flight, a wide landing). It expands to the
  block, so it can follow on a second ask.
- **Two stairs plus a link clause (`continues f1`).** Keeps two ids for one shaft, two labels, and
  every rule reads pairs.
- **A polyline walking line with widths.** Compact, but landings and flights stop being authored
  footprints, and treads need a layout rule. The compiler would be choosing.
- **Direction by an explicit word on each flight.** Redundant with touching, and a second way to be
  wrong. Refuse by geometry instead.
- **Keeping the box for circulation.** §3 item 5.
- **A riser count on the block.** Would let a flight be exact, but it is a new authored fact and nothing
  asks for it. Treads stay nominal, as for a straight stair.

## 9. Risks

- **The positional pairing at `circulation.ts:1301`.** A `flatMap` compiles and pairs the wrong
  obstacles. S1 tests it with a two-storey arrival on a block stair.
- **Every reader of `v.size`.** About 30 sites touch a vertical's footprint across lint, `describe`, keep and
  glyphs. The box keeps them compiling, so a missed reader fails quietly by being conservative. S1
  greps them (the iron law's grep) and lists each one's verdict in the PR.
- **Handedness.** A turn direction is a real fact, and the glyph-chirality law must not read it as a
  defect. It comes from carried geometry, not from a glyph. Checked in S1.
- **`spec.llm.md` at its cap.** The form costs a few lines there and must be paid for by provable cuts.
- **The user's plans have winders.** This round draws them as landings, so a plan with winders still
  misstates its going. Lint then errs on the strict side: a winder stair reads short of goings.

## 10. Slices

Sizes are AI-assisted days, ±50 %. **S1–S3 must share a release**: the form may not ship drawing right
and linting wrong, which is the state the user reported.

| Card | Scope | Size | Must not |
|---|---|---|---|
| S1 | Grammar, resolve, `E_STAIR_PIECES`, `flightsOf`, every footprint reader, drawing, byte law, `place` | 2 | change a straight stair |
| S2 | `minimumRun` with `L`, too steep, foot and head, `clearances`, `describe` fields, new example | 1 | draw from a height |
| S3 | Shaft mismatch, `landingsOf`, `arrivalEdges`, two-storey fixtures | 1 | infer a shaft from geometry |
| S4 | The `turn` landing check, swing and side-entry per piece, catalogue and spec text, the hint | 1 | claim compliance |

Total about 5 days. Later, each on a second ask: `shape` shortcuts, winders, a straight-flight `entry`
clause (`src/vertical.ts:109` reserves it).

## 11. Open questions for the owner

1. **Winders.** The user says catalogue plans often have them. This design defers them because a
   tapered step needs a going measured on the walking line, and a non-rectangular piece. Is drawing a
   landing acceptable for now? If not, S5 is about 2 days and needs a decision on step geometry.
2. **A German profile.** The rules have UK, US and CN profiles, and no `de-residential-advisory`. DIN 18065
   was not checked here. Worth a separate card, sourced as the others are?
3. **`entry` on a straight flight.** One clause would close #370's first bullet and is independent of
   this work. In or out of this round? This design says out.
4. **The advice in `explain`.** Until S4 lands, "two flights with a landing" points at a loop. Reword it
   now (it moves a catalogue text and the hint's digests) or wait?
