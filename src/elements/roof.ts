/**
 * `roof overhang <mm> [wall <id>]` — or `roof polygon (x,y) (x,y) (x,y) …` — the eaves
 * projection line.
 *
 * ## What it is, and what it deliberately is not
 *
 * A roof here is ONE dashed outline on the annotation layer: the line a plan draws to say
 * "this much oversails the walls". It is drawing-only, by decision and not by omission —
 * there is no `describe()` key, no lint rule, no Plan JSON projection and no schedule row,
 * because none of those could be honest about a shape the language does not model. A plan
 * view of an overhang carries no pitch, no ridge, no fall and no gutter line, so a `roof`
 * that appeared in `describe()` would invite a reader to compute a roof area from a
 * horizontal projection. The one thing it DOES join is {@link ElementDef.bounds}, which is
 * correct and load-bearing: an overhang is part of the drawing's extent, so the page (and,
 * on a `paper` plan, the auto-fit scale) has to contain it.
 *
 * ## The two spellings
 *
 * The `polygon` form takes its ring verbatim, implicitly closed — the roof whose edge is
 * not the building's (a hip cut back over a terrace, a porch canopy, a monopitch that
 * oversails one facade only).
 *
 * The `overhang` sugar derives that same ring from a CLOSED wall ring, which is the
 * common case and the one nobody should be re-typing: it pushes each face out
 * `thickness/2 + overhang` along that face's own **outward normal** and re-corners by
 * exact line–line intersection (a mitre). Closed form at any angle — no tolerance loop, no
 * trig beyond the two hypotenuses that normalise a direction — so an oblique or a hexagonal
 * plan gets a true parallel outline rather than a fitted approximation. Collinear
 * neighbours merge (`effectiveVertices`), because two offset faces that were straight
 * through are still straight through and a vertex between them is not a corner.
 *
 * ## Refuse, never approximate
 *
 * An `arc` edge is `E_ROOF_CURVED`: offsetting a curve is a different construction
 * (concentric radii, and a whole second set of corner cases where the offset radius goes
 * through zero), and faceting it would put a 48-gon in the one place a reader is entitled
 * to read a true parallel. A ring whose offset crosses itself is `E_ROOF_SELF_INTERSECT`:
 * a 900 mm overhang on a 600 mm-wide light well eats the well, and the honest answer is
 * that the shape is not a simple polygon rather than a self-overlapping outline drawn
 * anyway. Both are the v1.23 `room polygon` precedent.
 */

import type { ExprPoint, Point, RoofNode } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import { weightWidth } from "../scene.js";
import type { RRoof, RWall } from "../ir.js";
import { wallHasArc } from "../geometry.js";
import { effectiveVertices, polygonSelfIntersects, polygonSignedArea2 } from "../geometry/polygon.js";
import { dashedPattern } from "./glyph-lib.js";

/**
 * The CAD layer a roof projection lands on.
 *
 * Exported because `src/label-placement.ts` must skip it. Every other node on a drawn pass
 * is an obstacle a room name may not sit under, and that rule is right for furniture, door
 * leaves and dimension numbers — but a roof outline ENCLOSES the whole building, so its
 * bounding box buries every label in the plan and the relocation pass would shove all of
 * them at once. One name, read in both places, rather than a string typed twice.
 */
export const ROOF_LAYER = "A-ROOF";

/**
 * Two faces whose directions differ by less than this SINE are parallel. Scale-free by
 * construction — the test divides the cross product by both lengths — so a 60 mm jog and
 * a 60 m facade are judged by the same angle rather than by an absolute area.
 */
const PARALLEL_SIN = 1e-12;

/** One offset face: a point on the pushed-out line, and the ORIGINAL edge's direction. */
interface OffsetLine {
  p: Point;
  dx: number;
  dy: number;
}

/**
 * Where two offset faces meet — the mitred corner, in closed form.
 *
 * Solved as a 2×2 linear system by Cramer's rule (each line as `a·x + b·y = c`) rather
 * than parametrically. The two are algebraically identical, and the difference is
 * arithmetic: the parametric form computes a ratio and then multiplies it back out, so an
 * axis-aligned rectangle's corner comes out at −5700.000000000001 instead of −5700. Every
 * quantity here is a product of the inputs divided once, so a rectilinear plan — which is
 * most plans — gets its corners EXACT.
 *
 * Parallel lines (two collinear neighbours, or a ring that doubles back) have no
 * intersection, and the honest corner there is the offset of the shared vertex itself,
 * which is exactly `b.p`: `b`'s line was built starting from that vertex.
 */
