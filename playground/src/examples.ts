// Playground example plans.
//
// Every preset is a `?raw` import of the SAME file the CLI, docs and spec ship, so
// the playground can never drift from the canonical, lint-clean source (these used
// to be hand-copied here and went stale: an open bath, dimensions drawn into the
// building, furniture on the door swings). `server.fs.allow` in vite.config.js
// already whitelists the repo root, and `?raw` inlines the file contents at build
// time. Edit examples/*.arch, not a duplicate.
//
// The presets are GROUPED — the toolbar renders one <optgroup> per group — because
// there are now two dozen of them and a flat list of that length is a wall. Group
// order is a learning progression (a plan you can read in one screen first, the
// large public buildings last), and so is the order inside each group.
import hillsideVilla from "../../examples/hillside-villa.arch?raw";
import oneRoom from "../../examples/one-room.arch?raw";
import lanewayHouse from "../../examples/laneway-house.arch?raw";
import gardenLoft from "../../examples/garden-loft.arch?raw";
import tinyHouse from "../../examples/tiny-house.arch?raw";
import studio from "../../examples/studio.arch?raw";
import twoBed from "../../examples/two-bed.arch?raw";
import attached from "../../examples/attached.arch?raw";
import bungalow from "../../examples/bungalow.arch?raw";
import courtyardHouse from "../../examples/courtyard-house.arch?raw";
import townhouse from "../../examples/townhouse.arch?raw";
import twoStorey from "../../examples/two-storey.arch?raw";
import furnishedFlat from "../../examples/furnished-flat.arch?raw";
import gardenHouse from "../../examples/garden-house.arch?raw";
import museum from "../../examples/museum.arch?raw";
import aquarium from "../../examples/aquarium.arch?raw";
import library from "../../examples/library.arch?raw";
import transitHall from "../../examples/transit-hall.arch?raw";
import clinic from "../../examples/clinic.arch?raw";
import galleryL from "../../examples/gallery-l.arch?raw";
import hexagonPavilion from "../../examples/hexagon-pavilion.arch?raw";
import terraceRow from "../../examples/terrace-row.arch?raw";
import relational from "../../examples/relational.arch?raw";
import parametric from "../../examples/parametric.arch?raw";
import accessible from "../../examples/accessible.arch?raw";
import themed from "../../examples/themed.arch?raw";
import materials from "../../examples/materials.arch?raw";

