# A position on an open boundary, and a window round a corner

Issue #401, points 2 and 4. Measured on `main` at 90cee401. The plans and the probes are the
executor's scratch; everything quoted here was printed by the built core.

## 1. Reproduction

**`open between` is always centred.** Confirmed by the grammar: `parsePair` reads `open [id=]
between <A> and <B> [width <mm>]` and stops. `open between a and b at 1500 from start width 2000`
fails on `at` with `E_PARSE` (`Expected "except", "open" or "between"`), which names none of the
words the author wants.

**A corner window.** On a 6000 × 5000 room in a 200 mm ring:

- `window on a.top at 900 from a.right width 1800` and its twin on `a.right`: `E_OPENING_NIB`, "the
  exterior wall derived from the rooms stands inside its span x 4200–6000".
- The same two windows by `at (x,y) … wall e`: compile, with `W_OPENING_AT_JUNCTION` twice. The
  drawing keeps a square of wall at the outer corner: 100 × 100 mm, what is left of the junction
  block once the two cuts, which stop on the centrelines, have passed.
- The same two by `at (x,y)`, each span run out to the wall's OUTER face (`at (5200,0) width 1800`,
  `at (6000,800) width 1800`): the block is gone. `joinWalls` needed no change: two ordinary cuts
  that together cover the block leave no solid there. What stays wrong is the window's drawing:
  each cover paints over the other's lines.

So the pier is not something the joinery insists on. It is what two spans stopping short leave.

## 2. `open between`: no new clause

**Decision:** `open between` gains no position. `opening between <A> and <B> at <pos> width <mm>`
is the positioned form, it already exists, and the parser now says so.

The two forms, measured on one pair over one span (`open id=o between a and b width 2000` against
`opening id=o between a and b at center width 2000`, then again at the whole clear span):

- SVG, every wall node and `lint()`: byte-identical.
- `describe()`: only `openings[]` (the `opening` row adds `relation` and `centreline_at`) and
  `freedom` (`relational` against `absolute`). Rooms, net areas and adjacency do not move, because
  neither form touches the solid that areas are read from.
- Room merging: neither merges anything. Two rooms stay two rows either way, and ADR 0028 already
  says an author who wants no boundary writes one room.

What does differ is what the boundary is:

- A **voided boundary** (`open` with no `width`, `_derived.open.whole`): the opening fills the clear
  span. No wall stands along that line, so it is no meeting wall for a nib, and where such runs meet
  the block between them clears (ADR 0028 §3, amended).
- A **cased opening** in a partition (`opening between`, and `open … width` narrower than the span):
  a wall stands along the rest of the line. It keeps its nibs, and it can take another door.

A position only means something on the second kind: the voided boundary has no room to move in. So
a positioned `open` would be a second spelling of `opening between`, with two things worse. It would
skip `E_OPENING_NIB` (a narrow `open` is never judged for a sliver beside it) and it would close the
pair to a second door (`E_WALL_BETWEEN_OPEN`). ADR 0028's reversal condition is about a fourth clause
being needed in practice. Nothing here needs one, so the condition does not fire.

**The diagnostic.** `open … at …`, in either order with `width`, is a parse error that quotes the
statement to write, with the author's own position and width, and says the clause is removed.

- *Alternative:* a position on `open`, measured along the clear span. It would read well, and it
  costs the two things above and a second route to one drawing.
- *Reverse if:* a plan needs a run voided off-centre with `E_WALL_BETWEEN_OPEN` still closing the
  pair; or first-contact runs keep writing `open … at` after the diagnostic.

## 3. A window round a corner

### What an author writes

```text
window id=n on liv.top at corner liv.right width 1800
window id=e on liv.right at corner liv.top width 1200
```

`at corner <room>.<edge>` is a position, in the position slot, and is legal on a `window` placed
`on <room>.<edge>`. It says which end of the edge the window runs to: the end the named edge meets.
`width` runs from the free jamb to the OUTER corner of the two walls.

