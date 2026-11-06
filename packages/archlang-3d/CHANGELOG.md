# Changelog

## [Unreleased]

### Added

- For a host page whose canvas follows its container (the playground's 3D stage):
  `handle.resize(width, height)` gives the canvas a new drawing size and redraws the last frame at
  it, the same frame a fresh mount at that size draws; `view.spin(degrees)` turns the view about
  its pivot by one step the host chooses (a turntable), taking the view as a drag does; and
  `viewToolbar(view, { compact: true })` puts Reset first and the six presets in a `View ▾`
  popover, every button keeping its name, `data-*` and `aria-pressed`. All three are opt-in: a
  host that never calls them, and the single-file replay HTML, draw and show exactly what they did.
- `viewToolbar(view, { storeys: false })` leaves out the "Storeys shown" buttons, for a host with
  its own storey control (the playground). On by default: the replay HTML's toolbar is unchanged.

### Changed

- The line every surface carries (`PREVIEW_LABEL`) now says what "checked against the plan" means:
  every 3D element comes from the plan's elements, and every solid is closed. The package
  description says the same; the npm page shows the new README at the next publish.

## [0.4.0] - 2026-11-06

The core peer range is now `^1.57.0` (was `^1.45.0`): 1.57.0 is the first core that exports
`treadCount`, which the stairs read. With an older core (npm warns of the peer range) everything
else works as before and no stair is built (`stair-no-flights`).

### Added

- Stairs. A straight stair and a turning stair (flights and landings) are built as stepped solids,
  read from the core's own stair: each flight's rectangle, the edge it is climbed from and the
  number of treads the plan draws on it (the core's new `treadCount` export), so the treads stand
  on the drawing's tread lines. A stair climbs to the floor of the storey above in equal risers, one
  per tread plus one at the head of each flight; a landing stands at the height its flight ends on.
  The flight is as wide as the stair's `width`, centred as the plan centres it, and solid down to
  its floor. The void in the floor above stays where the plan puts it.
- A stair is built once, on the storey it climbs from: a `dir up` stair climbs from its own
  storey, and the `dir down` stop above it is the same stair. A `dir down` stair with no stair of
  its id below is built from the storey below. A `dir up` stair on the top storey climbs that
  storey's height; a `dir down` stair on the lowest storey is not built. Each case is in the
  ledger.
- Stairs are oak, from the palette's `wood` (the core gives a stair no material), and the ledger
  says so (`stair-material-default`), with the solid form (`stair-solid-default`) and each stair's
  riser count (`stair-risers-from-treads`). In the GLB a stair is a `stair:<id>` node under its
  storey, in a `stair` material, its facts (direction, width, flights, risers, rise) in
  `extras.archlang`. In the replay it rises after its storey's walls. `build --json` counts stairs
  per storey.
- Scene3D: a stair carries `flights` (each `at`, `size`, `foot` and `treads`) and `landings`. Both
  are optional, so a Scene3D written before 0.4.0 still validates; its stairs are not built
  (`stair-no-flights`). New exports: `stairSolid`, `stairRisers`, `StairSolid`, `STAIR_MATERIAL`.

### Changed

- A replay of several storeys ends with the storeys assembled: they still rise one by one, each
  lifted 3 m clear of the one below, and once everything is up they come down to their real heights
  while the camera moves to frame the assembled building. The end frame, the Iso view and Reset show
  the storeys stacked; hiding the storeys above one is the cutaway. Every earlier frame is unchanged.
  `ReplayState` gains `settle` (0 while exploded, 1 at the end) and its `stop` runs on to the storey
  count during the settle; `cameraStops` returns one more fit for several storeys (the assembled
  building, last); `boxOfNodes` takes `settle`. New exports: `settledLift`, `stopCount`. A one-storey
  replay is the same in every frame.
- The preview's label is the line every ArchLang surface uses: "Same source, plan and 3D preview.
  The 3D preview is extruded from the same .arch file by the separate archlang-3d package, and
  checked against the plan." (`PREVIEW_LABEL`; its first sentence is `PREVIEW_LEAD`). The replay
  HTML also carries the limits line (`PREVIEW_LIMITS`): walls, openings, floors, stairs and furniture
  in flat colours; no pitched roofs yet, and no sections, elevations or BIM. `PREVIEW_ABOUT_URL`
  is the page that says what the preview shows.
- The side views' buttons are named "View from north" (east, south, west) instead of "North
  elevation" and so on: the 3D preview draws no elevations. The buttons still read N, E, S and W.
- The ledger row `m1-omits-stairs-outdoor-fences` is now `m1-omits-outdoor-fences`, written once
  for outdoor surfaces and once for fences, which are still not built.
- `PREVIEW_ABOUT_URL`, the page that says what the 3D preview shows and does not, is the docs
  site's `https://archlang.uk/3d` (it was this package's npm page). The playground's "What it
  shows" link follows it. The replay HTML does not carry the link, so its bytes are unchanged.

## [0.3.0] - 2026-11-05

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
