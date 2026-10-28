# Changelog

The package is private and unpublished; versions start with its first 0.x publication.

## [Unreleased]

### Added

- `--doors plan` (card A7) on `view`, `build` and `check`: each hinged leaf, and each of a `double`
  door's two, stands at the swing the core draws (`doorLeaves`: hinge → open tip, 90° on, its
  40 mm thickness laid inside the quarter-disc). Sliding, barn, bifold, pocket and garage doors sweep
  no leaf in the core and keep their closed panel, ledgered `door-pose-plan-no-swing`. Scene3D's
  `openings[].leaves` gain each leaf's open tip (`[hinge, far jamb, open tip]`). `--json` reports
  `doors`; the ledger states `door-pose-plan` as a user parameter. The default (closed) build and
  the replay's timing are unchanged, byte for byte.
- Mesh finish (card A2b): T0 parametric furniture for the twelve families laneway-house uses (bed,
  sofa, table, rug, wardrobe, fridge, counter, kitchen sink, stove, shower, wc, basin), fitted to
  the plan's footprint and turned by its quarter turn; every other family stays a grey box.
  V-GEO-05 `W3D_FLOOR_OVERLAP`: rooms overlapping by more than 1 cm² are reported and the later one
  lifted 0.5 mm per step (`Floor.lift`). The slab is the rooms ∪ the wall outline less voids, so a
  room outside every wall stands on one. Window glass and frame stay inside their cut on a curved
  host; a wall's body meets its sills and lintels vertex to vertex. A `status demolish` wall (B3a)
  is read from `ir.drawn` into `Level.demolished` and drawn as a translucent ghost node
  `wall:<id>:demolish` (`extras.status` "demolish", its own `wall:demolish` material), never part of
  the standing walls' ownership. laneway-house's Mesh3D and GLB digests and the key-frame pixel
  baseline move with the furniture and the split wall bodies.
- The playground's 3D preview tab (card A5): a `./browser` entry (`mountReplay(canvas, payload)`,
  `replayPayload`, `PREVIEW_LABEL`) so a page builds and mounts the replay itself; the single-file
  HTML's viewer is now a thin host of the same `mountReplay`.

- M1b GLB and checks (card A4): `archlang3d build <plan> -o plan.glb` writes a GLB with
  glTF-Transform from the same Mesh3D the replay reads (a `level:L<n>` node per storey, one node per
  Mesh3D node named `<kind>:<id>[:<part>]`, its facts in `extras.archlang`, deterministic bytes), and
  writes nothing when a check fails. `check`, `manifest --json`, `schema scene3d` and `doctor` join
  `view`, with `--json` and exit codes 0/1/2/3. Checks V-SCH-01, V-GEO-02, V-GLTF-01 (Khronos
  glTF-Validator, 0 errors / 0 warnings) and V-GLTF-02; V-DET-01 over the corpus, laneway-house's GLB
  pinned. The Q20 licence gate (`licences.json`, `THIRD_PARTY_NOTICES`, a deny list starting with
  `straight-skeleton@3`) and a key-frame pixel baseline of the replay's text-free frames, run by the
  new `check-3d` CI job. Adds `@gltf-transform/core` 4.5.1 (MIT, with `property-graph`) and
  `gltf-validator` 2.0.0-dev.3.10 (Apache-2.0) as runtime dependencies.

- M1a replay (card A3): `archlang3d view <plan> --replay -o plan.html [--video out.mp4]`. The plan
  draws itself top-down in its authoring order (D3), the core's own SVG fades in over it, then the
  camera tilts to a 30° perspective while walls rise with their openings and fixtures and furniture
  follow; the roof stays hidden. `timeline()`/`stateAt(t)` are pure; the viewer exposes
  `__seek(t)` and `__frameHash()`; the HTML is one offline file with three.js 0.186.1 (MIT notice)
  inlined; the video is rendered by Playwright's Chromium on SwiftShader and encoded by ffmpeg, its
  key frames' pixel hashes reported (MP4 bytes are not pinned). `--theme dark` for exports only.
  Adds `three`, `playwright-core`, and `esbuild` as runtime dependencies.

- M1a geometry (card A2): `buildMesh(scene)` → Mesh3D, one deterministic triangulation in integer
  micrometres and glTF axes, every shell closed and outward-wound. Scene3D gains each wall's body
  (owned pieces less every opening's cut), each opening's jambs and a door's closed leaves (from the
  core's `doorSwing`/`doorLeaves`), and each storey's wall footprint; arcs are discretised to a chord
  tolerance (`curveTolMm`, default 2 mm). The adapter returns `W3D_MIXED_HEIGHT_JOINT` warnings.
  Adds `earcut` (ISC).

- M0 (preview-and-remodel card A1): the package skeleton, the `resolvePlan` adapter with named
  refusals, per-wall ownership from the core's joinery (H1) with `W3D_MIXED_HEIGHT_JOINT`, Scene3D v0
  (types, JSON Schema, zero-dependency validator), the Node `World`, and the light test suite (corpus
  adaptation, H1 on `s1…s11` and the corpus, orientation, schema agreement, browser safety, the
  downstream contract). `npm run check:3d` runs the (empty) heavy suite.
