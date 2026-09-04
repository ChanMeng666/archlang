/**
 * **Faces → Scene nodes.** The painter: it culls what faces away, orders what is left
 * from far to near, projects it through the camera, and paints it.
 *
 * ## The order is TOTAL, and quantised to what the file will say
 *
 * The reference implementation sorts by depth with **no tie-break** (`Arch.typ:2296`),
 * which is not byte-stable: two faces at equal depth swap on whatever order the engine's
 * sort happens to produce, and two faces a floating-point hair apart swap on a difference
 * no reader could ever see. Both are the kind of instability this repository's whole
 * verification system is built to exclude.
 *
 * So the key here is a tuple, and its first component is the depth **rounded through
 * `fmt2`** — the very formatter the SVG coordinates are printed at. Two faces whose depths
 * serialise identically are therefore *equal* to the sort, not merely close, and can never
 * be separated by a 1e-15 difference that no output byte records. The remaining three
 * components — element id, loop index, face index — are unique per face by construction,
 * so the order is total and reversing the input list changes no byte.
 *
 * ## Opaque faces are the hidden-line algorithm
 *
 * There is no depth buffer and no visibility computation. Every face is filled with the
 * page's own paper colour and stroked, and drawn in order, so a nearer face simply covers
 * what is behind it. That is the classic painter's algorithm and it is why the fill may
 * never be `none`.
 *
 * ## Every node lands on ONE render pass
 *
 * Backends bucket nodes by {@link RenderPass} and emit the buckets in `RENDER_PASSES`
 * order (`src/backends/svg.ts`, `src/export/pdf.ts`), preserving collection order *within*
 * a bucket. A painter's order spread across two passes would therefore be re-sorted by
 * pass and destroyed. Everything here goes on `floor`, the first pass, and carries its CAD
 * identity in {@link SceneNode.layerName} instead.
 *
 * ## The `V-` layers
 *
 * `V-3D-WALL`, `V-3D-FLOR`, `V-3D-GLAZ` — deliberately **outside** the `A-`/`L-`/`C-`
 * NCS discipline namespace the plan view uses. A CAD user freezes by discipline, and an
 * illustrative view is not a discipline's drawing: putting an extruded wall on `A-WALL`
 * would make a 3D face appear and disappear with the architectural plan it is not part
 * of. `V-` is a VIEW namespace, and the DXF export declares its rows only on a drawing
 * that actually uses them (`src/export/dxf.ts`), so a plan-view DXF is byte-identical.
 */

import type { Theme } from "../theme.js";
import type { RenderSizes, SceneNode } from "../scene.js";
import { weightWidth } from "../scene.js";
import { fmt2 } from "../num-format.js";
import type { Camera, Projected } from "./camera.js";
import { projectedArea2 } from "./camera.js";
import type { Face, FaceKind } from "./extrude.js";

/** The CAD layer each kind of face lands on. Exported so the DXF table is derived, not retyped. */
export const VIEW_LAYERS: Record<FaceKind, string> = {
  wall: "V-3D-WALL",
  floor: "V-3D-FLOR",
  glaz: "V-3D-GLAZ",
};

/** Every `V-` layer the view can emit, in a stable order — the DXF table's source. */
export const VIEW_LAYER_NAMES: readonly string[] = ["V-3D-WALL", "V-3D-FLOR", "V-3D-GLAZ"];

/** A face, projected once: its screen loops and the depth its sort key rounds. Exported
 *  so `test/iso-sort.test.ts` can assert the ORDER, which is the property, rather than the
 *  bytes that happen to fall out of it. */
export interface Drawn {
  face: Face;
  loops: Projected[][];
  depth: number;
}

/** The centroid of a face's boundary vertices — the point its depth is taken at. */
function boundaryDepth(face: Face, cam: Camera): number {
  const ring = face.loops[0]!;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const p of ring) {
    sx += p.x;
    sy += p.y;
    sz += p.z;
  }
  const n = ring.length;
  return cam.depth(sx / n, sy / n, sz / n);
}

/**
 * Cull, project and order.
 *
 * Culling is a plain winding test, and it is correct because of two facts stated
 * elsewhere and proved by test rather than assumed: `extrude.ts` walks every side quad so
 * that its right-handed normal is the OUTWARD one, and {@link Camera.frontSign} records
 * the sign a front-facing loop's projected area carries. A face marked `cullable: false`
 * — a cap, a floor — is kept whatever its winding, because it is horizontal and both
 * cameras look down on it.
 */
export function orderFaces(faces: readonly Face[], cam: Camera): Drawn[] {
  const drawn: Drawn[] = [];
  for (const face of faces) {
    const loops = face.loops.map((l) => l.map((p) => cam.project(p.x, p.y, p.z)));
    if (face.cullable) {
      const a = projectedArea2(loops[0]!);
      if (a === 0 || Math.sign(a) !== cam.frontSign) continue;
    }
    drawn.push({ face, loops, depth: Number(fmt2(boundaryDepth(face, cam))) });
  }
  drawn.sort((p, q) => {
    // Far first: descending depth.
    if (p.depth !== q.depth) return q.depth - p.depth;
    if (p.face.elementId !== q.face.elementId) return p.face.elementId < q.face.elementId ? -1 : 1;
    if (p.face.loopIndex !== q.face.loopIndex) return p.face.loopIndex - q.face.loopIndex;
    return p.face.faceIndex - q.face.faceIndex;
  });
  return drawn;
}

/**
 * Paint for one kind of face.
 *
 * Both the named weight and the raw width are set on every node, because the two
 * serializers read different ones — SVG follows `lineWeight`, PDF follows `paint.width`
 * — and a node carrying only one makes the exports disagree about how thick a line is
 * (`src/scene.ts`, `weightWidth`).
 */
function paintFor(kind: FaceKind, theme: Theme, sizes: RenderSizes): Pick<SceneNode, "paint" | "lineWeight"> {
  if (kind === "glaz") {
    return {
      lineWeight: "thin",
      paint: { fill: theme.bg, stroke: theme.windowPane, width: weightWidth("thin", sizes), fillRule: "nonzero" },
    };
  }
  if (kind === "floor") {
    return {
      lineWeight: "thin",
      paint: { fill: theme.roomFill, stroke: theme.wallStroke, width: weightWidth("thin", sizes), fillRule: "nonzero" },
    };
  }
  return {
    lineWeight: "medium",
    paint: {
      fill: theme.bg,
      stroke: theme.wallStroke,
      width: weightWidth("medium", sizes),
      linejoin: "miter",
      fillRule: "nonzero",
    },
  };
}

/** The ordered faces as Scene nodes, far to near, all on the `floor` pass. */
export function paintFaces(drawn: readonly Drawn[], theme: Theme, sizes: RenderSizes): SceneNode[] {
  return drawn.map((d) => ({
    layer: "floor" as const,
    // `region` rather than `polygon` for every face, single-loop ones included: it is the
    // one primitive that carries holes, and using it uniformly means a cap with a
    // courtyard in it and a plain side quad take the same path through all four backends.
    prim: { t: "region" as const, loops: d.loops.map((l) => l.map((p) => ({ x: p.x, y: p.y }))) },
    layerName: VIEW_LAYERS[d.face.kind],
    ...paintFor(d.face.kind, theme, sizes),
  }));
}
