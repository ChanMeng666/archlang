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
import type { LineType, PathLoop, Scene, SceneNode, ScenePrim, SceneWall } from "./scene.js";
import { MITER_LIMIT } from "./scene.js";
import type { HatchSpec } from "./hatches.js";
import { hatchesUsed, hatchKey, hatchOf, patternId } from "./hatches.js";
import { PointInterner, SNAP_MM, loopBBox, loopWinding, openingCut, wallBand } from "./geometry/band.js";
import type { EdgeLoop } from "./geometry/band.js";
import type { GridBox } from "./geometry/grid-index.js";
import type { JoineryCut, JoineryResult, JoineryWall } from "./geometry/joinery.js";
import { bandBBox, emitLoops, joinWalls, loopsToPolygons, toPathLoop } from "./geometry/joinery.js";

/** What the joinery reads of a wall: its band, its hatch and the openings cut through it.
 *  `id` is optional because the joinery only ever prints it in a diagnostic. */
export type JoinableWall = Pick<
  RWall,
  "thickness" | "points" | "arcs" | "closed" | "material" | "hatchScale" | "hatchAngle" | "openings" | "_derived"
> & { id?: string };

/** A resolved wall as {@link Scene.walls} carries it: the joinery's inputs plus `category`;
 *  an opening is only the `at`/`width` it cuts. Arrays are shared with the wall, not copied. */
