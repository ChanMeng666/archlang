/**
 * `outdoor [id=] <kind> (at (x,y) size WxH | polygon (x,y) …) [label "…"] [rail <edges>]`
 * — a ground surface OUTSIDE the building: lawn, planting, paving, deck, gravel, water,
 * driveway, patio, balcony.
 *
 * ## What it is, and what it deliberately is NOT
 *
 * It is a **drawn and measured area that is not a room**, and every one of those words is
 * load-bearing:
 *
 *  - **Not a room.** It never enters `describe().rooms`, `totals.floor_area_m2`, the
 *    drawn `schedule rooms` table, the door access graph, or Plan JSON. A terrace is not
 *    floor area, and a summary that quietly added 40 m² of lawn to a dwelling's floor
 *    figure would be wrong in the one number every downstream consumer trusts. Its own
 *    area is reported separately, in `describe().outdoor[]` and `totals.outdoor_area_m2`,
 *    and never mixed in.
 *  - **Not a wall or an obstacle.** It obstructs nothing. It contributes nothing to the
 *    nav grid, to the circulation flood fill, or to any clearance rule. You can walk on a
 *    lawn; a v1 that decided otherwise for `water` would have to decide it for a pond
 *    with a bridge next, so the whole question is deferred by name (see `docs/backlog.md`)
 *    rather than half-answered.
 *  - **It IS part of the drawing.** It joins {@link ElementDef.bounds}, so a plan's page
 *    (and, on a `paper` plan, its auto-fit scale) contains the ground. That is exactly
 *    what a `roof` already does, and the consequence is the same and is pinned by test: a
 *    plan with NO `paper` sizes every stroke from its own extent, so putting a garden
 *    round a house rescales the line weights. A site plan wants a `paper` declaration.
 *
 * ## Two spellings, one element
 *
 * `at (x,y) size WxH` for the rectangle most terraces are; `polygon (x,y) …` for the ring
 * most garden edges are, taken verbatim and implicitly closed. Never both — the parser
 * takes whichever word follows the kind, the `room` precedent exactly.
 *
 * **A derived position comes from the SHAPE, never from the bounding box.** The resolved
 * element carries `at`/`size` even on the polygon spelling (a great deal of shared code
 * indexes by box), but the area is the exact shoelace, the label point is
 * `polygonLabelPoint` — the pole of inaccessibility, which returns the centroid whenever
 * the centroid is legal — and containment is `pointInPolygon`. This is the v1.25 defect
 * class stated for a new element before it can produce an instance of it.
 *
 * ## Tint UNDER hatch
 *
 * A surface draws as TWO nodes on the `floor` pass: a flat tint polygon, then the
 * material hatch over it. The hatch patterns for ground materials paint no background
 * (see `src/hatches.ts`), so the tint shows through and one pattern serves every theme.
 * The alternative — a per-kind pattern background — would have needed a pattern set per
 * theme and a second copy of the palette. `balcony` takes no hatch at all: it is a
 * structural slab, not a ground surface, and reads as a plain tint with a railing.
 *
 * ## The railing
 *
 * `balcony` rails every edge that has no wall behind it, and the probe is one wall
 * thickness off the edge's own MIDPOINT — the shape, not the box (they coincide for a
 * rectangle, which is what `balcony` is restricted to, but stating the rule here is what
 * keeps it right when the polygon balcony that is deferred by name arrives). `rail
 * <edges>` overrides the derivation outright; on any other kind it is `E_OUTDOOR_RAIL`,
 * refused rather than ignored, the `E_DOOR_KIND_CLAUSE` precedent.
 */

import type { ExprPoint, OutdoorKind, OutdoorNode, Point, RailEdge, RailSide } from "../ast.js";
import { OUTDOOR_KINDS, RAIL_EDGES, RAIL_SIDES } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import { weightWidth } from "../scene.js";
import type { ROutdoor, RWall } from "../ir.js";
import { distPointToWallSegment, rectCorners, segmentsOfWall } from "../geometry.js";
import {
  effectiveVertices,
  polygonArea,
  polygonBounds,
  polygonLabelPoint,
  polygonSelfIntersects,
} from "../geometry/polygon.js";
import { closest } from "../expr.js";
import { patternId } from "../hatches.js";

