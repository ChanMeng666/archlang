/**
 * DXF export backend — a pure serializer of the {@link Scene}. Emits ASCII DXF
 * headed `AC1015` (AutoCAD 2000): R12-style LINE/ARC/TEXT entities (broadly
 * importable) plus the v0.9 `HATCH` entity (introduced after R12, hence the
 * version bump) so wall poché survives to CAD as a real hatch, not just boundary
 * lines. Pure, synchronous, zero-dep: DXF is plain text, so this needs no
 * external library and ships in the core. Build a Scene with
 * `toScene(resolve(ast).ir)` (or `compile().scene`).
 *
 * As of v0.7 the geometry is NOT re-derived here: door arcs, window panes, and
 * dimension ticks are the very `ScenePrim`s the elements produced. Each primitive
 * maps generically to a DXF entity; the only element-aware step is mapping a draw
 * layer to a DXF layer name. DXF's Y axis points up while ArchLang's points down,
 * so every Y is negated to keep plans right-side-up in CAD.
 */

import type { Point } from "../ast.js";
import type { LineType, Scene, SceneNode } from "../scene.js";
import { layerOf } from "../scene.js";
import { VIEW_LAYER_NAMES } from "../view/paint.js";
import { minorArcDegrees } from "../geometry.js";
import { dxfPatternName, isSolidFill } from "../hatches.js";
// Deterministic number formatting (round to 4dp, no -0).
import { fmt4 as num } from "../num-format.js";
import { plainText } from "../text-safe.js";

