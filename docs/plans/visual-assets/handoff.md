# Visual assets: handoff

The resume point. The programme's nine cards landed on 2026-11-04 and were released the same day;
what is left is the residue below, also filed as backlog VA.1–VA.5.

| Card | State | PR |
|---|---|---|
| V1 material slots | done | #459 |
| V2 shape primitives | done | #459 |
| V3 twelve generators refined | done | #459 |
| V4 `rendered` 2D theme | done | #460 |
| V5 T0 living/bedroom/office | done | #461 |
| V6 T0 kitchen/bath/utility | done | #461 |
| V7 T0 outdoor/vehicles/commercial | done | #463 |
| V8 twenty new families | done (2D #462, 3D #463) | #462, #463 |
| V9 viewer polish | done | #464 |

Against the README's success criteria: no catalogued word is a grey box in 3D (`t0.test.ts` asserts it
over the manifest's fixture words); `rendered` leaves every other theme byte-identical (the
rendered-theme law, 41 rows); 103 families, twenty of them new, each drawn, built and listed.

## Release

Released by #466 and the `v1.54.0` tag: the core (`rendered`, twenty families,
`FIXTURE_FAMILY_MATERIALS`) and `@chanmeng666/archlang-3d` (material slots, every family built, the
viewer's light and finishes, the removed `t0Parts`/`PlacedPart`: a minor bump at 0.x), with the MCP
shim and the VS Code extension re-pinned. `npm view` and `gh release view` say which versions; the
notes are in each package's `CHANGELOG.md`.

## Residue (not started; backlog VA.1–VA.5)

- The bean bag reads stepped in 3D (stacked rounded tiers); a smoother profile would read softer.
- Outdoor ground surfaces (lawn, paving, deck) are not built in 3D, so they get no finish.
- A room with no `uses` keeps the neutral floor; the label is deliberately not read.
- The CLI has no `--theme` flag: `rendered` is reached by `theme rendered` in the source or
  `CompileOptions.theme`.
- Shadow maps were measured at +55% SwiftShader frame time and left out (V9).
