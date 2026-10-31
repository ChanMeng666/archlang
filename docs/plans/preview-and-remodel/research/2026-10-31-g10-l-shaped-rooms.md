# G10: L-shaped rooms in the rooms-first forms (issue #363)

A written design, card G10 of `cards.md`. Nothing here is built. Measured on `main@4b42ceea`, which is
core 1.47.0 (`arch --version`). File references are to that commit. Probes and the spike are outside
the repository, in `D:\.claude-scratch\2026-10-31\g10\`.

**Decision.** Accept a rectilinear `room polygon` in `walls from rooms`, `door|opening between`,
relational placement and anchored furniture. No new statement and no new clause. The issue's option
A, with three of its details changed (§4). Option B (`part` rectangles) is rejected as syntax and
survives as the implementation: inside the sweep a polygon is cut into rectangles of one owner.

## 1. The need and its reproduction

German single-family ground floors are often one L-shaped space with one name and one area. The
user redraws catalogue plans; in their pilot 4 of 5 storeys left the rooms-first form because of one
L. Run against 1.47.0, every output in the issue still reproduces:

| Plan | Result on 1.47.0 |
|---|---|
| The issue's first plan | 4 errors: `E_ROOM_NOT_RECTANGLE` ×2, `E_PLACE_POLY` ×2, as filed |
| `except liv`, bath 2000x3000 | `E_ROOMS_NOT_TILING`, a pinch at (6000, 3000) |
| `except liv` plus the L's edges typed as walls, bath 2000x6000 | Lint clean; `liv` 27 m², net 25.08 |
| Two rectangles and `open between` | Two stamps, `W_HABITABLE_NO_WINDOW` on the smaller half |

The issue's side note is right too. `door between liv and bed` reports `liv.top`, a name the line does
not contain, because `roomLines` probes the room by reading that datum
(`src/opening-relation.ts:315-318`).

## 2. What the language can do today

- `walls from rooms` refuses any non-rectangle in step 1 of its sweep
  (`src/room-tiling.ts:388`, built at `src/elements/walls-from-rooms.ts:174-182`). `except` is the way
  out, and the rooms left must still tile.
- `door between` reads `RoomDatums`, four lines and a centre, which a polygon does not have
  (`src/room-datums.ts:79-80`), then takes the first candidate of a two-rectangle run
  (`src/opening-relation.ts:333-347`).
- `right-of` refuses a polygon reference on purpose (`src/layout.ts:133-146`), and so does `anchor`
  (`src/elements/furniture.ts:760-768`).
- Much of the analysis already reads the ring. On the hybrid plan `describe` gives adjacency and net
  area, and lint is clean. More than a hundred sites already branch on a room's ring. The refusals are
  the rooms-first entrances, not the core.
- `room polygon` already refuses a self-touching ring: `E_ROOM_POLY_SELF_INTERSECT`
  (`src/elements/room.ts:586`) fires on a figure-of-eight and on a keyhole ring.
- Corpus census (318 files, 332 storeys, 1,031 rooms): 19 polygon rooms, of which 2 are rectilinear
  (`gallery-l`'s `gallery`, `courtyard-house`'s `r_gallery`). Both use typed walls, so no corpus plan
  reaches the rooms-first forms with a polygon.

## 3. Where the issue and the card are wrong against the code

1. **The issue's first plan fails its own proposal.** It says a pair sharing more than one run should
   refuse, and `liv` and `bed` share two: x 3000, y 3000–6000 and y 3000, x 3000–6000. An L wrapping
   a room always does. Run on the spike: `door between liv and bed at center` is
   `E_OPENING_HOST_AMBIGUOUS`. The refusal is right; the plan needs a selector (§4.3).
2. **"The bounding box could serve as the reference" breaks an iron law**: a derived position comes
   from the shape, never its bounding box (`docs/agents/iron-laws.md`). The comment at
   `src/layout.ts:133-137` already says why. In the issue's plan the box happens to agree with the
   ring, which is why the idea looks safe. §4.4 keeps the behaviour and reads the ring.
3. **The code's one-run assumption is stated, and now false.** `src/room-tiling.ts:219` ("two
   interior-disjoint rectangles share at most one") with the map at `:223-224`, which silently keeps
   the last run of a pair; also ADR 0028 §4, `deriveBetween` at `:599` (`swept.runs[0]`). ADR 0028 §2 and
   §3 need amending, not just the code.
4. **The card's "touches `src/room-tiling.ts`" understates it.** The spike touched six files
   (`room-tiling`, `walls-from-rooms`, `layout`, `room-datums`, `opening-relation`, `furniture`), 149
   lines added and 20 replaced, and that is before tests, docs or refusal texts.
5. **The card's "would retire the rectangle cutting" is true for the ordinary case only.** A mask
   region with a hole, or one whose cells touch at a corner, is no simple ring, so it cannot become a
   `room polygon` (§2). `rectangles()` (`tools/mask-to-plan/mask_to_plan.py:103`) stays as the
   fallback for those. The new work is a ring tracer. See §5.

## 4. The design

### 4.1 Rectilinear only

A ring qualifies when every edge is axis-aligned, decided exactly (`rectilinear`,
`src/room-tiling.ts:769`). Any other polygon, and every circle, keeps `E_ROOM_NOT_RECTANGLE`, with its
text saying rectangular or rectilinear. A redundant collinear vertex is fine (probed).

### 4.2 `walls from rooms`

No syntax. The sweep needs one idea: **a polygon is several rectangles with one owner, and an edge
with the same room on both sides is no wall.** The sweep's interval owner is already a room index, so
the only new branch is `L === H` at `src/room-tiling.ts:744`. Runs and boundary pieces merge across a
seam because `sweepLine` compares owners, not rectangles. The output depends on the ring and not on
how it was cut. The spike cuts into horizontal slabs.

What follows from a pair having several runs:

- **Wall names.** The first run is `liv|bed`, later ones `liv|bed#2`, ordered by the sort
  `src/room-tiling.ts:276` already has (its `y`/`x` tie-break is unreachable today). `#` cannot be
  spelled by an identifier and `~n` still means a coexistence split, so `liv|bed#2~2` is legal.
