/**
 * `column [id=] at (x,y) size WxH` — a solid structural column.
 *
 * This module is the extensibility proof for the v0.3 registry: a brand-new
 * element type added as ONE file + one `register` line in `index.ts`, with no
 * edits to the parser, resolver, or renderer cores.
 */

import type { ColumnNode, Point } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RColumn } from "../ir.js";
import { rectCorners } from "../geometry.js";

export const column: ElementDef = {
  kind: "column",
  keyword: "column",
  doc: "A structural column: a small filled rectangle.",
  params: [
    { name: "at", type: "point", doc: "Center position (x, y) in mm." },
    { name: "size", type: "WxH", doc: "Width × height in mm." },
  ],

  parse(ctx: ParseCtx): ColumnNode {
    const kw = ctx.eatKeyword("column");
    const id = ctx.parseIdOpt();
    ctx.eatKeyword("at");
    const at = ctx.parsePoint();
    ctx.eatKeyword("size");
    const size = ctx.parseDimensions();
    return { kind: "column", id, at, size, line: kw.line };
  },

  idPrefix: () => "column",

  resolve(node, ctx: ResolveCtx): RColumn {
    const n = node as ColumnNode;
    const id = ctx.id;
    const at = ctx.snapPt(ctx.evalPt(n.at));
    const size = { w: ctx.snap(ctx.eval(n.size.w)), h: ctx.snap(ctx.eval(n.size.h)) };
    if (size.w <= 0 || size.h <= 0) {
      ctx.diag({ severity: "error", message: `Column "${id}" must have a positive size`, code: "E_COLUMN_SIZE", span: n.span });
    }
    return { kind: "column", id, at, size, span: n.span };
  },

  bounds(resolved): Point[] {
    const c = resolved as RColumn;
    return rectCorners(c.at.x, c.at.y, c.size.w, c.size.h);
  },

  render(resolved, ctx: RenderCtx): SceneNode[] {
    const c = resolved as RColumn;
    const { theme, sizes } = ctx;
    const pts = rectCorners(c.at.x, c.at.y, c.size.w, c.size.h);
    return [
      {
        layer: "furniture",
        // Columns share the furniture draw pass but belong on their own CAD layer.
        layerName: "A-COLS",
        prim: { t: "polygon", pts },
        paint: { fill: theme.column, stroke: theme.wallStroke, width: sizes.thin },
      },
    ];
  },
};
