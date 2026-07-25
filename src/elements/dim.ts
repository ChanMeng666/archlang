/** `dim [faces|clear] (x,y)->(x,y) [offset N] [text "…"]` — dimension line with ticks + length. */

import type { DimNode, DimRef, ExprPoint } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RDim } from "../ir.js";
import { add, length, mul, normal, projectToWallFace, sub, unit } from "../geometry.js";
import { exprToSource } from "../expr-source.js";

/** Re-emit a dim statement with its two endpoints SWAPPED — the machine-applicable
 *  fix for `W_DIM_INSIDE` (endpoint order is what chooses the offset side, so
 *  swapping flips the dimension line to the outside). Every clause the node can
 *  carry is enumerated here, so a rebuild never silently drops one. */
function emitSwapped(n: DimNode): string {
  const pt = (p: ExprPoint): string => `(${exprToSource(p.x)}, ${exprToSource(p.y)})`;
  const ref = n.ref ? `${n.ref} ` : "";
  const text = n.text !== undefined ? ` text ${exprToSource(n.text)}` : "";
  return `dim ${ref}${pt(n.to)}->${pt(n.from)} offset ${exprToSource(n.offset)}${text}`;
}

export const dim: ElementDef = {
  kind: "dim",
  keyword: "dim",
  doc: "A dimension: a measured line with ticks; text defaults to the length.",
  params: [
    {
      name: "ref",
      type: "faces|clear",
      optional: true,
      doc: "Reference each endpoint to the wall it touches: `faces` = outer faces (outside-to-outside), `clear` = inner faces (clear width).",
    },
    { name: "from", type: "point", doc: "Start point (x, y); written before ->." },
    { name: "to", type: "point", doc: "End point (x, y); written after ->." },
    {
      name: "offset",
      type: "number",
      optional: true,
      default: "300",
      doc: "Perpendicular offset of the dimension line, mm.",
    },
    { name: "text", type: "string", optional: true, doc: "Override text; defaults to the measured length." },
  ],

  parse(ctx: ParseCtx): DimNode {
    const kw = ctx.eatKeyword("dim");
    // Optional wall-face reference, before the points (`dim faces (…)->(…)`).
    let ref: DimRef | undefined;
    if (ctx.isKeyword("faces") || ctx.isKeyword("clear")) {
      ref = ctx.next().value as DimRef;
    }
    const from = ctx.parsePoint();
    ctx.eat("arrow");
    const to = ctx.parsePoint();
    const node: DimNode = { kind: "dim", id: "", from, to, offset: { t: "num", value: 300 }, line: kw.line };
    if (ref) node.ref = ref;
    if (ctx.isKeyword("offset")) {
      ctx.next();
      node.offset = ctx.parseExpr();
    }
    if (ctx.isKeyword("text")) {
      ctx.next();
      node.text = ctx.parseStringExpr();
    }
    return node;
  },

  idPrefix: () => "dim",

  resolve(node, ctx: ResolveCtx): RDim {
    const n = node as DimNode;
    // A dimension ANNOTATES coordinates rather than building geometry, so its
    // endpoints are measured verbatim — never grid-snapped. (Snapping them silently
    // mis-measured an off-grid span, and half a wall thickness is legitimately
    // off-grid: 150 for a 300 wall on a 100 grid. It also made the Plan JSON
    // round-trip lossy, since the emitted source is re-resolved with the same grid.)
    let from = ctx.evalPt(n.from);
    let to = ctx.evalPt(n.to);
    if (n.ref) {
      const dir = unit(sub(to, from));
      // Each endpoint is pushed along the measurement axis, AWAY from the other one.
      const pf = projectToWallFace(ctx.walls, from, mul(dir, -1), n.ref);
      const pt = projectToWallFace(ctx.walls, to, dir, n.ref);
      if (!pf || !pt) {
        const which = !pf && !pt ? "Both endpoints" : !pf ? "The start endpoint" : "The end endpoint";
        ctx.diag({
          severity: "warning",
          code: "W_DIM_NO_WALL",
          message: `${which} of this \`dim ${n.ref}\` has no wall across the measurement axis — the written point is measured as-is.`,
          hints: [
            "Put the endpoint on the centerline of the wall the measurement runs into, or drop the `" +
              n.ref +
              "` keyword.",
          ],
          ...(n.span ? { span: n.span } : {}),
        });
      }
      if (pf) from = pf.at;
      if (pt) to = pt.at;
    }
    const r: RDim = {
      kind: "dim",
      id: ctx.id,
      from,
      to,
      offset: ctx.eval(n.offset),
      text: n.text !== undefined ? ctx.evalStr(n.text) : undefined,
      span: n.span,
    };
    // Carried for the `W_DIM_INSIDE` lint fix (which sees the IR, not the AST):
    // the whole statement re-emitted with its endpoints swapped.
    if (n.span) r._swapText = emitSwapped(n);
    return r;
  },

  bounds(resolved) {
    const dm = resolved as RDim;
    return [dm.from, dm.to];
  },

  render(resolved, ctx: RenderCtx): SceneNode[] {
    const dm = resolved as RDim;
    const { theme, sizes, fmt } = ctx;
    const dir = unit(sub(dm.to, dm.from));
    const n = normal(dir);
    const off = mul(n, dm.offset);
    const p1 = add(dm.from, off);
    const p2 = add(dm.to, off);
    const tick = sizes.refDim * 0.012;
    const thinPaint = { stroke: theme.dim, width: sizes.thin };
    const nodes: SceneNode[] = [];
    // Extension (witness) lines (lighter), then the dimension line. A zero offset
    // puts the dimension line ON the measured segment, so both witness lines would be
    // zero-length degenerate strokes — skipped (a wall-thickness call-out is the
    // canonical zero-offset dim and legitimately has no witness lines).
    if (dm.offset !== 0) {
      nodes.push({
        layer: "dims",
        prim: { t: "line", a: dm.from, b: p1 },
        paint: { stroke: theme.dim, width: sizes.thin * 0.7 },
      });
      nodes.push({
        layer: "dims",
        prim: { t: "line", a: dm.to, b: p2 },
        paint: { stroke: theme.dim, width: sizes.thin * 0.7 },
      });
    }
    nodes.push({ layer: "dims", prim: { t: "line", a: p1, b: p2 }, paint: thinPaint });
    for (const p of [p1, p2]) {
      const t1 = add(p, mul(unit({ x: dir.x + n.x, y: dir.y + n.y }), tick));
      const t2 = add(p, mul(unit({ x: dir.x + n.x, y: dir.y + n.y }), -tick));
      nodes.push({ layer: "dims", prim: { t: "line", a: t1, b: t2 }, paint: thinPaint });
    }
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const tp = add(mid, mul(n, sizes.dimFont * 0.7));
    let angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    // No explicit text → the measured length |to−from|, formatted once via the
    // shared mm formatter so SVG and DXF show the same value (T3.6).
    const label = dm.text ?? fmt(length(sub(dm.to, dm.from)));
    nodes.push({
      layer: "dims",
      prim: {
        t: "text",
        at: tp,
        value: label,
        size: sizes.dimFont,
        anchor: "middle",
        baseline: "central",
        rotate: angle,
      },
      paint: { fill: theme.dim },
    });
    return nodes;
  },
};
