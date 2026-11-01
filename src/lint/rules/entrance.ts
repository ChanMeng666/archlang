/**
 * The building has rooms but no way in.
 *
 * The question is the GEOMETRIC one `describe()` asks — is there a door or cased opening
 * that connects a room to the outside? — read off the shared access graph
 * (`LintContext.access`), so lint and `describe().access.hasEntrance` can never disagree.
 *
 * This rule used to stand down unless some wall carried `category exterior`. That
 * guard silently exempted two whole shapes of plan from ever being asked: a closed shell
 * drawn entirely out of `partition` walls, and rooms with no walls at all. `describe()`
 * reported `hasEntrance: false` for both while `arch lint` said nothing. Component
 * libraries — the case the shell test was standing in for — are covered by
 * `rooms.length > 0` on its own: a library file declares no rooms.
 *
 * On a multi-storey plan a storey reached by a `stair`/`elevator`/`escalator` from a
 * storey that itself reaches the outside HAS a way in — it just isn't a door on this
 * floor — so the rule stands down there (see `src/vertical.ts`) rather than making an upper
 * floor fake a front door to lint clean.
 *
 * A storey it does fire on is judged per storey, so when the building does have a way in on
 * another floor the message says which storey and what is missing there ({@link storeyGap}). A
 * plan of one storey, and a building no storey of which is reached from outside, keep the sentence
 * about the plan, which is true of them.
 */

import type { Diagnostic } from "../../diagnostics.js";
import { capFirst } from "../../naming.js";
import { type RVertical, roomToward, type VerticalConnection, type VerticalStop } from "../../vertical.js";
import type { LintContext, LintRule } from "../context.js";

/** What the warning says: the storey's fact, and in the hint the ids to act on. */
interface Gap {
  message: string;
  hint: string;
}

const ADD_DOOR = "Add a `door` (or a cased `opening`) on an `exterior` wall.";

/** A plan of one storey, or a building no storey of which is reached from outside. */
const NO_WAY_IN: Gap = {
  message: "The plan has no exterior door or opening — there is no way into the building.",
  hint: ADD_DOOR,
};

/** A shaft or run in a message, by kind, never by id. */
const kindWord = (kind: RVertical["kind"]): string =>
  kind === "elevator" ? "elevator" : kind === "escalator" ? "escalator" : "stair";

/** Does a person stepping off at `stop` land on no room, from either side? */
const landsOnNoRoom = (stop: VerticalStop): boolean =>
  (stop.steps_off ? [stop.steps_off.below, stop.steps_off.above] : [stop.room]).includes(null);

/**
 * Why a storey of a multi-storey building has no way in. Its own door is missing in every case
 * (the rule reads that first); what differs is why no shaft makes up for it:
 *
 *  1. no storey of the building is reached from outside: the plan's sentence, {@link NO_WAY_IN};
 *  2. a shaft reaches the storey but lands on no room here (`describe` lists the storey as
 *     reachable, and there is no floor to step onto);
 *  3. a shaft stops here but is dead: the rooms it stands in elsewhere cannot be walked to, or the
 *     storeys it joins are cut off as well;
 *  4. a run stands here but only here (`W_STAIR_UNMATCHED` reports the run);
 *  5. no run stands here at all.
 */
function storeyGap(ctx: LintContext, level: number): Gap {
  const { building, verticals } = ctx;
  const reachable = building.reachableLevels ?? new Set<number>();
  if (reachable.size === 0) return NO_WAY_IN;
  const own = `Level ${level} has no exterior door or opening of its own`;
  const here = (building.connections ?? []).filter((c) => c.levels.includes(level));
  const stopOn = (c: VerticalConnection): VerticalStop => c.stops.find((s) => s.level === level)!;
  // The first shaft that carried someone here, not the first that stops here: only that one's
  // landing cures the storey. One that stands in a sealed room below rides in on it, because a stop
  // in no room is active once its storey is reachable, and it is not what reached the storey.
  const landing = [...(building.landedShafts ?? [])]
    .map((id) => here.find((c) => c.id === id))
    .find((c) => c !== undefined && landsOnNoRoom(stopOn(c)));
  if (reachable.has(level) && landing !== undefined) {
    const word = kindWord(landing.kind);
    return {
      message: `${own}, and the ${word} that reaches it lands on no room here, so there is no floor to step off onto.`,
      hint: `Land ${word} \`${landing.id}\` on a room's floor on this storey, or add a room under it. Or: ${ADD_DOOR}`,
    };
  }
  if (here.length > 0) {
    // The hint takes the shaft with a stop on a storey that has a way in: that is the one to mend.
    const stopElsewhere = (c: VerticalConnection): VerticalStop | undefined =>
      c.stops.find((s) => s.level !== level && reachable.has(s.level));
    const dead = here.find((c) => stopElsewhere(c) !== undefined) ?? here[0]!;
    const word = kindWord(dead.kind);
    const other = stopElsewhere(dead);
    const several = `${own}, and none of the ${here.length} stairs, elevators or escalators that stop here leads from a room a person can walk to.`;
    if (other === undefined) {
      return {
        message:
          here.length > 1
            ? several
            : `${own}, and the ${word} that stops here joins it only to storeys with no way in either.`,
        hint: `${capFirst(word)} \`${dead.id}\` stops on levels ${dead.levels.join(", ")}: join one of them to a storey with a way in. Or: ${ADD_DOOR}`,
      };
    }
    const room = roomToward(other, other.level < level ? "above" : "below");
    return {
      message:
        here.length > 1
          ? several
          : `${own}, and the ${word} that stops here stands in a room nobody can walk to on level ${other.level}.`,
      hint: `On level ${other.level}, ${word} \`${dead.id}\` stands in room \`${room}\`: give that room a door from a room with a way in, or move the ${word} into one. Or: ${ADD_DOOR}`,
    };
  }
  if (verticals.length > 0) {
    const runs = verticals.map((v) => `\`${v.id}\``).join(", ");
    return {
      message:
        verticals.length === 1
          ? `${own}, and its ${kindWord(verticals[0]!.kind)} stops on no other storey, so nothing leads to it.`
          : `${own}, and none of its ${verticals.length} stairs, elevators or escalators stops on another storey, so nothing leads to it.`,
      hint: `Only the id joins two stops: give ${runs} the id of the run it meets on the storey above or below. Or: ${ADD_DOOR}`,
    };
  }
  return {
    message: `${own}, and no stair, elevator or escalator joins it to another storey, so there is no way onto it.`,
    hint: `Draw a \`stair\` with one id on this storey and on a storey with a way in. Or: ${ADD_DOOR}`,
  };
}

export const noEntrance: LintRule = {
  name: "no-entrance",
  family: "reachability",
  layer: "validity",
  stage: "openings",
  codes: ["W_NO_ENTRANCE"],
  check(ctx: LintContext): Diagnostic[] {
    const { rooms, access, building, ir } = ctx;
    const reachedByShaft = building.arrivalRooms.length > 0;
    if (rooms.length > 0 && !access().hasEntrance && !reachedByShaft) {
      const named = (building.storeyCount ?? 1) > 1 && ir.level !== undefined;
      const gap = named ? storeyGap(ctx, ir.level!) : NO_WAY_IN;
      return [{ severity: "warning", code: "W_NO_ENTRANCE", message: gap.message, hints: [gap.hint] }];
    }
    return [];
  },
};
