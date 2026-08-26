/**
 * The fixture vocabulary and the dispatch to each category's drawn plan symbol.
 *
 * Furniture renders as a labelled rectangle, which reads as an empty box for a WC or a
 * shower. {@link fixtureGlyph} returns a small set of Scene primitives drawing a
 * recognizable plan symbol for known fixture categories, in the same drawing vocabulary as
 * the door arcs and window panes. `furniture.render()` calls this first and falls back to the
 * plain rectangle when it returns `null` — so a category with no symbol yet costs nothing and
 * changes no output.
 *
 * The symbols themselves live in the `glyphs-*.ts` domain modules beside this one; this file
 * is the vocabulary table plus the dispatch. Keeping the dispatch HERE is load-bearing:
 * `test/cli-manifest.test.ts` scrapes the `case "…"` labels out of this very file and
 * set-equates them with {@link FIXTURE_CATEGORIES}, which is what stops a category from being
 * advertised by `arch manifest` and then not drawn (or drawn and not advertised).
 *
 * Symbols are drawn with their "back" (the side placed against a wall) along the top edge of
 * the footprint, which matches the standard library sizes in `examples/lib/fixtures.arch`.
 * Pure and deterministic (no clock, no randomness).
 */

import type { SceneNode } from "../scene.js";
import type { RenderSizes } from "../scene.js";
import type { Theme } from "../theme.js";
import { DEFAULT_THEME } from "../theme.js";
import type { GlyphCtx, Rect } from "./glyph-lib.js";
import { glyphCtx } from "./glyph-lib.js";
import { drawBasin, drawBathtub, drawShower, drawWc } from "./glyphs-bath.js";
import {
  drawCounter,
  drawDishwasher,
  drawDryer,
  drawFridge,
  drawIsland,
  drawKitchenSink,
  drawOven,
  drawStove,
  drawUpperCabinet,
  drawWasher,
} from "./glyphs-kitchen.js";
import { drawBed, drawDoubleBed, drawNightstand, drawWardrobe } from "./glyphs-bedroom.js";
import {
  drawArmchair,
  drawBench,
  drawChair,
  drawCoffeeTable,
  drawDiningTable,
  drawPiano,
  drawRug,
  drawSofa,
  drawSofaL,
  drawStool,
  drawTable,
  drawTvUnit,
} from "./glyphs-living.js";
import { drawBookshelf, drawCar, drawDesk, drawOfficeChair, drawPlant, drawSunLounger } from "./glyphs-misc.js";

export type { Rect } from "./glyph-lib.js";

/**
 * One fixture FAMILY: a canonical category name followed by its aliases. Aliases are
 * synonyms all the way down — they share a case arm here and carry a duplicate catalog row,
 * the pattern `wc`/`toilet` has used since the first symbol shipped.
 *
 * Declaration ORDER is meaningful: {@link FIXTURE_CATEGORIES} is this table flattened, and
 * the legend prints its fixture rows in that order (a stable reference list, not source
 * order). **Append new families at the END** — inserting one in the middle re-orders the
 * legend of every plan that draws one.
 */
const FIXTURE_FAMILIES: readonly (readonly [string, ...string[]])[] = [
  // ---- bath (glyphs-bath.ts) ----
  ["wc", "toilet"],
  ["basin", "lavatory"],
  ["shower"],
  ["bathtub", "tub", "bath"],
  // ---- kitchen (glyphs-kitchen.ts) ----
  ["kitchen_sink", "sink"],
  ["counter", "worktop"],
  ["stove", "hob", "cooktop"],
  ["fridge", "refrigerator"],
  // ---- bedroom (glyphs-bedroom.ts) ----
  ["bed"],
  ["double_bed"],
  ["nightstand", "bedside_table"],
  ["wardrobe", "robe", "closet"],
  // ---- living (glyphs-living.ts) ----
  ["sofa", "couch"],
  ["armchair"],
  ["coffee_table"],
  ["tv_unit"],
  // ---- dining & seating (glyphs-living.ts) ----
  ["table"],
  ["dining_table"],
  ["chair"],
  ["stool", "barstool"],
  ["bench"],
  // ---- office (glyphs-misc.ts) ----
  ["desk"],
  ["office_chair"],
  ["bookshelf", "bookcase", "shelf"],
  // ---- kitchen appliances & utility (glyphs-kitchen.ts) ----
  ["oven"],
  ["dishwasher"],
  ["island"],
  ["upper_cabinet", "wall_cabinet"],
  ["washer", "washing_machine"],
  ["dryer"],
  // ---- misc (glyphs-misc.ts) ----
  ["plant", "planter"],
  ["car"],
  // ---- the second furniture tranche (glyphs-living.ts, glyphs-misc.ts) ----
  // Appended, not slotted in beside their domain neighbours, because this table's order is
  // the LEGEND's order: inserting `rug` up beside `sofa` would re-order the legend of every
  // shipped plan that draws a sofa, for nothing.
  ["rug", "carpet"],
  ["sofa_l", "corner_sofa"],
  ["piano", "grand_piano"],
  ["sun_lounger", "lounger"],
];

