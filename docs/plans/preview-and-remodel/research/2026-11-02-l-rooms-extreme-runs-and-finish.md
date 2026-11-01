# Addendum to G10: extreme runs, anchors, and `finish` on an L (issues #363, #370)

Completes cards L3 and L4 of `2026-10-31-g10-l-shaped-rooms.md` §4.4–4.5, and adds `finish` on an L,
which that design left out (its open question 4). D29 lifts D24's parks. Measured on `main@1974d928`,
core 1.50.0.

## 1. Reproduction

The issue's first plan on `main`, verbatim:

```text
error[E_OPENING_HOST_AMBIGUOUS]: Door "door_1" cannot tell which edge to stand on: "liv" and "bed" share 2 edges (on x 3000, y 3000–6000; on y 3000, x 3000–6000), and `at center` does not say which
error[E_PLACE_POLY]: Furniture "sofa_1" is placed `in liv` with `anchor bottom-left`, but "liv" is a polygon room — anchored placement needs a rectangular room. Place it with `at (x,y)` (plus `rotate`) instead.
error[E_PLACE_POLY]: Room "bath" is placed `right-of liv`, but "liv" is a polygon room — relational placement needs a rectangular reference. Place this room with `at (x,y)` instead.
```

`liv.top` still reads `E_ROOM_NOT_RECTANGLE`. `finish` leaves `liv` empty with a note.

**The door line stays refused.** `at center` on a pair with two runs is a choice of run the author did
not write: G10 §3 item 1, D24, ADR 0005, and it is not one of the parks D29 lifted. So the plan needs that
one line to say which run, in the form the refusal quotes. Every other line compiles as written.

## 2. Decisions

Each has the alternative rejected and when to reverse it.

**A1. A side of a polygon is its extreme run.** On the ring's smallest or largest `x` or `y`, the ring's
edges that lie on that line, merged across a redundant vertex. One run names the side. Several runs (the
prongs of a U) name nothing, and the refusal lists them. Every end of such a run is a convex corner, since
the ring cannot cross an extreme line. *Rejected:* the bounding box: it is an iron law, and in an L the
box's bottom edge is half notch. *Reverse if* never: a box is not a shape.

**A2. `right-of` and friends read that run**: its line is where the room stands, its ends are what `align`
reads. *Rejected:* aligning on the box: `align bottom` would float the room past the notch.

**A3. `liv.top|bottom|left|right` are that line, under the same rule**, read through the same reader, so
every reader of a datum gets it at once: an expression, `on liv.left`, `from liv.top`, `against liv.left`,
`segment containing liv.top`. A run's extent replaces the rectangle's. `.cx` and `.cy` stay refused. All
refusals keep `E_ROOM_NOT_RECTANGLE`, the datum's code, so no consumer learns a new one. *Rejected:* a new
code for the several-run case: the fix is the same as a polygon's today. *Reverse if* an agent's repair
needs to tell them apart.

**A4. A read charges the ring, at the read.** Nothing is added to the frozen table, so a plan with an L that
reads no datum costs what it cost, steps included. *Rejected:* precomputing runs in `buildDatumTable`: it
would move the steps of every plan with a rectilinear ring (`gallery-l`, `courtyard-house`).

**A5. `window on liv.left` on a mixed edge.** The run is the edge, and #430's rule applies unchanged: the
position names a point of the run, then the span must land on one exterior wall. The notch is not part of
the edge, so `liv.right` of an L measures from the end of that run, not from the box.

**A6. Anchors.** A corner anchor is legal when the box corner is a vertex of the ring; both its edges are
then extreme by construction, and its faces read the runs that end there. So a U keeps all four corners
although two of its sides have two runs: one vertex, nothing to choose. A side anchor needs a one-run side
and centres on that run. `centered` and `anchor center` refuse. The footprint must lie inside the ring,
exactly, or it is `E_PLACE_POLY`. `flush` and the derived turn hand the run to the wall scan. *Rejected:* a
corner refused whenever a side has several runs: stricter than the rule needs, and no choice is made.

