/**
 * **Plan → faces.** The geometry half of the axonometric view: it turns a resolved plan
 * (or a stack of them, one per storey) into a flat list of closed 3D {@link Face}s, and
 * knows nothing about cameras, sorting, paint or the Scene.
 *
 * ## It computes no footprint of its own
 *
 * Every horizontal outline here comes from somewhere that already owns it:
 *
 *  - a wall solid is `joinWallSet(…).result.outline` — the very `EdgeLoop[]` the plan
 *    view lowers, taken *before* `emitLoops` narrows it to a `region`/`path`. Junction
 *    trimming, exact mitres and opening subtraction are therefore identical in the two
 *    drawings by construction, not by agreement;
 *  - an opening's hole is `openingCut`, the same rectangle-or-annular-sector the plan
 *    view subtracts, and the glazing band is that same function asked for a thinner
 *    wall — so the inset is right on a curved host without a second rule;
 *  - a floor is `roomRing`, which is the room's polygon when it has one (a circular room
 *    already carries its 48-gon) and its rectangle otherwise.
 *
 * The only thing this module invents is the third coordinate.
 *
 * ## Walls are grouped by height
 *
 * `joinWallSet` answers "what is the solid these walls make", and a solid has one height.
 * So the walls of one storey are partitioned by their resolved {@link RWall.height} and
 * each subset is joined on its own, with its own openings. A plan where every wall is the
 * same height — which is every plan that writes no `height` clause — has exactly one
 * subset and therefore one seamless solid, with its courtyards and its door and window
 * holes already cut. A plan that mixes heights gets one solid per height, and the visible
 * seam between them is a real edge in the building.
 *
 * ## Openings are filled back in, they are not re-cut
 *
 * The joined outline has a **full-height slot** where each opening is. The opening's own
 * vertical extent is then restored by putting the wall *back*: a window gets a solid block
 * from the floor to its sill and another from its head to the top of the wall, plus a thin
 * glazing band between; a door and a cased opening get the header block alone. Those blocks
 * are extruded exactly like walls, from the same cut loop, so their faces land on the wall's
 * own planes and the jamb reveals read correctly.
 *
 * The heights are the **real millimetres** the vertical datum resolved (`src/datum.ts`),
 * never a fraction of the wall.
 *
 * ## What is deliberately not here
 *
 * Furniture, dimensions, labels, schedules, legends, axes, title blocks, hatches, stairs,
 * roofs, outdoor ground, fences and the site boundary. Some of those are annotation, which
 * a pictorial view has no business carrying. `roof` is the interesting refusal: ArchLang
 * stores an eaves *outline*, not a pitch, so there is no datum from which to build a roof
 * surface — and inventing one is exactly the "approximate rather than refuse" move this
 * project rules out. It is left out by name.
 */

import type { Point } from "../ast.js";
import { roomBox, roomRing } from "../analyze.js";
import { PointInterner, openingCut, tessellateLoop } from "../geometry/band.js";
import type { EdgeLoop } from "../geometry/band.js";
import { pointInPolygon } from "../geometry/polygon.js";
import type { RRoom, RVoid, RWall, ResolvedPlan } from "../ir.js";
import { fmt2 } from "../num-format.js";
import { joinWallSet } from "../wall-lowering.js";
import type { Point3 } from "./camera.js";

/** What a face is made of, which decides its layer and its paint. */
export type FaceKind = "wall" | "floor" | "glaz";

/**
 * One closed, planar, opaque face.
 *
 * `loops[0]` is the boundary; any further loops are holes and wind the other way, so the
 * face is drawn as one `nonzero` region. A face is planar by construction — a side quad
 * lies in a vertical plane through one edge, a cap in a horizontal one — so no consumer
 * has to test for a twist.
 */
