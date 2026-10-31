/**
 * The furnish table and the family reading of a held piece, shared by `src/furnish.ts` (the
 * `finish` stage that writes the pieces) and the `W_ROOM_MISSING_DEFINING` lint rule
 * (`src/lint/rules/room-contents.ts`, which reads the piece that defines a room). Moved here
 * verbatim from `furnish.ts` so the lint layer can read the table without importing the
 * stage, which itself imports `lint.ts`. Pure data and two pure functions.
 */

import type { UseKind } from "./ast.js";
import { canonicalFixture } from "./elements/fixtures-glyphs.js";
import { defaultFootprint, fixtureSpec, zoneFixtureCategories } from "./fixtures-catalog.js";

/** How a piece is placed. */
export type FurnishPlacement =
  /** A services fixture on a wall: `against wall <id> offset <mm>`, the catalogued footprint. */
  | "wall"
  /** A free-standing piece with its back to a wall: `in <room> anchor <edge or corner> flush`. */
  | "back"
  /** In the middle of the room: `in <room> anchor center`. */
  | "centre"
  /** In front of the piece listed before it: the same edge anchor, `inset` past that piece. */
  | "front";

export interface FurnishItem {
  /** The catalogue word that is written. */
  category: string;
  /** Catalogue words tried, in order, when `category` cannot be placed. */
  or?: readonly string[];
  /** A required piece that cannot be placed leaves the whole room empty; an optional one is left out. */
  required: boolean;
  place: FurnishPlacement;
  /**
   * Footprints tried in order, `along` the wall × `depth` into the room, in mm. Absent =
   * the catalogue's own footprint. `finish` writes the one it used as an explicit `size`.
   */
  sizes?: readonly (readonly [along: number, depth: number])[];
}

const wet = zoneFixtureCategories("wet");
const kitchen = zoneFixtureCategories("kitchen");
/** A wet-room or kitchen fixture, admitted only when the catalogue lists it for that zone. */
const zoned = (zone: ReadonlySet<string>, required: boolean, category: string, ...or: string[]): FurnishItem[] => {
  const [first, ...rest] = [category, ...or].filter((c) => zone.has(c) && defaultFootprint(c) !== null);
  return first === undefined
    ? []
    : [{ category: first, ...(rest.length > 0 ? { or: rest } : {}), required, place: "wall" }];
};

/**
 * What goes in a room, by use. Every word is one `src/fixtures-catalog.ts` already has; the
 * wet-room and kitchen rows are read through the catalogue's own zones. A use with no row
 * (`hall`, `circulation`, `entry`, `storage`, `garage`, `utility`) is never furnished; a room
 * left empty for it is named in `unresolved`.
 *
 * The rows describe the rooms of a DWELLING. `utility` has no row because the tag does not
 * say laundry: a plant room carries it too. A room larger than {@link MAX_ROOM_AREA_M2} is
 * not a dwelling room whatever its tag says, and is reported instead of furnished.
 */
export const FURNISH_TABLE: Readonly<Partial<Record<UseKind, readonly FurnishItem[]>>> = Object.freeze({
  bedroom: [
    {
      category: "bed",
      required: true,
      place: "back",
      sizes: [
        [1500, 2000],
        [900, 2000],
      ],
    },
    {
      category: "wardrobe",
      required: false,
      place: "back",
      sizes: [
        [1800, 600],
        [1200, 600],
      ],
    },
  ],
  living: [
    {
      category: "sofa",
      required: true,
      place: "back",
      sizes: [
        [2000, 900],
        [1600, 900],
      ],
    },
    { category: "coffee_table", required: false, place: "front", sizes: [[1000, 600]] },
  ],
  dining: [
    {
      category: "dining_table",
      required: true,
      place: "centre",
      sizes: [
        [1800, 1500],
        [1400, 1300],
      ],
    },
  ],
  office: [
    {
      category: "desk",
      required: true,
      place: "back",
      sizes: [
        [1400, 700],
        [1200, 600],
      ],
    },
    { category: "office_chair", required: false, place: "front", sizes: [[500, 500]] },
  ],
  // PS2.17: a worktop is required, so a kitchen is never a sink, a hob and a fridge butted
  // together with nowhere to prepare food. `finish` stands it in the run beside the hob, and
  // against another wall only when the run has no room for it (`src/furnish.ts`, `spill`).
  kitchen: [
    ...zoned(kitchen, true, "kitchen_sink"),
    ...zoned(kitchen, true, "stove"),
    // The catalogue's 600 mm module first, then a 400 mm one, before the kitchen is given up.
    ...zoned(kitchen, true, "counter", "worktop").map((i) => ({
      ...i,
      sizes: [
        [600, 600],
        [400, 600],
      ] as const,
    })),
    ...zoned(kitchen, false, "fridge"),
  ],
  bath: [...zoned(wet, true, "wc"), ...zoned(wet, true, "basin"), ...zoned(wet, false, "bathtub", "shower")],
  wc: [...zoned(wet, true, "wc"), ...zoned(wet, true, "basin")],
});

export const familyOf = (word: string): string => canonicalFixture(word) ?? word;
/**
 * The families a held piece does the job of: its own (`couch` is a `sofa`), and the one the
 * catalogue says it serves (`double_bed` serves `bed`, a bare `sink` serves `basin`).
 */
export const servedBy = (category: string): string[] => {
  const serves = fixtureSpec(category)?.serves;
  return serves === undefined ? [familyOf(category)] : [familyOf(category), familyOf(serves)];
};
