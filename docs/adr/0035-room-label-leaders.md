# 35. A room's label may leave its floor, with a leader; label placement is order-free

- **Status:** Accepted 2026-11-19. It records ruling AL-D3 of the label-crowding plan
  (`docs/plans/label-crowding/`): a room label that still collides after `fitLabels` may leave its
  floor with a leader, and an ADR is required. The coordinator ruled on the design's open questions
  the same day (the rulings are folded in below). Built in three PRs: card AL3w (#962, the width a
  room's text is read at against a symbol), card AL3a (order-free relocation) and card AL3b (the
  leaders).
- **Date:** 2026-11
- **Relates to:** [ADR 0032](0032-taste-separate-score.md) §4 (drafting-layer lint reads the
  sheet), [ADR 0022](0022-exact-decisions-and-bounded-input.md) (exact decisions, counted budgets),
  [ADR 0005](0005-no-invisible-architect.md) (the compiler does not choose the plan for the author)
- **Scope:** the drawing's room labels (`src/label-placement.ts`, `src/label-fit.ts`, the pass
  order in `src/scene-build.ts`), the room element's `drawCost`, and the drafting-layer rule
  `W_ANNOTATION_OVERLAP` (`src/lint/rules/annotations.ts`) with its catalogue text. No language
  change. `describe()`, Plan JSON and every validity-layer lint rule are unchanged.

## Context

A room's name and area figure are placed by four passes:
- `wrapLabels` breaks a name too wide for one line;
- `relocateLabels` slides the label off what is drawn under it;
- `fitLabels` shrinks what still does not fit, down to the furniture-label size;
- a last step moves a redrawn label off a piece's own label.

Until now every one of them kept the label on its own floor. A label in a room too small or too full for it stayed where it was, overprinting a symbol, a wall or a door swing. `W_ANNOTATION_OVERLAP` reported it, with the hint that "the drawing does not draw a leader".

On `main` (287e19f8) the corpus has 101 `W_ANNOTATION_OVERLAP` reports. The corpus is 379 `.arch` files and 355 Markdown fences. The reports split three ways:
- 27 on labels the author pinned;
- 2 on `dims auto` figures;
- 72 where the placer found no clear place, in 8 files.

61 of those 72 are in two lint run-time fixtures, `test/fixtures/chain30.arch` and `test/fixtures/star30.arch`. **No leader can help them.** They have no `paper`, so their lettering is sized from a 90 m drawing: the smallest name is 1.5 m tall, which no 3 m room or corridor of theirs can hold, and the only floor that could is outside the building. A downstream application measured 6.2 % of about 550 AI-written plans with this report, most of it on room names and area figures.

`relocateLabels` also visited the labels in element order, and each placed label is an obstacle for the next. The same rooms written in another order could therefore draw differently. Five corpus plans did, excused by an owner-approved list (`ORDER_EXCUSED`, `test/label-fit.test.ts`), and so did 16 of 117 generated strip plans with shuffled room statements.

Drafting convention moves a label that has no room in its space to clear space nearby and draws a leader back to the space, ending in a dot inside it. That convention is cited here from memory, not from a standard's text.

## Decision

### 1. When a label leaves its floor

Only a label every earlier pass has failed to clear. After `fitLabels` and its last step, a named, unpinned room's label is a candidate when, at its final form and place, its name or area figure stands more than `COLLIDE_MIN` (2 %) of its box:
- over a symbol, a wall, a door swing or a piece's own label;
- or off its floor.

That is the test `W_ANNOTATION_OVERLAP` reports on, read with the same boxes at no clearance. A label that fits is never moved. A label the author pinned with `label "…" at (x,y)` is never moved. An `outdoor` surface's label and an unnamed room's area figure are not candidates.

Card AL3w made the symbol test read a room's text at the wider of its estimated width and the width it draws, in `fitLabels` and in the rule alike (`symbolExtent`). The estimate is narrower than the ink for a short name of wide letters ("WC": 1.24 em estimated, 1.67 em of ink), so a "WC" printed over a basin was neither moved nor reported.

### 2. Where it may go

The label is placed once more, at a point of a square lattice centred on the room's anchor (`roomLabelAnchor`, from the shape):
- **Pitch:** the drawing's room-name size.
- **Reach:** the room's larger extent in pitches, plus two, at most 16.
- **Ranking:** a whole-number key, never a measured distance: `i² + j²`, then `max(|i|, |j|)`, then a host room of `uses circulation` before any other, then `j`, then `i`.

