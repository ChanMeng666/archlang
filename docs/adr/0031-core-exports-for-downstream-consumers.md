# 31. The package root exports the resolved-plan seam: `resolvePlan`, the wall joinery and the door leaves (additive, append-only)

- **Status:** Accepted 2026-10-28 with the PR that adds the exports (preview-and-remodel card A0;
  decision D10 of `docs/plans/preview-and-remodel/README.md`). Drafted as
  `docs/plans/archlang-3d/adr-draft-0031-core-exports-for-downstream-3d.md` (v0.6, 2026-10-24); the
  numbers below were re-measured on `main@00b7e7ec`.
- **Date:** 2026-10
- **Owner decisions recorded:** Q10, Q11, Q18 of the archlang-3d plan (2026-10-23/24: the additive
  exports, `doorSwing`, `resolvePlan`/`AnalyzeOptions`/`JoinerySplit`) and D10 of the preview-and-remodel
  programme (2026-10-28: `doorLeaves` joins the set; the stability wording quotes the four-field return
  type).
- **Extends:** [ADR 0018](0018-zero-dep-wall-joinery.md) (one wall joinery: the exports let a
  downstream package reuse it instead of writing a second).
- **Relates to:** [ADR 0021](0021-plan-first-view-deprecated.md) (plan-first; the third dimension is
  data, never a drawing in the core), [ADR 0028](0028-rooms-primary-derived-walls.md) (derived walls
  exist in the resolved IR, not in Plan JSON), [ADR 0015](0015-cli-as-agent-interface.md). The
  downstream package's own record is the ADR 0030 draft, `docs/plans/archlang-3d/adr-draft-0030-3d-as-downstream-package.md`.
- **Scope:** `src/index.ts` gains five value exports, the 14 types their signatures reach and eight
  element type names (27 names, 549 → 576); `test/public-surface.test.ts` derives the closure of the
  signatures; a stability sentence in each function's JSDoc; a CHANGELOG entry. **Not in scope:** any
  change to `compile()`, the cache key, a backend, the grammar, `describe()`/`lint()`, `examples/` or a
  generated artefact; new IR fields; `parse`/`link`; a Node `World`; a lossless building JSON.

## Context

A downstream consumer of the resolved plan (the first is the planned, separate `archlang-3d`
package) needs three things the package root did not give:

1. **The fully resolved plan, imports included.** `compile().ast` is the *unlinked* AST; feeding it
   to the exported `resolveAll` silently drops imported and placed content (measured:
   `examples/imports.arch` gives 3 elements that way and 8 through `resolvePlan`;
   `examples/museum-wings.arch` 8 against 42; no diagnostic either way). The complete path is
   `resolvePlan(source, { world })` in `src/analyze.ts`: parse → link → resolve.
2. **The wall-joinery seam.** `joinWallSet` (`src/wall-lowering.ts`) turns resolved walls and their
   openings into one joined outline per wall set; its optional `split = { faceOf, faces }` yields one
   ownership polygon per wall (`faceOf = (w) => w.id`). `loopsToPolygons` (`src/geometry/joinery.ts`)
   discretises the exact arc edges. `joinWallSet`'s own comment states why a second footprint
   derivation is how a drawing and its extrusion come to disagree.
3. **The door leaves.** `doorSwing` (`src/geometry.ts`) turns hinge, swing and host wall into a
   leaf's pose, and returns `null` for every non-hinged kind, `double` included. A `double` door's two
   leaves come only from `doorLeaves`, which every swing measure in the core already reads
   (`docs/agents/gotchas.md`, "a new caller of `doorSwing` skips double doors silently"). Exporting
   `doorSwing` alone would hand a consumer that trap.

The package `exports` map is `"."` and `"./link"`, so none of these could be imported by name; a
relative import of `src/*` works inside the monorepo and breaks the day a consumer is tested against
the published core.

