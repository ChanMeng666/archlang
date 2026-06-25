/** `dim (x,y)->(x,y) [offset N] [text "…"]` — dimension line with ticks + length. */

import type { DimNode } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, RenderOp, ResolveCtx } from "../registry.js";
import type { RDim } from "../ir.js";
import { add, length, mul, normal, sub, unit } from "../geometry.js";

export const dim: ElementDef = {
  kind: "dim",
  keyword: "dim",

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
      node.text = ctx.eatString();
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
      text: n.text,
      span: n.span,
    };
  },

  bounds(resolved) {
    const dm = resolved as RDim;
    return [dm.from, dm.to];
  },

  render(resolved, ctx: RenderCtx): RenderOp[] {
    const dm = resolved as RDim;
    const { fmt, xml, theme, sizes } = ctx;
    const dir = unit(sub(dm.to, dm.from));
    const n = normal(dir);
    const off = mul(n, dm.offset);
    const p1 = add(dm.from, off);
    const p2 = add(dm.to, off);
    const tick = sizes.refDim * 0.012;
    const ops: RenderOp[] = [];
    ops.push({
      pass: "dims",
      svg: `<line x1="${fmt(dm.from.x)}" y1="${fmt(dm.from.y)}" x2="${fmt(p1.x)}" y2="${fmt(p1.y)}" stroke="${theme.dim}" stroke-width="${fmt(sizes.thin * 0.7)}"/>`,
    });
    ops.push({
      pass: "dims",
      svg: `<line x1="${fmt(dm.to.x)}" y1="${fmt(dm.to.y)}" x2="${fmt(p2.x)}" y2="${fmt(p2.y)}" stroke="${theme.dim}" stroke-width="${fmt(sizes.thin * 0.7)}"/>`,
    });
    ops.push({
      pass: "dims",
      svg: `<line x1="${fmt(p1.x)}" y1="${fmt(p1.y)}" x2="${fmt(p2.x)}" y2="${fmt(p2.y)}" stroke="${theme.dim}" stroke-width="${fmt(sizes.thin)}"/>`,
    });
    for (const p of [p1, p2]) {
      const t1 = add(p, mul(unit({ x: dir.x + n.x, y: dir.y + n.y }), tick));
      const t2 = add(p, mul(unit({ x: dir.x + n.x, y: dir.y + n.y }), -tick));
      ops.push({
        pass: "dims",
        svg: `<line x1="${fmt(t1.x)}" y1="${fmt(t1.y)}" x2="${fmt(t2.x)}" y2="${fmt(t2.y)}" stroke="${theme.dim}" stroke-width="${fmt(sizes.thin)}"/>`,
      });
    }
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const tp = add(mid, mul(n, sizes.dimFont * 0.7));
    let angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    const label = dm.text ?? String(Math.round(length(sub(dm.to, dm.from))));
    ops.push({
      pass: "dims",
      svg: `<text x="${fmt(tp.x)}" y="${fmt(tp.y)}" font-size="${fmt(sizes.dimFont)}" fill="${theme.dim}" text-anchor="middle" dominant-baseline="central" transform="rotate(${fmt(angle)} ${fmt(tp.x)} ${fmt(tp.y)})">${xml(label)}</text>`,
    });
    return ops;
  },
};
