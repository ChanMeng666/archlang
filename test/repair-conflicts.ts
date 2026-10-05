/**
 * The hard-conflict census `test/repair-no-worse.test.ts` holds `repair()` to — an oracle
 * written from the LINT side, not from repair's own guard.
 *
 * A hard conflict is one instance of a furniture/door fault that `repair()` itself is
 * meant to clear, keyed by the identities involved so that "new" means a pair the input
 * did not have rather than a count that happens to match:
 *
 *   | key                         | lint code                     | repair's mover            |
 *   | --------------------------- | ----------------------------- | ------------------------- |
 *   | `overlap|L|a|b` (a < b)     | `W_FURNITURE_OVERLAP`         | `computeOverlapPush`      |
 *   | `wall|L|piece`              | `W_FURNITURE_WALL_COLLISION`  | `computeWallPush`         |
 *   | `doorway|L|door|piece`      | `W_DOORWAY_BLOCKED`           | `computeDoorwayPush`      |
 *   | `swing|L|door|piece`        | `W_SWING_OBSTRUCTED`          | `computeSwingPush`        |
 *
 * Each row is decided by the predicate the lint rule itself calls (`rectsOverlap` within
 * one cut-plane layer, `wallIntrusionDepth` past the 30 mm slack with the wall openings
 * subtracted, `doorLandingRect` ∩ the piece, `sectorIntersectsRect` with the ruleset's
 * swing clearance). The lint diagnostic for a code is a function of these pairs (one per
 * overlapping pair, one per colliding piece, one per door with any blocker), so a census
 * that gains no key cannot gain a diagnostic — the test also checks that directly.
 *
 * Not in the set, on purpose: `W_FIXTURE_WRONG_ROOM`, `W_FIXTURE_FLOATING` and
 * `W_FIXTURE_BACK_TO_ROOM`. repair clears those too, but they are a piece's relation to
 * its own room or wall, not a collision with anything else; see the backlog entry.
 */
import { resolvePlan } from "../src/analyze.js";
import { cutPlaneLayer } from "../src/fixtures-catalog.js";
import { doorSwing, sectorIntersectsRect, segmentsOfWall } from "../src/geometry.js";
import { doorLandingRect, rectsOverlap, wallIntrusionDepth } from "../src/geometry/rect.js";
import type { RDoor, RFurniture, ResolvedPlan } from "../src/ir.js";
import { DEFAULT_RULESET } from "../src/lint.js";

const rectOf = (f: RFurniture) => ({ x: f.at.x, y: f.at.y, w: f.size.w, h: f.size.h });

function storeyConflicts(ir: ResolvedPlan, level: number | undefined, out: Set<string>): void {
  const L = level ?? "";
  const furniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
  const doors = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const segs = ir.walls.flatMap((w) => segmentsOfWall(w));
  const openings = ir.walls.flatMap((w) => w.openings);
  for (let i = 0; i < furniture.length; i++)
    for (let j = i + 1; j < furniture.length; j++) {
      const a = furniture[i]!,
        b = furniture[j]!;
      if (cutPlaneLayer(a.category) !== cutPlaneLayer(b.category)) continue;
      if (!rectsOverlap(rectOf(a), rectOf(b))) continue;
      const [p, q] = [a.id, b.id].sort();
      out.add(`overlap|${L}|${p}|${q}`);
    }
  for (const f of furniture)
    if (segs.some((s) => wallIntrusionDepth(rectOf(f), s, openings) > 30)) out.add(`wall|${L}|${f.id}`);
  for (const d of doors) {
    const landing = doorLandingRect(d, DEFAULT_RULESET.doorwayLandingMm);
    const swing = doorSwing(d);
    for (const f of furniture) {
      if (landing && rectsOverlap(landing, rectOf(f))) out.add(`doorway|${L}|${d.id}|${f.id}`);
      if (swing && sectorIntersectsRect(swing, rectOf(f), DEFAULT_RULESET.swingClearanceMm))
        out.add(`swing|${L}|${d.id}|${f.id}`);
    }
  }
}

/** Every hard-conflict key in `source` (empty when it does not resolve). */
export function hardConflicts(source: string): Set<string> {
  const out = new Set<string>();
  const { ir, levels } = resolvePlan(source);
  if (levels.length > 0) for (const l of levels) storeyConflicts(l.ir, l.level, out);
  else if (ir) storeyConflicts(ir, undefined, out);
  return out;
}

/** The keys `after` has that `before` did not — what a repair made worse. */
export function newConflicts(before: string, after: string): string[] {
  const b = hardConflicts(before);
  return [...hardConflicts(after)].filter((k) => !b.has(k)).sort();
}

/** The lint codes the census covers. */
export const HARD_CODES = [
  "W_FURNITURE_OVERLAP",
  "W_FURNITURE_WALL_COLLISION",
  "W_DOORWAY_BLOCKED",
  "W_SWING_OBSTRUCTED",
] as const;