/**
 * CAD layers. Three, not one, because a CAD user freezes by trade: planting is the
 * landscape architect's layer (`L-PLNT`), hard landscape is the site layer (`L-SITE`),
 * and a balcony is part of the building's floor plate (`A-FLOR-BALC`) rather than of the
 * site at all.
 *
 * Exported because `src/label-placement.ts` must skip them all, for the same reason it
 * skips `A-ROOF`: a ground surface is drawn on a pass the label-relocation post-pass
 * treats as an obstacle, and a lawn that encloses the whole building would otherwise bury
 * every room label in the plan and shove all of them at once. Ground is BELOW everything;
 * text sits on it perfectly well.
 */
export const PLANTING_LAYER = "L-PLNT";
export const SITE_LAYER = "L-SITE";
export const BALCONY_LAYER = "A-FLOR-BALC";

/** Every layer an `outdoor` surface may land on — the set `label-placement.ts` skips. */
export const OUTDOOR_LAYERS: readonly string[] = [PLANTING_LAYER, SITE_LAYER, BALCONY_LAYER];

/**
 * Per-kind rendering data: which hatch material fills it, which theme tint sits under
 * that, and which CAD layer it lands on.
 *
 * One table, so nothing anywhere else switches on a kind. `material: null` means "no
 * hatch" — `balcony` only.
 */
interface GroundSpec {
  material: string | null;
  tint: "lawn" | "water" | "paving";
  layer: string;
}

const GROUND: Readonly<Record<OutdoorKind, GroundSpec>> = {
  lawn: { material: "grass", tint: "lawn", layer: PLANTING_LAYER },
  planting: { material: "planting", tint: "lawn", layer: PLANTING_LAYER },
  paving: { material: "paving", tint: "paving", layer: SITE_LAYER },
  deck: { material: "deck", tint: "paving", layer: SITE_LAYER },
  gravel: { material: "gravel", tint: "paving", layer: SITE_LAYER },
  water: { material: "water", tint: "water", layer: SITE_LAYER },
  driveway: { material: "tarmac", tint: "paving", layer: SITE_LAYER },
  // A patio IS paved — same surface, a different word for where it sits — so it shares
  // the pattern rather than getting a near-duplicate of it. One legend row covers both,
  // which is correct: the legend names materials, not places.
  patio: { material: "paving", tint: "paving", layer: SITE_LAYER },
  balcony: { material: null, tint: "paving", layer: BALCONY_LAYER },
};

/** The hatch material a kind fills with, or null when it takes none. */
export function groundMaterial(kind: OutdoorKind): string | null {
  return GROUND[kind].material;
}

/**
 * The distinct ground materials a set of surfaces uses, in first-appearance order.
 *
 * `scene-build.ts` feeds this to `hatchesUsed`, which is what puts a ground pattern in
 * the SVG `<defs>` and a row in the legend. Without it every ground fill would be a
 * DANGLING `url(#…)` — the reference present, the pattern never emitted — and the surface
 * would render as nothing at all in every viewer.
 */
export function groundMaterialsUsed(outdoors: readonly ROutdoor[]): string[] {
  const out: string[] = [];
  for (const o of outdoors) {
    const m = GROUND[o.surface].material;
    if (m !== null && !out.includes(m)) out.push(m);
  }
  return out;
}

/** The outward unit normal of one rectangle edge, in page terms (+x right, +y down). */
const EDGE_NORMAL: Readonly<Record<RailSide, Point>> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** The MIDPOINT of one rectangle edge — the probe origin. Derived from the four corners,
 *  so the same expression serves a polygon balcony the day one is allowed. */
function edgeMidpoint(at: Point, size: { w: number; h: number }, side: RailSide): Point {
  const cx = at.x + size.w / 2;
  const cy = at.y + size.h / 2;
  switch (side) {
    case "top":
      return { x: cx, y: at.y };
    case "bottom":
      return { x: cx, y: at.y + size.h };
    case "left":
      return { x: at.x, y: cy };
    case "right":
      return { x: at.x + size.w, y: cy };
  }
}

