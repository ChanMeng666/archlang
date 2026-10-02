/**
 * `fence [id=] [picket|panel|post] { (x,y) (x,y) … [close] }` — a boundary line on the
 * ground.
 *
 * ## What it deliberately is NOT
 *
 * **Not a thin wall.** It hosts no opening (`door on <fence>` finds nothing, because a
 * fence is not in `ir.walls` at all), has no thickness and no poché, never enters
 * `describe().walls` or the wall joinery, and takes no part in the access graph, the nav
 * grid or any clearance rule. A gate is a real thing and it is deferred BY NAME
 * rather than approximated by letting a `door` host onto a fence —
 * which would drag a fence into the room-connectivity graph and make a garden a room's
 * neighbour.
 *
 * What it does do is draw and measure: `describe().fences[]` reports each run's length
 * and whether it closes, and it joins {@link ElementDef.bounds} so the page contains it.
 *
 * ## Why the style word LEADS
 *
 * `fence picket { … }`, not `fence { … } style picket`. A trailing `style` word is
 * ambiguous with the `style <kind> { … }` PLAN STATEMENT: a fence parser that reached for
 * it after the closing brace would consume the next statement's keyword and fail inside
 * it, with a diagnostic pointing at the wrong line. A leading kind word is also what the
 * language already does twice — `door pocket …`, `room polygon …` — so there is no new
 * shape to learn. `picket` is the default and the resolver stores it, so writing it and
 * omitting it are indistinguishable downstream.
 *
 * ## Why it draws on the `furniture` pass
 *
 * Z-order, and nothing else. A fence must sit ABOVE the ground fills (`floor`) so it is
 * not painted over by the lawn it bounds, and BELOW the wall poché (`wallFill`) so it
 * never draws across the building. `furniture` is the one pass between them. Its CAD
 * layer is `L-SITE`, so a CAD user freezes the site without freezing the furniture, and
 * `src/label-placement.ts` skips that layer — a fence running past a room is not a reason
 * to move that room's name.
 *
 * ## Refuse, never approximate
 *
 * An `arc` edge inside a fence body is `E_FENCE_CURVED`. The post pitch, the panel offset
 * and the length report are all written on straight runs; faceting a curve would put a
 * polyline where a reader is entitled to read a curve, and every one of those three
 * numbers would then be measured off the facets rather than the arc. `roof`'s
 * `E_ROOF_CURVED` is the same decision for the same reason.
 */

import type { ExprPoint, FenceNode, FenceStyle, Point } from "../ast.js";
import { FENCE_STYLES } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx, TransformCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import { weightWidth } from "../scene.js";
import type { RFence } from "../ir.js";
import { SITE_LAYER } from "./outdoor.js";

/**
 * Nominal post spacing in mm, per style. A picket fence is posted densely because that is
 * what makes it read as a picket fence at plan scale; a panel fence is posted at its
 * panel module.
 *
 * Nominal, because the real pitch is derived per segment: the count is the run length
 * divided by this and rounded, clamped so a short run still gets its two end posts and a
 * long one does not become a comb. Derived from the SEGMENT's own length, never from the
 * drawing's extent, so two identical fences draw identically wherever they sit.
 */
const POST_PITCH: Readonly<Record<FenceStyle, number>> = {
  picket: 600,
  panel: 1800,
  post: 1800,
};

/**
 * The smallest `1 + n₁·n₂` (one plus the cosine of the turn) a corner is mitred at — a turn of
 * about 139°. Sharper, the mitre point runs off toward infinity, so each run keeps its own
 * square end there instead.
 */
const MITRE_MIN = 0.25;

/** Ticks per segment are clamped into this range, whatever the arithmetic says. */
const MIN_POSTS = 1;
const MAX_POSTS = 60;

/** The post divisions of one segment `len` mm long (`render` draws `n + 1` ticks). */
function postCount(len: number, style: FenceStyle): number {
  return Math.max(MIN_POSTS, Math.min(MAX_POSTS, Math.round(len / POST_PITCH[style])));
}

/** The segments a fence draws: consecutive points, plus the closing one of a closed ring. */
function fenceSegments(f: RFence): Array<[Point, Point]> {
  const segs: Array<[Point, Point]> = [];
  for (let i = 0; i + 1 < f.points.length; i++) segs.push([f.points[i]!, f.points[i + 1]!]);
  if (f.closed && f.points.length > 2) segs.push([f.points[f.points.length - 1]!, f.points[0]!]);
  return segs;
}

