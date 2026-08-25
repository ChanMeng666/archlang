/** `dim [faces|clear] (x,y)->(x,y) [offset N] [text "…"]` — dimension line with ticks + length,
 *  or `dim radius <wallId> [segment <n>]` / `dim diameter <roomId>` — a GB/T curve call-out
 *  whose geometry and text are DERIVED from the referenced element (v1.24). */

import type { DimNode, DimRef, ExprPoint, Point } from "../ast.js";
import { DIM_REFS } from "../ast.js";
import type { Expr } from "../expr.js";
import type { ElementDef, ParseCtx, RenderCtx, ResolveCtx } from "../registry.js";
import type { SceneNode } from "../scene.js";
import type { RDim } from "../ir.js";
import { add, length, mul, normal, projectToWallFace, segmentsOfWall, sub, unit } from "../geometry.js";
import { arcPointAt, diameterText, radiusText } from "../geometry/arc.js";
import { exprToSource } from "../expr-source.js";
import { fmt2 } from "../num-format.js";
import { DIM_TEXT_GAP, textWidth } from "../text-metrics.js";

/**
 * How far PAST the far station the number must be pushed, along the dimension line's own
 * direction — `0` when it fits between the two stations and stays where it always was.
 *
 * A measurement can be smaller than the number that names it. A 100 mm partition lettered
 * at a 2.5 mm dimension font needs ~4.6 mm of paper for "100" and has 0.5 mm of wall to put
 * it in, so the digits are drawn straight through the poché they are measuring — legible
 * nowhere, and the reason `dims auto walls` looked broken on every plan that used it.
 * ISO 129-1 and GB/T 50001 both answer this the same way: **where the space between the
 * stations cannot hold the value, the value is written outside them**, beyond an extension
 * line, still aligned with its own dimension line.
 *
 * Three deliberate restrictions keep this from moving anything that was already right:
 *
 *  - **Zero-offset dims only.** A dim drawn ON the feature it measures — the canonical
 *    wall-thickness call-out — is the one whose number lands in fabric; it is also exactly
 *    the dim `W_DIM_INSIDE` and `W_DIM_OVERLAP` both decline to model (`hasDrawnBand`
 *    requires `offset !== 0`), so moving its text can never put the renderer and the lint
 *    rules into disagreement about what collides.
 *  - **Never a chain span.** A `dims auto` chain runs at a non-zero slot offset, so it is
 *    already excluded: the space outside one span's stations belongs to its NEIGHBOUR, and
 *    a crowded chain's remedy is the stagger (`staggerChain` in `scene-build.ts`) instead.
 *  - **Strictly too small.** The predicate is the same shape the stagger rule uses — the
 *    number's estimated width plus a clear {@link DIM_TEXT_GAP} at each end, against the
 *    measured length — read through the ONE shared {@link textWidth} estimate, so the two
 *    crowding decisions in the tree can never diverge. Strict `>`, so an exact fit stays
 *    put and every dimension that already had room emits byte-identical geometry.
 */
function outsideStations(dm: RDim, label: string, dimFont: number): number {
  if (dm.offset !== 0) return 0;
  const span = length(sub(dm.to, dm.from));
  // A zero-length dim has no direction to push along (a failed `dim radius` reference
  // collapses to one); it keeps the placement it always had.
  if (!(span > 0)) return 0;
  const w = textWidth(label, dimFont);
  const gap = DIM_TEXT_GAP * dimFont;
  if (!(w + 2 * gap > span)) return 0;
  // Centre of the number, measured from the station: a clear gap, then half the number.
  return gap + w / 2;
}

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

/**
 * Consume the optional `offset <expr>` clause and record the byte span it occupies —
 * the authored run, or the **zero-width** point where one can be inserted, which is
 * HERE (the grammar puts the optional trailing `text "…"` last). Shared by both parse
 * branches so the curve call-out records it identically. The span exists only so
 * {@link import("../fix-producers.js").dimBumpFix} can re-tier a colliding dimension
 * with correct original-source offsets; see {@link DimNode.offsetSpan}.
 */
