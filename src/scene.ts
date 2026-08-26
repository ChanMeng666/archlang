/**
 * Backend-neutral **Scene IR** — the keystone drawing intermediate.
 *
 * `resolve()` produces semantic geometry (rooms, walls, openings); this module
 * defines a flat list of *positioned drawing primitives* tagged with a layer and
 * paint. Geometry is computed exactly **once** here (by the elements, lowered via
 * `scene-build.ts`); every backend (SVG, DXF, PDF, …) is then a thin, pure
 * serializer of the same `Scene`. This kills the geometry duplication the
 * string-based `RenderOp` forced (DXF re-deriving door arcs, PDF rasterizing SVG).
 *
 * Prior art: Typst's `Frame`/`FrameItem` (crates/typst-library/src/layout/frame.rs)
 * — a positioned list of drawable items — and D2's `d2target` (a flat, pointer-free
 * render target consumed by independent backends). ArchLang has no nested
 * transforms, so unlike Typst's `Frame` the node list is flat (no sub-frames).
 *
 * Phase v0.7 kept this deliberately small: line-weight/line-type/named-layer
 * metadata and hatch primitives arrived in Phase v0.9 (roadmap §6), and the `circle`
 * primitive in v1.20 with the positioning-axis bubbles. Poché stays an SVG
 * `<pattern>` fill string; page chrome (north arrow, scale bar, title block) stays in
 * the backends for now.
 */

import type { NorthDir, Point, TitleNode } from "./ast.js";
// Type-only and erased at runtime, so the scene ↔ chrome-layout reference is not a real cycle.
import type { ChromeLayout } from "./chrome-layout.js";
import type { Span } from "./diagnostics.js";
import type { Bounds } from "./geometry.js";
import type { HatchSpec } from "./hatches.js";
import type { ResolvedSheet } from "./sheet.js";
import type { Theme } from "./theme.js";

/**
 * Ordered draw layers. Nodes are bucketed by `layer` and emitted in this order,
 * preserving collection order within a layer — this exactly reproduces the v0.1
 * global draw order (all wall fills, then all wall faces, doors before windows,
 * labels above fills, …). Doubles as the discriminant of {@link SceneNode.layer}.
 */
export const RENDER_PASSES = [
  "floor",
  // Positioning axes (定位轴线) sit just above the room floor fills and below the built
  // fabric: a datum line reads *through* the drawing (visible in the rooms and outside
  // the building, hidden inside the wall poché), which is how GB/T sheets read. Their
  // bubbles land outside the building where nothing overlaps. A plan with no `axes`
  // block emits no node on this pass, so inserting it here leaves every existing
  // drawing byte-identical.
  "axes",
  "furniture",
  "wallFill",
  "wallFace",
  "doors",
  "openings",
  "windows",
  "labels",
  "dims",
  "annotations",
] as const;
export type RenderPass = (typeof RENDER_PASSES)[number];

/**
 * Named line-weight steps (a CAD pen ramp). A backend maps each to a concrete
 * stroke width via the drawing's reference dimension + theme `lineWeight`, so the
 * weight *hierarchy* is defined once and stays consistent across SVG/DXF/PDF.
 */
export const LINE_WEIGHTS = ["heavy", "medium", "thin", "extraThin"] as const;
export type LineWeight = (typeof LINE_WEIGHTS)[number];

/**
 * Named line-weight ramp → concrete stroke width in mm, scaled from the drawing.
 * `heavy` matches the wall stroke; the rest step down. The whole hierarchy keys off the
 * same sizes (which already include the theme `lineWeight` multiplier), so weights stay
 * proportional at any drawing size.
 *
 * It lives HERE, beside the ramp it resolves, rather than inside the SVG backend where it
 * was written — because it is not an SVG fact. Only the SVG serializer consults
 * `node.lineWeight`; the PDF backend reads `paint.width` and nothing else. A node that
 * carries a weight must therefore also carry the width that weight resolves to, or the two
 * exports disagree about how thick a line is. `elements/glyph-lib.ts` is the caller that
 * needs it: it sets both, from this one function.
 */
export function weightWidth(w: LineWeight, sizes: RenderSizes): number {
  switch (w) {
    case "heavy":
      return sizes.wallStroke;
    case "medium":
      return sizes.wallStroke * 0.6;
    case "thin":
      return sizes.thin;
    case "extraThin":
      return sizes.thin * 0.55;
  }
}

/** Named line types (dash conventions). `continuous` is the default solid line. */
export const LINE_TYPES = ["continuous", "dashed", "center", "hidden"] as const;
export type LineType = (typeof LINE_TYPES)[number];