### Decisions

1. **Two elements, one per wall.** A window faces one way (`windows[].facing`, the intent channel's
   `windows.facing`), has one host (every reader of `.host`, and the 3D adapter), one tag and one
   width. A corner window is two of those which meet. *Alternative:* one statement with two edges
   and two widths, which makes half a corner unwritable, at the price of a second id to invent and
   a window with two hosts. *Reverse if:* authors keep writing one leg and the refusal does not
   teach them, or a schedule must carry one mark for the pair.
2. **A leg alone is refused,** on the leg, with the missing statement in the hint. Half a corner
   would be a window running into the side of a wall. A leg refused at the corner does not leave
   its partner reporting it missing: it was written, and its own error is the one to read.
3. **`width` runs to the outer corner, and a leg's centre comes from that.** So `at ± width/2` is
   still the span, and every reader of `at` and `width` (the cut, the schedule, the dimension chains,
   the 3D adapter) is right with nothing new to learn. *Alternative:* `width` from the centreline
   corner, the room's own number, and a hidden extension past it: the printed width would then not be
   the width of the glass. *Reverse if:* a schedule convention is read from a source that measures
   a corner window otherwise.
4. **No joinery change, so ADR 0018 stands as written.** The two cuts are ordinary `openingCut`s
   through `joinWallSet`, in `JoinedCut`, and `sceneWall`'s `at`/`width` re-joins them for DXF
   unchanged. Each leg's cut runs half the other wall past its host's end, and together they cover
   the junction block. *Alternative:* a third cut for the block, as `freeCrossingCuts` does. That is
   right for a crossing, which is no opening. Here it would be a cut with no sill or head, so a 3D
   reader would see a hole floor to ceiling at the corner.
5. **The drawing mitres.** Each leg's cover, wall-face lines, panes and sill stop on the line from
   the inner corner to the outer corner, so the two legs meet there and neither paints over the other.
   With walls of different thickness the line is not at 45°, and the two legs' lines still meet
   vertex to vertex. Nothing is added at the corner: no mark, no mullion.
6. **The position is not snapped.** A leg's end is a wall face, which is not on the grid, and
   snapping the centre would open the corner again. `open between` derives its opening off the faces
   the same way. *Alternative:* refuse an off-grid centre: every 250 mm wall with a 1800 mm leg would
   refuse. *Reverse if:* a reader needs every opening centre on the grid.
