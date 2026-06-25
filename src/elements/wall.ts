/** `wall <category> thickness N { (x,y)… [close] }` — poché fill + crisp faces. */

import type { ExprPoint, Point, WallNode } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, RenderOp, ResolveCtx } from "../registry.js";
import type { RWall } from "../ir.js";
import { add, mul, normal, segmentRectangle, segmentsOfWall, sub, unit } from "../geometry.js";

export const wall: ElementDef = {
  kind: "wall",
  keyword: "wall",

  parse(ctx: ParseCtx): WallNode {
    const kw = ctx.eatKeyword("wall");
    const id = ctx.parseIdOpt();
    const category = ctx.eatIdent().value;
    ctx.eatKeyword("thickness");
    const thickness = ctx.parseExpr();
    ctx.eat("lcurly");
    const points: ExprPoint[] = [];
    let closed = false;
    while (!ctx.isType("rcurly") && !ctx.isType("eof")) {
      if (ctx.isKeyword("close")) {
        ctx.next();
        closed = true;
        break;
      }
      if (ctx.isType("lparen")) {
        points.push(ctx.parsePoint());
        continue;
      }
      ctx.fail(`Expected a point "(x,y)" or "close" in wall body but found ${describe(ctx)}`);
    }
    ctx.eat("rcurly");
    if (points.length < 2) ctx.fail("A wall needs at least two points", kw);
    return { kind: "wall", id, category, thickness, points, closed, line: kw.line };
  },

  idPrefix: (node) => (node as WallNode).category || "wall",

  resolve(node, ctx: ResolveCtx): RWall {
    const n = node as WallNode;
    const id = ctx.idOf(n);
    const points = n.points.map((p) => ctx.snapPt(ctx.evalPt(p)));
    const tv = ctx.eval(n.thickness);
    const thickness = ctx.snap(tv) || tv;
    if (thickness <= 0) {
      ctx.diag({ severity: "error", message: `Wall "${id}" must have a positive thickness`, code: "E_WALL_THICKNESS", span: n.span });
    }
    return { kind: "wall", id, category: n.category, thickness, points, closed: n.closed, span: n.span };
  },

  bounds(resolved): Point[] {
    const w = resolved as RWall;
    return segmentsOfWall(w).flatMap((s) => segmentRectangle(s.a, s.b, s.thickness));
  },

  render(resolved, ctx: RenderCtx): RenderOp[] {
    const w = resolved as RWall;
    const { fmt, pt, theme, sizes } = ctx;
    const segs = segmentsOfWall(w);
    const ops: RenderOp[] = [];
    for (const s of segs) {
      const poly = segmentRectangle(s.a, s.b, s.thickness);
      ops.push({ pass: "wallFill", svg: `<polygon points="${poly.map(pt).join(" ")}" fill="url(#poche)"/>` });
    }
    for (const s of segs) {
      const d = unit(sub(s.b, s.a));
      const n = normal(d);
      const h = s.thickness / 2;
      const fa1 = add(s.a, mul(n, h));
      const fb1 = add(s.b, mul(n, h));
      const fa2 = add(s.a, mul(n, -h));
      const fb2 = add(s.b, mul(n, -h));
      ops.push({
        pass: "wallFace",
        svg: `<line x1="${fmt(fa1.x)}" y1="${fmt(fa1.y)}" x2="${fmt(fb1.x)}" y2="${fmt(fb1.y)}" stroke="${theme.wallStroke}" stroke-width="${fmt(sizes.wallStroke)}" stroke-linecap="square"/>`,
      });
      ops.push({
        pass: "wallFace",
        svg: `<line x1="${fmt(fa2.x)}" y1="${fmt(fa2.y)}" x2="${fmt(fb2.x)}" y2="${fmt(fb2.y)}" stroke="${theme.wallStroke}" stroke-width="${fmt(sizes.wallStroke)}" stroke-linecap="square"/>`,
      });
    }
    return ops;
  },
};

function describe(ctx: ParseCtx): string {
  const t = ctx.peek();
  if (t.type === "eof") return "end of input";
  if (t.type === "string") return `string ${JSON.stringify(t.value)}`;
  return `"${t.value}"`;
}