export interface Face {
  kind: FaceKind;
  loops: Point3[][];
  /**
   * May the painter drop this face when it turns away from the viewer?
   *
   * True for a **side quad** only. A cap and a floor are horizontal with their normal
   * up, both cameras look down on the building, and so both are always front-facing —
   * while a multi-loop cap's holes wind the opposite way from its boundary, which would
   * make a whole-face winding test answer about whichever loop it happened to read.
   * Never culling them settles both at once.
   */
  cullable: boolean;
  /** Painter's-order tie-break, most significant first — see `paint.ts`. */
  elementId: string;
  loopIndex: number;
  faceIndex: number;
}

/** A storey to extrude: its resolved plan and the elevation of its floor. */
export interface Storey {
  ir: ResolvedPlan;
  /** Index among the storeys, ascending — the first component of every element id. */
  index: number;
}

const lift = (p: Point, z: number): Point3 => ({ x: p.x, y: p.y, z });

/** Twice the signed area of a plan ring (shoelace); the sign is the winding. */
function ringArea2(pts: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}

/**
 * Side quads + a top cap for one set of plan loops extruded from `z0` to `z1`.
 *
 * The quad for edge `a → b` is walked `a₀ → b₀ → b₁ → a₁`, which puts its right-handed
 * normal at `(dy, −dx, 0)` — the OUTWARD normal, because every loop this module is given
 * obeys the joinery layer's orientation law (`geometry/band.ts`: material on `+perp` of
 * travel, with `perp(d) = (−d.y, d.x)`). That is what makes the culling test in `paint.ts`
 * a plain winding test rather than a per-caller sign table.
 *
 * The cap is ONE face carrying every loop, so a wall ring's inner boundary is a hole in
 * its own top rather than a second slab. There is no bottom cap: it is the underside of a
 * solid standing on the floor, and both cameras look down.
 */
function extrudeLoops(
  rings: readonly Point[][],
  z0: number,
  z1: number,
  kind: FaceKind,
  elementId: string,
  out: Face[],
): void {
  if (!(z1 > z0)) return;
  for (let li = 0; li < rings.length; li++) {
    const ring = rings[li]!;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      if (a.x === b.x && a.y === b.y) continue;
      out.push({
        kind,
        loops: [[lift(a, z0), lift(b, z0), lift(b, z1), lift(a, z1)]],
        cullable: true,
        elementId,
        loopIndex: li,
        faceIndex: i,
      });
    }
  }
  out.push({
    kind,
    loops: rings.map((r) => r.map((p) => lift(p, z1))),
    cullable: false,
    elementId,
    loopIndex: rings.length,
    faceIndex: 0,
  });
}

/** An `EdgeLoop` as a plain ring, through the compiler's ONE arc tessellator.
 *
 *  A second flattening rule under `src/view/` would be a second place for a curve to be
 *  wrong, so this is `tessellateLoop` — `arcTessellate`'s fixed 7.5° angular step with a
 *  floor of eight chords, a pure function of the stored sweep with no tolerance in it. */
const ringOf = (loop: EdgeLoop): Point[] => tessellateLoop(loop);

/**
 * Every wall of one storey, grouped by resolved height, plus the blocks that give each
 * opening its real vertical extent.
 */
