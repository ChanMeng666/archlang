/** `room [id=] at (x,y) size WxH [label "…"]` — floor fill + label + computed area. */

import type { Point, RoomNode } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RRoom } from "../ir.js";
import { rectCorners } from "../geometry.js";

export const room: ElementDef = {
  kind: "room",
  keyword: "room",
  doc: "A room: a filled rectangle with a centered label and computed area.",
  params: [
    { name: "at", type: "point", doc: "Top-left corner (x, y) in mm." },
    { name: "size", type: "WxH", doc: "Width × height in mm (e.g. 4000x3000)." },
    { name: "label", type: "string", optional: true, doc: "Room label (supports {interpolation})." },
  ],

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
      node.label = ctx.parseStringExpr();
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
    return { kind: "room", id, at, size, label: n.label !== undefined ? ctx.evalStr(n.label) : undefined, span: n.span };
  },

  bounds(resolved): Point[] {
    const r = resolved as RRoom;
    return rectCorners(r.at.x, r.at.y, r.size.w, r.size.h);
  },

  render(resolved, ctx: RenderCtx): SceneNode[] {
    const r = resolved as RRoom;
    const { theme, sizes } = ctx;
    const nodes: SceneNode[] = [];
    const c = rectCorners(r.at.x, r.at.y, r.size.w, r.size.h);
    nodes.push({ layer: "floor", prim: { t: "polygon", pts: c }, paint: { fill: theme.roomFill } });

    const cx = r.at.x + r.size.w / 2;
    const cy = r.at.y + r.size.h / 2;
    const areaM2 = ((r.size.w / 1000) * (r.size.h / 1000)).toFixed(1);
    if (r.label) {
      nodes.push({
        layer: "labels",
        prim: { t: "text", at: { x: cx, y: cy - sizes.roomFont * 0.2 }, value: r.label, size: sizes.roomFont, anchor: "middle", baseline: "central", weight: 600 },
        paint: { fill: theme.roomLabel },
      });
    }
    nodes.push({
      layer: "labels",
      prim: { t: "text", at: { x: cx, y: cy + (r.label ? sizes.roomFont * 0.9 : 0) }, value: `${areaM2} m²`, size: sizes.areaFont, anchor: "middle", baseline: "central" },
      paint: { fill: theme.areaLabel },
    });
    return nodes;
  },
};