// ───────────────────────────────────────────────────────────────────────────────
// THE SOURCE TABLE. One literal, uniformly-shaped row per preset:
//
//   ["<examples/ basename>", "<menu label>", "<group>", "<one-line blurb>"]
//
// It is declared in this shape — literal, top-level, one quoted string per column —
// because `playground/scripts/gen-static.mjs` PARSES it with a plain regex from
// Node, with no TypeScript loader, to build the static per-example pages and the
// sitemap; `test/playground-examples-rows.test.ts` parses it the same way and welds
// it to `examples/` in BOTH directions. That two-way gate is not theoretical: it is
// what found `garden-house` (the v1.31 OUTDOOR flagship) missing from this menu —
// shipped to npm, the docs site and the README while being invisible here, because
// this file was last touched before that example existed. Keep the shape, and add a
// row in the same commit as an example.
//
// The blurb is prose a reader and an answer engine both get served, so it is a
// SENTENCE about what the plan is (40–160 characters, checked by that test), derived
// from the example's own header comment — never a keyword list, never a claim.
//
// Group order and item order are the menu's order, and the labels are the <select>'s
// values as well as its text: the Playwright specs select by label, so a label is a
// small public surface. Reorder deliberately, if at all.
// ───────────────────────────────────────────────────────────────────────────────
const EXAMPLE_ROWS = [
  [
    "hillside-villa",
    "Hillside Villa",
    "Showpiece",
    "A two-storey villa with an attached garage on one A2 sheet — the whole language in a single plan.",
  ],
  [
    "one-room",
    "One room",
    "Start here",
    "The smallest complete plan: one room, one door, one window and a dimension chain.",
  ],
  [
    "laneway-house",
    "Laneway House",
    "Start here",
    "A 49 m² one-bedroom cottage where nothing is positioned by hand: every opening and fixture resolves against a wall or a room.",
  ],
  [
    "garden-loft",
    "Garden Loft",
    "Start here",
    "A 35 m² loft: three rooms, a kitchen run with a wall behind it, a bath with real fixtures, and a door into every one of them.",
  ],
  [
    "tiny-house",
    "Tiny House",
    "Start here",
    "A 7.2 x 3.0 m micro-home that argues over millimetres: barn and bifold doors, and the clearances they need.",
  ],
  [
    "studio",
    "Studio (1BR)",
    "Start here",
    "The canonical example: a compact studio flat that passes arch lint, with every room opening off a central hall.",
  ],
  [
    "two-bed",
    "Two-bed flat",
    "Homes",
    "A two-bedroom apartment either side of a central corridor — the plainest complete dwelling in the set.",
  ],
  [
    "attached",
    "Attached (strip)",
    "Homes",
    "A one-bedroom flat with no hand-computed coordinates: a strip of rooms, openings pinned along walls, furniture placed in rooms.",
  ],
  [
    "bungalow",
    "Bungalow (site + doors)",
    "Homes",
    "A single-storey bungalow whose whole layout follows one stated fact: the street is south and the garden north.",
  ],
  [
    "courtyard-house",
    "Courtyard House",
    "Homes",
    "A 16.3 x 11.8 m house whose rooms ring an open courtyard — which is a hole in the building, not a room.",
  ],
  [
    "townhouse",
    "Townhouse (3 levels)",
    "Homes",
    "A 5.5 x 11 m three-storey terrace house: one level block per storey, and one drawing per storey.",
  ],
  [
    "two-storey",
    "Two-storey (2 levels)",
    "Homes",
    "A compact two-storey house whose stair carries the same id on both floors, which is what declares one shaft.",
  ],
  [
    "furnished-flat",
    "Furnished Flat",
    "Homes",
    "A two-bedroom flat furnished from the symbol catalogue: thirty-eight drawn fixture kinds across five domains.",
  ],
  [
    "garden-house",
    "Garden House (site plan)",
    "Homes",
    "A family house on a 22 x 22 m lot drawn as a site plan: the lot line, nine ground materials, fences and a garden.",
  ],
  [
    "museum",
    "Museum (A1 sheet)",
    "Public buildings",
    "A 100 x 60 m museum issued on a real A1 sheet at 1:200, because at that size a web-scaled drawing stops working.",
  ],
  [
    "aquarium",
    "Aquarium (curves)",
    "Public buildings",
    "A public aquarium built around a cylindrical tank — the curved-geometry example: arc walls and a circular room.",
  ],
  [
    "library",
    "Library (legend)",
    "Public buildings",
    "A public library around a circular reading room, issued on a sheet with a room schedule and a fixture legend.",
  ],
  [
    "transit-hall",
    "Transit Hall",
    "Public buildings",
    "A 90 x 40 m metro concourse split by its gate line: one 300 mm partition with nine openings punched by a loop.",
  ],
  [
    "clinic",
    "Clinic (place ×6)",
    "Public buildings",
    "An outpatient wing whose six consulting rooms are one component placed six times, rather than six copies.",
  ],
  [
    "gallery-l",
    "Gallery L (polygons)",
    "Geometry & experiments",
    "A floor whose spaces are not rectangles: an L-shaped gallery whose area is its exact ring area, not its box.",
  ],
  [
    "hexagon-pavilion",
    "Hexagon Pavilion",
    "Geometry & experiments",
    "A hexagonal pavilion: six trapezoidal galleries ringing a circular rotunda, with nothing rectangular anywhere.",
  ],
  [
    "terrace-row",
    "Terrace Row (mirror)",
    "Geometry & experiments",
    "A row of four terrace dwellings generated from one component, placed four times and mirrored in pairs.",
  ],
  [
    "relational",
    "Relational (right-of)",
    "Scripting & composition",
    "Rooms positioned relative to one another with right-of, below and align, resolved to coordinates by arithmetic.",
  ],
  [
    "parametric",
    "Parametric (for loop)",
    "Scripting & composition",
    "A row of studio units generated by a for loop over a range: change one constant and the whole row regenerates.",
  ],
  [
    "accessible",
    "Accessible (accTitle)",
    "Scripting & composition",
    "A two-room plan carrying accTitle and accDescr, the keywords that supply the accessible SVG title and description.",
  ],
  [
    "themed",
    "Themed (brick)",
    "Style",
    "A two-room plan with a brick exterior and a blueprint render theme, showing how a theme restyles the drawing.",
  ],
  [
    "materials",
    "Materials (hatches)",
    "Style",
    "A maker-space whose four walls each carry a different material: the hatch inside a wall is the specification.",
  ],
] as const;