Where a place may be:
- **On a room's floor on the same storey, inside the building only.** Places on the room's own floor take their turn by the same key and draw no leader: a finer search than `fitLabels`' 7 × 7 lattice. They do not leave the floor, so they are within AL-D3. The others draw a leader.
- **Never anywhere else.** Not outside the building, in the dimension bands or on an `outdoor` surface: a label there would grow the page, and the page size feeds `describe().sheet`, which a drawing change may not move.
- **Clear by the rule's own test, on the floor it lands on.** Both texts lie on that floor (no more than 2 % off it). They stand over no symbol, wall, door swing, label, opening tag, `dims auto` figure or piece label.
- **Clear of every text as it prints.** Each of the two texts, boxed at the width it prints (`symbolExtent`: the wider of the estimate and the ink), meets no other text the drawing holds when the step runs, boxed the same way (`labelBox`): no other room's label as it now stands, no tag, no figure and no piece label. It also meets no leader drawn before it. A leader's line is read against the same boxes. The fit's own reading compares a text's ink with the estimate of the text beside it. A short name of wide letters prints wider than its estimate, and an area figure prints narrower. So the two can overprint while each reads clear: on a generated strip, a led "2.2 m²" stood 57 mm over "MW".

The search:
- **Order of forms.** The heights `fitLabels` steps through are tried largest first. At each height the one-line name is tried first, then its wrapped forms.
- **Ranking places.** A place that keeps the walls' clearance beats one that does not. Either beats every place whose leader crosses a door swing or a symbol.
- **When it stops.** At the first place that keeps the clearance with a clean leader (or with no leader), or at the end of the first form that has any clean place. Failing both, the first form and place with the best rank win.

The leader:
- **Where it starts.** One straight line from the edge of the label's box, grown by a quarter of its height.
- **Where it ends.** In a filled dot on the room's own floor. The dot sits at the first place of the same lattice, ranked by the same key, whose dot is clear of every symbol, label and wall. It sits at `roomLabelAnchor` only when no place is clear (a stair room whose flight fills it).
- **How it is drawn.** On the `labels` pass, in the room label's ink, with the thin pen.
- **What it may cross.** The walls between the two floors, and a door swing (ranked last).
- **What it never crosses.** A third room's floor, a text or another leader.

**No place, no change.** A label with no acceptable place keeps the form and place `fitLabels` gave it, and the rule reports it as before.

### 3. Order-free placement

`relocateLabels` takes the label groups in an order read off the plan (`plotOrder`):
- the anchor's y, then its x (the order `fitLabels` already uses);
- then the texts;
- then the ring;
- then an authored label after a placed one.

Nothing else about the pass changed. The leader step takes its labels in the same order.

What is left is order-free up to exact ties: two rooms with the same anchor, texts and ring are told apart only by element order. Neither the corpus nor the generated plans has such a pair.

A second clause was considered and **not taken**: "a room's label that stands off its own floor claims no floor during the relocation". It would have let the label-wrap knock-on list shrink from four names to two. But on 312 generated strips it raised the unreported overprints of one room's text over another's from 103 to 127, against 99 with the shape order alone. So the knock-on list stays at four, and `ORDER_EXCUSED` is empty and gone.

### 4. What it never does

- It never moves a label that fits, or a pinned label.
- It never places a label outside the building or off a room floor of the same storey.
- It never puts the leader's dot on a symbol while the room's floor has a clear place for it.
- It never draws a leader through a third room, over a text, or across another leader.
- It never shrinks a label below the furniture-label size (ruling AL-D2 stands).
- It never changes `describe()`, Plan JSON or a validity-layer lint rule. It never runs in `describe()` or `lint()`: the rule reads the Scene `toScene` drew.
- It adds no syntax. A future opt-out (for example a `labels inside` setting) waits for PS7.9 and would need its own byte-identity law.

### 5. Bounds

The leader step counts on a count of its own, `MAX_LEADER_WORK`: 1,000,000 units per plan, shared out by storey as `fitWork` is. Units are one per mark visited and per ring or shape vertex read, charged before the read. No label may spend more than `LEADER_LABEL_WORK` (400,000) of it.
- A label that reaches its own cap keeps the place `fitLabels` gave it and is reported.
- Past the step's count the step stops, and every label not yet placed keeps its place.
- Both are counts, the same on every machine.

`fitLabels`' own count, and the share of it the `dims auto` thickness re-station (card AL5) spends after it, are as they were. The re-station keeps its figures off the leaders.

