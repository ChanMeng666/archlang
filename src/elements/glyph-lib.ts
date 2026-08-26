/**
 * The drawing vocabulary every fixture glyph is built from.
 *
 * `fixtures-glyphs.ts` grew eight symbol families around two local closures (`poly`, `line`)
 * and two shape helpers (`ellipse`, `roundedRect`), re-declared inside one function. That is
 * fine for eight families and untenable for the domain modules that follow, which are edited
 * by different hands and must not each re-derive what a "thin line on the furniture pass"
 * is. So the closures become **factories** here, and the shape helpers move up beside them
 * unchanged.
 *
 * ## Why every factory sets BOTH `paint.width` and `lineWeight`
 *
 * A `SceneNode` can carry a raw `paint.width` (a number in mm) or a semantic
 * `lineWeight` (a name on the CAD pen ramp) — and the backends do not agree about which
 * they read. The SVG serializer prefers `lineWeight` and falls back to `paint.width`; the
 * **PDF backend reads `paint.width` and nothing else**. Setting only the name would silently
 * drop every glyph's stroke width from the PDF export; setting only the number throws away
 * the drawing's pen hierarchy in the CAD-facing output. So both are set, from the one
 * `weightWidth` ramp in `src/scene.ts`, and they cannot disagree by construction.
 *
 * That identity is also what makes this refactor safe: `weightWidth("thin", sizes)` **is**
 * `sizes.thin`, the literal every existing glyph already passed as `paint.width`. Tagging
 * the eight shipped families with `lineWeight: "thin"` therefore leaves their SVG bytes
 * untouched — pinned by `test/glyph-lib.test.ts` and by the full-SVG snapshots in
 * `test/fixture-byte-identity.test.ts`, not asserted in a comment.
 *
 * ## The dash convention
 *
 * A dashed factory sets `lineType: "dashed"` **and** a `paint.dash` equal to the pattern
 * that named type resolves to. It deliberately does NOT reuse `door-panels.ts`'s local
 * `[thin*4, thin*3]`: that module sets `paint.dash` alone and never names a line type, so
 * nothing there can disagree. Here, naming a type and handing a *different* raw pattern
 * would make the SVG (which follows the name) and the PDF (which follows the number) draw
 * two different dashes from one node — the precise cross-backend divergence this project
 * keeps finding. One pattern, both fields.
 *
 * Pure and deterministic: no clock, no randomness, no trig beyond the two shape helpers'
 * fixed-step tessellation.
 */

import type { Point } from "../ast.js";
import type { LineWeight, RenderSizes, SceneNode } from "../scene.js";
import { weightWidth } from "../scene.js";
import type { Theme } from "../theme.js";

/** An axis-aligned footprint in plan millimetres: top-left corner plus extents. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The two pen weights a fixture symbol may use. The heavier half of the ramp
 * (`heavy`/`medium`) is the built fabric's — a chair drawn at wall weight would read as a
 * wall — so the glyph vocabulary is deliberately narrower than {@link LineWeight}.
 */
export type GlyphWeight = Extract<LineWeight, "thin" | "extraThin">;

/**
 * A glyph's drawing surface: the palette it paints from, the pen sizes, and the node list
 * it accumulates into. One is built per {@link import("./fixtures-glyphs.js").fixtureGlyph}
 * call, so `nodes` is never shared between two fixtures.
 */
export interface GlyphCtx {
  readonly theme: Theme;
  readonly sizes: RenderSizes;
  /** The accumulated primitives, in draw order. A domain function returns this. */
  readonly nodes: SceneNode[];

  /** Outline colour for every stroked primitive (`theme.furnitureStroke`). */
  readonly stroke: string;
  /** The solid body fill of a piece of furniture (`theme.furnitureFill`). */
  readonly body: string;
  /** The white interior of a bowl, tray or tub (`theme.opening`). */
  readonly basin: string;

