/**
 * `elevator [id=] at (x,y) size WxH` — a lift shaft, drawn as the car rectangle with
 * the conventional crossed diagonals.
 *
 * No `dir`: a lift serves every storey it is drawn on, so there is nothing per-storey to
 * declare. Like `stair`, the same `id` on two `level` blocks declares one shaft — see
 * `src/vertical.ts` for the shared vertical-circulation semantics.
 */

import type { ElevatorNode, Point } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RElevator } from "../ir.js";
import { rectCorners } from "../geometry.js";
import { elevatorGlyph } from "./vertical-glyphs.js";

export const elevator: ElementDef = {
  kind: "elevator",
  keyword: "elevator",
  doc: "A lift shaft: the car rectangle with crossed diagonals.",
  params: [
    { name: "at", type: "point", doc: "Top-left corner (x, y) of the shaft, in mm." },
    { name: "size", type: "WxH", doc: "Car width × height in mm." },
  ],

  parse(ctx: ParseCtx): ElevatorNode {
    const kw = ctx.eatKeyword("elevator");
    const id = ctx.parseIdOpt();
    ctx.eatKeyword("at");
    const at = ctx.parsePoint();
    ctx.eatKeyword("size");
    const size = ctx.parseDimensions();
    return { kind: "elevator", id, at, size, line: kw.line };
  },

  idPrefix: () => "elevator",

  resolve(node, ctx: ResolveCtx): RElevator {
    const n = node as ElevatorNode;
    const id = ctx.id;
    const at = ctx.snapPt(ctx.evalPt(n.at));
    const size = { w: ctx.snap(ctx.eval(n.size.w)), h: ctx.snap(ctx.eval(n.size.h)) };
    if (size.w <= 0 || size.h <= 0) {
      ctx.diag({
        severity: "error",
        message: `Elevator "${id}" must have a positive size`,
        code: "E_VERT_SIZE",
        span: n.span,
      });
    }
    return { kind: "elevator", id, at, size, span: n.span };
  },

  bounds(resolved): Point[] {
    const e = resolved as RElevator;
    return rectCorners(e.at.x, e.at.y, e.size.w, e.size.h);
  },

  render(resolved, ctx: RenderCtx): SceneNode[] {
    return elevatorGlyph(resolved as RElevator, ctx.theme, ctx.sizes);
  },
};