- **`between A and B thickness t`** applies to every run of the pair. Nothing is ambiguous.
- **`open between A and B`** on a pair with several runs is **refused**, naming the runs. The spike
  voided both runs and left a free-standing 100 mm square at the reflex corner: #368's defect in a new
  shape, seen only by looking at the drawing, and `freeCrossingCuts` (`src/wall-lowering.ts:116-127`)
  needs four arms. The refusal also matches ADR 0028's consequence: two rooms with no boundary are
  one room. To open one run, write `opening id=o between liv and din at 1500 from din.top width 2800`,
  which §4.3 makes possible with no new clause.
- **`wall … between` and `wall … around`** stay rectangle-only. Probed on the spike: both still report
  `E_ROOM_NOT_RECTANGLE`, so `runs[0]` cannot pick a run silently. `around` can follow on a second ask.

Refusals keep their codes: `E_ROOMS_OVERLAP`, `E_ROOMS_NOT_TILING`, `E_PARTITION_TOO_SHORT` (probed on a
1 mm jog in a ring).

### 4.3 `door|opening between`

The run search moves from `RoomDatums` to the two rooms' rings. One run: as today. Several: the
position must select one, **using a form the language already has**. `at <mm> from <room>.<edge>` is
legal only for an edge perpendicular to the run and meeting it at one end (ADR 0028 §5), and that rule
selects exactly one of an L's runs:

```arch static
door between liv and bed at 1500 from bed.top width 800 swing into bed   # the run on x 3000
door between liv and bed at 1500 from bed.left width 800 swing into bed  # the run on y 3000
```

`at center`, `from start|end` and `at axis` on a several-run pair are `E_OPENING_HOST_AMBIGUOUS`, naming
each run and the `from` edge that picks it. The diagnostic should quote the edit, since an agent
will read it. Both of those rooms being polygons leaves no edge word (spike: two interlocked Ls share
three runs). The way out there is `door at (x,y)`, which hosts on a derived wall today (probed). The
`liv.top` message is fixed in passing.

### 4.4 Relational placement and datums

