# Working on `packages/archlang-3d`

The map of the package for whoever changes it; `README.md` is the npm page. Not shipped.

A downstream reader of a resolved ArchLang plan. ArchLang itself draws plans; this package is separate
([ADR 0030](../../docs/adr/0030-3d-as-downstream-package.md)) and reads the core only through its public
seam ([ADR 0031](../../docs/adr/0031-core-exports-for-downstream-consumers.md)).

It adapts a `.arch` source to a plan-aligned **Scene3D v0** (or refuses by name), and builds from it
the one **Mesh3D** both the viewer and the GLB read (milestone M1a):

```ts
import { adaptPlan, validateScene3D } from "@chanmeng666/archlang-3d";
import { makeNodeWorld } from "@chanmeng666/archlang-3d/node";

const r = adaptPlan(source, { world: makeNodeWorld("examples") });
if (r.ok) validateScene3D(r.scene); // [] — or r.refusal.code: E3D_PLAN_ERRORS | E3D_NO_WALLS | E3D_CORE_TOO_OLD
const mesh = r.ok ? buildMesh(r.scene) : null; // closed, outward-wound shells; integer µm; glTF axes
```

- `src/walls/ownership.ts`: each wall's owned region from the core's `joinWallSet` split (H1), and
  `W3D_MIXED_HEIGHT_JOINT` where a lower wall owns a joint with a taller one.
- `src/scene3d/`: the types, `scene3d.schema.json` and a zero-dependency validator;
  `overlap.ts`: `W3D_FLOOR_OVERLAP` (V-GEO-05), rooms overlapping by more than 1 cm², the later one
  lifted 0.5 mm per step.
- `src/curves.ts`: arcs to a chord tolerance (default 2 mm).
- `src/mesh/`: Mesh3D — slab (rooms ∪ wall outline less voids, `slab.ts`), floors, columns, walls
  (body + sill + lintel per opening, meeting vertex to vertex), demolished walls as translucent
  ghosts (`wall:<id>:demolish`), closed door leaves, window frame and glass kept inside the cut,
  T0 parametric furniture (`t0.ts`: parts over a box, ellipse, rounded or profiled section,
  extruded up or sideways, each in a material slot; the twelve laneway families there, the
  living/bedroom/office batch in `t0-living.ts`, kitchen/bath/utility in `t0-utility.ts`, the
  site (planting, garden, vehicles, terrace, small standing objects) in `t0-outdoor.ts`, office
  and commercial in `t0-office.ts`, the shared part kit in `t0-kit.ts`: every catalogued family)
  and a grey box for a word outside the catalogue, stairs (`stair.ts`: each flight one stepped
  prism, each landing a box, from the Scene3D's `flights` and `landings`, which carry the core's
  `treadCount`; built once per climb, on the storey it climbs from), a hidden flat roof; `earcut`
  (ISC) for caps.
  A wall-hung family hangs at a ledgered mount (`T0_MOUNT_MM`; a television by its top,
  `T0_HUNG_FROM_TOP`); a piece taller than its storey's walls (a tree) is built at its default
  height and ledgered (`furniture-above-walls`, `furniture-hung-above-walls`); a handed one
  (`T0_HANDED`: L-sofa, chaise, grand piano, reception desk; a bicycle or a motorcycle laid along
  its width, `handedAt`) is built reflected when the core's Plan JSON says the plan reflects it
  (`Furniture.mirror`, read by `adaptPlan` through `planToJson`).
- `src/materials.ts`: the material slots and the ONE palette the GLB writer and the viewer both
  read (a T0 piece stays one node; one primitive or mesh per slot), the building's kind colours
  (`KIND_PALETTE`) and the floor finishes (`FINISH_PALETTE`; a room's from its `uses`,
  `floorFinish`, ledgered `floor-finish-default`).
