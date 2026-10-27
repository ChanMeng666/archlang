/**
 * **The one wall-lowering path** — a set of resolved walls to the Scene nodes that draw
 * them: one poché fill per material group, and ONE outline for the whole set.
 *
 * One path, for every wall, so there is one set of corner cases, no optional dependency
 * that could move a drawing's bytes, and no shape of plan whose junctions are drawn wrong
 * by construction: `geometry/band.ts` turns each wall into exact mitred
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

import type { Point } from "./ast.js";
import type { Opening, RWall } from "./ir.js";
import type { RenderCtx } from "./registry.js";
import type { PathLoop, Scene, SceneNode, ScenePrim, SceneWall } from "./scene.js";
import { MITER_LIMIT } from "./scene.js";
import type { HatchSpec } from "./hatches.js";
import { hatchesUsed, hatchKey, hatchOf, patternId } from "./hatches.js";
import { PointInterner, loopBBox, openingCut, wallBand } from "./geometry/band.js";
import type { EdgeLoop } from "./geometry/band.js";
import type { JoineryCut, JoineryResult, JoineryWall } from "./geometry/joinery.js";
import { bandBBox, emitLoops, joinWalls, loopsToPolygons, toPathLoop } from "./geometry/joinery.js";

/** What the joinery reads of a wall: its band, its hatch and the openings cut through it.
 *  `id` is optional because the joinery only ever prints it in a diagnostic. */
export type JoinableWall = Pick<
  RWall,
  "thickness" | "points" | "arcs" | "closed" | "material" | "hatchScale" | "hatchAngle" | "openings"
> & { id?: string };

/** A resolved wall as {@link Scene.walls} carries it: the joinery's inputs plus `category`;
 *  an opening is only the `at`/`width` it cuts. Arrays are shared with the wall, not copied. */
function sceneWall(w: RWall): SceneWall {
  return {
    category: w.category,
    thickness: w.thickness,
    points: w.points,
    ...(w.arcs ? { arcs: w.arcs } : {}),
    closed: w.closed,
    material: w.material,
    hatchScale: w.hatchScale,
    hatchAngle: w.hatchAngle,
    openings: w.openings.map((o) => ({ at: o.at, width: o.width })),
  };
}

/**
 * Give `scene` its {@link Scene.walls}: the walls `lowerWallSet` was handed, in THAT order —
 * the drawing's own order, which is the joinery's tie-break index, so a re-join of the list
 * reproduces the drawn wall nodes by construction.
 *
 * LAZY: an enumerable getter that projects on first read and keeps the result, so a compile
 * that never exports a DXF pays one closure and no per-wall work. A getter rather than a
 * method because a Scene is plain data — `structuredClone`, `JSON.stringify` and a spread
 * all read it as an ordinary array property. A plan with no walls gets no property at all.
 *
 * And WRITABLE, as the type says: assigning it (say `scene.walls = undefined`, to export the
 * wall nodes unsplit on `A-WALL` as a hand-built Scene would) replaces the getter with a plain
 * data property holding the new value. `delete scene.walls` works too.
 */
export function attachSceneWalls(scene: Scene, walls: readonly RWall[]): void {
  if (walls.length === 0) return;
  let projected: SceneWall[] | undefined;
  Object.defineProperty(scene, "walls", {
    enumerable: true,
    configurable: true,
    get: (): SceneWall[] => {
      projected ??= walls.map(sceneWall);
      return projected;
    },
    set: (value: readonly SceneWall[] | undefined): void => {
      Object.defineProperty(scene, "walls", { value, enumerable: true, configurable: true, writable: true });
    },
  });
}

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
 * Split out of {@link lowerWallSet} so the axonometric view (`src/view/`) can
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
 *
 * Public from the package root (ADR 0031), with the `split` argument that yields one
 * ownership polygon per wall; its numeric tolerances are not part of the promise.
 */
export function joinWallSet<W extends JoinableWall>(
  walls: readonly W[],
  groupKeys: readonly string[],
  split?: { faceOf: (w: W) => string; faces: readonly string[] },
): JoinedWallSet | null {
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
        id: w.id ?? "",
        thickness: w.thickness,
        group: hatchKey(hatchOf(w)),
        ...(split ? { face: split.faceOf(w) } : {}),
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
  return { result: joinWalls(jwalls, cuts, groupKeys, split?.faces), cuts: joined };
}

/**
 * A wall set's drawing, partitioned by a per-wall CLASS — for an export that files walls on
 * separate layers (the DXF's exterior and interior wall layers). Never on the drawing path:
 * the Scene is drawn by {@link lowerWallSet} alone.
 *
 * `outline` and each `fills[].region` are exactly what {@link lowerWallSet} puts on its
 * nodes (same join, same emission), so a caller can recognise the nodes it is refining by
 * equality and leave anything else alone. `byClass` and `faces` partition those two: one
 * joinery call, read off the same ownership (`JoinerySplit`), so the split can only ever
 * re-file what is drawn, never draw something else.
 *
 * `walls` must be in the order the drawing lowered them (`Scene.walls` is), since that order
 * breaks the joinery's thickness ties. `classes` is a PRIORITY: where two walls of equal
 * thickness and the same hatch (material, scale AND angle — `hatchKey`) share a point, it is
 * filed under the class listed first —
 * which cannot move a fill, because both walls are in the same one. A tie between DIFFERENT
 * hatches stays the drawing's (the earlier wall in `walls`): re-deciding it would move a fill.
 */
export interface ClassedWallSet {
  outline: ScenePrim | null;
  fills: Array<{ hatch: HatchSpec; region: Point[][]; byClass: Array<{ cls: string; region: Point[][] }> }>;
  /** Per class, in `classes` order: the outline's runs whose solid that class owns. */
  faces: Array<{ cls: string; runs: PathLoop[] }>;
}

export function classifyWallSet(
  walls: readonly SceneWall[],
  classOf: (w: SceneWall) => string,
  classes: readonly string[],
): ClassedWallSet | null {
  // A class `classes` does not list would have nowhere to go: its faces and fills would
  // vanish from the split. That is a caller's bug, not a plan's, so it is thrown.
  for (const w of walls) {
    const cls = classOf(w);
    if (!classes.includes(cls))
      throw new RangeError(`classifyWallSet: class "${cls}" is not in [${classes.join(", ")}]`);
  }
  const hatches = hatchesUsed(walls);
  const joined = joinWallSet(walls, hatches.map(hatchKey), { faceOf: classOf, faces: classes });
  const split = joined?.result.split;
  if (!joined || !split) return null;
  const result = joined.result;
  return {
    outline: result.outline.length > 0 ? emitLoops(result.outline) : null,
    fills: hatches.map((hatch) => {
      const k = hatchKey(hatch);
      const fill = result.fills.find((f) => f.group === k);
      return {
        hatch,
        region: loopsToPolygons(fill?.loops ?? []),
        byClass: classes.map((cls) => ({
          cls,
          region: loopsToPolygons(split.fills.find((f) => f.group === k && f.face === cls)?.loops ?? []),
        })),
      };
    }),
    faces: split.faces.map((f) => ({ cls: f.face, runs: f.runs.map(toPathLoop) })),
  };
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
      // `region` while every edge is straight — the primitive every backend
      // serializes, and what keeps a rectilinear plan's bytes independent of curves.
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
