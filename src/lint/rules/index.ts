/**
 * The ordered rule list `lint()` folds over. ORDER IS CONTRACT: the emitted
 * diagnostic array is pinned by tests and diffed by agents, so append new rules
 * where they belong in the reading order rather than re-sorting.
 */

import type { LintRule } from "../context.js";
import { aliasMatch } from "./alias-match.js";
import { annotationOverlap, titleOverflow } from "./annotations.js";
import { roomNoClearPath } from "./circulation.js";
import { dimInside, dimOverlap, dimTextMismatch, openingNotDimensioned } from "./dims.js";
import { circuitousPath, pathTooNarrow } from "./circulation-facts.js";
import { furnitureOverWindow, wcSideClearance } from "./clearances.js";
import {
  doorClearance,
  doorNearCorner,
  doorwayBlocked,
  leafAcrossDoorway,
  pocketRun,
  swingObstructed,
} from "./doors.js";
import { footprintTransposed } from "./footprint.js";
import { noEntrance } from "./entrance.js";
import {
  fixtureBackToRoom,
  fixtureFloating,
  fixtureWrongRoom,
  furnClearance,
  furnitureOverlap,
  furnitureWallCollision,
} from "./furniture.js";
import { boundaryNoWall, floorUnassigned, roomOutsideShell } from "./enclosure.js";
import { furnClearDeclared, seatFacingAway } from "./furniture-relations.js";
import { connectorAmbiguous, openingAtJunction, openingOverlap } from "./openings.js";
import { perRoomRules } from "./per-room.js";
import { entranceIntoPrivate, roomViaPrivate, wetRoomDoor } from "./privacy.js";
import { reachability } from "./reachability.js";
import { habitableNoWindow, roomMissingDefining } from "./room-contents.js";
import { balconyNoDoor, outdoorOverlapsRoom } from "./outdoor.js";
import { roomNotEquatorFacing } from "./site.js";
import { shaftFootprintMismatch, stairUnmatched } from "./vertical.js";
import { stairHeadVoid, stairNoLanding, stairSideEntry, stairTooSteep, swingOverStair } from "./stairs.js";

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
  // Classification advisory: a room's use inferred from an indirect alias.
  // Appended after the circulation advisories so existing output ordering is unchanged.
  aliasMatch,
  // Orientation advisory: a fixture standing on a wall but facing the wrong way.
  // Appended last, again to leave every existing plan's diagnostic ORDER unchanged.
  fixtureBackToRoom,
  // Annotation advisory: a hand-written dimension line reading inside the building.
  // Appended last for the same reason.
  dimInside,
  // Multi-storey advisory: a vertical run whose id matches nothing on any other
  // storey. Appended last so no existing plan's diagnostic ORDER moves.
  stairUnmatched,
  // Annotation advisory: two hand-written dimensions drawn on top of each other. Appended
  // LAST — every existing plan's diagnostic ORDER has to stay exactly where it was, and a
  // rule that fires only on a `dim` pair can be read at the end of the list.
  dimOverlap,
  // Orientation advisory (the site layer): a habitable room whose windows all miss the
  // equator-facing aspect. Appended LAST, for the same reason as every rule above it —
  // no existing plan's diagnostic ORDER may move — and it cannot fire at all unless the
  // plan declares `site`, so no plan written before it existed can see it.
  roomNotEquatorFacing,
  // Door-vocabulary soundness: a `pocket` door with no wall to slide into.
  // Appended LAST, for the same reason as every rule above it — no existing plan's
  // diagnostic ORDER may move — and it cannot fire at all unless a door names the
  // `pocket` kind, so no plan written before it existed can see it.
  pocketRun,
  // Ground-surface advisories: a terrace laid over a room's floor, and a balcony
  // with no way onto it. Appended LAST, for the same reason as every rule above them —
  // no existing plan's diagnostic ORDER may move — and neither can fire at all unless the
  // plan declares an `outdoor` surface, so no plan written before they existed can see
  // one.
  outdoorOverlapsRoom,
  balconyNoDoor,
  // Drafting advisory: a door jamb leaving less wall between it and a
  // corner than the wall is thick. Appended LAST, for the same reason as every rule
  // above it — no existing plan's diagnostic ORDER may move.
  doorNearCorner,
  // Annotation advisory: an opening on the outside of the building that no
  // `dims auto all` chain measures. Appended LAST, for the same reason as every rule above
  // it, and it cannot fire unless the plan says `dims auto all`.
  openingNotDimensioned,
  // Circulation and privacy (plan-soundness PS2.5–PS2.7): a room reached only through a
  // bedroom or bath, a wet room's door in the wrong place, and a front door into a private
  // room. Appended LAST, in that order, so no existing rule's diagnostic ORDER moves.
  roomViaPrivate,
  wetRoomDoor,
  entranceIntoPrivate,
  // Plan-soundness advisories on openings and the walls around them (PS2.1–PS2.3): an
  // opening at a wall junction, two openings sharing a run, and a connector whose sides do
  // not each lie in one room. Appended LAST, in that order, so no existing plan's
  // diagnostic ORDER moves.
  openingAtJunction,
  openingOverlap,
  connectorAmbiguous,
  // Room-contents advisories (plan-soundness PS2.8, PS2.9): a living room, dining room or
  // kitchen with no window, and a furnished room missing the piece that defines it. Appended
  // LAST, in this order, so no existing diagnostic moves within the array.
  habitableNoWindow,
  roomMissingDefining,
  // Space-enclosure advisories (plan-soundness PS2.4): two rooms with no wall between them,
  // walled floor in no room, and a room outside the building's walls. Appended LAST, in this
  // order, so no existing diagnostic moves within the array.
  boundaryNoWall,
  floorUnassigned,
  roomOutsideShell,
  // Furniture relations (ADR 0029 §6): a declared `clear front|sides` measured short, and the
  // undeclared PS2.11 seat check (a chair at a table facing away from it). Appended LAST, in
  // this order, so no existing diagnostic moves within the array.
  furnClearDeclared,
  seatFacingAway,
  // Annotation validity (plan-soundness PS2.10): a hand-written dimension whose number is not
  // the span its line measures. Appended LAST so no existing diagnostic moves within the array.
  dimTextMismatch,
  // Annotation collisions on the drawn sheet (plan-soundness PS2.12): a `dims auto` number or a
  // room label printed over a symbol or a label, and a title-block value wider than its row.
  // Drafting only — they read the drawing, never `describe()`. Appended LAST, in this order, so
  // no existing diagnostic moves within the array.
  annotationOverlap,
  titleOverflow,
  // The clearance family (plan-soundness PS2.11a, PS2.11b): a WC whose centreline stands too near
  // a side wall or fixture, and a tall unit standing in front of a window. Appended LAST, in this
  // order, so no existing diagnostic moves within the array.
  wcSideClearance,
  furnitureOverWindow,
  // Clearances (plan-soundness PS2.11c, PS2.11d): a directional piece written with its depth on
  // its long side, and a door's open leaf parked across another doorway's approach. Appended
  // LAST, in this order, so no existing diagnostic moves within the array.
  footprintTransposed,
  leafAcrossDoorway,
  // Stair safety (plan-soundness PS2.11e, the stair bullets, and PS2.34): a door swinging over a
  // flight or its landing, a flight with no landing, a doorway onto its side, a void at its head
  // and a run too short for its storey; then PS2.15, a shaft whose stops do not stand over each
  // other. Appended LAST, in this order, so no existing diagnostic moves within the array.
  swingOverStair,
  stairNoLanding,
  stairSideEntry,
  stairHeadVoid,
  stairTooSteep,
  shaftFootprintMismatch,
];

export type { LintContext, LintRule } from "../context.js";
