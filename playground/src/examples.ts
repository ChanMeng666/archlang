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

/** One `<optgroup>` in the examples selector: a heading plus its ordered presets. */
export interface ExampleGroup {
  group: string;
  items: readonly { label: string; source: string }[];
}

/**
 * The presets, in menu order. Labels are the <select>'s values as well as its text,
 * so they are a small public surface: the Playwright specs select by label, and a
 * shared link never carries one (a share hash carries source, not a preset name).
 */
export const EXAMPLE_GROUPS: readonly ExampleGroup[] = [
  {
    group: "Start here",
    items: [
      { label: "One room", source: oneRoom },
      { label: "Laneway House", source: lanewayHouse },
      { label: "Garden Loft", source: gardenLoft },
      { label: "Tiny House", source: tinyHouse },
      { label: "Studio (1BR)", source: studio },
    ],
  },
  {
    group: "Homes",
    items: [
      { label: "Two-bed flat", source: twoBed },
      { label: "Attached (strip)", source: attached },
      { label: "Bungalow (site + doors)", source: bungalow },
      { label: "Courtyard House", source: courtyardHouse },
      { label: "Townhouse (3 levels)", source: townhouse },
      { label: "Two-storey (2 levels)", source: twoStorey },
    ],
  },
  {
    group: "Public buildings",
    items: [
      { label: "Museum (A1 sheet)", source: museum },
      { label: "Aquarium (curves)", source: aquarium },
      { label: "Library (legend)", source: library },
      { label: "Transit Hall", source: transitHall },
      { label: "Clinic (place ×6)", source: clinic },
    ],
  },
  {
    group: "Geometry & experiments",
    items: [
      { label: "Gallery L (polygons)", source: galleryL },
      { label: "Hexagon Pavilion", source: hexagonPavilion },
      { label: "Terrace Row (mirror)", source: terraceRow },
    ],
  },
  {
    group: "Scripting & composition",
    items: [
      { label: "Relational (right-of)", source: relational },
      { label: "Parametric (for loop)", source: parametric },
      { label: "Accessible (accTitle)", source: accessible },
    ],
  },
  {
    group: "Style",
    items: [
      { label: "Themed (brick)", source: themed },
      { label: "Materials (hatches)", source: materials },
    ],
  },
];

/** Flat label → source map (insertion order = menu order), for lookup by `<select>` value. */
export const EXAMPLES: Record<string, string> = Object.fromEntries(
  EXAMPLE_GROUPS.flatMap((g) => g.items.map((i) => [i.label, i.source])),
);

/** The preset a first, unshared, unsaved visit loads. */
export const DEFAULT_EXAMPLE = "Laneway House";

// Dev-time integrity checks. A duplicate label would silently shadow a preset in
// EXAMPLES (and make the <select>'s value ambiguous), and a DEFAULT_EXAMPLE that
// names no preset would boot the editor empty — both are typos a build cannot see.
// Stripped from the production bundle by Vite's `import.meta.env.DEV` constant.
if (import.meta.env.DEV) {
  const labels = EXAMPLE_GROUPS.flatMap((g) => g.items.map((i) => i.label));
  const dupes = labels.filter((l, i) => labels.indexOf(l) !== i);
  if (dupes.length > 0) throw new Error(`playground examples: duplicate label(s): ${dupes.join(", ")}`);
  if (!(DEFAULT_EXAMPLE in EXAMPLES)) {
    throw new Error(`playground examples: DEFAULT_EXAMPLE "${DEFAULT_EXAMPLE}" is not a preset`);
  }
}
