/** `room [id=] (at (x,y) | DIR ref [align E] [gap n]) size WxH [label "…"]`
 *  or `room [id=] polygon (x,y) (x,y) (x,y) … [label "…" [at (x,y)]]`
 *  or `room [id=] circle at (cx,cy) radius R [label "…"]`
 *  — floor fill + label + computed area. The absolute `at` path is the default;
 *  the relational clause is resolved to absolute coords in `placeRelational`; the
 *  `polygon` form carries its own vertex ring (v1.23) and derives `at`/`size` as the
 *  ring's bounding box, so every rect-shaped consumer still sees a sane extent; the
 *  `circle` form (v1.24) adds an exact centre+radius, a tessellated ring for the grid
 *  layer, and that same derived bounding box. */

import type { ExprPoint, Point, RelAlign, RelDir, RoomNode, UseKind } from "../ast.js";
import { USE_KINDS } from "../ast.js";
import type { Expr } from "../expr.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RRoom } from "../ir.js";
import { rectCorners } from "../geometry.js";
import { arcTessellate, fullCircleArc } from "../geometry/arc.js";
import {
  effectiveVertices,
  pointInPolygon,
  polygonArea,
  polygonBounds,
  polygonLabelPoint,
  polygonSelfIntersects,
} from "../geometry/polygon.js";

const REL_DIRS: ReadonlySet<string> = new Set<RelDir>(["right-of", "left-of", "below", "above"]);
const USE_SET: ReadonlySet<string> = new Set<UseKind>(USE_KINDS);

/**
 * The trailing clauses every room form shares: `label "…" [at (x,y)]` then
 * `uses <kind> …`. Factored out so the rect and polygon forms can never drift apart —
 * for a rect room this parses exactly the same tokens, in the same order, as before.
 */
function parseTail(ctx: ParseCtx, node: RoomNode): void {
  if (ctx.isKeyword("label")) {
    ctx.next();
    node.label = ctx.parseStringExpr();
    // `label "Gallery" at (x,y)` — an explicit anchor for the label + area text. Only
    // reachable after a label (the room's own `at` was consumed before `size`).
    if (ctx.isKeyword("at")) {
      const kw = ctx.next();
      node.labelAt = ctx.parsePoint();
      node.labelAtSpan = { start: kw.start, end: ctx.peek(-1).end };
    }
  }
  // Optional `uses <kind> [<kind> …]` — explicit room classification. Greedily
  // consume contiguous valid use-kind identifiers (they never collide with a
  // following statement keyword), requiring at least one.
  if (ctx.isKeyword("uses")) {
    ctx.next();
    const uses: UseKind[] = [];
    while (ctx.peek().type === "ident" && USE_SET.has(ctx.peek().value)) {
      uses.push(ctx.next().value as UseKind);
    }
    if (uses.length === 0) {
      ctx.fail(
        `Expected one or more room uses (${USE_KINDS.join("|")}) after "uses" but found ${ctx.peek().value ? `"${ctx.peek().value}"` : "end of input"}`,
        ctx.peek(),
      );
    }
    node.uses = uses;
  }
}

