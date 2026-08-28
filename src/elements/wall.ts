/** `wall <category> thickness N { (x,y)… [close] }` — poché fill + crisp faces. */

import type { ArcDirWord, ExprPoint, Point, WallArcNode, WallNode } from "../ast.js";
import { ARC_DIRS } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RWall } from "../ir.js";
import { segmentFaceExtremes, segmentsOfWall } from "../geometry.js";
import type { Arc } from "../geometry/arc.js";
import { arcExtremes, arcFromChord, minArcRadius } from "../geometry/arc.js";
import { PointInterner, wallBand } from "../geometry/band.js";
import { DEFAULT_MATERIAL, hatchesUsed, isKnownMaterial, KNOWN_MATERIALS } from "../hatches.js";
import { lowerWallSet } from "../wall-lowering.js";
import { fmt3 } from "../num-format.js";

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
    // Segment-indexed curve clauses: `arcs[k]` is the edge from points[k] to points[k+1].
    // Stays `undefined` for a wall with no `arc` at all, so an all-straight polyline
    // resolves through exactly the code it always did.
    const arcs: Array<WallArcNode | undefined> = [];
    let closed = false;
    while (!ctx.isType("rcurly") && !ctx.isType("eof")) {
      if (ctx.isKeyword("close")) {
        ctx.next();
        closed = true;
        break;
      }
      // `arc (x,y) radius R [cw|ccw] [major]` — a CURVED edge from the previous vertex
      // to this one. The clause is written on the vertex it arrives at (there is no
      // previous vertex for the first one, so `arc` cannot lead the list).
      if (ctx.isKeyword("arc")) {
        const arcKw = ctx.next();
        if (points.length === 0) {
          ctx.fail("An `arc` edge needs a preceding point to curve away from", arcKw);
        }
        const to = ctx.parsePoint();
        ctx.eatKeyword("radius");
        const radius = ctx.parseExpr();
        let dir: ArcDirWord | undefined;
        let major: boolean | undefined;
        // `cw|ccw` then `major`, each at most once, in the canonical order the
        // formatter re-emits.
        if (ARC_DIRS.some((d) => ctx.isKeyword(d))) dir = ctx.next().value as ArcDirWord;
        if (ctx.isKeyword("major")) {
          ctx.next();
          major = true;
        }
        arcs[points.length - 1] = {
          radius,
          ...(dir ? { dir } : {}),
          ...(major ? { major } : {}),
          span: { start: arcKw.start, end: ctx.peek(-1).end },
        };
        points.push(to);
        continue;
      }
      if (ctx.isType("lparen")) {
        points.push(ctx.parsePoint());
        continue;
      }
      ctx.fail(`Expected a point "(x,y)", "arc (x,y) radius R" or "close" in wall body but found ${describe(ctx)}`);
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
      ...(arcs.some((a) => a !== undefined) ? { arcs } : {}),
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
    const arcs = n.arcs ? resolveArcs(n, id, points, ctx) : undefined;
    return {
      kind: "wall",
      id,
      category: n.category,
      thickness,
      material,
      hatchScale,
      hatchAngle,
      points,
      ...(arcs ? { arcs } : {}),
      closed: n.closed,
      openings: [],
      span: n.span,
    };
  },

  /**
   * The page must contain what is actually DRAWN, which is the wall's band — its two
   * offset faces, its end caps and its MITRED corners. A mitre at an oblique corner
   * reaches further out than either segment's own capped rectangle does (as far as
   * `MITER_LIMIT · h` from the vertex, past which `wallBand` bevels), so taking the
   * per-segment extremes left the outermost point of an acute facade outside the frame.
   * At a right angle the two agree exactly — which is why no rectilinear plan's extent
   * moves.
   *
   * A curve contributes the closed-form extremes of its offset arcs, never the
   * tessellation: the page must contain the BULGE, which the chord does not reach.
   */
  bounds(resolved): Point[] {
    const w = resolved as RWall;
    const loops = wallBand(w, new PointInterner());
    // A wall of non-positive thickness, or with no non-degenerate segment, has no band.
    // It still occupies its centreline, so fall back rather than contributing nothing.
    if (loops.length === 0) return segmentsOfWall(w).flatMap((s) => segmentFaceExtremes(s, s.thickness));
    const pts: Point[] = [];
    for (const loop of loops) {
      for (const e of loop) {
        if (e.t === "line") pts.push(e.a, e.b);
        else pts.push(...arcExtremes(e.arc));
      }
    }
    return pts;
  },

  /**
   * One wall, drawn through the same joinery every wall set goes through.
   *
   * `scene-build.ts` lowers the plan's whole wall list in ONE call, so this is not on the
   * compile path at all — nothing in `src/` reaches it. It exists because the registry is
   * a public seam: a plugin or a test holding this `ElementDef` must get the drawing the
   * compiler would make, not the retired per-segment one. Delegating is what keeps those
   * two answers the same.
   *
   * What it retires: per-segment poché rectangles plus two untrimmed face lines per
   * segment. Those drew a face straight through the wall's own corners, and through any
   * neighbouring wall's solid, and subtracted no opening. See ADR 0018.
   */
  render(resolved, ctx: RenderCtx): SceneNode[] {
    const w = resolved as RWall;
    return lowerWallSet([w], hatchesUsed([w]), ctx);
  },
};

