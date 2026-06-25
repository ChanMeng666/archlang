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
 * Phase v0.7 keeps this deliberately small: line-weight/line-type/named-layer
 * metadata, hatch primitives, and circles are intentionally deferred to Phase v0.9
 * (roadmap §6). Poché stays an SVG `<pattern>` fill string; page chrome (north
 * arrow, scale bar, title block) stays in the backends for now.
 */

import type { NorthDir, Point, TitleNode } from "./ast.js";
import type { Span } from "./diagnostics.js";
import type { Bounds } from "./geometry.js";
import type { Theme } from "./theme.js";

/**
 * Ordered draw layers. Nodes are bucketed by `layer` and emitted in this order,
 * preserving collection order within a layer — this exactly reproduces the v0.1
 * global draw order (all wall fills, then all wall faces, doors before windows,
 * labels above fills, …). Doubles as the discriminant of {@link SceneNode.layer}.
 */
export const RENDER_PASSES = [
  "floor",
  "furniture",
  "wallFill",
  "wallFace",
  "doors",
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

/** Named line types (dash conventions). `continuous` is the default solid line. */
export const LINE_TYPES = ["continuous", "dashed", "center", "hidden"] as const;
export type LineType = (typeof LINE_TYPES)[number];

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
    case "floor": return "A-FLOR";
    case "furniture": return "A-FURN";
    case "wallFill":
    case "wallFace": return "A-WALL";
    case "doors": return "A-DOOR";
    case "windows": return "A-GLAZ";
    case "labels": return "A-ANNO-TEXT";
    case "dims": return "A-ANNO-DIMS";
    case "annotations": return "A-ANNO";
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
  /** Padded page width/height in mm (drawing extent + annotation margin). */
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
  name: string;
  /** Distinct wall materials in use (stable order), so the SVG backend can emit hatch `<pattern>`s. */
  materials: string[];
}