/**
 * The sheet a paper-mode drawing is laid out on: the resolved paper + operative scale
 * (see `src/sheet.ts`), plus the **page rectangle in plan millimetres** the drawing is
 * centred on. Present only when the plan declares `paper`; absent → the backends size
 * the page from the drawing extent + margins exactly as before (byte-identical).
 */
export interface SceneSheet extends ResolvedSheet {
  /** The page in plan mm: `w`/`h` are the paper mm × the scale denominator. */
  page: { x: number; y: number; w: number; h: number };
  /** True when the laid-out drawing overflowed the sheet and the page grew to fit. */
  grown: boolean;
}

/** Render-derived sizes (in mm), scaled from the drawing's reference dimension. */
export interface RenderSizes {
  refDim: number;
  wallStroke: number;
  thin: number;
  roomFont: number;
  areaFont: number;
  dimFont: number;
  furnFont: number;
  margin: number;
  hatchGap: number;
}

/**
 * How a primitive is painted. Strokes/fills carry colours (already theme-resolved
 * and escaped at the serialization boundary); `width`/`dash` carry *raw* numbers
 * that each backend formats. The optional `linecap`/`linejoin`/`fillRule` cover
 * the exact SVG attributes the original element emitters used, so the SVG
 * serializer reproduces today's output byte-for-byte.
 */
/**
 * Mitre cap for a mitred join, in stroke widths. A mitre's point grows as
 * `1 / sin(θ/2)`: harmless at the 90° corners the rectilinear wall boolean produces
 * (1.41×), but 12× the line weight where two walls meet at 10° — a black needle shot
 * out of the building. 4 is the SVG default (so SVG output is visually unchanged and
 * the attribute merely makes the contract explicit) and is what the PDF export, whose
 * own default is 10, is now held to as well.
 */
export const MITER_LIMIT = 4;

export interface Paint {
  /** A colour, `"none"`, or an SVG pattern ref like `"url(#poche)"`. */
  fill?: string;
  stroke?: string;
  /** Raw stroke width in mm (backend applies its own number formatting). */
  width?: number;
  /** `stroke-dasharray` pair in mm (e.g. door swing arc). */
  dash?: [number, number];
  linecap?: "square";
  linejoin?: "miter";
  /**
   * Cap on a mitred join's spike, as a multiple of the stroke width. A mitre grows as
   * `1 / sin(θ/2)`, so at an ACUTE wall joint the point runs away — 12× the line weight
   * at 10°. Beyond the limit the renderer bevels the corner instead. Carried on the
   * paint (not hardcoded per backend) because the backends' own defaults DISAGREE: SVG
   * defaults to 4, PDF to 10, so the same drawing spiked in one export and not the other.
   */
  miterLimit?: number;
  fillRule?: "nonzero";
}

/**
 * A positioned drawing primitive. Coordinates are absolute millimetres in the
 * plan's space (origin top-left, +x right, +y down — SVG convention); backends
 * apply their own transforms (e.g. DXF's Y-flip).
 */
export type ScenePrim =
  /** A filled/stroked closed polygon (room, furniture, column, opening cover, per-segment wall fill). */
  | { t: "polygon"; pts: Point[] }
  /** A single straight segment (wall face, door leaf, window pane, dimension lines/ticks). */
  | { t: "line"; a: Point; b: Point }
  /**
   * A multi-loop closed region drawn as one path (`fill-rule` nonzero), used for
   * unioned orthogonal walls so the poché fills with proper holes and the outline
   * has no internal seams.
   */
  | { t: "region"; loops: Point[][] }
  /**
   * A circular arc (door swing). Carries the `center`/`r` a CAD backend needs to
   * emit a native arc, plus the explicit `start`/`end` points + `sweep` flag an
   * SVG `A` command needs — so neither backend re-derives endpoints from trig.
   */
  | { t: "arc"; center: Point; r: number; start: Point; end: Point; sweep: 0 | 1 }
  /**
   * A full circle (an axis bubble). Kept distinct from `arc` so a CAD backend emits one
   * native `CIRCLE` entity rather than two half-arcs, and so a raster/vector backend
   * needs no sweep bookkeeping. Added in v1.20 (the deferral note above); nothing else
   * emits one, so existing output is unaffected.
   */
  | { t: "circle"; center: Point; r: number }
  /**
   * A hatched (poché) region: closed loops filled with a named material pattern,
   * scaled and rotated. The SVG backend bakes `scale`→tile size and `angle`→
   * `patternTransform`; the DXF backend emits a real `HATCH` entity. `origin` is
   * the optional pattern anchor (defaults to the drawing origin).
   */
  | { t: "hatch"; region: Point[][]; material: string; scale: number; angle: number; origin?: Point }
  /** A text label. `value` is the raw (unescaped) string; backends escape on emit. */
  | {
      t: "text";
      at: Point;
      value: string;
      size: number;
      anchor: "start" | "middle" | "end";
      baseline: "central";
      /** SVG `font-weight` (e.g. 600 for a room name). */
      weight?: number;
      /** Rotation in degrees about `at` (e.g. dimension text along its line). */
      rotate?: number;
    };

