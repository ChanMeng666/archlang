# Issue #405: drawing and CLI gaps, what to build

Short design for card J14, measured on `main` at `cac37af4`. The issue collects small points from
German test plans filed on 1.45.0. The owner's order: build what is truly general, leave what is
Germany-only, and leave the rest named in the issue.

## Every item, with a verdict

| Item in #405 | Verdict | Reason |
|---|---|---|
| Hide the north arrow, scale bar and title box on a detail | Build | Reproduced: `north hidden` is `E_PARSE`, and every plan draws an arrow and a bar even with nothing authored. One word on three existing statements |
| Mirror one furniture piece | Build | Reproduced: `furniture … mirror` is `E_PARSE: Unknown statement "mirror"`. The IR already has the bit (`_mirror`) and its composition law |
| A per-room floor finish | Build | Reproduced: `room … floor tile` is `E_PARSE`. The hatch library, the DXF hatch and the legend rows already exist |
| `paper auto` | Leave | ADR 0024 names `paper auto` and refuses it as a language form. The need is met: `arch finish --only sheet` on a plan with `scale 1:50` writes `paper A3 landscape` into the source |
| `--level=-1` | Build (CLI) | `--level -1` works. `--level=-1` is exit 3 because no flag takes the `=` spelling. Six lines in `parseArgs` |
| A file-name pattern for storeys | Build (CLI) | Today only `<stem>.L<n>.<ext>`. `-o plan-{level}.svg` is one substitution in `levelTarget` |
| Silent `grid` snapping that makes touching rooms overlap | Build (hint) | No longer silent: the issue's plan raises `W_ROOM_OVERLAP`, and `E_ROOMS_OVERLAP` under `walls from rooms`. What is missing is the cause, so the warning gains a hint when the overlap is within one grid step |
| L-shaped voids with a railing | Leave | `void` is rectangle-only (`E_VOID_SIZE`) and draws no railing. Two forms, and a polygon void reaches circulation and the landing probes. Not small |
| A height for `fence` and `outdoor` | Leave | The card leaves it. Heights draw nothing, so it is data for a downstream reader, and no reader wants it yet |
| An opening size label `b/h` | Leave | Germany-only sign. `dim … text "151/123.5"` is the workaround |
| A glass balustrade | Leave | Germany-only sign as filed, and `fence panel` stands in |
| A roof window | Leave | Germany-only sign as filed, and a dashed `roof polygon` stands in |
| A bath with both tub and shower from `finish` | Leave | `FURNISH_TABLE` places one piece per use. A second piece needs a fit search for a room that holds both, which is a change to `furnish`, not a small form |

## Decisions

Each has the alternative rejected and a reverse-if.

**D1. `hidden` trails three statements.** `north [<dir>] hidden`, `scale [<a>:<b>] hidden` and
`title hidden`. The fact stays and only the mark goes, which is what the word says: `north 30 hidden`
keeps its bearing for `describe()` and the compass rules, and `scale 1:20 hidden` keeps the operative
scale and the title row. Rejected: `north none`, `scale none`, which read as the fact being absent and
contradict `scale 1:20` on the line above. Rejected: one switch (`paper none`, a `detail` setting),
because a detail often keeps its scale bar and `paper none` cannot stand on a real sheet.
Reverse-if: authors ask for one word and never hide a single mark.

**D2. The bands hidden marks free are freed.** A hidden scale bar or title box reserves nothing in the
fit rule (`usablePlanMm`) and the bottom margin shrinks with it, because a reservation for something
not drawn would raise `W_SCALE_OVERFLOW` on a detail that fits. The north arrow sits in the top margin
and reserves nothing today, so hiding it moves nothing else. `W_TITLE_OVERFLOW` is silent on a box that
is not drawn. Reverse-if: a hidden mark is ever meant to keep its place on the sheet.

