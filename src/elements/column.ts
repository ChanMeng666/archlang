/**
 * `column [id=] at (x,y) size WxH` — a solid structural column.
 *
 * This module is the extensibility proof for the v0.3 registry: a brand-new
 * element type added as ONE file + one `register` line in `index.ts`, with no
 * edits to the parser, resolver, or renderer cores.
 */

import type { ColumnNode, Point } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, RenderOp, ResolveCtx } from "../registry.js";
import type { RColumn } from "../ir.js";
import { rectCorners } from "../geometry.js";

export const column: ElementDef = {
  kind: "column",
  keyword: "column",

  parse(ctx: ParseCtx): ColumnNode {
    const kw = ctx.eatKeyword("column");
    const id = ctx.parseIdOpt();
    ctx.eatKeyword("at");
    const at = ctx.parsePoint();
    ctx.eatKeyword("size");
    const dim = ctx.eat("dimension");
    return { kind: "column", id, at, size: { w: dim.num!, h: dim.num2! }, line: kw.line };
  },

  idPrefix: () => "column",

  resolve(node, ctx: ResolveCtx): RColumn {
    const n = node as ColumnNode;
    const id = ctx.idOf(n);
    const at = ctx.snapPt(n.at);
    const size = { w: ctx.snap(n.size.w), h: ctx.snap(n.size.h) };
    if (size.w <= 0 || size.h <= 0) {
      ctx.diag({ severity: "error", message: `Column "${id}" must have a positive size`, code: "E_COLUMN_SIZE", span: n.span });
    }
    return { kind: "column", id, at, size, span: n.span };
  },

  bounds(resolved): Point[] {
    const c = resolved as RColumn;
    return rectCorners(c.at.x, c.at.y, c.size.w, c.size.h);
  },

  render(resolved, ctx: RenderCtx): RenderOp[] {
    const c = resolved as RColumn;
    const { fmt, pt, theme, sizes } = ctx;
    const pts = rectCorners(c.at.x, c.at.y, c.size.w, c.size.h);
    return [
      {
        pass: "furniture",
        svg: `<polygon points="${pts.map(pt).join(" ")}" fill="${theme.column}" stroke="${theme.wallStroke}" stroke-width="${fmt(sizes.thin)}"/>`,
      },
    ];
  },
};
