/** `wall <category> thickness N { (x,y)… [close] }` — poché fill + crisp faces. */

import type { ExprPoint, Point, WallNode } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RWall } from "../ir.js";
import { add, mul, normal, segmentRectangle, segmentsOfWall, sub, unit } from "../geometry.js";
import { DEFAULT_MATERIAL, isKnownMaterial, KNOWN_MATERIALS, patternId } from "../hatches.js";

export const wall: ElementDef = {
  kind: "wall",
  keyword: "wall",
  doc: "A wall: a poché-filled polyline with crisp face lines; hosts doors/windows.",
  params: [
    { name: "category", type: "name", doc: "Category, e.g. exterior or partition (also a door/window host)." },
    { name: "thickness", type: "number", doc: "Wall thickness in mm." },
    { name: "material", type: "name", optional: true, doc: "Hatch material (brick, concrete, …); defaults to poché." },
    {
      name: "scale",
      type: "number",
      optional: true,
      default: "1",
      doc: "Hatch tile-size multiplier (after material).",
    },
    {
      name: "angle",
      type: "number",
      optional: true,
      default: "0",
      doc: "Extra hatch rotation in degrees (after material).",
    },
  ],

  parse(ctx: ParseCtx): WallNode {
    const kw = ctx.eatKeyword("wall");
    const id = ctx.parseIdOpt();
    const category = ctx.eatIdent().value;
    ctx.eatKeyword("thickness");
    const thickness = ctx.parseExpr();
    let material: string | undefined;
    let materialScale: ReturnType<ParseCtx["parseExpr"]> | undefined;
    let materialAngle: ReturnType<ParseCtx["parseExpr"]> | undefined;
    if (ctx.isKeyword("material")) {
      ctx.next();
      material = ctx.eatIdent().value;
      // Optional, in either order: `scale <n>` (tile size) and `angle <n>` (degrees).
      for (let i = 0; i < 2; i++) {
        if (ctx.isKeyword("scale")) {
          ctx.next();
          materialScale = ctx.parseExpr();
        } else if (ctx.isKeyword("angle")) {
          ctx.next();
          materialAngle = ctx.parseExpr();
        } else break;
      }
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
    return {
      kind: "wall",
      id,
      category,
      thickness,
      material,
      materialScale,
      materialAngle,
      points,
      closed,
      line: kw.line,
    };
  },

  idPrefix: (node) => (node as WallNode).category || "wall",

  resolve(node, ctx: ResolveCtx): RWall {
    const n = node as WallNode;
    const id = ctx.id;
    const points = n.points.map((p) => ctx.snapPt(ctx.evalPt(p)));
    const tv = ctx.eval(n.thickness);
    const thickness = ctx.snap(tv) || tv;
    if (thickness <= 0) {
      ctx.diag({
        severity: "error",
        message: `Wall "${id}" must have a positive thickness`,
        code: "E_WALL_THICKNESS",
        span: n.span,
      });
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
    let hatchScale = n.materialScale !== undefined ? ctx.eval(n.materialScale) : 1;
    if (!(hatchScale > 0)) {
      if (n.materialScale !== undefined)
        ctx.diag({
          severity: "warning",
          message: `Wall "${id}" hatch scale must be positive; using 1`,
          code: "W_HATCH_SCALE",
          span: n.span,
        });
      hatchScale = 1;
    }
    const hatchAngle = n.materialAngle !== undefined ? ctx.eval(n.materialAngle) : 0;
    return {
      kind: "wall",
      id,
      category: n.category,
      thickness,
      material,
      hatchScale,
      hatchAngle,
      points,
      closed: n.closed,
      openings: [],
      span: n.span,
    };
  },

  bounds(resolved): Point[] {
    const w = resolved as RWall;
    return segmentsOfWall(w).flatMap((s) => segmentRectangle(s.a, s.b, s.thickness));
  },

  /**
   * Per-segment wall fill (hatch) + two crisp face lines. This is the angled-wall
   * fallback (no geometry backend registered); orthogonal walls are unioned into
   * clean loops in `scene-build.ts`. The fill is a data-driven `hatch` primitive
   * carrying the wall's material/scale/angle.
   */
  render(resolved, ctx: RenderCtx): SceneNode[] {
    const w = resolved as RWall;
    const { theme, sizes } = ctx;
    const segs = segmentsOfWall(w);
    const nodes: SceneNode[] = [];
    for (const s of segs) {
      const poly = segmentRectangle(s.a, s.b, s.thickness);
      nodes.push({
        layer: "wallFill",
        prim: { t: "hatch", region: [poly], material: w.material, scale: w.hatchScale, angle: w.hatchAngle },
        paint: { fill: `url(#${patternId(w.material, w.hatchScale, w.hatchAngle)})`, fillRule: "nonzero" },
      });
    }
    for (const s of segs) {
      const d = unit(sub(s.b, s.a));
      const n = normal(d);
      const h = s.thickness / 2;
      const face = { stroke: theme.wallStroke, width: sizes.wallStroke, linecap: "square" as const };
      nodes.push({
        layer: "wallFace",
        prim: { t: "line", a: add(s.a, mul(n, h)), b: add(s.b, mul(n, h)) },
        paint: face,
      });
      nodes.push({
        layer: "wallFace",
        prim: { t: "line", a: add(s.a, mul(n, -h)), b: add(s.b, mul(n, -h)) },
        paint: face,
      });
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
