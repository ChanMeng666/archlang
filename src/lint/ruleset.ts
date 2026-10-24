/**
 * The lint ruleset: tunable thresholds, named advisory profiles, and the options
 * type. Split from `lint.ts` so individual rule modules (`./rules/*.ts`) can import
 * the types without a cycle through the `lint()` entry point; `lint.ts` re-exports
 * everything here, so the public surface is unchanged.
 */

import type { AnalyzeOptions } from "../analyze.js";
import type { UseKind } from "../ast.js";
import { DEFAULT_TOL } from "../analyze.js";
import { FIXTURE_WALL_TOL_MM } from "../fixture-orientation.js";
import { JUNCTION_NIB_DEFAULTS } from "../opening-junctions.js";

/** Tunable thresholds for the lint rules. All distances in mm, areas in m². */
export interface LintRuleset {
  /** Rooms smaller than this (m²) warn as implausibly small. Default 4. A room whose every
   *  use has its own entry in {@link minRoomAreaByUseM2} is held to that instead. */
  minRoomAreaM2: number;
  /** Doors narrower than this (mm) warn as sub-passable. Default 700 (≥800 recommended). */
  minDoorWidthMm: number;
  /** Edge-touch tolerance for "is this opening on that room?" (mm). Default 200. */
  tolMm: number;
  /**
   * A wet room (bath/WC) whose perimeter has an unwalled run longer than this (mm)
   * warns as not enclosed. Default 300 — long enough to ignore a normal door/window
   * opening (those are not gaps anyway), short enough to catch a missing partition.
   */
  maxUnenclosedMm: number;
  /** Extra clearance (mm) added when testing door-swing collisions. Default 0. */
  swingClearanceMm: number;
  /**
   * How close (mm) a wall-requiring fixture's edge must be to a wall centerline to
   * count as "against the wall". Default 300 — comfortably more than a wall's
   * half-thickness (a fixture backs onto the wall *face*) plus a small setback.
   * The default is {@link FIXTURE_WALL_TOL_MM}, the same constant resolve uses to
   * derive a room-anchored fixture's rotation, so the two can never drift.
   */
  fixtureWallTolMm: number;
  /**
   * Clear landing depth (mm) required on each side of a door opening — the straight
   * approach path through the doorway. Furniture inside this zone trips
   * `W_DOORWAY_BLOCKED`. Default 300; accessibility guidance wants more.
   */
  doorwayLandingMm: number;
  /**
   * Minimum clear floor area (m²) a room's doorways must be able to reach by walking
   * (grid flood-fill). Below this a reachable-but-packed room trips
   * `W_ROOM_NO_CLEAR_PATH`. Default 1.0 — about enough to stand and turn.
   */
  minClearAreaM2: number;
  /**
   * Minimum unavoidable clear width (mm) on the walk from the entrance into a room
   * (and along key room→room routes). Below this the circulation model trips
   * `W_PATH_TOO_NARROW`. Default 700 — a standard door's clear opening, matching
   * `minDoorWidthMm`; the accessibility profile raises it toward wheelchair passage.
   */
  minPathClearWidthMm: number;
  /**
   * How many times its straight-line distance a room's walk from the entrance may be
   * before it trips `W_CIRCUITOUS_PATH`. Default 3.0 — deliberately generous: a normal
   * tucked-away wet room routed off a hall runs ~2.5–2.7×, so a tighter ratio would
   * false-positive on sound plans; this catches only genuinely roundabout access.
   */
  maxDetourRatio: number;
  /**
   * End clearance (mm) a `pocket` door needs beyond its own width, for the jamb, the
   * pull and the panel's stop. `W_POCKET_RUN` requires
   * `width + max(pocketRunClearanceMm, width × 5%)`. Default 50.
   *
   * **A deliberate divergence from the source this rule is borrowed from.**
   * planscript-rust's `pocket_door_wall_run` requires a flat `width × 1.05`. A pure
   * ratio is wrong on narrow doors — a 700 mm pocket would ask for 35 mm of end
   * clearance, which does not fit a real jamb and pull — and we are not publishing a
   * comparison against that project, so matching its constant buys nothing.
   * Architectural correctness outranks reference-comparability, the same call that
   * put GB/T's `A-ANNO-DIMS` ahead of the reference's coarser `A-DIMS`. The ratio
   * limb is kept so a wide opening still scales.
   */
  pocketRunClearanceMm: number;
  /**
   * The shortest nib of wall a door's jamb may leave at a **corner**, as a multiple of
   * that wall's own thickness. `W_DOOR_NEAR_CORNER` requires
   * `thickness × minCornerNibRatio`. Default 1.0 — a nib at least as long along the run
   * as the wall is deep across it.
   *
   * **Why the wall's own thickness, and why one limb.** The thickness is the only length
   * in the drawing intrinsic to the wall being measured, so the threshold needs no new
   * absolute constant and scales by itself: a 100 mm partition asks for 100 mm, a 400 mm
   * shell for 400. It is also the dimension the defect is about — a piece of wall drawn
   * deeper than it is long stops reading as wall and reads as a chamfer on the corner,
   * and its returned face has nowhere to carry a door frame and architrave.
   * {@link pocketRunClearanceMm} needs a second, absolute limb because it compares a
   * wall run against the DOOR's width, which can be narrow enough to make a pure ratio
   * meaningless; here both sides of the comparison belong to the same wall, so a second
   * constant would be invented rather than evidenced.
   */
  minCornerNibRatio: number;
  /**
   * The shortest nib of wall an opening's jamb may leave to the FACE of a wall that meets
   * its host run (a tee, a crossing, or — for windows and cased openings — a corner).
   * `W_OPENING_AT_JUNCTION` requires `max(minJunctionNibMm, host thickness ×
   * junctionNibThicknessRatio)`. Default 100.
   *
   * **Source.** 100 mm is the low end of the trade practice (100-150 mm) for the return a
   * frame and architrave or a lining need beside a jamb, recorded with its source in
   * `docs/plans/plan-soundness/research/associativity.md` (the door-nib row, BuildHub
   * "architrave offset") and `research/prior-art.md` (T5: an opening's span stays clear of
   * wall junctions by at least a nib).
   */
  minJunctionNibMm: number;
  /**
   * The thickness limb of `W_OPENING_AT_JUNCTION`'s nib, as a multiple of the HOST wall's
   * thickness, measured to the meeting wall's FACE. Default 0.5.
   *
   * **Why half, at the face.** It is `W_DOOR_NEAR_CORNER`'s own threshold restated at the
   * datum this rule measures from. That rule asks for a nib of one wall thickness measured to
   * the corner's CENTRELINE point; the meeting wall's face stands half its thickness short of
   * that point, so for two walls of one thickness the same requirement read at the face is
   * half the thickness. The plan-soundness audit proposed the same `max(100, H.thickness/2)`
   * at the face (`docs/plans/plan-soundness/audits/showcase-and-examples.md`, proposed check
   * 1) and found no false positive on its corpus.
   *
   * **Measured against the plan's first reading, a full thickness (ratio 1.0).** The PS2.1
   * card states `max(100 mm, host thickness)`. Read at the face, that raised 38 more
   * warnings than 0.5 does, in 11 of the shipped examples, and every one was a nib of
   * 100-250 mm, mostly beside a window on a 200-300 mm wall. Those returns sit inside or above
   * the 100-150 mm trade range, so they are not defects, and 0.5 is the default. A profile that
   * wants the stricter reading sets 1.0.
   */
  junctionNibThicknessRatio: number;
  /**
   * The thinnest pier of wall that may separate two openings on one run — a mullion.
   * `W_OPENING_OVERLAP` fires when two openings' along-run spans intersect, or leave less
   * than this between them. Default 100: the mullion width the plan-soundness audit used
   * (`docs/plans/plan-soundness/audits/archcanvas-public-examples.md`, proposed check 1),
   * the same 100 mm as {@link minJunctionNibMm}'s first limb, since either side of the pier
   * has a frame to carry.
   */
  minMullionMm: number;
  /**
   * The least length of a SECOND room a straddling connector's face must cover, net of the
   * body of any wall meeting the host there, before `W_CONNECTOR_AMBIGUOUS` reads it as
   * opening into that room. The threshold is `max(minStraddleCoverMm, host thickness ×
   * junctionNibThicknessRatio)`. Default 100.
   *
   * **Why the junction nib.** A sliver of the other room beside a meeting wall is the same
   * length of wall `W_OPENING_AT_JUNCTION` measures as the jamb's nib: below the nib a jamb
   * needs, it is a jamb set against the meeting wall, not a way into the room beyond it, and
   * that warning already reports it. One defect gets one warning, so below this length only
   * the junction warning speaks. At or above it the doorway really does open onto two rooms,
   * and both warnings stand: one about the wall in the opening, one about which rooms it
   * serves. The meeting wall's body is taken out because the rooms are drawn to its
   * centreline, so half its thickness counts as floor that nobody can stand on.
   */
  minStraddleCoverMm: number;
  /**
   * How near (mm) a kitchen fixture must stand to a bath or WC door before `W_WET_ROOM_DOOR`
   * reads the door as opening onto the KITCHEN of a room that is also the living room.
   * Measured from the doorway's face on that room's side (jamb, centre, jamb) to the nearest
   * sink, hob, oven, fridge, worktop, island or dishwasher footprint on that room's floor, in
   * whole mm; the door warns when the fixture is nearer than this. Default 1500.
   *
   * **Why 1500.** It is the clear width GB 50096-2011 5.3.5 gives a kitchen with one row of
   * fixtures (at least 1.50 m, cited as advice; `docs/plans/plan-soundness/research/
   * design-taste.md` R23): the band a kitchen run needs in front of it. A door inside that band
   * opens into the kitchen itself; one beyond it opens into the living or dining end of the
   * room, which the taste layer grades and no rule warns.
   */
  wetDoorKitchenProximityMm: number;
  /**
   * The longest stretch of a run two rooms share that may have no wall, door, cased opening
   * or fixed counter on it before `W_BOUNDARY_NO_WALL` fires. Default 900: a doorway, the
   * width the plan-soundness card names (`docs/plans/plan-soundness/README.md`, PS2.4) and a
   * standard single leaf's nominal width. A gap no wider than a door is the missing door's
   * report (`W_ROOM_DISCONNECTED`, `W_ROOM_UNREACHABLE`), not a missing wall.
   */
  maxBoundaryGapMm: number;
  /**
   * The share of a walled face the rooms must cover before `W_FLOOR_UNASSIGNED` is quiet.
   * Default 0.95, the card's threshold (PS2.4): a plan whose rooms are drawn on the wall
   * centrelines covers its faces completely, so 5 % is room for rooms drawn to a wall's face
   * or a little short of it, never a strip a person could stand in.
   */
  minFaceCoverRatio: number;
  /**
   * The least floor (m²) a walled face must leave in no room for `W_FLOOR_UNASSIGNED` to
   * report it, whatever its share. Default 0.5: below it the walls enclose a riser, a duct or
   * the sliver a room drawn a little short of its wall leaves, not floor anyone forgot.
   */
  minUnassignedM2: number;
  /**
   * The least floor (m²) of a room outside every walled face and wall before
   * `W_ROOM_OUTSIDE_SHELL` reports it. Default 0.1: a 100 mm strip a metre long. A room drawn
   * on the wall centrelines, or to the outer face, has none outside at all.
   */
  minOutsideShellM2: number;
  /**
   * `W_ROOM_TOO_SMALL`'s floor (m²) for a room of a given use, read from {@link roomUses}
   * (its `uses`, else its label). `null` exempts the use: no floor at all. A use with no
   * entry, and a room with no classified use, keep {@link minRoomAreaM2}. A room with
   * several uses takes the highest floor among them, so `uses kitchen storage` is held to
   * the kitchen's 4 m² and `uses hall storage` to none.
   *
   * **Why per use.** One 4 m² floor for every room made the rule ask a WC and a cupboard to
   * be the size of a kitchen; repairing against it, an author inflated a café's staff WC to
   * 1.6 × 3.4 m and deleted a house's linen store (plan-soundness audit, first contact,
   * "repair pressure"). The defaults:
   *  - `wc` 1.1: GB 50096-2011 5.4.2 item 5, a room with a WC alone, at least 1.10 m².
   *  - `bath` 2.0: GB 50096-2011 5.4.2 items 2 and 3, the smallest combinations with a
   *    shower or bath (WC + shower, basin + shower), at least 2.00 m². A three-fixture
   *    bathroom wants 2.50 m² (5.4.1); the rule does not count fixtures, so it asks the lower.
   *  - `storage`, `utility`, `hall`, `circulation`, `entry` exempt: the standard sets no area
   *    for a store, a laundry or a lobby, and a cupboard is a room. A passage is judged by its
   *    width (`W_PATH_TOO_NARROW`), never its area.
   * Clauses as read in `docs/plans/plan-soundness/research/prior-art.md` §3.1 (full text
   * extracted), applied as advice, never as compliance (ADR 0005).
   *
   * Merged PER USE ({@link resolveRuleset}): a profile or a caller that sets `{ wc: 1.5 }` changes
   * the WC's floor and keeps every other default, exemptions included.
   */
  minRoomAreaByUseM2: Readonly<Partial<Record<UseKind, number | null>>>;
  /**
   * How {@link minRoomAreaM2} and {@link minRoomAreaByUseM2} combine. `"by-use"` (the default):
   * a use's own floor replaces the generic one. `"at-least-generic"`: every room is held to at
   * least the generic floor, and a use's own floor applies only where it is higher (an exempt use
   * counts as no floor of its own). {@link resolveRuleset} picks `"at-least-generic"` whenever a
   * profile or the caller sets `minRoomAreaM2` explicitly, so a stricter generic floor (the
   * `accessibility-advisory` profile's 5 m²) is not undone by the per-use table, which has no
   * researched accessible values yet. Writing the default itself, `ruleset: { minRoomAreaM2: 4 }`,
   * also picks `"at-least-generic"`, so every room is held to 4 m² again, as before the per-use
   * table.
   */
  roomAreaFloorMode: "by-use" | "at-least-generic";
  /**
   * Judge every plan as a dwelling (plan-soundness PS2.18). `false` (the default): the rules
   * that describe a defect of a home (`W_HABITABLE_NO_WINDOW`'s kitchen arm, every arm of
   * `W_WET_ROOM_DOOR` but its kitchen one, `W_ENTRANCE_INTO_PRIVATE`) run only when the plan
   * reads as a dwelling (`dwellingReading`, `src/analyze/dwelling.ts`), and on a plan that reads
   * as non-residential they file a `non-dwelling` coverage skip instead. `true`: they run on
   * every plan, as `residential-basic` asserts by its name.
   */
  assumeDwelling: boolean;
  /**
   * How near (mm, on both axes) a table or desk must be for a chair to count as sitting at it,
   * and how far the chair's front ray may run before it enters one (`W_SEAT_FACING_AWAY`,
   * plan-soundness PS2.11, ADR 0029 §6). Default 600. `null` turns the rule off.
   */
  seatTableReachMm: number | null;
  /**
   * `W_ROOM_TOO_SMALL`'s floor (m²) for a DOUBLE bedroom: a bedroom whose beds read as one
   * (`bedroomBeds`, `src/lint/rules/per-room.ts`: a `double_bed`, a `bed` wider than
   * {@link DOUBLE_BED_MIN_WIDTH_MM}, or two or more beds). It joins the per-use floors as one
   * more candidate, so the room still takes the highest. A bedroom with no bed is held to its
   * per-use floor ({@link minRoomAreaByUseM2}'s `bedroom`, the single figure, which every
   * bedroom must meet) and files a `no-bed` coverage skip: whether it is a double is not known.
   * Never read from the label (ADR 0005). Default `null`: off. Set by the residential-advisory
   * profiles (plan-soundness PS5.2).
   */
  minDoubleBedroomAreaM2: number | null;
  /**
   * `W_ROOM_TOO_NARROW`'s least CLEAR width (mm) of a room of a given use, read from
   * {@link roomUses}; a room with several uses takes the highest. The width is the room's short
   * side measured between the inner faces of the walls along it (`innerFaceOfRoomEdge`; the
   * drawn edge where no wall backs it), because a clause that sets a width (a bedroom's, a
   * passage's) means the clear one, and half of each wall is a large share of it. Rectangular
   * rooms only: a polygon or circle room files `non-rectangular-room` (a bounding box's short
   * side is not a concave floor's width). Merged PER USE ({@link resolveRuleset}). Default `{}`:
   * no room is asked a width.
   */
  minRoomShortSideByUseMm: Readonly<Partial<Record<UseKind, number>>>;
  /** `W_ROOM_TOO_NARROW`'s least clear width (mm) of a double bedroom (read as for
   *  {@link minDoubleBedroomAreaM2}); a bedroom with no bed files `no-bed`. Default `null`: off. */
  minDoubleBedroomShortSideMm: number | null;
  /**
   * The least clear width (mm) ONE double bedroom of a home must have, the others being held to
   * {@link minDoubleBedroomShortSideMm}. When no double bedroom on the storey reaches it, the
   * widest one (the first in source order on a tie) is held to it, so one room carries the
   * warning. On a multi-storey plan the rule cannot tell which bedrooms share a home and files
   * `no-dwelling` instead (declared dwellings are PS2.14). Default `null`: off.
   */
  minMainDoubleBedroomShortSideMm: number | null;
  /**
   * `W_ROOM_TOO_NARROW`'s least clear width (mm) of a PASSAGE (a room used as hall, circulation
   * or entry) by the use of the rooms it opens onto: a passage with a door or cased opening into
   * a room of use `u` is held to this table's `u` entry (the highest over its neighbours, and
   * over its own uses' {@link minRoomShortSideByUseMm}). Measured as that table measures: the
   * passage's clear short side. It is NOT the walk's bottleneck (`W_PATH_TOO_NARROW`), which runs
   * through doors, and a door is by design narrower than the passage that leads to it. Merged
   * PER USE. Default `{}`: off.
   */
  minPathClearWidthByUseMm: Readonly<Partial<Record<UseKind, number>>>;
  /**
   * `W_ROOM_TOO_NARROW`'s least clear width (mm) of an ENTRY passage: a passage (hall,
   * circulation or entry use) that a door from outside opens into, or one used as `entry`.
   * Default `null`: off.
   */
  minEntryPassageWidthMm: number | null;
}