/**
 * Which edges of a balcony carry a railing, DERIVED: every edge with no wall along it.
 *
 * The question is asked at the edge's own MIDPOINT — the shape, never the bounding box —
 * and it is asked as *proximity*, not as an outward probe: an edge is against a wall when
 * its midpoint lies within half that wall's thickness of the wall's centreline, i.e. when
 * the edge is inside the wall band. A balcony hung off a facade has one such edge and
 * three in the air; a free-standing one has four in the air.
 *
 * ## Why proximity and not an outward probe
 *
 * The first implementation pushed the midpoint one full wall thickness along the edge's
 * outward normal and asked whether the probe point was covered. That is wrong twice over,
 * and the test caught it immediately: a wall band reaches only HALF a thickness either
 * side of its centreline, so a full-thickness probe always lands past the far face and
 * every edge reads as free — and the answer also depended on whether the author had
 * written the balcony against the wall's centreline or against its outer face, two
 * spellings of the same building.
 *
 * Proximity has neither problem. It is orientation-free (no normal, so no sign to get
 * wrong), it accepts both authoring conventions — a balcony drawn to the centreline is at
 * distance 0, one drawn to the outer face is at exactly `t/2` — and it says the thing the
 * rule actually means: *is there a wall along this edge?*
 *
 * The `+ 1` is a millimetre of slack so the outer-face convention, which lands exactly on
 * the boundary, is not decided by a floating-point comparison.
 */
function deriveRail(at: Point, size: { w: number; h: number }, walls: readonly RWall[]): RailSide[] {
  const segs = walls.flatMap((w) => segmentsOfWall(w).map((s) => ({ s, t: w.thickness })));
  const out: RailSide[] = [];
  for (const side of RAIL_SIDES) {
    const m = edgeMidpoint(at, size, side);
    const against = segs.some(({ s, t }) => distPointToWallSegment(m, s) <= t / 2 + 1);
    if (!against) out.push(side);
  }
  return out;
}

/** Expand an authored `rail` word list to the concrete side set it means. */
function railSides(words: readonly RailEdge[]): RailSide[] {
  if (words.includes("none")) return [];
  if (words.includes("all")) return [...RAIL_SIDES];
  // Canonical order, not source order, so `rail right top` and `rail top right` produce
  // one drawing and one `describe()` row.
  return RAIL_SIDES.filter((s) => (words as readonly string[]).includes(s));
}

