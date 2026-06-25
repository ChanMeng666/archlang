/** `room [id=] at (x,y) size WxH [label "…"]` — floor fill + label + computed area. */

import type { Point, RoomNode } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, RenderOp, ResolveCtx } from "../registry.js";
import type { RRoom } from "../ir.js";
import { rectCorners } from "../geometry.js";

export const room: ElementDef = {
  kind: "room",
  keyword: "room",

  parse(ctx: ParseCtx): RoomNode {
    const kw = ctx.eatKeyword("room");
    const id = ctx.parseIdOpt();
    ctx.eatKeyword("at");
    const at = ctx.parsePoint();
    ctx.eatKeyword("size");
    const size = ctx.parseDimensions();
    const node: RoomNode = { kind: "room", id, at, size, line: kw.line };
    if (ctx.isKeyword("label")) {
      ctx.next();
      node.label = ctx.eatString();
    }
    return node;
  },

  idPrefix: () => "room",

  resolve(node, ctx: ResolveCtx): RRoom {
    const n = node as RoomNode;
    const id = ctx.id;
    const at = ctx.snapPt(ctx.evalPt(n.at));
    const size = { w: ctx.snap(ctx.eval(n.size.w)), h: ctx.snap(ctx.eval(n.size.h)) };
    if (size.w <= 0 || size.h <= 0) {
      ctx.diag({ severity: "error", message: `Room "${id}" must have a positive size`, code: "E_ROOM_SIZE", span: n.span });
    }
    return { kind: "room", id, at, size, label: n.label, span: n.span };
  },

  bounds(resolved): Point[] {
    const r = resolved as RRoom;
    return rectCorners(r.at.x, r.at.y, r.size.w, r.size.h);
  },

  render(resolved, ctx: RenderCtx): RenderOp[] {
    const r = resolved as RRoom;
    const { fmt, pt, xml, theme, sizes } = ctx;
    const ops: RenderOp[] = [];
    const c = rectCorners(r.at.x, r.at.y, r.size.w, r.size.h);
    ops.push({ pass: "floor", svg: `<polygon points="${c.map(pt).join(" ")}" fill="${theme.roomFill}"/>` });

    const cx = r.at.x + r.size.w / 2;
    const cy = r.at.y + r.size.h / 2;
    const areaM2 = ((r.size.w / 1000) * (r.size.h / 1000)).toFixed(1);
    if (r.label) {
      ops.push({
        pass: "labels",
        svg: `<text x="${fmt(cx)}" y="${fmt(cy - sizes.roomFont * 0.2)}" font-size="${fmt(sizes.roomFont)}" fill="${theme.roomLabel}" text-anchor="middle" dominant-baseline="central" font-weight="600">${xml(r.label)}</text>`,
      });
    }
    ops.push({
      pass: "labels",
      svg: `<text x="${fmt(cx)}" y="${fmt(cy + (r.label ? sizes.roomFont * 0.9 : 0))}" font-size="${fmt(sizes.areaFont)}" fill="${theme.areaLabel}" text-anchor="middle" dominant-baseline="central">${areaM2} m²</text>`,
    });
    return ops;
  },
};