/**
 * A bed wider than this (mm, its footprint's shorter side) sleeps two: a double. The lead's
 * ruling for plan-soundness PS5.2 (`docs/plans/plan-soundness/research/2026-10-24-ps5-taste-design.md`
 * §5): a single bed is 900–1000 mm wide and a small double from about 1200 mm, so 1200 separates
 * them. Read only by the double-bedroom thresholds, which no default sets.
 */
export const DOUBLE_BED_MIN_WIDTH_MM = 1200;

export const DEFAULT_RULESET: LintRuleset = {
  minRoomAreaM2: 4,
  minDoorWidthMm: 700,
  tolMm: DEFAULT_TOL,
  maxUnenclosedMm: 300,
  swingClearanceMm: 0,
  fixtureWallTolMm: FIXTURE_WALL_TOL_MM,
  doorwayLandingMm: 300,
  minClearAreaM2: 1.0,
  minPathClearWidthMm: 700,
  maxDetourRatio: 3.0,
  pocketRunClearanceMm: 50,
  minCornerNibRatio: 1.0,
  minJunctionNibMm: JUNCTION_NIB_DEFAULTS.minJunctionNibMm,
  junctionNibThicknessRatio: JUNCTION_NIB_DEFAULTS.junctionNibThicknessRatio,
  minMullionMm: 100,
  minStraddleCoverMm: 100,
  wetDoorKitchenProximityMm: 1500,
  maxBoundaryGapMm: 900,
  minFaceCoverRatio: 0.95,
  minUnassignedM2: 0.5,
  minOutsideShellM2: 0.1,
  minRoomAreaByUseM2: Object.freeze({
    wc: 1.1,
    bath: 2.0,
    storage: null,
    utility: null,
    hall: null,
    circulation: null,
    entry: null,
  }),
  roomAreaFloorMode: "by-use",
  assumeDwelling: false,
  seatTableReachMm: 600,
  minDoubleBedroomAreaM2: null,
  minRoomShortSideByUseMm: Object.freeze({}),
  minDoubleBedroomShortSideMm: null,
  minMainDoubleBedroomShortSideMm: null,
  minPathClearWidthByUseMm: Object.freeze({}),
  minEntryPassageWidthMm: null,
};

