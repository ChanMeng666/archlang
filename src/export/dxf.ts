/**
 * DXF export backend — a pure serializer of the {@link Scene}. Emits ASCII DXF
 * (R12 / AC1009, the most broadly importable flavor). Pure, synchronous,
 * zero-dep: DXF is plain text, so this needs no external library and ships in the
 * core. Build a Scene with `toScene(resolve(ast).ir)` (or `compile().scene`).
 *
 * As of v0.7 the geometry is NOT re-derived here: door arcs, window panes, and
 * dimension ticks are the very `ScenePrim`s the elements produced. Each primitive
 * maps generically to a DXF entity; the only element-aware step is mapping a draw
 * layer to a DXF layer name. DXF's Y axis points up while ArchLang's points down,
 * so every Y is negated to keep plans right-side-up in CAD.
 */

import type { Point } from "../ast.js";
import type { LineType, RenderPass, Scene, SceneNode } from "../scene.js";
import { minorArcDegrees } from "../geometry.js";

/** Deterministic number formatting (round to 4dp, no -0). */
function num(v: number): string {
  const r = Math.round(v * 1e4) / 1e4;
  return Object.is(r, -0) ? "0" : String(r);
}

/** Map a Scene line type to a DXF LTYPE name; undefined (or continuous) → BYLAYER. */
function dxfLineType(t: LineType | undefined): string | undefined {
  switch (t) {
    case "dashed": return "DASHED";
    case "center": return "CENTER";
    case "hidden": return "HIDDEN";
    default: return undefined;
  }
}

class DxfBuilder {
  private out: string[] = [];

  /** group-code / value pair. */
  pair(code: number, value: string | number): void {
    this.out.push(String(code), String(value));
  }

  /** Common entity prelude: type, layer (8), and optional linetype (6). */
  private begin(type: string, layer: string, ltype?: string): void {
    this.pair(0, type);
    this.pair(8, layer);
    if (ltype) this.pair(6, ltype);
  }

  line(layer: string, a: Point, b: Point, ltype?: string): void {
    this.begin("LINE", layer, ltype);
    this.pair(10, num(a.x));
    this.pair(20, num(-a.y));
    this.pair(11, num(b.x));
    this.pair(21, num(-b.y));
  }

  arc(layer: string, center: Point, radius: number, startDeg: number, endDeg: number, ltype?: string): void {
    this.begin("ARC", layer, ltype);
    this.pair(10, num(center.x));
    this.pair(20, num(-center.y));
    this.pair(40, num(radius));
    this.pair(50, num(startDeg));
    this.pair(51, num(endDeg));
  }

  text(layer: string, at: Point, height: number, value: string, ltype?: string): void {
    this.begin("TEXT", layer, ltype);
    this.pair(10, num(at.x));
    this.pair(20, num(-at.y));
    this.pair(40, num(height));
    this.pair(1, value.replace(/\n/g, " "));
  }

  /** Closed loop of points as a chain of LINEs (R12-safe; no LWPOLYLINE). */
  loop(layer: string, pts: Point[], ltype?: string): void {
    for (let i = 0; i < pts.length; i++) {
      this.line(layer, pts[i], pts[(i + 1) % pts.length], ltype);
    }
  }

  toString(): string {
    return this.out.join("\n") + "\n";
  }
}

const LAYERS = ["WALLS", "ROOMS", "DOORS", "WINDOWS", "FURNITURE", "COLUMNS", "DIMS", "LABELS"];

/** Dash definitions (drawing units = mm): name, descriptive text, and pattern.
 *  Positive = dash, negative = gap. Solid CONTINUOUS has an empty pattern. */
const LTYPES: { name: string; desc: string; pattern: number[] }[] = [
  { name: "CONTINUOUS", desc: "Solid line", pattern: [] },
  { name: "DASHED", desc: "Dashed", pattern: [200, -100] },
  { name: "CENTER", desc: "Center", pattern: [400, -100, 100, -100] },
  { name: "HIDDEN", desc: "Hidden", pattern: [100, -100] },
];

/** Map a Scene draw layer to a DXF layer name. */
function dxfLayer(layer: RenderPass): string {
  switch (layer) {
    case "wallFill":
    case "wallFace":
      return "WALLS";
    case "floor":
      return "ROOMS";
    case "doors":
      return "DOORS";
    case "windows":
      return "WINDOWS";
    case "furniture":
      return "FURNITURE";
    case "labels":
      return "LABELS";
    case "dims":
      return "DIMS";
    default:
      return "0";
  }
}

function header(): string {
  const h: string[] = [];
  const p = (c: number, v: string | number) => h.push(String(c), String(v));
  // Minimal HEADER declaring R12.
  p(0, "SECTION"); p(2, "HEADER"); p(9, "$ACADVER"); p(1, "AC1009"); p(0, "ENDSEC");
  p(0, "SECTION"); p(2, "TABLES");
  // LTYPE table FIRST, so the LAYER table (and entities) can reference linetypes.
  p(0, "TABLE"); p(2, "LTYPE"); p(70, LTYPES.length);
  for (const lt of LTYPES) {
    p(0, "LTYPE"); p(2, lt.name); p(70, 0); p(3, lt.desc); p(72, 65);
    p(73, lt.pattern.length); p(40, num(lt.pattern.reduce((s, d) => s + Math.abs(d), 0)));
    for (const d of lt.pattern) p(49, num(d));
  }
  p(0, "ENDTAB");
  // LAYER table so entities reference real layers.
  p(0, "TABLE"); p(2, "LAYER"); p(70, LAYERS.length);
  for (const name of LAYERS) {
    p(0, "LAYER"); p(2, name); p(70, 0); p(62, 7); p(6, "CONTINUOUS");
  }
  p(0, "ENDTAB"); p(0, "ENDSEC");
  return h.join("\n") + "\n";
}

/** Serialize one scene node to DXF entities on the given layer. */
function emit(b: DxfBuilder, node: SceneNode): void {
  const layer = dxfLayer(node.layer);
  const lt = dxfLineType(node.lineType);
  const prim = node.prim;
  switch (prim.t) {
    case "polygon":
      b.loop(layer, prim.pts, lt);
      break;
    case "line":
      b.line(layer, prim.a, prim.b, lt);
      break;
    case "region":
      for (const lp of prim.loops) b.loop(layer, lp, lt);
      break;
    case "arc": {
      const [a0, a1] = minorArcDegrees(prim.center, prim.start, prim.end);
      b.arc(layer, prim.center, prim.r, a0, a1, lt);
      break;
    }
    case "text":
      b.text(layer, prim.at, prim.size, prim.value, lt);
      break;
  }
}

/** Render a {@link Scene} as an ASCII DXF document string. */
export function toDxf(scene: Scene): string {
  const b = new DxfBuilder();
  b.pair(0, "SECTION");
  b.pair(2, "ENTITIES");
  for (const node of scene.nodes) emit(b, node);
  b.pair(0, "ENDSEC");
  return header() + b.toString() + "0\nEOF\n";
}