/** Map a Scene line type to a DXF LTYPE name; undefined (or continuous) → BYLAYER. */
function dxfLineType(t: LineType | undefined): string | undefined {
  switch (t) {
    case "dashed":
      return "DASHED";
    case "center":
      return "CENTER";
    case "hidden":
      return "HIDDEN";
    default:
      return undefined;
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

  /** A native CIRCLE entity (an axis bubble), so CAD sees a circle, not two arcs. */
  circle(layer: string, center: Point, radius: number, ltype?: string): void {
    this.begin("CIRCLE", layer, ltype);
    this.pair(10, num(center.x));
    this.pair(20, num(-center.y));
    this.pair(40, num(radius));
  }

  text(layer: string, at: Point, height: number, value: string, ltype?: string): void {
    this.begin("TEXT", layer, ltype);
    this.pair(10, num(at.x));
    this.pair(20, num(-at.y));
    this.pair(40, num(height));
    // DXF is a line-oriented group-code stream, so ANY control character in the
    // value would desynchronize a reader (LF and CR both end a record) or drive a
    // terminal (ESC). `plainText` blanks every one of them — for a newline that is
    // exactly the space this line has always substituted, so output is unchanged.
    this.pair(1, plainText(value));
  }

  /** Closed loop of points as a chain of LINEs (R12-safe; no LWPOLYLINE). */
  loop(layer: string, pts: Point[], ltype?: string): void {
    for (let i = 0; i < pts.length; i++) {
      this.line(layer, pts[i]!, pts[(i + 1) % pts.length]!, ltype);
    }
  }

  /**
   * A real HATCH entity (AutoCAD 2000+). Each region loop becomes a closed
   * polyline boundary path; `pattern` is a predefined pattern name (group 2),
   * with `scale`/`angle` (groups 41/52). `solid` switches to a solid fill (70=1).
   * Hatch style 75=0 (odd-parity) so multi-loop regions render holes correctly.
   */
  hatch(layer: string, loops: Point[][], pattern: string, solid: boolean, scale: number, angle: number): void {
    this.pair(0, "HATCH");
    this.pair(100, "AcDbEntity");
    this.pair(8, layer);
    this.pair(100, "AcDbHatch");
    this.pair(10, 0);
    this.pair(20, 0);
    this.pair(30, 0); // elevation point
    this.pair(210, 0);
    this.pair(220, 0);
    this.pair(230, 1); // extrusion
    this.pair(2, pattern);
    this.pair(70, solid ? 1 : 0);
    this.pair(71, 0); // non-associative
    this.pair(91, loops.length); // boundary path count
    for (const loop of loops) {
      this.pair(92, 2); // polyline boundary
      this.pair(72, 0); // no bulge
      this.pair(73, 1); // closed
      this.pair(93, loop.length); // vertex count
      for (const p of loop) {
        this.pair(10, num(p.x));
        this.pair(20, num(-p.y));
      }
      this.pair(97, 0); // source boundary objects
    }
    this.pair(75, 0); // hatch style: normal (odd parity)
    this.pair(76, 1); // pattern type: predefined
    if (!solid) {
      this.pair(52, num(angle)); // pattern angle (deg)
      this.pair(41, num(scale)); // pattern scale
      this.pair(77, 0); // not doubled
      this.pair(78, 0); // pattern definition lines (predefined → resolved by name)
    }
    this.pair(98, 0); // seed points
  }

  toString(): string {
    return this.out.join("\n") + "\n";
  }
}

/** CAD layers and their DXF colour numbers (group code 62).
 *
 * Every layer any node can land on must be declared here: the pass defaults from
 * `aiaLayer()` **and** the per-node `layerName` overrides (`A-COLS`, the two
 * `A-FLOR-*` shaft sublayers, `A-ROOF`, and the v1.31 ground layers). An entity
 * referencing an undeclared layer is only tolerated because most readers auto-create it.
 *
 * **`test/export-dxf.test.ts` pins the closure in both directions — but a closure test is
 * only as strong as the fixture it runs on.** That is not a caveat, it is the recorded
 * history of this table: `A-ROOF` and `A-FLOR-OVHD` shipped in v1.29 and were never added
 * here, and `examples/bungalow.arch` has been exporting a DXF with an undeclared `A-ROOF`
 * ever since — while the closure test stayed green throughout, because its `allPasses`
 * fixture had no `roof` in it. The fixture now carries one of every element that sets a
 * `layerName`, which is the only version of this gate that can catch the next one.
 *
 * ## Discipline prefixes
 *
 * `A-` is architectural, and it was the only prefix until v1.31. The ground layers use
 * the other two standard NCS disciplines, and they earn them: `L-` is LANDSCAPE (planting
 * and hard landscape) and `C-` is CIVIL (the property line). A CAD user freezes by
 * discipline, so putting a lawn on an `A-` layer would hide it behind the wrong switch. */
const AIA_LAYERS: { name: string; color: number }[] = [
  { name: "A-WALL", color: 7 },
  { name: "A-FLOR", color: 8 },
  { name: "A-FLOR-STRS", color: 3 },
  { name: "A-FLOR-EVTR", color: 3 },
  // A floor VOID (v1.29) and a BALCONY slab (v1.31) — both floor-plate sublayers.
  { name: "A-FLOR-OVHD", color: 8 },
  { name: "A-FLOR-BALC", color: 8 },
  { name: "A-GRID", color: 4 },
  { name: "A-FURN", color: 3 },
  { name: "A-COLS", color: 1 },
  { name: "A-DOOR", color: 4 },
  { name: "A-GLAZ", color: 5 },
  { name: "A-ROOF", color: 8 },
  { name: "A-ANNO-TEXT", color: 6 },
  { name: "A-ANNO-DIMS", color: 2 },
  { name: "A-ANNO", color: 8 },
  // Landscape (v1.31): planting green, hard landscape grey.
  { name: "L-PLNT", color: 3 },
  { name: "L-SITE", color: 8 },
  // Civil (v1.31): the property line, in the magenta a lot line conventionally takes.
  { name: "C-PROP", color: 6 },
];

/**
 * The axonometric view's layers (v1.35), declared **only on a drawing that uses them**.
 *
 * `V-` is deliberately outside the `A-`/`L-`/`C-` NCS discipline namespace above: a CAD
 * user freezes by discipline, and an illustrative 3D view is not a discipline's drawing —
 * putting an extruded wall on `A-WALL` would make it appear and disappear with the
 * architectural plan it is not part of.
 *
 * They are conditional rather than static because the guard that caught `A-ROOF`'s
 * two-release absence is "declares no dead layer", and three rows a plan drawing can
 * never reach would be exactly that. A plan-view DXF is therefore byte-identical: the
 * table only grows when a `V-` node is present. The names come from `src/view/paint.ts`
 * rather than being retyped here.
 */
const VIEW_LAYER_COLORS: Record<string, number> = { "V-3D-WALL": 7, "V-3D-FLOOR": 8, "V-3D-GLAZ": 5 };

/** Dash definitions (drawing units = mm): name, descriptive text, and pattern.
 *  Positive = dash, negative = gap. Solid CONTINUOUS has an empty pattern. */
const LTYPES: { name: string; desc: string; pattern: number[] }[] = [
  { name: "CONTINUOUS", desc: "Solid line", pattern: [] },
  { name: "DASHED", desc: "Dashed", pattern: [200, -100] },
  { name: "CENTER", desc: "Center", pattern: [400, -100, 100, -100] },
  { name: "HIDDEN", desc: "Hidden", pattern: [100, -100] },
];

/** The LAYER rows this drawing declares: the static AIA set, plus any `V-` view layer its
 *  own nodes actually reference (see {@link VIEW_LAYER_COLORS}). */
function layerRows(nodes: readonly SceneNode[]): { name: string; color: number }[] {
  const used = new Set(nodes.map(layerOf));
  const extra = VIEW_LAYER_NAMES.filter((n) => used.has(n)).map((name) => ({
    name,
    color: VIEW_LAYER_COLORS[name] ?? 7,
  }));
  return [...AIA_LAYERS, ...extra];
}

function header(layers: readonly { name: string; color: number }[]): string {
  const h: string[] = [];
  const p = (c: number, v: string | number) => h.push(String(c), String(v));
  // Minimal HEADER declaring AutoCAD 2000 (AC1015) — the HATCH entity needs > R12.
  p(0, "SECTION");
  p(2, "HEADER");
  p(9, "$ACADVER");
  p(1, "AC1015");
  p(0, "ENDSEC");
  p(0, "SECTION");
  p(2, "TABLES");
  // LTYPE table FIRST, so the LAYER table (and entities) can reference linetypes.
  p(0, "TABLE");
  p(2, "LTYPE");
  p(70, LTYPES.length);
  for (const lt of LTYPES) {
    p(0, "LTYPE");
    p(2, lt.name);
    p(70, 0);
    p(3, lt.desc);
    p(72, 65);
    p(73, lt.pattern.length);
    p(40, num(lt.pattern.reduce((s, d) => s + Math.abs(d), 0)));
    for (const d of lt.pattern) p(49, num(d));
  }
  p(0, "ENDTAB");
  // LAYER table (AIA names + colours) so entities reference real layers.
  p(0, "TABLE");
  p(2, "LAYER");
  p(70, layers.length);
  for (const { name, color } of layers) {
    p(0, "LAYER");
    p(2, name);
    p(70, 0);
    p(62, color);
    p(6, "CONTINUOUS");
  }
  p(0, "ENDTAB");
  p(0, "ENDSEC");
  return h.join("\n") + "\n";
}

/** Serialize one scene node to DXF entities on its CAD layer. */
function emit(b: DxfBuilder, node: SceneNode): void {
  const layer = layerOf(node);
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
    // A `path` loop becomes the same entities a CAD user would draw by hand: a LINE per
    // straight edge and a native ARC per curved one. Never a faceted POLYLINE — the whole
    // reason the primitive carries arcs is that a curved wall face must stay a real curve
    // in the file a draughtsman opens.
    case "path":
      for (const lp of prim.loops) {
        let from = lp.start;
        for (const e of lp.edges) {
          if (e.t === "line") b.line(layer, from, e.to, lt);
          else {
            const [a0, a1] = minorArcDegrees(e.center, from, e.to);
            b.arc(layer, e.center, e.r, a0, a1, lt);
          }
          from = e.to;
        }
      }
      break;
    case "hatch":
      b.hatch(layer, prim.region, dxfPatternName(prim.material), isSolidFill(prim.material), prim.scale, prim.angle);
      break;
    case "arc": {
      const [a0, a1] = minorArcDegrees(prim.center, prim.start, prim.end);
      b.arc(layer, prim.center, prim.r, a0, a1, lt);
      break;
    }
    case "circle":
      b.circle(layer, prim.center, prim.r, lt);
      break;
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
  return header(layerRows(scene.nodes)) + b.toString() + "0\nEOF\n";
}