/**
 * Basename → the example's source text. Separate from the table because Vite needs
 * the `?raw` specifiers above to be literal imports, and a table of 27 inline
 * template literals would be exactly the hand-copied duplication this file exists
 * to avoid.
 */
const SOURCES: Record<string, string> = {
  "hillside-villa": hillsideVilla,
  "one-room": oneRoom,
  "laneway-house": lanewayHouse,
  "garden-loft": gardenLoft,
  "tiny-house": tinyHouse,
  studio,
  "two-bed": twoBed,
  attached,
  bungalow,
  "courtyard-house": courtyardHouse,
  townhouse,
  "two-storey": twoStorey,
  "furnished-flat": furnishedFlat,
  "garden-house": gardenHouse,
  museum,
  aquarium,
  library,
  "transit-hall": transitHall,
  clinic,
  "gallery-l": galleryL,
  "hexagon-pavilion": hexagonPavilion,
  "terrace-row": terraceRow,
  relational,
  parametric,
  accessible,
  themed,
  materials,
};

/** One `<optgroup>` in the examples selector: a heading plus its ordered presets. */
export interface ExampleGroup {
  group: string;
  items: readonly { label: string; source: string }[];
}

/**
 * The presets, in menu order — DERIVED from `EXAMPLE_ROWS`, bucketed by the third
 * column in first-appearance order, so the table alone decides both orders and the
 * menu cannot disagree with what the static pages publish.
 */
export const EXAMPLE_GROUPS: readonly ExampleGroup[] = (() => {
  const groups: ExampleGroup[] = [];
  const byName = new Map<string, { group: string; items: { label: string; source: string }[] }>();
  for (const [name, label, group] of EXAMPLE_ROWS) {
    let bucket = byName.get(group);
    if (!bucket) {
      bucket = { group, items: [] };
      byName.set(group, bucket);
      groups.push(bucket);
    }
    bucket.items.push({ label, source: SOURCES[name] ?? "" });
  }
  return groups;
})();

/** Flat label → source map (insertion order = menu order), for lookup by `<select>` value. */
export const EXAMPLES: Record<string, string> = Object.fromEntries(
  EXAMPLE_GROUPS.flatMap((g) => g.items.map((i) => [i.label, i.source])),
);

/** The preset a first, unshared, unsaved visit loads: the table's first row. */
export const DEFAULT_EXAMPLE: string = EXAMPLE_ROWS[0][1];

// Dev-time integrity checks. A duplicate label would silently shadow a preset in
// EXAMPLES (and make the <select>'s value ambiguous), and a row whose basename has
// no `?raw` import above would boot that preset empty — both are typos a build
// cannot see. Stripped from the production bundle by Vite's `import.meta.env.DEV`.
if (import.meta.env.DEV) {
  const labels = EXAMPLE_ROWS.map(([, label]) => label);
  const dupes = labels.filter((l, i) => labels.indexOf(l) !== i);
  if (dupes.length > 0) throw new Error(`playground examples: duplicate label(s): ${dupes.join(", ")}`);
  const missing = EXAMPLE_ROWS.filter(([name]) => !SOURCES[name]).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`playground examples: row(s) with no source import: ${missing.join(", ")}`);
  }
}
