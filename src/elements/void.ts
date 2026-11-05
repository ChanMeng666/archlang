/**
 * `void [id=] (at (x,y) size WxH | polygon (x,y) …) [rail <edges>]` — a hole in this
 * storey's floor plate.
 *
 * A stair well, a double-height living room, an atrium: the part of the plan where there
 * is no floor. Drawn as the conventional dashed outline crossed by both diagonals (of each
 * rectangle it is made of), on `A-FLOR-OVHD`.
 *
 * ## Three decisions worth stating, because each one could have gone the other way
 *
 * **It rides the `furniture` pass.** Not for want of an annotation layer, but because the
 * label-relocation post-pass (`src/label-placement.ts`) treats every node on a drawn pass
 * as something a room name may not sit under. A void is exactly that — a name printed
 * across a hole is a worse drawing than a name nudged aside — so riding a pass that is
 * already an obstacle gets the right behaviour with no new rule. Its CAD layer is its own
 * (`A-FLOR-OVHD`, the AIA layer for what is overhead/open), so a CAD user can freeze the
 * voids without freezing the furniture.
 *
 * **It OBSTRUCTS circulation, with its halo suppressed on every side.** You cannot walk
 * across a hole, so the cells inside it are blocked; but you can stand at the railing, so
 * the body-radius halo that keeps a walker off a piece of furniture is switched off on all
 * four edges (`VerticalObstacle.open`, the mechanism a stair's entry edge already uses).
 * Blocking the approach as well would report a landing beside an atrium as unreachable.
 * A `rail` clause changes none of this: it draws.
 *
 * **It does NOT subtract from the room's area.** A room's area is the floor area of the
 * room, and it is the number `describe()`, `schedule rooms` and the drawn area label all
 * report. Deducting a well from it would leave the drawing and the table disagreeing about
 * a figure neither of them measures — and "the area of a double-height living room" is
 * genuinely the whole room in every schedule this language is modelled on. Read
 * `describe().voids[]` beside the room if you need the net.
 *
 * ## The ring (plan decision CR-D8)
 *
 * `polygon` takes a ring whose every edge is horizontal or vertical — an L, a U, a notch —
 * and cuts it once, at resolve, into the cells of the grid its own corners make: every
 * rectangle between two consecutive distinct corner x's and y's that lies inside it. That set
 * is the frame's to carry: turning or mirroring the ring turns or mirrors its cells, which a
 * cut along one page axis (`ringParts`' slabs) would not, so the drawing, the railing's depth
 * and `describe()`'s room are the same however the void is placed. The readers that are
 * written on rectangles (the nav grid, lint, `finish`, the 3D slab) read those cells through
 * {@link voidPieces}; the readers that already take a ring read `poly` instead (`walls from
 * rooms`' hole cover, `roomBox` in the window-sill and opening-schedule probes, the enclosure
 * cover, the symmetry fact). A rectangle void is its own one piece and has no `poly`, so
 * nothing that reads one changes. A slanted ring is refused (`E_VOID_POLY`).
 *
 * ## The railing
 *
 * Opt-in: no `rail`, no railing (every void written before it existed draws as it did).
 * The rectangle names its sides as a `balcony` does; the ring numbers its edges — edge `n`
 * runs from point `n` to point `n+1`, 0-based like a wall's `segment <n>` — because an L
 * has two edges facing the same way and a stair may arrive across one of them. Each railed
 * edge draws the balcony's railing symbol ({@link railRun}) on the hole's side of the slab
 * edge, so its ink stays inside the ring and {@link voidEl}`.bounds()` stays the ring. It
 * has no height and makes no structural claim.
 */

import type { ExprPoint, Point, RailEdge, RailSide, VoidNode } from "../ast.js";
import { RAIL_EDGES, RAIL_SIDES } from "../ast.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx, TransformCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import { weightWidth } from "../scene.js";
import type { RVoid } from "../ir.js";
import { rectCorners } from "../geometry.js";
import { effectiveVertices, polygonBounds, polygonSelfIntersects, polygonSignedArea2 } from "../geometry/polygon.js";
import { fmtSource } from "../num-format.js";
import { chargeSteps } from "../expr.js";
import { rectilinear, ringParts, sortSteps } from "../room-tiling.js";
import { dashedPattern, MAX_RAIL_POSTS, railRun } from "./glyph-lib.js";
import { railSides } from "./outdoor.js";

