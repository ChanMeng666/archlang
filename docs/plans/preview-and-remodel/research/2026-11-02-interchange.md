# Interchange: arcs and paper in Plan JSON, a converter recipe, DXF blocks

Issues #366 and #343, backlog U.13, card D1. Measured on `main` at 3f3060a3 (core 1.51.0). No
language form here, so the byte law is: `compile()` SVG and `describe()` do not move, for any plan.

## 1. Reproduction

On #366's plan, `compile -f json` then `--from-json`:

- `compile -f json` prints two notes (`Plan JSON carries no arcs…`, `…no paper…`), exit 0.
- `wall w` comes back with five straight points; `summary.bbox_outer` goes from 6300 × 5654.25 to
  6300 × 4300, `gross_internal_area_m2` from 26.6 to 21.09, the SVG from 2435 to 1926 bytes, and
  `summary.sheet` (`A4`, `landscape`, 1:50, `scale_auto: false`) is gone.

On the DXF: `arch compile -f dxf` writes LINE, ARC, TEXT and HATCH, one flat list. ezdxf 1.4.5 reads
today's file without a repair it reports as an error.

## 2. Plan JSON carries arcs and paper

**An arc is a member of the point it arrives at.** `{ "x": 0, "y": 4000, "arc": { "radius": 4000,
"dir": "cw" } }`, with `"major": true` only when the edge takes the long way round. It is the
`.arch` clause, `arc (x,y) radius R [cw|ccw] [major]`, written on the vertex it arrives at, so a
point that leads a wall cannot carry one. Omitting `dir` means `ccw`, as in `.arch`.

- *Alternative:* a parallel `arcs` array indexed by segment, as the IR has. It keeps `points` plain,
  and a reader who walks `points` has to join two arrays to learn what an edge is. Reverse if a
  consumer shows that a member on a point breaks it.
- A point's `x`/`y` stay the arc's end, so a reader who ignores `arc` still sees the chord, what it
  saw before.
- **An older core reads a curved or papered document silently, as the chord with no sheet.** Its
  `reqPoint` ignores extra keys and it has no `paper` case, so `--from-json` there exits 0 and prints
  no note. Only a strict validator of the old schema refuses the document. `version` stays 1: the
  format is additive, and a bump would refuse every document on every old core to warn about these
  two keys. The changelog and the language reference say so.

**`dir` and `major` are read off the resolved arc**, never the AST: a flattened row of a `place`d
instance has been carried through a frame, and a reflection flips the sense. The sign of `sweep` is
`dir`; `|sweep| > π` is `major`. The radius is the resolved one, already on the grid where the plan
has one, and snapping it again on the way back changes nothing.

**`paper` is a member beside `scale`**: `{ "size": "A4", "orientation": "landscape" }`, plus
`"scale_auto": true` when no `scale` was written. `scale` keeps its old meaning, the effective
scale, because a document is append-only. On the way back `scale_auto` means no `scale` line is
written, so the scale is fitted again and `summary.sheet.scale_auto` comes back `true`.

- *Alternative:* always write the effective scale back, so a document is exact about the scale. It
  turns an auto-fitted plan into an authored one, and `summary.sheet` then differs. Reverse if
  someone needs the fitted scale held across a round trip that loses a table.
- An auto-fitted sheet is fitted to what the document carries. A plan that loses a `legend` to the
  document can fit a finer scale on the way back. That loss is already reported in `dropped`.

**`dropped` shrinks**: `arc` and `paper` leave `PlanJsonDroppedClause`. `circle` stays: a circular
room is still a 48-gon, and it is not in this card.