function sceneWall(w: RWall): SceneWall {
  return {
    category: w.category,
    ...(w.status !== undefined ? { status: w.status } : {}),
    // The derived facts the joinery reads, with none of the names (`freeCrossingCuts`).
    ...(w._derived ? { _derived: { from: w._derived.from, ...(w._derived.open ? { open: {} } : {}) } } : {}),
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

/** One derived run's end at a crossing. */
interface CrossingArm {
  /** Index into the wall list. */
  wall: number;
  /** Unit vector from the crossing along the run. */
  away: Point;
  /** How far from the crossing its opening's jamb stands, on a run whose one opening is the
   *  `open between` clause's; `null` on a run with anything else to carry. */
  jamb: number | null;
}

/**
 * The cuts that clear a crossing of `open between` runs (issue #368).
 *
 * A jamb stops at the face of what it meets, and a band runs half its thickness past its end
 * (the square cap, `band.ts`), so where such runs end at one point the openings leave a block of
 * wall a full thickness across, the size of the thickest run there. Nothing asked for it (a
 * `column` is how a plan asks for a pier). What becomes of it depends on what is left standing:
 *
 *  - **Every run there is open** (four at a crossing, three at a tee): the whole block goes.
 *  - **One run stands**, at least two being open: the block goes except that run's own width on
 *    its own side of the point, so the run ends flush on the crossing, its square cap gone,
 *    whether it is thicker or thinner than the open runs: thicker, the block is its width; thinner,
 *    the block's sides beside it go too. A run stands when it has any other opening to carry, or a
 *    `width` that stops short of the crossing: that run is the wall the clause left.
 *  - **Two or more stand**: they meet as walls do, so nothing is cut.
 *
 * An open run reaches the crossing when its jamb is on the face of the thickest run across its
 * end, which is where `faceAt` (`src/room-tiling.ts`) put it.
 *
 * An authored wall keeps what it draws, whatever is cut through it, so only derived runs are arms:
 * a crossing another wall's band touches stays as it is, authored or the ring (read off edge boxes,
 * so a near miss keeps the block), because the cut would take that wall's material too. Each block
 * is an ordinary cut of an arm, so it rides `place`, and it is absent from a wall set whose
 * openings were stripped, which is what keeps `describe()` off it: `gross-area.ts` and
 * `wall-faces.ts` read the solid.
 */
function freeCrossingCuts(
  walls: readonly JoinableWall[],
  bands: readonly JoineryWall[],
  intern: PointInterner,
): EdgeLoop[] {
  if (!walls.some((w) => w._derived?.open)) return [];
  const armsAt = new Map<Point, CrossingArm[]>();
  walls.forEach((w, i) => {
    if (!w._derived || w.closed || w.points.length !== 2) return;
    const [a, b] = w.points as [Point, Point];
    const opening = w._derived.open && w.openings.length === 1 ? w.openings[0]! : null;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    for (const [end, far] of [
      [a, b],
      [b, a],
    ] as const) {
      const away = { x: (far.x - end.x) / length, y: (far.y - end.y) / length };
      const jamb = opening
        ? (opening.at.x - end.x) * away.x + (opening.at.y - end.y) * away.y - opening.width / 2
        : null;
      const at = intern.get(end);
      armsAt.set(at, [...(armsAt.get(at) ?? []), { wall: i, away, jamb }]);
    }
  });
  const half = (a: CrossingArm): number => walls[a.wall]!.thickness / 2;
  const out: EdgeLoop[] = [];
  for (const [at, arms] of armsAt) {
    // The thickest run across each arm's end: the face its jamb stops at.
    const face = (a: CrossingArm): number =>
      Math.max(0, ...arms.filter((b) => Math.abs(b.away.x * a.away.x + b.away.y * a.away.y) < 0.5).map(half));
    const open = arms.filter((a) => a.jamb !== null && a.jamb <= face(a) + SNAP_MM);
    const standing = arms.filter((a) => !open.includes(a));
    if (open.length < 2 || standing.length > 1) continue;
    const reach = Math.max(...arms.map(half));
    const stood = standing[0];
    const host = walls[(stood ?? open[0]!).wall]!;
    const block = openingCut({ ...host, thickness: 2 * reach }, { at, width: 2 * reach }, intern);
    if (!block) continue;
    const box = loopBBox(block);
    if (bands.some((w) => !arms.some((a) => a.wall === w.index) && bandTouches(w, box, at))) continue;
    if (!stood) {
      out.push(block);
      continue;
    }
    // `along` runs with the standing wall and `across` over it, in its frame from the crossing.
    const piece = (along: number, across: number, length: number, breadth: number): EdgeLoop | null => {
      const { x: ux, y: uy } = stood.away;
      const centre = { x: at.x + ux * along - uy * across, y: at.y + uy * along + ux * across };
      return openingCut({ ...host, thickness: breadth }, { at: centre, width: length }, intern);
    };
    const own = half(stood);
    const beside = reach - own;
    const pieces = [
      piece(-reach / 2, 0, reach, 2 * reach),
      ...(beside > SNAP_MM
        ? [piece(reach / 2, (own + reach) / 2, reach, beside), piece(reach / 2, -(own + reach) / 2, reach, beside)]
        : []),
    ];
    for (const p of pieces) if (p) out.push(p);
  }
  return out;
}

const boxesOverlap = (a: GridBox, b: GridBox): boolean =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

/** Does a wall's band cover `p`, or have an edge whose box overlaps `box`, which holds `p`? */
function bandTouches(w: JoineryWall, box: GridBox, p: Point): boolean {
  if (!boxesOverlap(w.bbox, box)) return false;
  // Summed over the loops: a ring's band is an outer loop and a hole, and only together do they
  // leave the floor they enclose out of the wall.
  if (w.loops.reduce((n, l) => n + loopWinding(l, p), 0) !== 0) return true;
  return w.loops.some((l) => l.some((e) => boxesOverlap(loopBBox([e]), box)));
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
  // Not in `joined`: a cleared crossing is no opening, so a consumer counting openings sees none.
  for (const loop of freeCrossingCuts(walls, jwalls, intern)) {
    cuts.push({ index: cuts.length, loop, bbox: loopBBox(loop) });
  }
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
 * `lineType` marks the outline node with a named line type (`dashed` for the walls a remodel
 * demolishes, which `toScene` lowers in a call of their own with no hatches, so they draw as a
 * dashed outline with no poché). Absent, the node carries no `lineType` key at all, so every
 * other caller's nodes are what they always were.
 *
 * Pure and deterministic: one {@link PointInterner} for the whole call (see `joinWalls`
 * for why that matters), no clock, no randomness, no Map-order dependence.
 */
export function lowerWallSet(
  walls: readonly RWall[],
  hatches: readonly HatchSpec[],
  ctx: RenderCtx,
  lineType?: LineType,
): SceneNode[] {
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
      ...(lineType !== undefined ? { lineType } : {}),
    });
  }
  return nodes;
}
