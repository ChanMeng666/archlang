/**
 * `W_STAIR_UNMATCHED` — a run of vertical circulation that connects nothing.
 *
 * In a multi-storey plan, identity is the ONLY thing that joins two floors: a
 * `stair`/`elevator`/`escalator` carrying the same `id` in two `level` blocks is one
 * shaft (`src/vertical.ts`). So a run whose id appears on exactly ONE storey is drawn
 * but inert — almost always a typo in the id, or the matching run was simply never drawn
 * on the floor above or below.
 *
 * Deliberately simple, and advisory: a top-floor flight that genuinely rises only to a
 * roof hatch, and a lift that legitimately stops short of a storey, both trip it. The
 * catalog entry documents that limitation rather than the rule guessing around it
 * (ADR 0005 — the compiler states facts, it never invents architecture).
 *
 * Never fires on a single-storey plan: there is no other storey for a run to match, so
 * the question is meaningless there.
 */

import type { Diagnostic } from "../../diagnostics.js";
import { verticalRect as rect } from "../../vertical.js";
import type { LintContext, LintRule } from "../context.js";

export const stairUnmatched: LintRule = {
  name: "stair-unmatched",
  family: "vertical",
  layer: "validity",
  codes: ["W_STAIR_UNMATCHED"],
  check({ verticals, placeAt, ir, building, at, skip }: LintContext): Diagnostic[] {
    if (!building.multiStorey) {
      // A run drawn on a one-storey plan: whether it meets its other end is not asked.
      if (verticals.length > 0) skip("single-storey");
      return [];
    }
    const out: Diagnostic[] = [];
    for (const v of verticals) {
      if (building.verticalPeerIds.has(v.id)) continue;
      out.push({
        severity: "warning",
        code: "W_STAIR_UNMATCHED",
        ...at(v),
        // Named by where it stands, never by its id: the id is what joins storeys, and is in the hint.
        message: `The ${v.kind === "elevator" ? "elevator" : v.kind === "escalator" ? "escalator" : "stair"} ${placeAt({
          x: rect(v).x + rect(v).w / 2,
          y: rect(v).y + rect(v).h / 2,
        })}${(building.storeyCount ?? 1) > 1 && ir.level !== undefined ? ` on level ${ir.level}` : ""} appears on only one storey, so it connects nothing.`,
        hints: [
          `Draw the matching run with the same id \`${v.id}\` on the storey above or below (each storey declares its own \`dir\`).`,
        ],
      });
    }
    return out;
  },
};