  /** A closed, filled + stroked polygon. */
  poly(pts: Point[], fill: string, weight?: GlyphWeight): void;
  /** A single straight segment. `dashed` names the line type AND its dash pattern. */
  seg(a: Point, b: Point, weight?: GlyphWeight, dashed?: boolean): void;
  /** A small filled disc — a true `circle`, not a tessellated ring. Defaults to the outline colour. */
  dot(center: Point, r: number, fill?: string, weight?: GlyphWeight): void;
  /** An unfilled circle. */
  ring(center: Point, r: number, weight?: GlyphWeight): void;
  /**
   * A circular arc from `start` to `end` about `center`.
   *
   * **Minor arcs only (≤ 180°).** Every backend lowers a `ScenePrim` arc with the SVG
   * large-arc flag pinned to `0`, so a span over a half-turn would be drawn as its
   * complement — silently, and only in some exports. Draw a bigger sweep as two arcs.
   */
  arcSeg(center: Point, r: number, start: Point, end: Point, sweep: 0 | 1, weight?: GlyphWeight): void;
}

/** The `stroke-dasharray`, in mm, that `lineType: "dashed"` resolves to on the SVG ramp. */
export const dashedPattern = (sizes: RenderSizes): [number, number] => [sizes.thin * 6, sizes.thin * 4];