**D3. `mirror` on a piece takes no axis, and its back stays put.** It swaps the symbol's left and right
in the symbol's own frame, before the quarter-turn, by setting the same `_mirror` a reflecting `place`
sets. So `rotate`, `facing`, `against` and the anchor rules keep the back where they put it. Rejected:
`mirror x|y` as on `place` (the issue's guess). Under a `rotate 90`, `mirror x` is the turn by 270 with
the hand flipped, so the word would move the back and every rule that reads it. `mirror x` on a piece
is `E_PARSE` with a hint. Reverse-if: authors keep writing the axis and a turn on the piece never
matters to them.

**D4. Handedness stays read off the drawing.** `mirrorGlyph` returns a symbol with a vertical mirror
axis untouched, so an unhanded piece stays byte-identical and gains no hand, at every footprint. No
diagnostic for a no-op: handedness depends on the footprint, so no table can say so in advance.

**D5. A floor finish is a pattern, not a colour.** `room … floor tile|paving|deck|concrete`. A pattern
is monochrome and theme-driven, stays readable under `mono`, reaches DXF as a real `HATCH` and has a
legend row. Rejected: a colour, which bypasses the theme, means nothing in DXF and turns the room into
the tint of something else on a print. Reverse-if: `theme` grows per-room tints.

**D6. A floor pattern paints no background.** A wall material paints `pocheBase` first, which would
give a tiled room the tint of a wall. A floor spec is bare (`HatchSpec.bare`), under its own pattern id,
so `wall … material tile` keeps its exact bytes beside `floor tile`, and two legend rows name the two
drawings (`tile`, `tile floor`). The ground patterns have no background already.

**D7. A floor is a drawing fact.** It joins neither `describe()` nor `lint()`, and Plan JSON lists it in
`dropped`, as it does `legend` and `theme`. An unknown word is `W_UNKNOWN_MATERIAL` and draws no
pattern, as a wall's unknown word keeps its default. The PDF has no pattern fills: a floor there is a
solid `pocheBase` tint, as a ground surface already is.

**D8. Plan JSON reads `mirror: true` on a piece.** The flag was output-only because source could not
state it (`E_JSON_MIRROR`). Now it can, so `planFromJson` prints the clause for furniture and keeps
refusing doors and dimensions. A placed piece's document round-trips to the same drawing.

**D9. `paper auto` is left, against the card's fourth form.** ADR 0005 and ADR 0024 settle it: ADR 0024
says a `paper auto` setting would put the choice back inside `compile()`, the source saying "some
sheet" and the drawing showing a particular one. Scale fitting inside `compile()` is older than that
ADR, which does not reopen it and is no precedent for a second choice. Reverse-if: the owner amends
ADR 0024.

## Consequences by surface

| Surface | `hidden` | `mirror` | `floor` |
|---|---|---|---|
| SVG, PNG, PDF | Mark absent, bands freed | Symbol reflected | Hatch over the floor (PDF: solid tint) |
| DXF, ASCII | No chrome drawn today, unchanged | Symbol reflected | DXF `HATCH`; ASCII unchanged |
| `describe()` | Moves only in `scale` and `sheet`, where a freed band lets the auto scale fit finer or a plan fit | `hand` in `--facts symmetry` follows the piece | Unchanged |
| `lint()` | `W_TITLE_OVERFLOW` silent on a hidden box | Unchanged | Unchanged |
| Plan JSON | Listed in `dropped` | Round-trips | Listed in `dropped` |
| Fit rule and `legend` | Bands freed | Unchanged | One legend row per material |
| Grammars, `arch fmt` | Printed back | Printed back | Printed back |

## The byte law

A plan that does not use a form does not move on any payload: SVG, `compile().diagnostics`, the Scene,
`describe()`, `lint()`, the accessibility profile, the circulation overlay and the steps. The law is one
table, `test/gaps-byte-identity.test.ts`, on the widest body the repository has (`stairLawDigest`), over
the block-stair rows plus inline rows that use the words `hidden`, `mirror` and `floor` as names, so a
plan that already said `mirror = 2` or `floor(2.5)` keeps its meaning. Measured from a `git archive` of
`cac37af4`. `test/fixtures/gaps/gaps.arch` uses all three forms, and the premise tests hold it to them.

Every new word is read only where a clause can stand, on that statement's line, and only when no `=` or `(` follows it, so a
statement that starts with the word on the next line parses as it always did.
