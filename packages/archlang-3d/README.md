# @chanmeng666/archlang-3d

3D preview of an [ArchLang](https://archlang.uk) floor plan: a separate package that reads the same
`.arch` source and is checked against the plan. ArchLang itself draws plans; this package leaves
your source and the core's drawing as they are.

From a plan it writes a replay (one HTML file: the plan draws itself, then the walls rise) and a GLB
for any glTF viewer.

## Install

```sh
npm install @chanmeng666/archlang-3d @chanmeng666/archlang
```

Needs Node 20 or newer. The core, `@chanmeng666/archlang`, is a peer dependency at `^1.45.0`. To
follow along, take a plan from the examples the core ships:

```sh
cp node_modules/@chanmeng666/archlang/examples/laneway-house.arch plan.arch
```

## Replay

```sh
npx archlang3d view plan.arch --replay -o plan.html
```

`plan.html` opens offline. three.js 0.186.1 is inside the file with its licence notice, and nothing
is fetched from a network. `--theme dark` and `--storey <n>` change what it shows.

To render a video as well, add a browser and `ffmpeg` on your `PATH`:

```sh
npx playwright-core install chromium
npx archlang3d view plan.arch --replay -o plan.html --video plan.mp4
```

`npx archlang3d doctor` reports what is installed.

## GLB

```sh
npx archlang3d build plan.arch -o plan.glb --json
npx archlang3d check plan.glb --json
```

`build` runs its checks before it writes, and writes nothing when one fails. They hold the GLB to the
plan: its nodes are the ones built from the plan, each named for its element (`wall:<id>`, `door:<id>`,
under a `level:L<n>` node, with its facts in `extras.archlang`), the shells are closed, and Khronos
glTF-Validator reports 0 errors and 0 warnings. The same plan and versions give the same bytes.

What a plan does not state is assumed, and `--json` lists each value under `assumptions`. Doors are
closed unless you pass `--doors plan`. This is a preview of the plan, not a design or construction
document.

`npx archlang3d manifest --json` lists every command and flag, and `npx archlang3d schema scene3d`
prints the Scene3D JSON Schema. Exit codes: `0` ok, `1` IO or environment, `2` the plan is refused or
a check failed, `3` bad usage.

## Library

```js
import { readFileSync, writeFileSync } from "node:fs";
import { adaptPlan, buildMesh } from "@chanmeng666/archlang-3d";
import { makeNodeWorld, writeGlb } from "@chanmeng666/archlang-3d/node";

const result = adaptPlan(readFileSync("plan.arch", "utf8"), { world: makeNodeWorld(".") });
if (!result.ok) throw new Error(result.refusal.code); // E3D_PLAN_ERRORS, E3D_NO_WALLS, E3D_CORE_TOO_OLD
writeFileSync("plan.glb", await writeGlb(buildMesh(result.scene)));
```

| Entry | For | Holds |
|---|---|---|
| `@chanmeng666/archlang-3d` | Node and browsers | `adaptPlan`, Scene3D, `buildMesh`, the replay's timeline |
| `@chanmeng666/archlang-3d/browser` | browsers, with three.js | `mountReplay(canvas, payload)`, `replayPayload` |
| `@chanmeng666/archlang-3d/node` | Node | `makeNodeWorld`, `replayHtml`, `renderReplay`, `writeGlb`, the checks |

## Licence

MIT. Every runtime dependency is listed with its licence in `THIRD_PARTY_NOTICES`.