`right-of liv` reads **the ring's extreme run on that side**, not the box. Its line is where the room
is placed, and `align` reads that run's ends. One run on the extreme line: placed. Two (the prongs of
a U): `E_PLACE_POLY`, naming them. In the issue's plan `right-of liv` lands at x 6000, y 0–3000 (spike).
`align` was not exercised there: the bath is exactly as tall as the run, so every alignment agrees. L3
needs a shorter room to prove `align bottom` stays on the run instead of floating past the notch.

`liv.top|bottom|left|right` become the same extreme line, under the same one-run rule, so `window on
liv.left` works. `liv.cx` and `liv.cy` stay refused: an L's box centre may not be floor. A notch edge
has no word. `window at (x,y)` reaches it (probed); open question 2 asks about naming it.

A polygon stays absolutely placed: a ring's coordinates cannot read datums, because rooms are placed
before the table is frozen (`E_DATUM_BEFORE_ROOMS`).

### 4.5 Anchored furniture

- A corner anchor is legal when that corner is **a vertex of the ring** and both of its edges are the
  extreme runs. In an L, `bottom-left` is; `bottom-right` is in the notch and refuses.
- A side anchor needs a one-run extreme side and centres on that run, never on the box.
- `centered` stays refused.
- The placed footprint must lie inside the ring or it is `E_PLACE_POLY` (the issue's condition, kept).
- `flush` passes the run, not the box, to `innerFaceOfRoomEdge` (`src/fixture-orientation.ts:242`).

The spike built only the corner test. The issue's sofa landed flush in the corner.

## 5. Consequences

| Surface | Consequence | Status |
|---|---|---|
| Resolver | §4; `TileRoom` gains parts; the ring is cut after snapping | spike |
| Budgets | The flat pre-charge stays (`DERIVED_ELEMENTS_PER_ROOM`, `src/ir.ts:3867`); its second stage counts real walls before allocating, so a comb-shaped room is covered (`src/room-tiling.ts:311`). Slabs can be quadratic in a ring's vertices: charge before cutting | designed |
| Lint | No rule changes. The L plans raised no spurious wall or enclosure code. An L is one room to `W_HABITABLE_NO_WINDOW`, as it is on the hybrid plan today, so no half is judged alone | measured |
| `describe` | One room, one area. `derived_walls[]` gains names with `#n`; `relation` on a door is as written | measured |
| Plan JSON | No new member: `polygon` and `walls_from_rooms` exist. Export then `--from-json` gives a byte-identical SVG on the issue's plan | measured |
| Drawing, DXF | Ordinary walls through the existing path; no layer, no glyph. DXF exports (not opened in a CAD tool) | measured |
| `takeoff` | Works unchanged: perimeter and net area read the ring. `liv` 24,000 mm, net 25.08 m² | measured |
| `finish` | Sheet stages work. The furnish stage still declines a polygon with its note (`src/furnish.ts:387`): no change, and the user keeps the note | measured |
| Other readers | `relationalClause` (`src/opening-relation.ts:121`) must read rings or hints lose the relational form; `contacts.ts:77`, `keep.ts:672,787,1446` and `per-room.ts:237,257` keep declining a polygon, which is safe | designed |
| `tools/mask-to-plan` | Trace a ring per region, keep `rectangles()` for what no ring can hold, drop `open` clauses and the `_a/_b` ids; update `docs/import.md` | designed |

The mask example, redrawn by hand with Living as one L: net **30.93 m²** against a mask of 30.9325. Today's
two parts sum to 30.64, because the voided strip is subtracted, the shortfall `docs/import.md` explains.
That is the strongest argument for this work. One cost: Living and Hall then share two runs, so
`door between living and hall at center`, the form that doc suggests, refuses and must name an edge.

Multi-storey: nothing storey-specific. `place` is covered by frames: the spike placed the L turned 90°
and mirrored, and door and walls followed. The D4 oracle must still run on it.

## 6. The byte-identity law

A plan with no rectilinear polygon inside a `walls from rooms` set, a `between`, a relational reference
or an anchor resolves, draws, describes and lints exactly as before, diagnostics included.

Measured on the spike: SHA-256 of SVG + `describe()` + `lint()` + `compile().diagnostics` over all 318 probe
corpus files, **0 moved**. The sweep discriminates: a stair going of 200 mm moved 33 files. (A first
mutation, 281 mm, moved none, because `round(length/going)` did not change on any corpus run. A mutation
that moves nothing proves nothing.) A rectangle-only plan cannot reach the new branch, since `L === H`
needs one room on both sides of a line.

Tests to ship: that sweep with the test's own digest body; two equivalence laws (an L tiles to the same
ring and partition lines as its two rectangles; any cut of a ring derives the same walls); the D4 oracle
on a derived L under all eight frames. A changed message for a non-rectilinear polygon is the
sanctioned third class of moved digest (`test/byte-identity-baseline.ts`), and is listed.

