/**
 * The opt-in circulation render overlay (ADR 0008): draws, on the `annotations`
 * layer, the entrance→room walk for each reachable room, a marker + clear-width label
 * at each room's bottleneck pinch, and the key functional routes in a muted style.
 *
 * Purely additive and off by default — `toScene` appends these nodes only when
 * `compile(src, { overlays: ["circulation"] })` is set, AFTER all existing nodes and
 * after page-chrome layout, so the default Scene/SVG stay byte-identical (ADR 0007
 * discipline). It reuses existing Scene primitives (line/polygon/text) and existing
 * theme colours (`annotation` / `annotationMuted`) — no new prim kinds or Theme keys —
 * so every backend serializes it with no changes.
 */

import { buildDoorAccessGraph, DEFAULT_TOL, openRunsOf, outdoorsOf, roomBox } from "../analyze.js";
import { arrivalAccess, entranceInputs } from "../analyze/entrance.js";
import { computeCirculationOverlay } from "../analyze/circulation-overlay.js";
import { walkedFromShafts } from "../analyze/circulation.js";
import { type ArrivingRun, verticalsOf } from "../vertical.js";
import type { Point } from "../ast.js";
import type { RDoor, RFurniture, ROpening, RRoom, RVoid, ResolvedPlan } from "../ir.js";
import type { Paint, RenderSizes, SceneNode } from "../scene.js";
import type { Theme } from "../theme.js";
import { voidPieces } from "../elements/void.js";

export function circulationOverlayNodes(
  ir: ResolvedPlan,
  theme: Theme,
  sizes: RenderSizes,
  /** The runs this storey is reached by (`arrivalRuns`, `src/vertical.ts`): non-empty only on a
   *  storey a shaft reaches and no door from the ground does. Append-only. */
  arrivals: readonly ArrivingRun[] = [],
): SceneNode[] {
  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const doors = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const openings = ir.elements.filter((e): e is ROpening => e.kind === "opening");
  const furniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
  // The storey's floor voids, exactly as `describe()` and lint pass them: the drawn walks
  // and pinches must come from the grid the reported numbers were measured on.
  const voids = ir.elements.filter((e): e is RVoid => e.kind === "void").flatMap(voidPieces);
  // The runs a `status demolish` wall leaves open (B3a): `ir` is the plan after the demolition,
  // so the walk crosses them as describe()'s does. Empty without one, so the graph is unchanged.
  // Walked from the doors a person arrives by (U.1: a balcony door is none for a room a door from
  // the ground reaches), as `describe().circulation` is on a storey with a door from the ground;
  // the graph itself on every other plan. On a storey a shaft reaches and no door from the ground
  // does, it is walked from the runs that arrive, exactly as `describe().circulation` is: its
  // balcony doors are no entrance (`walkedFromShafts`, PS0.3), so `garden-house`'s upper floor
  // is drawn from its stair, and a storey with no exterior door at all is drawn rather than empty.
  // A door onto water joins nothing (`outdoorsOf`, backlog 4.5), as in every other access graph.
  const access = walkedFromShafts(
    arrivalAccess(
      buildDoorAccessGraph(rooms, doors, DEFAULT_TOL, undefined, openings, openRunsOf(ir, DEFAULT_TOL), outdoorsOf(ir)),
      entranceInputs(ir, new Map(rooms.map((r) => [r.id, roomBox(r)]))),
    ),
    arrivals,
    rooms,
    ir,
  );
  const overlay = computeCirculationOverlay(
    rooms,
    ir.walls,
    doors,
    openings,
    furniture,
    access,
    DEFAULT_TOL,
    undefined,
    verticalsOf(ir),
    voids,
    arrivals,
  );
  if (!overlay) return [];

  const nodes: SceneNode[] = [];
  const w = sizes.thin;
  const pathPaint: Paint = { stroke: theme.annotation, width: w, dash: [w * 8, w * 5], linecap: "square" };
  const routePaint: Paint = { stroke: theme.annotationMuted, width: w, dash: [w * 3, w * 3], linecap: "square" };

  const polyline = (path: Point[], paint: Paint): void => {
    for (let i = 0; i + 1 < path.length; i++) {
      nodes.push({ layer: "annotations", prim: { t: "line", a: path[i]!, b: path[i + 1]! }, paint });
    }
  };

  for (const r of overlay.rooms) {
    polyline(r.path, pathPaint);
    if (!r.pinch) continue;
    const rad = sizes.dimFont * 0.55;
    const { x, y } = r.pinch.at;
    // A small diamond marker.
    nodes.push({
      layer: "annotations",
      prim: {
        t: "polygon",
        pts: [
          { x, y: y - rad },
          { x: x + rad, y },
          { x, y: y + rad },
          { x: x - rad, y },
        ],
      },
      paint: { fill: theme.annotation, stroke: "none" },
    });
    nodes.push({
      layer: "annotations",
      prim: {
        t: "text",
        at: { x, y: y - rad - sizes.dimFont * 0.7 },
        value: String(r.pinch.clearMm),
        size: sizes.dimFont,
        anchor: "middle",
        baseline: "central",
      },
      paint: { fill: theme.annotation },
    });
  }
  for (const rt of overlay.routes) polyline(rt.path, routePaint);

  return nodes;
}
