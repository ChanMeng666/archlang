/**
 * The extended handedness survey: for every fixture family, is its glyph HANDED — different
 * from its own mirror image — at a sweep of footprints and absolute positions?
 *
 * "Handed" is asked exactly as `analyze/symmetry.ts`'s `handed()` asks it (the predicate behind
 * `describe --facts symmetry`'s `hand`, and the renderer's own `mirrorGlyph` test): the piece
 * stands at `at` with its size, `cx = at.x + w/2`, the glyph is drawn into the rect
 * `{ x: cx − w/2, … }` at unit pens, and it is handed when `marksEqual(nodes, mirrored)` is
 * false. Absolute position is part of the sweep on purpose: an ulp in a derived coordinate
 * depends on where the piece stands, and an ulp that changes a glyph's STRUCTURE (a zero-length
 * edge on one side and not the other) makes a symmetric symbol read as handed.
 *
 * No runtime imports — every function it needs is handed in as {@link HandednessApi} — so the
 * same body measures any checkout. To re-measure (prints the table literal):
 *
 *     npx tsx test/handedness-survey.ts <checkout-root>          # the 7-footprint survey
 *     npx tsx test/handedness-survey.ts <checkout-root> --grid   # the 19 x 19 grid
 */

import type { SceneNode } from "../src/scene.js";
import type { Theme } from "../src/theme.js";
import type { RenderSizes } from "../src/scene.js";

export interface HandednessApi {
  CANONICAL_FIXTURES: readonly string[];
  fixtureGlyph: (
    category: string,
    r: { x: number; y: number; w: number; h: number },
    theme: Theme,
    sizes: RenderSizes,
  ) => SceneNode[] | null;
  marksEqual: (a: readonly SceneNode[], b: readonly SceneNode[]) => boolean;
  mirrorNode: (n: SceneNode, axis: number) => SceneNode;
  defaultFootprint: (category: string) => { along: number; depth: number } | null;
  DEFAULT_THEME: Theme;
}

/** The footprints, in table-column order: the catalogued one, then shapes and odd sizes. */
export const SURVEY_FOOTPRINTS: readonly (readonly [string, number | null, number | null])[] = [
  ["catalogue", null, null], // the catalogued footprint, else 1000 x 600 (the HANDED survey's)
  ["square", 1000, 1000],
  ["portrait 1:3", 600, 1800],
  ["landscape 3:1", 1800, 600],
  ["640", 640, 640],
  ["777", 777, 777],
  ["555x900", 555, 900],
];

/** The absolute positions `at (o, o)` each footprint is measured at. */
export const SURVEY_OFFSETS: readonly number[] = [0, 100, 1000];

/** `analyze/symmetry.ts`'s unit pens. */
const HAND_SIZES: RenderSizes = {
  refDim: 1,
  wallStroke: 1,
  thin: 1,
  roomFont: 1,
  areaFont: 1,
  dimFont: 1,
  furnFont: 1,
  margin: 1,
  hatchGap: 1,
};

/**
 * One row per family: per footprint (in {@link SURVEY_FOOTPRINTS} order, space-separated) one
 * character per offset (in {@link SURVEY_OFFSETS} order) — `H` handed, `.` not.
 */
export function surveyHandedness(api: HandednessApi): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of api.CANONICAL_FIXTURES) {
    const fp = api.defaultFootprint(c);
    const groups: string[] = [];
    for (const [, fw, fh] of SURVEY_FOOTPRINTS) {
      const w = fw ?? fp?.along ?? 1000;
      const h = fh ?? fp?.depth ?? 600;
      let g = "";
      for (const o of SURVEY_OFFSETS) {
        const cx = o + w / 2;
        const cy = o + h / 2;
        const nodes = api.fixtureGlyph(c, { x: cx - w / 2, y: cy - h / 2, w, h }, api.DEFAULT_THEME, HAND_SIZES);
        const handed =
          nodes !== null &&
          !api.marksEqual(
            nodes,
            nodes.map((n) => api.mirrorNode(n, cx)),
          );
        g += handed ? "H" : ".";
      }
      groups.push(g);
    }
    out[c] = groups.join(" ");
  }
  return out;
}

