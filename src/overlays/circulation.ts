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

import { buildDoorAccessGraph, DEFAULT_TOL } from "../analyze.js";
import { computeCirculationOverlay } from "../analyze/circulation.js";
import type { Point } from "../ast.js";
import type { RDoor, RFurniture, ROpening, RRoom, ResolvedPlan } from "../ir.js";
import type { Paint, RenderSizes, SceneNode } from "../scene.js";
import type { Theme } from "../theme.js";

export function circulationOverlayNodes(ir: ResolvedPlan, theme: Theme, sizes: RenderSizes): SceneNode[] {
  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const doors = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const openings = ir.elements.filter((e): e is ROpening => e.kind === "opening");
  const furniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
  const access = buildDoorAccessGraph(rooms, doors, DEFAULT_TOL, undefined, openings);
  const overlay = computeCirculationOverlay(rooms, ir.walls, doors, openings, furniture, access, DEFAULT_TOL);
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
    // A small diamond marker (no circle primitive exists — scene.ts §Phase v0.7).
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