function extrudeWalls(st: Storey, out: Face[]): void {
  const walls = st.ir.elements.filter((e): e is RWall => e.kind === "wall");
  if (walls.length === 0) return;
  const elev = st.ir.elevation;

  // First-appearance order over the heights present, so the face list — and therefore
  // every tie-break below — does not depend on how the numbers happen to sort.
  const heights: number[] = [];
  for (const w of walls) if (!heights.includes(w.height)) heights.push(w.height);

  for (const h of heights) {
    const subset = walls.filter((w) => w.height === h);
    const joined = joinWallSet(subset, []);
    if (!joined) continue;
    const id = `L${st.index}:walls@${fmt2(h)}`;
    extrudeLoops(joined.result.outline.map(ringOf), elev, elev + h, "wall", id, out);

    // Put the wall back above and below each hole. `cut.wall` indexes `subset`, so the
    // host's own height is what the head is measured against — the datum layer already
    // refused a head taller than its wall (`E_OPENING_ABOVE_WALL`), so this arithmetic
    // never produces an inverted block.
    for (let ci = 0; ci < joined.cuts.length; ci++) {
      const cut = joined.cuts[ci]!;
      const op = cut.opening;
      if (!op.kind) continue;
      const w = subset[cut.wall]!;
      const sill = op.sill ?? 0;
      const head = op.head ?? h;
      const ring = [ringOf(cut.loop)];
      const base = `L${st.index}:${w.id}#${ci}`;
      // Below the opening: a window's sill wall. A door and a cased opening start at the
      // floor, so `sill` is 0 and nothing is emitted.
      extrudeLoops(ring, elev, elev + sill, "wall", `${base}s`, out);
      // Above it: the header. Nothing when the opening runs the full height of its wall,
      // which is a cased opening's default.
      extrudeLoops(ring, elev + head, elev + h, "wall", `${base}h`, out);
      if (op.kind === "window") {
        // The glass. `openingCut` on a wall of 20% the thickness gives the same hole
        // inset to the wall's own centreline — right on a straight host and on a curved
        // one, where an inset is an annular sector between `r ± 0.1t` and not an offset
        // rectangle.
        const glaz = openingCut({ ...w, thickness: w.thickness * GLAZING_FRACTION }, op, new PointInterner());
        if (glaz) extrudeLoops([ringOf(glaz)], elev + sill, elev + head, "glaz", `${base}g`, out);
      }
    }
  }
}

/** How much of a wall's thickness the glazing band occupies, centred on its centreline. */
const GLAZING_FRACTION = 0.2;

/**
 * One floor plate per room, at the storey's elevation, with any `void` in it as a hole.
 *
 * A void is attributed to the room whose floor CONTAINS its centre, tested against the
 * room's ring rather than its bounding box — the v1.25 defect class, restated: a
 * bounding-box test would punch a hole in the wrong room on any L-shaped or courtyard
 * plan. A void in no room is skipped rather than floated: it is a hole in a floor plate
 * that is not being drawn.
 */
function extrudeFloors(st: Storey, out: Face[]): void {
  const rooms = st.ir.elements.filter((e): e is RRoom => e.kind === "room");
  const voids = st.ir.elements.filter((e): e is RVoid => e.kind === "void");
  const z = st.ir.elevation;
  for (const r of rooms) {
    const ring = roomRing(roomBox(r));
    if (ring.length < 3) continue;
    const sign = Math.sign(ringArea2(ring));
    const loops: Point3[][] = [ring.map((p) => lift(p, z))];
    for (const v of voids) {
      const c = { x: v.at.x + v.size.w / 2, y: v.at.y + v.size.h / 2 };
      if (!pointInPolygon(c.x, c.y, ring)) continue;
      const rect: Point[] = [
        { x: v.at.x, y: v.at.y },
        { x: v.at.x + v.size.w, y: v.at.y },
        { x: v.at.x + v.size.w, y: v.at.y + v.size.h },
        { x: v.at.x, y: v.at.y + v.size.h },
      ];
      // A hole must wind against its boundary for the `nonzero` rule to cut it.
      if (Math.sign(ringArea2(rect)) === sign) rect.reverse();
      loops.push(rect.map((p) => lift(p, z)));
    }
    out.push({
      kind: "floor",
      loops,
      cullable: false,
      elementId: `L${st.index}:${r.id}`,
      loopIndex: 0,
      faceIndex: 0,
    });
  }
}

/**
 * Every face of a whole building, in a deterministic order that nothing downstream relies
 * on for correctness — `paint.ts` imposes a total order of its own — but which is stable
 * so a face list is comparable between runs.
 */
export function facesOf(storeys: readonly Storey[]): Face[] {
  const out: Face[] = [];
  for (const st of storeys) {
    extrudeFloors(st, out);
    extrudeWalls(st, out);
  }
  return out;
}
