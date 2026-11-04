/**
 * The taste criteria's advice codes, names and sources (ADR 0032). `A_*` codes are advice, not
 * diagnostics: they never enter `lint()`, `describe()` or `src/error-catalog.ts`, and `arch
 * explain` does not know them yet. Every criterion has exactly one row here, with a code, a
 * source and the words its message is built from (the guard is in `test/taste.test.ts`).
 */

import type { TasteSubscore, TasteVerified } from "./report.js";

export interface TasteAdviceRow {
  /** The criterion id, `R<n>` as numbered in
   *  `archlang-lab/plans/plan-soundness/research/2026-10-24-ps5-taste-design.md` §3. */
  id: string;
  name: string;
  subscore: TasteSubscore;
  /** The `A_*` code reported when the criterion scores below 1. */
  code: string;
  source: string;
  verified: TasteVerified;
  /** What the criterion asks, as the message's lead clause when it cannot judge. */
  asks: string;
}

/** In criterion (R-number) order. */
export const TASTE_ADVICE: readonly TasteAdviceRow[] = [
  {
    id: "R3",
    name: "intimacy-gradient",
    subscore: "zoning",
    code: "A_INTIMACY_INVERSION",
    source: "Alexander, A Pattern Language, 127 (intimacy gradient)",
    verified: "V",
    asks: "no living, dining or kitchen room deeper from the entrance than a bedroom",
  },
  {
    id: "R6",
    name: "furniture-use-match",
    subscore: "furnishing",
    code: "A_FURNITURE_USE_MISMATCH",
    source:
      "ArchLang fixture catalogue: the wet and kitchen zones and a bedroom's defining piece (catalogue semantics; no external threshold)",
    verified: "V",
    asks: "every plumbing fixture, kitchen fitting and bed in a room of its use",
  },
  {
    id: "R7",
    name: "daylight-ratio",
    subscore: "light",
    code: "A_DAYLIGHT_LOW",
    source: "IRC R303.1 (glazing at least 8 % of the floor area of a habitable room)",
    verified: "S",
    asks: "glazing of at least 8 % of the floor area in every habitable room",
  },
  {
    id: "R9",
    name: "proportion",
    subscore: "geometry",
    code: "A_ROOM_ELONGATED",
    source:
      "Palladio, I Quattro Libri I.xxi (preferred room shapes, the longest 2:1), as read in Mitrović, Nexus Network Journal 6(2), 2004; ResPlan aspect priors (design-taste.md §4)",
    verified: "S",
    asks: "rooms no longer than 2:1 (2.5:1 for a bathroom or WC) by their minimum enclosing rectangle",
  },
  {
    id: "R11",
    name: "kitchen-dining-link",
    subscore: "zoning",
    code: "A_KITCHEN_APART",
    source:
      "Alexander, A Pattern Language, 139 (farmhouse kitchen); ResPlan: kitchen and living touch in 99 % of plans",
    verified: "V",
    asks: "every kitchen opening onto a living or dining room, or sharing one",
  },
  {
    id: "R12",
    name: "dwelling-aspect",
    subscore: "light",
    code: "A_SINGLE_ASPECT",
    source:
      "London Plan Policy D6 and London Plan Guidance, housing design C4.1 (dual aspect; no single-aspect home facing north)",
    verified: "S",
    asks: "habitable windows on at least two sides of the dwelling",
  },
  {
    id: "R14",
    name: "common-area-at-heart",
    subscore: "circulation",
    code: "A_COMMON_AREA_PERIPHERAL",
    source: "Alexander, A Pattern Language, 129 (common areas at the heart); Hanson 1998 (integration)",
    verified: "V",
    asks: "a living or dining room among the best-integrated third of the rooms",
  },
  {
    id: "R15",
    name: "night-zone-contiguity",
    subscore: "zoning",
    code: "A_NIGHT_ZONE_SPLIT",
    source: "动静分区 (day/night zoning, residential practice); Alexander, A Pattern Language, 136 (couple's realm)",
    verified: "V",
    asks: "bedrooms that open off a common hall or corridor",
  },
  {
    id: "R16",
    name: "corner-doors",
    subscore: "circulation",
    code: "A_DOOR_OFF_CORNER",
    source: "Alexander, A Pattern Language, 196 (corner doors); ResPlan jamb-to-corner priors (design-taste.md §4)",
    verified: "V",
    asks: "doors into rooms under 15 m² within max(wall thickness, 600 mm) of a corner",
  },
  {
    id: "R17",
    name: "axis-economy",
    subscore: "geometry",
    code: "A_AXES_SCATTERED",
    source: "Brandão 2008 (wall segments)",
    verified: "S",
    asks: "room and wall edges on at most 1.5 shared axes per room",
  },
  {
    id: "R18",
    name: "shape-regularity",
    subscore: "geometry",
    code: "A_ROOM_IRREGULAR",
    source:
      "Alexander, A Pattern Language, 191 (the shape of indoor space); ResPlan rectangularity priors (design-taste.md §4)",
    verified: "V",
    asks: "bedrooms, bathrooms and kitchens that fill at least 90 % of their enclosing rectangle",
  },
];

/** The row of one criterion; throws on an id with no row (a programming error). */
export function adviceOf(id: string): TasteAdviceRow {
  const row = TASTE_ADVICE.find((r) => r.id === id);
  if (!row) throw new Error(`taste: no advice row for ${id}`);
  return row;
}
