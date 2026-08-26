/**
 * Frozen fixture catalog — tacit architectural knowledge about furniture/fixtures
 * as pure, deterministic data. Today it records which fixtures conventionally sit
 * **against a wall** (plumbing fixtures and kitchen runs need a wall behind them for
 * supply/waste/venting), used by the `lint` clearance/placement rules. It is the
 * seam for future per-category default footprints and clearance envelopes.
 *
 * Keyed by the same `furniture <category>` names the renderer's fixture glyphs use
 * (see `elements/fixtures-glyphs.ts`); aliases share one entry. Pure data — no I/O.
 */

export interface FixtureSpec {
  /** Conventionally installed against a wall (plumbing/venting/supply). */
  requiresWall: boolean;
  /**
   * Minimum activity clearance (mm) directly in front of the fixture — the space a
   * person needs to use it. Deliberately conservative (tight enough that a normal
   * layout never trips it, generous enough to catch a piece parked right in front).
   * 0 / omitted means "no frontal clearance check" (e.g. a shower you stand inside).
   */
  clearanceMm?: number;
  /**
   * A conventional default footprint (mm) in **wall-relative** axes — `along` runs
   * parallel to the wall the fixture backs onto, `depth` projects into the room. Lets
   * `furniture <cat> against wall <id>` omit an explicit `size`; closed-form, never a
   * guess among alternatives (ADR 0005). Omitted for free-standing furniture.
   */
  footprint?: { along: number; depth: number };
  /**
   * Which room zone(s) this category satisfies for the `W_ROOM_NO_FIXTURE` lint rule
   * (a bathroom needs a wet fixture, a kitchen a kitchen fixture). The membership
   * encodes lint's long-standing behaviour exactly — e.g. `sink` counts for both
   * zones, while `lavatory` deliberately carries none (it never counted; flipping
   * that is a behaviour change, not a refactor).
   */
  zones?: readonly FixtureZone[];
  /**
   * The drawn plan symbol is **rotation-symmetric** — it has no distinguishable
   * back, so which way the piece faces carries no meaning (a shower tray: outline,
   * both diagonals, a centre drain). Orientation reasoning skips these: they still
   * need a wall (`requiresWall`) but never trip `W_FIXTURE_BACK_TO_ROOM` and never
   * get a derived `rotate`. Omitted = the symbol has a back (a WC's cistern, a
   * basin's tap, a counter's nosing), so its facing is a real architectural fact.
   */
  symmetric?: boolean;
}

/** A room zone a fixture can satisfy (see {@link FixtureSpec.zones}). */
export type FixtureZone = "wet" | "kitchen";

