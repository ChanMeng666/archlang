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
(`test/mesh.test.ts`, `test/pins.ts`). Linux pending: CI's `check-3d` job (ubuntu-latest x64, the
same Chromium build) must render the same 17 hashes before the Linux entry is added back to
`taken`, the hashes unchanged.

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
