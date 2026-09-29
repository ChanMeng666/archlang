# 21. Plan-first: the axonometric view is deprecated

- **Status:** Accepted
- **Date:** 2026-09
- **Scope:** `compile(src, { view })`, the CLI `--view` flag and `src/view/`. The height datum
  (`height`, `sill`, `head`, `describe().heights`, the Plan JSON height fields) is unchanged.

## Context

ArchLang draws floor plans. The opt-in axonometric view (`view: "iso" | "axon"`, `arch compile
--view`) was added as a sibling of `toScene` that extrudes the plan into an illustrative picture.
It has never been part of what ArchLang claims:

- **It supports none of the checked claims.** ArchLang's argument is that a plan is a checked
  artifact: reachability, exact areas, byte-identical determinism. The view is, by its own
  contract, "a picture, never a measured surface" — `describe()` and `lint()` never learn it
  exists, and it carries no scale, no dimensions and no title block. Nothing it draws can be
  checked against the plan.
- **No consumer.** ArchCanvas never imports a view export, and no user has asked for it.
- **It contradicts the positioning.** ArchLang is presented as a plan language, not a 3D tool;
  a picture on the landing page invites a "does it do 3D?" question with no good answer.
- **It carries open bugs** (backlog V.1 to V.4) and a maintenance surface across
  `pipeline.ts`, the SVG, PDF and DXF backends, the CLI, the compile cache key and ten tests.

The third dimension has a real forward path, and it is data, not drawing: an IFC export of the
height datum (backlog P3-2).

## Decision

1. **ArchLang is plan-first.** It draws plans; it does not draw the building.
2. **The view is deprecated in the 1.x line and removed at 2.0**, together with the already
   soft-deprecated `while` and reassignment. Until then it keeps working and every byte it emits
   is unchanged.
3. **The deprecation is non-breaking and advisory only.** The exports carry `@deprecated`
   (`toIso`, `VIEW_NAMES`, `isViewName`, `cameraFor`, `projectedArea2`, `VIEW_LAYERS`,
   `VIEW_LAYER_NAMES`, `ViewName`, `Camera`, `Point3`, `Projected`, `CompileOptions.view`). The
   `--view` flag is described as deprecated in the manifest and, when used, prints one notice on
   **stderr**; stdout, `--json` output and the rendered bytes are untouched. The landing page,
   sidebar and the agent skill stop promoting it.
4. **The height datum is kept.** Heights stay authored, validated (`E_HEIGHT_RANGE`) and reported
   by `describe()`; they still draw nothing on a plan. They become the input of a future data
   export rather than of a picture.
5. **3D goes through data export** (IFC, backlog P3-2), not through a drawing backend.

## Consequences

- Nothing breaks in 1.x. A caller that never passes `view` sees no change in SVG, `describe()`
  or `lint()`.
- The four open view findings are frozen as won't-fix; they close when the code is deleted.
- At 2.0 the datum has no drawing consumer until the data export lands. That is accepted: the
  datum's value is in `describe()`, which needs no view.
- A reader who wants a picture of the building has to use a tool that consumes the export.

## Removal

Phase B is implemented on branch `feat/remove-view` (parked until 2.0): every item below is
deleted, `describe()`, `lint()`, Plan JSON and the SVG/DXF/PDF bytes of every example are
SHA-256-identical before and after, and `--view` is now an unknown flag (exit 3). The height datum
is untouched.

## Phase B: the 2.0 removal checklist

Tracked in `docs/backlog.md`. Prove the removal with a SHA-256 byte-identity sweep of `compile`,
`describe` and `lint` over every example before and after.

- Delete `src/view/`; the view branch in `pipeline.ts`; `Scene.view`; `CompileOptions.view`.
- Delete the view branches in `backends/svg.ts`, `export/pdf.ts` and `export/dxf.ts` (the
  `V-3D-*` layers).
- Delete the CLI `--view`, `resolveView` and `VIEW_FLAG`; the `index.ts` exports; `view` in the
  compile cache key.
- Keep `joinWallSet` (the plan path uses it); un-export `themeBaseLookup` if only the view uses it.
- Delete the ten `test/iso-*.test.ts` files and the iso snapshot.
- Delete `VIEW_SVGS` in `scripts/gen-example-svgs.ts`, its `scripts/check-drift.ts` entries and
  `docs-site/public/view/*.svg`.
- Delete `docs/axonometric.md`, its line in `docs-site/sync-docs.mjs` and its `docs-site/.gitignore`
  entry.
- The `AGENTS.md` rule becomes "Heights draw nothing."; drop the view lines in
  `docs/agents/architecture.md`; rewrite the backlog note "The datum now has ONE consumer — the
  axonometric".
- Note for the sweep: ripgrep treats `src/plan-json.ts` as binary, so use `grep -a` there.