/** Catalog entries, keyed by category (and its aliases). */
const CATALOG: Readonly<Record<string, FixtureSpec>> = Object.freeze({
  // Wet-room plumbing fixtures — need a wall behind them.
  wc: { requiresWall: true, clearanceMm: 450, footprint: { along: 400, depth: 700 }, zones: ["wet"] },
  toilet: { requiresWall: true, clearanceMm: 450, footprint: { along: 400, depth: 700 }, zones: ["wet"] },
  basin: { requiresWall: true, clearanceMm: 450, footprint: { along: 600, depth: 450 }, zones: ["wet"] },
  // No zone: lint's wet-fixture set never included `lavatory` (see FixtureSpec.zones).
  lavatory: { requiresWall: true, clearanceMm: 450, footprint: { along: 600, depth: 450 } },
  bathtub: { requiresWall: true, clearanceMm: 550, footprint: { along: 1700, depth: 700 }, zones: ["wet"] },
  tub: { requiresWall: true, clearanceMm: 550, footprint: { along: 1700, depth: 700 }, zones: ["wet"] },
  bath: { requiresWall: true, clearanceMm: 550, footprint: { along: 1700, depth: 700 }, zones: ["wet"] },
  // The tray symbol is drawn symmetrically (outline + both diagonals + a centre
  // drain), so it has no back to face at a wall — see FixtureSpec.symmetric.
  shower: { requiresWall: true, footprint: { along: 900, depth: 900 }, zones: ["wet"], symmetric: true },
  // Kitchen run — counters/appliances line a wall; leave standing/working room.
  kitchen_sink: { requiresWall: true, clearanceMm: 550, footprint: { along: 800, depth: 600 }, zones: ["kitchen"] },
  // A bare `sink` satisfies either room kind (a bathroom basin or the kitchen sink).
  sink: { requiresWall: true, clearanceMm: 550, footprint: { along: 800, depth: 600 }, zones: ["wet", "kitchen"] },
  counter: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 600 }, zones: ["kitchen"] },
  worktop: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 600 }, zones: ["kitchen"] },
  stove: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 600 }, zones: ["kitchen"] },
  hob: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 600 }, zones: ["kitchen"] },
  cooktop: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 600 }, zones: ["kitchen"] },
  fridge: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 650 }, zones: ["kitchen"] },
  refrigerator: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 650 }, zones: ["kitchen"] },
  // Zone-only entry: counts as a kitchen fixture but is free-standing (no wall,
  // clearance or footprint semantics — identical to having no catalog entry for
  // the other rules).
  oven: { requiresWall: false, zones: ["kitchen"] },

  // -------------------------------------------------------------------------
  // The room-furniture vocabulary. Everything below is a word plans in this repo (and
  // models writing for it) already use — `bed`, `wardrobe`, `sofa`, `desk`, `washer` — and
  // that until now fell through to "unknown category": no footprint, no wall requirement,
  // no orientation. Catalogued, each one gains the semantics its name implies, which for
  // most of them means exactly one thing: a `footprint`, so `against wall` can omit `size`.
  //
  // ## `requiresWall` means SERVICES, and this vocabulary is where that starts to matter
  //
  // Every category that carried this flag before was a plumbing or kitchen fixture, so the
  // flag's two jobs never had to be told apart: it drives `W_FIXTURE_FLOATING` ("this needs
  // a wall behind it") AND, through `orientationMatters`, the derived quarter-turn and
  // `W_FIXTURE_BACK_TO_ROOM`. Room furniture separates them, and the separation is not a
  // judgement call — it is measurable. Flagging `bed`, `bookshelf` and `wardrobe` as
  // wall-requiring raised 23 new warnings across nine shipped plans, and the largest group
  // was `examples/library.arch`: **twelve** floating-stack warnings on a library whose
  // stacks are free-standing runs in the middle of the floor, which is what stacks ARE.
  // `W_FIXTURE_FLOATING`'s own remedy line reads "supply/waste/venting runs in the wall" — a
  // sentence that is simply false about a bookcase. So a piece of furniture that merely
  // *tends* to stand against a wall is NOT `requiresWall`; only a piece that cannot work
  // without one is (the plumbed and vented white goods below, and the wall cabinet, which
  // hangs off the wall by definition).
  //
  // The consequence to know: a bed anchored to a room edge does NOT yet get a derived
  // quarter-turn, because `orientationMatters` needs `requiresWall`. That is the right
  // answer while the symbol is a stub — a bed draws as a plain labelled rectangle, which has
  // no back to face, so a derived rotation would be invisible and
  // `W_FIXTURE_BACK_TO_ROOM`'s advice unverifiable from the drawing. The phase that draws
  // the bed is the phase that can honestly say which way it faces; it will add the "this
  // symbol has a back" fact then. `against wall` is unaffected — `placeAgainst` derives its
  // rotation from the wall directly, for every category.
  //
  // `symmetric` on a free-standing piece changes nothing today (`orientationMatters` needs
  // `requiresWall` first); it records the fact for the symbol that will be drawn — a round
  // stool and a square coffee table have no back to find.

  // Bedroom. Footprints are the conventional single/double mattress, laid head-to-wall:
  // `along` runs with the wall (the bed's width), `depth` into the room (its length).
  bed: { requiresWall: false, footprint: { along: 1500, depth: 2000 } },
  double_bed: { requiresWall: false, footprint: { along: 1800, depth: 2000 } },
  nightstand: { requiresWall: false, footprint: { along: 450, depth: 400 } },
  bedside_table: { requiresWall: false, footprint: { along: 450, depth: 400 } },
  // NO `clearanceMm`, deliberately, and it was measured rather than assumed. A 550 mm
  // frontal clearance here warned on `examples/garden-loft.arch`, whose 3200 mm bedroom
  // puts a 600 mm robe on one wall and a 2000 mm bed on the other — and that plan cannot be
  // fixed, because 600 + 550 + 2000 exceeds the 3100 mm of clear depth the room has. This
  // field's own calibration rule is "tight enough that a normal layout never trips it"; a
  // small bedroom IS the normal layout, and a wardrobe is commonly approached from the side
  // or hung with sliding doors. The plumbed white goods below keep their 550, which no
  // shipped plan trips.
  wardrobe: { requiresWall: false, footprint: { along: 1800, depth: 600 } },
  robe: { requiresWall: false, footprint: { along: 1800, depth: 600 } },
  closet: { requiresWall: false, footprint: { along: 1800, depth: 600 } },

  // Living. Free-standing: seating is arranged, not installed.
  sofa: { requiresWall: false },
  couch: { requiresWall: false },
  armchair: { requiresWall: false },
  coffee_table: { requiresWall: false, symmetric: true },
  // Installed against a wall in practice, but it carries no services — so it is furniture
  // by the rule above, and a media wall floated as a room divider raises nothing. No
  // frontal clearance either: nobody stands in front of a TV unit to use it, and a coffee
  // table half a metre away is the arrangement, not a defect.
  tv_unit: { requiresWall: false, footprint: { along: 1500, depth: 450 } },

  // Dining & seating.
  table: { requiresWall: false, symmetric: true },
  dining_table: { requiresWall: false, symmetric: true },
  chair: { requiresWall: false },
  stool: { requiresWall: false, symmetric: true },
  barstool: { requiresWall: false, symmetric: true },
  bench: { requiresWall: false },

  // Office.
  desk: { requiresWall: false },
  office_chair: { requiresWall: false },
  // NOT wall-requiring: a library's stacks are free-standing runs mid-floor
  // (`examples/library.arch` has twelve of them), which is what stacks are.
  bookshelf: { requiresWall: false, footprint: { along: 900, depth: 300 } },
  bookcase: { requiresWall: false, footprint: { along: 900, depth: 300 } },
  shelf: { requiresWall: false, footprint: { along: 900, depth: 300 } },

  // Kitchen appliances & utility — the plumbed and vented pieces, and the only ones in this
  // block that are `requiresWall`. They share the 600 mm module the counter run above
  // already uses, and the same 550 mm standing room in front.
  dishwasher: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 600 }, zones: ["kitchen"] },
  // An island is free-standing BY DEFINITION — that is what makes it an island — and it is
  // approached from every side, so it has no back and no single frontal clearance.
  island: { requiresWall: false, symmetric: true, zones: ["kitchen"] },
  // Hangs OFF the wall, so it is the one non-plumbed piece here that genuinely cannot exist
  // without one. Above the cut plane, so it is shallower than a base unit and needs no
  // floor clearance.
  upper_cabinet: { requiresWall: true, footprint: { along: 600, depth: 350 } },
  wall_cabinet: { requiresWall: true, footprint: { along: 600, depth: 350 } },
  washer: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 600 } },
  washing_machine: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 600 } },
  dryer: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 600 } },

  // Misc.
  plant: { requiresWall: false, symmetric: true },
  planter: { requiresWall: false, symmetric: true },
  car: { requiresWall: false },
});

