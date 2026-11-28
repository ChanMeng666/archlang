# Rulings and cards of archived programmes

These programmes moved whole to the private sibling repository `archlang-lab` (clone it next to this one). Code and docs here still cite their ruling and card ids, so each ruling is listed below with its sentence copied word for word from the moved README, and each card range with where it lives now.

## Rulings

- **PG-D1** · 每个功能只有一个入口。 (`archlang-lab/plans/playground-minimal/README.md`)
- **PG-D2** · 方案选择：一个画廊按钮，替代下拉和缩略图条。 (`archlang-lab/plans/playground-minimal/README.md`)
- **PG-D3** · 视图切换：浏览模式只有 Plan | 3D。 (`archlang-lab/plans/playground-minimal/README.md`)
- **PG-D4** · 3D 是舞台，不是一张卡片。 (`archlang-lab/plans/playground-minimal/README.md`)
- **PG-D5** · 导出、分享各一个菜单。 (`archlang-lab/plans/playground-minimal/README.md`)
- **PG-D6** · 一行事实，一行介绍。 (`archlang-lab/plans/playground-minimal/README.md`)
- **PG-D7** · 不变的东西。 (`archlang-lab/plans/playground-minimal/README.md`)
- **MP-D1** · The phone page is one screen. (`archlang-lab/plans/playground-mobile-perf/README.md`)
- **MP-D2** · Touch is a first-class input. (`archlang-lab/plans/playground-mobile-perf/README.md`)
- **MP-D3** · 3D draws only when someone can see it. (`archlang-lab/plans/playground-mobile-perf/README.md`)
- **MP-D4** · A visit pays only for what it uses. (`archlang-lab/plans/playground-mobile-perf/README.md`)
- **MP-D5** · Thumbnails are thumbnails. (`archlang-lab/plans/playground-mobile-perf/README.md`)
- **MP-D6** · Typing never freezes the page. (`archlang-lab/plans/playground-mobile-perf/README.md`)
- **MP-D7** · Laws unchanged. (`archlang-lab/plans/playground-mobile-perf/README.md`)
- **V-D1** · 2D colour comes as a NEW opt-in theme, `rendered`: symbols filled with soft material tints. (`archlang-lab/plans/visual-assets/README.md`)
- **V-D2** · A family's material is a property of the family (a fixed table, like `FIXTURE_FAMILIES`), never read from `label` and never a new language keyword. (`archlang-lab/plans/visual-assets/README.md`)
- **V-D3** · 3D stays T0 (pure TypeScript generators, CC0-free of any asset licence, fitted exactly to the footprint, quarter turns only), per ADR 0030 decision 9 and Q9. (`archlang-lab/plans/visual-assets/README.md`)
- **V-D4** · Every 3D default this adds (heights, mount heights, material slots, floor finish) is a labelled default in the `assumptions[]` ledger (ADR 0030 decision 5: no invisible architect). (`archlang-lab/plans/visual-assets/README.md`)
- **V-D5** · Pins move only with the card's reason in the commit and the test comment (laneway Mesh3D and GLB SHA-256, key-frame baseline per `e2e/fixtures/README.md`), as card A2b did. (`archlang-lab/plans/visual-assets/README.md`)
- **V-D6** · A new 2D family ships its 3D generator in the same card, so the two never fall out of step again. (`archlang-lab/plans/visual-assets/README.md`)
- **V-D7** · No core drawing change beyond `rendered` and the new families: over the corpus `describe()`, `lint()` and diagnostics stay byte-identical; a new family is appended at the END of `FIXTURE_FAMILIES` (the legend order). (`archlang-lab/plans/visual-assets/README.md`)

The engineering-health rulings (EH-D*) and the public-surfaces rulings (PS-D*) are still public, in `engineering-health/README.md` and `public-surfaces/README.md`.

## Cards

- **PG1–PG5** (playground-minimal): the card table in `archlang-lab/plans/playground-minimal/README.md`.
- **MP1–MP10** (playground-mobile-perf; MP4 is split into MP4a and MP4b, and MP7 is deferred): the card table in `archlang-lab/plans/playground-mobile-perf/README.md`.
- **V1–V9** (visual-assets): `archlang-lab/plans/visual-assets/cards.md`.
- **EH0.1–EH0.10, EH1.1–EH1.24, EH2.1–EH2.14, EH3.1–EH3.10** (engineering-health): `archlang-lab/plans/engineering-health/cards.md`. Its README and `closing-audit.md` are still here.
- **S1, S2, C1, D1–D4, O1–O8, P1–P6, R1, V1** (public-surfaces; this V1 is not visual-assets V1): `archlang-lab/plans/public-surfaces/cards.md`. The X cards are still here, in `public-surfaces/3d.md`.