function meet(a: OffsetLine, b: OffsetLine): Point {
  const la = Math.hypot(a.dx, a.dy);
  const lb = Math.hypot(b.dx, b.dy);
  const cross = a.dx * b.dy - a.dy * b.dx;
  if (la === 0 || lb === 0 || Math.abs(cross) / (la * lb) < PARALLEL_SIN) return { ...b.p };
  const a1 = a.dy;
  const b1 = -a.dx;
  const c1 = a.dy * a.p.x - a.dx * a.p.y;
  const a2 = b.dy;
  const b2 = -b.dx;
  const c2 = b.dy * b.p.x - b.dx * b.p.y;
  const det = a1 * b2 - a2 * b1;
  return { x: (c1 * b2 - c2 * b1) / det, y: (a1 * c2 - a2 * c1) / det };
}

/**
 * Push a closed ring out by `d` along each face's outward normal, re-cornering by mitre.
 *
 * Orientation comes from the SHOELACE SIGN, never from a bounding box or a "topmost
 * vertex" heuristic: `polygonSignedArea2 > 0` is clockwise on screen (+x right, +y down),
 * whose outward normal for an edge `a→b` is `(dy, −dx)`, and a counter-clockwise ring
 * takes the negation. That is the whole rule, and it is exact for a ring at any angle.
 *
 * Exported for `test/roof.test.ts`, which checks the derivation directly rather than
 * through a rendered SVG.
 */
export function offsetRingOutward(pts: readonly Point[], d: number): Point[] {
  const sign = polygonSignedArea2(pts) > 0 ? 1 : -1;
  const lines: OffsetLine[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue; // a repeated vertex contributes no face
    const nx = (sign * dy) / len;
    const ny = (-sign * dx) / len;
    lines.push({ p: { x: a.x + nx * d, y: a.y + ny * d }, dx, dy });
  }
  if (lines.length < 3) return lines.map((l) => ({ ...l.p }));
  const out: Point[] = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(meet(lines[(i - 1 + lines.length) % lines.length]!, lines[i]!));
  }
  // Two faces that ran straight through each other still do after the offset, so the
  // point between them was never a corner.
  const merged = effectiveVertices(out);
  return merged.length >= 3 ? merged : out;
}

/** Pick the wall ring the `overhang` sugar follows, or report why it cannot. */
function selectRing(n: RoofNode, id: string, ctx: ResolveCtx): RWall | null {
  if (n.wall !== undefined) {
    const named = ctx.walls.find((w) => w.id === n.wall);
    if (!named) {
      ctx.diag({
        severity: "error",
        message: `Roof "${id}" names wall "${n.wall}", which this plan does not declare`,
        code: "E_ROOF_WALL",
        span: n.span,
      });
      return null;
    }
    if (!named.closed) {
      ctx.diag({
        severity: "error",
        message:
          `Roof "${id}" follows wall "${named.id}", which is not a closed ring — an overhang is ` +
          `offset from a loop, so the wall needs \`close\` (or use \`roof polygon …\` to state the outline)`,
        code: "E_ROOF_WALL",
        span: n.span,
      });
      return null;
    }
    return named;
  }
  const candidates = ctx.walls.filter((w) => w.closed && w.category === "exterior");
  if (candidates.length === 1) return candidates[0]!;
  ctx.diag({
    severity: "error",
    message:
      candidates.length === 0
        ? `Roof "${id}" has no ring to follow — the plan declares no closed \`exterior\` wall. ` +
          `Name the wall to offset (\`roof overhang <mm> wall <id>\`), or state the outline with \`roof polygon …\`.`
        : `Roof "${id}" is ambiguous — ${candidates.length} closed \`exterior\` walls could be the one it follows ` +
          `(${candidates.map((w) => `"${w.id}"`).join(", ")}). ` +
          `Name one (\`roof overhang <mm> wall <id>\`), or state the outline with \`roof polygon …\`.`,
    code: "E_ROOF_AMBIGUOUS",
    span: n.span,
  });
  return null;
}

