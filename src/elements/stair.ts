/**
 * `stair [id=] at (x,y) size WxH dir up|down [width <mm>]` — a straight flight of
 * stairs drawn as the conventional plan symbol.
 *
 * A stair is vertical circulation, so it is more than a drawing: the same `id` on two
 * `level` blocks declares one shaft, which is what lets `describe()` report a `vertical`
 * connection and lets an upper storey be reachable without its own front door. All of
 * that shared meaning lives in `src/vertical.ts`; this module owns only the grammar, the
 * resolve rules and the dispatch to the symbol in `vertical-glyphs.ts`.
 */

import type { Point, StairNode, VerticalDir } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RStair } from "../ir.js";
import { rectCorners } from "../geometry.js";
import { flightAxis } from "../vertical.js";
import { stairGlyph } from "./vertical-glyphs.js";

/** Parse the mandatory `dir up|down` clause shared by `stair` and `escalator`. */
export function parseVerticalDir(ctx: ParseCtx, keyword: string): VerticalDir {
  ctx.eatKeyword("dir");
  const t = ctx.eatIdent();
  if (t.value !== "up" && t.value !== "down")
    ctx.fail(`Expected \`dir up\` or \`dir down\` after \`${keyword}\` but found "${t.value}"`, t);
  return t.value as VerticalDir;
}

export const stair: ElementDef = {
  kind: "stair",
  keyword: "stair",
  doc: "A straight flight of stairs: treads, a break line and an UP/DN direction arrow.",
  params: [
    { name: "at", type: "point", doc: "Top-left corner (x, y) of the footprint, in mm." },
    { name: "size", type: "WxH", doc: "Footprint width × height in mm; the flight runs along the LONG axis." },
    { name: "dir", type: "up|down", doc: "Which way this flight goes from THIS storey — draws UP or DN." },
    {
      name: "width",
      type: "number",
      optional: true,
      default: "the footprint's cross-axis extent",
      doc: "Flight width across the run, in mm; may not exceed the footprint.",
    },
  ],

  parse(ctx: ParseCtx): StairNode {
    const kw = ctx.eatKeyword("stair");
    const id = ctx.parseIdOpt();
    ctx.eatKeyword("at");
    const at = ctx.parsePoint();
    ctx.eatKeyword("size");
    const size = ctx.parseDimensions();
    const dir = parseVerticalDir(ctx, "stair");
    const node: StairNode = { kind: "stair", id, at, size, dir, line: kw.line };
    if (ctx.isKeyword("width")) {
      ctx.next();
      node.width = ctx.parseExpr();
    }
    return node;
  },

  idPrefix: () => "stair",

  resolve(node, ctx: ResolveCtx): RStair {
    const n = node as StairNode;
    const id = ctx.id;
    const at = ctx.snapPt(ctx.evalPt(n.at));
    const size = { w: ctx.snap(ctx.eval(n.size.w)), h: ctx.snap(ctx.eval(n.size.h)) };
    if (size.w <= 0 || size.h <= 0) {
      ctx.diag({
        severity: "error",
        message: `Stair "${id}" must have a positive size`,
        code: "E_VERT_SIZE",
        span: n.span,
      });
    }
    // The flight runs along the long axis, so its width is measured across the short one.
    const cross = flightAxis(size) === "y" ? size.w : size.h;
    let width = cross;
    if (n.width !== undefined) {
      width = ctx.snap(ctx.eval(n.width));
      if (width <= 0 || width > cross) {
        ctx.diag({
          severity: "error",
          message: `Stair "${id}" flight \`width\` must be between 0 and the footprint's cross extent (${cross} mm)`,
          code: "E_STAIR_WIDTH",
          span: n.span,
        });
        width = cross;
      }
    }
    return { kind: "stair", id, at, size, dir: n.dir, width, span: n.span };
  },

  bounds(resolved): Point[] {
    const s = resolved as RStair;
    return rectCorners(s.at.x, s.at.y, s.size.w, s.size.h);
  },

  render(resolved, ctx: RenderCtx): SceneNode[] {
    return stairGlyph(resolved as RStair, ctx.theme, ctx.sizes);
  },
};