- `src/replay/`: the replay (M1a) — `timeline.ts` (the event table and `stateAt(t)`, pure; several
  storeys rise exploded and settle to their real heights by the end),
  `payload.ts` (what a replay carries, browser-safe), `mount.ts` (browser: three.js 0.186.1,
  `mountReplay(canvas, payload)` → `seek`/`frameHash`; with `interactive: true` the free camera,
  three.js's `OrbitControls`, → `view`), `camera.ts` (the end camera and the stops, and the free
  camera's presets and limits, `presetCamera`, all pure), `view-dom.ts` (the presets', Reset's and
  the storeys' buttons, `viewToolbar`), `viewer.ts` (the HTML's host:
  `__seek`/`__frameHash`), `viewer-bundle.ts` (`viewer.ts` plus three.js as one script), `html.ts`
  (one offline file), `video.ts` (Playwright's Chromium on SwiftShader + ffmpeg).
- `src/glb/write.ts`: the GLB (M1b), written with glTF-Transform from the same Mesh3D: a
  `level:L<n>` node per storey, under it one node per Mesh3D node named `<kind>:<id>[:<part>]`, its
  facts in `extras.archlang`; deterministic bytes.
- `src/check/verify.ts`: V-SCH-01, V-GEO-02, V-GLTF-01 (Khronos glTF-Validator, 0 errors and 0
  warnings) and V-GLTF-02 (the GLB's nodes are the Mesh3D's, named per plan §3.6).
- `src/browser.ts` (`./browser`): `replayPayload` + `mountReplay` + `PREVIEW_LABEL` and
  `PREVIEW_LIMITS` (the PS-D12 line and the limits line, `payload.ts`) for a page
  that shows the replay (the playground's 3D preview tab, card A5); it bundles three.js, so it is
  not `.`.
- `src/node.ts`: the Node `World` and the Node-only builders (replay, GLB, checks), kept out of the
  browser entry.

The command (from the repository root):

```sh
npm -w packages/archlang-3d run archlang3d -- view examples/laneway-house.arch --replay -o laneway.html --video laneway.mp4 --json
```

`archlang3d build plan.arch -o plan.glb --json` writes the checked GLB (exit 2 and nothing written
when a check fails); `check <plan.arch|model.glb>`, `manifest --json`, `schema scene3d` and `doctor`
complete the CLI (exit codes 0 ok · 1 IO/environment · 2 refused or failed · 3 usage).

`view` writes a single offline HTML file (the plan draws itself in its authoring order, the core's own
drawing fades in, then the walls rise) and, with `--video`, a 15 s 1080p30 MP4; `--json` reports the
frame count and the key frames' pixel hashes. Needs Chromium through Playwright and `ffmpeg`.

Licences: every runtime dependency, transitively, is source-checked in `licences.json` (an allow
list at exact versions, and a deny list starting with `straight-skeleton@3`); `test/licences.test.ts`
enforces it and `THIRD_PARTY_NOTICES` is generated from it (`npm -w packages/archlang-3d run notices`).

The build: `npm -w packages/archlang-3d run build` (`tsup.config.ts`; root `npm run build` first, the
declarations read the core's) writes `dist/`, and `prepack` runs it. The repository itself never reads
`dist/`: tests import `src/`, `npm run archlang3d` runs under tsx and the playground aliases the
package to `src/` (`playground/vite.config.js`, `playground/tsconfig.json`). `dist/viewer.iife.js` is
the replay's script, bundled once at build time, so a consumer needs no esbuild;
`npm -w packages/archlang-3d run prove:pack -- --dir <empty dir>` installs the real tarball into an
empty project with a core from npm and uses it from outside (`release.yml` runs it before publishing).

`ARCHLANG_3D_VERSION` is read from `package.json` and stamped into every GLB and Scene3D. The GLB pin
(`test/pins.ts`) is taken with a fixed generator, so a version bump leaves it alone. The public
surfaces' assets are not: `scripts/gen-3d-assets.ts` (root `npm run gen:3d-assets`) writes each listed
plan's poster (`renderStill`, the canvas alone at `__seek(1)`; a storeyed plan whose stair is the
point shows storey 1 alone and adds the assembled frame as `poster-full`), replay MP4 (only for a
plan whose row says `video: true`), GLB and plan PNG (the core's own drawing of that storey through
its PNG path, `renderPng`, the bytes `arch preview` writes) into `docs-site/public/3d/` with a
`manifest.json`, and `e2e/assets.e2e.ts` fails until they are regenerated after a changed plan, a
moved poster frame, a changed GLB content or plan PNG pixels, and on a file there that the manifest
does not list. Another repository runs it from a checkout of this one:
`npm run gen:3d-assets -- --out <dir> --plan <name>=<path.arch>`.

Assets change only when what they show changes. A version bump of the core or of this package
rewrites nothing and fails nothing (the manifest records, per file, the versions that wrote it, and
the check prints an older one as a note). A poster is rewritten when its re-rendered frame hash
moves; a GLB when its content hash moves (the Mesh3D written with a fixed `asset.generator`, so the
version it names is not content); a plan PNG when its decoded pixels' hash moves; an MP4 is
re-encoded only when its plan's source or imports change,
or when `--videos` asks for every one (after a change to the replay or the geometry that the poster
and GLB already show). A file a plan no longer has is deleted, so a regenerated directory holds only
what the manifest lists.

Tests: `test/*.test.ts` run in the core's `npm test`; heavy tests go in `e2e/*.e2e.ts` and run with
`npm run check:3d` at the repository root. The plan and its cards: `docs/plans/archlang-3d/`,
`docs/plans/preview-and-remodel/`.
