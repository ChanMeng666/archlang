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
import {
  drawBasin,
  drawBathtub,
  drawBidet,
  drawMirror,
  drawShower,
  drawTowelRail,
  drawUrinal,
  drawWc,
} from "./glyphs-bath.js";
import {
  drawBarCounter,
  drawCounter,
  drawDishwasher,
  drawDryer,
  drawFridge,
  drawIsland,
  drawKitchenSink,
  drawLaundrySink,
  drawMicrowave,
  drawOven,
  drawPantry,
  drawRangeHood,
  drawStove,
  drawUpperCabinet,
  drawWasher,
  drawWaterHeater,
} from "./glyphs-kitchen.js";
import {
  drawBed,
  drawBunkBed,
  drawCrib,
  drawDoubleBed,
  drawDresser,
  drawHospitalBed,
  drawNightstand,
  drawVanity,
  drawWardrobe,
} from "./glyphs-bedroom.js";
import {
  drawArmchair,
  drawBeanBag,
  drawBench,
  drawChair,
  drawChaise,
  drawCoatRack,
  drawCoffeeTable,
  drawConsoleTable,
  drawDiningTable,
  drawFireplace,
  drawFloorLamp,
  drawLoveseat,
  drawOttoman,
  drawPiano,
  drawRadiator,
  drawRug,
  drawShoeCabinet,
  drawSideTable,
  drawSideboard,
  drawSofa,
  drawSofaL,
  drawStool,
  drawTable,
  drawTv,
  drawTvUnit,
} from "./glyphs-living.js";
import {
  drawBookshelf,
  drawCar,
  drawDesk,
  drawFilingCabinet,
  drawLocker,
  drawMeetingTable,
  drawOfficeChair,
  drawPlant,
  drawPoolTable,
  drawPrinter,
  drawReceptionDesk,
  drawServerRack,
  drawSunLounger,
  drawTreadmill,
  drawWhiteboard,
  drawWorkstation,
} from "./glyphs-misc.js";
import {
  drawBbq,
  drawBicycle,
  drawBikeRack,
  drawBin,
  drawBollard,
  drawBoulder,
  drawClothesline,
  drawConifer,
  drawEvCharger,
  drawFirePit,
  drawFlowerBed,
  drawHedge,
  drawHotTub,
  drawMailbox,
  drawMotorcycle,
  drawOutdoorChair,
  drawOutdoorTable,
  drawPalm,
  drawPergola,
  drawPicnicTable,
  drawRaisedBed,
  drawSandpit,
  drawShed,
  drawShrub,
  drawSlide,
  drawSwing,
  drawTrampoline,
  drawTree,
  drawUmbrella,
} from "./glyphs-outdoor.js";

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
  // ---- the outdoor tranche (glyphs-outdoor.ts) ----
  // Appended at the END for the reason stated above: this table's order IS the legend's
  // order. Twenty-one families that take the drawing off the building and onto the site —
  // planting, garden furniture, the things parked on a driveway, and the small standing
  // objects a survey records. None of them is `requiresWall`: that flag means services.
  ["tree", "deciduous_tree"],
  ["conifer", "pine"],
  ["shrub", "bush"],
  ["hedge"],
  ["bbq", "grill", "barbecue"],
  ["outdoor_table", "patio_table"],
  ["outdoor_chair", "patio_chair"],
  ["umbrella", "parasol"],
  ["bicycle", "bike"],
  ["motorcycle"],
  ["hot_tub", "spa"],
  ["swing", "swing_set"],
  ["trampoline"],
  ["bin", "wheelie_bin"],
  ["mailbox", "letterbox"],
  ["ev_charger"],
  ["pergola"],
  ["sandpit", "sandbox"],
  ["fire_pit"],
  ["shed", "garden_shed"],
  ["clothesline", "washing_line"],
  // ── kitchen & bath ──
  // Eight families that finish the two wet domains: the three sanitary fixtures a bathroom
  // or a WC block needs beside the four that shipped, the two services a utility room is
  // built around, and the three worktop pieces a kitchen has and the language had no word
  // for. Appended at the END, never slotted in beside their domain neighbours, because this
  // table's order IS the legend's order.
  ["bidet"],
  ["urinal"],
  ["laundry_sink", "laundry_tub"],
  ["water_heater", "boiler"],
  ["mirror"],
  ["range_hood"],
  ["microwave"],
  ["bar_counter"],
  // ── living, bedroom, office ──
  // Eighteen families appended, again at the END and again for the one reason this table has:
  // its order IS the legend's order, so slotting `dresser` in beside `wardrobe` would re-order
  // the legend of every shipped plan that draws a robe. Grouped bedroom, then living, then
  // office/commercial, which is the order the domain modules and the docs tables read in.
  ["bunk_bed"],
  ["crib", "cot"],
  ["dresser", "chest_of_drawers"],
  ["vanity", "dressing_table"],
  ["fireplace"],
  ["radiator"],
  ["sideboard", "buffet"],
  ["loveseat", "sofa_2"],
  ["chaise"],
  ["tv"],
  ["coat_rack"],
  ["shoe_cabinet"],
  ["meeting_table"],
  ["reception_desk"],
  ["filing_cabinet"],
  ["locker"],
  ["pool_table"],
  ["treadmill"],
  // ── the visual-assets tranche (V8) ──
  // Twenty families appended, at the END again, because this table's order IS the legend's
  // order. Living, kitchen, bath, outdoor (planting, then play and street furniture), office,
  // care — the order the domain modules hold them in. `rack` is deliberately not an alias of
  // `server_rack`: a coat rack, a bike rack and a wine rack are racks too, so the bare word names
  // no one piece.
  ["floor_lamp"],
  ["side_table", "end_table"],
  ["console_table"],
  ["ottoman", "pouf", "footstool"],
  ["bean_bag"],
  ["pantry", "tall_cabinet", "larder"],
  ["towel_rail", "towel_radiator"],
  ["palm", "palm_tree"],
  ["flower_bed", "planting_bed"],
  ["boulder", "rock"],
  ["picnic_table"],
  ["slide", "playground_slide"],
  ["bollard"],
  ["bike_rack", "cycle_stand"],
  ["raised_bed", "vegetable_bed"],
  ["whiteboard"],
  ["printer", "copier"],
  ["server_rack"],
  ["hospital_bed"],
  ["workstation", "desk_pod"],
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
 * than accept it. Derived from {@link FIXTURE_FAMILIES}, never retyped: a hand-typed list
 * inside a generator is invisible to `check:drift`, which reproduces its own output, right
 * or wrong.
 */
