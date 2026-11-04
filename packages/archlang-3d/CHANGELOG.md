# Changelog

## [Unreleased]

### Added

- The replay's view turns freely: drag to rotate, scroll or pinch to zoom, right-drag or two fingers
  to pan, and on the focused view the arrow keys rotate and + / − zoom (three.js's own
  `OrbitControls`, inlined from the pinned three.js; no damping under reduced motion). The camera
  stays above the ground and zooms within limits taken from the building's fitted framing. The first
  movement takes the view and pauses the playback; a plain click on the view does nothing. A view
  taken from the replay keeps that frame's aim and framing but switches to the end view's lens, so a
  take in the top-down phase turns a top view in perspective, not the near-flat opening lens; the
  plan drawing that fades over the opening frames is not laid over a taken view. The canvas is an
  interactive element (`role="application"`) whose label says how to move it.
- Preset views: Iso (the replay's end view, exactly), Top, the four elevations from the plan's edges
  (N, E, S, W) and Reset, and, for a plan of several storeys, buttons that hide the storeys above a
  chosen one. A preset holds the view as a drag does (it pauses the playback), and its button shows
  as pressed while it holds. The single-file replay HTML carries them; for a page of your own,
  `mountReplay(canvas, payload, strip, { interactive: true })` returns `view` and `viewToolbar(view)`
  builds the buttons (`./browser`). The presets are plain maths in `.`: `presetCamera`,
  `distanceLimits`, `targetBounds`, `pivotAbove`, `takenLens`, `ELEVATION_RANGE`, `ZOOM`.
- Nothing changes for a replay nobody touches: `__seek(t)` still draws the replay's own frame at `t`,
  and the exported frames and the video are the same.

## [0.2.0] - 2026-11-04

### Changed

- The twelve T0 furniture pieces are drawn in materials instead of one colour per kind: oak, linen,
  wool, upholstery, ceramic, stone, brushed steel, glass and more, from one palette that the GLB and
  the replay both read. Each piece is still one node under its key (`furniture:<id>`); in the GLB it
  holds one primitive per material, named `fixture:<slot>`. The ledger records each family's
  materials (`furniture-material-default`).
- The pieces are more detailed: a bed with legs, a mattress, a duvet with its sheet turned down,
  pillows and a throw; a sofa with rolled arms and separate seat and back cushions; kitchen units with
  fronts, pulls and a stone worktop, a steel sink with its tap, an oven door and a hob with burner
  rings; a shower with a glass screen and a head; a WC and a basin with rounded ceramics. A kitchen
  sink, basin and shower are now ledgered taller (1160, 990 and 2000 mm: tap and screen), a rug lower
  (12 mm).
- A part can have rounded corners (`radius`), lie on its side (`axis`) or follow a polygon
  (`profile`). New exports: `t0Shells`, `t0LocalParts`, `partShell`, `sectionRing`, `T0_MATERIALS` and
  the palette (`PALETTE`, `MATERIAL_SLOTS`, `slotColour`, `slotGroups`, `linearRgb`).
- A small or thin piece keeps every part inside its footprint and its ledgered height; a detail with
  no room is left out, and a hole a part is built without is ledgered (`hole-degenerate`).
- The replay is lit as a model in soft daylight: a sky-and-ground light, one fixed key light and a
  soft fill (no shadow maps; still a pure function of `t`), so a wall's two visible faces read apart.
  Walls are a warm white with their cut tops drawn darker, doors oak, window frames slim and dark,
  glass pale and translucent; outlines are steady instead of stippled.
- Each floor is laid in a finish from its room's `uses`: timber for living, dining, bedroom, office,
  hall and circulation; pale tile for a bath, WC or utility room (whatever else it is) and for a
  kitchen or entry on its own; a neutral finish otherwise. Colour only. The floor node carries it
  (`extras.finish`), the ledger records it per floor (`floor-finish-default`), and the GLB writes it
  as `floor:timber`, `floor:tile` or `floor:neutral`.
- The GLB's building materials now come from the same palette as the replay (`KIND_PALETTE`,
  `FINISH_PALETTE`), and a window's frame and glass are written apart (`window:frame`, and
  `window:glass`, translucent) instead of one `window` material. New exports: `KIND_PALETTE`,
  `FINISH_PALETTE`, `FLOOR_FINISHES`, `FLOOR_FINISH_RULES`, `floorFinish`, `finishColour`,
  `WALL_CAP_SRGB`, and `bodyMaterialName` from `./node`.
