/**
 * How each NON-HINGED door kind is drawn in its reveal.
 *
 * A door kind changes two things and only two: whether a swing arc exists (that is
 * `doorSwing`'s two-line early return in `src/geometry.ts`) and what is drawn between
 * the jambs — this file. The opening cover polygon, the wall boolean, `describe()`
 * adjacency and the walk-through landing are all kind-INDEPENDENT and live elsewhere;
 * nothing here may grow an opinion about them.
 *
 * **The primitive budget is a hard constraint, and it is met.** Every kind below emits
 * only `polygon`, `line` and `circle`, which all four backends (SVG, DXF, PDF, ASCII)
 * already serialize generically from {@link import("../scene.js").ScenePrim} — so this
 * feature adds **no per-backend code and no new primitive**. In particular a `bifold`
 * is drawn as two thin rectangles plus a small circle at the fold, NOT as the round-
 * capped 3-point polyline the reference (arch-plotter `Arch.typ:329-341`) uses: that
 * would need a `polyline` primitive plus a wider `Paint.linecap`/`linejoin`, and the
 * trick does not survive the trip anyway — DXF has no stroke caps, so the hinge glyph
 * would vanish in the CAD export while looking right in SVG.
 *
 * **Every offset is a fraction of the wall thickness `t`, never an absolute.** The
 * conventions are borrowed from arch-plotter, whose constants are hardcoded FEET
 * (`f = 0.05` at `Arch.typ:265`) and irrational in millimetres, and cross-checked
 * against planscript-rust's pocket geometry, whose offsets are divided by a render
 * scale and so are screen-space. Neither transcribes into a plan-millimetre drawing
 * that has to survive `paper`/`scale`; both were re-derived here against `t`.
 *
 * Handedness: `slide` is measured along the host wall's TRAVERSAL direction, exactly
 * as `hinge` is, so a mirrored `place` carries it correctly with no flip (`frame.ts`
 * transforms the segment, and the direction rides along). `swing` — which face a
 * `barn` panel hangs on, a `bifold` folds toward, or a `garage` panel projects INTO —
 * is measured off the wall normal and DOES flip under a reflection, which
 * `transformElement` already does. A `sliding` door's track choice is neither: it is
 * `slide` times the normal, so it reads `RDoor._mirror` (see that case).
 *
 * ## The drawing language — the same as a hinged door's
 *
 * - **A panel is a leaf**: a slab (a thin closed rectangle) filled with the page colour and
 *   stroked at the leaf pen, `thin × 1.3` — the pen `door.render` draws a hinged leaf with.
 * - **A visible guide is solid and fine**: a bypass door's floor tracks take the extra-thin
 *   pen a hinged door's swing does. A jamb tick is `thin`.
 * - **DASHED MEANS ABOVE THE CUT PLANE, OR HIDDEN** — the convention the rest of the drawing
 *   follows (`upper_cabinet`, `roof`, `void`). Here that is a `garage` panel's overhead
 *   projection, a `barn` door's top-hung track and a `bifold`'s head track (both above the
 *   cut), and a `pocket`'s cavity (inside the wall). A dash is never decoration: a hinged
 *   door's swing at floor level is drawn solid for the same reason.
 *
 * Every dashed node draws with {@link dashedPattern} and sets `lineType: "dashed"` AND the
 * matching `paint.dash`, because the SVG serializer follows the name, the PDF serializer the
 * number and the DXF one the line type — a raw dash with no name read as a solid line in CAD.
 */

import type { Point } from "../ast.js";
import type { SceneNode } from "../scene.js";
import type { Theme } from "../theme.js";
import type { RenderSizes } from "../scene.js";
import type { RDoor } from "../ir.js";
import { add, mul, normal, sub } from "../geometry.js";
import { weightWidth } from "../scene.js";
import { dashedPattern } from "./glyph-lib.js";

/** What {@link renderDoorPanels} needs from the render context and the host geometry. */
export interface PanelCtx {
  theme: Theme;
  sizes: RenderSizes;
  /** Unit direction along the host wall at the doorway (its tangent on a curve). */
  dir: Point;
  /** Host wall thickness, mm — every offset below is a fraction of it. */
  thickness: number;
}

/**
 * How deep a `garage` door's overhead projection is drawn, as a fraction of the opening
 * width, and the millimetre ceiling that fraction is clamped to.
 *
 * A sectional panel really does park across roughly half its own height, so the fraction is
 * the honest shape of the thing. The ceiling is a DRAWING decision and is stated as one:
 * the projection exists to say "the door goes up here", and past about a metre it stops
 * adding information and starts covering the cars. A 5000 mm double door clamps to 1200
 * instead of reaching 2500.
 */
const PANEL_PROJECTION_DEPTH = 0.5;
const PANEL_PROJECTION_MAX_MM = 1200;

