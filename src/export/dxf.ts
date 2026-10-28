/**
 * DXF export backend — a pure serializer of the {@link Scene}. Emits ASCII DXF
 * headed `AC1015` (AutoCAD 2000): R12-style LINE/ARC/TEXT entities (broadly
 * importable) plus the `HATCH` entity (introduced after R12, hence the
 * version bump) so wall poché survives to CAD as a real hatch, not just boundary
 * lines. Pure, synchronous, zero-dep: DXF is plain text, so this needs no
 * external library and ships in the core. Build a Scene with
 * `toScene(resolve(ast).ir)` (or `compile().scene`). `compile().scene` is the guarded route:
 * `compile()` refuses a drawing past the drawing budget (`E_DRAWING_LIMIT`) before building the
 * Scene, and `toScene()` on a resolved IR does not.
 *
 * The geometry is NOT re-derived here: door arcs, window panes, and
 * dimension ticks are the very `ScenePrim`s the elements produced. Each primitive
 * maps generically to a DXF entity; the only element-aware step is mapping a draw
 * layer to a DXF layer name. DXF's Y axis points up while ArchLang's points down,
 * so every Y is negated to keep plans right-side-up in CAD.
 *
 * The HEADER declares the drawing unit (`$INSUNITS` 4 = millimetres, `$MEASUREMENT` 1 =
 * metric), so a CAD program inserts the plan at its true size instead of guessing.
 *
 * Walls are the one place the export knows more than a node says. The drawn walls are ONE
 * joined outline and one fill per material, which no longer say which wall drew which
 * face; a CAD user still wants exterior and interior walls on separate layers. So the wall
 * nodes are re-filed (never redrawn) through {@link classifyWallSet} — see
 * {@link wallRefiling}.
 */

import type { Point } from "../ast.js";
import type { LineType, PathLoop, Scene, SceneNode, SceneWall } from "../scene.js";
import { layerOf } from "../scene.js";
import { VIEW_LAYER_NAMES } from "../view/paint.js";
import { minorArcDegrees } from "../geometry.js";
import { dxfPatternName, isSolidFill } from "../hatches.js";
// Deterministic number formatting (round to 4dp, no -0).
import { fmt4 as num } from "../num-format.js";
import { plainText } from "../text-safe.js";
import { textLines } from "../text-layout.js";
import { type ClassedWallSet, classifyWallSet } from "../wall-lowering.js";

/** Cap height of the drawing sans (Arial 0.716 em, Roboto 0.711 em), as a fraction of its font size. */
const CAP_HEIGHT = 0.716;

/**
 * A text value as pure ASCII: every non-ASCII character becomes the `\U+XXXX` escape that
 * AutoCAD and every DXF reader decode for an R2000 file. The file declares no
 * `$DWGCODEPAGE`, so raw UTF-8 bytes were read in the reader's ANSI code page — `Baño`
 * opened as `BaÃ±o`. A character past the BMP (no 4-digit escape) becomes `?`.
 */
