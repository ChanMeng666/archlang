# Architecture & conventions

The pipeline and the rules that cross modules. Every module (what it is, what it charges, who
imports it) is the generated [`module-map.md`](module-map.md) (`npm run gen:module-map`), built from
each file's own header; the exports of `src/index.ts` are [`public-surface.md`](public-surface.md).
A fact about one module lives in that module's header, not here. The workspace seam allow-list is
[`workspace-seams.md`](workspace-seams.md).


## Pipeline

```
source (.arch)
  └─ src/lexer.ts        → Token[] (byte spans)
  └─ src/parser.ts       → PlanNode (src/ast.ts); recovers, never throws (recovery is guided by
                         the failed statement's indentation); memoised by content
  └─ src/import.ts       links `import`s through the World seam (the one I/O phase)
  └─ src/ir.ts           resolve(): scripting, grid snap, auto-ids, then per group: rooms +
                         relational placement (src/layout.ts), the frozen datum table
                         (src/room-datums.ts; read by `hall.top`-style datums through the
                         evaluator's reader, `withDatumReader`), walls, host openings → ResolvedPlan
                         (`walls from rooms` derives a group's walls from its rooms,
                         src/room-tiling.ts, ADR 0028); ir.ts keeps the entry points and
                         `resolveBody`, its stages live in src/ir/ (types, expand,
                         side-tables, groups, checks, sheet), re-exported by ir.ts
  └─ src/scene-build.ts  toScene() → Scene (src/scene.ts)
       └─ src/wall-lowering.ts  every wall in one joinery pass (geometry/band, intersect, joinery)
  └─ src/view/           toIso(): the axonometric, a sibling of toScene (DEPRECATED, ADR 0021)
  └─ src/backends/       svg (default) · png (optional resvg) · ascii · error-svg
  └─ src/export/         dxf · pdf (optional pdfkit)
  └─ src/pipeline.ts     compileUncached(): the one parse→link→resolve→render pipeline
  └─ src/index.ts        compile() wraps it with the memo cache; the public surface (plus the
                         Node-only `/link` subpath, src/cli/link.ts: share links, zlib)
```

## Conventions

- **`compile()` is pure, synchronous and isomorphic** — no I/O, `Date.now()`, `Math.random()` or
  Node-only API. `src/cli.ts` + `src/cli/` are the only place for Node APIs and real time; everything
  else receives its environment through the `World` seam (`src/world.ts`).
- **Numbers print through `src/num-format.ts`** (`fmt2`/`fmt3`/`fmt4`); output is byte-pinned.
- **The memoised parse-stage `PlanNode` is shared** — anything downstream clones before mutating.
- **Errors are returned, never thrown**, for user-source problems: push a `Diagnostic` with a byte
  `span` and an `E_*`/`W_*` code catalogued in its family file, `src/error-catalog/<family>.ts`
  (`src/error-catalog.ts` merges them); a new site writes `diag(code, …)` (`src/diagnostics.ts`).
- **Adding an element = one module** in `src/elements/` exporting an `ElementDef`, registered in
  `src/elements/defs.ts`; parse/resolve/render dispatch through the registry, never a switch.
  The per-kind code outside it is exhaustive (`tsc` fails on a kind it does not name) and the kind
  sets come from `KIND_FACETS` (`src/elements/facets.ts`); the checklist is `.claude/commands/new-element.md`.
- **Output formats are not a registry seam**: a new one is a row in `EXPORT_FORMATS`
  (`src/manifest.ts`) plus a `case` in `serialize()` (`src/cli/serialize.ts`), which `tsc` demands.
- **`CompileResult` is append-only** — add fields, never remove or rename.
- **Zero runtime dependencies.** Heavy/native deps are `optionalDependencies`, lazily `import()`ed
  with `/* webpackIgnore: true */ /* @vite-ignore */` so downstream bundlers don't resolve them.
- **Coordinates are millimetres**, origin top-left, +x right, +y down. Colours, weights and fonts
  live in `src/theme.ts`. Only the `rendered` theme fills symbols, each in a tint of its family's
  material (`materialTints` over `FIXTURE_FAMILY_MATERIALS`, ADR 0023 as amended); every other
  theme draws outlines only, and its bytes never move with the tints.
- **Opt-in output leaves the default byte-identical** (`annotate`, `accessible`, `--error-svg`,
  heights, `--view`); never emit annotation unconditionally.
- **Heights draw nothing** (`src/datum.ts`): `describe()` and Plan JSON report them only when the
  source authored one, gated by the single whole-plan flag `ResolvedPlan._heightsAuthored`.
  Elevation accumulates the storeys below. **The view measures nothing**: `describe()` never
  imports `src/view/`, and `src/view/` uses no `Math.cos/sin/tan/atan` (not exactly rounded across
  platforms). A view refuses (exit 3) rather than falling back to the plan.
- **`place` resolves an instance in its own frame**, then `frame.ts`'s `transformElement` carries it
  into plan coordinates; never pre-transform a resolver's input. A bare `wing()` call is the legacy
  macro and stays byte-identical.

## Where things live

Core at the root; workspaces `editors/vscode`, `playground`, `docs-site`, `packages/*` share one
lockfile. `docs-site/sync-docs.mjs` copies `docs/*.md` + root artifacts into the site at build time.
The docs site (`docs-site/`, outside the module map's globs) has a home built from `CompileSeam.vue`,
`SameSource.vue`, `WhyCards.vue`, `HowSteps.vue`, `DoorsCard.vue`, `HomeGallery.vue` and
`IsIsntTable.vue`; `/start` and `/3d` are pages.
`eval/` authorability harness, `dataset/` HF dataset generator, `scripts/` generators + smoke,
`bench/` timings. `packages/archlang-3d` is separate and reads a resolved plan through the core's
public seam (ADRs 0030/0031; `.claude/rules/archlang-3d.md`). `site-shared/doors.json` holds every
way in, written into marked "Try it" blocks by `scripts/gen-doors.ts` (`gen:doors`). The playground
Worker (`playground/worker/`, ADR 0034) runs only for `/s/*` and `/api/*`; a plain playground visit
compiles nothing at boot (the default plan is in the served HTML, `playground/scripts/gen-static.mjs`).
Test harness modules importable without vitest, so an older `src/` can be measured with the same
body: `test/helpers/byte-identity-payload.ts`, `test/helpers/byte-identity-digest.ts`, `test/helpers/recovery-metric.ts`,
`test/helpers/shaft-equivariance-models.ts`; `scripts/engine-digests.ts` measures cross-engine determinism.