/**
 * Named, **advisory** lint profiles — partial ruleset overrides over
 * {@link DEFAULT_RULESET}. Deliberately NOT named after a standard (`ada`, `iso`):
 * a profile is an advisory soundness check, never a compliance guarantee, and
 * ArchLang does not model everything a code requires (clear opening width, approach
 * clearances, hardware). Every override is a documented, traceable threshold.
 */
export const LINT_PROFILES: Readonly<Record<string, Partial<LintRuleset>>> = Object.freeze({
  /**
   * The shipped residential baseline: {@link DEFAULT_RULESET}'s thresholds, with every plan
   * judged as a dwelling ({@link LintRuleset.assumeDwelling}), so a dwelling rule never declines
   * a plan whose labels read as a café or an office.
   */
  "residential-basic": { assumeDwelling: true },
  /**
   * Stricter passage + clearances inspired by accessibility guidance (e.g. the ADA's
   * ~815 mm clear door opening and generous turning/approach space). Advisory only.
   */
  "accessibility-advisory": {
    minDoorWidthMm: 850, // a nominal width giving roughly an 815 mm clear opening
    minRoomAreaM2: 5,
    swingClearanceMm: 150,
    doorwayLandingMm: 450, // a deeper clear approach in front of each door
    minPathClearWidthMm: 900, // a continuous clear width for wheelchair passage
  },
  /**
   * Room sizes and passage widths read from China's residential design code, as ADVICE (ADR
   * 0005: the name is not the standard's, and passing is not compliance). Source: GB 50096-2011
   * 住宅设计规范, full text read (`docs/plans/plan-soundness/research/prior-art.md` §3.1) [V].
   * Areas are measured as `W_ROOM_TOO_SMALL` measures every floor, on the room as drawn (to the
   * wall centrelines when drawn so), while the clauses give 使用面积 (net floor): the check is
   * lenient by the walls' half thickness and never warns a room that meets the figure. Widths
   * are clear, between wall faces (净宽). The design sets no `cn` number for R10 (WC clearances)
   * or R37 (escape window).
   */
  "cn-residential-advisory": {
    minRoomAreaByUseM2: {
      bedroom: 5, // GB 50096-2011 5.2.1: a single bedroom at least 5 m², which every bedroom meets [V]
      living: 10, // GB 50096-2011 5.2.2: a living room (起居室) at least 10 m² [V]
      kitchen: 4, // GB 50096-2011 5.3.1: a kitchen at least 4.0 m² (3.5 in the smallest dwelling type, not modelled) [V]
    },
    minDoubleBedroomAreaM2: 9, // GB 50096-2011 5.2.1: a double bedroom at least 9 m² [V]
    minEntryPassageWidthMm: 1200, // GB 50096-2011 5.7.1: the entry passage 宜 (should) be at least 1.20 m clear [V]
    minPathClearWidthByUseMm: {
      bedroom: 1000, // GB 50096-2011 5.7.1: a passage to a bedroom or living room at least 1.00 m clear [V]
      living: 1000, // GB 50096-2011 5.7.1 (起居室（厅）) [V]
      kitchen: 900, // GB 50096-2011 5.7.1: a passage to a kitchen, bathroom or store at least 0.90 m clear [V]
      bath: 900, // GB 50096-2011 5.7.1 (卫生间) [V]
      wc: 900, // GB 50096-2011 5.7.1 (卫生间: a WC is one) [V]
      storage: 900, // GB 50096-2011 5.7.1 (贮藏室) [V]
    },
  },
  /**
   * Room sizes and hall widths read from England's space standard and access guidance, as
   * ADVICE (ADR 0005). Bedrooms: the Nationally Described Space Standard (2015) 10(c)–(e), read
   * in full (`prior-art.md` §3.3) [V]. NDSS measures finished internal dimensions, so the areas,
   * measured as drawn, are lenient by the walls' half thickness; the widths are clear, between
   * wall faces. Halls: Approved Document M4(2), second-hand [S]. R37 (the ADB 2.10 escape
   * window) waits for PS2.16; its numbers are in {@link DEFERRED_PROFILE_NUMBERS}, unused.
   */
  "uk-residential-advisory": {
    minRoomAreaByUseM2: {
      bedroom: 7.5, // NDSS 10(c): a single bedroom at least 7.5 m², which every bedroom meets [V]
    },
    minDoubleBedroomAreaM2: 11.5, // NDSS 10(d): a double (or twin) bedroom at least 11.5 m² [V]
    minRoomShortSideByUseMm: {
      bedroom: 2150, // NDSS 10(c): a single bedroom at least 2.15 m wide, which every bedroom meets [V]
      hall: 900, // Approved Document M4(2): a hall at least 900 mm clear [S, prior-art.md §3.3]
      circulation: 900, // Approved Document M4(2), as `hall` [S]
      entry: 900, // Approved Document M4(2), as `hall`: an entrance hall is a hall [S]
    },
    minDoubleBedroomShortSideMm: 2550, // NDSS 10(e): every other double (or twin) bedroom at least 2.55 m wide [V]
    minMainDoubleBedroomShortSideMm: 2750, // NDSS 10(e): one double (or twin) bedroom at least 2.75 m wide [V]
  },
  /**
   * Room sizes and hallway widths read from the US model residential code, as ADVICE (ADR
   * 0005). Source: IRC (2021), second-hand: the primary text was not reachable and the figures
   * come from jurisdiction handouts (`prior-art.md` §3.2) [S]. "Habitable" is the IRC's own
   * definition (living, sleeping, eating or cooking), so `living`, `dining` and `bedroom`: the
   * kitchen is excepted from both R304 limits and keeps the default floor, and an `office` is
   * not in the definition and is not asked. R10 (WC clearances) waits for PS2.11's WC rule and
   * R37 (the escape opening) for PS2.16; their numbers are in {@link DEFERRED_PROFILE_NUMBERS}.
   */
  "us-residential-advisory": {
    minRoomAreaByUseM2: {
      living: 6.5, // IRC R304.1: a habitable room at least 70 ft² (6.5 m²), kitchens excepted [S]
      dining: 6.5, // IRC R304.1 [S]
      bedroom: 6.5, // IRC R304.1 [S]
    },
    minRoomShortSideByUseMm: {
      living: 2134, // IRC R304.2: a habitable room at least 7 ft (2134 mm) in any horizontal dimension [S]
      dining: 2134, // IRC R304.2 [S]
      bedroom: 2134, // IRC R304.2 [S]
      hall: 914, // IRC R311.6: a hallway at least 3 ft (914 mm) wide [S]
      circulation: 914, // IRC R311.6 [S]
      entry: 914, // IRC R311.6: an entry foyer is walked as a hallway [S]
    },
  },
});