export const CANONICAL_FIXTURES: readonly string[] = FIXTURE_FAMILIES.map((f) => f[0]);

/**
 * Every catalogued word mapped to the canonical name of the family it belongs to (a canonical
 * name maps to itself). Derived from {@link FIXTURE_FAMILIES}, so an alias can never drift
 * away from the family whose symbol it draws.
 *
 * Exists because a consumer that has one WORD sometimes needs the family: the LSP category
 * completion tells an author that `tub` and `bath` are the same piece as `bathtub`, which is
 * a fact only this table holds — the catalog stores a duplicate row per alias and so cannot
 * say which of the three is the canonical one.
 */
const FAMILY_OF: ReadonlyMap<string, string> = new Map(
  FIXTURE_FAMILIES.flatMap((f) => f.map((word) => [word, f[0]] as const)),
);

/** The canonical name of `category`'s family, or `undefined` if it is not catalogued. */
export function canonicalFixture(category: string): string | undefined {
  return FAMILY_OF.get(category);
}

/**
 * The materials a fixture family can be made of: the closed vocabulary the `rendered` theme tints
 * by (`Theme.materialTints`) and `packages/archlang-3d` shades by. It is that package's material
 * slots (`MATERIAL_SLOTS` in `packages/archlang-3d/src/materials.ts`) without `body`, its untagged
 * default, so a family's material names the same thing in 2D and 3D (visual-assets V-D2);
 * `test/material-vocabulary.test.ts` holds the two lists equal.
 */