/**
 * The footprint sides of the GRID sweep: every width x every depth, 19 x 19. Round sizes, the
 * odd ones the 7-footprint survey uses (333, 555, 777, 1111), and the catalogue's range up to
 * 3 m. The odd sides are the point: integer millimetres times a glyph's three-decimal fraction
 * land on the `x.xxxx5` rounding ties the handedness key has to survive (`glyph-chirality.ts`).
 */
export const GRID_SIDES: readonly number[] = [
  300, 333, 400, 450, 500, 555, 600, 700, 777, 800, 900, 1000, 1111, 1200, 1500, 1800, 2000, 2400, 3000,
];

/**
 * The grid sweep, one entry per family: for each offset in {@link SURVEY_OFFSETS} order, one row
 * per width in {@link GRID_SIDES} order, one character per depth in the same order — `H` handed,
 * `.` not — collapsed to `"all"` / `"none"` when every cell agrees. The predicate is
 * {@link surveyHandedness}'s, cell for cell.
 */
export function surveyGrid(api: HandednessApi): Record<string, "all" | "none" | readonly string[]> {
  const out: Record<string, "all" | "none" | readonly string[]> = {};
  for (const c of api.CANONICAL_FIXTURES) {
    const rows: string[] = [];
    for (const o of SURVEY_OFFSETS) {
      for (const w of GRID_SIDES) {
        let row = "";
        for (const h of GRID_SIDES) {
          const cx = o + w / 2;
          const cy = o + h / 2;
          const nodes = api.fixtureGlyph(c, { x: cx - w / 2, y: cy - h / 2, w, h }, api.DEFAULT_THEME, HAND_SIZES);
          const handed =
            nodes !== null &&
            !api.marksEqual(
              nodes,
              nodes.map((n) => api.mirrorNode(n, cx)),
            );
          row += handed ? "H" : ".";
        }
        rows.push(row);
      }
    }
    const all = rows.join("");
    out[c] = /^H+$/.test(all) ? "all" : /^\.+$/.test(all) ? "none" : rows;
  }
  return out;
}

// The re-measuring entry point. Guarded so importing this module (as the test does) runs nothing.
if (typeof process !== "undefined" && /handedness-survey\.ts$/.test(process.argv[1] ?? "")) {
  const { resolve } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const root = process.argv[2] ?? ".";
  const url = (rel: string): string => pathToFileURL(resolve(root, rel)).href;
  const [glyphs, chirality, catalog, theme] = await Promise.all([
    import(/* @vite-ignore */ url("src/elements/fixtures-glyphs.ts")),
    import(/* @vite-ignore */ url("src/elements/glyph-chirality.ts")),
    import(/* @vite-ignore */ url("src/fixtures-catalog.ts")),
    import(/* @vite-ignore */ url("src/theme.ts")),
  ]);
  const api: HandednessApi = {
    CANONICAL_FIXTURES: glyphs.CANONICAL_FIXTURES,
    fixtureGlyph: glyphs.fixtureGlyph,
    marksEqual: chirality.marksEqual,
    mirrorNode: chirality.mirrorNode,
    defaultFootprint: catalog.defaultFootprint,
    DEFAULT_THEME: theme.DEFAULT_THEME,
  };
  if (process.argv.includes("--grid")) {
    for (const [c, v] of Object.entries(surveyGrid(api))) {
      if (typeof v === "string") console.log(`  ${c}: "${v}",`);
      else console.log(`  ${c}: [\n${v.map((r) => `    "${r}",`).join("\n")}\n  ],`);
    }
  } else {
    for (const [c, row] of Object.entries(surveyHandedness(api))) console.log(`  ${c}: "${row}",`);
  }
}
