---
description: Add a fixture family (a furniture or fixture word with its own drawn symbol) and register it in the core, the tests and the 3D package
---

# Add a fixture family

A family is a canonical word plus its aliases, a drawer, a catalogue row per word, a material row and,
for 3D, a generator. The list comes from the visual-assets tranche (1.54.0): `55217823` (outdoor
module), `1e795ca6`, `8eac052e`, `5b0d38e5` (twenty families) and the dispatch refactor
`02baa766`/`0931cb17`. How a symbol is drawn: `.claude/rules/glyphs.md`. A new family is not a new
element kind (that is `.claude/commands/new-element.md`). A family changes the drawing of plans that use
the new word only: plans that do not stay byte-identical.

## Steps, in dependency order

1. **The drawer**: a `draw<Name>(r, g)` in the `src/elements/glyphs-<group>.ts` module of its group
   (a new group is a new module, imported in `fixtures-glyphs.ts`). Outline first, every measure a
   fraction of the footprint, ink inside the footprint at every aspect and quarter-turn.
2. **The family row**: append `["canonical", "alias", …]` at the END of `FIXTURE_FAMILIES`
   (`src/elements/fixtures-glyphs.ts`). Inserting in the middle reorders the legend of every plan that
   draws a fixture. Add the drawer to `DRAW_BY_FAMILY` (a `Record<CanonicalFamily, DrawFn>`: red without
   it is `tsc`) and its row to `FIXTURE_FAMILY_MATERIALS` (what the `rendered` theme fills). Red without
   the drawer: `test/glyph-dispatch-table.test.ts` (the drawer table equals the canonical families, both
   ways).
3. **The catalogue**: one `CATALOG` entry per word, aliases included, in `src/fixtures-catalog.ts`
   (default footprint, wall and zone facts, `serves`). Red without it:
   `test/fixture-classifier-drift.test.ts` (glyph words are a subset of the catalogue),
   `test/cli-manifest.test.ts` (the manifest's categories are drawn), `test/glyph-dispatch-table.test.ts`
   ("every catalogued category draws a symbol").
4. **The dispatch golden**: add each word's SHA-256 row to `test/tables/glyph-dispatch.json`, measured
   from the drawer you just wrote, with the digest function at the top of that test. Red without it: the same file's
   "primitives match" case. A moved digest of an EXISTING word is a drawing change to explain, never a
   row to re-bless (`docs/testing.md` § 3).
5. **Handedness**: a symmetric family is exact under every quarter-turn and mirror. Add its row to
   `test/handedness-grid-baseline.ts` (`"none"` when symmetric, as the twenty new families did), which
   `test/glyph-chirality.test.ts` reads; a handed family is listed with its reason. Red without
   it: `test/glyph-chirality.test.ts`. The drawing budget counts the drawer once
   (`test/drawing-budget.test.ts`).
6. **The tests of the symbol**: a case in the group's `test/glyphs-<group>.test.ts` (containment at
   every aspect and turn, the repeat counts clamped), plus `test/fixture-byte-identity.test.ts`'s
   groups 2–4 where the family joins a redrawn set; group 1 is never touched.
7. **Byte identity**: the law that a plan naming none of the new words renders, describes and lints as
   before (`test/new-families-byte-identity.test.ts`, with `test/helpers/new-families-law.ts`). No shipped
   `.arch` or docs fence may name the new word: show it in prose
   (`.claude/rules/glyphs.md` § Traps). `check:quick` cannot see that guard; CI does.
8. **3D**: in `packages/archlang-3d`, a generator in `src/mesh/t0-<group>.ts`, its height in
   `T0_HEIGHT_MM` (mount and hung-from-top tables where it applies), its material slots from the core's
   `FIXTURE_MATERIALS`, handed only if the core draws it handed (`T0_HANDED`). Red without it:
   `packages/archlang-3d/test/t0.test.ts` (a catalogued word with no generator is a grey box) and the
   root `test/material-vocabulary.test.ts` (slots equal the core's material vocabulary).
9. **Words other tools list**: the LSP offers the whole catalogue (derived; `test/lsp-features.test.ts`
   holds it to `FIXTURE_CATEGORIES`); `finish` furnishes only the rooms and uses a family is mapped to
   (`src/furnish-table.ts`; `docs/furniture.md` prints that table, pinned by
   `test/finish-furnish.test.ts`); hand-written counts of words and families
   (`grep -n families docs/overview.md`) are not derived.
10. **`CHANGELOG.md`** (`### Added`), then `npm run gen:all` (`spec.llm.md` lists the words and has a
    30,000-unit cap; `docs/agents/gotchas.md`). Prove it through the CLI (`compile` the new word on a
    plan, then the examples, which must not move), `npm run check:quick`, push, read the PR's CI.
