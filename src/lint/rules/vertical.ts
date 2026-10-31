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
import { boardedFlight, isBlockStair, runAxis, verticalRect as rect } from "../../vertical.js";
import { mm } from "../measure.js";
import type { LintContext, LintRule } from "../context.js";

export const stairUnmatched: LintRule = {
  name: "stair-unmatched",
  family: "vertical",
  layer: "validity",
  stage: "rooms",
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
      const r = rect(boardedFlight(v));
      out.push({
        severity: "warning",
        code: "W_STAIR_UNMATCHED",
        ...at(v),
        // Named by where it stands, never by its id: the id is what joins storeys, and is in the hint.
        message: `The ${v.kind === "elevator" ? "elevator" : v.kind === "escalator" ? "escalator" : "stair"} ${placeAt({
          x: r.x + r.w / 2,
          y: r.y + r.h / 2,
        })}${(building.storeyCount ?? 1) > 1 && ir.level !== undefined ? ` on level ${ir.level}` : ""} appears on only one storey, so it connects nothing.`,
        hints: [
          `Draw the matching run with the same id \`${v.id}\` on the storey above or below (each storey declares its own \`dir\`).`,
        ],
      });
    }
    return out;
  },
};

/**
 * `W_SHAFT_FOOTPRINT_MISMATCH` (plan-soundness PS2.15) — a shaft whose runs on two neighbouring
 * stops do not stand over each other.
 *
 * Identity joins storeys (above); nothing compared where the two runs stand. A same-id run whose
 * footprint on the stop below barely overlaps (or misses) its footprint here is an inconsistent
 * drawing: the flight you climb on one page lands somewhere else on the next. No clause is needed
 * to call it a defect (`research/2026-10-18-furniture-and-multistorey.md` B6, which cites UK
 * Approved Document B 2.5a for a protected stair continuous "at all storeys" [V]).
 *
 * The test, per pair of neighbouring stops, reported on the UPPER one: a lift car must stand in
 * the same footprint on both (a shaft is plumb); a stair or escalator must run along the same axis
 * and its two footprints must overlap by at least half of the smaller one. Half is this
 * programme's threshold, not a code's: it catches a run drawn in another place or turned, and
 * leaves a footprint redrawn a little longer or shifted by a wall's thickness.
 *
 * A block stair is compared on its bounding box and its axis is not: the axis of the flight
 * boarded differs between a `dir up` and a `dir down` stop of one L, which is no defect. Filed as
 * the `block-stair` coverage skip.
 */
export const SHAFT_MIN_OVERLAP_SHARE = 0.5;

export const shaftFootprintMismatch: LintRule = {
  name: "shaft-footprint-mismatch",
  family: "vertical",
  layer: "validity",
  stage: "rooms",
  codes: ["W_SHAFT_FOOTPRINT_MISMATCH"],
  check({ verticals, placeAt, ir, building, at, skip }: LintContext): Diagnostic[] {
    if (!building.multiStorey) {
      if (verticals.length > 0) skip("single-storey");
      return [];
    }
    const out: Diagnostic[] = [];
    const seen = new Set<string>();
    for (const v of verticals) {
      if (seen.has(v.id)) continue; // the first run of an id per storey, as identity reads it
      seen.add(v.id);
      const below = building.shaftNeighbours?.get(v.id)?.below;
      if (!below) continue;
      const a = rect(v);
      const b = rect(below.run);
      const block = isBlockStair(v) || isBlockStair(below.run);
      if (block) skip("block-stair");
      const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      const share = (ox * oy) / Math.min(a.w * a.h, b.w * b.h);
      const lift = v.kind === "elevator" || below.run.kind === "elevator";
      let why: string | null = null;
      if (v.kind !== below.run.kind) why = `it is drawn as ${word(below.run.kind)} there and ${word(v.kind)} here`;
      else if (lift) {
        if (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h)
          why = "a lift car stands in one plumb shaft, and this car is not drawn in the footprint of the one below";
      } else if (!block && runAxis(v) !== runAxis(below.run))
        why = "the flight runs across the page on one storey and up it on the other";
      else if (share < SHAFT_MIN_OVERLAP_SHARE)
        why = `the footprints overlap by ${pct(share)} of the smaller, under half`;
      if (why === null) continue;
      const name = v.kind === "elevator" ? "elevator" : v.kind === "escalator" ? "escalator" : "stair";
      out.push({
        severity: "warning",
        code: "W_SHAFT_FOOTPRINT_MISMATCH",
        ...at(v),
        message: `The ${name} ${placeAt({ x: a.x + a.w / 2, y: a.y + a.h / 2 })} on level ${ir.level} does not stand over the run it continues from level ${below.level}: ${why}.`,
        hints: [
          `Draw \`${v.id}\` with the same footprint on both storeys: on level ${below.level} it is at (${mm(b.x)},${mm(b.y)}) size ${mm(b.w)}x${mm(b.h)}, here at (${mm(a.x)},${mm(a.y)}) size ${mm(a.w)}x${mm(a.h)}. If they are two different runs, give them different ids.`,
        ],
      });
    }
    return out;
  },
};

const word = (k: string): string => (k === "elevator" ? "an elevator" : k === "escalator" ? "an escalator" : "a stair");
const pct = (share: number): string => `${mm(share * 100)}%`;
