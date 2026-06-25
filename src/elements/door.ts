/** `door [id=] at (x,y) width N [wall ref] [hinge l|r] [swing in|out]` — opening + leaf + swing arc. */

import type { DoorNode, Point } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, RenderOp, ResolveCtx } from "../registry.js";
import type { RDoor } from "../ir.js";
import { add, mul, normal, sub, unit } from "../geometry.js";

export const door: ElementDef = {
  kind: "door",
  keyword: "door",

  parse(ctx: ParseCtx): DoorNode {
    const kw = ctx.eatKeyword("door");
    const id = ctx.parseIdOpt();
    ctx.eatKeyword("at");
    const at = ctx.parsePoint();
    ctx.eatKeyword("width");
    const width = ctx.parseExpr();
    const node: DoorNode = { kind: "door", id, at, width, hinge: "left", swing: "in", line: kw.line };
    if (ctx.isKeyword("wall")) {
      ctx.next();
      node.wall = ctx.eatIdent().value;
    }
    if (ctx.isKeyword("hinge")) {
      ctx.next();
      const h = ctx.eatIdent().value;
      if (h !== "left" && h !== "right") ctx.fail(`Expected hinge "left" or "right" but found "${h}"`);
      node.hinge = h;
    }
    if (ctx.isKeyword("swing")) {
      ctx.next();
      const s = ctx.eatIdent().value;
      if (s !== "in" && s !== "out") ctx.fail(`Expected swing "in" or "out" but found "${s}"`);
      node.swing = s;
    }
    return node;
  },

  idPrefix: () => "door",

  resolve(node, ctx: ResolveCtx): RDoor {
    const n = node as DoorNode;
    const id = ctx.id;
    const at = ctx.snapPt(ctx.evalPt(n.at));
    const wv = ctx.eval(n.width);
    const width = ctx.snap(wv) || wv;
    if (width <= 0) {
      ctx.diag({ severity: "error", message: `Door "${id}" must have a positive width`, code: "E_DOOR_WIDTH", span: n.span });
    }
    if (ctx.walls.length > 0 && !ctx.isOnWall(at, n.wall)) {
      ctx.diag({ severity: "warning", message: `Door "${id}" does not lie on any wall`, code: "W_DOOR_OFF_WALL", span: n.span });
    }
    return { kind: "door", id, at, width, hinge: n.hinge, swing: n.swing, host: ctx.hostSegment(at, n.wall), span: n.span };
  },

  bounds: () => [],

  render(resolved, ctx: RenderCtx): RenderOp[] {
    const dr = resolved as RDoor;
    const seg = dr.host;
    if (!seg) return [];
    const { fmt, pt, theme, sizes } = ctx;
    const d = unit(sub(seg.b, seg.a));
    const n = normal(d);
    const h = seg.thickness / 2 + sizes.wallStroke;
    const hw = dr.width / 2;
    const cover: Point[] = [
      add(add(dr.at, mul(d, -hw)), mul(n, h)),
      add(add(dr.at, mul(d, hw)), mul(n, h)),
      add(add(dr.at, mul(d, hw)), mul(n, -h)),
      add(add(dr.at, mul(d, -hw)), mul(n, -h)),
    ];
    const ops: RenderOp[] = [];
    ops.push({ pass: "doors", svg: `<polygon points="${cover.map(pt).join(" ")}" fill="${theme.opening}"/>` });
    const hinge = dr.hinge === "left" ? add(dr.at, mul(d, -hw)) : add(dr.at, mul(d, hw));
    const farJamb = dr.hinge === "left" ? add(dr.at, mul(d, hw)) : add(dr.at, mul(d, -hw));
    const leafDir = dr.swing === "in" ? n : mul(n, -1);
    const leafEnd = add(hinge, mul(leafDir, dr.width));
    const cross = (leafEnd.x - hinge.x) * (farJamb.y - hinge.y) - (leafEnd.y - hinge.y) * (farJamb.x - hinge.x);
    const sweep = cross < 0 ? 1 : 0;
    ops.push({
      pass: "doors",
      svg: `<line x1="${fmt(hinge.x)}" y1="${fmt(hinge.y)}" x2="${fmt(leafEnd.x)}" y2="${fmt(leafEnd.y)}" stroke="${theme.doorLeaf}" stroke-width="${fmt(sizes.thin * 1.3)}"/>`,
    });
    ops.push({
      pass: "doors",
      svg: `<path d="M ${pt(leafEnd)} A ${fmt(dr.width)} ${fmt(dr.width)} 0 0 ${sweep} ${pt(farJamb)}" fill="none" stroke="${theme.doorLeaf}" stroke-width="${fmt(sizes.thin)}" stroke-dasharray="${fmt(sizes.thin * 4)} ${fmt(sizes.thin * 3)}"/>`,
    });
    return ops;
  },
};