export const room: ElementDef = {
  kind: "room",
  keyword: "room",
  doc: "A room: a filled rectangle with a centered label and computed area.",
  params: [
    { name: "at", type: "point", optional: true, doc: "Absolute top-left corner (x, y) in mm." },
    {
      name: "right-of|left-of|below|above",
      type: "ref",
      optional: true,
      doc: "Place relative to another room by id (instead of `at`).",
    },
    {
      name: "align",
      type: "top|middle|bottom|left|center|right",
      optional: true,
      doc: "Edge to align with the reference room.",
    },
    {
      name: "gap",
      type: "number",
      optional: true,
      default: "0",
      doc: "Spacing (mm) from the reference room along the placement axis.",
    },
    {
      name: "polygon",
      type: "(x,y) (x,y) (x,y) …",
      optional: true,
      doc: "An implicitly-closed simple polygon of ≥3 vertices, instead of `at` + `size`.",
    },
    {
      name: "circle at … radius",
      type: "point + number",
      optional: true,
      doc: "A circular floor: centre (cx,cy) and radius R in mm, instead of `at` + `size`.",
    },
    { name: "size", type: "WxH", doc: "Width × height in mm (e.g. 4000x3000)." },
    { name: "label", type: "string", optional: true, doc: "Room label (supports {interpolation})." },
    {
      name: "label … at",
      type: "point",
      optional: true,
      doc: "Explicit label/area anchor — overrides the automatic centroid/pole placement.",
    },
  ],

  parse(ctx: ParseCtx): RoomNode {
    const kw = ctx.eatKeyword("room");
    const id = ctx.parseIdOpt();
    let at: RoomNode["at"];
    let rel: RoomNode["rel"];
    // —— `polygon (x,y) (x,y) (x,y) …` — the explicit-ring form (no `size`). ——
    if (ctx.isKeyword("polygon")) {
      ctx.eatKeyword("polygon");
      const polygon: ExprPoint[] = [];
      while (ctx.isType("lparen")) polygon.push(ctx.parsePoint());
      // A curved edge inside a polygon ring is DEFERRED, not silently dropped: the
      // ring's whole analysis layer (effective-vertex count, self-intersection,
      // centroid, adjacency) is written on literal vertices, and splicing a
      // tessellation in would make every one of those answers about a 48-gon. Say so.
      if (ctx.isKeyword("arc")) {
        ctx.fail(
          "An `arc` edge is not supported inside a `room polygon` ring yet (planned for v1.25) — " +
            "use `room circle at (cx,cy) radius R` for a round floor, or a curved `wall … { … arc (x,y) radius R … }` " +
            "with a straight-edged room behind it",
          ctx.peek(),
        );
      }
      if (polygon.length < 3) {
        ctx.fail(`A polygon room needs at least three vertices but found ${polygon.length}`, kw);
      }
      const node: RoomNode = { kind: "room", id, polygon, line: kw.line };
      parseTail(ctx, node);
      return node;
    }
    // —— `circle at (cx,cy) radius R` — the circular-floor form (no `size`). ——
    if (ctx.isKeyword("circle")) {
      ctx.eatKeyword("circle");
      ctx.eatKeyword("at");
      const c = ctx.parsePoint();
      ctx.eatKeyword("radius");
      const r = ctx.parseExpr();
      const node: RoomNode = { kind: "room", id, circle: { c, r }, line: kw.line };
      parseTail(ctx, node);
      return node;
    }
    if (ctx.isKeyword("at")) {
      ctx.eatKeyword("at");
      at = ctx.parsePoint();
    } else {
      // Relational clause: DIR REF [align EDGE] [gap EXPR].
      const dirTok = ctx.next();
      if (!REL_DIRS.has(dirTok.value)) {
        ctx.fail(
          `Expected "at" or a relational direction (right-of|left-of|below|above) but found "${dirTok.value}"`,
          dirTok,
        );
      }
      const ref = ctx.eatIdent().value;
      let align: RelAlign | undefined;
      let gap: Expr | undefined;
      if (ctx.isKeyword("align")) {
        ctx.next();
        align = ctx.eatIdent().value as RelAlign;
      }
      if (ctx.isKeyword("gap")) {
        ctx.next();
        gap = ctx.parseExpr();
      }
      rel = { dir: dirTok.value as RelDir, ref, align, gap };
    }
    ctx.eatKeyword("size");
    const size = ctx.parseDimensions();
    const node: RoomNode = { kind: "room", id, at, rel, size, line: kw.line };
    parseTail(ctx, node);
    return node;
  },

  idPrefix: () => "room",

  resolve(node, ctx: ResolveCtx): RRoom {
    const n = node as RoomNode;
    const id = ctx.id;
    if (n.circle) return resolveCircle(n, id, ctx);
    if (n.polygon) return resolvePolygon(n, id, ctx);
    if (n.at) {
      // —— Absolute / "manual" path — UNCHANGED, byte-identical to v0.11. ——
      const at = ctx.snapPt(ctx.evalPt(n.at));
      const size = { w: ctx.snap(ctx.eval(n.size!.w)), h: ctx.snap(ctx.eval(n.size!.h)) };
      if (size.w <= 0 || size.h <= 0) {
        ctx.diag({
          severity: "error",
          message: `Room "${id}" must have a positive size`,
          code: "E_ROOM_SIZE",
          span: n.span,
        });
      }
      return {
        kind: "room",
        id,
        at,
        size,
        label: n.label !== undefined ? ctx.evalStr(n.label) : undefined,
        ...(n.uses ? { uses: n.uses } : {}),
        span: n.span,
      };
    }
    // —— Relational path: position computed later by placeRelational(), in
    //    dependency order. `at` is a placeholder until then. ——
    const rel = n.rel!;
    const gap = rel.gap !== undefined ? ctx.eval(rel.gap) : 0;
    const size = { w: ctx.snap(ctx.eval(n.size!.w)), h: ctx.snap(ctx.eval(n.size!.h)) };
    if (size.w <= 0 || size.h <= 0) {
      ctx.diag({
        severity: "error",
        message: `Room "${id}" must have a positive size`,
        code: "E_ROOM_SIZE",
        span: n.span,
      });
    }
    return {
      kind: "room",
      id,
      at: { x: 0, y: 0 },
      size,
      label: n.label !== undefined ? ctx.evalStr(n.label) : undefined,
      ...(n.uses ? { uses: n.uses } : {}),
      span: n.span,
      _rel: { dir: rel.dir, ref: rel.ref, align: rel.align, gap, span: n.span },
    };
  },

  bounds(resolved): Point[] {
    const r = resolved as RRoom;
    if (r.poly) return r.poly;
    return rectCorners(r.at.x, r.at.y, r.size.w, r.size.h);
  },

  render(resolved, ctx: RenderCtx): SceneNode[] {
    const r = resolved as RRoom;
    const { theme, sizes } = ctx;
    const nodes: SceneNode[] = [];
    // A circular floor is drawn as a TRUE `circle` primitive (an SVG `<circle>`, a DXF
    // `CIRCLE`), so its edge is never faceted — the tessellated `poly` it also carries
    // exists for the grid/adjacency layer, not for the drawing.
    if (r.circle) {
      nodes.push({
        layer: "floor",
        prim: { t: "circle", center: r.circle.c, r: r.circle.r },
        paint: { fill: theme.roomFill },
      });
    } else {
      const c = r.poly ?? rectCorners(r.at.x, r.at.y, r.size.w, r.size.h);
      nodes.push({ layer: "floor", prim: { t: "polygon", pts: c }, paint: { fill: theme.roomFill } });
    }

    // Label/area anchor: the room centre for a rectangle, the circle's centre, the area
    // CENTROID for a polygon (closed form) — or, for the concave ring whose centroid lands
    // off its own floor, that ring's pole of inaccessibility (`polygonLabelPoint`, which
    // returns the centroid itself whenever the centroid is legal, so a convex ring's bytes
    // are untouched) — or the author's `label … at (x,y)`, which always wins.
    const centre =
      r.labelAt ??
      (r.circle
        ? r.circle.c
        : r.poly
          ? polygonLabelPoint(r.poly)
          : { x: r.at.x + r.size.w / 2, y: r.at.y + r.size.h / 2 });
    const cx = centre.x;
    const cy = centre.y;
    // Each shape keeps its OWN expression, written out rather than routed through one
    // helper: the rectangle's `(w/1000)*(h/1000)` and the polygon's shoelace differ from
    // an `area/1e6` rewrite by an ulp, and an ulp at a `.x5` boundary flips `toFixed(1)`
    // — so a "tidier" single expression would silently move an existing drawing's bytes.
    // A circle is πR², exact — never the 48-gon the grid layer uses (0.1% short).
    const areaM2 = r.circle
      ? ((Math.PI * r.circle.r * r.circle.r) / 1_000_000).toFixed(1)
      : r.poly
        ? (polygonArea(r.poly) / 1_000_000).toFixed(1)
        : ((r.size.w / 1000) * (r.size.h / 1000)).toFixed(1);
    if (r.label) {
      nodes.push({
        layer: "labels",
        prim: {
          t: "text",
          at: { x: cx, y: cy - sizes.roomFont * 0.2 },
          value: r.label,
          size: sizes.roomFont,
          anchor: "middle",
          baseline: "central",
          weight: 600,
        },
        paint: { fill: theme.roomLabel },
      });
    }
    nodes.push({
      layer: "labels",
      prim: {
        t: "text",
        at: { x: cx, y: cy + (r.label ? sizes.roomFont * 0.9 : 0) },
        value: `${areaM2} m²`,
        size: sizes.areaFont,
        anchor: "middle",
        baseline: "central",
      },
      paint: { fill: theme.areaLabel },
    });
    return nodes;
  },
};

