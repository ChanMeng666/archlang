/**
 * The `furniture` list of a `describe()` summary: {@link furnitureSummaries}, one
 * {@link FurnitureSummary} per piece, with the `clear` zone facts when a piece declares one.
 * Moved out of `summarize`.
 *
 * Pure; charges nothing to the step meter.
 */

import type { RDoor, RFurniture, RWall as RWallFact } from "../ir.js";
import { type ClearWorld, clearWorldOf, measureClear } from "../furniture-relation.js";
import type { ClearFact, FurnitureSummary } from "./types.js";
import { instanceOf } from "./shared.js";

/** One summary per piece, in element order; `walls` and `doorEls` are the obstacles of the `clear` world. */
export function furnitureSummaries(
  furnEls: readonly RFurniture[],
  walls: readonly RWallFact[],
  doorEls: readonly RDoor[],
): FurnitureSummary[] {
  // The `clear` measure's obstacle world, built only when a piece declares a zone, so a plan
  // without one does no new work.
  const clearWorld = furnEls.some((f) => f._clear) ? clearWorldOf(furnEls, walls, doorEls) : undefined;
  const furniture: FurnitureSummary[] = furnEls.map((f) => ({
    id: f.id,
    category: f.category,
    ...(f.label !== undefined ? { label: f.label } : {}),
    ...(f.room !== undefined ? { room: f.room } : {}),
    ...(f.rotate ? { rotate: f.rotate } : {}),
    ...instanceOf(f),
    ...(f._relation !== undefined ? { relation: f._relation } : {}),
    ...(f._facing !== undefined ? { facing: f._facing } : {}),
    ...(f._clear && clearWorld ? { clear: clearFacts(f, f._clear, clearWorld) } : {}),
  }));
  return furniture;
}

/** The declared clear zones of one piece, each with its measured free depth (ADR 0029 §4). */
function clearFacts(
  f: RFurniture,
  c: { front?: number; sides?: number },
  world: ClearWorld,
): { front?: ClearFact; sides?: ClearFact } {
  const out: { front?: ClearFact; sides?: ClearFact } = {};
  if (c.front !== undefined)
    out.front = {
      declared: c.front,
      measured: measureClear(f, "front", c.front, world).measured,
    };
  if (c.sides !== undefined)
    out.sides = {
      declared: c.sides,
      measured: measureClear(f, "sides", c.sides, world).measured,
    };
  return out;
}