/** The CAD layer a floor void lands on — AIA's "overhead/open" floor layer. */
export const VOID_LAYER = "A-FLOR-OVHD";

/** The CAD layer a void's railing lands on — AIA's "handrails, guard rails" floor layer. */
export const VOID_RAIL_LAYER = "A-FLOR-HRAL";

/**
 * The rectangles a void's hole is made of: the void itself, or, on the `polygon` spelling,
 * one rectangle void per grid cell of its ring (same id and span). The route a reader written
 * on rectangles takes, so none of them reads a ring's bounding box.
 */
export function voidPieces(v: RVoid): RVoid[] {
  if (!v.parts) return [v];
  return v.parts.map((p) => ({ kind: "void", id: v.id, at: { ...p.at }, size: { ...p.size }, span: v.span }));
}

/**
 * A ring's pieces as the IR carries them — the grid cells inside it, in page order — or
 * undefined when the ring is not rectilinear. `ringParts` gives the horizontal slabs between
 * consecutive corner y's; each slab is then cut at every corner x inside it. Charged per cell
 * before it is allocated.
 */
function piecesOfRing(ring: readonly Point[]): RVoid["parts"] {
  const eff = effectiveVertices(ring);
  const slabs = ringParts(eff);
  if (!slabs) return undefined;
  chargeSteps(sortSteps(eff.length) + eff.length);
  const xs = [...new Set(eff.map((p) => p.x))].sort((a, b) => a - b);
  const out: NonNullable<RVoid["parts"]> = [];
  for (const s of slabs) {
    const cuts = [s.x0, ...xs.filter((x) => x > s.x0 && x < s.x1), s.x1];
    chargeSteps(xs.length + cuts.length);
    for (let k = 0; k + 1 < cuts.length; k++) {
      out.push({ at: { x: cuts[k]!, y: s.y0 }, size: { w: cuts[k + 1]! - cuts[k]!, h: s.y1 - s.y0 } });
    }
  }
  return out;
}

/** One edge of the outline, as the railing reads it: its ends and its outward unit normal. */
interface Edge {
  a: Point;
  b: Point;
  n: Point;
  railed: boolean;
}

/** The outline's edges in ring order: the rectangle's top, right, bottom, left, or the ring's. */
function edgesOf(v: RVoid): Edge[] {
  if (!v.poly) {
    const [tl, tr, br, bl] = rectCorners(v.at.x, v.at.y, v.size.w, v.size.h) as [Point, Point, Point, Point];
    const on = new Set(v.rail ?? []);
    return [
      { a: tl, b: tr, n: { x: 0, y: -1 }, railed: on.has("top") },
      { a: tr, b: br, n: { x: 1, y: 0 }, railed: on.has("right") },
      { a: br, b: bl, n: { x: 0, y: 1 }, railed: on.has("bottom") },
      { a: bl, b: tl, n: { x: -1, y: 0 }, railed: on.has("left") },
    ];
  }
  const ring = v.poly;
  // The outward side from the ring's own winding (the shoelace sign), never from a box.
  const clockwiseOnPage = polygonSignedArea2(ring) > 0; // positive = clockwise, y down
  const on = new Set(v.railEdges ?? []);
  return ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    const ux = Math.sign(b.x - a.x);
    const uy = Math.sign(b.y - a.y);
    const n = clockwiseOnPage ? { x: uy, y: -ux } : { x: -uy, y: ux };
    return { a, b, n, railed: on.has(i) };
  });
}

/**
 * How far into the hole the inner rail runs: six pens, or a quarter of the narrowest piece
 * when that is less, one figure for the whole void so two railed edges meet on one line. The
 * pieces are the ring's grid cells, a set the frame carries onto itself, so the depth is the
 * same however the void is turned or mirrored.
 */
function railDepthOf(v: RVoid, thin: number): number {
  let narrowest = Infinity;
  for (const p of voidPieces(v)) narrowest = Math.min(narrowest, p.size.w, p.size.h);
  return Math.min(thin * 6, narrowest / 4);
}

