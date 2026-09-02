/**
 * The lint ruleset: tunable thresholds, named advisory profiles, and the options
 * type. Split from `lint.ts` so individual rule modules (`./rules/*.ts`) can import
 * the types without a cycle through the `lint()` entry point; `lint.ts` re-exports
 * everything here, so the public surface is unchanged.
 */

import type { AnalyzeOptions } from "../analyze.js";
import { DEFAULT_TOL } from "../analyze.js";
import { FIXTURE_WALL_TOL_MM } from "../fixture-orientation.js";

/** Tunable thresholds for the lint rules. All distances in mm, areas in m². */
export interface LintRuleset {
  /** Rooms smaller than this (m²) warn as implausibly small. Default 4. */
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
}

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
};

/**
 * Named, **advisory** lint profiles — partial ruleset overrides over
 * {@link DEFAULT_RULESET}. Deliberately NOT named after a standard (`ada`, `iso`):
 * a profile is an advisory soundness check, never a compliance guarantee, and
 * ArchLang does not model everything a code requires (clear opening width, approach
 * clearances, hardware). Every override is a documented, traceable threshold.
 */
export const LINT_PROFILES: Readonly<Record<string, Partial<LintRuleset>>> = Object.freeze({
  /** The shipped residential baseline (identical to {@link DEFAULT_RULESET}). */
  "residential-basic": {},
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
});

/** The names of the built-in {@link LINT_PROFILES}, for CLI validation. */
export const LINT_PROFILE_NAMES: readonly string[] = Object.keys(LINT_PROFILES);

export interface LintOptions extends AnalyzeOptions {
  /** A named profile from {@link LINT_PROFILES} (applied before `ruleset`). */
  profile?: string;
  /** Override any subset of {@link DEFAULT_RULESET} (wins over `profile`). */
  ruleset?: Partial<LintRuleset>;
}
