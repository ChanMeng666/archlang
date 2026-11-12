# Changelog

## [Unreleased]

### Added

- Doorways, windows and stairs are built in their parts (product-roadmap card RM8.6). Every door
  and cased opening gets a lining on its jambs and head (0.1 of the wall's thickness, 12–25 mm; a
  door's in two halves round a 40 mm slot for its leaf, which keeps its length and place) and a
  casing on each wall face (0.35 t wide, 50–90 mm, 0.1 t proud, 10–20 mm), as parts `lining` and
  `casing` of its node. A barn door has no casing on the face its panel hangs on, a garage door
  none, a door on a curved wall no trim; a casing leg that would stand in another wall, a column,
  standing furniture (a rug is passed through), another doorway or a neighbour's trim is left out,
  never shortened, and a sill or board end that would meet a neighbour's stops at its jamb (every
  omission ledgered). A storey's trim is decided all at once, never in the order the plan writes its
  openings: every casing before any sill or board (a casing beats a horn), and two pieces of the same
  rank that meet are both cut back or left out, so swapping two openings' lines changes nothing and
  a mirror-symmetric plan gets mirror-symmetric trim. Every window gets a reveal
  lining on its inside half (`reveal`, in the frame's colour), an exterior sill proud of the outside
  face and past each jamb by 0.2 t, as the core draws it (`sill`, pale stone), and an interior board
  (`board`, oak); the outside is the core's own rule (`insideOf`, one wall thickness off each face).
  A stair is tread boards with open risers and solid landings (its own node), two stringers a flight
  (`stringer`) and a balustrade on each edge the probe finds open (`rail`, walnut: a sloping
  handrail 900 mm over the nosing line, a baluster a tread, a newel at each end; a level rail
  1000 mm over the stretches of a landing edge that no flight arrives on and no wall closes). Every size is a clamped share of the wall's thickness or the
  stair's own riser, going and width (`OPENING_DETAIL`, `STAIR_DETAIL`) and ledgered per opening
  and per stair; `stair-solid-default` is gone. New exports: `storeyTrim`, `insideOf`,
  `OPENING_DETAIL`, `stairDetail`, `STAIR_DETAIL`, `STAIR_RAIL_MATERIAL`.

### Changed

- A tree's, a plant's and a shrub's crown and a bean bag are one lofted shell through the dome's
  rings (`Part.loft`) instead of stacked round tiers, so they read smooth (backlog VA.1). The
  conifer keeps its tiers.

## [0.6.0] - 2026-11-12

The core peer range stays `^1.57.0`. The wall-joint fix below is the core's, so it takes core 1.59.0;
with an older core in the range those walls build as before.

### Added

- `renderReplay({ supersample: k })` (from `@chanmeng666/archlang-3d/node`; `VideoOptions.supersample`)
  draws each frame as the rounded mean of k × k renders shifted by fractions of a pixel, a whole
  number from 1 to 4, so edges are anti-aliased; 1, the default, draws as before. The replay page
  reads it from `ReplayPayload.supersample`, which `replayPayload` never sets: it is for offline
  generation, and a live page that sets it draws every frame k × k times. The posters and replay
  videos on archlang.uk are generated with 3 × 3 and 2 × 2.
- Outdoor surfaces and fences are built. Each of the nine `outdoor` kinds is a 50 mm slab whose top
  is its storey's floor level (Mesh3D kind `outdoor`, node `outdoor:<id>`, stage `brief`), in a
  colour from the core's theme: the tint the drawing fills it with (`lawn`, `paving` or `water`,
  `GROUND_TINT`) laid on six times over the theme's paper (`GROUND_WASH`), so lawn is #99b76f,
  paving #ab9f87 and water #699fc3. Four kinds the drawing tells apart only by hatch get colours of
  their own (`GROUND_SPLITS`, `SITE_PALETTE`): planting, deck, gravel and driveway. A surface never
  lies in the plane of a face it overlaps: over the slab it stands a step (0.5 mm) above the slab's
  top, over an earlier surface a step above that one, and a step more where it would meet a floor's
  bottom or top. Each `fence` (kind `fence`, stage `walls`, rising with the walls) has a post on
  every tick the core draws (round(run / pitch) divisions, 1 to 60, `fencePosts`) and its style's
  rails: a picket fence two rails and pickets, 1000 mm; a panel fence one board, 1800 mm; a
  post-and-rail fence a top rail, 1100 mm (`FENCE_PROFILES`, `FENCE_HEIGHT_MM`, `FENCE_PALETTE`).
  A fence whose points are all one point builds nothing. The colour rides on the node
  (`extras.colour`), and the GLB writes it as `outdoor:<kind>` and `fence:<style>`. Every default
  is in the ledger (`outdoor-thickness-default`, `outdoor-colour-wash`, `outdoor-colour-theme`,
  `outdoor-colour-3d`, `outdoor-overlap-lift`, `outdoor-rail-omitted`, `fence-height-default`,
  `fence-profile-default`, `fence-colour-default`, `fence-no-run`), in place of the two
  `m1-omits-outdoor-fences` rows. A balcony's railing is not built.