/**
 * Sourced numbers for residential-advisory checks whose RULES do not exist yet, kept so their
 * sources are not lost (plan-soundness PS5.2, 2026-10-24). Nothing reads them: R10 lands with
 * PS2.11's WC-clearance rule and R37 with PS2.16's escape-window rule, each of which moves its
 * numbers into the profile as ruleset fields. Design:
 * `docs/plans/plan-soundness/research/2026-10-24-ps5-taste-design.md` §5.
 */
export const DEFERRED_PROFILE_NUMBERS = Object.freeze({
  /** R10, `us`: a WC's centreline at least 15 in (381 mm) from a side wall, and 21 in (533 mm)
   *  clear in front of it (IRC P2705.1, R307.1) [S, `prior-art.md` §3.3; clause numbers from the
   *  design's §5 table]. */
  usWc: Object.freeze({ centreToSideMm: 381, clearInFrontMm: 533 }),
  /** R37, `us`: an emergency escape and rescue opening at least 20 in (508 mm) clear wide, its
   *  sill at most 44 in (1118 mm) above the floor, and at least 5.7 ft² (0.53 m²) net clear, or
   *  5.0 ft² (0.46 m²) at grade (IRC R310) [S, `prior-art.md` §3.2]. A failure only, never a pass. */
  usEscape: Object.freeze({ minClearWidthMm: 508, maxSillMm: 1118, minNetClearM2: 0.53, minNetClearAtGradeM2: 0.46 }),
  /** R37, `uk`: an escape window at least 0.33 m² clear and 450 × 450 mm, its openable part at
   *  most 1100 mm above the floor (Approved Document B 2.10) [S, `prior-art.md` §3.3]. */
  ukEscape: Object.freeze({ minClearM2: 0.33, minClearSideMm: 450, maxOpenableHeightMm: 1100 }),
});

