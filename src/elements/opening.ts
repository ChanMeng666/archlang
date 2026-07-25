/** `opening [id=] at (x,y) width N [wall ref]` — a leaf-less cased opening: a gap in
 *  the host wall (no door leaf, no glazing) that still connects the two spaces. */

import type { Point, OpeningNode } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { ROpening } from "../ir.js";
import { add, mul, nearestWallNote, normal, sub, unit } from "../geometry.js";
import { parseAttachTarget, resolveAttachment } from "../attach.js";
import { fixesFrom, offWallFix, openingWidthFix } from "../fix-producers.js";

export const opening: ElementDef = {
  kind: "opening",
  keyword: "opening",
  doc: "A cased opening: a leaf-less gap in a wall that connects two spaces.",
  params: [
    { name: "at", type: "point", doc: "Center position (x, y) in mm." },
    { name: "width", type: "number", doc: "Opening width in mm." },
    { name: "wall", type: "name", optional: true, doc: "Host wall by id or category (else nearest)." },
  ],

  parse(ctx: ParseCtx): OpeningNode {
    const kw = ctx.eatKeyword("opening");
    const id = ctx.parseIdOpt();
    const { at, attach } = parseAttachTarget(ctx);
    ctx.eatKeyword("width");
    const width = ctx.parseExpr();
    const node: OpeningNode = {
      kind: "opening",
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

  idPrefix: () => "opening",

  resolve(node, ctx: ResolveCtx): ROpening {
    const n = node as OpeningNode;
    const id = ctx.id;
    const wv = ctx.eval(n.width);
    const width = ctx.snap(wv) || wv;
    if (width <= 0) {
      ctx.diag({
        severity: "error",
        message: `Opening "${id}" must have a positive width`,
        code: "E_OPENING_WIDTH",
        span: n.span,
        ...fixesFrom(openingWidthFix("opening", n)),
      });
    }
    // Attached: the point + host come from walking the named wall (no off-wall check).
    if (n.attach) {
      const a = resolveAttachment(n.attach, ctx.walls, ctx.snapPt, ctx.diag, `Opening "${id}"`);
      const at = a ? a.at : { x: 0, y: 0 };
      return { kind: "opening", id, at, width, host: a ? a.host : null, span: n.span };
    }
    const at = ctx.snapPt(ctx.evalPt(n.at!));
    if (ctx.walls.length > 0 && !ctx.isOnWall(at, n.wall)) {
      const note = nearestWallNote(at, ctx.walls);
      ctx.diag({
        severity: "warning",
        message: `Opening "${id}" does not lie on any wall`,
        code: "W_OPENING_OFF_WALL",
        span: n.span,
        relatedSpans: note ? [note] : undefined,
        ...fixesFrom(offWallFix("opening", n, at, ctx.walls)),
      });
    }
    return { kind: "opening", id, at, width, host: ctx.hostSegment(at, n.wall), span: n.span };
  },

  bounds: () => [],

  render(resolved, ctx: RenderCtx): SceneNode[] {
    const op = resolved as ROpening;
    const seg = op.host;
    if (!seg) return [];
    const { theme, sizes } = ctx;
    const d = unit(sub(seg.b, seg.a));
    const n = normal(d);
    const h = seg.thickness / 2;
    const hw = op.width / 2;
    // Has the wall solid already been voided here? The boolean union in
    // `scene-build.ts` severs the wall at every registered opening — jamb end-caps
    // and all — with the floor running continuously through the gap. Repainting that
    // gap with an opaque `theme.opening` (which is the page background in every
    // theme) is what used to lay a white band across the floor, overhanging a whole
    // `wallStroke` past each wall face. So: only paint the cover when nothing else
    // opened the hole (an angled host on the no-geometry-backend fallback, where this
    // polygon is the ONLY void mechanism).
    const voided = ctx.openingsVoided === true && (seg.a.x === seg.b.x || seg.a.y === seg.b.y);
    const he = voided ? h : h + sizes.wallStroke;
    const cover: Point[] = [
      add(add(op.at, mul(d, -hw)), mul(n, he)),
      add(add(op.at, mul(d, hw)), mul(n, he)),
      add(add(op.at, mul(d, hw)), mul(n, -he)),
      add(add(op.at, mul(d, -hw)), mul(n, -he)),
    ];
    const nodes: SceneNode[] = [];
    // The cover polygon is emitted even when invisible: it is how the ASCII and DXF
    // backends *locate* the passage (they read the polygon on the `openings` pass).
    nodes.push({
      layer: "openings",
      prim: { t: "polygon", pts: cover },
      paint: voided ? { fill: "none" } : { fill: theme.opening },
    });
    // Head/lintel above the passage, drawn **dashed** at each wall face — the
    // cased-opening convention. It must not be the solid full-length line a glazed
    // window draws: on a voided wall that re-bridges the gap the union just opened.
    const jA = add(op.at, mul(d, -hw));
    const jB = add(op.at, mul(d, hw));
    const dash: [number, number] = [sizes.thin * 4, sizes.thin * 3];
    for (const off of [h, -h]) {
      nodes.push({
        layer: "openings",
        prim: { t: "line", a: add(jA, mul(n, off)), b: add(jB, mul(n, off)) },
        paint: { stroke: theme.wallStroke, width: sizes.thin, dash },
      });
    }
    return nodes;
  },
};
