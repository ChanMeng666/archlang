/** `furniture <category> [id=] at (x,y) size WxH [label "…"]` — outlined fill + label. */

import type { FurnitureNode, Point } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
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

  render(resolved, ctx: RenderCtx): SceneNode[] {
    const f = resolved as RFurniture;
    const { theme, sizes } = ctx;
    const nodes: SceneNode[] = [];
    const c = rectCorners(f.at.x, f.at.y, f.size.w, f.size.h);
    nodes.push({
      layer: "furniture",
      prim: { t: "polygon", pts: c },
      paint: { fill: theme.furnitureFill, stroke: theme.furnitureStroke, width: sizes.thin },
    });
    if (f.label) {
      const cx = f.at.x + f.size.w / 2;
      const cy = f.at.y + f.size.h / 2;
      nodes.push({
        layer: "furniture",
        prim: { t: "text", at: { x: cx, y: cy }, value: f.label, size: sizes.furnFont, anchor: "middle", baseline: "central" },
        paint: { fill: theme.furnitureLabel },
      });
    }
    return nodes;
  },
};