## 7. Hard limits

No dependency and no raster in the core: the tracer stays in `tools/`, per D18. Heights: not touched. 3D:
no core change; the package reads rooms and joinery, and `check:3d` is a gate on L1 because a derived L is a
new input to it. IFC: nothing here promises or depends on it. Drawing changes do not move `describe()`
or `lint()`: no renderer change. ADR 0005 (refuse, never choose) holds at every several-run case.

## 8. Alternatives rejected

- **B, `room { part at … }` as syntax.** Its resolved form would be a ring anyway, so every reader sees a
  polygon. It adds a second spelling of a shape the language and Plan JSON already have, and spends
  spec space. Its one gain, fewer corners to type, is small for an agent. Its seam rule is kept as the
  implementation. Reopen if polygon typing proves a real error source.
- **The box as reference.** §3 item 2.
- **Run indexes or `.e3` edge names now.** Not needed for the reported plans. Open question 2.
- **`open between … on <edge>`.** A fourth clause arrives at ADR 0028's reversal condition, and the
  `opening between` form already does it.
- **Voiding every run of an `open` pair and clearing the corner.** A silent choice about a post, plus a
  second case in `freeCrossingCuts`.
- **Doing this upstream of the sweep, by splitting the room in the IR.** Two rooms downstream is the
  defect the user reports.

## 9. Risks

- **No corpus exercises it.** Zero plans in 318 reach the new branch, so green sweeps say nothing about
  the new paths. L1 adds fixtures from the issue plus U, comb and interlocked shapes.
- **Authors must think in runs.** `at center` is the natural thing to write and it refuses. The
  diagnostic has to carry the fix, and `spec.llm.md` is at its cap, so its line must be paid for.
- **Slab cost** on a pathological ring. Feeding ring edges to the sweep directly is linear and has no
  seams, but step 2 would then need an exact polygon overlap (`polygonsOverlap` takes an `eps`, against
  `room-tiling.ts`'s no-tolerance rule). Slabs stay unless the charge bites.
- **A small jog in the drawn join** where a partition meets the ring at a reflex corner (the spike's
  (6000, 3000)). Not yet compared with the same plan in rectangles. L1 checks it, and if it differs it
  goes to ADR 0018's joinery rather than here.

## 10. Slices

Sizes are AI-assisted days, ±50 %. Each is a PR under the §0 gates. L1 and L2 must share a release: a
derived L with no door is not useful.

| Card | Scope | Size | Must not |
|---|---|---|---|
| L1 | §4.1–4.2, `#n` names, the `open` refusal, byte law, oracle, ADR 0028 amendment, fixtures | 1.5 | touch pairwise walls |
| L2 | §4.3, the message fix, `relationalClause`, a spec line paid for by a cut | 1 | add a clause |
| L3 | §4.4 `right-of` and extreme datums | 1 | read a box |
| L4 | §4.5 anchors, `flush`, side runs | 1 | change `finish` |
| L5 | The mask tracer, `docs/import.md`, regenerate `example/` | 0.5 | put any of it in `src/` |

Total about 5 days. L1 and L2 alone cover the walls and doors of the reported plans.

## 11. Open questions for the owner

1. Is `at center` refusing on a two-run pair acceptable, or does it justify a selector clause? This
   design says refuse, and wait for evidence from the user.
2. Should notch edges get names (`liv.e3`, by the author's ring order)? It would also settle two
   polygons sharing runs. Parked on a second ask; `at (x,y)` works meanwhile.
3. Is L3–L4 wanted now? The user's words put walls and doors first, and `at (x,y)` covers placement.
   Stopping after L2 saves 2 days and leaves `E_PLACE_POLY` as it is.
4. Should `finish` furnish an L? It needs a decision about which rectangle of a room to fill, so it is
   outside this design.