export const outdoor: ElementDef = {
  kind: "outdoor",
  keyword: "outdoor",
  doc: "A ground surface outside the building: lawn, paving, deck, water, a balcony.",
  params: [
    { name: "kind", type: OUTDOOR_KINDS.join("|"), doc: "Which ground surface this is." },
    { name: "at", type: "point", optional: true, doc: "Top-left corner (x, y), with `size`." },
    { name: "size", type: "WxH", optional: true, doc: "Width x height in mm, with `at`." },
    {
      name: "polygon",
      type: "point…",
      optional: true,
      doc: "An explicit, implicitly-closed ring instead of at+size — at least 3 effective vertices.",
    },
    { name: "label", type: "string", optional: true, doc: "Printed name, drawn with the area beneath it." },
    {
      name: "rail",
      type: RAIL_EDGES.join("|"),
      optional: true,
      default: "every edge with no wall behind it",
      doc: "Which edges of a `balcony` carry a railing. Repeatable; `balcony` only.",
    },
  ],

  parse(ctx: ParseCtx): OutdoorNode {
    const kw = ctx.eatKeyword("outdoor");
    const id = ctx.parseIdOpt();
    const kindTok = ctx.eatIdent();
    if (!(OUTDOOR_KINDS as readonly string[]).includes(kindTok.value)) {
      const hint = closest(kindTok.value, [...OUTDOOR_KINDS]);
      ctx.fail(
        `Unknown outdoor kind "${kindTok.value}"${hint ? ` — did you mean "${hint}"?` : ""} ` +
          `(available: ${OUTDOOR_KINDS.join(", ")})`,
        kindTok,
      );
    }
    const surface = kindTok.value as OutdoorKind;

    const node: OutdoorNode = { kind: "outdoor", id, surface, line: kw.line };
    // The word after the kind picks the spelling, exactly as it does after `room`.
    if (ctx.isKeyword("polygon")) {
      ctx.eatKeyword("polygon");
      const polygon: ExprPoint[] = [];
      while (ctx.isType("lparen")) polygon.push(ctx.parsePoint());
      if (polygon.length < 3) {
        ctx.fail("An `outdoor … polygon` needs at least 3 points — `polygon (x,y) (x,y) (x,y) …`", ctx.peek());
      }
      node.polygon = polygon;
    } else {
      ctx.eatKeyword("at");
      node.at = ctx.parsePoint();
      ctx.eatKeyword("size");
      node.size = ctx.parseDimensions();
    }

    if (ctx.isKeyword("label")) {
      ctx.next();
      node.label = ctx.parseStringExpr();
    }
    if (ctx.isKeyword("rail")) {
      const railKw = ctx.next();
      const words: RailEdge[] = [];
      // Repeatable and comma-separated alike: `rail top left`, `rail top, left`. Both
      // spellings read naturally and neither is ambiguous, so refusing one would be a
      // rule with no reader behind it.
      for (;;) {
        const t = ctx.peek();
        if (t.type !== "ident" || !(RAIL_EDGES as readonly string[]).includes(t.value)) break;
        ctx.next();
        words.push(t.value as RailEdge);
        if (ctx.isType("comma")) ctx.next();
      }
      if (words.length === 0) {
        ctx.fail(`A \`rail\` clause needs at least one edge (${RAIL_EDGES.join("|")})`, ctx.peek());
      }
      node.rail = words;
      node.railSpan = { start: railKw.start, end: ctx.peek(-1).end };
    }
    return node;
  },

  idPrefix: (node) => (node as OutdoorNode).surface,

  resolve(node, ctx: ResolveCtx): ROutdoor {
    const n = node as OutdoorNode;
    const id = ctx.id;
    const label = n.label !== undefined ? ctx.evalStr(n.label) : undefined;

    const base = (extra: Partial<ROutdoor>): ROutdoor => ({
      kind: "outdoor",
      id,
      surface: n.surface,
      at: { x: 0, y: 0 },
      size: { w: 0, h: 0 },
      ...(label !== undefined ? { label } : {}),
      span: n.span,
      ...extra,
    });

    // `rail` is balcony-only and rectangle-only, and it REFUSES rather than being
    // ignored: a clause with no meaning for the kind it was written on is an error, not a
    // silently dropped word (the `E_DOOR_KIND_CLAUSE` rule, one element over).
    if (n.rail && n.surface !== "balcony") {
      ctx.diag({
        severity: "error",
        message:
          `Outdoor surface "${id}" is a \`${n.surface}\`, which has no railing — \`rail\` applies to ` +
          `\`balcony\` only. Delete the clause, or make this an \`outdoor balcony\`.`,
        code: "E_OUTDOOR_RAIL",
        span: n.railSpan ?? n.span,
      });
    }

    if (n.polygon) {
      const ring = n.polygon.map((p) => ctx.snapPt(ctx.evalPt(p)));
      const effective = effectiveVertices(ring);
      if (effective.length < 3) {
        ctx.diag({
          severity: "error",
          message:
            `Outdoor surface "${id}" is a degenerate ring — ${effective.length} effective vertices after ` +
            `removing duplicate and collinear points (3 are needed)`,
          code: "E_OUTDOOR_POLY_DEGENERATE",
          span: n.span,
        });
        return base({});
      }
      if (polygonSelfIntersects(effective)) {
        ctx.diag({
          severity: "error",
          message: `Outdoor surface "${id}" has a self-intersecting ring — its edges cross, so it encloses no single area`,
          code: "E_OUTDOOR_POLY_SELF_INTERSECT",
          span: n.span,
        });
        return base({});
      }
      // A balcony is rectangle-only in v1 (the rail derivation and the frame transform are
      // both written on four named edges), so the ring spelling is refused rather than
      // silently railed wrong. Deferred by name in `docs/backlog.md`.
      if (n.surface === "balcony") {
        ctx.diag({
          severity: "error",
          message:
            `Outdoor surface "${id}" is a \`balcony\`, which is rectangle-only — a railing is derived per ` +
            `EDGE (top/bottom/left/right) and a ring has no such edges. Use \`at (x,y) size WxH\`.`,
          code: "E_OUTDOOR_POLY_DEGENERATE",
          span: n.span,
        });
        return base({});
      }
      const b = polygonBounds(ring);
      return base({ at: { x: b.x, y: b.y }, size: { w: b.w, h: b.h }, poly: ring });
    }

    const at = ctx.snapPt(ctx.evalPt(n.at!));
    const size = { w: ctx.snap(ctx.eval(n.size!.w)), h: ctx.snap(ctx.eval(n.size!.h)) };
    if (size.w <= 0 || size.h <= 0) {
      ctx.diag({
        severity: "error",
        message: `Outdoor surface "${id}" must have a positive size`,
        code: "E_OUTDOOR_SIZE",
        span: n.span,
      });
      return base({ at, size });
    }

    if (n.surface !== "balcony") return base({ at, size });

    // Rail: the authored clause wins outright; otherwise derive from the walls. An
    // authored `rail none` is a real answer (an in-ground terrace, a Juliet slab drawn
    // without its balustrade), so the empty list is a value and not a fall-through.
    if (n.rail) {
      const words = n.rail;
      const bad = words.filter((w) => !(RAIL_EDGES as readonly string[]).includes(w));
      if (bad.length > 0) {
        ctx.diag({
          severity: "error",
          message: `Outdoor surface "${id}" names unknown rail edge(s) ${bad.map((w) => `"${w}"`).join(", ")} (available: ${RAIL_EDGES.join(", ")})`,
          code: "E_OUTDOOR_RAIL",
          span: n.railSpan ?? n.span,
        });
      }
      return base({ at, size, rail: railSides(words) });
    }
    return base({ at, size, rail: deriveRail(at, size, ctx.walls), railDerived: true });
  },

  bounds(resolved): Point[] {
    const o = resolved as ROutdoor;
    if (o.poly) return o.poly.map((p) => ({ ...p }));
    if (o.size.w <= 0 || o.size.h <= 0) return [];
    return rectCorners(o.at.x, o.at.y, o.size.w, o.size.h);
  },

  render(resolved, ctx: RenderCtx): SceneNode[] {
    const o = resolved as ROutdoor;
    const { theme, sizes } = ctx;
    const spec = GROUND[o.surface];
    const ring = o.poly ?? (o.size.w > 0 && o.size.h > 0 ? rectCorners(o.at.x, o.at.y, o.size.w, o.size.h) : null);
    if (!ring) return [];

    const nodes: SceneNode[] = [];
    const on = (n: Omit<SceneNode, "layer" | "layerName">): SceneNode => ({
      layer: "floor",
      layerName: spec.layer,
      ...n,
    });

    // 1. The flat tint. Under everything, including the hatch drawn over it.
    nodes.push(on({ prim: { t: "polygon", pts: ring.map((p) => ({ ...p })) }, paint: { fill: theme[spec.tint] } }));

    // 2. The material hatch, over the tint (ground patterns paint no background of their
    //    own — see `src/hatches.ts`). Emitted as the same `hatch` primitive the wall poché
    //    uses, so all four backends draw it from code that already exists: the SVG one
    //    references the `<pattern>`, the DXF one emits a real HATCH entity.
    if (spec.material !== null) {
      nodes.push(
        on({
          prim: {
            t: "hatch",
            region: [ring.map((p) => ({ ...p }))],
            material: spec.material,
            scale: 1,
            angle: 0,
          },
          // The `hatch` primitive does NOT paint itself from `prim.material`: the
          // pattern REFERENCE lives in the paint, exactly as `wall-lowering.ts` sets it,
          // and the SVG serializer only writes out what the paint says. A node that
          // named the material and left `fill: "none"` renders a completely invisible
          // surface with a perfectly valid pattern sitting unused in the defs.
          paint: { fill: `url(#${patternId(spec.material)})`, fillRule: "nonzero" },
        }),
      );
    }

    // 3. The edge. Thin and muted: a ground boundary is site information and must not
    //    compete with the wall lines.
    nodes.push(
      on({
        prim: { t: "polygon", pts: ring.map((p) => ({ ...p })) },
        lineWeight: "extraThin",
        paint: { fill: "none", stroke: theme.outdoorStroke, width: weightWidth("extraThin", sizes) },
      }),
    );

    // 4. The railing, on the derived or authored edges.
    for (const side of o.rail ?? []) nodes.push(...railNodes(o, side, ctx, spec.layer));

    // 5. Label + area, at the pole of inaccessibility for a ring and the centre for a
    //    rectangle — the SHAPE, never the bounding box. Both on the `labels` pass, which
    //    is what lets the label-placement post-pass move them off a fixture if one is
    //    drawn over the ground.
    const c = o.poly ? polygonLabelPoint(o.poly) : { x: o.at.x + o.size.w / 2, y: o.at.y + o.size.h / 2 };
    // The rectangle keeps its own `(w/1000)*(h/1000)` and the ring its own shoelace, for
    // exactly the reason `room` does: an `area/1e6` rewrite differs by an ulp, and an ulp
    // at a `.x5` boundary flips `toFixed(1)`.
    const areaM2 = o.poly
      ? (polygonArea(o.poly) / 1_000_000).toFixed(1)
      : ((o.size.w / 1000) * (o.size.h / 1000)).toFixed(1);
    if (o.label !== undefined) {
      nodes.push({
        layer: "labels",
        layerName: spec.layer,
        prim: {
          t: "text",
          at: { x: c.x, y: c.y - sizes.furnFont * 0.2 },
          value: o.label,
          size: sizes.furnFont,
          anchor: "middle",
          baseline: "central",
          weight: 600,
        },
        paint: { fill: theme.outdoorStroke },
      });
      // The area rides WITH the label and only with it. An unlabelled lawn is background,
      // and stamping a number on every patch of ground would bury a small site plan in
      // figures nobody asked for — whereas a room, which is always the subject of its own
      // drawing, always shows one.
      nodes.push({
        layer: "labels",
        layerName: spec.layer,
        prim: {
          t: "text",
          at: { x: c.x, y: c.y + sizes.furnFont * 0.9 },
          value: `${areaM2} m²`,
          size: sizes.furnFont * 0.85,
          anchor: "middle",
          baseline: "central",
        },
        paint: { fill: theme.outdoorStroke },
      });
    }
    return nodes;
  },
};

