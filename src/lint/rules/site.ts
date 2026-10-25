/**
 * `W_ROOM_NOT_EQUATOR_FACING` — the site layer's one advisory rule.
 *
 * A habitable room (bedroom / living / dining) has **at least one** window and **none**
 * of them faces the equator side the plan's `site` block derives.
 *
 * **The code is named for what it checks, not for an outcome.** It says the room's
 * windows do not face the equator; it does not say the room is dark. There is no sun
 * model, no latitude and no date anywhere in ArchLang — "habitable rooms want the
 * equator-facing aspect" is a drafting heuristic, and a heuristic is all this reports.
 *
 * Four conditions, each carrying its reason:
 *
 *  - **Fires only when the plan declares `site`.** No `site` ⇒ the rule returns before it
 *    looks at anything ⇒ every existing plan lints byte-identically, order included.
 *  - **Requires ≥ 1 window.** A zero-window bedroom is already `W_BEDROOM_NO_WINDOW`'s
 *    report; double-reporting one defect under two codes makes a `--code`-filtered read
 *    misleading.
 *  - **Exact test, no fuzz.** "None faces `equator_side`" — not "none faces it or an
 *    adjacent quarter". A quarter-tolerance would be a threshold with no derivation.
 *  - **No `FixSuggestion`.** The remedy is "move a window to the other facade", which is
 *    geometry the compiler must not choose (ADR 0005 — facts and advice, never an
 *    invisible architect). A hint naming the equator-facing letter is the whole
 *    affordance.
 *
 * The facing itself comes from `windowFacingPage` + `toCompass` in `src/site.ts` — the
 * SAME pair `describe()` uses, so this rule and `describe().windows[].facing` can never
 * disagree about which way a window looks.
 */

import { pointOnRoomEdge, roomUses, windowServesRoom } from "../../analyze.js";
import type { Diagnostic } from "../../diagnostics.js";
import type { RRoom } from "../../ir.js";
import { deriveSite, planCenterOfRooms, toCompass, windowFacingPage } from "../../site.js";
import { northQuarterTurns } from "../../describe.js";
import type { LintContext, LintRule } from "../context.js";
import { capFirst } from "../../naming.js";

/**
 * Does the room read as HABITABLE — a space people occupy for long stretches, which is
 * the class the equator-aspect heuristic is about? Bedrooms and living/dining spaces;
 * never a bath, kitchen, hall, store or plant room.
 *
 * Read from {@link roomUses} alone: authored `uses` wins, and a room that declared none is
 * classified from its label by the one use vocabulary, which emits `living`/`dining` like
 * every other kind.
 */
function isHabitable(r: RRoom): boolean {
  const u = roomUses(r);
  return u.has("bedroom") || u.has("living") || u.has("dining");
}

export const roomNotEquatorFacing: LintRule = {
  name: "room-not-equator-facing",
  family: "orientation",
  layer: "validity",
  codes: ["W_ROOM_NOT_EQUATOR_FACING"],
  check(ctx: LintContext): Diagnostic[] {
    const site = ctx.ir.site;
    if (!site) {
      // Declared only when the rule had something to judge: a habitable room with a window.
      const judgeable = ctx.rooms.some((r) => {
        const rect = ctx.roomRects.get(r.id);
        return isHabitable(r) && rect && ctx.windows.some((w) => pointOnRoomEdge(w.at, rect, ctx.rules.tolMm));
      });
      if (judgeable) ctx.skip("no-site");
      return [];
    }

    const facts = deriveSite(site);
    const turns = northQuarterTurns(ctx.ir.north);
    const planCenter = planCenterOfRooms(ctx.roomRects);
    const out: Diagnostic[] = [];

    for (const r of ctx.rooms) {
      if (roomUses(r).size === 0) ctx.skip("no-uses", r);
      if (!isHabitable(r)) continue;
      const rect = ctx.roomRects.get(r.id);
      if (!rect) continue;
      const wins = ctx.windows.filter((w) => windowServesRoom(w, r.id, ctx.roomRects, ctx.rules.tolMm, ctx.wallSegs));
      if (wins.length === 0) continue;
      // `ctx.roomRects` is passed so a window on a polygon/circle room — or on a courtyard
      // wall — is answered by the outward-face probe, exactly as `describe()` answers it.
      // The two must never disagree about which way a window looks. A window on an arc edge
      // the room's edge does not touch (a bay, PS0.12) is asked with no room box, as
      // `describe()` asks it.
      const facings = wins.map((w) =>
        toCompass(
          windowFacingPage(
            w.at,
            pointOnRoomEdge(w.at, rect, ctx.rules.tolMm) ? rect : null,
            w.host,
            planCenter,
            ctx.roomRects,
          ),
          turns,
        ),
      );
      if (facings.includes(facts.equator_side)) continue;
      out.push({
        severity: "warning",
        code: "W_ROOM_NOT_EQUATOR_FACING",
        ...ctx.at(r),
        message:
          `${capFirst(ctx.nameOf(r, "room"))} has ${wins.length} window(s), none facing ${facts.equator_side} ` +
          `(the equator side in the ${facts.hemisphere}ern hemisphere) — they face ${[...new Set(facings)].join(", ")}.`,
        hints: [
          `A drafting heuristic, not a daylight measurement: it reports the aspect, not the light. Move a window onto the ${facts.equator_side} facade, or accept it.`,
        ],
      });
    }
    return out;
  },
};
