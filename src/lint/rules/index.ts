/**
 * The ordered rule list `lint()` folds over. ORDER IS CONTRACT: the emitted
 * diagnostic array is pinned by tests and diffed by agents, so append new rules
 * where they belong in the reading order rather than re-sorting.
 */

import type { LintRule } from "../context.js";
import { aliasMatch } from "./alias-match.js";
import { roomNoClearPath } from "./circulation.js";
import { circuitousPath, pathTooNarrow } from "./circulation-facts.js";
import { doorClearance, doorwayBlocked, swingObstructed } from "./doors.js";
import { noEntrance } from "./entrance.js";
import {
  fixtureFloating,
  fixtureWrongRoom,
  furnClearance,
  furnitureOverlap,
  furnitureWallCollision,
} from "./furniture.js";
import { perRoomRules } from "./per-room.js";
import { reachability } from "./reachability.js";

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
];

export type { LintContext, LintRule } from "../context.js";