**And gains one row, `column order`.** Taking `paper` off the report uncovered `museum.arch`: it was
reported only for its paper, and it does not come back byte for byte. Its columns stand before its
furniture, the document lists them after, and both draw on one pass, so the same shapes come back in
another order (the SVG's `A-COLS` group moves past `A-FURN`). Nothing was lost that a reader of the
plan would call a fact, but a silent difference is what #366 is about, and the suite's law that the
report speaks exactly when a plan does not come back would have turned false.

- *Alternative:* an exception in the test. It keeps the format smaller and leaves the difference
  unsaid. Reverse if a real plan's report grows noisy with this row.
- *Alternative:* a row order in the document. It costs a key on every payload that has both, for a
  draw order. Reverse if a consumer needs one.

**What does not change.** A plan with no arc and no paper writes the same bytes on the CLI, `batch`
and MCP: every new key is conditional. An old document loads: both members are optional.

## 3. The converter seam

A recipe, not a plugin API: a section of the language reference, under Output formats, and one worked tool in
`tools/plan-to-geojson/`, labelled experimental as the mask recipe is (D18). It reads the document,
needs no package, and writes GeoJSON.

**Why GeoJSON (RFC 7946).** It is a real format with a short specification, it is JSON, so the
tool is about the mapping and not about a file format, and every GIS and web-map library reads it.
Its two awkward rules are the ones any converter meets: the plan's y runs down, and the target has
no arcs, so an arc has to be flattened by a stated rule.

- RFC 7946 §4 fixes WGS 84 unless the parties agree otherwise. A plan has no place on Earth, so the
  tool writes local metres and says so; it does not pretend to georeference anything.
- *Alternatives:* Wavefront OBJ (a wall band is not in the document; `archlang-3d` already writes
  GLB), Graphviz DOT (the access graph alone, no geometry), CSV (a room table has no shape to
  convert). IFC stays out. Reverse if a second converter is asked for and shows what a shared helper
  would have to hold.

## 4. DXF blocks and dimensions

**Scene metadata, not the annotate path.** The DXF is a serializer of the Scene, and a Scene node
names its element only under `annotate`. `toDxf(compile().scene)` is what the CLI and the playground
call, so the facts have to be on that Scene, and it must not change: `Scene.parts` is a
**non-enumerable** lazy getter, as `Scene.walls` is lazy, so `JSON.stringify(scene)` and the SVG do
not see it, and a compile that exports no DXF never computes it. It reads the same
`{ el, from, to }` node ranges the label fit reads.

- *Alternative:* compile `-f dxf` with `annotate`. The playground and any library caller would then
  get a different file from one Scene.
- *Alternative:* an enumerable field. It moves the `scene` payload of every plan.
- A Scene with no `parts` (hand-built, spread, or the axonometric) exports flat, byte for byte what
  `main` wrote. That is a law the tests read: the entity writer did not change.

**Each element declares its own part** (`ElementDef.cadPart`, in `door.ts`, `window.ts`,
`furniture.ts`, `dim.ts`): no switch in the exporter.

**A block is defined once per drawn shape.** Each door, window and catalogued fixture has one
`INSERT`. The nodes it drew are written in its own frame, and two elements whose bytes are then equal
share one `BLOCK`. The frame is the element's position plus a quarter-turn: the host wall's direction
for a door or a window, `rotate` for a fixture. A wall at another angle or a curved one keeps turn 0,
so its block is simply not shared with a turned twin; a float rotation would make the exploded
drawing disagree with the Scene.

- *Alternative:* one block per element, no sharing. It is simpler and gives a CAD user nothing to
  edit in one place. Reverse if the sharing key proves wrong.
- *Alternative:* a block per kind and width, geometry assumed equal. A sill on the other face or a
  hinge on the other side is a different drawing, so equality has to be measured, not named.
- Names: `DOOR-HINGED-900`, `WINDOW-FIXED-1500`, `FURN-SOFA-2000X900`, with `-2`, `-3` for a second
  drawing under one stem, numbered by first use. A `glazed_sliding` door is a door.
- Entities in a block keep their AIA layer, and the `INSERT` stands on the element's layer, so
  freezing `A-DOOR` hides the door either way.
- A cased `opening` and an uncatalogued fixture stay flat: the card names doors, windows and
  catalogued furniture, and an uncatalogued one draws its label.

**A dimension is a `DIMENSION` (rotated linear, type 0) with an anonymous `*D<n>` block** holding
the very entities the flat file drew, in plan coordinates. Rotated, not aligned, because a `dims auto`
chain measures along a baseline while its witness lines start on a stepped facade, which is what a
rotated dimension measures. Written `text` goes in group 1, and so does a figure that is not whole:
the style redraws whole millimetres, which is right for nearly every figure and would turn 12345.68
into 12346. With neither, the reader shows its own measure, so a whole figure follows a stretch in CAD. `dim radius` and `dim diameter` are written this way too, with their `R`/`φ` text, the
measured line being the radius or the diameter: a radial type is residue.

The sizes a reader lays a dimension out by are written twice, in a `DIMSTYLE` row and in `$DIMTXT`,
`$DIMTSZ`, `$DIMEXO` and `$DIMDEC`: LibreCAD redraws a dimension from its points, reads the header
and not the row, and drew each number 2.5 mm high without it. A file with no dimension writes
neither, so a plan with none keeps a shorter header.

**The budget.** Blocks read the nodes `compile()` already allowed. A block holds no block, no `INSERT`
carries an array, and each element costs a constant number of records beyond the entities it drew,
so the file stays linear in what `MAX_DRAW_UNITS` bounds and exploding it gives the flat drawing back.

**Honest claim.** The check is ezdxf, an independent reader. No CAD program is promised unless one
opened the file; the writer has never carried handles or an OBJECTS section, and this card adds
neither. By hand on the card's day, LibreCAD's `dxf2pdf` console mode opened plans with blocks and
dimensions and drew them; that is one reading, not a gate, so the docs do not lean on it. AutoCAD was
not tried.

**The reader test** is `e2e/dxf_check.py`, run `-I` by `npm run check:dxf`, in the `Workspace builds`
job so it gates. With no reader it fails under `CI` and prints a skip locally (`docs/testing.md` §4).
It explodes every `INSERT` and `DIMENSION` and compares the result with the flat file, reads the
counts from `describe()` so it cannot agree with itself, and first proves it can fail, by name, on a
file with one `INSERT` removed and on one with a block a millimetre off.

## 5. Byte law

`compile()` SVG, `compile().scene` as JSON and `describe()` do not move. Over the corpus, the DXF of
a Scene stripped of `parts` equals `main`'s DXF. Plan JSON moves only where a plan has an arc or a
`paper`, and only by the new keys.

## 6. Consequences by surface

- `schemas/plan.schema.json`: `paper`, the wall point's `arc`; descriptions of `scale` and the root.
- `dropped`, the CLI notes, the language reference's table, `CANNOT_ROUND_TRIP`.
- MCP: `compile` returns `dropped` as before, with other rows. The tool's description still names
  "the sheet" and "curves" among what the document does not carry, true of tables and circular rooms
  and no longer of `paper` or an arc. Its rewording needs a shim version bump, so it is left for the
  release.
- Spec: `-f txt = zero-dep ASCII plan, dxf = blocks` (14 units), paid by the opening line's
  `(SVG/PNG/PDF/DXF)` (18 units), which the CLI block states again.
- A consumer of the DXF that read doors as flat lines now reads an `INSERT`. `toDxf({ ...scene })` is
  the flat file.
- The playground: the writer adds 1,534 B gzip to its startup chunks, which takes the sum 301 B past
  the growth budget. No 3D marker is in them, so the baseline is re-taken and the budget stays.
