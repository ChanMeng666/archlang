# @chanmeng666/archlang-3d (private, unpublished)

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
- `src/scene3d/`: the types, `scene3d.schema.json` and a zero-dependency validator.
- `src/curves.ts`: arcs to a chord tolerance (default 2 mm).
- `src/mesh/`: Mesh3D — slab, floors, columns, walls (body + sill + lintel per opening), closed door
  leaves, window frame and glass, grey-box furniture, a hidden flat roof; `earcut` (ISC) for caps.
- `src/replay/`: the replay (M1a) — `timeline.ts` (the event table and `stateAt(t)`, pure),
  `payload.ts` (what a replay carries, browser-safe), `mount.ts` (browser: three.js 0.186.1,
  `mountReplay(canvas, payload)` → `seek`/`frameHash`), `viewer.ts` (the HTML's host:
  `__seek`/`__frameHash`), `html.ts` (one offline file), `video.ts` (Playwright's Chromium on
  SwiftShader + ffmpeg).
- `src/glb/write.ts`: the GLB (M1b), written with glTF-Transform from the same Mesh3D: a
  `level:L<n>` node per storey, under it one node per Mesh3D node named `<kind>:<id>[:<part>]`, its
  facts in `extras.archlang`; deterministic bytes.
- `src/check/verify.ts`: V-SCH-01, V-GEO-02, V-GLTF-01 (Khronos glTF-Validator, 0 errors and 0
  warnings) and V-GLTF-02 (the GLB's nodes are the Mesh3D's, named per plan §3.6).
- `src/browser.ts` (`./browser`): `replayPayload` + `mountReplay` + `PREVIEW_LABEL` for a page
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

Tests: `test/*.test.ts` run in the core's `npm test`; heavy tests go in `e2e/*.e2e.ts` and run with
`npm run check:3d` at the repository root. The plan and its cards: `docs/plans/archlang-3d/`,
`docs/plans/preview-and-remodel/`.