/**
 * The `circle` form (v1.24). The resolved room carries THREE views of the same floor,
 * each for the consumer that needs it:
 *
 *  - `circle` — the exact centre + radius. `describe()` measures πR² from this, and the
 *    drawing emits a true `circle` primitive, so neither is ever a facet count.
 *  - `poly` — the 48-gon tessellation, so every ring-shaped consumer written for v1.23's
 *    polygon rooms (occupancy grid, circulation flood-fill, adjacency, containment,
 *    overlap) works VERBATIM on a curve with no second code path.
 *  - `at`/`size` — the bounding box, so every older rect-shaped consumer still reads a
 *    truthful extent.
 *
 * The one thing a consumer must not do is compute the AREA from `poly`: that is the
 * documented exact-vs-chordal split (docs/analysis.md).
 */
function resolveCircle(n: RoomNode, id: string, ctx: ResolveCtx): RRoom {
  const c = ctx.snapPt(ctx.evalPt(n.circle!.c));
  const rv = ctx.eval(n.circle!.r);
  const r = ctx.snap(rv) || rv;
  const label = n.label !== undefined ? ctx.evalStr(n.label) : undefined;
  if (!(r > 0)) {
    ctx.diag({
      severity: "error",
      message: `Room "${id}" must have a positive radius`,
      code: "E_ROOM_RADIUS",
      span: n.span,
    });
  }
  const rr = Math.max(0, r);
  const labelAt = n.labelAt ? ctx.snapPt(ctx.evalPt(n.labelAt)) : undefined;
  if (labelAt && rr > 0 && Math.hypot(labelAt.x - c.x, labelAt.y - c.y) > rr) {
    ctx.diag({
      severity: "warning",
      message: `Room "${id}" pins its label at (${labelAt.x}, ${labelAt.y}), which is outside the room`,
      code: "W_ROOM_LABEL_OUTSIDE",
      span: n.labelAtSpan ?? n.span,
    });
  }
  return {
    kind: "room",
    id,
    at: { x: c.x - rr, y: c.y - rr },
    size: { w: 2 * rr, h: 2 * rr },
    circle: { c, r: rr },
    poly: arcTessellate(fullCircleArc(c, rr)).slice(0, -1),
    ...(labelAt ? { labelAt } : {}),
    label,
    ...(n.uses ? { uses: n.uses } : {}),
    span: n.span,
  };
}

