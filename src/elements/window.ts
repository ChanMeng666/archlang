/** `window [id=] at (x,y) width N [wall ref]` — opening + glazing panes. */

import type { Point, WindowNode } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, RenderOp, ResolveCtx } from "../registry.js";
import type { RWindow } from "../ir.js";
import { add, mul, normal, sub, unit } from "../geometry.js";

export const windowEl: ElementDef = {
  kind: "window",
  keyword: "window",

  parse(ctx: ParseCtx): WindowNode {
    const kw = ctx.eatKeyword("window");
    const id = ctx.parseIdOpt();
    ctx.eatKeyword("at");
    const at = ctx.parsePoint();
    ctx.eatKeyword("width");
    const width = ctx.parseExpr();
    const node: WindowNode = { kind: "window", id, at, width, line: kw.line };
    if (ctx.isKeyword("wall")) {
      ctx.next();
      node.wall = ctx.eatIdent().value;
    }
    return node;
  },

  idPrefix: () => "window",

  resolve(node, ctx: ResolveCtx): RWindow {
    const n = node as WindowNode;
    const id = ctx.id;
    const at = ctx.snapPt(ctx.evalPt(n.at));
    const wv = ctx.eval(n.width);
    const width = ctx.snap(wv) || wv;
    if (width <= 0) {
      ctx.diag({ severity: "error", message: `Window "${id}" must have a positive width`, code: "E_WINDOW_WIDTH", span: n.span });
    }
    if (ctx.walls.length > 0 && !ctx.isOnWall(at, n.wall)) {
      ctx.diag({ severity: "warning", message: `Window "${id}" does not lie on any wall`, code: "W_WINDOW_OFF_WALL", span: n.span });
    }
    return { kind: "window", id, at, width, host: ctx.hostSegment(at, n.wall), span: n.span };
  },

  bounds: () => [],

  render(resolved, ctx: RenderCtx): RenderOp[] {
    const wn = resolved as RWindow;
    const seg = wn.host;
    if (!seg) return [];
    const { fmt, pt, theme, sizes } = ctx;
    const d = unit(sub(seg.b, seg.a));
    const n = normal(d);
    const h = seg.thickness / 2;
    const he = h + sizes.wallStroke;
    const hw = wn.width / 2;
    const cover: Point[] = [
      add(add(wn.at, mul(d, -hw)), mul(n, he)),
      add(add(wn.at, mul(d, hw)), mul(n, he)),
      add(add(wn.at, mul(d, hw)), mul(n, -he)),
      add(add(wn.at, mul(d, -hw)), mul(n, -he)),
    ];
    const ops: RenderOp[] = [];
    ops.push({ pass: "windows", svg: `<polygon points="${cover.map(pt).join(" ")}" fill="${theme.opening}"/>` });
    const jA = add(wn.at, mul(d, -hw));
    const jB = add(wn.at, mul(d, hw));
    for (const off of [h, -h]) {
      const a = add(jA, mul(n, off));
      const bb = add(jB, mul(n, off));
      ops.push({
        pass: "windows",
        svg: `<line x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(bb.x)}" y2="${fmt(bb.y)}" stroke="${theme.wallStroke}" stroke-width="${fmt(sizes.thin)}"/>`,
      });
    }
    ops.push({
      pass: "windows",
      svg: `<line x1="${fmt(jA.x)}" y1="${fmt(jA.y)}" x2="${fmt(jB.x)}" y2="${fmt(jB.y)}" stroke="${theme.windowPane}" stroke-width="${fmt(sizes.thin)}"/>`,
    });
    return ops;
  },
};
