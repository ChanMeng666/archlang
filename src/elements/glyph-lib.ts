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
 * ## Tone follows weight (the symbol ink)
 *
 * A symbol is drawn in TWO tones, and which one a stroke takes is decided by its pen, never by
 * the caller: a `thin` stroke is the symbol's OUTLINE and is drawn in the derived symbol
 * {@link GlyphCtx.ink}; an `extraThin` stroke is DETAIL (a cushion joint, a burner, a pillow)
 * and stays in `theme.furnitureStroke`. Every factory below — and {@link dashedPoly} — routes
 * its stroke colour through {@link GlyphCtx.tone}, so the two can never disagree inside one
 * symbol. The ink is not a theme key: it is {@link symbolInk}, a fixed integer mix of
 * `furnitureStroke` toward `wallStroke`, so it follows every theme (a light wall ink lightens
 * it) and keeps a `style furniture { stroke … }` override in the author's own hue.
 *
 * ## Curves
 *
 * {@link GlyphCtx.path} draws a closed loop of straight and minor-arc edges — the Scene's
 * `path` primitive, which every backend already lowers (SVG `A`, PDF arc, native DXF `ARC`).
 * {@link roundedRectPath}, {@link ovalPath} and {@link bulgeArc} build the loops; every arc
 * edge they emit is at most 120°, the `path` contract (`arcPieces` in the wall layer holds
 * the same bound). A round thing drawn this way stays round at every zoom, where the
 * tessellated {@link ellipsePoly}/{@link roundedRectPoly} facet.
 *
 * Pure and deterministic: no clock, no randomness; trig only in the fixed-step tessellation of
 * the legacy shape helpers. The curve builders are closed-form (`hypot` and arithmetic).
 */

import type { Point } from "../ast.js";
import type { LineWeight, PathEdge, PathLoop, RenderSizes, SceneNode } from "../scene.js";
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

  /**
   * The DETAIL tone, `theme.furnitureStroke` — the colour every `extraThin` stroke is drawn in
   * (see {@link tone}). Also the fill of a detail-tone disc (`g.dot(c, r)` defaults to it).
   */
  readonly stroke: string;
  /**
   * The OUTLINE tone: the derived symbol ink ({@link symbolInk} of `furnitureStroke` toward
   * `wallStroke`) — the colour every `thin` stroke is drawn in.
   */
  readonly ink: string;
  /** The solid body fill of a piece of furniture (`theme.furnitureFill`). */
  readonly body: string;
  /** The white interior of a bowl, tray, cushion or pillow (`theme.opening`). */
  readonly basin: string;

  /**
   * The colour a stroke of `weight` is drawn in: `thin` → {@link ink} (outline), `extraThin`
   * → {@link stroke} (detail). Every factory reads its stroke colour from here.
   */
  tone(weight: GlyphWeight): string;

  /** A closed, filled + stroked polygon. Prefer {@link path} for anything with a curve in it. */
  poly(pts: Point[], fill: string, weight?: GlyphWeight): void;
  /**
   * A closed region whose edges may be minor circular ARCS — the Scene `path` primitive. Build
   * the loop with {@link roundedRectPath}, {@link ovalPath} or {@link bulgeArc}; every arc edge
   * must be at most 120° (the `path` contract the backends rely on). One loop is one closed
   * shape; several loops draw as ONE node (holes by opposite winding, fill-rule nonzero).
   */
  path(loops: PathLoop | readonly PathLoop[], fill: string, weight?: GlyphWeight): void;
  /** A single straight segment. `dashed` names the line type AND its dash pattern. */
  seg(a: Point, b: Point, weight?: GlyphWeight, dashed?: boolean): void;
  /**
   * A small filled disc — a true `circle`, not a tessellated ring.
   *
   * **A bare `dot(c, r)` is DETAIL**: an `extraThin` edge and a fill in that edge's own tone, so
   * it is one solid disc in `furnitureStroke` — a drain, a knob, a tap, a flush button. A solid
   * disc carries far more ink than a line of the same colour, so at the outline ink it would
   * outshout the outline it sits inside. Pass `weight: "thin"` for a disc that IS outline (a
   * trunk, a post); the fill then defaults to the ink. Pass a fill (`g.body`) for a body with
   * an outline, e.g. a round seat.
   */
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

