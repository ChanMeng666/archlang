/**
 * Furniture placement rules: physical collisions (piece↔piece, piece↔wall),
 * frontal clearance, floating wall-fixtures, and `in <room>` drift. One rule per
 * export so each is individually testable; their relative order is fixed by
 * `rules/index.ts`.
 */

import {
  backCandidateEdges,
  backedEdgeList,
  backEdgeForRotate,
  frontClearanceRect,
  isAgainstWall,
  pointInRoomBox,
  rectOf,
  rotateForBackEdge,
  wallBackedEdges,
} from "../../analyze.js";
import type { Diagnostic } from "../../diagnostics.js";
import { rectsOverlap, wallIntrusionDepth } from "../../geometry/rect.js";
import { pointInPolygon } from "../../geometry/polygon.js";
import { fixesFrom, fixtureRotateFix } from "../../fix-producers.js";
import { defaultFootprint, frontClearanceMm, orientationMatters, requiresWall } from "../../fixtures-catalog.js";
import type { LintContext, LintRule } from "../context.js";
import { frontGapMm, mm, shortfall } from "../measure.js";

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
        if (rectsOverlap(rectOf(furniture[i]!), rectOf(furniture[j]!))) {
          const nameI = furniture[i]!.label ?? furniture[i]!.category;
          const nameJ = furniture[j]!.label ?? furniture[j]!.category;
          out.push({
            severity: "warning",
            code: "W_FURNITURE_OVERLAP",
            ...at(furniture[j]!.span),
            message: `Furniture "${nameJ}" overlaps "${nameI}".`,
            hints: ["Move or resize one piece so they don't intersect; leave a walkway between them."],
          });
        }
      }
    }
    return out;
  },
};

/**
 * A fixture's frontal activity clearance blocked by a *free-standing* piece of
 * furniture (a sofa parked in front of the stove). Conservative on purpose: it
 * ignores other plumbing/kitchen fixtures, so a compactly-packed bathroom or
 * kitchen run never trips it — only a movable object in the use-space does.
 *
 * The message states the catalogued clearance, the depth actually left, and the
 * shortfall. Every remedy stays a **hint**: moving or shrinking the obstruction is a
 * choice of geometry, and turning the fixture is not the bounded rewrite it looks
 * like — for a fixture whose facing means anything, the back-against-a-wall rule
 * already pins the front, so a rotation that frees the use-space either lifts its back
 * off the wall (trading this warning for `W_FIXTURE_BACK_TO_ROOM`) or lands in the
 * two-walls corner case that {@link fixtureBackToRoom} itself declines to guess at.
 */
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
          const gap = frontGapMm(rectOf(f), zone, rectOf(g), clear);
          const short = shortfall(clear, gap);
          out.push({
            severity: "warning",
            code: "W_FURN_CLEARANCE",
            ...at(f.span),
            message: `Fixture "${fn}" needs ${mm(clear)} mm of clear space in front but "${gn}" leaves ${mm(gap)} mm (${mm(short)} mm short).`,
            hints: [
              `Move "${gn}" ${mm(short)} mm further from the front of "${fn}".`,
              `Or shrink "${gn}" by ${mm(short)} mm on the axis facing "${fn}".`,
              `Or turn "${fn}" (\`rotate 0|90|180|270\`) so its front faces clear floor — its back must stay on a wall.`,
              `Or move "${fn}" to a wall run with ${mm(clear)} mm of free floor in front of it.`,
            ],
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

/**
 * A wall-requiring fixture that IS touching a wall but has its **back to the room**
 * — the WC whose cistern faces the space instead of the wall it stands on. Distinct
 * from `W_FIXTURE_FLOATING` (which is about a fixture touching no wall at all): here
 * the position is right and only the quarter-turn is wrong, so the fix is a `rotate`.
 *
 * It fires only for a category whose symbol has a distinguishable back
 * ({@link orientationMatters} — a shower tray is symmetric, so its facing means
 * nothing), and only when at least one other edge *is* walled. The
 * machine-applicable `rotate <n>` fix is attached only when the target is UNIQUE:
 * exactly one walled edge that the footprint's aspect also allows as a back
 * ({@link backCandidateEdges} — a 400×700 WC can only back onto a horizontal edge).
 * A corner with two valid walls, or a walled edge the shape rules out, leaves the
 * warning standing on its own for the author to resolve — lint never guesses between
 * alternatives (ADR 0005).
 */
export const fixtureBackToRoom: LintRule = {
  name: "fixture-back-to-room",
  check({ furniture, ir, rooms, rules, wallSegs, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    // A POLYGON room has no north/south/east/west sides, so "which edge is the back?"
    // has no answer there — the rule declines rather than derive a rotation from a
    // bounding box the room does not have (ADR 0005: no invisible architect).
    const polyRooms = rooms.filter((r) => r.poly).map((r) => r.poly!);
    for (const f of furniture) {
      if (!orientationMatters(f.category)) continue;
      const cx = f.at.x + f.size.w / 2;
      const cy = f.at.y + f.size.h / 2;
      if (polyRooms.some((ring) => pointInPolygon(cx, cy, ring))) continue;
      const backing = wallBackedEdges(rectOf(f), ir.walls, rules.fixtureWallTolMm, wallSegs);
      const back = backEdgeForRotate(f.rotate);
      if (backing[back] !== null) continue; // back is on a wall — correctly oriented
      const walled = backedEdgeList(backing);
      if (walled.length === 0) continue; // touches no wall at all — W_FIXTURE_FLOATING's business
      const name = f.label ?? f.category;
      const shape = backCandidateEdges(f.size, defaultFootprint(f.category));
      const targets = walled.filter((e) => shape.includes(e));
      const unique = targets.length === 1 ? rotateForBackEdge(targets[0]!) : null;
      out.push({
        severity: "warning",
        code: "W_FIXTURE_BACK_TO_ROOM",
        ...at(f.span),
        message: `Fixture "${name}" has its back to the room — the wall it stands against is on its ${walled.join("/")} side.`,
        hints: [
          unique !== null
            ? `Add \`rotate ${unique}\` so the symbol's back faces the wall (rotate 0 = back to the north).`
            : "Give it an explicit `rotate` for the wall you mean it to back onto, or place it with `against wall <id>` / `in <room> anchor <edge>` and let the rotation be derived.",
        ],
        ...(unique !== null ? fixesFrom(fixtureRotateFix(f, unique)) : {}),
      });
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
      if (!pointInRoomBox({ x: cx, y: cy }, rect)) {
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