/**
 * A railing on one edge: two thin parallel lines (the balustrade) with post ticks across
 * them at a derived pitch.
 *
 * The pitch is a nominal 1200 mm clamped so a short edge still gets at least two posts
 * and a long one does not turn into a comb — derived from the edge's own length, never
 * from the drawing's, so two balconies of the same size rail identically wherever they
 * sit on the sheet.
 */
function railNodes(o: ROutdoor, side: RailSide, ctx: RenderCtx, layer: string): SceneNode[] {
  const { theme, sizes } = ctx;
  const [a, b] = edgeEndpoints(o.at, o.size, side);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len <= 0) return [];
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const n = EDGE_NORMAL[side];
  // The balustrade sits just INSIDE the slab edge, which is where a railing is built.
  const depth = Math.min(len / 8, sizes.thin * 6);
  const off = (d: number): [Point, Point] => [
    { x: a.x - n.x * d, y: a.y - n.y * d },
    { x: b.x - n.x * d, y: b.y - n.y * d },
  ];
  const width = weightWidth("extraThin", sizes);
  const line = (p: [Point, Point]): SceneNode => ({
    layer: "furniture",
    layerName: layer,
    prim: { t: "line", a: p[0], b: p[1] },
    lineWeight: "extraThin",
    paint: { fill: "none", stroke: theme.outdoorStroke, width },
  });
  const nodes: SceneNode[] = [line(off(0)), line(off(depth))];

  const posts = Math.max(2, Math.min(24, Math.round(len / 1200)));
  for (let i = 0; i <= posts; i++) {
    const t = (len * i) / posts;
    const p0 = { x: a.x + ux * t, y: a.y + uy * t };
    const p1 = { x: p0.x - n.x * depth, y: p0.y - n.y * depth };
    nodes.push(line([p0, p1]));
  }
  return nodes;
}

/** The two endpoints of one rectangle edge, in page order (smaller coordinate first). */
function edgeEndpoints(at: Point, size: { w: number; h: number }, side: RailSide): [Point, Point] {
  const x0 = at.x;
  const y0 = at.y;
  const x1 = at.x + size.w;
  const y1 = at.y + size.h;
  switch (side) {
    case "top":
      return [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
      ];
    case "bottom":
      return [
        { x: x0, y: y1 },
        { x: x1, y: y1 },
      ];
    case "left":
      return [
        { x: x0, y: y0 },
        { x: x0, y: y1 },
      ];
    case "right":
      return [
        { x: x1, y: y0 },
        { x: x1, y: y1 },
      ];
  }
}