- The replay stands the building on a ground plane: a backdrop the viewer draws, not part of the
  building and not in the file (no Mesh3D node, not in the GLB). Its top is the lowest storey's
  floor level, so a garden lies flush in it, and it reaches 6 m past everything drawn
  (`GROUND_PLANE`, `ReplayPayload.ground`); it fades in as the core's drawing fades out
  (`ReplayState.ground`, 0 to 1). A view of an upper storey on its own draws no ground. Every
  Mesh3D says so in one ledger row, `ground-plane-viewer-only` (the storey, the margin, the light
  and dark colours). A plan without outdoor surfaces or fences builds the same nodes and the same GLB
  as before.
- `PREVIEW_LIMITS` names outdoor surfaces and fences, the ground backdrop and the balcony railings
  that are not built.

### Changed

- three.js 0.187.0 (was 0.186.1), pinned exactly and inlined into the replay HTML with its MIT
  notice, as before.

### Fixed

- `mountReplay` no longer draws a line on a flat wall surface where two wall pieces meet: beside a
  door or a window only the reveal between sill and head is outlined; the flat back of a T
  junction, the outer face of an L corner made of two walls and the joint of two walls in line
  carry no line, and no line cuts across a wall top there. The inside corners of a T or an X
  junction keep their lines. The walls' and columns' outlines are worked out across each storey
  (`src/replay/wall-lines.ts`) in place of three.js's `EdgesGeometry` per node, which every other
  node keeps. The faces two pieces share are not drawn either (they showed through a flat wall at
  a grazing angle): inside one wall always, and between two nodes once the walls and columns connected
  to it on the same storey are all up, so while the replay raises the walls each is drawn whole and no
  frame shows a gap. Known limit: during the rise, a face two walls share can still show a faint
  seam at a grazing angle; the finished storey has none. The
  playground's 3D tab, the replay HTML and the generated posters and videos all draw this way;
  Mesh3D, the GLB and Scene3D are unchanged.
- With core 1.59.0, walls that come within 0.015 mm of meeting no longer build a triangular piece
  next to the joint, or keep a slanted edge a few µm long: the core's wall joinery now closes those
  outlines (core `CHANGELOG.md`, 1.59.0, Fixed). No shipped plan hits it: every Mesh3D and GLB over
  the corpus is byte-identical.

## [0.5.0] - 2026-11-11

The core peer range stays `^1.57.0`. The rooted `import` below works with any core in it; with
1.58.0 or later a refused module reports the core's own refusal code.

### Breaking

- `archlang3d build`, `check` and `view` can now refuse a plan they built under 0.4.0: an `import`
  outside both the working directory and the plan's own directory, one that is not a `.arch` file,
  or one over 1 MiB is refused (exit 2, the refusal under `E3D_PLAN_ERRORS`; Fixed, below). The
  CLI has no flag to widen the root: run it from a directory that contains the module. A program
  can pass a wider root as the second argument of `makeNodeWorld(baseDir, root)` from
  `@chanmeng666/archlang-3d/node`. Nothing widens the `.arch` or 1 MiB rule.

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
- A `winders` landing (core 1.58.0) is built as a level landing for now: its tapered steps are not
  built yet.

### Fixed

- An `import` is rooted like the core CLI's: `makeNodeWorld(baseDir, root?)` (and so `archlang3d build`, `check` and `view`) reads a module only from under `root` (default: the working directory) or `baseDir`, with links and junctions followed, only a `.arch` file, and only up to 1 MiB. A refused module is the core's `E_IMPORT_OUTSIDE_ROOT`, `E_IMPORT_NOT_ARCH` or `E_IMPORT_TOO_LARGE` at the `import` (reported through `E3D_PLAN_ERRORS`); with a core older than 1.58 the refusal reads as `E_IMPORT_NOT_FOUND`; the file is still never read. Before, any path an `import` named was read.

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