/**
 * The profiles of the ADVISORY-CODE layer (plan-soundness README §4, PS5.2): opt-in readings of a
 * jurisdiction's room sizes. `finish`'s never-worse law is not held under them (`furnish` and
 * `finish` measure the default ruleset and the other profiles only): placing a bed is what makes
 * a bedroom a double for them, so a law held under them would refuse to furnish every bedroom
 * under a jurisdiction's double-bedroom figure, which is advisory code turned into gating by the
 * back door (design §6 Q2, the reason taste does not cap on them either).
 */
export const ADVISORY_CODE_PROFILES: readonly string[] = Object.freeze([
  "cn-residential-advisory",
  "uk-residential-advisory",
  "us-residential-advisory",
]);

/** The names of the built-in {@link LINT_PROFILES}, for CLI validation. */
export const LINT_PROFILE_NAMES: readonly string[] = Object.keys(LINT_PROFILES);

const hasOwn = (o: object | undefined, k: string): boolean => o !== undefined && Object.hasOwn(o, k);

/**
 * The ruleset cascade `lint()` runs: defaults, then the named profile's overrides, then the
 * caller's. Flat keys are replaced; `minRoomAreaByUseM2`, `minRoomShortSideByUseMm` and
 * `minPathClearWidthByUseMm` are merged per use (later layers win
 * per key, the other keys keep their defaults). `roomAreaFloorMode` is `"at-least-generic"`
 * when a profile or the caller sets `minRoomAreaM2` without setting the mode.
 */