A named room whose label is not pinned may draw two more primitives (the line and the dot), so its `drawCost` rises from 3 (4 with a floor finish) to 5 (6). Only such a room can be led, so no other room is charged. The drawing budget's test of its own looseness (the estimate's primitives at most a multiple of what the corpus draws) moves from 4 to 4.25, because `examples/remodel.arch`, the loosest plan, went from 3.99 to 4.01. Everything the step draws lies on the floors of the storey's rooms, so it is inside the drawing's extent and `MODEL_RANGE_MM`.

The compile's work counters gain `labelLeaders`, the places tried. The work-count table pins it as 0 for every example: no shipped example has a label to lead.

### 6. What `describe()` and `lint()` see

`describe()` sees nothing. `lint()` changes only in the drafting layer, as ADR 0032 §4 and `docs/agents/iron-laws.md` allow a drawing change to.

`W_ANNOTATION_OVERLAP`:
- **Where a led label is judged.** On the floor it stands on: over that floor's symbols, walls and swings, and off that floor. A label at the end of a leader is resolved and does not "run out of the room".
- **How the rule knows the floor.** From data kept beside the Scene (`drawnLeaders`, as `drawnAutoDims` is), never by matching coordinates. A memoised copy of the Scene carries it.
- **Leader crossings.** A room's text or a `dims auto` number that crosses a leader is printed over it, and the AL6 detail lists it as a `leader`.
- **Messages.** No message names the floor a label was led to.
- **Catalogue.** Its text and its fix text stop saying that the drawing draws no leader.

## Consequences

Measured on the built branch against `main` b1e73f98 (AL3w and AL3a merged), over the same corpus (332 `.arch` files in the corpus folders, 101 reports on `main`, as above):

- **Labels re-placed.** 72 labels are candidates, in 8 files.
  - 8 get a leader, in 5 files: `dense-office` (Store / IT and Kitchenette / Break, into the corridor), `2026-10-24-rerun/2-house` (Dressing into the passage, Bathroom into the garage), `2026-10-24-rerun/5-townhouse` (both stairs), `2026-10-26-rerun-row6/5-townhouse` (one stair) and `2026-10-27-rerun-arm1/5-townhouse` (Bathroom).
  - 2 are placed again on their own floor, with no leader: `1-apartment`'s Bedroom 1 and Laundry.
  - 62 have no place: the 61 of `chain30` and `star30`, and one stair in `2026-10-26-rerun-row6/5-townhouse`.
- **The rule.** `W_ANNOTATION_OVERLAP` falls from 101 to 91 reports, and only that code moves.
  - The plan estimated about 70 fewer. The difference is the two no-`paper` fixtures, which no leader can help.
  - The shipped examples stay free of warnings and their drawings do not change.
  - The witness's "200" thickness figure keeps its first station, because the kitchenette's name no longer runs over it.
  - The other 187 `.arch` files in the tests' and packages' fixture folders go from 9 reports to 2: `test/keep-corpus/min-clear-joins.arch` (6 to 0: three labels led, three placed again on their own floor) and `test/finish-fixtures/agent-ux-prefinish.arch` (1 to 0, led).
- **Text over text.** On the red team's generated plans (300 a set; strips and grids, with and without fixtures), no plan clean on `main` gains an overprint of one room's text on another's. The pairs fall on every set: 8 to 4, 15 to 10, 28 to 12 and 42 to 29. Before the step read texts at the width they print, 17 plans gained one. `W_ANNOTATION_OVERLAP` does not read one room's text against another's (card AL3c), so those overprints were silent.
- **Order.**
  - `ORDER_EXCUSED` goes from five plans to none.
  - The label-wrap knock-on list stays at four (§3).
  - On generated strips with shuffled room statements, no plan draws differently.
- **Ink width.** Card AL3w moved one corpus drawing, `dense-office`'s "WC 1" and "WC 2", now on one line beside the basin, and no lint line.
- **Cost.**
  - A generated 14 × 14 grid of 1.5 m rooms, every label a candidate and none with anywhere to go, spends the step's whole count: 161,312 places tried, the same on every run. On a quiet machine its compile went from 0.11–0.13 s to 0.16–0.18 s (two rounds, median of three each), before the step read texts at the width they print. With that check, the machine was loaded: 0.14–0.24 s on `main` against 0.23–0.26 s, in the same rounds. The design's first prototype, with no count of its own, took it from 0.23 s to 1.1 s.
  - Across the corpus, the most places the step tries for one plan is 4,264 (`star30`, where it
    finds none), and 2,616 for the witness.
- **What a reader sees.** A drawing can now carry a label on another room's floor, and a reader follows the leader. A corridor can take several such labels. A leader may cross the room's door swing when no other route is clear.
