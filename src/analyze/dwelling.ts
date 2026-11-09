/**
 * Does the plan read as a dwelling? (plan-soundness PS2.18.)
 *
 * Three lint arms describe defects of a home, not of every building: a kitchen with no window
 * (`W_HABITABLE_NO_WINDOW`'s kitchen arm), a bath or WC door onto the dining room or living
 * space, or with no leaf, or a passage (`W_WET_ROOM_DOOR`, all but its kitchen arm), and a
 * front door into a bedroom or WC (`W_ENTRANCE_INTO_PRIVATE`). An office kitchenette, a café's
 * seating and a clinic's waiting room are not what they describe. Until rooms are grouped into
 * declared dwellings (PS2.14), the plan's rooms are read for positive evidence of another kind
 * of building, and a plan without it is a dwelling:
 *
 *  - a room whose label (else id, as {@link roomUses} reads it) carries an unambiguous word of
 *    `NON_RESIDENTIAL_VOCABULARY` (`src/vocabulary.ts`: "Cafe seating", "Consulting 1",
 *    "Staff room"), on any plan;
 *  - or, on a plan with no room whose use is `bedroom` or `living`, a room whose use is
 *    `office`, or a label carrying one of the ambiguous words ("Waiting / Reception",
 *    "Meeting Room", "Lobby", "Shop"). A bedroom or a living room overrules them: a living room,
 *    an office and a bath drawn alone are a home's fragment with a study, and a house's
 *    "Reception room" or "Entrance Lobby" is a room of the house.
 *
 * There is no "unknown": a plan that gives no such evidence is judged as before, so every
 * house, flat and studio (`uses living bedroom`) lints exactly as it did. The reading is
 * lint-only: `describe()` never reads it, and it adds no {@link UseKind}. One pass over the
 * rooms, each label matched against a fixed word list, so no step meter is needed.
 *
 * This is the gate of the home-only lint arms: a rule that applies to dwellings asks here, never
 * re-derives it.
 */

import type { UseKind } from "../ast.js";
import { roomUses } from "../analyze.js";
import { nonResidentialWord } from "../vocabulary.js";

/** What {@link dwellingReading} reads a plan as. */
export type DwellingReading = "dwelling" | "non-residential";

/** Read the plan's rooms (every storey's, for a multi-storey plan). */
export function dwellingReading(rooms: Iterable<{ label?: string; id: string; uses?: UseKind[] }>): DwellingReading {
  // Evidence a bedroom or living room overrules: an office use, or an ambiguous word.
  let weak = false;
  let home = false;
  for (const r of rooms) {
    const w = nonResidentialWord(r.label ?? r.id);
    if (w !== null && !w.ambiguous) return "non-residential";
    const u = roomUses(r);
    // A room that itself reads as a home's ("Reception room" is a living room) sets `home`, which
    // overrules any weak evidence, its own word included, so no per-room guard is needed.
    if (w !== null || u.has("office")) weak = true;
    if (u.has("bedroom") || u.has("living")) home = true;
  }
  return weak && !home ? "non-residential" : "dwelling";
}
