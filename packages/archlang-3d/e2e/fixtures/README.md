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

Re-taken by card A9 (2026-10-29) on Windows 11 x64 with the same Chromium build and command: the
end camera of a one-storey view moved from 30° to 45° (`endElevation`, `camera.ts`), so exactly
laneway-house's `tilted` and `end` moved; every `stage:*` frame and all of two-storey's (a combined
view, already 45°) are byte-identical. The Linux entry is added back once CI's `check-3d` renders
the same hashes.

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