- Every catalogued furniture word is built as a T0 piece; none is a grey box any more. Only a word
  outside the core's catalogue still stands as one. New pieces include planting (trees, a conifer,
  shrubs, a hedge, a palm, flower and raised beds), garden and play furniture, vehicles (a car, a
  bicycle, a motorcycle), the small site objects, and office, care and gym pieces. A towel rail
  hangs with its underside at 200 mm and a whiteboard at 900 mm (`furniture-mount-default`).
- `T0_HANDED` now also holds `reception_desk`, `bicycle` and `motorcycle`. A bicycle or a
  motorcycle is handed only laid along its width, as the core draws it; the new export
  `handedAt(family, W, D)` says whether a piece is handed at its size. A piece that is symmetric at
  its size is never greyed when the plan's reflection is unknown.
- A standing piece taller than its storey's walls (a tree in a garden) is built at its default
  height and ledgered (`furniture-above-walls`), never clipped.

### Removed

- **Breaking:** `t0Parts` and its `PlacedPart` type are gone. Use `t0Shells(furniture, floor)`, which
  returns the placed shells (with their material slots) and the count of holes left out, or
  `t0LocalParts(family, W, D)` for the parts in the piece's own frame.

## [0.1.2] - 2026-11-02

### Fixed

- A `door glazed_sliding` from the core no longer fails the scene check. It builds the closed panel a
  `sliding` door builds, so it is not glass in the model, and `door_kind` on the node names it.

## [0.1.1] - 2026-10-31

The first version published through the release workflow, with provenance.

### Fixed

- `archlang3d view --replay` no longer needs a browser for the HTML, as the README always said. In 0.1.0
  it wrote the file and then exited 1 where Chromium was missing. It now exits 0 and says the key frames
  were not measured; `--json` reports `rendered: false`. `--video` still needs Chromium and `ffmpeg`.

## [0.1.0] - 2026-10-31

The first version on npm, published by hand. Versions from 0.1.1 on go through the release workflow
with provenance.

### Added

- `archlang3d view <plan> --replay -o plan.html`: one offline HTML file in which the plan draws itself
  in its authoring order, the core's own drawing fades in, then the walls, openings and furniture
  rise. three.js 0.186.1 is inside the file with its licence notice. A line of plain facts from the
  core's `describe()` and `lint()` sits over the picture. `--video out.mp4` renders a 15 s 1080p30
  video through Playwright's Chromium and `ffmpeg`. `--theme`, `--storey`, `--seconds`, `--fps` and
  `--size` change what it shows.
- `archlang3d build <plan> -o plan.glb`: a GLB with a `level:L<n>` node per storey and one named node
  per mesh part, facts in `extras.archlang`. It writes nothing when a check fails, and the same plan
  and versions give the same bytes.
- `archlang3d check <plan|model.glb>`: the scene schema, closed shells, Khronos glTF-Validator (0
  errors, 0 warnings) and the node names against the plan.
- `archlang3d manifest --json`, `schema scene3d` and `doctor`, with `--json` and exit codes 0, 1, 2
  and 3.
- `--doors plan`: hinged and double doors stand at the swing the core draws. Doors are closed by
  default.
- Plan features carried through: curved walls to a chord tolerance (`--curve-tol`), demolished walls
  as translucent ghosts, furniture in twelve families with a grey box for the rest, and warnings for
  overlapping rooms and for walls of mixed height at a joint.
- The library: `.` (`adaptPlan`, Scene3D, `buildMesh`, the replay's timeline; works in a browser),
  `./browser` (`mountReplay`, `replayPayload`, with three.js) and `./node` (`makeNodeWorld`,
  `replayHtml`, `renderReplay`, `writeGlb`, the checks). `writeGlb(mesh, { generator })` sets
  `asset.generator`, which is `archlang-3d <version>` by default.
- A plan that cannot be read is refused by name: `E3D_PLAN_ERRORS`, `E3D_NO_WALLS`, `E3D_CORE_TOO_OLD`.
- Reads `@chanmeng666/archlang` `^1.45.0` as a peer dependency. `three` and `earcut` are pinned
  exactly, and every runtime dependency is listed in `THIRD_PARTY_NOTICES`.
