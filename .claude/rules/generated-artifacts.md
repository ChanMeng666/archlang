---
paths:
  - "scripts/**"
  - "src/grammar/**"
  - "src/error-catalog.ts"
  - "src/error-catalog/**"
  - "spec.llm.md"
  - "llms-full.txt"
  - "skills/archlang/SKILL.md"
  - "schemas/**"
  - "grammars/**"
  - "editors/*.json"
  - "docs/error-codes.md"
  - "docs/cli-reference.md"
  - "src/context-size.ts"
---

# Generators and generated artifacts

- The artifact → generator list is `GENERATORS` in `scripts/check-drift.ts`. Edit the source
  (`src/grammar/tokens.ts`, `src/error-catalog/*.ts`, `src/manifest.ts`, `skills/archlang/SKILL.md`, `examples/`, the
  schema constants) and run its `gen:*`; `gen:spec` runs before `gen:llms`, and `gen:llms` (which
  also measures the bundle into `src/context-size.ts`) before `gen:cli`.
- Drift-green proves reproducibility, not correctness: derive every language fact from
  `KEYWORDS`/`RULES`/`buildManifest()`, never retype it, and fail when a source entry has no rendering.
- `packages/font-cjk/*.otf` is generated outside the drift gate (`npm run gen:font-cjk`) and pinned by
  its `.sha256`; never hand-edit it.