function eatOffset(node: DimNode, ctx: ParseCtx): void {
  const offsetAt = ctx.peek(-1).end;
  if (ctx.isKeyword("offset")) {
    const offKw = ctx.next();
    node.offset = ctx.parseExpr();
    node.offsetSpan = { start: offKw.start, end: ctx.peek(-1).end };
  } else {
    node.offsetSpan = { start: offsetAt, end: offsetAt };
  }
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
    {
      name: "radius|diameter",
      type: "ref",
      optional: true,
      doc: "Curve call-out: `radius <wallId>` (R<r> leader on an arc edge) or `diameter <roomId>` (φ<d> across a circular room), instead of two points.",
    },
    {
      name: "segment",
      type: "number",
      optional: true,
      doc: "Which arc edge of a multi-segment wall `dim radius` measures (required when it has more than one).",
    },
  ],

  parse(ctx: ParseCtx): DimNode {
    const kw = ctx.eatKeyword("dim");
    // Optional wall-face reference, before the points (`dim faces (…)->(…)`).
    let ref: DimRef | undefined;
    if (DIM_REFS.some((r) => ctx.isKeyword(r))) {
      ref = ctx.next().value as DimRef;
    }
    // `dim radius <wall> [segment <n>]` / `dim diameter <room>` — no written points; the
    // measured geometry comes from the referenced element at resolve.
    if (!ref && (ctx.isKeyword("radius") || ctx.isKeyword("diameter"))) {
      const whatTok = ctx.next();
      const what = whatTok.value as "radius" | "diameter";
      const target = ctx.eatIdent().value;
      let segment: Expr | undefined;
      if (what === "radius" && ctx.isKeyword("segment")) {
        ctx.next();
        segment = ctx.parseExpr();
      }
      const zero: ExprPoint = { x: { t: "num", value: 0 }, y: { t: "num", value: 0 } };
      const node: DimNode = {
        kind: "dim",
        id: "",
        from: zero,
        to: zero,
        offset: { t: "num", value: 0 },
        curve: {
          what,
          ref: target,
          ...(segment ? { segment } : {}),
          span: { start: whatTok.start, end: ctx.peek(-1).end },
        },
        line: kw.line,
      };
      eatOffset(node, ctx);
      if (ctx.isKeyword("text")) {
        ctx.next();
        node.text = ctx.parseStringExpr();
      }
      return node;
    }
    const from = ctx.parsePoint();
    ctx.eat("arrow");
    const to = ctx.parsePoint();
    const node: DimNode = { kind: "dim", id: "", from, to, offset: { t: "num", value: 300 }, line: kw.line };
    if (ref) node.ref = ref;
    eatOffset(node, ctx);
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
    let derivedText: string | undefined;
    if (n.curve) {
      const measured = measureCurve(n, ctx);
      if (!measured) {
        return {
          kind: "dim",
          id: ctx.id,
          from,
          to,
          offset: ctx.eval(n.offset),
          text: n.text !== undefined ? ctx.evalStr(n.text) : undefined,
          span: n.span,
        };
      }
      from = measured.from;
      to = measured.to;
      derivedText = measured.text;
    }
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
      // An explicit `text "…"` still wins over the derived `R…`/`φ…`.
      text: n.text !== undefined ? ctx.evalStr(n.text) : derivedText,
      span: n.span,
    };
    // Carried for the `W_DIM_INSIDE` lint fix (which sees the IR, not the AST):
    // the whole statement re-emitted with its endpoints swapped. A CURVE call-out has no
    // written endpoints to swap (they are derived), so it gets no fix text — the lint
    // warning, if it ever fires, stands on its own rather than offering an edit that
    // would replace `dim radius w1` with a pair of literal points.
    if (n.span && !n.curve) r._swapText = emitSwapped(n);
    // Carried for the `W_DIM_OVERLAP` lint fix: where to write a re-tiered `offset`.
    // Unlike the swap this is a sub-span edit, so a CURVE call-out gets it too — the
    // `offset` clause means the same thing on both forms.
    if (n.offsetSpan) r._offsetSpan = n.offsetSpan;
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
    //
    // A witness line must END on the dimension line and START on the wall. For a
    // written `dim` those are the same point, but a `dims auto` CHAIN measures along
    // one straight baseline, so on a stepped or angled facade its endpoint is a
    // projection and the wall is elsewhere; the synthesizer then supplies the true
    // facade point in `witness` (`RDim.witness`) and only this start moves.
    if (dm.offset !== 0) {
      nodes.push({
        layer: "dims",
        prim: { t: "line", a: dm.witness?.from ?? dm.from, b: p1 },
        paint: { stroke: theme.dim, width: sizes.thin * 0.7 },
      });
      nodes.push({
        layer: "dims",
        prim: { t: "line", a: dm.witness?.to ?? dm.to, b: p2 },
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
    let angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    // No explicit text → the measured length |to−from|, formatted once via the
    // shared mm formatter so SVG and DXF show the same value (T3.6).
    const label = dm.text ?? fmt(length(sub(dm.to, dm.from)));
    // The number rides `dimFont * 0.7` off its own line, on the side the offset points
    // (away from the building, for an auto chain). `stagger` flips it to the other side —
    // the GB/T remedy for a chain of narrow spans, decided per span in `scene-build.ts` and
    // never set on a hand-written `dim`. Flipping INWARD (rather than out to a second row)
    // is what keeps the annotation band exactly as deep as `DIM_BAND_FONTS` reserves.
    //
    // …unless the number cannot fit BETWEEN the stations at all, in which case it goes
    // past them ({@link outsideStations}) — the ISO 129-1 / GB/T 50001 remedy for a
    // measurement too small to letter, and the one that keeps a wall-thickness call-out
    // out of its own poché.
    // Pushed out, the number sits ON the dimension line's own extension rather than
    // standing off it: past the station nothing is drawn, so there is no line to clear, and
    // aligning it with the line is what makes `|↔| 100` read as one call-out. WHICH station
    // is `calloutFrom`'s job — chosen by the caller, never by swapping the endpoints, whose
    // order also decides the text's reading direction (a vertical number reads bottom-to-top
    // in one order and top-to-bottom in the other).
    const push = outsideStations(dm, label, sizes.dimFont);
    const tp =
      push === 0
        ? add(mid, mul(n, (dm.stagger ? -1 : 1) * sizes.dimFont * 0.7))
        : add(dm.calloutFrom ? p1 : p2, mul(dir, dm.calloutFrom ? -push : push));
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

/**
 * Look up the geometry a `dim radius|diameter` measures, from the element it references.
 *
 * `radius <wallId>` takes an ARC edge of that wall (the only one, or the `segment <n>`
 * named) and returns a leader from the circle's centre out to the arc's midpoint —
 * exactly what the radius is — labelled `R<r>`. `diameter <roomId>` returns the
 * horizontal diameter of that circular room, labelled `φ<d>`.
 *
 * Every failure is a catalogued `E_DIM_CURVE_REF` and returns null; the caller then keeps
 * the dim's written (zero) points so the rest of the plan still draws. Nothing is guessed:
 * an ambiguous multi-arc wall is an error, not a pick.
 */
function measureCurve(n: DimNode, ctx: ResolveCtx): { from: Point; to: Point; text: string } | null {
  const c = n.curve!;
  const err = (message: string): null => {
    ctx.diag({
      severity: "error",
      message: `\`dim ${c.what} ${c.ref}\` ${message}`,
      code: "E_DIM_CURVE_REF",
      span: c.span ?? n.span,
    });
    return null;
  };
  if (c.what === "diameter") {
    const room = ctx.rooms.find((r) => r.id === c.ref);
    if (!room) return err("names no room in this plan");
    if (!room.circle) return err("names a room that is not circular — `diameter` measures a `room circle`");
    const { c: centre, r } = room.circle;
    return {
      from: { x: centre.x - r, y: centre.y },
      to: { x: centre.x + r, y: centre.y },
      text: diameterText(r, fmt2),
    };
  }
  const walls = ctx.walls.filter((w) => w.id === c.ref || w.category === c.ref);
  if (walls.length === 0) return err("names no wall in this plan");
  if (walls.length > 1) return err(`matches ${walls.length} walls — reference a unique wall id`);
  const segs = segmentsOfWall(walls[0]!);
  const arcSegs = segs.filter((s) => s.arc);
  if (arcSegs.length === 0) return err("names a wall with no `arc` edge to measure");
  let seg = arcSegs[0]!;
  if (c.segment !== undefined) {
    const idx = Math.floor(ctx.eval(c.segment));
    const found = segs[idx];
    if (!found) return err(`segment ${idx} is out of range (0..${segs.length - 1})`);
    if (!found.arc) return err(`segment ${idx} is straight, not an arc`);
    seg = found;
  } else if (arcSegs.length > 1) {
    return err(`has ${arcSegs.length} arc edges — add \`segment <n>\` to say which one`);
  }
  const arc = seg.arc!;
  return { from: arc.center, to: arcPointAt(arc, 0.5), text: radiusText(arc.r, fmt2) };
}