export function dxfUnicode(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out += ch;
    else if (cp > 0xffff) out += "?";
    else out += `\\U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return out;
}

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
  /** Every layer an entity has referenced, so the LAYER table can declare the conditional ones. */
  readonly used = new Set<string>();

  /** group-code / value pair. */
  pair(code: number, value: string | number): void {
    this.out.push(String(code), String(value));
  }

  /** Common entity prelude: type, layer (8), and optional linetype (6). */
  private begin(type: string, layer: string, ltype?: string): void {
    this.used.add(layer);
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

  /**
   * A TEXT entity placed the way the Scene placed it. Every Scene text is vertically centred
   * on `at` (`baseline: "central"`) and anchored at its start, middle or end, so the entity
   * carries that justification (72 horizontal, 73 = 2 middle) and `at` as its alignment
   * point (11/21). Without them a CAD program draws every label left-aligned on its
   * baseline from `at`: a centred room name lands half its width to the right, and a
   * right-aligned schedule column runs into the next one. `rotate` is the Scene's
   * clockwise-on-screen angle; DXF angles turn the other way (Y is flipped), hence the sign.
   */
  text(
    layer: string,
    at: Point,
    height: number,
    value: string,
    align: { anchor: "start" | "middle" | "end"; rotate?: number },
    ltype?: string,
  ): void {
    this.begin("TEXT", layer, ltype);
    this.pair(10, num(at.x));
    this.pair(20, num(-at.y));
    // A DXF text height is the height of a CAPITAL letter, an SVG/PDF font size the em; a
    // TEXT given the font size draws about 1.4x larger than the PDF and overruns the room
    // or column the layout fitted it to.
    this.pair(40, num(height * CAP_HEIGHT));
    // DXF is a line-oriented group-code stream, so ANY control character in the
    // value would desynchronize a reader (LF and CR both end a record) or drive a
    // terminal (ESC). `plainText` blanks every one of them — for a newline that is
    // exactly the space this line has always substituted, so output is unchanged.
    this.pair(1, dxfUnicode(plainText(value)));
    const angle = align.rotate ? ((-align.rotate % 360) + 360) % 360 : 0;
    if (angle) this.pair(50, num(angle));
    this.pair(72, align.anchor === "start" ? 0 : align.anchor === "middle" ? 1 : 2);
    this.pair(11, num(at.x));
    this.pair(21, num(-at.y));
    this.pair(73, 2);
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
    this.used.add(layer);
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
 * `A-FLOR-*` shaft sublayers, `A-ROOF`, and the ground layers). An entity
 * referencing an undeclared layer is only tolerated because most readers auto-create it.
 *
 * **`test/export-dxf.test.ts` pins the closure in both directions — but a closure test is
 * only as strong as the fixture it runs on.** A layer missing from this table stays
 * invisible to a closure test whose fixture never draws it, so the `allPasses` fixture
 * carries one of every element that sets a `layerName` — the only version of this gate
 * that can catch the next one.
 *
 * ## Discipline prefixes
 *
 * `A-` is architectural. The ground layers use
 * the other two standard NCS disciplines, and they earn them: `L-` is LANDSCAPE (planting
 * and hard landscape) and `C-` is CIVIL (the property line). A CAD user freezes by
 * discipline, so putting a lawn on an `A-` layer would hide it behind the wrong switch.
 *
 * ## Walls: exterior and interior
 *
 * Walls go on `A-WALL-EXTR` or `A-WALL-INTR` (see {@link wallLayerOf}), never on the pass
 * default `A-WALL`, so a CAD user can freeze the partitions and keep the envelope. Both
 * keep `A-WALL`'s colour 7: a plot style maps colour to pen weight, so the plotted drawing
 * is unchanged and the split is purely a switch. `A-WALL` itself is declared only on a
 * drawing that still uses it (a hand-built Scene that carries no `walls`). */
const AIA_LAYERS: { name: string; color: number }[] = [
  { name: "A-WALL-EXTR", color: 7 },
  { name: "A-WALL-INTR", color: 7 },
  { name: "A-FLOR", color: 8 },
  { name: "A-FLOR-STRS", color: 3 },
  { name: "A-FLOR-EVTR", color: 3 },
  // A floor VOID and a BALCONY slab — both floor-plate sublayers.
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
  // Landscape: planting green, hard landscape grey.
  { name: "L-PLNT", color: 3 },
  { name: "L-SITE", color: 8 },
  // Civil: the property line, in the magenta a lot line conventionally takes.
  { name: "C-PROP", color: 6 },
];

/**
 * The axonometric view's layers, declared **only on a drawing that uses them**.
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
const VIEW_LAYER_COLORS: Record<string, number> = { "V-3D-WALL": 7, "V-3D-FLOR": 8, "V-3D-GLAZ": 5 };

/** Dash definitions (drawing units = mm): name, descriptive text, and pattern.
 *  Positive = dash, negative = gap. Solid CONTINUOUS has an empty pattern. */
const LTYPES: { name: string; desc: string; pattern: number[] }[] = [
  { name: "CONTINUOUS", desc: "Solid line", pattern: [] },
  { name: "DASHED", desc: "Dashed", pattern: [200, -100] },
  { name: "CENTER", desc: "Center", pattern: [400, -100, 100, -100] },
  { name: "HIDDEN", desc: "Hidden", pattern: [100, -100] },
];

/** The pass-default wall layer, declared only when an entity still lands on it. */
const PLAIN_WALL_LAYER = { name: "A-WALL", color: 7 };

/** The two wall layers, in the order their entities are written — and in PRIORITY order:
 *  exterior first, so an equal-thickness junction of the same hatch (material, scale and
 *  angle) is the envelope's (see
 *  `classifyWallSet`), whatever the other wall's category is called. */
const WALL_CLASS_LAYERS = ["A-WALL-EXTR", "A-WALL-INTR"] as const;

/**
 * A wall's CAD layer: `A-WALL-EXTR` for a wall of category `exterior`, `A-WALL-INTR` for
 * every other wall.
 *
 * This is the rule the core already reads everywhere it asks "is this an outside wall": a
 * door on an `exterior` host opens to the outside (`src/analyze.ts`), a roof follows the
 * closed `exterior` ring (`src/elements/roof.ts`), `dims auto` chains the openings of
 * `exterior` walls (`src/facade.ts`), `suggest` proposes entrances on them
 * (`src/suggest.ts`). Re-deriving "exterior" from the geometry here would let the CAD
 * layers disagree with all four; a plan that names its envelope otherwise files every wall
 * on `A-WALL-INTR`, exactly as it gets no entrance and no roof ring.
 */
const wallLayerOf = (w: SceneWall): string => (w.category === "exterior" ? WALL_CLASS_LAYERS[0] : WALL_CLASS_LAYERS[1]);

/**
 * The remodel wall layers (preview-and-remodel B3b), the AIA status modifiers: `A-WALL-NEWW` for a
 * `status new` wall and `A-WALL-DEMO` for a `status demolish` one. Declared only when an entity
 * lands on one, so a plan that writes no status declares exactly the layers it always did.
 */
const NEW_WALL_LAYER = { name: "A-WALL-NEWW", color: 7 };
const DEMO_WALL_LAYER = { name: "A-WALL-DEMO", color: 8 };

/** A standing wall's layer: a `status new` wall on `A-WALL-NEWW`, every other one by
 *  {@link wallLayerOf} (an `existing` wall, or one with no status, where it always was). */
const standingLayerOf = (w: SceneWall): string => (w.status === "new" ? NEW_WALL_LAYER.name : wallLayerOf(w));

/** The LAYER rows this drawing declares: the static AIA set, plus `A-WALL`, the remodel wall
 *  layers and any `V-` view layer only when an entity actually references it (see
 *  {@link VIEW_LAYER_COLORS}). */
function layerRows(used: ReadonlySet<string>): { name: string; color: number }[] {
  const extra = VIEW_LAYER_NAMES.filter((n) => used.has(n)).map((name) => ({
    name,
    color: VIEW_LAYER_COLORS[name] ?? 7,
  }));
  const [extr, intr, ...rest] = AIA_LAYERS;
  const remodel = [NEW_WALL_LAYER, DEMO_WALL_LAYER].filter((l) => used.has(l.name));
  return [...(used.has(PLAIN_WALL_LAYER.name) ? [PLAIN_WALL_LAYER] : []), extr!, intr!, ...remodel, ...rest, ...extra];
}

function header(layers: readonly { name: string; color: number }[]): string {
  const h: string[] = [];
  const p = (c: number, v: string | number) => h.push(String(c), String(v));
  // Minimal HEADER declaring AutoCAD 2000 (AC1015) — the HATCH entity needs > R12.
  p(0, "SECTION");
  p(2, "HEADER");
  p(9, "$ACADVER");
  p(1, "AC1015");
  // Drawing units. Every coordinate is millimetres (`num-format`'s model unit), and a file
  // that does not say so is opened "unitless": inserted into a metre or inch drawing it
  // lands 1000x or 25.4x off. `$INSUNITS` 4 = millimetres; `$MEASUREMENT` 1 = metric (the
  // hatch and linetype defaults a CAD program picks). Both are R2000 (AC1015) header
  // variables, the version declared above, so no version bump.
  p(9, "$INSUNITS");
  p(70, 4);
  p(9, "$MEASUREMENT");
  p(70, 1);
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
  // STYLE table: `Standard` (the style every TEXT uses by default) on Arial. With no STYLE
  // table a CAD program falls back to its `txt` shape font, roughly a third wider than the
  // sans the SVG and PDF draw with, so text the layout fitted to a column or a room — a
  // schedule heading, a room name — overruns it. Arial is on every CAD seat and is within a
  // few percent of Roboto's advance widths, which `textWidth` already over-estimates.
  p(0, "TABLE");
  p(2, "STYLE");
  p(70, 1);
  p(0, "STYLE");
  p(2, "Standard");
  p(70, 0);
  p(40, 0);
  p(41, 1);
  p(50, 0);
  p(71, 0);
  p(42, 2.5);
  p(3, "arial.ttf");
  p(4, "");
  p(0, "ENDTAB");
  p(0, "ENDSEC");
  return h.join("\n") + "\n";
}

/** A `path` loop (or an open run) edge by edge, from its start: a LINE or a native ARC each. */
function pathLoop(b: DxfBuilder, layer: string, lp: PathLoop, lt: string | undefined): void {
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

/** Entities that stand in for one wall node, written where the node would have been. */
type Refiled = (b: DxfBuilder) => void;

/**
 * Which wall nodes are re-filed onto `A-WALL-EXTR`/`A-WALL-INTR`, and with what.
 *
 * The Scene's walls ({@link Scene.walls}) are split by {@link wallLayerOf} in ONE joinery
 * call ({@link classifyWallSet}), whose `outline` and per-material `region` are by
 * construction what `lowerWallSet` drew. A node is re-filed only when it EQUALS one of
 * those, primitive for primitive: then its entities are written from the split — the
 * hatch as one HATCH per class, the outline as each class's runs — which partitions the
 * node's own geometry and adds none. Any other node (a hand-built one, or a Scene with no
 * `walls`) is written as itself, on its own layer. Nothing is re-derived for the drawing.
 */
function wallRefiling(scene: Scene): Map<SceneNode, Refiled> {
  const out = new Map<SceneNode, Refiled>();
  if (!scene.walls || scene.walls.length === 0) return out;
  if (!scene.nodes.some((n) => n.layerName === undefined && (n.layer === "wallFill" || n.layer === "wallFace"))) {
    return out;
  }
  // A remodel's walls were lowered in two calls (`toScene`, B3b): the standing walls, then the
  // `status demolish` ones as one dashed outline. Each call is re-joined on its own, from its own
  // sublist in its own order, so each split reproduces the nodes that call drew.
  const standing = scene.walls.filter((w) => w.status !== "demolish");
  const demolished = scene.walls.filter((w) => w.status === "demolish");
  const classes = standing.some((w) => w.status === "new")
    ? [...WALL_CLASS_LAYERS, NEW_WALL_LAYER.name]
    : WALL_CLASS_LAYERS;
  // Each split claims only its own call's outline by line type as well as geometry: a standing
  // set and a demolished one can join to byte-equal outlines (two coincident walls), and only
  // the line type tells the solid node from the dashed one.
  refileSplit(scene, out, classifyWallSet(standing, standingLayerOf, classes), undefined);
  if (demolished.length > 0) {
    refileSplit(
      scene,
      out,
      classifyWallSet(demolished, () => DEMO_WALL_LAYER.name, [DEMO_WALL_LAYER.name]),
      "dashed",
    );
  }
  return out;
}

/** Re-file the wall nodes one {@link classifyWallSet} split reproduces (see {@link wallRefiling}). */
function refileSplit(
  scene: Scene,
  out: Map<SceneNode, Refiled>,
  split: ClassedWallSet | null,
  outlineLineType: LineType | undefined,
): void {
  if (!split) return;
  const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
  const outline = split.outline === null ? null : JSON.stringify(split.outline);
  for (const node of scene.nodes) {
    if (node.layerName !== undefined || out.has(node)) continue;
    const prim = node.prim;
    const lt = dxfLineType(node.lineType);
    if (node.layer === "wallFill" && prim.t === "hatch") {
      const fill = split.fills.find(
        (f) =>
          f.hatch.material === prim.material &&
          f.hatch.scale === prim.scale &&
          f.hatch.angle === prim.angle &&
          same(f.region, prim.region),
      );
      if (!fill) continue;
      const pattern = dxfPatternName(prim.material);
      const solid = isSolidFill(prim.material);
      out.set(node, (b) => {
        for (const c of fill.byClass) {
          if (c.region.length > 0) b.hatch(c.cls, c.region, pattern, solid, prim.scale, prim.angle);
        }
      });
    } else if (
      // A demolished set's dashed outline is drawn on the `wallFill` pass (`toScene`, B3b).
      (node.layer === "wallFace" || node.layer === "wallFill") &&
      prim.t !== "hatch" &&
      node.lineType === outlineLineType &&
      outline !== null &&
      JSON.stringify(prim) === outline
    ) {
      out.set(node, (b) => {
        for (const f of split.faces) for (const run of f.runs) pathLoop(b, f.cls, run, lt);
      });
    }
  }
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
      for (const lp of prim.loops) pathLoop(b, layer, lp, lt);
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
      // A TEXT entity is one line, so a wrapped name is one entity per line, at the
      // positions every backend reads from `textLines`.
      for (const line of textLines(prim)) b.text(layer, line.at, prim.size, line.value, prim, lt);
      break;
  }
}

/** Render a {@link Scene} as an ASCII DXF document string. */
export function toDxf(scene: Scene): string {
  const b = new DxfBuilder();
  const refiled = wallRefiling(scene);
  b.pair(0, "SECTION");
  b.pair(2, "ENTITIES");
  for (const node of scene.nodes) {
    const write = refiled.get(node);
    if (write) write(b);
    else emit(b, node);
  }
  b.pair(0, "ENDSEC");
  // The header is built after the entities so the LAYER table can declare exactly the
  // conditional layers they referenced.
  return header(layerRows(b.used)) + b.toString() + "0\nEOF\n";
}