export const FIXTURE_MATERIALS = [
  "wood",
  "wood_dark",
  "fabric",
  "cushion",
  "linen",
  "wool",
  "ceramic",
  "stone",
  "metal",
  "glass",
  "appliance",
  "screen",
  "paint",
  "rubber",
  "foliage",
  "bark",
  "soil",
  "water",
] as const;

export type FixtureMaterial = (typeof FIXTURE_MATERIALS)[number];

/**
 * What a fixture family is made of: a PAIR of materials (one {@link FixtureMaterial} each).
 *
 * `primary` is the material of the symbol's body — the top a plan looks down on (a counter's
 * worktop, a bed's covers, a sofa's upholstery). `secondary`, where a family has one, is the
 * material of a second part (a sofa's cushions, a sink's bowl, a hot tub's water, a car's glass,
 * a bunk bed's mattress, a bicycle's tyres). The glyph decides which of its parts that is: most
 * fill their inner part with `GlyphCtx.basin`, which takes the secondary tint; a glyph whose
 * inner part is something else names it with `blank` or `fillFor`. A glyph reads both through its
 * `GlyphCtx`, never from here.
 */
export interface FamilyMaterials {
  readonly primary: FixtureMaterial;
  readonly secondary?: FixtureMaterial;
}

/** A frozen copy of `rows` on a null prototype: only its own keys read as entries. */
function frozenTable<T>(rows: Record<string, T>): Readonly<Record<string, T>> {
  return Object.freeze(Object.assign(Object.create(null) as Record<string, T>, rows));
}

const M = (primary: FixtureMaterial, secondary?: FixtureMaterial): FamilyMaterials =>
  Object.freeze(secondary === undefined ? { primary } : { primary, secondary });

/**
 * Every canonical family's material (visual-assets V-D2): a property of the FAMILY, never read
 * from a `label`, never a language keyword. An alias resolves through its family
 * ({@link familyMaterials}). Exported so the 3D package reads this table instead of retyping it;
 * `test/rendered-theme.test.ts` holds its keys equal to {@link CANONICAL_FIXTURES}. Frozen, on a
 * null prototype, so a consumer can neither edit it nor read an inherited key off it.
 */