/** Build the drawing surface for one fixture symbol. */
export function glyphCtx(theme: Theme, sizes: RenderSizes): GlyphCtx {
  const nodes: SceneNode[] = [];
  const stroke = theme.furnitureStroke;
  const width = (w: GlyphWeight): number => weightWidth(w, sizes);

  return {
    theme,
    sizes,
    nodes,
    stroke,
    body: theme.furnitureFill,
    basin: theme.opening,

    poly(pts, fill, weight = "thin") {
      nodes.push({
        layer: "furniture",
        prim: { t: "polygon", pts },
        paint: { fill, stroke, width: width(weight) },
        lineWeight: weight,
      });
    },

    seg(a, b, weight = "thin", dashed = false) {
      nodes.push({
        layer: "furniture",
        prim: { t: "line", a, b },
        paint: { stroke, width: width(weight), ...(dashed ? { dash: dashedPattern(sizes) } : {}) },
        lineWeight: weight,
        ...(dashed ? { lineType: "dashed" as const } : {}),
      });
    },

    dot(center, r, fill = stroke, weight = "thin") {
      nodes.push({
        layer: "furniture",
        prim: { t: "circle", center, r },
        paint: { fill, stroke, width: width(weight) },
        lineWeight: weight,
      });
    },

    ring(center, r, weight = "thin") {
      nodes.push({
        layer: "furniture",
        prim: { t: "circle", center, r },
        paint: { fill: "none", stroke, width: width(weight) },
        lineWeight: weight,
      });
    },

    arcSeg(center, r, start, end, sweep, weight = "thin") {
      nodes.push({
        layer: "furniture",
        prim: { t: "arc", center, r, start, end, sweep },
        paint: { fill: "none", stroke, width: width(weight) },
        lineWeight: weight,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Shape helpers — moved here VERBATIM from `fixtures-glyphs.ts`. Their output is
// byte-identical to the closures they replace; that is the whole point of moving them
// rather than rewriting them.

/** Closed polygon approximating an axis-aligned ellipse (24 points, deterministic). */
export function ellipsePoly(cx: number, cy: number, rx: number, ry: number): Point[] {
  const n = 24;
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return pts;
}

/** Closed polygon: a rectangle with its corners eased (a "rounded" rect look). */
export function roundedRectPoly(r: Rect, radius: number): Point[] {
  const rad = Math.min(radius, r.w / 2, r.h / 2);
  const x0 = r.x,
    y0 = r.y,
    x1 = r.x + r.w,
    y1 = r.y + r.h;
  const k = 4;
  const arc = (cx: number, cy: number, from: number, to: number): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i <= k; i++) {
      const a = from + ((to - from) * i) / k;
      pts.push({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) });
    }
    return pts;
  };
  const H = Math.PI / 2;
  return [
    ...arc(x1 - rad, y0 + rad, -H, 0),
    ...arc(x1 - rad, y1 - rad, 0, H),
    ...arc(x0 + rad, y1 - rad, H, 2 * H),
    ...arc(x0 + rad, y0 + rad, 2 * H, 3 * H),
  ];
}

/** The four corners of a rect as a closed polygon, clockwise from the top-left. */
export function rectPoly(r: Rect): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

/**
 * `r` shrunk on all four sides by `frac × min(w, h)`.
 *
 * The inset is keyed to the SHORT side, not to each axis independently, so the border of a
 * long thin piece stays an even band instead of a wedge — which is what the bathtub's
 * hand-written `Math.min(r.w, r.h) * 0.14` was already doing.
 */
export function insetRect(r: Rect, frac: number): Rect {
  const d = Math.min(r.w, r.h) * frac;
  return { x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d };
}

/** `r` shrunk by absolute millimetre margins: `dx` on the left and right, `dy` top and bottom. */
export function insetRectXY(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, w: r.w - 2 * dx, h: r.h - 2 * dy };
}

/**
 * `r` shrunk by an independent FRACTION on each of the four sides.
 *
 * {@link insetRect} takes one fraction of the short side, which is right for a rim of even width
 * and wrong for a fixture whose border is uneven — a tub whose head rim carries the taps and is
 * nearly twice the foot. The four fractions are of the axis they shrink (`left`/`right` of `r.w`,
 * `top`/`bottom` of `r.h`); each pair must sum to under 1 for the result to have non-negative
 * extents.
 *
 * Note the units: this is the FRACTIONAL sibling of {@link insetRectXY}, which takes millimetres.
 * The arithmetic is kept exactly as the bath module first wrote it — `r.w * (1 - left - right)`
 * rather than `r.w - r.w*left - r.w*right`, which is a different float and would move bytes.
 */
export function insetRectSides(r: Rect, left: number, right: number, top: number, bottom: number): Rect {
  return {
    x: r.x + r.w * left,
    y: r.y + r.h * top,
    w: r.w * (1 - left - right),
    h: r.h * (1 - top - bottom),
  };
}

/**
 * The short side of a footprint.
 *
 * Every corner radius, band width and inset in the glyph modules is keyed to this rather than to
 * each axis independently, so a long thin piece gets an even band instead of a wedge — the same
 * rule {@link insetRect} follows. All five domain modules had derived it, three of them inline.
 */
export const shortSide = (r: Rect): number => Math.min(r.w, r.h);

/** The centre of a rect. */
export const centerOf = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/**
 * `v` held inside `[lo, hi]`, with `NaN` resolving to `lo`.
 *
 * Written as two `>` comparisons rather than `Math.min`/`Math.max` so a `NaN` — which a
 * degenerate footprint can produce upstream — lands on `lo` instead of propagating into a loop
 * bound or a coordinate. For every non-`NaN` input the two spellings agree exactly, which is why
 * folding the domain modules' three private copies onto this one moves no bytes.
 */
export function clamp(v: number, lo: number, hi: number): number {
  return v > hi ? hi : v > lo ? v : lo;
}

/**
 * A closed polygon drawn with a DASHED outline.
 *
 * {@link GlyphCtx} has a dashed `seg` but no dashed `poly`, and an overhead piece — a wall
 * cabinet above the cut plane — is dashed all the way round by convention. Sets `lineType` AND
 * `paint.dash` to the same pattern for the reason this module's header gives: the SVG backend
 * follows the name and the PDF backend follows the number, so a node that disagrees with itself
 * draws two different dashes from one primitive.
 */
export function dashedPoly(g: GlyphCtx, pts: Point[], fill: string, weight: GlyphWeight = "thin"): void {
  g.nodes.push({
    layer: "furniture",
    prim: { t: "polygon", pts },
    paint: { fill, stroke: g.stroke, width: weightWidth(weight, g.sizes), dash: dashedPattern(g.sizes) },
    lineWeight: weight,
    lineType: "dashed",
  });
}
