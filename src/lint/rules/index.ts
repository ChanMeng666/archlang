/**
 * The ordered rule list `lint()` folds over. ORDER IS CONTRACT: the emitted
 * diagnostic array is pinned by tests and diffed by agents, so append new rules
 * where they belong in the reading order rather than re-sorting.
 */

import type { LintRule } from "../context.js";
import { aliasMatch } from "./alias-match.js";
import { roomNoClearPath } from "./circulation.js";
import { dimInside, dimOverlap } from "./dims.js";
import { circuitousPath, pathTooNarrow } from "./circulation-facts.js";
import { doorClearance, doorwayBlocked, swingObstructed } from "./doors.js";
import { noEntrance } from "./entrance.js";
import {
  fixtureBackToRoom,
  fixtureFloating,
  fixtureWrongRoom,
  furnClearance,
  furnitureOverlap,
  furnitureWallCollision,
} from "./furniture.js";
import { perRoomRules } from "./per-room.js";
import { reachability } from "./reachability.js";
import { stairUnmatched } from "./vertical.js";

export const LINT_RULES: readonly LintRule[] = [
  perRoomRules,
  furnitureOverlap,
  furnClearance,
  fixtureFloating,
  fixtureWrongRoom,
  furnitureWallCollision,
  reachability,
  swingObstructed,
  doorwayBlocked,
  doorClearance,
  roomNoClearPath,
  noEntrance,
  // Circulation-quality advisories (ADR 0008) — appended last so existing lint output
  // ordering is unchanged.
  pathTooNarrow,
  circuitousPath,
  // Classification advisory (Tranche 6): a room's use inferred from an indirect alias.
  // Appended after the circulation advisories so existing output ordering is unchanged.
  aliasMatch,
  // Orientation advisory: a fixture standing on a wall but facing the wrong way.
  // Appended last, again to leave every existing plan's diagnostic ORDER unchanged.
  fixtureBackToRoom,
  // Annotation advisory: a hand-written dimension line reading inside the building.
  // Appended last for the same reason.
  dimInside,
  // Multi-storey advisory (v1.21): a vertical run whose id matches nothing on any other
  // storey. Appended last so no existing plan's diagnostic ORDER moves.
  stairUnmatched,
  // Annotation advisory: two hand-written dimensions drawn on top of each other. Appended
  // LAST — every existing plan's diagnostic ORDER has to stay exactly where it was, and a
  // rule that fires only on a `dim` pair can be read at the end of the list.
  dimOverlap,
];

export type { LintContext, LintRule } from "../context.js";
