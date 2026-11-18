# 35. A room's label may leave its floor, with a leader; label placement is order-free

- **Status:** Proposed (draft for review, card AL3 of the label-crowding plan,
  `docs/plans/label-crowding/`). It records ruling AL-D3 of that plan: a room label that still
  collides after `fitLabels` may leave its floor with a leader, and an ADR is required.
- **Date:** 2026-11
- **Relates to:** [ADR 0032](0032-taste-separate-score.md) §4 (drafting-layer lint reads the
  sheet), [ADR 0022](0022-exact-decisions-and-bounded-input.md) (exact decisions, counted budgets),
  [ADR 0005](0005-no-invisible-architect.md) (the compiler does not choose the plan for the author)
- **Scope:** the drawing's room labels (`src/label-placement.ts`, `src/label-fit.ts`, the pass
  order in `src/scene-build.ts`), the room element's `drawCost`, and the drafting-layer rule
  `W_ANNOTATION_OVERLAP` (`src/lint/rules/annotations.ts`) with its catalogue text. No language
  change. `describe()`, Plan JSON and every validity-layer lint rule are unchanged.

## Context

A room's name and area figure are placed by four passes: `wrapLabels` breaks a name too wide for
one line, `relocateLabels` slides the label off what is drawn under it, `fitLabels` shrinks what
still does not fit (down to the furniture-label size), and a last step moves a redrawn label off a
piece's own label. Until now every one of them kept the label on its own floor
(`label-placement.ts`: "never moves further off its own floor than its anchor stands"). So a label
in a room too small or too full for it stays where it is, overprints a symbol, a wall or a door
swing, and `W_ANNOTATION_OVERLAP` reports it with the hint that "the drawing does not draw a
leader".

On `main` (287e19f8) the corpus (379 `.arch` files and 355 Markdown fences) has 101
`W_ANNOTATION_OVERLAP` reports: 27 on labels the author pinned, 2 on `dims auto` figures, and 72
where the placer found no clear place, in 8 files. 61 of those 72 are in two lint run-time
fixtures, `test/fixtures/chain30.arch` and `test/fixtures/star30.arch`, which have no `paper`, so
their lettering is sized from a 90 m drawing: the smallest name is 1.5 m tall, taller than half of
any of their floors. The other 11 are in 6 files, the label-crowding witness among them. A
downstream application measured 6.2 % of about 550 AI-written plans with this report, most of it
on room names and area figures.

`relocateLabels` also visits the labels in element order, and each placed label is an obstacle for
the next. The same rooms written in another order can therefore draw differently. The corpus has
five such plans, excused by an owner-approved list (`ORDER_EXCUSED`, `test/label-fit.test.ts`).
On 117 generated strip plans with the room statements shuffled, 16 drew differently.

Drafting convention moves a label that has no room in its space to clear space nearby and draws a
leader back to the space, ending in a dot inside it (a leader into an area ends in a dot, one to an
object in an arrow). That convention is cited here from memory, not from a standard's text.

## Decision

### 1. When a label leaves its floor

Only a label that every earlier pass has failed to clear. After `fitLabels` and its last step, a
named, unpinned room's label is a candidate when, at its final form and place, its name or area
figure stands more than `COLLIDE_MIN` (2 %) of its box over a symbol, a wall, a door swing, a
piece's own label, or off its floor. That is the test `W_ANNOTATION_OVERLAP` reports on, read with
the same boxes. A label that fits is never moved. A label the author pinned with
`label "…" at (x,y)` is never moved. An `outdoor` surface's label and an unnamed room's area figure
are not candidates.

The symbol test reads a text at the wider of its estimated width and its ink width, in `fitLabels`
and in the rule alike. Today it reads the estimate alone, which is narrower than the ink for a
short name of wide letters ("WC": 1.24 em estimated, 1.67 em of ink), so a "WC" printed over a
basin is neither moved nor reported.

### 2. Where it may go

The label goes to a point of a square lattice centred on the room's anchor (`roomLabelAnchor`, from
the shape). The pitch is the drawing's room-name size. The reach is the room's larger extent in
pitches plus two, at most 16. Points are ranked by an integer key, never by a measured distance:
`i² + j²`, then `max(|i|, |j|)`, then `j`, then `i`.

- **On a room's floor on the same storey, inside the building only.** Points on the room's own
  floor come first by rank and draw no leader (a finer search than `fitLabels`' 7 × 7 lattice).
  The others draw a leader. Nothing is placed outside the building, in the dimension bands or on
  an `outdoor` surface: a label there would grow the page, and the page size feeds
  `describe().sheet`, which a drawing change may not move.
- **Clear by the rule's own test, on the floor it lands on.** Both texts lie on that floor (no more
  than 2 % off it) and over no symbol, wall, door swing, label, opening tag, `dims auto` figure or
  piece label.
- **Sizes and forms.** The heights `fitLabels` steps through are tried largest first. At each
  height the one-line name is tried first, then its wrapped forms. The first form with a place
  that keeps the walls' clearance wins at its first such point. Failing that, the first form and
  point with the best tier win.
