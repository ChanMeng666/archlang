/**
 * The shipped examples Plan JSON cannot carry, each with the language surface it loses and a
 * `proof` pattern that must still match the file. Shared by the library round-trip suite
 * (`plan-json.test.ts`) and the CLI one (`cli-plan-json-roundtrip.test.ts`), so the gap list is
 * written once.
 */
export const CANNOT_ROUND_TRIP: Record<string, { because: string; proof: RegExp }> = {
  // --- the sheet layer: `paper`/`axes`/`schedule`/`legend` have no JSON field ------
  "furnished-flat.arch": { because: "sheet layer — `paper` + `schedule`", proof: /^\s*paper\b/m },
  "museum-wing.arch": { because: "sheet layer — `paper`", proof: /^\s*paper\b/m },
  "museum.arch": { because: "sheet layer — `paper`", proof: /^\s*paper\b/m },
  "sheet-notes.arch": {
    because: "sheet layer — `paper` + `schedule` + `notes` (the title block's `number`/`revision` DO round-trip)",
    proof: /^\s*paper\b/m,
  },
  "small-office.arch": {
    because: "sheet layer — `paper` + `schedule` + `notes`; and `zone`",
    proof: /^\s*paper\b/m,
  },
  "corner-cafe.arch": { because: "sheet layer — `paper` + `schedule` + `legend`; and `zone`", proof: /^\s*paper\b/m },
  "classroom-block.arch": {
    because: "sheet layer — `paper` + `schedule` + `notes`; and `zone`",
    proof: /^\s*paper\b/m,
  },
  // --- the style layer: `theme`/`style` select paint, which the JSON does not carry -
  "themed.arch": { because: "style layer — `theme`", proof: /^\s*theme\b/m },
  "gallery-l.arch": { because: "style layer — `theme`; and the sheet layer — `paper`", proof: /^\s*theme\b/m },
  "materials.arch": {
    because: "style layer — `style <kind> { … }`; and `paper`/`schedule`/`legend`",
    proof: /^\s*style\b/m,
  },
  // --- curved geometry: `WallJson.points` is straight-edged; there is no `circle` ---
  "aquarium.arch": {
    because: "curved geometry — wall `arc` + `room circle`; and the sheet layer",
    proof: /\barc\s*\(/,
  },
  "hexagon-pavilion.arch": { because: "curved geometry — wall `arc` + `room circle`", proof: /\barc\s*\(/ },
  "library.arch": {
    because: "curved geometry — wall `arc`; and the sheet layer, `zone`, `stair`/`elevator`",
    proof: /\barc\s*\(/,
  },
  // --- drawing-only and ground elements: no JSON element kind ----------------------
  "tiny-house.arch": { because: "`roof` is deliberately absent from the projection", proof: /^\s*roof\b/m },
  "bungalow.arch": { because: "`roof`; and the sheet layer — `paper` + `schedule`", proof: /^\s*roof\b/m },
  "courtyard-house.arch": { because: "`roof`; and the sheet layer + `zone`", proof: /^\s*roof\b/m },
  // --- storeys and composition -----------------------------------------------------
  "two-storey.arch": {
    because: "`level` — each storey projects alone and draws differently from its sheet; also `roof`/`void`/`stair`",
    proof: /^\s*level\b/m,
  },
  "townhouse.arch": {
    because: "`level` — each storey projects alone and draws differently from its sheet; also `roof`/`stair`/`paper`",
    proof: /^\s*level\b/m,
  },
  "garden-house.arch": {
    because: "`level`, `outdoor`/`fence`/`roof`, `site … boundary` and the sheet layer",
    proof: /^\s*level\b/m,
  },
  "hillside-villa.arch": {
    because: "`level`, `place`, `roof`/`void`, `arc` and the sheet layer",
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
