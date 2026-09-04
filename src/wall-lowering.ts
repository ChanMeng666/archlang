/**
 * **The one wall-lowering path** — a set of resolved walls to the Scene nodes that draw
 * them: one poché fill per material group, and ONE outline for the whole set.
 *
 * Until v1.30 there were three paths, chosen by shape: an axis-aligned rectangle union
 * for orthogonal walls, a `clipper2-wasm` polygon boolean for angled ones (only when
 * that OPTIONAL dependency happened to be installed), and — for anything curved — the
 * wall element's own per-segment rectangles with untrimmed face lines. Three paths meant
 * three sets of corner cases, an optional dependency that could move a drawing's bytes,
 * and a curved or angled plan whose junctions were drawn wrong by construction (a face
 * line straight through the neighbouring wall's solid).
 *
 * This is one path, for every wall: `geometry/band.ts` turns each wall into exact mitred
 * edge loops, `geometry/joinery.ts` intersects them and keeps only the edges with solid
 * on exactly one side. It is closed form and zero-dependency, so a curved plan renders
 * identically with and without clipper2, and exact on rectilinear input (checked against
 * the old rectangle union as an oracle in `test/joinery-oracle.test.ts`).
 *
 * ## Why this is not in `scene-build.ts`
 *
 * `elements/wall.ts` delegates its `render` here so a plugin holding the registry's wall
 * def gets the joined drawing rather than the retired per-segment one. `scene-build.ts`
 * imports the registry, which imports `elements/defs.ts`, which imports `elements/wall.ts`
 * — so this has to be a module both can import, not a function on either side of that
 * cycle.
 *
 * ## Node order
 *
 * Fills first, in `hatchesUsed` order (the same order the legend draws its rows), then
 * the single outline. For the one-material plan that is every shipped example bar
 * `materials.arch`, that is exactly the order — and the node shapes — the old
 * `emitRegion` produced.
 */

import type { Opening, RWall } from "./ir.js";
import type { RenderCtx } from "./registry.js";
import type { SceneNode } from "./scene.js";
import { MITER_LIMIT } from "./scene.js";
import type { HatchSpec } from "./hatches.js";
import { hatchKey, hatchOf, patternId } from "./hatches.js";
import { PointInterner, loopBBox, openingCut, wallBand } from "./geometry/band.js";
import type { EdgeLoop } from "./geometry/band.js";
import type { JoineryCut, JoineryResult, JoineryWall } from "./geometry/joinery.js";
import { bandBBox, emitLoops, joinWalls, loopsToPolygons } from "./geometry/joinery.js";

/** One opening's cut volume, joined back to the wall it was cut from. */
export interface JoinedCut {
  /** Index into the `walls` array {@link joinWallSet} was given. */
  wall: number;
  /** The resolved opening, so a consumer can read its `kind`/`sill`/`head`. */
  opening: Opening;
  /** The plan footprint the opening removes — `openingCut`'s loop. */
  loop: EdgeLoop;
}

/** What {@link joinWallSet} produces: the joinery result, plus the cuts that made it. */
export interface JoinedWallSet {
  result: JoineryResult;
  /** Every opening's cut, in the order they were cut (the `JoineryCut.index` order). */
  cuts: JoinedCut[];
}

/**
 * **Wall set → joined geometry.** `wallBand` → `openingCut` → `joinWalls`, and nothing
 * else: no theme, no paint, no Scene.
 *
 * Split out of {@link lowerWallSet} in v1.35 so the axonometric view (`src/view/`) can
 * consume {@link JoineryResult.outline} — the exact `EdgeLoop[]` the plan view lowers —
 * *before* `emitLoops` narrows it to a `region`/`path`. A 3D extrusion needs the edges,
 * not the primitive: it lifts each one to a side quad and caps the whole loop set at the
 * wall's height, so the third dimension computes no new footprint. Re-deriving the
 * footprint in the view would be a second joinery, and two of those is exactly how a
 * drawing and its own extrusion come to disagree.
 *
 * `groupKeys` fixes which fills are produced and in what order; pass `[]` when only the
 * outline is wanted. Returns `null` for a set with no bandable wall, which is what
 * `lowerWallSet` has always treated as "draw nothing".
 *
 * Pure and deterministic: one {@link PointInterner} for the whole call (see `joinWalls`
 * for why that matters), no clock, no randomness, no Map-order dependence.
 */
export function joinWallSet(walls: readonly RWall[], groupKeys: readonly string[]): JoinedWallSet | null {
  if (walls.length === 0) return null;
  const intern = new PointInterner();
  const jwalls: JoineryWall[] = [];
  const cuts: JoineryCut[] = [];
  const joined: JoinedCut[] = [];
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i]!;
    const loops = wallBand(w, intern);
    if (loops.length > 0) {
      jwalls.push({
        index: i,
        id: w.id,
        thickness: w.thickness,
        group: hatchKey(hatchOf(w)),
        loops,
        bbox: bandBBox(loops),
      });
    }
    // Doors/windows/openings void the wall solid (IFC-style opening subtraction). The
    // cut's index only has to be stable, and the wall list is in source order, so a
    // running counter is canonical.
    for (const op of w.openings) {
      const loop = openingCut(w, op, intern);
      if (loop) {
        cuts.push({ index: cuts.length, loop, bbox: loopBBox(loop) });
        joined.push({ wall: i, opening: op, loop });
      }
    }
  }
  if (jwalls.length === 0) return null;
  return { result: joinWalls(jwalls, cuts, groupKeys), cuts: joined };
}

/**
 * Wall fill + outline for a whole set of walls, joined.
 *
 * `walls` is the plan's wall list in source order — that index is `joinWalls`'s canonical
 * tie-break, so it must be the caller's own and stable. `hatches` is `hatchesUsed(walls)`:
 * it fixes both which fills are produced and the order they are emitted in.
 *
 * Every opening on every wall is cut, on a straight, angled or curved host alike — which
 * is why `RenderCtx.openingsVoided` is now unconditionally true and no element paints an
 * opaque cover any more.
 *
 * Pure and deterministic: one {@link PointInterner} for the whole call (see `joinWalls`
 * for why that matters), no clock, no randomness, no Map-order dependence.
 */
export function lowerWallSet(walls: readonly RWall[], hatches: readonly HatchSpec[], ctx: RenderCtx): SceneNode[] {
  const joined = joinWallSet(walls, hatches.map(hatchKey));
  if (!joined) return [];
  const result = joined.result;
  const nodes: SceneNode[] = [];
  for (const h of hatches) {
    const k = hatchKey(h);
    const fill = result.fills.find((f) => f.group === k);
    if (!fill || fill.loops.length === 0) continue;
    nodes.push({
      layer: "wallFill",
      prim: {
        t: "hatch",
        region: loopsToPolygons(fill.loops),
        material: h.material,
        scale: h.scale,
        angle: h.angle,
      },
      paint: { fill: `url(#${patternId(h.material, h.scale, h.angle)})`, fillRule: "nonzero" },
    });
  }
  if (result.outline.length > 0) {
    nodes.push({
      layer: "wallFace",
      // `region` while every edge is straight — the primitive every backend has
      // serialized since v0.9, and what keeps a rectilinear plan on the bytes it had.
      // `path` as soon as one edge curves, so a face is never faceted.
      prim: emitLoops(result.outline),
      paint: {
        fill: "none",
        stroke: ctx.theme.wallStroke,
        width: ctx.sizes.wallStroke,
        linejoin: "miter",
        miterLimit: MITER_LIMIT,
      },
    });
  }
  return nodes;
}