export function resolveRuleset(profile: Partial<LintRuleset> = {}, ruleset: Partial<LintRuleset> = {}): LintRuleset {
  const mode =
    ruleset.roomAreaFloorMode ??
    profile.roomAreaFloorMode ??
    (hasOwn(profile, "minRoomAreaM2") || hasOwn(ruleset, "minRoomAreaM2") ? "at-least-generic" : "by-use");
  return {
    ...DEFAULT_RULESET,
    ...profile,
    ...ruleset,
    minRoomAreaByUseM2: {
      ...DEFAULT_RULESET.minRoomAreaByUseM2,
      ...profile.minRoomAreaByUseM2,
      ...ruleset.minRoomAreaByUseM2,
    },
    minRoomShortSideByUseMm: {
      ...DEFAULT_RULESET.minRoomShortSideByUseMm,
      ...profile.minRoomShortSideByUseMm,
      ...ruleset.minRoomShortSideByUseMm,
    },
    minPathClearWidthByUseMm: {
      ...DEFAULT_RULESET.minPathClearWidthByUseMm,
      ...profile.minPathClearWidthByUseMm,
      ...ruleset.minPathClearWidthByUseMm,
    },
    roomAreaFloorMode: mode,
  };
}

export interface LintOptions extends AnalyzeOptions {
  /** A named profile from {@link LINT_PROFILES} (applied before `ruleset`). */
  profile?: string;
  /** Override any subset of {@link DEFAULT_RULESET} (wins over `profile`). */
  ruleset?: Partial<LintRuleset>;
}