7. **Refused, never approximated.** One code, `E_WINDOW_CORNER`, for each way this is not a true
   corner of the two walls:
   - on a door or a cased opening, or on `on <wall>` (it reads rooms' edges);
   - two edges of different rooms, edges that do not meet at an end;
   - on either edge, no exterior wall that stays with an END exactly on the corner: a wall running on
     past it, a partition, a demolished wall, nothing;
   - a third wall, or a column, standing in the block the two walls make there;
   - a leg no wider than the other wall is thick (its jamb would stand inside that wall);
   - a second wall lying on the leg's span;
   - one leg, or three, at a corner;
   - two legs with different `sill` or `head`: the claim that no wall stands at the corner holds
     only over a shared height.

   The free jamb keeps the rule every relational opening has: `E_OPENING_NIB`, and the hint quotes
   the widest leg that fits.
8. **A leg names the other wall, not only the point.** `_corner` carries the corner, the meeting
   segment and the partner's id through `place` (`frame.ts`, `t.point`, `t.segment`, `t.nsId`), so
   `W_OPENING_AT_JUNCTION` is excused that one wall and no other.
9. **`corner` is a contextual word**, read as the form only when a dotted name follows it. A
   binding followed by a dotted name was never a legal expression, so `let corner = 900` and
   `at corner width 900` read as they did. `corner` is in no `STATEMENT_STARTS`, and `room
   id=corner` is fine.
10. **The absolute form is left alone.** `at (x,y)` windows keep `W_OPENING_AT_JUNCTION`, and that
    warning's hints do not move: changing them would move `lint()` on plans not using the form.

### What each surface says

- **`describe()`:** two rows in `windows[]`, each with its `facing`, `width` and `relation`, plus an
  additive `corner_with: <the other id>`, present only on a leg.
- **`lint()`:** `W_OPENING_AT_JUNCTION` is excused the meeting wall on a leg. The free jamb is still
  measured. Under a stricter profile a leg reported there gets no move hint, since a leg cannot move.
- **Schedule:** two tags and two rows, each with the leg's own width. No new cell.
- **DXF:** the scene's window lines and the walls' split, unchanged in kind: the walls re-join from
  `at`/`width`, and the window nodes are the drawing's.
- **Net areas:** unchanged. Net area reads the wall solid with the openings stripped, as for any
  window (ADR 0027).
- **`measures()`:** `at`, `width`, `along`, `across`, with `along` reading the thicker of the two
  walls, since a leg's sill nose runs out with the other wall's thickness. `bounds()` stays empty: a
  leg ends on a wall face, inside what the wall's band already reports, and the sill keeps the
  margin argument above `window.bounds`. `drawCost` stays 6 per leg: a mitre moves vertices, it adds
  no primitive.
- **Plan JSON:** `relation.at` carries `corner a.right` as written and re-parses. Inside a `place`
  a relation is exported by coordinates, as every instance's is.
- **`place`:** the instance resolves in its own frame and the frame carries the result. The D4
  oracle runs a corner under all eight frames.
- **3D:** the package reads two ordinary openings, and its checks pass. Two things stay for it to
  decide, not for this card: the legs' sill and head prisms overlap over the corner block, and each
  leg's glass runs to its own span's end, so the panes cross at the corner.

## 4. The byte law

A plan that does not write `at corner` compiles, describes and lints byte for byte as before,
diagnostics and steps included, and a plan that writes `open` keeps its bytes. The two hold by
construction:

- the parser's new branches are reached only on `corner <dotted name>` and on `at` after an `open`
  clause, both parse errors before;
- every new read is behind `_corner`, and `settle` returns at once on a window without it, charging
  nothing. `render` builds a plain window's nodes from the same expressions.

Pinned by `test/corner-window-byte-identity.test.ts`: per-payload SHA-256 over the corpus, baseline
taken from a `git archive` of the base, a plant first, a fixture that uses the form, and a check that
the fixture really reaches the new path.

## 5. Beside the other branches

- **`feat/j7-l-rooms`** moves `EDGE_OF` and the `EdgeLine` type out of `opening-relation.ts` and gives
  `readEdge` its body from `edgeOfRoom`. `placeCorner` reads both edges through `readEdge`, so an
  L's sides work once that lands: a side named by `top`/`right` that meets the other at an end is a
  corner, and a notch has no word to name. Expected conflict: the import block of
  `opening-relation.ts`, nothing else. `runEndMet` keeps its signature there.
- **`feat/j8-window-kinds`** rewrites parts of `window.ts`. Conflicts are textual (the pane loop, the
  sill, `drawCost`), with one decision for whichever lands second: a kind's marks stand at `at ±
  width/2` on the centreline, so on a leg a hinge mark would stand on the outer corner. Refuse a
  hinged kind on a leg's corner jamb, or draw the mark on the free jamb only. `fixed` has one pane on
  the centreline, and the mitre gives it the corner point.

## 6. What this does not do

- A corner on an authored wall by id (`on <wall> at corner …`): refused. `on <room>.<edge>` reaches
  authored walls too, so nothing is lost but the wall-first spelling.
- A re-entrant corner. A rectangle's two exterior edges always meet at a corner of the outline, and
  a notch has no edge word. It waits for a plan that asks.
- A door or a cased opening round a corner: refused.