export const roof: ElementDef = {
  kind: "roof",
  keyword: "roof",
  doc: "A roof/eaves projection line: one dashed outline of what oversails the plan.",
  params: [
    {
      name: "overhang",
      type: "number",
      optional: true,
      doc: "Projection past the wall's OUTER face, in mm. Derives the outline from a closed wall ring.",
    },
    {
      name: "wall",
      type: "id",
      optional: true,
      default: "the plan's one closed `exterior` wall",
      doc: "Which closed wall ring the overhang is offset from.",
    },
    {
      name: "polygon",
      type: "point…",
      optional: true,
      doc: "An explicit, implicitly-closed outline instead of `overhang` — at least 3 effective vertices.",
    },
  ],

  parse(ctx: ParseCtx): RoofNode {
    const kw = ctx.eatKeyword("roof");
    // The word after `roof` picks the spelling, exactly as it does after `room`. Neither
    // is optional and there is no third form, so anything else is a shape error.
    if (ctx.isKeyword("polygon")) {
      ctx.eatKeyword("polygon");
      const polygon: ExprPoint[] = [];
      while (ctx.isType("lparen")) polygon.push(ctx.parsePoint());
      if (polygon.length < 3) {
        ctx.fail("A `roof polygon` needs at least 3 points — `roof polygon (x,y) (x,y) (x,y) …`", ctx.peek());
      }
      return { kind: "roof", id: "", polygon, line: kw.line };
    }
    ctx.eatKeyword("overhang");
    const overhang = ctx.parseExpr();
    const node: RoofNode = { kind: "roof", id: "", overhang, line: kw.line };
    if (ctx.isKeyword("wall")) {
      ctx.next();
      node.wall = ctx.eatIdent().value;
    }
    return node;
  },

  idPrefix: () => "roof",

  resolve(node, ctx: ResolveCtx): RRoof {
    const n = node as RoofNode;
    const id = ctx.id;

    if (n.polygon) {
      const ring = n.polygon.map((p) => ctx.snapPt(ctx.evalPt(p)));
      const effective = effectiveVertices(ring);
      if (effective.length < 3) {
        ctx.diag({
          severity: "error",
          message:
            `Roof "${id}" is a degenerate outline — ${effective.length} effective vertices after removing ` +
            `duplicate and collinear points (3 are needed)`,
          code: "E_ROOF_POLY_DEGENERATE",
          span: n.span,
        });
      } else if (polygonSelfIntersects(effective)) {
        ctx.diag({
          severity: "error",
          message: `Roof "${id}" has a self-intersecting outline — its edges cross, so it encloses no single area`,
          code: "E_ROOF_SELF_INTERSECT",
          span: n.span,
        });
      }
      return { kind: "roof", id, ring, span: n.span };
    }

    // `overhang` is a number the AUTHOR writes, so it snaps to the grid like every other
    // authored length. The RING it produces is resolver-derived and is deliberately NOT
    // snapped — the v1.27.0 rule that `flush` stopped fighting `grid`.
    const overhang = ctx.snap(ctx.eval(n.overhang!));
    if (overhang <= 0) {
      ctx.diag({
        severity: "error",
        message: `Roof "${id}" must have a positive \`overhang\` (got ${overhang} mm)`,
        code: "E_ROOF_OVERHANG",
        span: n.span,
      });
      return { kind: "roof", id, ring: [], span: n.span };
    }

    const wall = selectRing(n, id, ctx);
    if (!wall) return { kind: "roof", id, ring: [], span: n.span };

    if (wallHasArc(wall)) {
      ctx.diag({
        severity: "error",
        message:
          `Roof "${id}" cannot follow wall "${wall.id}": it has a curved (\`arc\`) edge, and an offset curve ` +
          `is a different construction that this release refuses rather than facets. State the outline with ` +
          `\`roof polygon …\`.`,
        code: "E_ROOF_CURVED",
        span: n.span,
      });
      return { kind: "roof", id, ring: [], span: n.span };
    }

    const ring = offsetRingOutward(wall.points, wall.thickness / 2 + overhang);
    if (polygonSelfIntersects(ring)) {
      ctx.diag({
        severity: "error",
        message:
          `Roof "${id}" self-intersects at ${overhang} mm of overhang — the projection is wide enough to swallow ` +
          `a notch in wall "${wall.id}". Reduce the overhang, or state the outline with \`roof polygon …\`.`,
        code: "E_ROOF_SELF_INTERSECT",
        span: n.span,
      });
      return { kind: "roof", id, ring: [], span: n.span };
    }
    return { kind: "roof", id, ring, span: n.span };
  },

  bounds(resolved): Point[] {
    return (resolved as RRoof).ring.map((p) => ({ ...p }));
  },

  render(resolved, ctx: RenderCtx): SceneNode[] {
    const r = resolved as RRoof;
    if (r.ring.length < 3) return [];
    const { theme, sizes } = ctx;
    return [
      {
        layer: "annotations",
        layerName: ROOF_LAYER,
        prim: { t: "polygon", pts: r.ring.map((p) => ({ ...p })) },
        // The long-dash convention `glyph-lib.ts` documents: name the line type AND hand
        // the same pattern as a raw `dash`, because the SVG backend follows the name and
        // the PDF backend follows the number.
        lineType: "dashed",
        lineWeight: "thin",
        paint: {
          fill: "none",
          stroke: theme.annotationMuted,
          width: weightWidth("thin", sizes),
          dash: dashedPattern(sizes),
        },
      },
    ];
  },
};