/**
 * How far the inner rail of `edges[i]` moves at one end: by the depth where the neighbouring
 * edge is railed too (inward at a convex corner, outward round a reflex one), else not at all.
 * Zero-length edges are stepped over; a straight-through neighbour needs no move.
 */
function cornerShift(edges: readonly Edge[], i: number, step: 1 | -1, depth: number): number {
  const e = edges[i]!;
  const k = edges.length;
  for (let j = 1; j < k; j++) {
    const f = edges[(i + step * j + k * k) % k]!;
    if (f.a.x === f.b.x && f.a.y === f.b.y) continue;
    if (!f.railed) return 0;
    // The neighbour's direction AWAY from the shared corner.
    const away = step === 1 ? { x: f.b.x - f.a.x, y: f.b.y - f.a.y } : { x: f.a.x - f.b.x, y: f.a.y - f.b.y };
    const into = -(away.x * e.n.x + away.y * e.n.y);
    return into > 0 ? depth : into < 0 ? -depth : 0;
  }
  return 0;
}

/** The railing nodes of a void, one {@link railRun} per railed edge. */
function railNodesOf(v: RVoid, ctx: RenderCtx): SceneNode[] {
  if (!(v.rail?.length || v.railEdges?.length)) return [];
  const { theme, sizes } = ctx;
  const edges = edgesOf(v);
  const depth = railDepthOf(v, sizes.thin);
  const width = weightWidth("extraThin", sizes);
  const line = (p: [Point, Point]): SceneNode => ({
    layer: "furniture",
    layerName: VOID_RAIL_LAYER,
    prim: { t: "line", a: p[0], b: p[1] },
    lineWeight: "extraThin",
    paint: { fill: "none", stroke: theme.annotation, width },
  });
  const out: SceneNode[] = [];
  edges.forEach((e, i) => {
    if (!e.railed) return;
    out.push(...railRun(e.a, e.b, e.n, depth, cornerShift(edges, i, -1, depth), cornerShift(edges, i, 1, depth), line));
  });
  return out;
}

/** How many edges the void rails. */
const railCount = (v: RVoid): number => (v.rail?.length ?? 0) + (v.railEdges?.length ?? 0);