**A7. `against <room>.<edge>` on a polygon keeps the footprint inside the ring too**, as `E_FURN_AGAINST`.
The form became reachable through A3, and on a polygon, unlike a rectangle, an overhang along the run can
land in the notch. *Rejected:* leaving that to `W_FIXTURE_WRONG_ROOM`: a resolver that knows the footprint
is off the floor does not place it.

**A8. A hint may quote a polygon's word.** Where no rectangle of a pair picks a run, `runPicks` tries the
polygons' words, after the rectangles', so a hint that quoted a rectangle's edge stays as it is, and "no
edge of these rooms picks it" stays true. *Rejected:* one pass in pair order: `door between liv and bed`
would change its hint from `bed.top` to `liv.bottom`, which moves a published message for no gain.

**A9. `finish` on an L.** The stage's rule is relative placement only (ADR 0025): it writes `in <room>
anchor` and `against wall`, never `at (x,y)`. So on a rectilinear room it offers exactly the positions those
forms can say: the extreme runs, the corners that are ring vertices, the side anchors on one-run sides.
Clear floor is the ring less the bands of the walls it touches. A position is computed by the same function
the compiler resolves it with (`anchoredAt`), so proposal and result cannot disagree. A notch edge has no
word, so nothing is proposed against it. A `centre` piece goes straight to the stand-off from a wall's
middle, the fallback it already had. The never-worse gate is untouched and still decides.

*Rejected:*

- **The largest rectangle inside the ring, furnished as a room.** Natural, and it is the bounding box's
  cousin: the piece would have to be written `at (x,y)`, which the stage never writes, because its anchors
  name the whole room, not the part. *Reverse if* ADR 0025 ever admits `at`.
- **Keep declining.** Never-worse by doing nothing, but the room the user draws most often stays empty.
- **A new word for a notch edge.** Edge names are a language form of their own (G10 open question 2).

*Consequences.* A rectilinear room with no named wall takes pieces only on its extreme runs, so a wing whose
outer walls are all doors stays empty and says so. `MAX_ROOM_AREA_M2` reads the ring's area on a polygon, not
the box. A rectangle's path is untouched: every polygon branch sits behind `room.poly`.

## 3. Consequences by surface

| Surface | Consequence |
|---|---|
| Resolver | `extremeRuns`, `runRect`, `rectInRing` beside the ring tests in `src/room-tiling.ts`; `anchorRuns`, `anchoredAt` in `src/fixture-orientation.ts`; `edgeOfRoom` in `src/room-datums.ts`, the one reader of an edge's extent |
| Budgets | Ring reads scaled by `RING_READS_PER_STEP`, charged at the read; a polygon anchor's wall scan is charged before it runs, which a rectangle's is not, and stays so |
| `describe`, `lint` | One room as before. No new code. `relationalClause` reads a polygon's edge, so a hint keeps `on liv.left at …` |
| Plan JSON | No new member: `anchor`, `room`, `relation` carry it. Round trip proved |
| Drawing | No renderer change |
| `repair` | Declines any piece declared in a polygon before it models a placement (`polyRoomIds`), so the box model is never reached |
| `wall … between\|around`, `facing`, keep facts, contacts | Stay rectangle-only: `E_ROOM_NOT_RECTANGLE` on the pairwise forms, a refusal on `facing`, decline in the analysis. A room datum that now reads in a `wall` point is the author's own expression, read like any other |
| `place`, imports | Nothing frame-specific: an instance resolves in its own frame (`docs/agents/gotchas.md`), then its frame carries the result |

## 4. The byte law

A plan that uses no rectilinear ring as a relational reference, an anchor room or a datum resolves, draws,
describes and lints exactly as before, steps included. Only wording moves: a refusal that said "rectangular"
now says "rectangular or rectilinear", on plans that fail anyway or a slanted polygon's `finish` note. Those
rows are the sanctioned class of `test/byte-identity-baseline.ts` and are listed in the PR.

Proof: the six-payload sweep plus steps, from a `git archive` of the base, over the repository corpus and the
harvested inline plans, with a plant first; the digest tables by their own routes; a fixture that uses every
new form, pinned; and every new branch reached by a counter.

## 5. Not done

Notch edge names, `wall … around` an L, `facing` an L, and the mask tracer (card L5). G10 §11 question 1 keeps
its answer.