export const fence: ElementDef = {
  kind: "fence",
  keyword: "fence",
  doc: "A boundary fence: a posted line on the ground. Not a wall — it hosts nothing.",
  params: [
    {
      name: "style",
      type: FENCE_STYLES.join("|"),
      optional: true,
      default: FENCE_STYLES[0],
      doc: "How it draws: dense ticks, a double line, or posts on a single rail.",
    },
  ],

  parse(ctx: ParseCtx): FenceNode {
    const kw = ctx.eatKeyword("fence");
    const id = ctx.parseIdOpt();
    // The style word LEADS and is optional — the `door` kind precedent. Peeking for
    // membership (rather than eating an ident and checking it) is what lets the word be
    // omitted without a lookahead special case.
    let style: FenceStyle = FENCE_STYLES[0];
    const t = ctx.peek();
    if (t.type === "ident" && (FENCE_STYLES as readonly string[]).includes(t.value)) {
      ctx.next();
      style = t.value as FenceStyle;
    }
    ctx.eat("lcurly");
    const points: ExprPoint[] = [];
    let closed = false;
    let arcSpan: FenceNode["arcSpan"];
    while (!ctx.isType("rcurly") && !ctx.isType("eof")) {
      if (ctx.isKeyword("close")) {
        ctx.next();
        closed = true;
        break;
      }
      // An `arc` clause is CONSUMED here, in exactly the shape `wall` writes it, and
      // refused at resolve with `E_FENCE_CURVED`. Consuming it is the point: the clause
      // carries a point, a radius and up to two modifier words, so a parser that merely
      // stopped at the keyword would read the radius as the next vertex and turn one
      // clear refusal into a cascade of shapeless ones.
      if (ctx.isKeyword("arc")) {
        const arcKw = ctx.next();
        const to = ctx.parsePoint();
        ctx.eatKeyword("radius");
        ctx.parseExpr();
        if (ctx.isKeyword("cw") || ctx.isKeyword("ccw")) ctx.next();
        if (ctx.isKeyword("major")) ctx.next();
        if (!arcSpan) arcSpan = { start: arcKw.start, end: ctx.peek(-1).end };
        points.push(to);
        continue;
      }
      if (ctx.isType("lparen")) {
        points.push(ctx.parsePoint());
        continue;
      }
      ctx.fail(
        `Expected a point "(x,y)", "arc (x,y) radius R" or "close" in a fence body but found ${describeTok(ctx)}`,
      );
    }
    ctx.eat("rcurly");
    if (points.length < 2) ctx.fail("A fence needs at least two points", kw);
    return { kind: "fence", id, style, points, closed, ...(arcSpan ? { arcSpan } : {}), line: kw.line };
  },

  idPrefix: () => "fence",

  resolve(node, ctx: ResolveCtx): RFence {
    const n = node as FenceNode;
    if (n.arcSpan) {
      ctx.diag({
        severity: "error",
        message:
          `Fence "${ctx.id}" has a curved (\`arc\`) edge, which this release refuses rather than facets — ` +
          `the post pitch, the panel offset and the reported length are all measured along a STRAIGHT run, ` +
          `so a faceted curve would silently measure the facets. Write the curve as short straight runs.`,
        code: "E_FENCE_CURVED",
        span: n.arcSpan,
      });
    }
    return {
      kind: "fence",
      id: ctx.id,
      style: n.style,
      points: n.points.map((p) => ctx.snapPt(ctx.evalPt(p))),
      closed: n.closed,
      span: n.span,
    };
  },

  bounds(resolved): Point[] {
    return (resolved as RFence).points.map((p) => ({ ...p }));
  },

  /** Per drawn segment: its run line(s) and its `postCount + 1` ticks (`render`), for the
   *  drawing budget. A segment `render` skips (zero length) is counted all the same. */
  drawCost(resolved): number {
    const f = resolved as RFence;
    let n = 0;
    for (const [a, b] of fenceSegments(f)) n += 3 + postCount(Math.hypot(b.x - a.x, b.y - a.y), f.style);
    return n;
  },

  render(resolved, ctx: RenderCtx): SceneNode[] {
    const f = resolved as RFence;
    const { theme, sizes } = ctx;
    const nodes: SceneNode[] = [];
    const line = (a: Point, b: Point, weight: "thin" | "extraThin"): SceneNode => ({
      layer: "furniture",
      layerName: SITE_LAYER,
      prim: { t: "line", a, b },
      lineWeight: weight,
      paint: { fill: "none", stroke: theme.outdoorStroke, width: weightWidth(weight, sizes) },
    });

    // Zero-length segments draw nothing and do not break a corner: the two runs either side of
    // a doubled point still meet there.
    const segs = fenceSegments(f).filter(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y) > 0);
    // A closed ring's first and last segments meet at its start point.
    const ring = f.closed && f.points.length > 2 && segs.length > 1;

    // Post depth: how far a tick stands off the run, each side.
    //
    // Derived from the PEN, not from the world. A fence post is ~100 mm of real timber,
    // which at 1:200 is half a millimetre on the sheet — invisible — so like every other
    // drafting symbol it is drawn at a readable SHEET size instead of at true size.
    // `sizes.thin` is exactly that: the sheet-derived thin pen (a fixed sheet millimetre
    // times the scale denominator on a `paper` plan, a fraction of the drawing's own
    // extent without one). The first pass used `width * 2.5` and produced a tick under
    // 1% of a short run's length, which read as a plain line with pixel noise on it.
    const depth = sizes.thin * 7;

    // The left normal of each run — the tick axis.
    const normals = segs.map(([a, b]) => {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    });
    // Where the two runs meeting at a corner put their offset: the MITRE, `(n₁ + n₂) / (1 + n₁·n₂)`
    // per unit of depth — the point a panel's two offset lines meet at, and the half-length of
    // the one tick that stands across the corner along its bisector. Past a ~140° turn the mitre
    // runs away, so a corner that sharp keeps each run's own square end instead (`null`).
    const mitre = (i: number, j: number): Point | null => {
      const p = normals[i]!;
      const q = normals[j]!;
      const k = 1 + p.x * q.x + p.y * q.y;
      return k > MITRE_MIN ? { x: (p.x + q.x) / k, y: (p.y + q.y) / k } : null;
    };

    for (let i = 0; i < segs.length; i++) {
      const [a, b] = segs[i]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const nx = normals[i]!.x;
      const ny = normals[i]!.y;
      const prev = i > 0 ? i - 1 : ring ? segs.length - 1 : -1;
      const next = i < segs.length - 1 ? i + 1 : ring ? 0 : -1;
      const own = { x: nx, y: ny };
      const atStart = (prev >= 0 ? mitre(prev, i) : null) ?? own;
      const atEnd = (next >= 0 ? mitre(i, next) : null) ?? own;

      if (f.style === "panel") {
        // Two thin parallel lines: the panel read in plan. Offset by the full tick depth
        // so the pair is unambiguously a pair — at 40% of it the two lines merged into
        // one at every scale a site plan is actually drawn at. Each end stops on the corner's
        // mitre, so two runs meet in a clean corner instead of overshooting each other.
        for (const s of [-1, 1]) {
          nodes.push(
            line(
              { x: a.x + atStart.x * depth * s, y: a.y + atStart.y * depth * s },
              { x: b.x + atEnd.x * depth * s, y: b.y + atEnd.y * depth * s },
              "extraThin",
            ),
          );
        }
      } else {
        nodes.push(line(a, b, "thin"));
      }

      // The ticks: the run's start and its interior posts, square to the run — except a start
      // shared with the run before, which takes ONE tick along the corner's bisector rather
      // than one from each run crossing in an X. The far end is the next run's start, so only
      // an open run's last segment draws its end tick here.
      const tick = (p: Point, d: Point): void => {
        nodes.push(
          line(
            { x: p.x - d.x * depth, y: p.y - d.y * depth },
            { x: p.x + d.x * depth, y: p.y + d.y * depth },
            "extraThin",
          ),
        );
      };
      const n = postCount(len, f.style);
      for (let k = 0; k < n; k++) {
        const t = (len * k) / n;
        tick({ x: a.x + ux * t, y: a.y + uy * t }, k === 0 ? atStart : own);
      }
      // (`len · n / n`, not `b`: the same arithmetic as every other post, so a straight run's
      // last tick lands on exactly the bytes it always has.)
      if (next < 0) tick({ x: a.x + ux * ((len * n) / n), y: a.y + uy * ((len * n) / n) }, own);
    }
    return nodes;
  },
  /** The frame's action on a fence (`frame.ts`'s `transformElement` calls this). */
  transform(resolved, t: TransformCtx): RFence {
    const el = resolved as RFence;
    const { id } = t;
    return { ...el, id, points: el.points.map((p) => t.point(p)) };
  },
};

/** The token description the shared parse errors use, without importing the parser. */
function describeTok(ctx: ParseCtx): string {
  const t = ctx.peek();
  return t.value ? `"${t.value}"` : t.type;
}