/**
 * Solve every `arc` clause into a concrete {@link Arc} (centre, radius, signed sweep),
 * at RESOLVE time so nothing downstream re-solves it and every consumer reads the same
 * curve. Segment-indexed, matching `WallSegment.index`.
 *
 * A radius smaller than half the chord describes no circle through the two endpoints:
 * that is `E_ARC_RADIUS`, returned (never thrown) with a machine-applicable fix that
 * substitutes the minimum workable radius. The offending edge then stays STRAIGHT, so
 * the rest of the plan still draws and the author sees exactly one crisp error rather
 * than a cascade.
 */
function resolveArcs(n: WallNode, id: string, points: Point[], ctx: ResolveCtx): Array<Arc | undefined> | undefined {
  const out: Array<Arc | undefined> = [];
  let any = false;
  for (let k = 0; k < (n.arcs?.length ?? 0); k++) {
    const spec = n.arcs![k];
    if (!spec) continue;
    const a = points[k];
    const b = points[k + 1];
    if (!a || !b) continue;
    const rv = ctx.eval(spec.radius);
    const r = ctx.snap(rv) || rv;
    const arc = arcFromChord(a, b, r, spec.dir ?? "ccw", spec.major === true);
    if (!arc) {
      const min = minArcRadius(a, b);
      ctx.diag({
        severity: "error",
        message:
          r > 0
            ? `Wall "${id}" has an arc edge of radius ${fmt3(r)} spanning a ${fmt3(min * 2)} mm chord — no circle of that radius passes through both endpoints (the minimum is ${fmt3(min)})`
            : `Wall "${id}" has an arc edge with a non-positive radius`,
        code: "E_ARC_RADIUS",
        span: spec.span ?? n.span,
        hints: [`The radius must be at least half the chord: ${fmt3(min)}.`],
        ...(spec.span && min > 0
          ? {
              fixes: [
                {
                  title: `use the minimum radius ${fmt3(min)}`,
                  applicability: "machine-applicable" as const,
                  fixId: "arc-radius-min",
                  edits: [
                    {
                      span: spec.span,
                      newText: `arc (${fmt3(b.x)}, ${fmt3(b.y)}) radius ${fmt3(min)}${spec.dir ? ` ${spec.dir}` : ""}${spec.major ? " major" : ""}`,
                    },
                  ],
                },
              ],
            }
          : {}),
      });
      continue;
    }
    out[k] = arc;
    any = true;
  }
  return any ? out : undefined;
}

function describe(ctx: ParseCtx): string {
  const t = ctx.peek();
  if (t.type === "eof") return "end of input";
  if (t.type === "string") return `string ${JSON.stringify(t.value)}`;
  return `"${t.value}"`;
}