export const FIXTURE_FAMILY_MATERIALS: Readonly<Record<string, FamilyMaterials>> = frozenTable({
  // ---- bath ----
  wc: M("ceramic"),
  basin: M("ceramic"),
  shower: M("ceramic", "glass"),
  bathtub: M("ceramic"),
  // ---- kitchen ----
  kitchen_sink: M("stone", "metal"),
  counter: M("stone"),
  stove: M("appliance"),
  fridge: M("appliance"),
  // ---- bedroom ----
  bed: M("linen"),
  double_bed: M("linen"),
  nightstand: M("wood"),
  wardrobe: M("wood"),
  // ---- living ----
  sofa: M("fabric", "cushion"),
  armchair: M("fabric", "cushion"),
  coffee_table: M("wood", "glass"),
  tv_unit: M("wood_dark"),
  // ---- dining & seating ----
  table: M("wood"),
  dining_table: M("wood"),
  chair: M("wood"),
  stool: M("wood", "cushion"),
  bench: M("wood"),
  // ---- office ----
  desk: M("wood"),
  office_chair: M("fabric", "cushion"),
  bookshelf: M("wood"),
  // ---- kitchen appliances & utility ----
  oven: M("appliance", "glass"),
  dishwasher: M("appliance"),
  island: M("stone"),
  upper_cabinet: M("paint"),
  washer: M("appliance", "glass"),
  dryer: M("appliance"),
  // ---- misc ----
  plant: M("foliage"),
  car: M("paint", "glass"),
  // ---- the second furniture tranche ----
  rug: M("wool"),
  sofa_l: M("fabric", "cushion"),
  piano: M("wood_dark"),
  sun_lounger: M("wood", "cushion"),
  // ---- the outdoor tranche ----
  tree: M("foliage"),
  conifer: M("foliage"),
  shrub: M("foliage"),
  hedge: M("foliage"),
  bbq: M("metal"),
  outdoor_table: M("wood"),
  outdoor_chair: M("wood", "cushion"),
  umbrella: M("fabric"),
  bicycle: M("metal", "rubber"),
  motorcycle: M("metal", "rubber"),
  hot_tub: M("wood", "water"),
  swing: M("wood"),
  trampoline: M("metal", "rubber"),
  bin: M("paint"),
  mailbox: M("metal"),
  ev_charger: M("appliance", "screen"),
  pergola: M("wood"),
  sandpit: M("wood", "soil"),
  fire_pit: M("stone"),
  shed: M("wood"),
  clothesline: M("metal"),
  // ── kitchen & bath ──
  bidet: M("ceramic"),
  urinal: M("ceramic"),
  laundry_sink: M("ceramic"),
  water_heater: M("metal"),
  mirror: M("glass"),
  range_hood: M("metal"),
  microwave: M("appliance", "glass"),
  bar_counter: M("stone", "cushion"),
  // ── living, bedroom, office ──
  bunk_bed: M("wood", "linen"),
  crib: M("wood", "linen"),
  dresser: M("wood"),
  vanity: M("wood", "cushion"),
  fireplace: M("stone"),
  radiator: M("metal"),
  sideboard: M("wood"),
  loveseat: M("fabric", "cushion"),
  chaise: M("fabric", "cushion"),
  tv: M("screen"),
  coat_rack: M("wood"),
  shoe_cabinet: M("wood"),
  meeting_table: M("wood"),
  reception_desk: M("wood"),
  filing_cabinet: M("metal"),
  locker: M("metal"),
  pool_table: M("wood_dark", "fabric"),
  treadmill: M("appliance", "rubber"),
  // ── the visual-assets tranche (V8) ──
  floor_lamp: M("fabric", "metal"),
  side_table: M("wood"),
  console_table: M("wood"),
  ottoman: M("fabric", "cushion"),
  bean_bag: M("fabric", "cushion"),
  pantry: M("paint"),
  towel_rail: M("metal"),
  palm: M("foliage", "bark"),
  flower_bed: M("soil", "foliage"),
  boulder: M("stone"),
  picnic_table: M("wood"),
  slide: M("paint", "metal"),
  bollard: M("metal"),
  bike_rack: M("metal"),
  raised_bed: M("wood", "foliage"),
  whiteboard: M("paint", "metal"),
  printer: M("appliance", "screen"),
  server_rack: M("metal"),
  hospital_bed: M("metal", "linen"),
  workstation: M("wood", "fabric"),
});

/** The materials of `category`'s family (an alias resolves through its family), or `undefined`
 *  for a word that is not catalogued. */
export function familyMaterials(category: string): FamilyMaterials | undefined {
  const family = FAMILY_OF.get(category);
  return family === undefined ? undefined : FIXTURE_FAMILY_MATERIALS[family];
}

/**
 * Scene primitives drawing a plan symbol for fixture `category` inside footprint `r`, or
 * `null` if the category has no special symbol (the caller draws a labelled rectangle).
 */
