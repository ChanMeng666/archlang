/** `furniture <category> [id=] at (x,y) size WxH [label "…"]` — outlined fill + label. */

import type { FurnitureNode, Point } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, RenderOp, ResolveCtx } from "../registry.js";
import type { RFurniture } from "../ir.js";
import { rectCorners } from "../geometry.js";

export const furniture: ElementDef = {
  kind: "furniture",
  keyword: "furniture",

  parse(ctx: ParseCtx): FurnitureNode {
    const kw = ctx.eatKeyword("furniture");
    const id = ctx.parseIdOpt();
    const category = ctx.eatIdent().value;
    ctx.eatKeyword("at");
    const at = ctx.parsePoint();
    ctx.eatKeyword("size");
    const size = ctx.parseDimensions();
    const node: FurnitureNode = { kind: "furniture", id, category, at, size, line: kw.line };
    if (ctx.isKeyword("label")) {
      ctx.next();
      node.label = ctx.eatString();
    }
    return node;
  },

  idPrefix: (node) => (node as FurnitureNode).category || "furniture",

  resolve(node, ctx: ResolveCtx): RFurniture {
    const n = node as FurnitureNode;
    const id = ctx.id;
    const at = ctx.snapPt(ctx.evalPt(n.at));
    const size = { w: ctx.snap(ctx.eval(n.size.w)), h: ctx.snap(ctx.eval(n.size.h)) };
    if (size.w <= 0 || size.h <= 0) {
      ctx.diag({ severity: "error", message: `Furniture "${id}" must have a positive size`, code: "E_FURN_SIZE", span: n.span });
    }
    return { kind: "furniture", id, category: n.category, at, size, label: n.label, span: n.span };
  },

  bounds(resolved): Point[] {
    const f = resolved as RFurniture;
    return rectCorners(f.at.x, f.at.y, f.size.w, f.size.h);
  },

  render(resolved, ctx: RenderCtx): RenderOp[] {
    const f = resolved as RFurniture;
    const { fmt, pt, xml, theme, sizes } = ctx;
    const ops: RenderOp[] = [];
    const c = rectCorners(f.at.x, f.at.y, f.size.w, f.size.h);
    ops.push({
      pass: "furniture",
      svg: `<polygon points="${c.map(pt).join(" ")}" fill="${theme.furnitureFill}" stroke="${theme.furnitureStroke}" stroke-width="${fmt(sizes.thin)}"/>`,
    });
    if (f.label) {
      const cx = f.at.x + f.size.w / 2;
      const cy = f.at.y + f.size.h / 2;
      ops.push({
        pass: "furniture",
        svg: `<text x="${fmt(cx)}" y="${fmt(cy)}" font-size="${fmt(sizes.furnFont)}" fill="${theme.furnitureLabel}" text-anchor="middle" dominant-baseline="central">${xml(f.label)}</text>`,
      });
    }
    return ops;
  },
};
