/**
 * Room-graph reachability: builds the room-connectivity graph from doors/openings
 * (rooms + the literal "exterior") once, then — per room, in source order — emits
 * W_BATH_VIA_BEDROOM and W_ROOM_UNREACHABLE, preserving the historical interleaving.
 *
 * The graph is the `"probe"` access graph `describe().access` reads too: a connector
 * touching 3+ rooms joins the room on each face of its host wall, or nothing when the
 * probe cannot decide (see `AmbiguityPolicy` in `analyze.ts`; `test/access-policy.test.ts`
 * holds every surface to one reachability answer).
 *
 * On a storey with no exterior door that a shaft nevertheless reaches, the room
 * the shaft lands in is a source beside "exterior" — coming down the stairs
 * and out of the front door below IS a way out — so the same search answers the same
 * question one storey up. A single-storey plan has no such source and is unchanged.
 */

import { accessDigraph, EXTERIOR_NODE, isBedroom, isWetRoom, pointOnRoomEdge, reachFrom } from "../../analyze.js";
import type { Diagnostic } from "../../diagnostics.js";
import type { LintContext, LintRule } from "../context.js";

export const reachability: LintRule = {
  name: "reachability",
  check({ rooms, connectors, roomRects, rules, labelOf, at, building, access }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    const g = accessDigraph(
      rooms.map((r) => r.id),
      access().edges,
    );
    // A shaft arriving from a reachable storey is this floor's entrance.
    const arrivals = building.arrivalRooms.filter((id) => roomRects.has(id));
    const isBedroomId = (id: string): boolean => {
      const r = rooms.find((x) => x.id === id);
      return r ? isBedroom(r) : false;
    };
    if (g.out(EXTERIOR_NODE).length > 0 || arrivals.length > 0) {
      const reachAll = reachFrom(g, { extraSources: arrivals });
      const reachNoBed = reachFrom(g, { extraSources: arrivals, avoid: isBedroomId });
      for (const r of rooms) {
        // A wet room reachable from the entrance only by passing through a bedroom.
        if (isWetRoom(r) && reachAll.has(r.id) && !reachNoBed.has(r.id)) {
          out.push({
            severity: "warning",
            code: "W_BATH_VIA_BEDROOM",
            ...at(r),
            message: `Bathroom "${labelOf(r)}" is reachable only through a bedroom.`,
            hints: [
              "Connect it to a hall or living space — or, if it is an en-suite, add a second bathroom off circulation.",
            ],
          });
        }
        // Has a connector on its perimeter (so not W_ROOM_DISCONNECTED) yet no path
        // back to the entrance — a sealed-off pocket. Only meaningful when an
        // entrance exists (else W_NO_ENTRANCE already covers the whole plan).
        const rect = roomRects.get(r.id)!;
        const hasConnector = connectors.some((c) => pointOnRoomEdge(c.at, rect, rules.tolMm));
        if (hasConnector && !reachAll.has(r.id)) {
          out.push({
            severity: "warning",
            code: "W_ROOM_UNREACHABLE",
            ...at(r),
            message: `Room "${labelOf(r)}" can't be reached from the entrance.`,
            hints: [
              "Add a door or cased `opening` linking it (directly or through a hall) to a space that reaches the entrance.",
            ],
          });
        }
      }
    }
    return out;
  },
};
