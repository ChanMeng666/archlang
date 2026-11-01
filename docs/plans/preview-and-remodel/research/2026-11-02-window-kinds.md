# Window kinds and a glazed sliding door (issue #369)

A written design, card J8. Measured on `main@1974d928`. File references are to that commit.

**Decision.** A closed set of window kind words leads a `window` statement, as a kind word leads a
`door`: `fixed`, `casement`, `tilt`, `tilt_turn`, `sliding`. A new door kind, `glazed_sliding`, joins
the sliding family. A window with no kind word is byte-identical on every payload.

## 1. Reproduction on `main`

The issue's plan compiles and lints clean, and all three openings draw alike:

| Input | Result on `main` |
|---|---|
| The issue's plan, `compile` then `lint` | exit 0, `✓ ok` |
| `window fixed on a.top width 1500` | `error[E_PARSE]: Expected "at" but found "fixed"` |
| `window turn-tilt on a.top width 1500` | `error[E_PARSE]: Expected "at" but found "turn"` |
| `window lift-slide on a.top width 1500` | `error[E_PARSE]: Expected "at" but found "lift"` |
| `door on a.bottom at center width 1800 swing outward` | `W_LEAF_TOO_WIDE`: one hinged leaf 1800 mm wide, 581 mm over |

The DOOR & WINDOW SCHEDULE prints `window` in TYPE for every window (`src/opening-schedule.ts:177`).

## 2. What `width` is

The issue asks whether `width` is the clear glass, the moving leaf or the structural opening. It is the
**structural opening**: the gap cut through the wall from jamb to jamb, on the wall's line
(`openingCut` from `{ at, width }`, `src/wall-lowering.ts:64`; `op.width / 2`, `src/geometry/band.ts:702`).
`describe` reports that number. No panel is that long: a `sliding` panel is `0.55 × width`
(`src/elements/door-panels.ts:150`), so it leaves `0.45 × width` to walk through when fully open. ArchLang
models no frame, so it has no clear-glass figure. A window's `width` is the same gap.

## 3. Decisions

Each has the alternative rejected and what would reverse it.

1. **The window words.** `fixed`, `casement`, `tilt` and `sliding` are general words; the issue lists the
   first three and its `# kind=` comment lists `sliding`. The fifth is `tilt_turn`: "tilt and turn" is the
   English trade term, and `turn_tilt` is the German word order (Dreh-Kipp) carried across. *Rejected:*
   `turn_tilt`; also `awning`, `hung`, `pivot` and `louvre`, which each need a symbol of their own and which
   nobody asked for; the table takes a row when one is. *Reverse if* the plans people redraw print another
   English word.
2. **A hinge side is authored or absent, never defaulted.** `casement` and `tilt_turn` take an optional
   `hinge left|right`, read along the wall's direction as a door's is, so it rides a `place` frame with the
   traversal. With no `hinge` the mark stands on both jambs and the symbol is symmetric: the drawing states
   no hand the source did not state. Plain windows and the other kinds refuse the clause
   (`E_WINDOW_KIND_CLAUSE`, a fix deletes it). `set` cannot supply it. *Rejected:* a default `left`, which
   prints a fact nobody wrote; a required `hinge`, which makes an agent reading a schedule that gives no side
   invent one. *Reverse if* the owner wants `hinge` required.
3. **`sliding` takes no `slide` clause.** A kind with no hinge gains no handedness, so its mark is a
   two-headed arrow, symmetric both ways. *Rejected:* two offset panes like a `door sliding`, which is
   handed whichever pane is in front. *Reverse if* a window schedule needs a sliding side.
4. **Marks stay in the reveal.** Every window mark lies inside the wall's thickness and the opening's width:
   a short chevron with its point on a hinged jamb, a small circle at mid-span for a tilt, the arrow for
   `sliding`, one centred glass line instead of two for `fixed`. `tilt_turn` is the chevron plus the circle.
   So `measures()` already covers them, `bounds()` stays empty, no furniture, label or tag has anything new to
   avoid, and no sash direction has to be said. *Rejected:* the issue's dashed arc: it reaches a sash's width
   into the room or out past the wall, needs an in/out clause (a second handed fact) and a dash means hidden
   or above the cut (ADR 0023 §4). An `F` tag: text inside a wall band does not survive 1:100. *Reverse if* a
   reader asks to see the sweep.
5. **A kind reads no height.** `fixed` at `sill 0` and at `sill 900` draw alike (heights draw nothing).
6. **`door glazed_sliding`, not `lift_slide`.** The word says what the plan shows. Lifting is a hardware
   mechanism that a plan does not draw, so `lift_slide` would print a fact on a plain patio slider. It is a
   sliding-family member: `DOOR_KIND_CLAUSES` row as `sliding`, `E_DOOR_KIND_CURVED` applies, default `slide`
   as the family's. Drawn as one fixed and one moving panel, each two glass lines in the window's pane ink on
   its own track, and an arrow on the moving panel, which needs no new primitive. *Reverse if* the owner
   prefers the issue's word: the rename is one table entry.
