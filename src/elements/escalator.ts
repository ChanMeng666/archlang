/**
 * `escalator [id=] at (x,y) size WxH dir up|down` — a moving stair, drawn as parallel
 * chevrons along the run plus the UP/DN direction arrow.
 *
 * Like `stair`, `dir` is declared per storey and the same `id` on two `level` blocks
 * declares one run; the shared vertical-circulation semantics live in `src/vertical.ts`.
 * Unlike a stair, BOTH narrow ends are entries (you step on at one and off at the other),
 * so the nav grid keeps the landing at either end walkable.
 */

import type { EscalatorNode, Point } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx, TransformCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { REscalator } from "../ir.js";
import { rectCorners } from "../geometry.js";
import { tailEdge } from "../vertical.js";
import { parseVerticalDir } from "./stair.js";
import { escalatorGlyph, runTooLong } from "./vertical-glyphs.js";

export const escalator: ElementDef = {
  kind: "escalator",
  keyword: "escalator",
  doc: "An escalator run: parallel chevrons and an UP/DN direction arrow.",
  params: [
    { name: "at", type: "point", doc: "Top-left corner (x, y) of the footprint, in mm." },
    { name: "size", type: "WxH", doc: "Footprint width × height in mm; the run follows the LONG axis." },
    { name: "dir", type: "up|down", doc: "Which way this run travels from THIS storey — draws UP or DN." },
  ],

  parse(ctx: ParseCtx): EscalatorNode {
    const kw = ctx.eatKeyword("escalator");
    const id = ctx.parseIdOpt();
    ctx.eatKeyword("at");
    const at = ctx.parsePoint();
    ctx.eatKeyword("size");
    const size = ctx.parseDimensions();
    const dir = parseVerticalDir(ctx, "escalator");
    return { kind: "escalator", id, at, size, dir, line: kw.line };
  },

  idPrefix: () => "escalator",

  resolve(node, ctx: ResolveCtx): REscalator {
    const n = node as EscalatorNode;
    const id = ctx.id;
    const at = ctx.snapPt(ctx.evalPt(n.at));
    const size = { w: ctx.snap(ctx.eval(n.size.w)), h: ctx.snap(ctx.eval(n.size.h)) };
    if (size.w <= 0 || size.h <= 0) {
      ctx.diag({
        severity: "error",
        message: `Escalator "${id}" must have a positive size`,
        code: "E_VERT_SIZE",
        span: n.span,
      });
    }
    const long = runTooLong(`Escalator "${id}"`, size, n.span);
    if (long) ctx.diag(long);
    return { kind: "escalator", id, at, size, dir: n.dir, span: n.span };
  },

  bounds(resolved): Point[] {
    const e = resolved as REscalator;
    return rectCorners(e.at.x, e.at.y, e.size.w, e.size.h);
  },

  render(resolved, ctx: RenderCtx): SceneNode[] {
    return escalatorGlyph(resolved as REscalator, ctx.theme, ctx.sizes);
  },
  /** The frame's action on an escalator (`frame.ts`'s `transformElement` calls this). */
  transform(resolved, t: TransformCtx): REscalator {
    const el = resolved as REscalator;
    const { id } = t;
    const r = t.rect(el.at, el.size);
    // The tail, read in the LOCAL frame and acted on — see `stair.transform`. The chevrons
    // and arrow are symmetric across the centreline, so a reflection needs nothing more.
    return { ...el, id, at: r.at, size: r.size, _tail: t.side(tailEdge(el)) };
  },
};
