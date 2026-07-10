/** `window [id=] at (x,y) width N [wall ref]` — opening + glazing panes. */

import type { Point, WindowNode } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RWindow } from "../ir.js";
import { add, mul, nearestWallNote, normal, sub, unit } from "../geometry.js";
import { parseAttachTarget, resolveAttachment } from "../attach.js";
import { fixesFrom, offWallFix, openingWidthFix } from "../fix-producers.js";

export const windowEl: ElementDef = {
  kind: "window",
  keyword: "window",
  doc: "A window: a glazed opening in its host wall.",
  params: [
    { name: "at", type: "point", doc: "Center position (x, y) in mm." },
    { name: "width", type: "number", doc: "Window width in mm." },
    { name: "wall", type: "name", optional: true, doc: "Host wall by id or category (else nearest)." },
  ],

  parse(ctx: ParseCtx): WindowNode {
    const kw = ctx.eatKeyword("window");
    const id = ctx.parseIdOpt();
    const { at, attach } = parseAttachTarget(ctx);
    ctx.eatKeyword("width");
    const width = ctx.parseExpr();
    const node: WindowNode = {
      kind: "window",
      id,
      width,
      line: kw.line,
      ...(at ? { at } : {}),
      ...(attach ? { attach } : {}),
    };
    if (!attach && ctx.isKeyword("wall")) {
      ctx.next();
      node.wall = ctx.eatIdent().value;
    }
    return node;
  },

  idPrefix: () => "window",

  resolve(node, ctx: ResolveCtx): RWindow {
    const n = node as WindowNode;
    const id = ctx.id;
    const wv = ctx.eval(n.width);
    const width = ctx.snap(wv) || wv;
    if (width <= 0) {
      ctx.diag({
        severity: "error",
        message: `Window "${id}" must have a positive width`,
        code: "E_WINDOW_WIDTH",
        span: n.span,
        ...fixesFrom(openingWidthFix("window", n)),
      });
    }
    if (n.attach) {
      const a = resolveAttachment(n.attach, ctx.walls, ctx.snapPt, ctx.diag, `Window "${id}"`);
      const at = a ? a.at : { x: 0, y: 0 };
      return { kind: "window", id, at, width, host: a ? a.host : null, span: n.span };
    }
    const at = ctx.snapPt(ctx.evalPt(n.at!));
    if (ctx.walls.length > 0 && !ctx.isOnWall(at, n.wall)) {
      const note = nearestWallNote(at, ctx.walls);
      ctx.diag({
        severity: "warning",
        message: `Window "${id}" does not lie on any wall`,
        code: "W_WINDOW_OFF_WALL",
        span: n.span,
        relatedSpans: note ? [note] : undefined,
        ...fixesFrom(offWallFix("window", n, at, ctx.walls)),
      });
    }
    return { kind: "window", id, at, width, host: ctx.hostSegment(at, n.wall), span: n.span };
  },

  bounds: () => [],

  render(resolved, ctx: RenderCtx): SceneNode[] {
    const wn = resolved as RWindow;
    const seg = wn.host;
    if (!seg) return [];
    const { theme, sizes } = ctx;
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
    const nodes: SceneNode[] = [];
    nodes.push({ layer: "windows", prim: { t: "polygon", pts: cover }, paint: { fill: theme.opening } });
    const jA = add(wn.at, mul(d, -hw));
    const jB = add(wn.at, mul(d, hw));
    for (const off of [h, -h]) {
      nodes.push({
        layer: "windows",
        prim: { t: "line", a: add(jA, mul(n, off)), b: add(jB, mul(n, off)) },
        paint: { stroke: theme.wallStroke, width: sizes.thin },
      });
    }
    nodes.push({
      layer: "windows",
      prim: { t: "line", a: jA, b: jB },
      paint: { stroke: theme.windowPane, width: sizes.thin },
    });
    return nodes;
  },
};
