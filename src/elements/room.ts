/** `room [id=] (at (x,y) | DIR ref [align E] [gap n]) size WxH [label "…"]`
 *  — floor fill + label + computed area. The absolute `at` path is the default;
 *  the relational clause is resolved to absolute coords in `placeRelational`. */

import type { Point, RelAlign, RelDir, RoomNode } from "../ast.js";
import type { Expr } from "../expr.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RRoom } from "../ir.js";
import { rectCorners } from "../geometry.js";

const REL_DIRS: ReadonlySet<string> = new Set<RelDir>(["right-of", "left-of", "below", "above"]);

export const room: ElementDef = {
  kind: "room",
  keyword: "room",
  doc: "A room: a filled rectangle with a centered label and computed area.",
  params: [
    { name: "at", type: "point", optional: true, doc: "Absolute top-left corner (x, y) in mm." },
    { name: "right-of|left-of|below|above", type: "ref", optional: true, doc: "Place relative to another room by id (instead of `at`)." },
    { name: "align", type: "top|middle|bottom|left|center|right", optional: true, doc: "Edge to align with the reference room." },
    { name: "gap", type: "number", optional: true, default: "0", doc: "Spacing (mm) from the reference room along the placement axis." },
    { name: "size", type: "WxH", doc: "Width × height in mm (e.g. 4000x3000)." },
    { name: "label", type: "string", optional: true, doc: "Room label (supports {interpolation})." },
  ],

  parse(ctx: ParseCtx): RoomNode {
    const kw = ctx.eatKeyword("room");
    const id = ctx.parseIdOpt();
    let at: RoomNode["at"];
    let rel: RoomNode["rel"];
    if (ctx.isKeyword("at")) {
      ctx.eatKeyword("at");
      at = ctx.parsePoint();
    } else {
      // Relational clause: DIR REF [align EDGE] [gap EXPR].
      const dirTok = ctx.next();
      if (!REL_DIRS.has(dirTok.value)) {
        ctx.fail(`Expected "at" or a relational direction (right-of|left-of|below|above) but found "${dirTok.value}"`, dirTok);
      }
      const ref = ctx.eatIdent().value;
      let align: RelAlign | undefined;
      let gap: Expr | undefined;
      if (ctx.isKeyword("align")) {
        ctx.next();
        align = ctx.eatIdent().value as RelAlign;
      }
      if (ctx.isKeyword("gap")) {
        ctx.next();
        gap = ctx.parseExpr();
      }
      rel = { dir: dirTok.value as RelDir, ref, align, gap };
    }
    ctx.eatKeyword("size");
    const size = ctx.parseDimensions();
    const node: RoomNode = { kind: "room", id, at, rel, size, line: kw.line };
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
    if (n.at) {
      // —— Absolute / "manual" path — UNCHANGED, byte-identical to v0.11. ——
      const at = ctx.snapPt(ctx.evalPt(n.at));
      const size = { w: ctx.snap(ctx.eval(n.size.w)), h: ctx.snap(ctx.eval(n.size.h)) };
      if (size.w <= 0 || size.h <= 0) {
        ctx.diag({ severity: "error", message: `Room "${id}" must have a positive size`, code: "E_ROOM_SIZE", span: n.span });
      }
      return { kind: "room", id, at, size, label: n.label !== undefined ? ctx.evalStr(n.label) : undefined, span: n.span };
    }
    // —— Relational path: position computed later by placeRelational(), in
    //    dependency order. `at` is a placeholder until then. ——
    const rel = n.rel!;
    const gap = rel.gap !== undefined ? ctx.eval(rel.gap) : 0;
    const size = { w: ctx.snap(ctx.eval(n.size.w)), h: ctx.snap(ctx.eval(n.size.h)) };
    if (size.w <= 0 || size.h <= 0) {
      ctx.diag({ severity: "error", message: `Room "${id}" must have a positive size`, code: "E_ROOM_SIZE", span: n.span });
    }
    return {
      kind: "room",
      id,
      at: { x: 0, y: 0 },
      size,
      label: n.label !== undefined ? ctx.evalStr(n.label) : undefined,
      span: n.span,
      _rel: { dir: rel.dir, ref: rel.ref, align: rel.align, gap, span: n.span },
    };
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
