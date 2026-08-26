/**
 * `void [id=] at (x,y) size WxH` — a hole in this storey's floor plate.
 *
 * A stair well, a double-height living room, an atrium: the part of the plan where there
 * is no floor. Drawn as the conventional dashed rectangle crossed by both diagonals, on
 * `A-FLOR-OVHD`.
 *
 * ## Three decisions worth stating, because each one could have gone the other way
 *
 * **It rides the `furniture` pass.** Not for want of an annotation layer, but because the
 * label-relocation post-pass (`src/label-placement.ts`) treats every node on a drawn pass
 * as something a room name may not sit under. A void is exactly that — a name printed
 * across a hole is a worse drawing than a name nudged aside — so riding a pass that is
 * already an obstacle gets the right behaviour with no new rule. Its CAD layer is its own
 * (`A-FLOR-OVHD`, the AIA layer for what is overhead/open), so a CAD user can freeze the
 * voids without freezing the furniture.
 *
 * **It OBSTRUCTS circulation, with its halo suppressed on every side.** You cannot walk
 * across a hole, so the cells inside it are blocked; but you can stand at the railing, so
 * the body-radius halo that keeps a walker off a piece of furniture is switched off on all
 * four edges (`VerticalObstacle.open`, the mechanism a stair's entry edge already uses).
 * Blocking the approach as well would report a landing beside an atrium as unreachable.
 *
 * **It does NOT subtract from the room's area.** A room's area is the floor area of the
 * room, and it is the number `describe()`, `schedule rooms` and the drawn area label all
 * report. Deducting a well from it would leave the drawing and the table disagreeing about
 * a figure neither of them measures — and "the area of a double-height living room" is
 * genuinely the whole room in every schedule this language is modelled on. Read
 * `describe().voids[]` beside the room if you need the net.
 *
 * v1 is rectangle-only. A polygonal void is deferred BY NAME rather than silently: it
 * needs the ring machinery `room polygon` has, and every consumer here (the nav grid, the
 * room attribution, `frame.ts`) is written on a rectangle.
 */

import type { Point, VoidNode } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import { weightWidth } from "../scene.js";
import type { RVoid } from "../ir.js";
import { rectCorners } from "../geometry.js";
import { dashedPattern } from "./glyph-lib.js";

/** The CAD layer a floor void lands on — AIA's "overhead/open" floor layer. */
export const VOID_LAYER = "A-FLOR-OVHD";

export const voidEl: ElementDef = {
  kind: "void",
  keyword: "void",
  doc: "A hole in this storey's floor: a dashed rectangle crossed by both diagonals.",
  params: [
    { name: "at", type: "point", doc: "Top-left corner (x, y) of the opening, in mm." },
    { name: "size", type: "WxH", doc: "Width × height of the opening in mm." },
  ],

  parse(ctx: ParseCtx): VoidNode {
    const kw = ctx.eatKeyword("void");
    const id = ctx.parseIdOpt();
    ctx.eatKeyword("at");
    const at = ctx.parsePoint();
    ctx.eatKeyword("size");
    const size = ctx.parseDimensions();
    return { kind: "void", id, at, size, line: kw.line };
  },

  idPrefix: () => "void",

  resolve(node, ctx: ResolveCtx): RVoid {
    const n = node as VoidNode;
    const id = ctx.id;
    const at = ctx.snapPt(ctx.evalPt(n.at));
    const size = { w: ctx.snap(ctx.eval(n.size.w)), h: ctx.snap(ctx.eval(n.size.h)) };
    if (size.w <= 0 || size.h <= 0) {
      ctx.diag({
        severity: "error",
        message: `Void "${id}" must have a positive size`,
        code: "E_VOID_SIZE",
        span: n.span,
      });
    }
    return { kind: "void", id, at, size, span: n.span };
  },

  bounds(resolved): Point[] {
    const v = resolved as RVoid;
    return rectCorners(v.at.x, v.at.y, v.size.w, v.size.h);
  },

  render(resolved, ctx: RenderCtx): SceneNode[] {
    const v = resolved as RVoid;
    const { theme, sizes } = ctx;
    const pts = rectCorners(v.at.x, v.at.y, v.size.w, v.size.h);
    // One pattern in BOTH fields — the `glyph-lib.ts` dash convention: the SVG serializer
    // follows `lineType`, the PDF serializer follows `paint.dash`, and a node that names
    // one and hands the other a different pattern draws two different dashes.
    const paint = {
      fill: "none",
      stroke: theme.annotation,
      width: weightWidth("thin", sizes),
      dash: dashedPattern(sizes),
    };
    const node = (prim: SceneNode["prim"]): SceneNode => ({
      layer: "furniture",
      layerName: VOID_LAYER,
      prim,
      lineType: "dashed",
      lineWeight: "thin",
      paint: { ...paint },
    });
    return [
      node({ t: "polygon", pts }),
      node({ t: "line", a: pts[0]!, b: pts[2]! }),
      node({ t: "line", a: pts[1]!, b: pts[3]! }),
    ];
  },
};
