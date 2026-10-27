# 30. 3D is a downstream package: `archlang-3d` reads resolved data, the core never draws the building

- **Status:** Accepted 2026-10-28 with the PR that creates `packages/archlang-3d` (preview-and-remodel
  card A1). Drafted as `docs/plans/archlang-3d/adr-draft-0030-3d-as-downstream-package.md` (v0.6,
  2026-10-24) and amended by `docs/plans/archlang-3d/amendment-v0.7.md` (2026-10-28: the M1 recut and
  the exposure tiers, which rewrite Decision 1 and reopen Q1's "private until the release milestone").
- **Date:** 2026-10
- **Owner decisions recorded:** Q1–Q22 of the archlang-3d plan (2026-10-23 and 2026-10-24) and the
  preview-and-remodel decisions D1, D2, D5 (2026-10-28). The full table, each with its reason and
  reversal condition, is in the draft and in `docs/plans/archlang-3d/development-plan.md` §10.
- **Extends:** [ADR 0021](0021-plan-first-view-deprecated.md) (plan-first; the third dimension goes
  through data, not a drawing backend). It refines that ADR's decision 5 and reverses none.
- **Relates to:** [ADR 0018](0018-zero-dep-wall-joinery.md) (one wall joinery),
  [ADR 0005](0005-no-invisible-architect.md) (refuse, never choose),
  [ADR 0015](0015-cli-as-agent-interface.md) (the CLI is the agent interface),
  [ADR 0028](0028-rooms-primary-derived-walls.md) (derived walls),
  [ADR 0031](0031-core-exports-for-downstream-consumers.md) (the core exports this package reads,
  their stability level and the downstream contract); backlog P3-2 (IFC export).
- **Scope:** a separate package, `@chanmeng666/archlang-3d` (command `archlang3d`), that turns a resolved
  plan into a 3D scene and, in later milestones, a GLB, an IFC file, a viewer and renders. **Not in
  scope:** any change to `compile()`, the SVG/PDF/DXF backends, the language, `describe()`/`lint()`, or
  the removal of `--view`.

## Context

ArchLang draws floor plans. ADR 0021 deprecated the axonometric view (no checked claim, no consumer,
off-positioning, a maintenance surface) and named the forward path: "the third dimension … is data, not
drawing", read by "a tool that consumes the export". Two things have changed:

1. **A consumer exists.** The promo film's 3D house was built by hand: opening positions and furniture
   footprints copied from the compiled plan into a script, heights typed in. The data it copies is
   already resolved by the compiler.
2. **The resolved data is richer than Plan JSON.** A feasibility spike over `examples/` found Plan JSON
   lossy for 3D: 13 of 34 examples need information it does not carry (arc walls flattened to chords,
   derived walls absent, no storey elevation, no stairs, voids, roofs, outdoor surfaces or fences),
   while the library API carries all of it (`RWall.arcs`, `height`, `elevation`/`storeyHeight`,
   `RStair`, `RRoof.ring`, derived walls). A downstream re-implementation of wall bands matched the
   core's own joinery at IoU ≥ 0.99 on 29 of 35 comparable plans and diverged on every arc-wall plan
   (worst 0.46): feasible, and exactly the divergence ADR 0018 exists to prevent.

What 3D needs and a plan lacks (slab thickness, roof pitch, furniture height and model, materials,
door-leaf pose) are defaults, not facts.

## Decision

1. **`archlang-3d` is a separate, downstream package.** The core does not depend on it, import it or
   draw anything for it. Exposure follows acceptance gates, not dates (amendment v0.7, decision D5):
   nothing public until the replay viewer is accepted; then, on the owner's word, a playground toggle
   labelled "Preview — from the separate archlang-3d package. ArchLang itself draws plans." and the
   owner's own posts; the docs site and landing pages only at the release milestone. ArchLang remains a
   plan language.
2. **It reads already-resolved data through public surfaces.** Primary input: `resolvePlan(source,
   { world })` from the core's root (ADR 0031), which links imports; the `compile().ast` → `resolveAll`
   route silently drops imported content. Plan JSON is a secondary input accepted only for the subset it
   represents faithfully and refused explicitly otherwise.
3. **One footprint authority.** Wall footprints come from the core's joinery: `joinWallSet` with
   `split.faceOf` giving each wall its owned region (hypothesis H1, verified on 45 plans and now held by
   the package's tests). The package writes no second wall joinery.
4. **One geometric truth downstream.** A plan-aligned `Scene3D` (integer micrometres, plan axes with y
   down, z up; handedness resolved only by exporters) and the mesh built from it feed every backend: the
   viewer, the GLB, the IFC file. IFC (backlog P3-2) is a backend of this package, not a core feature.
5. **No invisible architect.** Every value the plan does not state — slab thickness (200 mm), roof form
   (flat; a pitch only when asked for), door pose (closed), furniture heights and models — is a labelled
   default or an explicit parameter, recorded in an `assumptions[]` ledger with its provenance and
   surfaced in every output. Mixed wall heights at a joint keep the core's ownership and are reported
   (`W3D_MIXED_HEIGHT_JOINT`), never silently repaired.
6. **Sun is visualisation only** and lives downstream, from user-supplied latitude, date and time,
   labelled "illustrative, not a daylight analysis".
7. **The model is checked against the plan.** Every element carries a `source` back to its plan
   element; the build checks floor areas, footprints, openings and furniture against the plan before it
   emits anything.
8. **Determinism is part of the contract.** Identical inputs give a byte-identical scene and GLB (no
   clock, no randomness, stable order). Rendered images and video are not byte-pinned; their key frames
   are compared by pixels on a pinned Chrome.
9. **External renderers stay external; licences are read, not trusted.** Nothing GPL enters the
   dependency graph; a dependency's licence is checked against the code it wraps; the package is MIT and
   its asset pack CC0-1.0.
10. **Packaging.** Incubated as `packages/archlang-3d`, `private: true`, `engines.node >=20`. Light tests
    in `test/*.test.ts` run in the core's `npm test` (measured: picked up by vitest and by
    `check:test-wiring`); heavy tests in `e2e/*.e2e.ts` (not `.test.ts`, so the wiring gate ignores them)
    under their own vitest config, run by `npm run check:3d`, never by `npm run check` or
    `prepublishOnly`. The package is added to `typecheck:all`. A first 0.x publication, when the owner
    decides it, uses the tokenless OIDC procedure.
11. **Interface conventions follow ADR 0015**: `--json` on every command, exit codes 0/1/2/3 with the
    core's meaning, and a diagnostic namespace of its own (`E3D_*`, `W3D_*`) outside the core's catalogue.

**Non-goals:** reviving `--view` or adding 3D to `compile()`; BIM authoring or write-back to `.arch`;
raster plan recognition; generative text-to-mesh in the default path; sun, daylight or energy analysis
in the core.

## Consequences

- The promo workflow becomes a command; 3D, IFC and renders share one checked scene; the core's
  positioning, byte-identity laws and zero-dependency stance are untouched.
- Cost on the core: the additive exports of ADR 0031, kept stable by its contract test.
- Cost on the project: a package with its own heavy-test job and, later, an asset pipeline and a
  licence gate. `prepublishOnly` is never narrowed to accommodate it.
- Risk, version skew: the published core (1.43.1) predates the exports; the package feature-detects
  `resolvePlan` and refuses with `E3D_CORE_TOO_OLD` rather than failing with a `TypeError`.
- Risk, defaults read as decisions: the ledger, the output labels and `--strict`.

## Alternatives considered

- **3D inside the core** (revive the axonometric view or add a 3D backend): contradicts ADR 0021 on all
  four counts.
- **IFC in the core as the only 3D path:** serves BIM tools but not a viewer or renders, and builds the
  geometry twice.
- **Plan JSON as the only input:** 13 of 34 examples need what it does not carry.
- **A second wall joinery downstream:** feasible, and the divergence ADR 0018 exists to prevent.
- **Blender as the modelling engine:** GPL, not byte-deterministic; it stays a renderer behind the GLB.

## Reversal conditions

- If the exports of ADR 0031 are withdrawn, Decision 2 reduces to deep imports behind a shim.
- Re-open Decision 3 if per-wall ownership through `joinWallSet` stops holding (the package's H1 tests
  turn red on the corpus).
- Re-open Decision 10 if the package slows the core's `npm ci` or `npm run check` noticeably (more than
  10 % on `check`), or grows its own release cadence.
- Withdraw the package if the corpus-level checks cannot pass without guessing.
