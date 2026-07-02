/**
 * The lint ruleset: tunable thresholds, named advisory profiles, and the options
 * type. Split from `lint.ts` so individual rule modules (`./rules/*.ts`) can import
 * the types without a cycle through the `lint()` entry point; `lint.ts` re-exports
 * everything here, so the public surface is unchanged.
 */

import type { AnalyzeOptions } from "../analyze.js";
import { DEFAULT_TOL } from "../analyze.js";

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
}

export const DEFAULT_RULESET: LintRuleset = {
  minRoomAreaM2: 4,
  minDoorWidthMm: 700,
  tolMm: DEFAULT_TOL,
  maxUnenclosedMm: 300,
  swingClearanceMm: 0,
  fixtureWallTolMm: 300,
  doorwayLandingMm: 300,
  minClearAreaM2: 1.0,
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