/** An oriented rectangle as a closed polygon: centre, unit long axis, half-extents. */
function orientedRect(c: Point, along: Point, halfLen: number, halfThick: number): Point[] {
  const across = normal(along);
  const a = mul(along, halfLen);
  const b = mul(across, halfThick);
  return [add(sub(c, a), mul(b, -1)), add(add(c, a), mul(b, -1)), add(add(c, a), b), add(sub(c, a), b)];
}

/**
 * Draw the panel(s), track(s) and cavity of one non-hinged door.
 *
 * Returns the nodes that go AFTER the opening cover polygon (which `door.render`
 * always emits first, for every kind — the ASCII and DXF backends locate the doorway
 * by it, so dropping it for any kind would break `-f txt` and the CAD export with no
 * diagnostic). Returns `[]` for a hinged door: that path stays exactly where it was.
 */
export function renderDoorPanels(dr: RDoor, ctx: PanelCtx): SceneNode[] {
  const kind = dr.doorKind;
  if (kind === undefined) return [];
  const { theme, sizes, dir: d, thickness: t } = ctx;
  const n = normal(d);
  const w = dr.width;
  const hw = w / 2;
  const open = dr.open ?? 0.5;
  // Which way the panel travels to open: `slide left` parks it toward the wall's
  // start, `slide right` toward its end — the same convention `hinge left|right` uses,
  // which is why neither needs a flip under a mirrored `place`.
  const sd = dr.slide === "right" ? 1 : -1;
  // Which face a hung/folded panel sits on. `swing in` is the wall's +normal side,
  // matching `doorSwing`'s own leaf direction, so the two words never disagree.
  const face = dr.swing === "in" ? n : mul(n, -1);

  // A panel is a leaf, so it takes the hinged leaf's pen (`door.render`'s slab).
  const leaf = (pts: Point[]): SceneNode => ({
    layer: "doors",
    prim: { t: "polygon", pts },
    paint: { fill: theme.opening, stroke: theme.doorLeaf, width: sizes.thin * 1.3 },
  });
  // A visible edge that is not a leaf: a jamb tick.
  const rule = (a: Point, b: Point): SceneNode => ({
    layer: "doors",
    prim: { t: "line", a, b },
    paint: { stroke: theme.doorLeaf, width: sizes.thin },
  });
  // A guide at floor level (a bypass door's tracks): visible, so solid, and the finest pen
  // — the same weight as a hinged door's swing.
  const guide = (a: Point, b: Point): SceneNode => ({
    layer: "doors",
    prim: { t: "line", a, b },
    paint: { stroke: theme.doorLeaf, width: weightWidth("extraThin", sizes) },
    lineWeight: "extraThin",
  });
  // Above the cut plane or hidden inside the wall: dashed, NAMED, and handed the matching
  // pattern — SVG follows the name, PDF the number, DXF the line type.
  const unseen = (a: Point, b: Point): SceneNode => ({
    layer: "doors",
    prim: { t: "line", a, b },
    paint: { stroke: theme.doorLeaf, width: sizes.thin, dash: dashedPattern(sizes) },
    lineType: "dashed",
  });

  switch (kind) {
    // Two bypass panels on two tracks. Each is a little longer than half the opening
    // so they overlap when closed; the moving one is the panel on the far side from
    // the slide direction, and it travels toward (and finally behind) the fixed one.
    case "sliding": {
      const pl = hw + 0.05 * w; // panel length — the 0.1w overlap when closed
      const pt = 0.2 * t; // panel thickness
      const off = pt / 2 + 0.05 * t; // each track's offset from the centreline (0.1t clear between)
      const travel = w - pl;
      // Which track the fixed panel runs on: `slide` times the LEFT normal `n`, a handed
      // product. A reflection reverses `n` against the carried traversal but not `slide`, so
      // a mirrored door (`_mirror`) takes the other track, which is its mirror image.
      const track = dr._mirror ? -sd : sd;
      const fixedC = add(add(dr.at, mul(d, sd * (hw - pl / 2))), mul(n, off * track));
      const movingRest = add(add(dr.at, mul(d, -sd * (hw - pl / 2))), mul(n, -off * track));
      const movingC = add(movingRest, mul(d, sd * travel * open));
      return [
        guide(add(add(dr.at, mul(d, -hw)), mul(n, off)), add(add(dr.at, mul(d, hw)), mul(n, off))),
        guide(add(add(dr.at, mul(d, -hw)), mul(n, -off)), add(add(dr.at, mul(d, hw)), mul(n, -off))),
        leaf(orientedRect(fixedC, d, pl / 2, pt / 2)),
        leaf(orientedRect(movingC, d, pl / 2, pt / 2)),
      ];
    }
    // A surface-slider: the leaf hangs OUTSIDE the wall on the `swing` face from a track
    // that overshoots the far jamb by a full door width (the room it needs to park).
    //
    // The track is top-hung, above the cut plane: dashed, and drawn on the panel's own axis
    // (the panel hangs from it), BEFORE the panel, whose fill masks the stretch the panel
    // hangs on. What shows is the track either side of the panel — the run it travels.
    // Nothing bridges the reveal: the wall is severed here exactly as at every other
    // doorway, and a dashed head line across it (this kind once drew one at each face)
    // re-closed the gap — the reason a cased `opening` dropped its own.
    case "barn": {
      const pt = 0.35 * t;
      const off = t / 2 + 0.1 * t + pt / 2;
      const panelC = add(add(dr.at, mul(face, off)), mul(d, sd * w * open));
      return [
        unseen(
          add(add(dr.at, mul(d, -sd * hw)), mul(face, off)),
          add(add(dr.at, mul(d, sd * (hw + w))), mul(face, off)),
        ),
        leaf(orientedRect(panelC, d, (1.1 * w) / 2, pt / 2)),
      ];
    }
    // Two folding leaves pivoting off the jamb on the slide side. Exact kinematics:
    // panel 1 turns `open × 90°` off the wall about the fixed pivot A, the fold point
    // F is one panel length along it, and panel 2 returns from F to the point G on the
    // wall line at `2L·cos θ` — so `open 0` lies flat across the opening and `open 1`
    // stacks both panels on the pivot.
    case "bifold": {
      const pt = 0.2 * t;
      const theta = (open * Math.PI) / 2;
      const L = hw; // each of the two leaves is half the opening
      const a = add(dr.at, mul(d, sd * hw)); // the fixed pivot
      const along = mul(d, -sd); // toward the other jamb
      const f = add(a, add(mul(along, L * Math.cos(theta)), mul(face, L * Math.sin(theta))));
      const g = add(a, mul(along, 2 * L * Math.cos(theta)));
      const mid = (p: Point, q: Point): Point => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
      const unit = (p: Point, q: Point): Point => {
        const v = sub(q, p);
        const len = Math.hypot(v.x, v.y) || 1;
        return { x: v.x / len, y: v.y / len };
      };
      return [
        // The head track the leaves hang from, across the opening: above the cut.
        unseen(add(dr.at, mul(d, -hw)), add(dr.at, mul(d, hw))),
        leaf(orientedRect(mid(a, f), unit(a, f), L / 2, pt / 2)),
        leaf(orientedRect(mid(f, g), unit(f, g), L / 2, pt / 2)),
        {
          layer: "doors",
          prim: { t: "circle", center: f, r: 0.25 * t },
          paint: { fill: theme.opening, stroke: theme.doorLeaf, width: sizes.thin },
        },
      ];
    }
    // A pocket: the panel is IN the wall, and the cavity it disappears into is drawn
    // as two hidden (dashed) lines running one full door width past the slide-side jamb. The
    // wall has to be long enough to hold it — that is `W_POCKET_RUN`, which measures
    // exactly this run and is the only soundness fact this feature ships.
    case "pocket": {
      const pt = 0.25 * t;
      const inset = 0.05 * t;
      const jamb = add(dr.at, mul(d, sd * hw));
      const far = add(jamb, mul(d, sd * w));
      const panelC = add(dr.at, mul(d, sd * w * open));
      return [
        unseen(add(jamb, mul(n, pt / 2)), add(far, mul(n, pt / 2))),
        unseen(add(jamb, mul(n, -pt / 2)), add(far, mul(n, -pt / 2))),
        leaf(orientedRect(panelC, d, hw - inset, pt / 2)),
      ];
    }
    // A sectional/roller door. Two statements, and they are different in kind: the panel
    // is IN the reveal (a thin closed leaf across the wall centreline, ticked at each
    // jamb — it fills the opening, it does not slide within it), and where it goes when
    // it opens is UP, which a plan can only say with the dashed overhead projection.
    //
    // The projection reaches `PANEL_PROJECTION_MAX_MM` at most, because it is drawn to be
    // read and not measured: a 5-metre double door would otherwise throw a 2.5-metre dashed
    // band across the middle of the garage and bury the cars parked under it.
    case "garage": {
      const pt = 0.25 * t;
      const depth = Math.min(w * PANEL_PROJECTION_DEPTH, PANEL_PROJECTION_MAX_MM);
      const near = t / 2;
      const projC = add(dr.at, mul(face, near + depth / 2));
      const nodes: SceneNode[] = [
        leaf(orientedRect(dr.at, d, hw, pt / 2)),
        rule(add(add(dr.at, mul(d, -hw)), mul(n, -pt)), add(add(dr.at, mul(d, -hw)), mul(n, pt))),
        rule(add(add(dr.at, mul(d, hw)), mul(n, -pt)), add(add(dr.at, mul(d, hw)), mul(n, pt))),
      ];
      nodes.push({
        layer: "doors",
        prim: { t: "polygon", pts: orientedRect(projC, d, hw, depth / 2) },
        paint: { fill: "none", stroke: theme.doorLeaf, width: sizes.thin, dash: dashedPattern(sizes) },
        lineType: "dashed",
      });
      return nodes;
    }
    // `hinged` never reaches here (the caller returns early), but the switch stays
    // exhaustive so a kind added to the table without a rendering fails to compile.
    case "hinged":
      return [];
  }
}
