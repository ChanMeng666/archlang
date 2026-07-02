/**
 * Room-graph reachability: builds the room-connectivity graph from doors/openings
 * (rooms + the literal "exterior") once, then — per room, in source order — emits
 * W_BATH_VIA_BEDROOM and W_ROOM_UNREACHABLE, preserving the historical interleaving.
 */

import { doorConnections, isBedroom, isWetRoom, pointOnRoomEdge } from "../../analyze.js";
import type { Diagnostic } from "../../diagnostics.js";
import type { LintContext, LintRule } from "../context.js";

export const reachability: LintRule = {
  name: "reachability",
  check({ rooms, connectors, roomRects, rules, labelOf, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    const adj = new Map<string, Set<string>>();
    const addEdge = (x: string, y: string): void => {
      if (!adj.has(x)) adj.set(x, new Set());
      if (!adj.has(y)) adj.set(y, new Set());
      adj.get(x)!.add(y);
      adj.get(y)!.add(x);
    };
    for (const c of connectors) {
      const conn = doorConnections(c, roomRects, rules.tolMm);
      if (conn.length === 2) addEdge(conn[0]!, conn[1]!);
    }
    const isBedroomId = (id: string): boolean => {
      const r = rooms.find((x) => x.id === id);
      return r ? isBedroom(r) : false;
    };
    const bfs = (excludeBedrooms: boolean): Set<string> => {
      const seen = new Set<string>();
      if (!adj.has("exterior")) return seen;
      seen.add("exterior");
      const queue = ["exterior"];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const nb of adj.get(cur) ?? []) {
          if (seen.has(nb) || (excludeBedrooms && isBedroomId(nb))) continue;
          seen.add(nb);
          queue.push(nb);
        }
      }
      return seen;
    };
    if (adj.has("exterior")) {
      const reachAll = bfs(false);
      const reachNoBed = bfs(true);
      for (const r of rooms) {
        // A wet room reachable from the entrance only by passing through a bedroom.
        if (isWetRoom(r) && reachAll.has(r.id) && !reachNoBed.has(r.id)) {
          out.push({
            severity: "warning",
            code: "W_BATH_VIA_BEDROOM",
            ...at(r.span),
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
            ...at(r.span),
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