/**
 * The symbol-ink mix, as an exact fraction `[p, q]`: the ink is `furnitureStroke` moved
 * `p/q` of the way toward `wallStroke`, per channel.
 *
 * 3/7 is the simplest fraction for which EVERY shipped light-or-dark theme's ink clears WCAG
 * 4.5:1 on its own `roomFill` (default #6c6864 at 5.29:1; `presentation`, the palest, at 4.62:1;
 * 2/5 and 5/12 leave `presentation` under 4.5). `test/glyph-lib.test.ts` measures it rather than
 * trusting this sentence. An odd denominator also means `(c·(q−p) + w·p) / q` can never land on
 * an exact half, so the rounding below has no tie to break.
 */
export const SYMBOL_INK_MIX: readonly [number, number] = [3, 7];

/**
 * A CSS hex colour as `[r, g, b]` bytes: `#rgb` or `#rrggbb`, either case, surrounding
 * whitespace ignored. Anything else — a named colour, `url(#…)`, `rgb(…)`, `#rrggbbaa`, an empty
 * string — is `null`, and the caller keeps the colour it was handed.
 */
export function parseHexColor(c: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const h = m[1]!;
  const full = h.length === 3 ? h.replace(/./g, (ch) => ch + ch) : h;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The derived symbol ink: `furnitureStroke` mixed toward `wallStroke` by {@link SYMBOL_INK_MIX},
 * per channel, in integers, as lowercase `#rrggbb`.
 *
 * Not a theme key on purpose: it follows whatever wall ink a theme has (dark and blueprint walls
 * are LIGHT, so their ink lightens), and a `style furniture { stroke "#c33" }` override stays in
 * the author's hue — mixing toward a neutral wall changes lightness and saturation, never hue.
 * If EITHER colour is not a parseable hex the ink is `furnitureStroke` itself, unchanged: there
 * is nothing to mix, and a guess would put a colour on the page the author never named.
 */
export function symbolInk(furnitureStroke: string, wallStroke: string): string {
  const f = parseHexColor(furnitureStroke);
  const w = parseHexColor(wallStroke);
  if (!f || !w) return furnitureStroke;
  const [p, q] = SYMBOL_INK_MIX;
  const hex = (i: 0 | 1 | 2): string =>
    Math.round((f[i] * (q - p) + w[i] * p) / q)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(0)}${hex(1)}${hex(2)}`;
}

/** Build the drawing surface for one fixture symbol. */
export function glyphCtx(theme: Theme, sizes: RenderSizes): GlyphCtx {
  const nodes: SceneNode[] = [];
  const stroke = theme.furnitureStroke;
  const ink = symbolInk(theme.furnitureStroke, theme.wallStroke);
  const tone = (w: GlyphWeight): string => (w === "thin" ? ink : stroke);
  const width = (w: GlyphWeight): number => weightWidth(w, sizes);

  return {
    theme,
    sizes,
    nodes,
    stroke,
    ink,
    body: theme.furnitureFill,
    basin: theme.opening,
    tone,

    poly(pts, fill, weight = "thin") {
      nodes.push({
        layer: "furniture",
        prim: { t: "polygon", pts },
        paint: { fill, stroke: tone(weight), width: width(weight) },
        lineWeight: weight,
      });
    },

    path(loops, fill, weight = "thin") {
      nodes.push({
        layer: "furniture",
        prim: { t: "path", loops: isLoopList(loops) ? [...loops] : [loops] },
        paint: { fill, stroke: tone(weight), width: width(weight) },
        lineWeight: weight,
      });
    },

    seg(a, b, weight = "thin", dashed = false) {
      nodes.push({
        layer: "furniture",
        prim: { t: "line", a, b },
        paint: { stroke: tone(weight), width: width(weight), ...(dashed ? { dash: dashedPattern(sizes) } : {}) },
        lineWeight: weight,
        ...(dashed ? { lineType: "dashed" as const } : {}),
      });
    },

    dot(center, r, fill, weight = "extraThin") {
      nodes.push({
        layer: "furniture",
        prim: { t: "circle", center, r },
        paint: { fill: fill ?? tone(weight), stroke: tone(weight), width: width(weight) },
        lineWeight: weight,
      });
    },

    ring(center, r, weight = "thin") {
      nodes.push({
        layer: "furniture",
        prim: { t: "circle", center, r },
        paint: { fill: "none", stroke: tone(weight), width: width(weight) },
        lineWeight: weight,
      });
    },

    arcSeg(center, r, start, end, sweep, weight = "thin") {
      nodes.push({
        layer: "furniture",
        prim: { t: "arc", center, r, start, end, sweep },
        paint: { fill: "none", stroke: tone(weight), width: width(weight) },
        lineWeight: weight,
      });
    },
  };
}

const isLoopList = (l: PathLoop | readonly PathLoop[]): l is readonly PathLoop[] => Array.isArray(l);

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

/**
 * A closed ring through `pts`, with a circular fillet of radius `rad` at each vertex flagged
 * in `ease`; a vertex flagged `false` passes through sharp.
 *
 * {@link roundedRectPoly} eases all four corners of a RECTANGLE, and an L has one corner that
 * must stay sharp — the reflex corner where the two runs meet, which is a seam in the real
 * piece rather than a radius. It lived in `glyphs-living.ts` while `drawSofaL` was its only
 * caller; `glyphs-misc.ts`'s reception counter is the second, and a helper imported across two
 * domain modules belongs beside {@link roundedRectPoly} rather than in one of them. **Moved
 * VERBATIM** — the arithmetic is untouched, which is what keeps every shipped L-sofa on the
 * bytes it had.
 *
 * **Right-angle corners only.** The fillet centre is `v + (u_prev + u_next) x rad`, which puts
 * it `rad` from both incident edges exactly when they meet square; at any other angle it lands
 * somewhere plausible and wrong. Every corner of an axis-aligned L is square.
 *
 * Degenerate-safe by construction: a zero-length incident edge gives a `(0,0)` unit vector and
 * `rad` clamps to 0, so the fillet collapses onto the vertex and emits `K + 1` copies of a
 * finite point instead of propagating a `NaN` into a coordinate.
 */
export function easedRing(pts: readonly Point[], ease: readonly boolean[], rad: number): Point[] {
  const n = pts.length;
  const K = 4;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const v = pts[i]!;
    if (!ease[i]) {
      out.push(v);
      continue;
    }
    const p = pts[(i + n - 1) % n]!;
    const q = pts[(i + 1) % n]!;
    const lp = Math.hypot(p.x - v.x, p.y - v.y);
    const lq = Math.hypot(q.x - v.x, q.y - v.y);
    const rr = Math.min(rad, lp / 2, lq / 2);
    const up = lp > 0 ? { x: (p.x - v.x) / lp, y: (p.y - v.y) / lp } : { x: 0, y: 0 };
    const uq = lq > 0 ? { x: (q.x - v.x) / lq, y: (q.y - v.y) / lq } : { x: 0, y: 0 };
    const c = { x: v.x + (up.x + uq.x) * rr, y: v.y + (up.y + uq.y) * rr };
    const a0 = Math.atan2(v.y + up.y * rr - c.y, v.x + up.x * rr - c.x);
    let sweep = Math.atan2(v.y + uq.y * rr - c.y, v.x + uq.x * rr - c.x) - a0;
    // Take the SHORT way round: a right-angle fillet turns a quarter, never three quarters.
    if (sweep > Math.PI) sweep -= 2 * Math.PI;
    if (sweep < -Math.PI) sweep += 2 * Math.PI;
    for (let k = 0; k <= K; k++) {
      const a = a0 + (sweep * k) / K;
      out.push({ x: c.x + rr * Math.cos(a), y: c.y + rr * Math.sin(a) });
    }
  }
  return out;
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

// ---------------------------------------------------------------------------
// Curves: closed `path` loops of straight edges and MINOR arcs of at most 120° each, drawn
// clockwise on the page (every arc's SVG sweep flag is 1). Closed-form — no trig, no sampling.

/** Per-corner radii, clockwise from the top-left: `[top-left, top-right, bottom-right, bottom-left]`. */
export type CornerRadii = readonly [number, number, number, number];

/**
 * A rectangle with TRUE circular corners — the curved successor of {@link roundedRectPoly}.
 *
 * `radius` is one radius for all four corners or one per corner ({@link CornerRadii}); each is
 * held to `[0, min(w, h) / 2]`, so a radius of half the short side gives a stadium (a pill) and
 * a negative, `NaN` or degenerate footprint gives the plain rectangle. A straight run that a
 * radius has used up is omitted rather than emitted at zero length. Every corner is a quarter
 * turn, so every arc is 90°.
 */
export function roundedRectPath(r: Rect, radius: number | CornerRadii): PathLoop {
  const lim = Math.min(r.w, r.h) / 2;
  const held = (v: number): number => {
    const c = clamp(v, 0, lim);
    return c > 0 ? c : 0;
  };
  const [tl, tr, br, bl] = (typeof radius === "number" ? [radius, radius, radius, radius] : radius).map(held) as [
    number,
    number,
    number,
    number,
  ];
  const x0 = r.x;
  const y0 = r.y;
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  // Which straight runs exist is decided from the RADII and the extents alone — a run is
  // absent exactly when its two corner radii use the whole side — with sums, because IEEE
  // addition commutes and a mirror or a half-turn only swaps the two radii of a side. It is
  // never decided by comparing derived coordinates: `x1 - tr` and `x0 + tl` can differ by an
  // ulp, which once gave a stadium a zero-length edge on one side and not on its mirror image,
  // and so made a symmetric symbol read as handed (`glyph-chirality.ts`).
  const top = tl + tr !== r.w;
  const right = tr + br !== r.h;
  const bottom = br + bl !== r.w;
  const left = bl + tl !== r.h;
  const start: Point = { x: x0 + tl, y: y0 };
  const edges: PathEdge[] = [];
  if (top) edges.push({ t: "line", to: { x: x1 - tr, y: y0 } });
  if (tr > 0) edges.push({ t: "arc", to: { x: x1, y: y0 + tr }, center: { x: x1 - tr, y: y0 + tr }, r: tr, sweep: 1 });
  if (right) edges.push({ t: "line", to: { x: x1, y: y1 - br } });
  if (br > 0) edges.push({ t: "arc", to: { x: x1 - br, y: y1 }, center: { x: x1 - br, y: y1 - br }, r: br, sweep: 1 });
  if (bottom) edges.push({ t: "line", to: { x: x0 + bl, y: y1 } });
  if (bl > 0) edges.push({ t: "arc", to: { x: x0, y: y1 - bl }, center: { x: x0 + bl, y: y1 - bl }, r: bl, sweep: 1 });
  // The loop closes on `start` itself: through the top-left arc, or — with a sharp top-left
  // corner — through the left run, whose end `(x0, y0 + 0)` is `start`'s `(x0 + 0, y0)`.
  if (tl > 0) {
    if (left) edges.push({ t: "line", to: { x: x0, y: y0 + tl } });
    edges.push({ t: "arc", to: start, center: { x: x0 + tl, y: y0 + tl }, r: tl, sweep: 1 });
  } else if (left || edges.length === 0) edges.push({ t: "line", to: start });
  return { start, edges };
}

/** The flattest {@link ovalPath} drawn as a pure four-centre oval: semi-major ≤ 4 × semi-minor. */
const OVAL_MAX_ASPECT = 4;

/**
 * An axis-aligned OVAL of semi-axes `rx`, `ry` about `(cx, cy)`: the draughtsman's FOUR-CENTRE
 * construction — two small END arcs on the major axis and two large SIDE arcs on the minor
 * axis, each pair tangent to the other where they meet. It is what a drafted WC bowl, a basin
 * and a tub well are, and unlike {@link ellipsePoly} it is a curve, not a 24-gon.
 *
 * Closed form (no trig): with `A`/`B` the semi-major/minor axes, `L = hypot(A, B)` and
 * `s = (A − B) / L`, the end radius is `(1 − s)·L² / 2A` and the side radius `(1 + s)·L² / 2B`
 * — the classic "mark `A − B` off the chord" construction, solved. The junctions lie on the line
 * through both centres, direction `(B, A) / L`, which is what makes the curve tangent-continuous.
 *
 * Every arc is at most 90°: each end arc is emitted as two halves split at its vertex (the loop
 * STARTS at the +major vertex), and a side arc spans `180° − 2·atan(A / B)` ≤ 90°. A circle
 * (`rx == ry`) comes out as six arcs (45°, 90°, 45°, 45°, 90°, 45°).
 *
 * Past {@link OVAL_MAX_ASPECT} the four-centre side arcs would grow without bound (their radius
 * is `~A² / B`), so a flatter oval is the aspect-4 oval with STRAIGHT runs let in across its two
 * minor vertices — continuous at the boundary, radii bounded, still tangent everywhere. A
 * non-positive or `NaN` semi-axis gives a degenerate, finite diamond through the extremes.
 */
export function ovalPath(cx: number, cy: number, rx: number, ry: number): PathLoop {
  if (!(rx > 0 && ry > 0)) {
    const ax = rx > 0 ? rx : 0;
    const ay = ry > 0 ? ry : 0;
    const e: Point = { x: cx + ax, y: cy };
    return {
      start: e,
      edges: [
        { t: "line", to: { x: cx, y: cy + ay } },
        { t: "line", to: { x: cx - ax, y: cy } },
        { t: "line", to: { x: cx, y: cy - ay } },
        { t: "line", to: e },
      ],
    };
  }
  const horizontal = rx >= ry;
  const A = horizontal ? rx : ry;
  const B = horizontal ? ry : rx;
  // Local (u along the major axis, v along the minor) → page. For a vertical major axis it is a
  // quarter-turn, which preserves orientation, so every sweep stays 1 (clockwise on the page).
  const P = (u: number, v: number): Point => (horizontal ? { x: cx + u, y: cy + v } : { x: cx - v, y: cy + u });
  const A0 = A > B * OVAL_MAX_ASPECT ? B * OVAL_MAX_ASPECT : A;
  const d = A - A0; // the straight run each side of a minor vertex (0 for a pure oval)
  const L = Math.hypot(A0, B);
  const s = (A0 - B) / L;
  const r1 = ((1 - s) * L * L) / (2 * A0);
  const r2 = ((1 + s) * L * L) / (2 * B);
  const cu = B / L;
  const cv = A0 / L;
  const eu = A - r1; // |u| of the two end-arc centres
  const ju = eu + r1 * cu; // |u| of the four junctions
  const jv = r1 * cv; // |v| of the four junctions
  const arc = (u: number, v: number, centerU: number, centerV: number, rad: number): PathEdge => ({
    t: "arc",
    to: P(u, v),
    center: P(centerU, centerV),
    r: rad,
    sweep: 1,
  });
  // The side arc on the `sgn` side of the major axis (local v > 0 for +1), from the junction it
  // is entered at to the one it leaves by: one arc, or — past the aspect cap — two halves about a
  // straight run across the minor vertex. Its centre is on the FAR side of the major axis.
  const side = (sgn: 1 | -1): PathEdge[] => {
    const cvS = sgn * (B - r2); // the side arc's centre, on the far side of the major axis
    const fromU = sgn === 1 ? ju : -ju;
    if (d === 0) return [arc(-fromU, sgn * jv, 0, cvS, r2)];
    const m = sgn === 1 ? d : -d;
    return [arc(m, sgn * B, m, cvS, r2), { t: "line", to: P(-m, sgn * B) }, arc(-fromU, sgn * jv, -m, cvS, r2)];
  };
  return {
    start: P(A, 0),
    edges: [
      arc(ju, jv, eu, 0, r1),
      ...side(1),
      arc(-A, 0, -eu, 0, r1),
      arc(-ju, -jv, -eu, 0, r1),
      ...side(-1),
      arc(A, 0, eu, 0, r1),
    ],
  };
}

/**
 * The edge(s) of a circular BULGE from `from` to `to`: a minor arc whose apex stands `sagitta`
 * off the chord's midpoint. A POSITIVE sagitta bulges to the LEFT of the direction of travel as
 * seen on the page — OUTWARD on a loop drawn clockwise, which is how every builder here draws —
 * and a negative one bulges inward.
 *
 * `|sagitta|` is held to half the chord, so the arc is at most a semicircle; an arc over 120°
 * (`3·sag² > c²`, `c` the half-chord) is emitted as TWO edges split at its apex, so every edge
 * honours the `path` contract. A zero chord or zero sagitta is a straight edge. This is the
 * scallop of a tree canopy, the belly of a bowl, the crown of a cushion.
 */
export function bulgeArc(from: Point, to: Point, sagitta: number): PathEdge[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 0) || !(sagitta !== 0) || !Number.isFinite(sagitta)) return [{ t: "line", to }];
  const c = len / 2;
  const sag = sagitta > 0 ? Math.min(sagitta, c) : Math.max(sagitta, -c);
  const nx = dy / len;
  const ny = -dx / len;
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const apex = { x: mid.x + nx * sag, y: mid.y + ny * sag };
  const rad = (c * c + sag * sag) / (2 * Math.abs(sag));
  const k = sag > 0 ? rad : -rad;
  const center = { x: apex.x - nx * k, y: apex.y - ny * k };
  // A bulge to the left of travel turns clockwise on the page (SVG sweep 1), one to the right
  // counter-clockwise — read off the sign, never off a cross product, which is 0 for a
  // semicircle and would flip the bulge.
  const sweep: 0 | 1 = sag > 0 ? 1 : 0;
  if (3 * sag * sag > c * c) {
    return [
      { t: "arc", to: apex, center, r: rad, sweep },
      { t: "arc", to, center, r: rad, sweep },
    ];
  }
  return [{ t: "arc", to, center, r: rad, sweep }];
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
 * A repeat count derived from an aspect ratio, rounded and clamped to `[lo, hi]`.
 *
 * The NaN guard is the whole reason this is a function, and it comes from {@link clamp}: a
 * zero-area footprint makes the aspect `0/0`, `Math.round(NaN)` is `NaN`, and that clamp lands
 * `NaN` on `lo` instead of passing it through to a loop bound. `Infinity` (a zero-HEIGHT
 * footprint) needs no special case — `Math.round(Infinity)` is `Infinity` and the clamp pins it
 * to `hi`, which is the right answer: an infinitely wide sofa gets the maximum number of
 * cushions. Moved here verbatim from `glyphs-living.ts` and `glyphs-misc.ts`, which each had it.
 */
export function clampCount(v: number, lo: number, hi: number): number {
  return clamp(Math.round(v), lo, hi);
}

/**
 * The point at `deg` (screen degrees: 0 = +x, 90 = +y, i.e. DOWN) and radius `rad` about `c`.
 *
 * Fixed-step polar points for the symbols that are radial by nature (the planting, the plant, a
 * parasol's ribs, a trampoline's springs); moved here verbatim from `glyphs-misc.ts` and
 * `glyphs-outdoor.ts`, which each had it.
 */
export function polar(c: Point, rad: number, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  return { x: c.x + rad * Math.cos(a), y: c.y + rad * Math.sin(a) };
}

/**
 * A closed SCALLOPED ring: `lobes` circular lobes round `c`, lobe `j` centred on bearing
 * `phase + j × 360 / lobes` and bulging out to `apex(j)` from the centre, consecutive lobes
 * meeting at cusps on the circle of radius `cusp`. Each lobe is a {@link bulgeArc} (split at its
 * apex when it passes 120°), so the outline is a true curve — a `path`, not a star polygon.
 *
 * Drawn clockwise from the cusp before lobe 0. With `lobes` a multiple of four, `phase` a
 * multiple of half a lobe and `apex` a function of `j mod 2`, the ring maps onto itself under
 * every quarter-turn and every mirror of the square (D4), which is what the planting families'
 * and the plant's `symmetric: true` claims. `phase` defaults to 0, the tree's.
 *
 * Moved here verbatim from `glyphs-outdoor.ts` (the tree, the shrub); `glyphs-misc.ts`'s plant
 * had a copy without the `phase` parameter, which is this function at `phase = 0` byte for byte
 * (adding `0` to a nonzero double is exact).
 */
export function scallopPath(c: Point, lobes: number, cusp: number, apex: (j: number) => number, phase = 0): PathLoop {
  const step = 360 / lobes;
  const cuspAt = (j: number): Point => polar(c, cusp, (j - 0.5) * step + phase);
  const start = cuspAt(0);
  const edges: PathEdge[] = [];
  const mid = cusp * Math.cos((step / 2) * (Math.PI / 180)); // the chord's distance from c
  for (let j = 0; j < lobes; j++) {
    const to = j === lobes - 1 ? start : cuspAt(j + 1);
    edges.push(...bulgeArc(j === 0 ? start : cuspAt(j), to, apex(j) - mid));
  }
  return { start, edges };
}

/**
 * Draw a dining chair `w` wide whose VISIBLE part is `vis` deep, centred at `c + off`, with its
 * backrest along the `back` edge. `tuck` is the fraction of the chair's FULL depth hidden under a
 * table in front of it (0 for a free-standing chair): the seat runs to the visible part's front
 * edge with square corners there, and every proportion is taken off the full depth so a tucked
 * chair and a free one have the same backrest.
 *
 * The chair is built ONCE, back-on-top about the origin, its left and right edges at exactly
 * `∓` the same half-widths (so it is its own mirror image by construction), and then placed by
 * an EXACT quarter-turn — a swap and a negation of the local coordinates, no rotation arithmetic
 * — added to the offset before the centre. A table's four sides are one chair, not four copies
 * that each took their own rounding path.
 *
 * The pilot dining chair, shared so a `meeting_table`'s chairs are a `dining_table`'s byte for
 * byte; moved here verbatim from `glyphs-living.ts` and `glyphs-misc.ts`, which each had it.
 */
export function chairAt(
  g: GlyphCtx,
  c: Point,
  off: Point,
  back: "top" | "right" | "bottom" | "left",
  w: number,
  vis: number,
  tuck: number,
): void {
  const full = vis / (1 - tuck);
  const from = g.nodes.length;
  const s = Math.min(w, full);
  const y0 = -vis / 2;
  // The seat: a rounded square, white (it is upholstered), set in from the sides and tucked
  // under the backrest; its front corners are square when it runs on under a table.
  const sr = s * 0.12;
  const sw = w * 0.44;
  const seatTop = y0 + full * 0.08;
  const seat: Rect = { x: -sw, y: seatTop, w: 2 * sw, h: vis / 2 - seatTop };
  g.path(roundedRectPath(seat, tuck > 0 ? [sr, sr, 0, 0] : sr), g.basin);
  // The backrest: a bar 12% of the full depth along the back edge, full width, pill-ended.
  const bar: Rect = { x: -w / 2, y: y0, w, h: full * 0.12 };
  g.path(roundedRectPath(bar, bar.h / 2), g.body);
  const place = (p: Point): Point => {
    const q =
      back === "top"
        ? p
        : back === "right"
          ? { x: -p.y, y: p.x }
          : back === "bottom"
            ? { x: -p.x, y: -p.y }
            : { x: p.y, y: -p.x };
    return { x: c.x + (off.x + q.x), y: c.y + (off.y + q.y) };
  };
  for (let i = from; i < g.nodes.length; i++) g.nodes[i] = mapSceneNode(g.nodes[i]!, place, false);
}

/**
 * A closed polygon drawn with a DASHED outline.
 *
 * {@link GlyphCtx} has a dashed `seg` but no dashed `poly`, and an overhead piece — a wall
 * cabinet above the cut plane — is dashed all the way round by convention. Sets `lineType` AND
 * `paint.dash` to the same pattern for the reason this module's header gives: the SVG backend
 * follows the name and the PDF backend follows the number, so a node that disagrees with itself
 * draws two different dashes from one primitive. Its stroke colour follows its weight like
 * every factory's ({@link GlyphCtx.tone}).
 */
export function dashedPoly(g: GlyphCtx, pts: Point[], fill: string, weight: GlyphWeight = "thin"): void {
  g.nodes.push({
    layer: "furniture",
    prim: { t: "polygon", pts },
    paint: { fill, stroke: g.tone(weight), width: weightWidth(weight, g.sizes), dash: dashedPattern(g.sizes) },
    lineWeight: weight,
    lineType: "dashed",
  });
}

/**
 * Map a scene node's geometry point by point — the one traversal behind a glyph's
 * quarter-turn (`furniture.ts`'s `rotateNode`) and its reflection (`glyph-chirality.ts`'s
 * `mirrorNode`), which differ only in the point map and in whether it is a reflection.
 *
 * Every POINT a primitive carries goes through `pointMap`; a length (`r`) is invariant and
 * text stays upright. `reversesOrientation` says the map is a reflection: a reflection
 * REVERSES orientation, so every `sweep` flag flips — on an `arc` prim and on a `path`'s arc
 * edges — because a curve drawn clockwise from `start` to `end` is drawn counter-clockwise
 * once mirrored; a rotation preserves orientation and leaves them alone. Point ORDER within
 * a polygon is left alone, which flips the winding under a reflection (nothing downstream
 * reads a furniture polygon's winding).
 *
 * The switch is **exhaustive with no `default`** on purpose — the same guard `pdf.ts`'s
 * `drawNode` carries. A new `ScenePrim` variant fails the typecheck here instead of being
 * silently passed through unmapped. A `hatch` is a declared non-case: its `angle` is
 * measured in PATTERN space, so mapping its loops without the pattern would shear the fill
 * off its own boundary; no fixture glyph emits one, so give a glyph a hatch and the angle
 * rule has to be written first.
 */
export function mapSceneNode(n: SceneNode, pointMap: (p: Point) => Point, reversesOrientation: boolean): SceneNode {
  const pm = pointMap;
  const flip = (s: 0 | 1): 0 | 1 => (s === 0 ? 1 : 0);
  const prim = n.prim;
  switch (prim.t) {
    case "polygon":
      return { ...n, prim: { ...prim, pts: prim.pts.map(pm) } };
    case "line":
      return { ...n, prim: { ...prim, a: pm(prim.a), b: pm(prim.b) } };
    case "text":
      return { ...n, prim: { ...prim, at: pm(prim.at) } };
    case "circle":
      return { ...n, prim: { ...prim, center: pm(prim.center) } };
    case "arc":
      return {
        ...n,
        prim: {
          ...prim,
          center: pm(prim.center),
          start: pm(prim.start),
          end: pm(prim.end),
          ...(reversesOrientation ? { sweep: flip(prim.sweep) } : {}),
        },
      };
    case "region":
      return { ...n, prim: { ...prim, loops: prim.loops.map((lp) => lp.map(pm)) } };
    case "path":
      return {
        ...n,
        prim: {
          ...prim,
          loops: prim.loops.map((lp) => ({
            start: pm(lp.start),
            edges: lp.edges.map((e) =>
              e.t === "line"
                ? { ...e, to: pm(e.to) }
                : {
                    ...e,
                    to: pm(e.to),
                    center: pm(e.center),
                    ...(reversesOrientation ? { sweep: flip(e.sweep) } : {}),
                  },
            ),
          })),
        },
      };
    case "hatch":
      return n;
  }
}