/** All catalogued categories (aliases included), in declaration order. */
export const CATALOG_CATEGORIES: readonly string[] = Object.freeze(Object.keys(CATALOG));

/** The categories that satisfy `zone` for W_ROOM_NO_FIXTURE — derived from the
 *  catalog so the lint rule and this data can never drift apart. */
export function zoneFixtureCategories(zone: FixtureZone): ReadonlySet<string> {
  return new Set(CATALOG_CATEGORIES.filter((c) => CATALOG[c]!.zones?.includes(zone)));
}

/** The catalog spec for a fixture category, or `null` for free-standing furniture. */
export function fixtureSpec(category: string): FixtureSpec | null {
  return CATALOG[category] ?? null;
}

/** Does this fixture category conventionally need a wall behind it? */
export function requiresWall(category: string): boolean {
  return CATALOG[category]?.requiresWall ?? false;
}

/**
 * Does which way this fixture faces mean anything? True for a wall-requiring
 * fixture whose symbol has a distinguishable back (a WC's cistern, a basin's tap,
 * a counter's nosing) — the categories whose orientation can be derived, flagged
 * (`W_FIXTURE_BACK_TO_ROOM`) and corrected. False for free-standing furniture and
 * for a rotation-symmetric symbol (see {@link FixtureSpec.symmetric}).
 */
export function orientationMatters(category: string): boolean {
  const spec = CATALOG[category];
  return spec?.requiresWall === true && spec.symmetric !== true;
}

/** The frontal activity clearance (mm) for a fixture category, or 0 if none. */
export function frontClearanceMm(category: string): number {
  return CATALOG[category]?.clearanceMm ?? 0;
}

/** A fixture category's conventional wall-relative footprint (along × depth), or null. */
export function defaultFootprint(category: string): { along: number; depth: number } | null {
  return CATALOG[category]?.footprint ?? null;
}
