/** `wall <category> thickness N { (x,y)… [close] }` — poché fill + crisp faces. */

import type { ExprPoint, Point, WallNode } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RWall } from "../ir.js";
import { add, mul, normal, segmentRectangle, segmentsOfWall, sub, unit } from "../geometry.js";
import { DEFAULT_MATERIAL, isKnownMaterial, KNOWN_MATERIALS } from "../hatches.js";

export const wall: ElementDef = {
  kind: "wall",
  keyword: "wall",

  parse(ctx: ParseCtx): WallNode {
    const kw = ctx.eatKeyword("wall");
    const id = ctx.parseIdOpt();
    const category = ctx.eatIdent().value;
    ctx.eatKeyword("thickness");
    const thickness = ctx.parseExpr();
    let material: string | undefined;
    if (ctx.isKeyword("material")) {
      ctx.next();
      material = ctx.eatIdent().value;
    }
    ctx.eat("lcurly");
    const points: ExprPoint[] = [];
    let closed = false;
    while (!ctx.isType("rcurly") && !ctx.isType("eof")) {
      if (ctx.isKeyword("close")) {
        ctx.next();
        closed = true;
        break;
      }
      if (ctx.isType("lparen")) {
        points.push(ctx.parsePoint());
        continue;
      }
      ctx.fail(`Expected a point "(x,y)" or "close" in wall body but found ${describe(ctx)}`);
    }
    ctx.eat("rcurly");
    if (points.length < 2) ctx.fail("A wall needs at least two points", kw);
    return { kind: "wall", id, category, thickness, material, points, closed, line: kw.line };
  },

  idPrefix: (node) => (node as WallNode).category || "wall",

  resolve(node, ctx: ResolveCtx): RWall {
    const n = node as WallNode;
    const id = ctx.id;
    const points = n.points.map((p) => ctx.snapPt(ctx.evalPt(p)));
    const tv = ctx.eval(n.thickness);
    const thickness = ctx.snap(tv) || tv;
    if (thickness <= 0) {
      ctx.diag({ severity: "error", message: `Wall "${id}" must have a positive thickness`, code: "E_WALL_THICKNESS", span: n.span });
    }
    let material = DEFAULT_MATERIAL as string;
    if (n.material !== undefined) {
      if (isKnownMaterial(n.material)) material = n.material;
      else
        ctx.diag({
          severity: "warning",
          message: `Unknown wall material "${n.material}" (known: ${KNOWN_MATERIALS.join(", ")}); using the default hatch`,
          code: "W_UNKNOWN_MATERIAL",
          span: n.span,
        });
    }
    return { kind: "wall", id, category: n.category, thickness, material, points, closed: n.closed, span: n.span };
  },

  bounds(resolved): Point[] {
    const w = resolved as RWall;
    return segmentsOfWall(w).flatMap((s) => segmentRectangle(s.a, s.b, s.thickness));
  },

  /**
   * Per-segment wall fill (poché) + two crisp face lines. This is the angled-wall
   * path; orthogonal walls are unioned into clean loops in `scene-build.ts`. The
   * fill always references the default poché pattern, matching v0.1.
   */
  render(resolved, ctx: RenderCtx): SceneNode[] {
    const w = resolved as RWall;
    const { theme, sizes } = ctx;
    const segs = segmentsOfWall(w);
    const nodes: SceneNode[] = [];
    for (const s of segs) {
      const poly = segmentRectangle(s.a, s.b, s.thickness);
      nodes.push({ layer: "wallFill", prim: { t: "polygon", pts: poly }, paint: { fill: "url(#poche)" } });
    }
    for (const s of segs) {
      const d = unit(sub(s.b, s.a));
      const n = normal(d);
      const h = s.thickness / 2;
      const face = { stroke: theme.wallStroke, width: sizes.wallStroke, linecap: "square" as const };
      nodes.push({ layer: "wallFace", prim: { t: "line", a: add(s.a, mul(n, h)), b: add(s.b, mul(n, h)) }, paint: face });
      nodes.push({ layer: "wallFace", prim: { t: "line", a: add(s.a, mul(n, -h)), b: add(s.b, mul(n, -h)) }, paint: face });
    }
    return nodes;
  },
};

function describe(ctx: ParseCtx): string {
  const t = ctx.peek();
  if (t.type === "eof") return "end of input";
  if (t.type === "string") return `string ${JSON.stringify(t.value)}`;
  return `"${t.value}"`;
}
