/**
 * The shipped examples Plan JSON cannot carry, each with the language surface it loses and a
 * `proof` pattern that must still match the file. Shared by the library round-trip suite
 * (`plan-json.test.ts`) and the CLI one (`cli-plan-json-roundtrip.test.ts`), so the gap list is
 * written once.
 */
export const CANNOT_ROUND_TRIP: Record<string, { because: string; proof: RegExp }> = {
  // --- the sheet layer: `axes`/`schedule`/`legend`/`notes` have no JSON field -----
  "furnished-flat.arch": { because: "sheet layer — `schedule`", proof: /^\s*schedule\b/m },
  // Its order alone: its `column`s stand before its `furniture`, and the document lists them after.
  "museum.arch": { because: "`column` before `furniture`: `dropped` says `column order`", proof: /^\s*column\b/m },
  "sheet-notes.arch": {
    because: "sheet layer — `schedule` + `notes` (the title block's `number`/`revision` DO round-trip)",
    proof: /^\s*notes\b/m,
  },
  "practice-office.arch": {
    because: "sheet layer — `schedule` + `notes`; and `zone`",
    proof: /^\s*notes\b/m,
  },
  "corner-cafe.arch": { because: "sheet layer — `schedule` + `legend`; and `zone`", proof: /^\s*legend\b/m },
  // Its walls' `status` DOES round-trip; what is lost is the sheet layer, `north` and a room's
  // `label … at`.
  "remodel.arch": {
    because: "sheet layer — `schedule` + `legend`; and `north`, a room's `label … at`",
    proof: /^\s*legend\b/m,
  },
  "classroom-block.arch": {
    because: "sheet layer — `schedule` + `notes`; and `zone`",
    proof: /^\s*notes\b/m,
  },
  // --- the style layer: `theme`/`style` select paint, which the JSON does not carry -
  "themed.arch": { because: "style layer — `theme`", proof: /^\s*theme\b/m },
  "gallery-l.arch": { because: "style layer — `theme`; and a room's `label … at`", proof: /^\s*theme\b/m },
  "materials.arch": {
    because: "style layer — `style <kind> { … }`; and `schedule`/`legend`",
    proof: /^\s*style\b/m,
  },
  // --- curved geometry: a wall `arc` travels; there is no `circle` ----------------
  "aquarium.arch": {
    because: "curved geometry — `room circle`; and the sheet layer",
    proof: /\bcircle\b/,
  },
  "hexagon-pavilion.arch": { because: "curved geometry — `room circle`", proof: /\bcircle\b/ },
  "library.arch": {
    because: "curved geometry — `room circle`; and the sheet layer, `zone`, `stair`/`elevator`",
    proof: /\bcircle\b/,
  },
  // --- drawing-only and ground elements: no JSON element kind ----------------------
  "tiny-house.arch": { because: "`roof` is deliberately absent from the projection", proof: /^\s*roof\b/m },
  "bungalow.arch": { because: "`roof`; and the sheet layer — `schedule`", proof: /^\s*roof\b/m },
  "courtyard-house.arch": { because: "`roof`; and the sheet layer + `zone`", proof: /^\s*roof\b/m },
  // `walls from rooms`, its polygon hall and (since RM3.1) the `outdoor patio` that covers the
  // courtyard hole all travel, so the way back resolves; what is lost is the sheet layer.
  "courtyard-family.arch": {
    because: "sheet layer — `schedule` + `legend`; and a room's `label … at`",
    proof: /^\s*schedule\b/m,
  },
  // --- storeys and composition -----------------------------------------------------
  "two-storey.arch": {
    because: "`level` — each storey projects alone and draws differently from its sheet; also `roof`/`void`/`stair`",
    proof: /^\s*level\b/m,
  },
  "townhouse.arch": {
    because: "`level` — each storey projects alone and draws differently from its sheet; also `roof`/`stair`",
    proof: /^\s*level\b/m,
  },
  // Plan JSON has no stair, of either form: `dropped` reports this one (#366).
  "turning-stair.arch": {
    because: "`level` — each storey projects alone and draws differently from its sheet; also `roof`/`stair`",
    proof: /^\s*level\b/m,
  },
  // Its `outdoor`s and `fence`s travel since RM3.1; the rest does not.
  "garden-house.arch": {
    because: "`level`, `roof`, `site … boundary` and the sheet layer",
    proof: /^\s*level\b/m,
  },
  "hillside-villa.arch": {
    because: "`level`, `place`, `roof`/`void` and the sheet layer",
    proof: /^\s*level\b/m,
  },
  "terrace-row.arch": {
    because: "`component` + `place` — composition is authored in .arch, not JSON",
    proof: /^\s*place\b/m,
  },
  "clinic.arch": { because: "`component` + `place`; and the sheet layer + `zone`", proof: /^\s*place\b/m },
  "transit-hall.arch": { because: "sheet layer + `zone` + `elevator`/`escalator`", proof: /^\s*escalator\b/m },
  // `import` is refused outright, by design — `planFromJson` says so in its own doc.
  "imports.arch": {
    because: "`import` — refused by design (`E_IMPORT_NOT_FOUND` on projection)",
    proof: /^\s*import\b/m,
  },
  "museum-wings.arch": { because: "`import` + `place` — refused by design", proof: /^\s*import\b/m },
  // This entry used to name the ONE genuine defect in this list — `planToJson`
  // projected a RESOLVER-DERIVED furniture position as an authored `at (x,y)`, which
  // `grid` then re-snapped, moving eight of this plan's twelve fixtures.
  // That is fixed: the projection now carries the placement CLAUSE, and this file
  // round-trips byte-identical once its `roof overhang` line is removed — which is the
  // ordinary by-design loss the rest of this list describes, and all that is left here.
  // The derived-position half is pinned in `plan-json.test.ts`, under "derived furniture positions".
  "two-bed.arch": { because: "`roof` is deliberately absent from the projection", proof: /^\s*roof\b/m },
  // --- accessibility metadata: `accTitle`/`accDescr` have no JSON field -------------
  // The plain SVG round-trips, so an SVG-only check counted this file as covered while its
  // whole point was lost. The CLI suite compares describe() as well, which sees both go.
  "accessible.arch": {
    because: "accessibility metadata — `accTitle`/`accDescr` are not carried",
    proof: /^\s*acc(Title|Descr)\b/m,
  },
};

/**
 * The shipped examples whose JSON way back does not even resolve: the source `planFromJson` writes
 * fails to compile. Pinned exactly (`plan-json.test.ts` derives the set and compares; the CLI suite
 * gives these their own outcome, "the way back does not compile"). Every name here is also a
 * {@link CANNOT_ROUND_TRIP} gap. Its one entry was `courtyard-family.arch`, whose `outdoor` cover of
 * a courtyard hole `walls from rooms` needs; RM3.1 carries `outdoor`, which emptied it.
 */
export const UNRESOLVED_WAY_BACK: readonly string[] = [];

/**
 * Gaps of the library suite that the CLI path closes. The library projects with no World, so
 * `import` cannot resolve; the CLI resolves it through its file World before projecting, so the
 * JSON it writes is the flat, imported geometry and compiles back to the same drawing. Shared by
 * the CLI suite and the round-trip law (`plan-json-roundtrip-law.test.ts`).
 */
export const CLI_CLOSES: Record<string, string> = {
  "imports.arch": "the CLI resolves `import` through its file World, so the projection is flat",
};
