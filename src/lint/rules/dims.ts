/**
 * `W_DIM_INSIDE` — advisory: a hand-written dimension line lands inside the building.
 *
 * A `dim`'s line is drawn `offset` away along the LEFT normal of from→to, so the
 * ENDPOINT ORDER is what chooses which side it lands on — reversing a dim mirrors it
 * across the measured segment. The classic mistake is writing the two points in the
 * order they read on screen and getting the line pushed back INTO the plan, where it
 * crosses room labels, furniture and wall poché instead of reading in the page margin.
 *
 * The rule fires only when the whole dimension LINE (not its witness lines) falls
 * inside the room-extents bounding box, and only for dims that came from source — the
 * `dims auto` chains are synthesized at scene-build and never enter the IR, so a
 * wall-thickness call-out can never trip it. A hand-written zero-offset dim is skipped
 * too: it sits ON its measured segment by definition. Advisory, with a
 * machine-applicable fix that swaps the endpoints.
 */

import type { Diagnostic } from "../../diagnostics.js";
import { add, mul, normal, sub, unit } from "../../geometry.js";
import type { Point } from "../../ast.js";
import type { RDim } from "../../ir.js";
import { dimSwapFix, fixesFrom } from "../../fix-producers.js";
import type { LintContext, LintRule } from "../context.js";

/** Margin (mm) a point must clear the room-extents box by to count as "inside". */
const EPS = 1;

export const dimInside: LintRule = {
  name: "dim-inside",
  check(ctx: LintContext): Diagnostic[] {
    const dims = ctx.ir.elements.filter((e): e is RDim => e.kind === "dim");
    if (dims.length === 0 || ctx.roomRects.size === 0) return [];

    // Room extents (the building box a dimension should read outside of).
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of ctx.roomRects.values()) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    const inside = (p: Point): boolean => p.x > minX + EPS && p.x < maxX - EPS && p.y > minY + EPS && p.y < maxY - EPS;

    const out: Diagnostic[] = [];
    const seen = new Set<string>();
    for (const dm of dims) {
      if (!dm.span || dm.offset === 0) continue;
      // One warning per SOURCE statement: a dim inside a `for` loop resolves many
      // times over one span, and the fix would otherwise be offered N times.
      const key = `${dm.span.start}:${dm.span.end}`;
      if (seen.has(key)) continue;
      // The MIDPOINT of the offset line: a dimension legitimately runs corner to
      // corner, so its endpoints sit ON the box edges — where the line ended up
      // (which side the offset threw it) is what the midpoint answers.
      const off = mul(normal(unit(sub(dm.to, dm.from))), dm.offset);
      const mid = add({ x: (dm.from.x + dm.to.x) / 2, y: (dm.from.y + dm.to.y) / 2 }, off);
      if (!inside(mid)) continue;
      seen.add(key);
      out.push({
        severity: "warning",
        code: "W_DIM_INSIDE",
        span: dm.span,
        message: `Dimension "${dm.id}" draws its line inside the building — the \`offset ${dm.offset}\` pushes it into the plan, not out to the margin.`,
        hints: ["Swap the two endpoints (or negate the offset) so the dimension reads outside the building."],
        ...fixesFrom(dimSwapFix(dm)),
      });
    }
    return out;
  },
};
