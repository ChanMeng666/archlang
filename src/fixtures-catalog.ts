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
  /**
   * The drawn symbol has a **back worth turning toward a wall**, even though the piece needs
   * no services.
   *
   * {@link requiresWall} answers "can this work without a wall?" — plumbing, venting, or
   * hanging off one. This answers a different question: "does the drawing say which way it
   * faces?" A bed's headboard, a wardrobe's door line and a bookshelf's open front are
   * unmistakable in plan and belong against something, but none of them needs a pipe. Before
   * the symbols were drawn the two questions had the same answer for every catalogued
   * category, so one flag served both; a bed that draws as a labelled rectangle has no back to
   * find, and deriving a rotation for it would have been an invisible, unverifiable claim.
   *
   * Set only where the SYMBOL earns it. A sofa is deliberately absent: seating is arranged
   * rather than installed, and its back to the room is a legitimate room-divider layout, not a
   * defect to warn about. So is anything {@link symmetric} — a round stool has no back at any
   * angle.
   */
  directional?: boolean;
  /**
   * The piece lies flat on the floor and is **walked on rather than walked round** — a rug, a
   * carpet. Other furniture stands ON it, which is the whole reason it is there.
   *
   * Three consumers read this flag, and every one of them DECLINES an existing check rather
   * than adding a new one:
   *
   *   - `W_FURNITURE_OVERLAP` skips an underlay⇄non-underlay pair. A sofa on a rug is the
   *     arrangement, not a collision. Two rugs overlapping each other still warn — that pair
   *     is not the exempt case, and one rug half over another is a drawing mistake.
   *   - `W_FURN_CLEARANCE` never counts an underlay as the thing blocking a fixture's frontal
   *     use-space; you can stand on it.
   *   - Both walkability grids (`analyze/circulation.ts`'s nav grid and
   *     `analyze/occupancy.ts`'s per-room flood fill) drop it from their obstacle list, so a
   *     rug across the only route into a room does not seal that room off.
   *
   * `W_FURNITURE_WALL_COLLISION` deliberately still applies: a rug drawn through a wall solid
   * is a drawing error whatever you can walk on. And the glyph draws it with **no fill at
   * all**, so paint order cannot matter — a rug listed after the sofa that stands on it still
   * cannot hide it.
   *
   * Not the same question as {@link symmetric}, though a rug is both: that one asks whether a
   * quarter-turn changes the drawing, this one asks whether the piece is an obstacle. A
   * runner with a border pattern would carry this flag and not that one.
   */
  underlay?: boolean;
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
  // That separation left one thing unfinished, and this is the phase that finishes it. While
  // room furniture drew as a plain labelled rectangle, an anchored bed got no derived
  // quarter-turn — correctly, because a rectangle has no back to face, so a derived rotation
  // would have been invisible and `W_FIXTURE_BACK_TO_ROOM`'s advice unverifiable from the
  // drawing. The symbols are drawn now: a bed has a headboard, a wardrobe a door line, a
  // bookshelf an open front. So `directional` carries the "this symbol has a back" fact the
  // comment above promised, and `orientationMatters` reads `(requiresWall || directional)`.
  // `requiresWall` keeps its single meaning — services — and `W_FIXTURE_FLOATING`, whose
  // remedy line is about supply and waste runs, stays keyed on it alone.
  //
  // `against wall` was never affected either way: `placeAgainst` derives its rotation from the
  // wall directly, for every category.
  //
  // `symmetric` still wins over both flags — a round stool and a square coffee table have no
  // back to find at any angle.

  // Bedroom. Footprints are the conventional single/double mattress, laid head-to-wall:
  // `along` runs with the wall (the bed's width), `depth` into the room (its length).
  bed: { requiresWall: false, directional: true, footprint: { along: 1500, depth: 2000 } },
  double_bed: { requiresWall: false, directional: true, footprint: { along: 1800, depth: 2000 } },
  nightstand: { requiresWall: false, directional: true, footprint: { along: 450, depth: 400 } },
  bedside_table: { requiresWall: false, directional: true, footprint: { along: 450, depth: 400 } },
  // NO `clearanceMm`, deliberately, and it was measured rather than assumed. A 550 mm
  // frontal clearance here warned on `examples/garden-loft.arch`, whose 3200 mm bedroom
  // puts a 600 mm robe on one wall and a 2000 mm bed on the other — and that plan cannot be
  // fixed, because 600 + 550 + 2000 exceeds the 3100 mm of clear depth the room has. This
  // field's own calibration rule is "tight enough that a normal layout never trips it"; a
  // small bedroom IS the normal layout, and a wardrobe is commonly approached from the side
  // or hung with sliding doors. The plumbed white goods below keep their 550, which no
  // shipped plan trips.
  wardrobe: { requiresWall: false, directional: true, footprint: { along: 1800, depth: 600 } },
  robe: { requiresWall: false, directional: true, footprint: { along: 1800, depth: 600 } },
  closet: { requiresWall: false, directional: true, footprint: { along: 1800, depth: 600 } },

  // Living. Free-standing: seating is arranged, not installed.
  sofa: { requiresWall: false },
  couch: { requiresWall: false },
  armchair: { requiresWall: false },
  coffee_table: { requiresWall: false, symmetric: true },
  // Installed against a wall in practice, but it carries no services — so it is furniture
  // by the rule above, and a media wall floated as a room divider raises nothing. No
  // frontal clearance either: nobody stands in front of a TV unit to use it, and a coffee
  // table half a metre away is the arrangement, not a defect.
  tv_unit: { requiresWall: false, directional: true, footprint: { along: 1500, depth: 450 } },

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
  bookshelf: { requiresWall: false, directional: true, footprint: { along: 900, depth: 300 } },
  bookcase: { requiresWall: false, directional: true, footprint: { along: 900, depth: 300 } },
  shelf: { requiresWall: false, directional: true, footprint: { along: 900, depth: 300 } },

  // Kitchen appliances & utility — the plumbed and vented pieces, and the only ones in this
  // block that are `requiresWall`. They share the 600 mm module the counter run above
  // already uses, and the same 550 mm standing room in front.
  dishwasher: { requiresWall: true, clearanceMm: 550, footprint: { along: 600, depth: 600 }, zones: ["kitchen"] },
  // An island is free-standing BY DEFINITION — that is what makes it an island — so it needs
  // no wall and carries no single frontal clearance.
  //
  // It is NO LONGER `symmetric`, and that is a data correction rather than a behaviour
  // change. The flag's own doc says the DRAWN SYMBOL is rotation-symmetric; the symbol used
  // to be a slab nosed on all four sides, and since v1.32 it has a seating overhang along one
  // side, cabinet ticks under that side, and a hob or a bowl at one end (`glyphs-kitchen.ts`
  // `drawIsland`). None of that maps onto itself under a quarter-turn, so the claim was about
  // to become false. Nothing observable moves with it: `orientationMatters` is
  // `(requiresWall || directional) && !symmetric`, and an island is neither — so it still
  // derives no rotation and still never trips `W_FIXTURE_BACK_TO_ROOM`, which
  // `test/fixture-orientation.test.ts` pins directly.
  island: { requiresWall: false, zones: ["kitchen"] },
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

  // -------------------------------------------------------------------------
  // The second furniture tranche. Four kinds a furnished plan reaches for that the first
  // one had no word for, and one new piece of catalog semantics — {@link
  // FixtureSpec.underlay} — that the rug is the whole reason for.
  //
  // Three of the four deliberately carry NO footprint, and each refusal is its own
  // argument rather than an oversight:
  //
  //   - `rug` has no conventional size at all. Rugs are sold from 600 x 900 runners to
  //     4 x 3 m room-size, chosen against the furniture group they sit under, so any
  //     number here would be invented. It is also the one kind you would never write
  //     `against wall` about.
  //   - `piano` is the interesting one: a grand piano DOES have conventional sizes (a
  //     baby grand is about 1500 x 1500), and giving it a footprint would make
  //     `furniture piano against wall <id>` legal. That form derives the rotation from
  //     the wall under the back-on-top convention, which would face the KEYBOARD into
  //     the wall — the one orientation a piano is never in. So the footprint is withheld
  //     to keep the form unreachable, and a piano is placed with `at (x,y)` + `rotate`,
  //     which is how it is placed on a real drawing too.
  //   - `sun_lounger` is placed by where the sun is, not by a wall; its length varies
  //     with the model and it is as often at an angle as square to anything.
  //
  // `sofa_l` DOES carry one, at the common three-seat-plus-chaise size, and it is
  // measured as the whole L's bounding rectangle — see `glyphs-living.ts`'s
  // `drawSofaL` for why the empty quadrant is still inside the footprint every lint
  // rule measures.
  rug: { requiresWall: false, symmetric: true, underlay: true },
  carpet: { requiresWall: false, symmetric: true, underlay: true },
  // NOT `directional`, for the same reason `sofa` is not: seating is arranged rather than
  // installed, and an L-sofa floated as a room divider is a normal plan. Its footprint is
  // the bounding rectangle of the L, chairs-included in the same spirit as `dining_table`.
  sofa_l: { requiresWall: false, footprint: { along: 2600, depth: 1600 } },
  corner_sofa: { requiresWall: false, footprint: { along: 2600, depth: 1600 } },
  piano: { requiresWall: false },
  grand_piano: { requiresWall: false },
  sun_lounger: { requiresWall: false },
  lounger: { requiresWall: false },

  // -------------------------------------------------------------------------
  // The OUTDOOR tranche. Twenty-one families for what a site plan draws once the drawing
  // leaves the building: planting, garden furniture, the things parked on a driveway, and
  // the small standing objects a survey records.
  //
  // ## Not one of them is `requiresWall`, and that is a decision, not an omission
  //
  // The flag means SERVICES — supply, waste, venting, or hanging off a wall by definition —
  // and `W_FIXTURE_FLOATING`'s own remedy line says so in as many words: "supply/waste/
  // venting runs in the wall". Two categories here would tempt a reader to set it and both
  // are wrong. A `hot_tub` is genuinely plumbed, and is still set DOWN on a deck and fed
  // from below, so a tub in the middle of a terrace is the normal arrangement and flagging
  // it would be a false positive on every garden that has one. An `ev_charger` is genuinely
  // wired, and is as often on a free-standing bollard as on a wall. Outdoors the wall is
  // the exception; the rule that assumes one does not belong out here.
  //
  // ## What each flag is doing instead
  //
  // `directional` is set for the five whose SYMBOL has a back worth turning to something —
  // a shed's door and dashed ridge, a barbecue's shelf, a bin's lid and wheels, a mailbox's
  // flap, a charger's pedestal. `outdoor_chair` deliberately does NOT carry it, for the same
  // reason `sofa` and `chair` do not: seating is arranged, not installed.
  //
  // `symmetric` is set for the ten whose drawing genuinely maps onto itself under a
  // quarter-turn, and each of those is proved by construction rather than asserted — the
  // planting stars have a multiple of four lobes, the trampoline twelve springs, the sandpit
  // a fixed quincunx (see `elements/glyphs-outdoor.ts`).
  //
  // A `footprint` is given only where `furniture <kind> against wall <id>` is a form someone
  // would actually write: the six pieces that stand against a house wall or a fence. A tree
  // has no conventional canopy size, a trampoline comes in four, and inventing either would
  // put a number in the language that nothing measured.
  //
  // `clearanceMm` is set for the barbecue ALONE, at 900 mm — the standing room a cook needs
  // in front of an open grill, and the one frontal use-space out here that a plan can be
  // wrong about. It is deliberately NOT given to the hot tub, which is `symmetric`: a
  // symmetric piece has no front, so a "frontal clearance" for it would be measured off an
  // arbitrary edge and would be a number the drawing cannot justify.
  //
  // None is `underlay`: a rug is walked ON, and none of these is.

  // Planting — drawn unfilled, because a canopy overhangs ground that has to read through.
  tree: { requiresWall: false, symmetric: true },
  deciduous_tree: { requiresWall: false, symmetric: true },
  conifer: { requiresWall: false, symmetric: true },
  pine: { requiresWall: false, symmetric: true },
  shrub: { requiresWall: false, symmetric: true },
  bush: { requiresWall: false, symmetric: true },
  // A run rather than a specimen, so it is the one plant with a footprint: 2 m of hedge
  // 600 mm deep is the length a `for` loop or an `against wall` clause repeats.
  hedge: { requiresWall: false, footprint: { along: 2000, depth: 600 } },

  // Garden furniture.
  bbq: { requiresWall: false, directional: true, clearanceMm: 900, footprint: { along: 1200, depth: 600 } },
  grill: { requiresWall: false, directional: true, clearanceMm: 900, footprint: { along: 1200, depth: 600 } },
  barbecue: { requiresWall: false, directional: true, clearanceMm: 900, footprint: { along: 1200, depth: 600 } },
  // Approached from every side, like the `island` and the `dining_table` it is the outdoor
  // cousin of — so no back, no frontal clearance, and the chairs are drawn inside its own
  // footprint rather than being four more pieces to place.
  outdoor_table: { requiresWall: false, symmetric: true },
  patio_table: { requiresWall: false, symmetric: true },
  outdoor_chair: { requiresWall: false },
  patio_chair: { requiresWall: false },
  umbrella: { requiresWall: false, symmetric: true },
  parasol: { requiresWall: false, symmetric: true },

  // Parked things. No footprint: a bicycle's is the rack it is in, a motorcycle's varies by
  // a factor of two, and neither is ever written `against wall`.
  bicycle: { requiresWall: false },
  bike: { requiresWall: false },
  motorcycle: { requiresWall: false },

  // Terrace & lawn.
  hot_tub: { requiresWall: false, symmetric: true },
  spa: { requiresWall: false, symmetric: true },
  swing: { requiresWall: false },
  swing_set: { requiresWall: false },
  trampoline: { requiresWall: false, symmetric: true },

  // The small standing objects. The five that go against a house wall or a fence carry
  // both `directional` and a footprint; the three that stand in the open carry neither.
  // (Order follows `FIXTURE_FAMILIES` in `elements/fixtures-glyphs.ts`, which is the
  // legend's order — keeping the two lists in step is a courtesy to whoever reads both.)
  bin: { requiresWall: false, directional: true, footprint: { along: 600, depth: 700 } },
  wheelie_bin: { requiresWall: false, directional: true, footprint: { along: 600, depth: 700 } },
  mailbox: { requiresWall: false, directional: true, footprint: { along: 400, depth: 300 } },
  letterbox: { requiresWall: false, directional: true, footprint: { along: 400, depth: 300 } },
  ev_charger: { requiresWall: false, directional: true, footprint: { along: 400, depth: 300 } },
  pergola: { requiresWall: false, symmetric: true },
  sandpit: { requiresWall: false, symmetric: true },
  sandbox: { requiresWall: false, symmetric: true },
  fire_pit: { requiresWall: false, symmetric: true },
  shed: { requiresWall: false, directional: true, footprint: { along: 2400, depth: 1800 } },
  garden_shed: { requiresWall: false, directional: true, footprint: { along: 2400, depth: 1800 } },
  clothesline: { requiresWall: false },
  washing_line: { requiresWall: false },

  // -------------------------------------------------------------------------
  // ── v1.32 F1: kitchen & bath ──
  //
  // Eight families that finish the two WET domains. Where the outdoor tranche above had to
  // argue its way OUT of `requiresWall` — outdoors the wall is the exception — this one is
  // the flag's home ground, and six of the eight carry it. Each for the reason the flag
  // actually means, which is "cannot work without a wall", not "usually stands near one":
  //
  //   - `bidet`, `urinal` and `laundry_sink` are plumbed. Supply in, waste out, both in the
  //     wall behind them; `W_FIXTURE_FLOATING`'s remedy line ("supply/waste/venting runs in
  //     the wall") is literally true of all three.
  //   - `water_heater` is the service the other three are fed from. It is the one piece here
  //     whose OUTLINE would map onto itself under a quarter-turn — it is a cylinder — and it
  //     is deliberately not `symmetric`, because its two pipe ticks run to the back edge and
  //     a turned vessel would put them into the room. The drawing has a back even though the
  //     vessel does not.
  //   - `mirror` and `range_hood` are the `upper_cabinet` case, not the plumbing one: they
  //     hang off the fabric by definition. A mirror standing free in a room is a
  //     `wardrobe`-shaped object, and an extract hood that is not over a hob venting through
  //     something is not an extract hood.
  //
  // The two that are NOT wall-requiring are `directional` instead, which is the distinction
  // the room-furniture tranche above drew and this one keeps: a microwave and a bar counter
  // both have an unmistakable front, and neither needs a pipe. A `bar_counter` floated in the
  // middle of an open-plan room is the normal arrangement, which is exactly why flagging it
  // would be a false positive.
  //
  // `clearanceMm` goes to the three fixtures a person STANDS AT to use — 450 for the two
  // sanitary pieces (matching `wc` and `basin`, which they sit beside), 600 for the laundry
  // sink, which is deeper than a basin and is worked at with both hands and a basket. The
  // wall-hung pair get none: nobody is blocked from using a mirror by a chair, and a hood is
  // used from under it. `microwave` and `bar_counter` get none either, for the reason
  // `tv_unit` gets none — the piece in front of a bar is a stool, and that is the layout.
  //
  // Zones follow what a room NEEDS to be that room: the three sanitary/laundry pieces are
  // `wet`, the three kitchen pieces are `kitchen`. `water_heater` and `mirror` carry no zone
  // on purpose — a cupboard with a boiler in it is not a bathroom, and a mirror over a
  // console table is not one either. Adding either would silently green a
  // `W_ROOM_NO_FIXTURE` a plan deserves.
  bidet: { requiresWall: true, clearanceMm: 450, footprint: { along: 400, depth: 700 }, zones: ["wet"] },
  urinal: { requiresWall: true, clearanceMm: 450, footprint: { along: 400, depth: 350 }, zones: ["wet"] },
  laundry_sink: { requiresWall: true, clearanceMm: 600, footprint: { along: 600, depth: 500 }, zones: ["wet"] },
  laundry_tub: { requiresWall: true, clearanceMm: 600, footprint: { along: 600, depth: 500 }, zones: ["wet"] },
  water_heater: { requiresWall: true, footprint: { along: 600, depth: 600 } },
  boiler: { requiresWall: true, footprint: { along: 600, depth: 600 } },
  mirror: { requiresWall: true, footprint: { along: 900, depth: 50 } },
  range_hood: { requiresWall: true, footprint: { along: 900, depth: 500 }, zones: ["kitchen"] },
  microwave: { requiresWall: false, directional: true, footprint: { along: 500, depth: 400 }, zones: ["kitchen"] },
  bar_counter: { requiresWall: false, directional: true, footprint: { along: 1800, depth: 600 }, zones: ["kitchen"] },
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
 * Does which way this fixture faces mean anything? True for any symbol with a distinguishable
 * back — either because the piece needs a wall for services ({@link FixtureSpec.requiresWall}:
 * a WC's cistern, a basin's tap, a counter's nosing) or because the drawn symbol simply has a
 * front and a back worth aiming ({@link FixtureSpec.directional}: a bed's headboard, a
 * wardrobe's door line). These are the categories whose orientation can be derived, flagged
 * (`W_FIXTURE_BACK_TO_ROOM`) and corrected.
 *
 * False for a rotation-symmetric symbol whichever flag it carries (see
 * {@link FixtureSpec.symmetric}), and for arranged furniture that has neither — a sofa's back
 * to the room is a layout, not an error.
 */
export function orientationMatters(category: string): boolean {
  const spec = CATALOG[category];
  if (!spec || spec.symmetric === true) return false;
  return spec.requiresWall === true || spec.directional === true;
}

/** The frontal activity clearance (mm) for a fixture category, or 0 if none. */
export function frontClearanceMm(category: string): number {
  return CATALOG[category]?.clearanceMm ?? 0;
}

/**
 * Is this category an **underlay** — a piece lying flat on the floor that other furniture
 * stands on and people walk over (see {@link FixtureSpec.underlay})?
 *
 * The one predicate all four consumers share, so the overlap rule, the clearance rule and
 * the two walkability grids can never disagree about what a rug is.
 */
export function isUnderlay(category: string): boolean {
  return CATALOG[category]?.underlay === true;
}

/**
 * The pieces a walkability grid must treat as obstacles — everything that is not an
 * {@link isUnderlay}.
 *
 * Lives here, beside the flag, rather than in either grid: `analyze/circulation.ts`'s
 * whole-plan nav grid and `analyze/occupancy.ts`'s per-room flood fill both need it, and two
 * copies of "is a rug an obstacle?" is exactly the shape of drift this repository keeps
 * finding. Generic over the element type so this module keeps importing nothing.
 */
export function solidFurniture<T extends { category: string }>(furniture: readonly T[]): T[] {
  return furniture.filter((f) => !isUnderlay(f.category));
}

/** A fixture category's conventional wall-relative footprint (along × depth), or null. */
export function defaultFootprint(category: string): { along: number; depth: number } | null {
  return CATALOG[category]?.footprint ?? null;
}