/**
 * The fixture categories the language knows (every `case` below, aliases included). Exported
 * as the single source of truth so the CLI capability manifest (`arch manifest`) can
 * advertise them without re-listing; the `test/cli-manifest.test.ts` drift guard asserts they
 * match the dispatch switch exactly.
 *
 * "Known" is not the same as "drawn": a family whose symbol is not written yet is still in
 * this list, because the catalog gives it a footprint, a wall requirement and lint
 * semantics — which is what `furniture bed …` needs to behave like a bed. Use
 * {@link hasFixtureGlyph} to ask the narrower question.
 */
export const FIXTURE_CATEGORIES: readonly string[] = FIXTURE_FAMILIES.flatMap((f) => [...f]);

/**
 * One name per family — the word to print when a document has to NAME the vocabulary rather
 * than accept it. Derived from {@link FIXTURE_FAMILIES}, never retyped: `spec.llm.md`'s
 * furniture line used to spell a hand-typed eight-word list, which is prose inside a
 * generator and therefore invisible to `check:drift` (it reproduces its own output, right or
 * wrong — the v1.26.0 defect class).
 */
export const CANONICAL_FIXTURES: readonly string[] = FIXTURE_FAMILIES.map((f) => f[0]);

/**
 * Scene primitives drawing a plan symbol for fixture `category` inside footprint `r`, or
 * `null` if the category has no special symbol (the caller draws a labelled rectangle).
 */
export function fixtureGlyph(category: string, r: Rect, theme: Theme, sizes: RenderSizes): SceneNode[] | null {
  const g: GlyphCtx = glyphCtx(theme, sizes);
  switch (category) {
    // ---- bath ----
    case "wc":
    case "toilet":
      return drawWc(r, g);
    case "basin":
    case "lavatory":
      return drawBasin(r, g);
    case "shower":
      return drawShower(r, g);
    case "bathtub":
    case "tub":
    case "bath":
      return drawBathtub(r, g);
    // ---- kitchen ----
    case "kitchen_sink":
    case "sink":
      return drawKitchenSink(r, g);
    case "counter":
    case "worktop":
      return drawCounter(r, g);
    case "stove":
    case "hob":
    case "cooktop":
      return drawStove(r, g);
    case "fridge":
    case "refrigerator":
      return drawFridge(r, g);
    // ---- bedroom ----
    case "bed":
      return drawBed(r, g);
    case "double_bed":
      return drawDoubleBed(r, g);
    case "nightstand":
    case "bedside_table":
      return drawNightstand(r, g);
    case "wardrobe":
    case "robe":
    case "closet":
      return drawWardrobe(r, g);
    // ---- living ----
    case "sofa":
    case "couch":
      return drawSofa(r, g);
    case "armchair":
      return drawArmchair(r, g);
    case "coffee_table":
      return drawCoffeeTable(r, g);
    case "tv_unit":
      return drawTvUnit(r, g);
    // ---- dining & seating ----
    case "table":
      return drawTable(r, g);
    case "dining_table":
      return drawDiningTable(r, g);
    case "chair":
      return drawChair(r, g);
    case "stool":
    case "barstool":
      return drawStool(r, g);
    case "bench":
      return drawBench(r, g);
    // ---- office ----
    case "desk":
      return drawDesk(r, g);
    case "office_chair":
      return drawOfficeChair(r, g);
    case "bookshelf":
    case "bookcase":
    case "shelf":
      return drawBookshelf(r, g);
    // ---- kitchen appliances & utility ----
    case "oven":
      return drawOven(r, g);
    case "dishwasher":
      return drawDishwasher(r, g);
    case "island":
      return drawIsland(r, g);
    case "upper_cabinet":
    case "wall_cabinet":
      return drawUpperCabinet(r, g);
    case "washer":
    case "washing_machine":
      return drawWasher(r, g);
    case "dryer":
      return drawDryer(r, g);
    // ---- misc ----
    case "plant":
    case "planter":
      return drawPlant(r, g);
    case "car":
      return drawCar(r, g);
    // ---- the second furniture tranche ----
    case "rug":
    case "carpet":
      return drawRug(r, g);
    case "sofa_l":
    case "corner_sofa":
      return drawSofaL(r, g);
    case "piano":
    case "grand_piano":
      return drawPiano(r, g);
    case "sun_lounger":
    case "lounger":
      return drawSunLounger(r, g);
    default:
      return null;
  }
}

/** A unit footprint and unit pen sizes — enough to ask a glyph whether it draws at all. */
const PROBE_RECT: Rect = { x: 0, y: 0, w: 1, h: 1 };
const PROBE_SIZES: RenderSizes = {
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
 * Does this category draw a dedicated plan symbol, as opposed to the labelled rectangle?
 *
 * Answered by **asking the glyph**, not by a flag beside it. The legend lists one row per
 * drawn symbol, so a flag would have to be flipped in a second place the day a symbol is
 * written — and forgetting would silently drop the row while the drawing changed. Calling the
 * dispatch on a unit rect makes the two impossible to disagree: fill in a stub and the legend
 * row appears with it. `fixtureGlyph` is pure, so this allocates a few points and nothing else.
 */
export function hasFixtureGlyph(category: string): boolean {
  return fixtureGlyph(category, PROBE_RECT, DEFAULT_THEME, PROBE_SIZES) !== null;
}
