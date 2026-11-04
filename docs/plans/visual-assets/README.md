# Visual assets: richer 3D furniture, a rendered 2D theme, more families

The owner asked on 2026-11-04 for the preset visual assets (furniture, plants, vehicles, objects),
2D and 3D, to look more refined and professional, and for more of them. This folder plans that
work; `cards.md` holds the cards, `handoff.md` the resume point.

## What was measured (2026-11-04, main `dfd4654c`)

- **2D.** 101 fixture families (`FIXTURE_FAMILIES`, `src/elements/fixtures-glyphs.ts`), every one
  drawn, redrawn once under ADR 0023 (v1.39.0). At 1:50 `furnished-flat` reads as a professional
  plan: the line work is not the gap. What it lacks next to a presentation board is colour, and
  some everyday objects have no word (lamps, side tables, a pantry, palms, a picnic table …).
- **3D.** `packages/archlang-3d` builds 12 families from T0 parametric parts (`src/mesh/t0.ts`):
  bed, sofa, table, rug, wardrobe, fridge, counter, kitchen_sink, stove, shower, wc, basin. The
  other 89 families are grey boxes. A part is an axis-aligned box or a 16-gon prism extruded up;
  every furniture node has ONE material (`glb/write.ts`, `replay/mount.ts`: one colour per kind),
  so a sofa, a wardrobe and a WC are the same beige. The end frame of `furnished-flat` reads as
  massing, not as a furnished home. This is the largest gap.

## Decisions

| # | Decision | Source |
|---|---|---|
| V-D1 | 2D colour comes as a NEW opt-in theme, `rendered`: symbols filled with soft material tints. Every existing theme, golden and example stays byte-identical. ADR 0023 is amended for that theme only; its rejection of tints stands for every other theme. | owner, 2026-11-04 (asked) |
| V-D2 | A family's material is a property of the family (a fixed table, like `FIXTURE_FAMILIES`), never read from `label` and never a new language keyword. 2D tint and 3D slot read the same table, so the two cannot disagree. | this plan |
| V-D3 | 3D stays T0 (pure TypeScript generators, CC0-free of any asset licence, fitted exactly to the footprint, quarter turns only), per ADR 0030 decision 9 and Q9. A generator is mirror-symmetric across its width, except a family the core draws handed in its shape (`sofa_l`, `chaise`, `piano`, `reception_desk`; `bicycle` and `motorcycle` only laid along their width, `handedAt`): that one is built in the core drawing's hand and reflected as the plan reflects the piece, read from the core's public `planToJson` `mirror` (ADR 0031); where the reflection is unknown it stands as a ledgered grey box. A family the core draws handed only by a small detail (taps, a plug, a flag) is built symmetric without the detail. No T1 import pipeline in this programme. | ADR 0030; programme lead, PRs #461, #463 |
| V-D4 | Every 3D default this adds (heights, mount heights, material slots, floor finish) is a labelled default in the `assumptions[]` ledger (ADR 0030 decision 5: no invisible architect). | ADR 0030 |
| V-D5 | Pins move only with the card's reason in the commit and the test comment (laneway Mesh3D and GLB SHA-256, key-frame baseline per `e2e/fixtures/README.md`), as card A2b did. | `.claude/rules/archlang-3d.md` |
| V-D6 | A new 2D family ships its 3D generator in the same card, so the two never fall out of step again. | this plan |
| V-D7 | No core drawing change beyond `rendered` and the new families: over the corpus `describe()`, `lint()` and diagnostics stay byte-identical; a new family is appended at the END of `FIXTURE_FAMILIES` (the legend order). | AGENTS.md, ADR 0023 d7 |

## Order of work

1. **Foundation (3D):** V1 material slots, V2 shape primitives. Sequential; every later 3D card
   needs both.
2. **V3** upgrades the 12 existing generators with slots and detail (the frames people already see).
3. **V4** the `rendered` 2D theme (core; independent of 3D, can run while V3 is in review).
4. **V5–V7** T0 generators for the remaining 89 families in three domain batches.
5. **V8** new families (2D symbol + catalog row + 3D generator + `rendered` material).
6. **V9** viewer polish: light, palette, floor finishes by room use.

One executor at a time (owner, 2026-11-03: one heavy process); executors run the local gate
(`check:quick`), CI is the full gate; a PR merges on green CI and a reviewed diff, at most two
red-team rounds. Releases (core, archlang-3d) stay owner-only and are not part of any card.

## Success

- `archlang3d view` of `furnished-flat`, `laneway-house` and `garden-house`: no grey box left
  for a catalogued family; at least six visibly different materials in one frame.
- `arch compile --theme rendered` of the same plans reads as a presentation board, and every
  other theme's bytes are unchanged (byte-identity test).
- At least 20 new families, each drawn in 2D, built in 3D, listed by `arch manifest`.
