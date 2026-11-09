---
paths:
  - "examples/**"
---

# Editing the shipped examples

`examples/*.arch` is the corpus every byte-identity law, digest table and docs figure sweeps. A new
or changed example is never "just an example"; core-compiler.md also loads for these paths.
- **Editing any `examples/*.arch` moves many corpus-wide suites.** Expect `cursor-exhaustive`,
  `iso-snapshot`, `snapshot`, `visual`, `opening-tags-corpus`, `readme-permalink`,
  `docs-examples-figures`, `example-svgs-drift`, `rooms-tiling-probe`, `taste-digests`,
  `intent-all-storeys`, the
  `*-digests` and `*-byte-identity` suites, `playground/test/llm-prompt.test.ts` and the corpus counts
  written into `packages/archlang-3d`'s tests (light and `e2e/`) to react; CI runs the
  lot, so read its result and explain each moved golden rather than re-pin it. A new lint rule moves a different set:
  `compose-assoc`, `lint-file-provenance`. `hillside-villa`'s prefilled-link budget in the playground
  test is the tightest constraint on that example: deflate output differs by zlib implementation (pako
  and zlib-ng measure 26–35 characters longer than Node/Chromium; the test is skipped on Node 18), so
  trim comments, never plan content.
- **A same-length edit to an example still moves its permalink** (`test/readme-permalink.test.ts`): hashes read the text, not the geometry. Regenerate with `scripts/gen-permalink.mjs`.
- **A new example moves more than the example tables**: the corpus counts in `packages/archlang-3d`
  (`e2e/glb.e2e.ts`, `e2e/replay.e2e.ts`, `test/adapter-corpus.test.ts`, `test/mesh.test.ts`) and the digest
  rows naming it. CI's `check` parts (ci.yml) do not run the e2e half; CI's `check-3d` job runs `check:3d`.
- **Editing `examples/` moves the playground e2e specs** (actions, layout and levels read
  `examples/hillside-villa.arch`) and the docs e2e: CI runs `npm run e2e:playground`; read its result on an
  examples PR (#305).
