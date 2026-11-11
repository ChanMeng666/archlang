# Heavy-test fixtures

`keyframe-baseline.json` — the replay's key-frame pixel baseline (`../keyframes.e2e.ts`; Q21,
plan §6.7). SHA-256 of the composed frame's RGBA pixels (`window.__frameHash()`) for the
text-free key frames (those where `stateAt(events, t).svg === 0`, so the core's drawing, the only
layer with text and the only one that depends on installed fonts, is invisible) of
`laneway-house` and `two-storey` (combined view) at 480 × 270, rendered by the locked
`playwright-core`'s Chromium on SwiftShader. `taken` lists every environment (platform, CPU
architecture, Chromium build) in which these exact hashes were rendered.

How it was taken: `UPDATE_KEYFRAMES=1 npx vitest run --config vitest.e2e.config.ts
e2e/keyframes.e2e.ts` in `packages/archlang-3d`, which writes the file with the environment it ran
in. Never rewrite it to turn a red run green: a changed hash needs the reason (a Mesh3D, viewer or
Chromium change) in the commit that re-pins it.

Extended by RM8.3's review round 1 (2026-11-11, PR #701, S6): a site plan joins the set,
`courtyard-house` at two frames only (`ONLY` in `../keyframes.e2e.ts`): `tilted` (`7aa10eed…`, the
walls still rising) and `end` (`d17207c4…`). Its patio lies over the slab, where a top in the slab's
plane once fought it in depth (review B1); it now stands a step above it. The two hashes are the ones
CI's `check-3d` job printed for the PR's head `ecc5a5e8` (GitHub Actions run
https://github.com/ChanMeng666/archlang/actions/runs/42965016062, job 130340145125, ubuntu x64),
where the two missing frames were the only failure; they were not rendered locally. The same run
rendered all 17 hashes of laneway-house and two-storey unchanged: the ground now fades in with the
drawing (drawn as a translucent face until opaque), and from `PHASE.svgOut` on, which every pinned
mid-rise and end frame is past, it draws the very pixels it drew before.

Re-pinned by product-roadmap card RM8.3 (2026-11-11, PR #701, the site and the ground plane): the
replay now stands the building on a ground plane the viewer draws round it (`GROUND_PLANE`,
`src/materials.ts`; in no Mesh3D node and not in the GLB), its top at the lowest storey's floor
level, shown from `PHASE.rise` (`ReplayState.ground`), while the core's drawing still covers the
frame. Neither plan has an outdoor surface or a fence, so their Mesh3D nodes, GLBs and event tables
are unchanged (laneway's Mesh3D pin moved by its ledger alone, `test/mesh.test.ts`); only the
viewer moved. Exactly 7 frames moved, every text-free frame from the start of the rise on, in which
the ground shows: laneway-house `tilted` (`4ee99c61…` → `7eb82778…`) and `end` (`6c71b020…` →
`e2a98a0e…`); two-storey `stop:1` (`f413d540…` → `697d5887…`), `tilted` (`60be5619…` →
`e64d4d9b…`), `storey:2` (`f12761a3…` → `f2fab198…`), `stop:2` (`1d01b28a…` → `9ec0b815…`) and
`end` (`70a864cb…` → `5485e3d0…`). Every `stage:*` frame of both plans (the top-down phase, before
the ground shows) keeps its hash. The 7 new hashes are the ones CI's `check-3d` job printed for the
PR's head `f20e56b4` (GitHub Actions run
https://github.com/ChanMeng666/archlang/actions/runs/42957831251, job 130317092237, ubuntu x64),
where the key-frame comparison was the only failing test; they were not rendered locally. Every
other hash and both `taken` entries are unchanged, as in card RM8.1's re-pin.

Re-pinned by product-roadmap card RM8.1 (2026-11-11, PR #691, the walls' outlines): the walls and
columns are no longer outlined node by node (three.js's `EdgesGeometry` on each prism), which drew
a line wherever two pieces met on one flat surface; their outline is worked out across each storey
and drawn only where the surface turns (`src/replay/wall-lines.ts`). The faces two pieces share are
left out: inside one wall always, and between two walls (or a wall and a column) once the walls
meeting there are all up; while the replay raises them each is drawn whole, so no frame shows a
slot (review R1, B1). Mesh3D, the GLB and the event table are unchanged; only the viewer moved.
Exactly 13 frames moved, every frame in which a wall is shown: laneway-house `stage:walls`
(`8b624649…` → `fc9b26f9…`), `stage:openings` (`7ff8995d…` → `a7ecb187…`), `stage:fixtures`
(`06853432…` → `11b9a693…`), `tilted` (`df6661df…` → `4ee99c61…`) and `end` (`c4517a8e…` →
`6c71b020…`); two-storey `stage:walls` (`164f78b8…` → `6322f00b…`), `stage:openings` (`1d3dabce…` →
`2ac49bb5…`), `stage:fixtures` (`48c287a3…` → `aed4a38a…`), `stop:1` (`0d781879…` → `f413d540…`),
`tilted` (`92324745…` → `60be5619…`), `storey:2` (`52bdc549…` → `f12761a3…`), `stop:2`
(`60d5fc32…` → `1d01b28a…`) and `end` (`c029568d…` → `70a864cb…`). From `stage:walls` on the walls'
footprints are drawn, flat, and their outlines no longer cut across a wall's top where two pieces
join, so those frames move with the rest. `stage:brief` and `stage:rooms` of both plans (the slab
and the floors, no wall yet) keep their hashes. The 13 new hashes are the ones CI's `check-3d` job
printed for the PR's head `d1038441` (GitHub Actions run
https://github.com/ChanMeng666/archlang/actions/runs/42931433003, job 130230923132, ubuntu-26.04
x64), where the key-frame comparison was the only failing test; they were not rendered locally.
Every other hash and both `taken` entries are unchanged, as in card X2's re-pin.

Re-pinned by public-surfaces card X4's follow-up (2026-11-06, the storey joint): a wall or column
wholly under the slab of the storey above now stops at that slab's underside
(`stops-under-slab-above`, `src/mesh/build.ts`). Before, storey 1's walls rose to storey 2's floor level, through the 200 mm
of storey 2's slab, so the slab's edge and the wall's outer face were coplanar over that band and
fought in depth: a thin diagonal sliver along the storey joint in the assembled view (the X4
posters of two-storey and turning-stair, 1600 × 900). Now the slab's edge is the band between the
storeys, as the ground slab is under storey 1. A one-storey plan has no storey above, so nothing
of laneway-house moves (its Mesh3D and GLB pins hold; all seven of its frames rendered the same).
Rendered locally (Windows 11 x64, the same Chromium build, the same `render` as
`../keyframes.e2e.ts`), exactly five frames move, all of two-storey and all after its storey-1
walls have risen: `stop:1` (was `446f42c2…`, now `0d781879…`), `tilted` (`281d6cf0…` →
`92324745…`), `storey:2` (`a842a681…` → `52bdc549…`), `stop:2` (`ee31f6b2…` → `60d5fc32…`) and
`end` (`2801716e…` → `c029568d…`). `stage:brief` … `stage:fixtures` keep their hashes: the walls
are still flat footprints there. The five new hashes are the ones CI's `check-3d` job printed for
this branch (GitHub Actions run https://github.com/ChanMeng666/archlang/actions/runs/42153991108,
job 127683691654), the same five the local render gave; every other hash and both `taken` entries
are unchanged. The review's exact footprint test (a wall stops only when its whole plan, not its
corners, lies under the slab above) stops the same walls on two-storey, so its Mesh3D and these
frames hold.

Re-pinned by public-surfaces card X3 (2026-11-06, stairs; on top of X2's settle): two-storey's
stair is built now (one `stair` node on storey 1, a stepped solid in the `wood` palette colour,
stage `walls`), so its footprint appears in phase 1 after the storey's walls and it rises with
them. Exactly six frames moved, all of two-storey: `stage:openings` (was `c5e33ae9…`),
`stage:fixtures` (`a9850073…`), `stop:1` (`58b2de1f…`), `tilted` (`827be4d2…`), `storey:2`
(`d96412c2…`) and `stop:2` (`7a2c8d11…`). `stage:brief`, `stage:rooms` and `stage:walls` keep
their hashes: the stair is not yet visible there, and every other node's state is the same (their
times move, from 0.0211 to 0.0200 and 0.0842 to 0.0800, because one more node shares phase 1;
`stage:openings` from 0.1474 to 0.1600, `stage:fixtures` from 0.2947 to 0.3000). `end`
(`2801716e…`) keeps its hash although the stair is visible in its state: in X2's assembled end
frame the stair stands on storey 1 under storey 2, along the west wall, and storey 2's slab and
walls hide it from the iso camera. Measured, not argued: rendered locally with and without the
stair node, the end frame hashes the same at 480 × 270 and at 1280 × 720, and hiding storey 2 at
`t = 1` (the toolbar's "1") shows the stair in place, so it is built in the assembled view and only
occluded. A browser-free sweep of the event table and each key frame's `stateAt` (with and without
the stair node) had named seven frames where the stair is visible; `end` is that seventh, and no
pixel of it changes. laneway-house has no stair: its event table and all seven of its frames are
unchanged. The six new hashes are the ones CI's `check-3d` job printed for this branch (GitHub
Actions run https://github.com/ChanMeng666/archlang/actions/runs/42147866382, job check-3d), and a
local Windows 11 x64 render with the same Chromium build gave the same six, byte for byte; every
other hash and both `taken` entries are unchanged.

Re-pinned by public-surfaces card X2 (2026-11-06, storeys stack): a replay of several storeys
now ends assembled. The storeys still rise exploded (3 m apart, with the camera stops); from
`PHASE.done` to `t = 1` they come down to their real heights and the camera moves from the last
stop to a fit of the assembled building (`stateAt`'s `settle`, `cameraStops`'s last fit). Exactly
one frame moves: two-storey's `end` (it was `7a2c8d11…`, the same hash as `stop:2`; it is now the
assembled building, a different frame). Every other frame is unchanged by construction: each sits
at `settle = 0` with the same state, the same camera and the same clip range (the viewer keeps the
rise's clip radius until the settle starts), as a browser-free sweep of every corpus plan and view
showed (the event table, the payload, and each key frame's `stateAt` and `frameCamera` hashed
before and after: only the combined view's `end` of the five multi-storey plans moved, and only by
`stop`, `settle` and the camera). laneway-house (one storey) has no settle. The new `end` hash was
not rendered locally (the heavy suite is CI's): it is the hash CI's `check-3d` job printed for
two-storey `end` (GitHub Actions run https://github.com/ChanMeng666/archlang/actions/runs/42143593654, job check-3d), entered with every other hash and both `taken`
entries unchanged.

Re-taken by visual-assets card V9 (2026-11-04, viewer polish) on Windows 11 x64 with the same
Chromium build and command: the replay is lit and coloured anew, so every one of the 17 frames
moved, by design: a hemisphere light (warm-white sky over a warm-grey ground), one fixed key and a
soft fill replace the ambient light and the single sun, under three.js's neutral tone mapping; the
building's colours are the shared palette (`KIND_PALETTE`, `src/materials.ts`, which the GLB now
reads too: slab, walls, doors, window frames and glass); each floor is laid in its room's finish
(`FINISH_PALETTE`: timber, tile, neutral, by `uses`); a wall's cut top is drawn in the cap colour;
and every face is pushed back by a polygon offset so the outlines no longer stipple. The background
is unchanged (`#f7f5f0`). `stage:brief` (the slab alone) moves with the lights and the slab colour,
every later frame with all of the above. The geometry did not move: laneway's GLB binary chunk is
byte-identical and its Mesh3D differs only by each floor's `extras.finish` and ledger entry
(`test/mesh.test.ts`, `test/pins.ts`). CI's `check-3d` job (ubuntu-latest x64, the same
Chromium build; GitHub Actions run 41684705914) then rendered the same 17 hashes, byte for byte,
and failed only because Linux was not listed; the Linux entry was added back with the hashes unchanged.

Re-taken by visual-assets cards V5/V6 (2026-11-04, PR #461, red-team round 1 S3) on Windows 11 x64
with the same Chromium build and command: the stove's oven door is now an `appliance` part with a
dark `screen` window (it was one `screen` part), so the 3D stove carries the core's `stove`
material (`FIXTURE_FAMILY_MATERIALS`, visual-assets V-D2: 2D and 3D agree). Exactly five frames
moved, all of two-storey: `stop:1`, `tilted`, `storey:2`, `stop:2`, `end`. Every other frame is
byte-identical: every `stage:brief` … `stage:openings` frame of both plans, two-storey's
`stage:fixtures`, and all seven of laneway-house's (`stage:brief` … `stage:fixtures`, `tilted`,
`end`: measured, its stove changes no pixel of them at 480 × 270, though its Mesh3D and GLB pins
moved). The V5/V6 families themselves moved nothing here (neither plan draws one).
CI's `check-3d` job (ubuntu-latest x64, the same Chromium build; GitHub Actions run 41667703279)
then rendered the same 17 hashes, byte for byte, and failed only because Linux was not listed; the
Linux entry was added back with the hashes unchanged.

Re-taken by visual-assets cards V1–V3 (2026-11-04) on Windows 11 x64 with the same Chromium build
and command: the twelve T0 furniture generators were refined (rounded and sideways parts, more
detail) and each part is drawn in its material slot's colour from the shared palette
(`src/materials.ts`) instead of one colour per kind, so exactly the frames in which furniture shows
moved (laneway-house `stage:fixtures`, `tilted`, `end`; two-storey `stage:fixtures`, `stop:1`,
`tilted`, `storey:2`, `stop:2`, `end`), the same nine A2b moved; every `stage:brief` …
`stage:openings` frame of both plans is byte-identical (a run before the re-take listed exactly
those nine as mismatched). CI's `check-3d` job (ubuntu-latest x64, the same Chromium build;
GitHub Actions run 41650864669) then rendered the same 17 hashes, byte for byte, and failed only
because Linux was not listed; the Linux entry was added back with the hashes unchanged.

Re-taken by card A9 (2026-10-29) on Windows 11 x64 with the same Chromium build and command: the
end camera of a one-storey view moved from 30° to 45° (`endElevation`, `camera.ts`), so exactly
laneway-house's `tilted` and `end` moved; every `stage:*` frame and all of two-storey's (a combined
view, already 45°) are byte-identical. CI's `check-3d` job (ubuntu-latest x64, the same Chromium
build; GitHub Actions run 40794082579) then rendered the same 17 hashes, byte for byte, and failed
only because Linux was not listed; the Linux entry was added back with the hashes unchanged.

Re-taken by card A2b (2026-10-28) on Windows 11 x64 with the same Chromium build and command: the
T0 parametric furniture replaced the grey boxes, so every frame in which furniture shows moved
(laneway-house `stage:fixtures`, `tilted`, `end`; two-storey `stage:fixtures`, `stop:1`,
`tilted`, `storey:2`, `stop:2`, `end`) and none before it (`stage:brief` … `stage:openings`
are byte-identical, so the split wall bodies changed no pixel). CI's `check-3d` job (ubuntu-latest x64, the same
Chromium build; GitHub Actions run 40638897953) then rendered the same 17 hashes, byte for byte,
and failed only because Linux was not listed; the Linux entry was added with the hashes unchanged.

The baseline before A2b (card A4, 2026-10-28): taken on Windows 11 x64 (Chromium 156.0.8078.4 from
`playwright-core` 1.64.1, SwiftShader) with the command above. The first run of CI's `check-3d`
job (ubuntu-latest x64, the same Chromium build; GitHub Actions run 40621260478) rendered the same
17 hashes, byte for byte, and failed only because Linux was not yet listed; the Linux entry was
then added to `taken` with the hashes unchanged. So the text-free frames are identical across these
two platforms; frames with text (the core's drawing) were never compared across machines.