export const voidEl: ElementDef = {
  kind: "void",
  keyword: "void",
  doc: "A hole in this storey's floor: a dashed outline crossed by its diagonals, optionally railed.",
  params: [
    { name: "at", type: "point", optional: true, doc: "Top-left corner (x, y) of the opening, in mm, with `size`." },
    { name: "size", type: "WxH", optional: true, doc: "Width × height of the opening in mm, with `at`." },
    {
      name: "polygon",
      type: "point…",
      optional: true,
      doc: "An implicitly-closed ring instead of at+size, every edge horizontal or vertical (an L).",
    },
    {
      name: "rail",
      type: `${RAIL_EDGES.join("|")}|<n>`,
      optional: true,
      default: "no railing",
      doc: "Which edges carry a railing: sides on the rectangle; `all`, `none` or edge numbers (0-based, point n to n+1) on the ring. A `none` among the words wins, then an `all`, as on a balcony.",
    },
  ],

  parse(ctx: ParseCtx): VoidNode {
    const kw = ctx.eatKeyword("void");
    const id = ctx.parseIdOpt();
    const node: VoidNode = { kind: "void", id, line: kw.line };
    if (ctx.isKeyword("polygon")) {
      ctx.eatKeyword("polygon");
      const polygon: ExprPoint[] = [];
      while (ctx.isType("lparen")) polygon.push(ctx.parsePoint());
      if (polygon.length < 4) {
        ctx.fail("A `void … polygon` needs at least 4 points — `polygon (x,y) (x,y) (x,y) (x,y) …`", ctx.peek());
      }
      node.polygon = polygon;
    } else {
      ctx.eatKeyword("at");
      node.at = ctx.parsePoint();
      ctx.eatKeyword("size");
      node.size = ctx.parseDimensions();
    }
    if (ctx.isKeyword("rail")) {
      const railKw = ctx.next();
      const words: (RailEdge | number)[] = [];
      for (;;) {
        const t = ctx.peek();
        if (t.type === "number" && t.num !== undefined) words.push(t.num);
        else if (t.type === "ident" && (RAIL_EDGES as readonly string[]).includes(t.value))
          words.push(t.value as RailEdge);
        else if (t.type === "minus" && ctx.peek(1).type === "number")
          ctx.fail(
            "A `rail` edge number counts from 0 — edge n runs from point n to point n+1 — so a negative number names no edge",
            t,
          );
        else break;
        ctx.next();
        if (ctx.isType("comma")) ctx.next();
      }
      if (words.length === 0) {
        ctx.fail(`A \`rail\` clause needs at least one edge (${RAIL_EDGES.join("|")}, or an edge number)`, ctx.peek());
      }
      node.rail = words;
      node.railSpan = { start: railKw.start, end: ctx.peek(-1).end };
    }
    return node;
  },

  idPrefix: () => "void",

  resolve(node, ctx: ResolveCtx): RVoid {
    const n = node as VoidNode;
    const id = ctx.id;
    const railDiag = (message: string): void =>
      ctx.diag({ severity: "error", message, code: "E_VOID_RAIL", span: n.railSpan ?? n.span });

    if (n.polygon) {
      const ring = n.polygon.map((p) => ctx.snapPt(ctx.evalPt(p)));
      const effective = effectiveVertices(ring);
      const b = polygonBounds(ring);
      const refused: RVoid = { kind: "void", id, at: { x: b.x, y: b.y }, size: { w: 0, h: 0 }, span: n.span };
      const polyDiag = (why: string): RVoid => {
        ctx.diag({ severity: "error", message: `Void "${id}" ${why}`, code: "E_VOID_POLY", span: n.span });
        return refused;
      };
      if (effective.length < 4) {
        return polyDiag(
          `is a degenerate ring — ${effective.length} effective vertices after removing duplicate and collinear points (4 are needed)`,
        );
      }
      if (!rectilinear(effective)) {
        return polyDiag(
          "has a slanted edge — a void ring runs only horizontally and vertically (an L, a U), because the walking grid and the stair and furniture checks read a hole as rectangles",
        );
      }
      if (polygonSelfIntersects(effective)) {
        return polyDiag("has a self-intersecting ring — its edges cross, so it encloses no single hole");
      }
      const parts = piecesOfRing(ring)!;
      const out: RVoid = {
        kind: "void",
        id,
        at: { x: b.x, y: b.y },
        size: { w: b.w, h: b.h },
        poly: ring,
        parts,
        span: n.span,
      };
      if (n.rail) {
        const sides = n.rail.filter((w) => typeof w === "string" && w !== "all" && w !== "none");
        const nums = n.rail.filter((w): w is number => typeof w === "number");
        const bad = nums.filter((k) => !Number.isInteger(k) || k < 0 || k >= ring.length);
        if (sides.length > 0) {
          railDiag(
            `Void "${id}" is a ring, whose edges have no side names — write their numbers (edge n runs from point n to point n+1, 0 to ${ring.length - 1}), or \`all\``,
          );
        } else if (bad.length > 0) {
          railDiag(
            `Void "${id}" has ${ring.length} edges, numbered 0 to ${ring.length - 1} (edge n runs from point n to point n+1): ${bad.map(fmtSource).join(", ")} names none of them`,
          );
        } else if (n.rail.includes("none")) out.railEdges = [];
        else if (n.rail.includes("all")) out.railEdges = ring.map((_, i) => i);
        else out.railEdges = [...new Set(nums)].sort((x, y) => x - y);
      }
      return out;
    }

    const at = ctx.snapPt(ctx.evalPt(n.at!));
    const size = { w: ctx.snap(ctx.eval(n.size!.w)), h: ctx.snap(ctx.eval(n.size!.h)) };
    if (size.w <= 0 || size.h <= 0) {
      ctx.diag({
        severity: "error",
        message: `Void "${id}" must have a positive size`,
        code: "E_VOID_SIZE",
        span: n.span,
      });
    }
    const out: RVoid = { kind: "void", id, at, size, span: n.span };
    if (n.rail) {
      const nums = n.rail.filter((w) => typeof w === "number");
      if (nums.length > 0) {
        railDiag(
          `Void "${id}" is a rectangle, whose edges are named, not numbered — write \`rail ${RAIL_SIDES.join("|")}\`, or \`all\``,
        );
      } else out.rail = railSides(n.rail as RailEdge[]);
    }
    return out;
  },

  bounds(resolved): Point[] {
    const v = resolved as RVoid;
    // The railing's ink lies inside the outline (it runs on the hole's side of each edge, at most
    // a quarter of the narrowest piece in), so the outline bounds everything the void draws.
    if (v.poly) return v.poly.map((p) => ({ ...p }));
    return rectCorners(v.at.x, v.at.y, v.size.w, v.size.h);
  },

  /**
   * An upper bound on the primitives it draws (the drawing budget, `MAX_DRAW_UNITS`): its outline,
   * two diagonals per piece, and per railed edge {@link railRun}'s two lines and at most
   * `MAX_RAIL_POSTS + 1` post ticks.
   */
  drawCost: (resolved) => {
    const v = resolved as RVoid;
    return 1 + 2 * (v.parts?.length ?? 1) + (3 + MAX_RAIL_POSTS) * railCount(v);
  },

  render(resolved, ctx: RenderCtx): SceneNode[] {
    const v = resolved as RVoid;
    const { theme, sizes } = ctx;
    // One pattern in BOTH fields — the `glyph-lib.ts` dash convention: the SVG serializer
    // follows `lineType`, the PDF serializer follows `paint.dash`, and a node that names
    // one and hands the other a different pattern draws two different dashes.
    const paint = {
      fill: "none",
      stroke: theme.annotation,
      width: weightWidth("thin", sizes),
      dash: dashedPattern(sizes),
    };
    const node = (prim: SceneNode["prim"]): SceneNode => ({
      layer: "furniture",
      layerName: VOID_LAYER,
      prim,
      lineType: "dashed",
      lineWeight: "thin",
      paint: { ...paint },
    });
    if (v.poly) {
      // One outline (no seam between the pieces), then each piece crossed by its diagonals: a
      // cross over the ring's box would run outside an L.
      const out: SceneNode[] = [node({ t: "polygon", pts: v.poly.map((p) => ({ ...p })) })];
      for (const p of voidPieces(v)) {
        const c = rectCorners(p.at.x, p.at.y, p.size.w, p.size.h);
        out.push(node({ t: "line", a: c[0]!, b: c[2]! }), node({ t: "line", a: c[1]!, b: c[3]! }));
      }
      return [...out, ...railNodesOf(v, ctx)];
    }
    const pts = rectCorners(v.at.x, v.at.y, v.size.w, v.size.h);
    const out = [
      node({ t: "polygon", pts }),
      node({ t: "line", a: pts[0]!, b: pts[2]! }),
      node({ t: "line", a: pts[1]!, b: pts[3]! }),
    ];
    return v.rail?.length ? [...out, ...railNodesOf(v, ctx)] : out;
  },
  /** The frame's action on a floor void (`frame.ts`'s `transformElement` calls this). */
  transform(resolved, t: TransformCtx): RVoid {
    // A void is an axis-aligned rectangle given as TOP-LEFT + size, exactly like the
    // vertical runs — so a quarter-turn swaps its extents and re-derives the corner.
    const el = resolved as RVoid;
    const { id } = t;
    const r = t.rect(el.at, el.size);
    const out: RVoid = { ...el, id, at: r.at, size: r.size };
    if (el.poly) {
      // The ring rides through vertex by vertex, so edge `n` stays the edge from point `n`; the
      // pieces are cut again from the carried ring, so a placed void equals one written in place.
      out.poly = el.poly.map((p) => t.point(p));
      out.parts = piecesOfRing(out.poly) ?? el.parts?.map((p) => t.rect(p.at, p.size));
    }
    // A side name is a page fact and a frame turns the page: carried by its outward normal,
    // as a balcony's rail and a door's swing are, then put back in canonical order.
    if (el.rail) {
      const sides = new Set(el.rail.map((s) => t.side(s)));
      out.rail = RAIL_SIDES.filter((s: RailSide) => sides.has(s));
    }
    return out;
  },
};