7. **It passes through one panel.** `leavesOf` and `activeLeafWidth` read a `glazed_sliding` door as they read a
   `double`: half its width, which is what `W_DOOR_CLEARANCE`, `W_PATH_TOO_NARROW` and the access graph's
   clear width see. A 1200 mm door passes 600 mm and warns. *Rejected:* `sliding`'s reading of the whole width,
   which would call that door passable. `door sliding` keeps its reading (byte law); that gap is residue.
   *Reverse if* a third panel count is added.
8. **`fixed` and `tilt` are no way onto a balcony.** `W_BALCONY_NO_DOOR` counts a window with no `sill` as a
   French window; a window that says it cannot be walked through no longer counts. Plans without a kind are
   unmoved. *Rejected:* leaving the rule, which would accept a pane the source says does not open.
9. **The schedule's HAND stays `-` for a window.** A door's hand reads the drawn leaf from the side it opens
   into; a window has no such side here, and `hinge left` is a wall-direction word. TYPE prints the kind. A
   column holds `sliding` today, so it widens only for a longer word, from the closed vocabulary.
10. **The legend gains a row per kind drawn**, its swatch the real symbol, for the five window kinds and
    `glazed_sliding`. Older door kinds have no row and stay that way (byte law).
11. **No `examples/` file.** `packages/archlang-3d` lists door kinds in `src/scene3d/validate.ts:120`, and this
    card does not touch that package, so an example would break its corpus. A docs fence and a test fixture
    carry the form. The fixture stands in `test/fixtures/window-kinds/`: six corpus tables read `test/fixtures`
    flat and pin every plan there, and none of them is about this form.

## 4. Consequences by surface

| Surface | Change |
|---|---|
| Parser, AST | `window [id=] [kind] … [hinge left\|right] [sill] [head]`; a lookahead against the closed list, as `door` has |
| `describe --json` | `windows[].kind` when written (`doors[].kind` carries the new word); no hinge, as for doors |
| Schedule | TYPE as above; door tag side treats the new kind as in-wall (`src/opening-schedule.ts:427`) |
| Symmetry fact | `doorRec` reads the new kind's track as `sliding`'s; a kinded window's label carries the kind, a written hinge orders its jambs |
| DXF, PDF, SVG, ASCII | Generic prims on the `doors` and `windows` passes; every new polygon is stroked, so the ASCII carve still finds the one unstroked cover |
| Plan JSON | `window_kind` and `hinge` on a window round-trip; `door_kind` is table-driven; nothing is dropped |
| `doorSwing`, `doorLeaves` callers | null and `[]`, as for `sliding`: `doorHand` `-`; `swingObstructed`, `leafAcrossDoorway` as the leaf side, stairs, furniture, annotations, `repair`, `furnish`, `fixture-paste`, `furniture-relation` sweep nothing |
| Other door rules | `W_LEAF_TOO_WIDE` silent (no swinging leaf); `W_BALCONY_NO_DOOR` satisfied; garage rules read `door garage` only; entrance candidate, not a street-side `hinged` pick, as `sliding`; exit approach takes the larger depth, as `sliding` |
| Draw budget | A kinded window costs 11, a plain one still 6; a glazed door fits the door's 5 |
| Takeoff | Unchanged: windows by width, doors by kind. Residue |
| `packages/archlang-3d` | No source change. Window kinds pass through. Its closed `DoorKind` union, validator and schema refuse the new door kind: `V-SCH-01` fails at run time and `typecheck:all` fails at `src/scene3d/build.ts:168`. Reported, not fixed |

## 5. The byte law

A plan that writes neither a window kind nor `glazed_sliding` is unchanged on every storey's SVG, Scene,
`compile().diagnostics`, `describe()`, `lint()` under both profiles, the circulation overlay and evaluation
steps. Baseline from `git archive` of `1974d928`, the law's own body, a plant first, and a fixture that uses
every form so the new path is shown reached. `test/window-kinds-byte-identity.test.ts` pins it. The kind's path
is reached only from the word: `drawCost`, `render`, `describe`, the schedule and Plan JSON read a field that is
absent otherwise.

One thing does move on a plan that writes neither form, and it is not a form's path: `E_DOOR_KIND_CLAUSE`'s hint
lists the kinds that take a clause, derived from `DOOR_KIND_CLAUSES`, so a plan already refused for `slide` or
`open` on a door now reads `glazed_sliding` in that list too. It stays derived: leaving the new kind out to keep
the bytes would make the hint false by omission.
