# Changelog

## [Unreleased]

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
