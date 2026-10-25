# Reproductions

Minimal sources behind `../evidence.md`. They are evidence, not examples: no test walks this folder.
The defect corpus now lives in `test/defect-corpus/`; these stay as the frozen originals.

Lint as of `main@1f7c544d` (`node dist/cli.js lint <file> --json`, default ruleset):

| File | What it shows | Lint now, and what catches it |
|---|---|---|
| `family-apartment.arch` | Reconstruction of a published AI-generated plan; ten silent defects (`../evidence.md` § 1) | 33 warnings in 11 codes: `W_FIXTURE_BACK_TO_ROOM` 11 (rotation artefacts of the reconstruction; a 12th, on a wardrobe end-on to a wall, was withdrawn by PS2.50), `W_OPENING_AT_JUNCTION` 5 (openings against wall junctions), `W_OPENING_OVERLAP` 2 (window over door, window over window), `W_ROOM_MISSING_DEFINING` 3 (no bed, no tub or shower), `W_ANNOTATION_OVERLAP` 3, `W_BOUNDARY_NO_WALL` 2, `W_WC_SIDE_CLEARANCE` 2, `W_FOOTPRINT_TRANSPOSED` 2, `W_ROOM_VIA_PRIVATE`, `W_WET_ROOM_DOOR`, `W_CONNECTOR_AMBIGUOUS` 1 each |
| `door-on-tee.arch` | A door centred on an exterior-wall T-junction reads as an interior `a↔b` door; a window overlaps it | `W_OPENING_AT_JUNCTION` 2 (door and window), `W_OPENING_OVERLAP`, `W_CONNECTOR_AMBIGUOUS`: the junction and overlap rules catch the spans, the connector rule catches the door that joins no two rooms cleanly |
| `door-beside-tee-window-overlap.arch` | Door moved off the tee; the window still overlaps it by 250 mm | `W_OPENING_AT_JUNCTION` (window on the tee) and `W_OPENING_OVERLAP` (window over the door) |
| `widen-before.arch` / `widen-after.arch` | `let AW` 4000 → 4500 with a relational neighbour: room leaves the shell, partition inside a room, door loses `between` | before: `W_HABITABLE_NO_WINDOW` on `Living` only. After: that, plus `W_ROOM_DISCONNECTED` (door lost), `W_BOUNDARY_NO_WALL` (no partition) and `W_ROOM_OUTSIDE_SHELL` on `Bed` |
| `gallery-bench-pinch.arch` | Bench in a gallery opening leaving about 500 mm diagonally | `W_PATH_TOO_NARROW` (the walk to Gallery B is blocked), `W_FLOOR_UNASSIGNED` 2 (walled floor in no room) and `W_DIM_TEXT_MISMATCH` 2 (its straight window dims are lettered with the width along the arc). Left as a frozen repro |

The impact drill: `archlang impact docs/plans/plan-soundness/repro/widen-before.arch --set AW=4500`
(the same report as `archlang impact …/widen-after.arch --against …/widen-before.arch`). Its complete
human report and JSON are pinned in `test/impact.test.ts`.

Two drills need no file. Apply them to `examples/studio.arch`:

- **Widen:** in `examples/studio.arch`, change `size 4000x6000` on `r_living` to `size 4500x6000`.
- **Lying dimension:** in the same file, change `text "4000"` on the top `dim` to `text "4500"`.