- **The leader** is one straight line from the edge of the label's box (grown by a quarter of its
  height) toward the anchor, ending in a filled dot at the anchor. It is drawn on the `labels`
  pass in the room label's ink with the thin pen. It may cross the walls between the two floors.
  It never crosses a third room's floor, a text or another leader. A leader that crosses a door
  swing or a symbol (other than one under its own dot) ranks below one that crosses neither.
- **No place, no change.** A label with no acceptable point keeps the form and place `fitLabels`
  gave it, and the rule reports it as today.

### 3. Order-free placement

`relocateLabels` visits the label groups in an order read off the plan: the anchor's y, then its x,
then the name, the area figure and the ring. That is the order `fitLabels` already uses
(`placeOrder`), extended by the ring. A room's label that stands off its own floor where it is drawn
(one `fitLabels` will shrink or wrap) claims no floor during the relocation, so a neighbour does not
dodge a box that is about to change. That is `fitLabels`' rule ("a label that may yet shrink or
move claims no floor"). The leader step goes in the same order. All the labels it will move are
read first and claim no floor until their turn.

What is left is order-free up to exact ties: two rooms with the same anchor, texts and ring are
told apart only by element order. Neither the corpus nor the generated plans has such a pair.

### 4. What it never does

- It never moves a label that fits, or a pinned label.
- It never places a label outside the building or off a room floor of the same storey.
- It never draws a leader through a third room, over a text, or across another leader.
- It never shrinks a label below the furniture-label size (ruling AL-D2 stands).
- It never changes `describe()`, Plan JSON or a validity-layer lint rule. It never runs in
  `describe()` or `lint()`: the rule reads the Scene `toScene` drew.
- It adds no syntax. A future opt-out (for example a `labels inside` setting) waits for PS7.9 and
  would need its own byte-identity law.

### 5. Bounds

The leader step spends the storey's `fitWork` share of `MAX_FIT_WORK` that `fitLabels` left, one
unit per mark visited and per ring vertex read, charged before the read. The `dims auto` thickness
re-station (card AL5) then spends what is left after the leader step. Past the count the step stops,
and the labels not yet visited keep their place. Each room may draw two more primitives (the line
and the dot), so the room's `drawCost` rises from 3 (4 with a floor finish) to 5 (6). Everything the
step draws lies on the floors of the storey's rooms, so it is inside the drawing's extent and
`MODEL_RANGE_MM`. A leader is at most √2 × 16 pitches long.

### 6. What `describe()` and `lint()` see

`describe()` sees nothing. `lint()` changes only in the drafting layer, as ADR 0032 §4 and
`docs/agents/iron-laws.md` allow a drawing change to. `W_ANNOTATION_OVERLAP` judges a led label on
the floor it stands on: over that floor's symbols, walls and swings, and off that floor. A label at
the end of a leader is resolved and does not "run out of the room". The rule learns which floor a
label was led to from data kept beside the Scene (as `drawnAutoDims` is), never by matching
coordinates. Its catalogue text and its hint stop saying that the drawing draws no leader. Each PR
lists the corpus plans whose drafting lint moves and proves that nothing else moved.

## Consequences

Measured on a scratch prototype against `main` 287e19f8, over the same corpus (no production code):

- **Leaders.** 72 labels are candidates, in 8 files. 9 get a leader, in 6 files. 1 is placed on its
  own floor without a leader. 62 have no place: the 61 of `chain30` and `star30`, whose smallest
  lettering fits no floor in the building, and one stair label in
  `2026-10-26-rerun-row6/5-townhouse.arch`.
- **The rule.** `W_ANNOTATION_OVERLAP` falls from 101 to 91 reports. Only that code moves: its
  reports go from 2 to 0 in `test/fixtures/dense-office.arch`, from 2 to 0 in `1-apartment.arch`,
  `2026-10-24-rerun/2-house.arch` and `2026-10-24-rerun/5-townhouse.arch`, from 1 to 0 in
  `2026-10-27-rerun-arm1/5-townhouse.arch`, and from 2 to 1 in
  `2026-10-26-rerun-row6/5-townhouse.arch`. The plan estimated about 70 fewer; the difference is
  the two no-`paper` fixtures. The shipped examples stay free of warnings and their drawings do
  not change.
- **Order.** The `ORDER_EXCUSED` list falls from five plans to none, and the label-wrap knock-on list
  from four names to two ("Meeting B" and "Store / IT" in the witness: a wrapped neighbour that
  fits does claim its floor). The plans whose drawing moves for this alone are `chain30`, `star30`
  and `2026-10-26-walls-first/6-clinic.arch`. In `chain30` and `star30` 34 report messages change
  wording (fewer door swings listed); their count does not change.
- **Ink width.** Reading symbols at the ink width moves one corpus drawing: `dense-office`'s "WC 1"
  and "WC 2", which now draw on one line beside the basin. No lint line moves for it.
- **Cost.** The corpus's largest leader step is 258,000 units (3 % of the count). A generated
  14 × 14 grid of 1.5 m rooms, every label a candidate, spends 3.9 million and takes the compile
  from 0.23 s to 1.1 s.
- A drawing can now carry a label on another room's floor. A reader follows the leader. A crowded
  neighbour can take several such labels, and a leader may cross the room's door swing when no
  other route is clear.
