/**
 * Furniture placement rules: physical collisions (piece↔piece, piece↔wall),
 * frontal clearance, floating wall-fixtures, and `in <room>` drift. One rule per
 * export so each is individually testable; their relative order is fixed by
 * `rules/index.ts`.
 */

import { frontClearanceRect, isAgainstWall, rectOf } from "../../analyze.js";
import type { Diagnostic } from "../../diagnostics.js";
import { pointInRect, rectsOverlap, wallIntrusionDepth } from "../../geometry/rect.js";
import { frontClearanceMm, requiresWall } from "../../fixtures-catalog.js";
import type { LintContext, LintRule } from "../context.js";

/**
 * Minimum intrusion (mm) into a wall solid that counts as a collision. Above plausible
 * grid-snap noise from `against wall` placement, below any real penetration (a piece
 * straddling even a 100 mm partition intrudes far more), so flush/anchored fixtures
 * stay quiet while a sofa drawn through a wall is caught.
 */
const WALL_COLLISION_SLACK_MM = 30;

/** Furniture that overlaps another piece — a physical collision (each unordered
 *  pair reported once, in source order, against the second piece's span). */
export const furnitureOverlap: LintRule = {
  name: "furniture-overlap",
  check({ furniture, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (let i = 0; i < furniture.length; i++) {
      for (let j = i + 1; j < furniture.length; j++) {
        if (rectsOverlap(rectOf(furniture[i]), rectOf(furniture[j]))) {
          const nameI = furniture[i].label ?? furniture[i].category;
          const nameJ = furniture[j].label ?? furniture[j].category;
          out.push({
            severity: "warning",
            code: "W_FURNITURE_OVERLAP",
            ...at(furniture[j].span),
            message: `Furniture "${nameJ}" overlaps "${nameI}".`,
            hints: ["Move or resize one piece so they don't intersect; leave a walkway between them."],
          });
        }
      }
    }
    return out;
  },
};

/** A fixture's frontal activity clearance blocked by a *free-standing* piece of
 *  furniture (a sofa parked in front of the stove). Conservative on purpose: it
 *  ignores other plumbing/kitchen fixtures, so a compactly-packed bathroom or
 *  kitchen run never trips it — only a movable object in the use-space does. */
export const furnClearance: LintRule = {
  name: "furn-clearance",
  check({ furniture, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const f of furniture) {
      const clear = frontClearanceMm(f.category);
      if (clear <= 0) continue;
      const zone = frontClearanceRect(f, clear);
      for (const g of furniture) {
        if (g === f || requiresWall(g.category)) continue; // ignore other fixtures
        if (rectsOverlap(zone, rectOf(g))) {
          const fn = f.label ?? f.category;
          const gn = g.label ?? g.category;
          out.push({
            severity: "warning",
            code: "W_FURN_CLEARANCE",
            ...at(f.span),
            message: `Fixture "${fn}" has no clearance in front — "${gn}" is in the way.`,
            hints: [`Leave at least ${clear} mm of clear space in front of it, or move "${gn}".`],
          });
          break; // one warning per fixture
        }
      }
    }
    return out;
  },
};

/** A wall-requiring fixture (WC, basin, sink, counter, stove, fridge…) placed with
 *  no wall behind any edge — it floats in the room. */
export const fixtureFloating: LintRule = {
  name: "fixture-floating",
  check({ furniture, ir, rules, wallSegs, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const f of furniture) {
      if (requiresWall(f.category) && !isAgainstWall(rectOf(f), ir.walls, rules.fixtureWallTolMm, wallSegs)) {
        const name = f.label ?? f.category;
        out.push({
          severity: "warning",
          code: "W_FIXTURE_FLOATING",
          ...at(f.span),
          message: `Fixture "${name}" is not against a wall.`,
          hints: ["Place it so one edge backs onto a wall — plumbing/venting runs in the wall."],
        });
      }
    }
    return out;
  },
};

/** A fixture declared `in <room>` whose centre falls outside that room's rectangle
 *  (an unknown room id is the harder E_FURN_ROOM error, handled at resolve). */
export const fixtureWrongRoom: LintRule = {
  name: "fixture-wrong-room",
  check({ furniture, roomRects, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const f of furniture) {
      if (f.room === undefined) continue;
      const rect = roomRects.get(f.room);
      if (!rect) continue;
      const cx = f.at.x + f.size.w / 2;
      const cy = f.at.y + f.size.h / 2;
      if (!pointInRect(cx, cy, rect)) {
        const name = f.label ?? f.category;
        out.push({
          severity: "warning",
          code: "W_FIXTURE_WRONG_ROOM",
          ...at(f.span),
          message: `Fixture "${name}" sits outside its declared room "${f.room}".`,
          hints: ["Move it inside that room, or correct the `in <roomId>`."],
        });
      }
    }
    return out;
  },
};

/** Furniture that penetrates a wall solid (the sofa drawn straddling a partition).
 *  A piece flush against a wall face is fine; only a piece intruding into the wall's
 *  thickness band — past snap noise — trips. Reported once per piece, on the first
 *  wall it hits, in source order. */
export const furnitureWallCollision: LintRule = {
  name: "furniture-wall-collision",
  check({ furniture, wallSegs, wallOpenings, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const f of furniture) {
      const fr = rectOf(f);
      const hit = wallSegs.some((s) => wallIntrusionDepth(fr, s, wallOpenings) > WALL_COLLISION_SLACK_MM);
      if (hit) {
        const name = f.label ?? f.category;
        out.push({
          severity: "warning",
          code: "W_FURNITURE_WALL_COLLISION",
          ...at(f.span),
          message: `Furniture "${name}" penetrates a wall.`,
          hints: [
            "Move or resize it so it sits against the wall face, not through it — or anchor it with `against wall <id>`.",
          ],
        });
      }
    }
    return out;
  },
};
