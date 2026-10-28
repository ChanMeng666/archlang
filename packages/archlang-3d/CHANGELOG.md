# Changelog

The package is private and unpublished; versions start with its first 0.x publication.

## [Unreleased]

### Added

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