/**
 * The `polygon` form (v1.23). Vertices are grid-snapped like every other coordinate,
 * and the resolved room ALSO carries `at`/`size` = the ring's bounding box, so every
 * consumer written against a rectangle still reads a truthful extent (and the ones
 * that must not approximate a polygon check `poly` and either generalise or decline).
 *
 * Two errors are returned, never thrown: a ring with fewer than three *effective*
 * vertices (duplicates and straight-through points removed) draws no floor, and a
 * self-intersecting ring has no well-defined interior — so neither has an area,
 * a centroid or a containment test worth computing.
 */
function resolvePolygon(n: RoomNode, id: string, ctx: ResolveCtx): RRoom {
  const poly = n.polygon!.map((p) => ctx.snapPt(ctx.evalPt(p)));
  const effective = effectiveVertices(poly);
  const label = n.label !== undefined ? ctx.evalStr(n.label) : undefined;
  if (effective.length < 3) {
    ctx.diag({
      severity: "error",
      message: `Room "${id}" is a degenerate polygon — ${effective.length} effective vertices after removing duplicate and collinear points (3 are needed)`,
      code: "E_ROOM_POLY_DEGENERATE",
      span: n.span,
    });
  } else if (polygonSelfIntersects(effective)) {
    ctx.diag({
      severity: "error",
      message: `Room "${id}" is a self-intersecting polygon — its edges cross, so it has no well-defined floor`,
      code: "E_ROOM_POLY_SELF_INTERSECT",
      span: n.span,
    });
  }
  const bbox = polygonBounds(poly);
  const labelAt = n.labelAt ? ctx.snapPt(ctx.evalPt(n.labelAt)) : undefined;
  if (labelAt && effective.length >= 3 && !pointInPolygon(labelAt.x, labelAt.y, effective)) {
    ctx.diag({
      severity: "warning",
      message: `Room "${id}" pins its label at (${labelAt.x}, ${labelAt.y}), which is outside the room`,
      code: "W_ROOM_LABEL_OUTSIDE",
      span: n.labelAtSpan ?? n.span,
    });
  }
  return {
    kind: "room",
    id,
    at: { x: bbox.x, y: bbox.y },
    size: { w: bbox.w, h: bbox.h },
    poly,
    ...(labelAt ? { labelAt } : {}),
    label,
    ...(n.uses ? { uses: n.uses } : {}),
    span: n.span,
  };
}