export function fixtureGlyph(category: string, r: Rect, theme: Theme, sizes: RenderSizes): SceneNode[] | null {
  const g: GlyphCtx = glyphCtx(theme, sizes, familyMaterials(category));
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
    // ---- the outdoor tranche ----
    case "tree":
    case "deciduous_tree":
      return drawTree(r, g);
    case "conifer":
    case "pine":
      return drawConifer(r, g);
    case "shrub":
    case "bush":
      return drawShrub(r, g);
    case "hedge":
      return drawHedge(r, g);
    case "bbq":
    case "grill":
    case "barbecue":
      return drawBbq(r, g);
    case "outdoor_table":
    case "patio_table":
      return drawOutdoorTable(r, g);
    case "outdoor_chair":
    case "patio_chair":
      return drawOutdoorChair(r, g);
    case "umbrella":
    case "parasol":
      return drawUmbrella(r, g);
    case "bicycle":
    case "bike":
      return drawBicycle(r, g);
    case "motorcycle":
      return drawMotorcycle(r, g);
    case "hot_tub":
    case "spa":
      return drawHotTub(r, g);
    case "swing":
    case "swing_set":
      return drawSwing(r, g);
    case "trampoline":
      return drawTrampoline(r, g);
    case "bin":
    case "wheelie_bin":
      return drawBin(r, g);
    case "mailbox":
    case "letterbox":
      return drawMailbox(r, g);
    case "ev_charger":
      return drawEvCharger(r, g);
    case "pergola":
      return drawPergola(r, g);
    case "sandpit":
    case "sandbox":
      return drawSandpit(r, g);
    case "fire_pit":
      return drawFirePit(r, g);
    case "shed":
    case "garden_shed":
      return drawShed(r, g);
    case "clothesline":
    case "washing_line":
      return drawClothesline(r, g);
    // ── kitchen & bath ──
    case "bidet":
      return drawBidet(r, g);
    case "urinal":
      return drawUrinal(r, g);
    case "laundry_sink":
    case "laundry_tub":
      return drawLaundrySink(r, g);
    case "water_heater":
    case "boiler":
      return drawWaterHeater(r, g);
    case "mirror":
      return drawMirror(r, g);
    case "range_hood":
      return drawRangeHood(r, g);
    case "microwave":
      return drawMicrowave(r, g);
    case "bar_counter":
      return drawBarCounter(r, g);
    // ── living, bedroom, office ──
    case "bunk_bed":
      return drawBunkBed(r, g);
    case "crib":
    case "cot":
      return drawCrib(r, g);
    case "dresser":
    case "chest_of_drawers":
      return drawDresser(r, g);
    case "vanity":
    case "dressing_table":
      return drawVanity(r, g);
    case "fireplace":
      return drawFireplace(r, g);
    case "radiator":
      return drawRadiator(r, g);
    case "sideboard":
    case "buffet":
      return drawSideboard(r, g);
    case "loveseat":
    case "sofa_2":
      return drawLoveseat(r, g);
    case "chaise":
      return drawChaise(r, g);
    case "tv":
      return drawTv(r, g);
    case "coat_rack":
      return drawCoatRack(r, g);
    case "shoe_cabinet":
      return drawShoeCabinet(r, g);
    case "meeting_table":
      return drawMeetingTable(r, g);
    case "reception_desk":
      return drawReceptionDesk(r, g);
    case "filing_cabinet":
      return drawFilingCabinet(r, g);
    case "locker":
      return drawLocker(r, g);
    case "pool_table":
      return drawPoolTable(r, g);
    case "treadmill":
      return drawTreadmill(r, g);
    // ── the visual-assets tranche (V8) ──
    case "floor_lamp":
      return drawFloorLamp(r, g);
    case "side_table":
    case "end_table":
      return drawSideTable(r, g);
    case "console_table":
      return drawConsoleTable(r, g);
    case "ottoman":
    case "pouf":
    case "footstool":
      return drawOttoman(r, g);
    case "bean_bag":
      return drawBeanBag(r, g);
    case "pantry":
    case "tall_cabinet":
    case "larder":
      return drawPantry(r, g);
    case "towel_rail":
    case "towel_radiator":
      return drawTowelRail(r, g);
    case "palm":
    case "palm_tree":
      return drawPalm(r, g);
    case "flower_bed":
    case "planting_bed":
      return drawFlowerBed(r, g);
    case "boulder":
    case "rock":
      return drawBoulder(r, g);
    case "picnic_table":
      return drawPicnicTable(r, g);
    case "slide":
    case "playground_slide":
      return drawSlide(r, g);
    case "bollard":
      return drawBollard(r, g);
    case "bike_rack":
    case "cycle_stand":
      return drawBikeRack(r, g);
    case "raised_bed":
    case "vegetable_bed":
      return drawRaisedBed(r, g);
    case "whiteboard":
      return drawWhiteboard(r, g);
    case "printer":
    case "copier":
      return drawPrinter(r, g);
    case "server_rack":
      return drawServerRack(r, g);
    case "hospital_bed":
      return drawHospitalBed(r, g);
    case "workstation":
    case "desk_pod":
      return drawWorkstation(r, g);
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
