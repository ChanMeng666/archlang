/** `door [id=] at (x,y) width N [wall ref] [hinge l|r] [swing in|out]` — opening + leaf + swing arc. */

import type { DoorNode, Point } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RDoor } from "../ir.js";
import type { Value } from "../expr.js";
import { add, mul, normal, sub, unit } from "../geometry.js";

/** Read an enum override from the active `set` defaults, if valid. */
function enumDefault<T extends string>(defaults: ReadonlyMap<string, Value> | undefined, key: string, allowed: readonly T[]): T | undefined {
  const v = defaults?.get(key);
  return v && v.t === "str" && (allowed as readonly string[]).includes(v.v) ? (v.v as T) : undefined;
}

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
    const node: DoorNode = { kind: "door", id, at, width, line: kw.line };
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
    // Precedence: explicit attribute > `set door(...)` default > hard default.
    const hinge = n.hinge ?? enumDefault(ctx.defaults, "hinge", ["left", "right"] as const) ?? "left";
    const swing = n.swing ?? enumDefault(ctx.defaults, "swing", ["in", "out"] as const) ?? "in";
    return { kind: "door", id, at, width, hinge, swing, host: ctx.hostSegment(at, n.wall), span: n.span };
  },

  bounds: () => [],

  /**
   * Opening cover + leaf line + swing arc. The swing geometry (hinge, leaf,
   * far jamb, minor-arc orientation) is computed **here, once** — every backend
   * (SVG, DXF, PDF) now serializes the same `arc` primitive rather than
   * re-deriving it.
   */
  render(resolved, ctx: RenderCtx): SceneNode[] {
    const dr = resolved as RDoor;
    const seg = dr.host;
    if (!seg) return [];
    const { theme, sizes } = ctx;
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
    const nodes: SceneNode[] = [];
    nodes.push({ layer: "doors", prim: { t: "polygon", pts: cover }, paint: { fill: theme.opening } });
    const hinge = dr.hinge === "left" ? add(dr.at, mul(d, -hw)) : add(dr.at, mul(d, hw));
    const farJamb = dr.hinge === "left" ? add(dr.at, mul(d, hw)) : add(dr.at, mul(d, -hw));
    const leafDir = dr.swing === "in" ? n : mul(n, -1);
    const leafEnd = add(hinge, mul(leafDir, dr.width));
    const cross = (leafEnd.x - hinge.x) * (farJamb.y - hinge.y) - (leafEnd.y - hinge.y) * (farJamb.x - hinge.x);
    const sweep: 0 | 1 = cross < 0 ? 1 : 0;
    nodes.push({
      layer: "doors",
      prim: { t: "line", a: hinge, b: leafEnd },
      paint: { stroke: theme.doorLeaf, width: sizes.thin * 1.3 },
    });
    nodes.push({
      layer: "doors",
      prim: { t: "arc", center: hinge, r: dr.width, start: leafEnd, end: farJamb, sweep },
      paint: { fill: "none", stroke: theme.doorLeaf, width: sizes.thin, dash: [sizes.thin * 4, sizes.thin * 3] },
    });
    return nodes;
  },
};
