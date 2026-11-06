---
paths:
  - "packages/archlang-3d/**"
  - "playground/src/preview3d.ts"
  - "playground/e2e/preview3d.spec.ts"
---

# Working on the 3D package (`@chanmeng666/archlang-3d`)

A separate, downstream reader of a resolved plan (ADRs 0030, 0031): adapter → Scene3D → Mesh3D →
the replay (HTML, video), the GLB and their checks. The plan and its cards:
`docs/plans/archlang-3d/`, `docs/plans/preview-and-remodel/`. A map of the code: `DEVELOPMENT.md`.

- It reads the core only through the core's public exports (the seam, ADR 0031); it never becomes a
  core dependency, and the core never gains a 3D option, command or drawing. Need a core fact? Add
  an additive export with its own byte-identity proof, never a deep import.
- Exposure (PS-D11, `docs/plans/public-surfaces/3d.md`): the 3D preview may appear on every ArchLang
  public surface, always beside its plan, from a real `.arch` file, with the PS-D12 line and limits
  line. Never "3D CAD", "BIM", "render", "walkthrough", "photoreal" or "model" as a product claim:
  "3D preview", "drafting-order replay". Never on ArchCanvas surfaces. `PREVIEW_LABEL` is the PS-D12 line and
  `PREVIEW_LIMITS` the limits line (the playground tab, the replay HTML); the package README carries
  both (`test/package-meta.test.ts`). Side views are "View from north" etc., never "elevation". Published at 0.x (D20): a version bump merges, then `gh workflow run release.yml --ref main` publishes it with provenance.
- `exports` and `bin` name `dist/`; the repository reads `src/` (tests, `npm run archlang3d`, the
  playground's alias). A new file a built module reads at run time goes beside `dist/`'s modules in
  `tsup.config.ts`'s `onSuccess`; `e2e/pack.e2e.ts` and `prove:pack` hold the tarball.
- Nothing that produces output reads a clock or a random source; the replay is a pure function of
  `t` (`stateAt`), and `window.__seek`/`__frameHash` stay. three.js is pinned exactly and inlined,
  never from a CDN; no animation library.
- Pins move only with the reason in the commit and the test comment: laneway's Mesh3D and GLB
  SHA-256 (the GLB's with a fixed generator, `test/pins.ts`, so a version bump never moves it), laneway's event table, and the key-frame pixel baseline
  (`e2e/fixtures/README.md`: text-free frames only; `UPDATE_KEYFRAMES` adds an environment, never
  rewrites a mismatch). A change to the default path (closed doors, combined view) must leave them.
- Furniture is T0 (`src/mesh/t0*.ts`; map in `DEVELOPMENT.md`): every catalogued family has a
  generator (`test/t0.test.ts` fails on a grey box for a catalogued word), fitted exactly to the
  footprint, quarter turns only, integer µm. A generator is mirror-symmetric unless the core draws the
  family handed (`T0_HANDED`, `handedAt`); a family handed only by a detail (taps, a plug) is built
  without the detail. Every default (height, mount, material, finish) is ledgered. Material slots
  equal `["body", ...FIXTURE_MATERIALS]` from the core (`test/material-vocabulary.test.ts`): a new
  material lands in the core's table first.
- A local `UPDATE_KEYFRAMES` re-take rewrites `e2e/fixtures/keyframe-baseline.json` without the Linux
  environment entry and in a layout Biome rejects: compare CI's printed hashes, add the Linux entry
  back, `biome format` the file, and cite the run in `e2e/fixtures/README.md`.
- `npm run check:3d` runs the heavy tests (Chromium through `playwright-core`, ffmpeg, glTF-Validator);
  CI runs it on Linux as `3D package (check:3d)`, not a required check. `playwright-core` is imported
  lazily (CI's Node 18 leg runs the light tests).
- A new runtime dependency passes the licence gate (`licences.json`, `npm -w packages/archlang-3d run
  notices` for `THIRD_PARTY_NOTICES`); the deny-list wins over the allow-list.
- The playground tab is lazy: the startup chunks carry no 3D code (`playground/e2e/preview3d.spec.ts`
  says what it guards and why its size budget is what it is).