The type closure is the other half. Walking the five signatures the way `test/public-surface.test.ts`
already walks `SceneSummary` (breadth-first over type-reference nodes, signature only, through
generic constraints and aliases) finds **14 names a consumer could not write down**: `AnalyzeOptions`,
`Arc`, `DoorHinge`, `DoorLike`, `DoorSwing`, `DoorSwingDir`, `Edge`, `EdgeLoop`, `JoinableWall`,
`JoinedCut`, `JoinedWallSet`, `JoineryResult`, `JoinerySplit`, `Opening`. `doorLeaves` adds none (its
signature is `doorSwing`'s, returning an array).

## Decision

1. **Export five values** from `src/index.ts`, each a plain re-export from its declaring module:
   `resolvePlan`, `joinWallSet`, `loopsToPolygons`, `doorSwing`, `doorLeaves`. No function body
   changes; the import graph of `compile()` does not change.
2. **Export the 14 closure types** listed above, each from the module that declares it.
3. **Export the eight element type names** `ResolvedElement` carries but did not name: `ROpening`,
   `RStair`, `RElevator`, `REscalator`, `RRoof`, `RVoid`, `ROutdoor`, `RFence`. Without them a
   consumer writes `Extract<ResolvedElement, { kind: "stair" }>`. The ninth unnamed member,
   `RWallsFromRooms` (the ADR 0028 statement), is left out: derived walls are already in `ir.walls`.
4. **The contract test derives, never retypes.** `test/public-surface.test.ts` walks each of the five
   signatures (type parameters, parameters, return type; never the body) and requires every own type
   reached to be exported. The walk stops expanding where it enters the IR vocabulary that
   `resolvePlan`'s own signature reaches (`ResolvedPlan`, `RWall`, `CompileOptions`, …): that
   vocabulary's full closure is a pre-existing hole (see Alternatives). Every type the seam itself
   introduces is walked through, so a field added later to `JoinedCut` or `DoorLike` with an
   unexported type turns the test red. A behavioural case pins `resolvePlan` against `describe()` on
   `imports`, `museum-wings` and `laneway-house` (room and furniture counts agree), so the export can
   never fall back to the unlinked path.
5. **No IR field, argument or diagnostic code is added.** A fact the consumer needs later is a
   separate additive change with its own reason.

## Stability level

**Public and append-only, with a narrow promise; not labelled experimental.** The repository has two
tiers, public (in `src/index.ts`) and `@internal` (not re-exported); `src/index.ts` is append-only
(ADR 0018) and removal goes through deprecation and a major. `resolvePlan` already has a dozen
callers under `src/` and backs `describe()`, `lint()` and `planToJson()`, so its shape was expensive
to change before it was exported.

What the core promises:

- **`resolvePlan(source: string, opts?: AnalyzeOptions): { ir: ResolvedPlan | null; diagnostics:
  Diagnostic[]; levels: ResolvedLevel[]; plan?: PlanNode }`**, with fields only ever added. Its
  semantics: it never throws on a user-source problem; `ir` is the lowest storey (the page
  `compile().svg` draws) or `null` on a fatal error; `diagnostics` aggregates every storey, each
  tagged with `Diagnostic.level`; `levels` is `[]` for a single-storey plan; `plan` is the linked
  plan, present only when `ir` is.
- `joinWallSet(walls, groupKeys, split?)` returning `JoinedWallSet | null`; `loopsToPolygons(loops)`
  returning `Point[][]`; `doorSwing(door)` returning `DoorSwing | null`; `doorLeaves(door)` returning
  `DoorSwing[]` (one leaf for a hinged door, two for a `double`, none for an unhosted door or a kind
  that sweeps no quarter-disc).
- The 14 closure types and the eight element names stay nameable from the root.

What it does not promise: underscore-prefixed IR fields (`_swingBuilding`, `_mirror`, …); the order
of `diagnostics` beyond what tests pin; the numeric tolerances inside the joinery (the arc step); and
`parse`/`link`, which stay private. Adding an export is a minor; changing a promised signature or
semantic is a major; removing an export is a deprecation (`@deprecated` and a CHANGELOG line) first.

## Consequences

- A downstream consumer reads the same resolve, joinery and door-leaf code the plan drawing uses,
  so a drawing and its model cannot disagree for want of a second implementation.
- The public-surface guard grows from one root (`SceneSummary`) to the five signatures.
- Cost: 27 public names and a deprecation cycle to change them. `joinWallSet` is also called by the
  deprecated axonometric view; its removal at the next major does not touch the export, because the
  plan path uses it.
- No output path changes: SVG, `describe()`, `lint()` and every digest are byte-identical.

## Alternatives considered

- **No export; deep-import from the monorepo.** Bypasses the published surface and breaks on
  extraction. Kept only as a consumer's temporary route while the exports are unreleased.
- **Export `parse` and `link` instead.** Widens the promise to `link`'s options and diagnostics.
- **Plan JSON only.** 13 of 34 examples need information Plan JSON does not carry (arcs as exact
  edges, derived walls); measured 2026-10-28.
- **Export the full transitive closure of `resolvePlan`.** It reaches 171 own types, 41 of them
  unexported before this change, among them the expression parser's internals (`Token`, `Expr`,
  `Env`, …). Most arrive through the long-exported `ResolvedPlan`/`CompileOptions`: a pre-existing
  hole this change neither widens nor repairs.
- **An `@experimental` tier or an `./analyze` subpath.** No precedent for the tier; the subpath would
  split the surface and add an entry the MCP release gate must carry.
