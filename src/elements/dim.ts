/** `dim (x,y)->(x,y) [offset N] [text "…"]` — dimension line with ticks + length. */

import type { DimNode } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RDim } from "../ir.js";
import { add, length, mul, normal, sub, unit } from "../geometry.js";

export const dim: ElementDef = {
  kind: "dim",
  keyword: "dim",
  doc: "A dimension: a measured line with ticks; text defaults to the length.",
  params: [
    { name: "from", type: "point", doc: "Start point (x, y); written before ->." },
    { name: "to", type: "point", doc: "End point (x, y); written after ->." },
    { name: "offset", type: "number", optional: true, default: "300", doc: "Perpendicular offset of the dimension line, mm." },
    { name: "text", type: "string", optional: true, doc: "Override text; defaults to the measured length." },
  ],

  parse(ctx: ParseCtx): DimNode {
    const kw = ctx.eatKeyword("dim");
    const from = ctx.parsePoint();
    ctx.eat("arrow");
    const to = ctx.parsePoint();
    const node: DimNode = { kind: "dim", id: "", from, to, offset: { t: "num", value: 300 }, line: kw.line };
    if (ctx.isKeyword("offset")) {
      ctx.next();
      node.offset = ctx.parseExpr();
    }
    if (ctx.isKeyword("text")) {
      ctx.next();
      node.text = ctx.parseStringExpr();
    }
    return node;
  },

  idPrefix: () => "dim",

  resolve(node, ctx: ResolveCtx): RDim {
    const n = node as DimNode;
    return {
      kind: "dim",
      id: ctx.id,
      from: ctx.snapPt(ctx.evalPt(n.from)),
      to: ctx.snapPt(ctx.evalPt(n.to)),
      offset: ctx.eval(n.offset),
      text: n.text !== undefined ? ctx.evalStr(n.text) : undefined,
      span: n.span,
    };
  },

  bounds(resolved) {
    const dm = resolved as RDim;
    return [dm.from, dm.to];
  },

  render(resolved, ctx: RenderCtx): SceneNode[] {
    const dm = resolved as RDim;
    const { theme, sizes, fmt } = ctx;
    const dir = unit(sub(dm.to, dm.from));
    const n = normal(dir);
    const off = mul(n, dm.offset);
    const p1 = add(dm.from, off);
    const p2 = add(dm.to, off);
    const tick = sizes.refDim * 0.012;
    const thinPaint = { stroke: theme.dim, width: sizes.thin };
    const nodes: SceneNode[] = [];
    // Extension lines (lighter), then the dimension line.
    nodes.push({ layer: "dims", prim: { t: "line", a: dm.from, b: p1 }, paint: { stroke: theme.dim, width: sizes.thin * 0.7 } });
    nodes.push({ layer: "dims", prim: { t: "line", a: dm.to, b: p2 }, paint: { stroke: theme.dim, width: sizes.thin * 0.7 } });
    nodes.push({ layer: "dims", prim: { t: "line", a: p1, b: p2 }, paint: thinPaint });
    for (const p of [p1, p2]) {
      const t1 = add(p, mul(unit({ x: dir.x + n.x, y: dir.y + n.y }), tick));
      const t2 = add(p, mul(unit({ x: dir.x + n.x, y: dir.y + n.y }), -tick));
      nodes.push({ layer: "dims", prim: { t: "line", a: t1, b: t2 }, paint: thinPaint });
    }
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const tp = add(mid, mul(n, sizes.dimFont * 0.7));
    let angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    // No explicit text → the measured length |to−from|, formatted once via the
    // shared mm formatter so SVG and DXF show the same value (T3.6).
    const label = dm.text ?? fmt(length(sub(dm.to, dm.from)));
    nodes.push({
      layer: "dims",
      prim: { t: "text", at: tp, value: label, size: sizes.dimFont, anchor: "middle", baseline: "central", rotate: angle },
      paint: { fill: theme.dim },
    });
    return nodes;
  },
};