/**
 * Default AIA (American Institute of Architects) CAD layer name for a draw pass.
 * A node may override this via {@link SceneNode.layerName} (e.g. a column lives in
 * the `furniture` pass but belongs on `A-COLS`).
 */
export function aiaLayer(pass: RenderPass): string {
  switch (pass) {
    case "floor":
      return "A-FLOR";
    // The AIA layer for a planning/structural grid — a CAD user freezes A-GRID to get
    // the drawing without its datum lines.
    case "axes":
      return "A-GRID";
    case "furniture":
      return "A-FURN";
    case "wallFill":
    case "wallFace":
      return "A-WALL";
    case "doors":
    // A cased opening is a door-family void, not glazing — it belongs on A-DOOR
    // (an `openings` node on A-GLAZ made a leaf-less passage read as a window).
    case "openings":
      return "A-DOOR";
    case "windows":
      return "A-GLAZ";
    case "labels":
      return "A-ANNO-TEXT";
    case "dims":
      return "A-ANNO-DIMS";
    case "annotations":
      return "A-ANNO";
  }
}

/** One drawable: a primitive on a layer, with paint and an optional source span.
 *
 * `lineWeight`/`lineType`/`layerName` are optional *semantic* style metadata
 * (added in Phase v0.9). When `lineWeight` is set a backend derives the stroke
 * width from the named ramp (overriding `paint.width`); when `lineType` is set
 * (and not `continuous`) it derives the dash pattern. `layerName` names the CAD
 * layer (AIA) the node belongs to. All are additive: a node that sets none
 * renders exactly as before. */
export interface SceneNode {
  layer: RenderPass;
  prim: ScenePrim;
  paint: Paint;
  lineWeight?: LineWeight;
  lineType?: LineType;
  layerName?: string;
  span?: Span;
  /** Resolved element id (e.g. "room_1", user-provided via `id=`). Annotate mode only. */
  elementId?: string;
  /** Element kind ("room" | "door" | ...). Annotate mode only. */
  elementKind?: string;
}

/** Effective CAD layer for a node: explicit `layerName`, else the pass default. */
export function layerOf(node: SceneNode): string {
  return node.layerName ?? aiaLayer(node.layer);
}

/**
 * A complete, backend-neutral drawing. `nodes` is the geometry; the remaining
 * fields are the page-level context backends need (viewBox sizing, theme colours
 * for chrome, north/scale/title block, hatch materials in use). Theme is baked
 * into node paint already — it is carried here only for the page chrome.
 */
export interface Scene {
  /** Padded page width/height in mm (drawing extent + annotation margin — or the
   *  sheet, when {@link sheet} is set). */
  width: number;
  height: number;
  /** Tight drawing bounds (before margin), for chrome placement. */
  bounds: Bounds;
  nodes: SceneNode[];
  theme: Theme;
  sizes: RenderSizes;
  north: NorthDir;
  scale?: string;
  title?: TitleNode;
  /**
   * The plan name. In accessible mode (`compile(src, { accessible: true })`) it is
   * the effective accessible title — the plan name, or an explicit `accTitle "…"`
   * override — which the SVG backend emits as `<title>`. Read nowhere else, so the
   * override is invisible to default output.
   */
  name: string;
  /**
   * Deterministic natural-language caption for the accessible `<desc>`: the
   * `describe()` sentence, or an explicit `accDescr "…"` override. Set by `toScene`
   * only in accessible mode (`compile(src, { accessible: true })`). Absent by
   * default → output unchanged.
   */
  caption?: string;
  /** Distinct hatch specs in use (stable order), so the SVG backend can emit a `<pattern>` per spec. */
  hatches: HatchSpec[];
  /**
   * Page-chrome layout computed by `toScene` (the margins already shape
   * `width`/`height`). Backends use it when present instead of re-running
   * `layoutChrome`; optional so hand-built Scenes keep working (append-only).
   */
  chrome?: ChromeLayout;
  /**
   * The sheet this drawing is issued on (`paper …`), with the page rectangle the
   * backends must use for the viewBox / PDF page instead of deriving one from the
   * drawing extent. Absent for a plan with no `paper` — optional so hand-built Scenes
   * and every existing plan keep working (append-only).
   */
  sheet?: SceneSheet;
}
