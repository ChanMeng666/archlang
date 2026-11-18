/**
 * Lowers a resolved plan (IR) to the backend-neutral {@link Scene}.
 *
 * This is the single place geometry is assembled: each element contributes
 * positioned primitives via its registry `render`, the whole wall set is joined into one
 * boundary by `wall-lowering.ts` (walls are the only element needing cross-STATEMENT
 * treatment, not merely cross-segment), and the page-level sizing
 * (reference dimension, derived font/stroke sizes, bounds) is computed once and
 * carried on the Scene for the backends. Pure & deterministic — no I/O, no time.
 *
 * `renderOrder()` draws `underlay` fixtures before the other furniture; `RenderCtx.floorAt`
 * (`registry.ts`) answers "inside the building?" from rooms and voids, the probe that puts a
 * window's sill on the side with no floor; `planTheme()` is the one theme cascade shared by the
 * drawing and the pipeline's `lineWeight` check.
 */

import type { CompileOptions } from "./types.js";
import type { CompileWork } from "./compile-work.js";
import {
  drawnView,
  type ResolvedPlan,
  type ROutdoor,
  type RRoom,
  type RDim,
  type RDoor,
  type RFurniture,
  type RVoid,
} from "./ir.js";
import type { RenderCtx, Registry, Runtime } from "./registry.js";
import { BUILTIN_RUNTIME } from "./registry.js";
import type { RenderSizes, Scene, SceneNode, ScenePart, SceneSheet } from "./scene.js";
import type { Bounds, Vec, WallSegment } from "./geometry.js";
import { add, doorLeaves, mul, normal, segmentsOfWall, sub, unit } from "./geometry.js";
import { arcPointAt, diameterText, radiusText } from "./geometry/arc.js";
import type { Point } from "./ast.js";
import { facetsOf } from "./elements/facets.js";
import { floorMaterialsUsed, hatchesUsed } from "./hatches.js";
import { attachSceneWalls, lowerWallSet } from "./wall-lowering.js";
import type { FacadeOpening, SideGeom } from "./facade.js";
import { SIDES, cleanTicks, facadeAt, facadeOpenings, measureExtent, openingsBySide, sideGeoms } from "./facade.js";
import { anchorChromeToSheet, dimReach, historicalNorth, layoutChrome, northArrowBox } from "./chrome-layout.js";
import { northBearingDeg } from "./algebra/d4.js";
import { axesNodes } from "./axes.js";
import { PROPERTY_LAYER, siteBoundaryNodes } from "./site.js";
import { groundMaterialsUsed, outdoorLabelAnchor, outdoorRing } from "./elements/outdoor.js";
import { roomLabelAnchor } from "./elements/room.js";
import { isUnderlay } from "./fixtures-catalog.js";
import { type ArrivingRun, isVertical } from "./vertical.js";
import { clippedArea, rectRing } from "./geometry/polygon.js";
import { CHAIN_BASE, CHAIN_STEP, DIM_TEXT_GAP, drawingBounds, renderSizes } from "./sheet.js";
import { textWidth } from "./text-metrics.js";
import { type Box, boxesMeet, type TextBox, textBox } from "./text-layout.js";
import { dimTextPrim } from "./elements/dim.js";
import type { LabelGroup } from "./label-placement.js";
import type { ElementNodes } from "./label-fit.js";
import { fitLabels, fitWork, isSymbolElement, sectorOf, shapesOf } from "./label-fit.js";
import { COLLIDE_MIN, meanExtent, relocateLabels, underLabels, wallBands, wrapLabels } from "./label-placement.js";
import { GridIndex } from "./geometry/grid-index.js";
import type { BBox } from "./geometry/rect.js";
import { legendEntries, roomSchedule, sheetTableNodes } from "./sheet-tables.js";
import { openingRows, openingTagNodes } from "./opening-schedule.js";
import { circulationOverlayNodes } from "./overlays/circulation.js";
import { captionForPlan } from "./describe.js";
import type { RoomBox } from "./analyze.js";
import { pointInRoomBox, roomBox } from "./analyze.js";
import { withNetAreaBudget } from "./analyze/net-area-memo.js";
import { DEFAULT_THEME, THEMES, mergeTheme, sanitizeTheme, derivePoche } from "./theme.js";
import type { Theme } from "./theme.js";

/** Deterministic mm formatter for computed label text (round 2dp, strip zeros, no -0). */
import { fmt2 as fmtMm } from "./num-format.js";
import { PLAIN_SHEET_TEXT, sheetText } from "./sheet-text.js";

/** Drawing bounds: each element contributes points via its registry `bounds`. */
function planBounds(ir: ResolvedPlan, registry: Registry): Bounds {
  return drawingBounds(ir.elements, ir.siteBoundary, registry);
}

const isUnderlayPiece = (el: ResolvedPlan["elements"][number]): boolean =>
  el.kind === "furniture" && isUnderlay((el as RFurniture).category);

/**
 * The order {@link toScene} renders elements in: SOURCE order, except that every
 * {@link isUnderlay} fixture (a rug) is moved to just before the plan's first piece of
 * furniture — a stable partition of the furniture, underlays first, each half in source order.
 *
 * A rug is the floor finish the sofa and the coffee table stand ON, so it must paint under
 * them whichever was written first: the furniture pass draws its nodes in collection order, and
 * `furniture sofa …` then `furniture rug …` (`examples/garden-house.arch`) drew the rug's lines
 * straight across the sofa. Every element before the first piece of furniture is not furniture,
 * so it keeps its place; every other element keeps its relative order. Elements on other passes
 * are bucketed by pass in every backend, so only the furniture pass can see the move.
 *
 * A plan with no underlay gets `elements` itself back — the same array, so the same bytes.
 */
function renderOrder(elements: ResolvedPlan["elements"]): ResolvedPlan["elements"] {
  if (!elements.some(isUnderlayPiece)) return elements;
  const first = elements.findIndex((el) => el.kind === "furniture");
  const rest = elements.filter((el) => !isUnderlayPiece(el));
  return [...rest.slice(0, first), ...elements.filter(isUnderlayPiece), ...rest.slice(first)];
}

/** Resolve `theme <name>` to its colours: per-call registered themes win over built-in THEMES.
 *  Exported so the axonometric view (`src/view/iso.ts`) runs the SAME cascade rather than a
 *  second copy of it — a theme resolved two ways is two ways for a colour to be wrong. */
export function themeBaseLookup(name: string | undefined, runtime: Runtime): Partial<Theme> {
  if (!name) return {};
  const reg = runtime.themes?.find((t) => t.name === name);
  return reg ? reg.theme : (THEMES[name] ?? {});
}

/**
 * Synthesize the dimension lines for `dims auto …` — the GB/T 50104 exterior
 * dimensioning convention: parallel CHAINS on the facades, all outside the
 * building, stepping outward from the wall faces (see {@link synthGbChains}).
 * Each is a plain {@link RDim} with no `text`, so the dim element formats the
 * measured length itself — the same value a hand-written `dim` would show.
 */
function synthDims(ir: ResolvedPlan, sizes: RenderSizes, registry: Registry = BUILTIN_RUNTIME.registry): LaidDims {
  const dims: RDim[] = [];
  if (ir.autoDims !== "walls") {
    synthGbChains(ir, sizes, dims);
    synthCurveDims(ir, dims);
  }
  const thickness: ThicknessFigure[] = [];
  if (ir.autoDims === "walls" || ir.autoDims === "all") synthWallDims(ir, sizes, dims, registry, thickness);
  return { dims, thickness };
}

/** What {@link synthDims} lays out: the dimensions, and how each wall-thickness figure was placed. */
interface LaidDims {
  /** Every dimension, in drawing order: the chains, the curve call-outs, then the thickness figures. */
  dims: RDim[];
  /** One per thickness figure, in the order of the last `thickness.length` entries of {@link dims}. */
  thickness: ThicknessFigure[];
}

/** A straight, axis-aligned wall run a thickness figure can be lettered beside. */
interface ThicknessRun {
  a: Point;
  b: Point;
  n: Vec;
  t: number;
  len: number;
  seg: WallSegment;
}

/** How {@link synthWallDims} placed one thickness figure: what card AL5's re-station starts from. */
interface ThicknessFigure {
  /** The longest straight run of that thickness, the one the figure is lettered beside. */
  rep: ThicknessRun;
  /** Whether the figure is written on the `+n` side (`calloutFrom`). */
  plus: boolean;
  /** How far off the centreline the number reaches. */
  reach: number;
  /** The number, as the sheet writes it. */
  text: string;
}

/**
 * A wall thickness `dims auto` letters nowhere (card AL5): its figure met a room's name or area
 * figure where it would stand, and no other station is clear of everything already drawn there
 * (see {@link restationThickness}), so the figure is not drawn. `W_DIM_THICKNESS_UNPLACED`
 * reports it.
 */
export interface UnplacedThickness {
  /** The thickness, in mm. */
  thickness: number;
  /** The longest straight run of that thickness: the wall the figure is lettered on. */
  run: WallSegment;
  /** Whether a second straight run of that thickness was tried. */
  second: boolean;
  /** The ids of the rooms whose label the figure met where it first stood, in drawing order. */
  labelRooms: string[];
}

/** The `dims auto` dimensions a storey's Scene draws, and the thickness figures it leaves out (card AL5). */
export interface DrawnAutoDims {
  /** Every dimension `dims auto` drew, in drawing order: what `W_ANNOTATION_OVERLAP` reads. */
  dims: readonly RDim[];
  /** The wall thicknesses whose figure was not drawn: what `W_DIM_THICKNESS_UNPLACED` reads. */
  unplaced: readonly UnplacedThickness[];
}

/** {@link DrawnAutoDims} beside the Scene that drew them: data kept off the Scene, so its bytes are unchanged. */
const DRAWN_AUTO_DIMS = new WeakMap<object, DrawnAutoDims>();

/**
 * The `dims auto` layout `scene` was drawn with: the dimensions as drawn, every wall-thickness
 * figure where card AL5's re-station left it, and the ones it left out. The lint reads it instead
 * of laying the dimensions out again, so it and the drawing cannot disagree (and a storey is laid
 * out once). `undefined` for an object no {@link toScene} drew.
 */
export function drawnAutoDims(scene: object): DrawnAutoDims | undefined {
  return DRAWN_AUTO_DIMS.get(scene);
}

/**
 * Carry {@link drawnAutoDims} from a Scene to a copy of it (`src/scene-memo.ts`), through `copy`, so
 * the copy shares no object with the Scene a caller holds.
 */
export function carryDrawnAutoDims(from: object, to: object, copy: (laid: DrawnAutoDims) => DrawnAutoDims): void {
  const laid = DRAWN_AUTO_DIMS.get(from);
  if (laid) DRAWN_AUTO_DIMS.set(to, copy(laid));
}

/**
 * The dimensions `dims auto` lays out on this storey at `sizes`, in drawing order, before the room
 * labels are placed: the list {@link toScene} starts from. A wall-thickness figure that then meets
 * a room's label is moved or left out (card AL5); {@link drawnAutoDims} is the list as drawn.
 * Pass the Scene's own `sizes` and the compile's registry.
 */
export function autoDimensions(ir: ResolvedPlan, sizes: RenderSizes, registry: Registry): RDim[] {
  return ir.autoDims ? synthDims(ir, sizes, registry).dims : [];
}

/**
 * How many dimensions `dims auto` will draw on this storey, for the drawing budget
 * (`src/draw-budget.ts`): the same {@link synthDims} the drawing calls. The pens only move
 * a chain outward or flip a number's side, never add or remove a dimension, so any pens do;
 * likewise the registry (furniture footprints) only moves a call-out's station, so the
 * built-in one does. Card AL5's re-station only moves a thickness figure or leaves it out,
 * never adds one, so the count bounds what is drawn.
 */
export function autoDimCount(ir: ResolvedPlan): number {
  return ir.autoDims ? synthDims(ir, renderSizes(ir.sheet, 1000, 1000, 1)).dims.length : 0;
}

/**
 * `dims auto` for CURVES — the GB/T 50104 convention for anything round: a linear chain
 * cannot describe an arc, so a curve is dimensioned by its RADIUS and a circle by its
 * DIAMETER.
 *
 * One `R<r>` leader per distinct arc edge, drawn from the centre out to the arc's
 * midpoint (so it reads as the radius it measures), and one `phi<d>` across every circular
 * room through its centre. Deduplicated by (centre, radius) so a full circle written as
 * two semicircles gets ONE call-out, not two. Presentation only — like every other
 * `dims auto` chain it never touches the IR, `describe()` or `lint()`, and a plan with no
 * curve emits nothing here.
 */
function synthCurveDims(ir: ResolvedPlan, dims: RDim[]): void {
  const { mm } = sheetText(ir.sheetText?.entries);
  const seen = new Set<string>();
  for (const w of ir.walls) {
    for (const s of segmentsOfWall(w)) {
      if (!s.arc) continue;
      const key = `${fmtMm(s.arc.center.x)}|${fmtMm(s.arc.center.y)}|${fmtMm(s.arc.r)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dims.push(mkDim(s.arc.center, arcPointAt(s.arc, 0.5), 0, radiusText(s.arc.r, mm)));
    }
  }
  for (const el of ir.elements) {
    if (el.kind !== "room") continue;
    const c = (el as RRoom).circle;
    if (!c || !(c.r > 0)) continue;
    dims.push(mkDim({ x: c.c.x - c.r, y: c.c.y }, { x: c.c.x + c.r, y: c.c.y }, 0, diameterText(c.r, mm)));
  }
}

const mkDim = (from: Point, to: Point, offset: number, text?: string): RDim => ({
  kind: "dim",
  id: "",
  from,
  to,
  offset,
  text,
});

/** A point on a side's chain baseline, at along-axis coordinate `v`. */
const sidePt = (s: SideGeom, v: number): Point => (s.axis === "h" ? { x: v, y: s.outer } : { x: s.outer, y: v });

/** Where the extension (witness) line for a tick at `v` STARTS: on the facade itself,
 *  not on the chain's straight baseline (which is where {@link sidePt} measures). */
const witnessPt = (s: SideGeom, v: number): Point => {
  const cross = facadeAt(s.profile, s.out, v) ?? s.outer;
  return s.axis === "h" ? { x: v, y: cross } : { x: cross, y: v };
};

/** Chain slots, in multiples of `dimFont` outward from the wall face. Fixed per
 *  chain (not packed), so omitting a chain leaves its slot empty instead of
 *  reflowing the others — the openings chain is always the innermost. The two
 *  constants live in `src/sheet.ts` because the sheet fit test must reserve exactly
 *  the band these chains occupy. */
const chainOffset = (sizes: RenderSizes, slot: number): number => sizes.dimFont * (CHAIN_BASE + slot * CHAIN_STEP);

/**
 * How far outboard of its wall face a facade's dimension BAND has to start so its
 * chains land in clear paper rather than on the ground the plan draws.
 *
 * {@link chainOffset} alone is not the whole answer once `outdoor` draws ground outside
 * the wall line: on `garden-house` the ground-floor chain runs across the patio, the paving link and the
 * deck, and the first-floor chain across the balcony slab. Nothing is illegible — a
 * dimension line is a thin dark stroke and ground is a tint under a hatch — but it is
 * not what a drafter would issue.
 *
 * **The rule.** The band is offset from the outermost thing this facade shows: its own
 * outer wall face, or the furthest any `outdoor` surface reaches beyond it. That
 * maximum is the FIXED POINT of "push the chain past whatever it would cross", so the
 * chain ends up crossing no ground at all. Pushing only past the surfaces that ABUT the
 * facade is not a fixed point and does not close the defect — measured on
 * `garden-house`, it moves the ground-floor chain off the patio and onto the lawn.
 *
 * **Per facade, and zero without ground.** Every side of every plan that declares no
 * `outdoor` gets 0 here, which is what keeps the chain offsets — and therefore the
 * bytes — of the other shipped examples exactly as they were.
 *
 * **The whole stack moves together.** The caller adds this to `chainOffset(sizes, slot)`
 * for every slot, so the openings / axis / overall chains keep their exact `CHAIN_STEP`
 * spacing and simply translate outward. Reflowing them independently would leave the
 * inner chains on the ground and would break the fixed slot geometry that
 * `DIM_BAND_FONTS` and `W_DIM_OVERLAP`'s tier arithmetic both read.
 *
 * **A surface covering part of the run pushes the whole chain.** A chain is one line at
 * one offset: it cannot step around an obstruction halfway along, and splitting it into
 * two collinear pieces at different offsets would stop reading as one chain. So any
 * surface overlapping the measured along-span counts, as far as it reaches.
 *
 * **Units.** `chainOffset` is `sizes.dimFont` times a dimensionless multiple, and
 * `dimFont` is already in PLAN millimetres in both `RenderSizes` constructors —
 * `refDim * 0.02` in `toScene`, and `SHEET_MM.dimText * denom` in `sizesFromPaper`,
 * where the sheet millimetres are multiplied by the scale denominator. A ground extent
 * is plan millimetres too, so the two are directly commensurable and there is no
 * conversion here.
 *
 * **From the shape, never the bounding box.** A surface's reach is read off its own
 * ring, CLIPPED to the along-span the chain measures: each ring edge is cut at `lo`/`hi`
 * and its cross coordinate evaluated at the cut, which is exact because an edge's cross
 * coordinate is linear in its along coordinate. A polygon whose far corner sits outside
 * the measured span therefore contributes the reach it actually has under the chain,
 * not the reach its bounding box would claim.
 */
function groundStandoff(outdoors: readonly ROutdoor[], g: SideGeom): number {
  const along = (p: Point): number => (g.axis === "h" ? p.x : p.y);
  const cross = (p: Point): number => (g.axis === "h" ? p.y : p.x);
  /** Outward depth of a cross coordinate past this facade's outer face (negative = inboard). */
  const reach = (c: number): number => g.out * (c - g.outer);
  let depth = 0;
  for (const o of outdoors) {
    const ring = outdoorRing(o);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const a0 = along(a);
      const a1 = along(b);
      if (a0 === a1) {
        // Perpendicular to the chain: the edge states one along coordinate and two
        // cross ones, so there is nothing to clip — it is either in the span or out.
        if (a0 >= g.lo && a0 <= g.hi) depth = Math.max(depth, reach(cross(a)), reach(cross(b)));
        continue;
      }
      // Clip the edge's parameter range (t runs a -> b) to [lo, hi]. The extremes of a
      // linear function on an interval are at its ends, so the two clipped endpoints
      // are the only cross coordinates worth evaluating.
      const tLo = (g.lo - a0) / (a1 - a0);
      const tHi = (g.hi - a0) / (a1 - a0);
      const t0 = Math.max(0, Math.min(tLo, tHi));
      const t1 = Math.min(1, Math.max(tLo, tHi));
      if (t0 > t1) continue; // the edge never enters the measured span
      const dc = cross(b) - cross(a);
      depth = Math.max(depth, reach(cross(a) + t0 * dc), reach(cross(a) + t1 * dc));
    }
  }
  return Math.max(0, depth);
}

/**
 * Does this chain's NUMBERS crowd, and should they therefore stagger?
 *
 * Chain TIERING (which slot a chain sits in) and number CROWDING are different problems:
 * three chains can be correctly tiered into three slots and still be unreadable, because
 * every number in one of them is wider than the bay it labels. Twelve 200 mm bays cannot
 * each hold a ~300 mm-wide "200" — the values overprint their neighbours while the lines
 * themselves are perfectly staged. The GB/T 50104 / ISO 129 answer is to stagger the
 * values: put every other one on the far side of the dimension line.
 *
 * **The rule.** Each value is centred on its own span, so two neighbours' centres are
 * `(wᵢ + wᵢ₊₁) / 2` apart and their facing half-widths sum to `(Wᵢ + Wᵢ₊₁) / 2`. The pair
 * is crowded when what is left is less than the clear gap {@link DIM_TEXT_GAP}:
 *
 * ```
 *   Wᵢ + Wᵢ₊₁ + 2·gap  >  wᵢ + wᵢ₊₁
 * ```
 *
 * `W` is the shared closed-form {@link textWidth} estimate over the exact string
 * `dim.render` will draw — the same helper `W_DIM_OVERLAP` measures with, so the lint rule
 * and this decision can never disagree about what collides. There are no text metrics in
 * `src/` and there is no font to measure.
 *
 * **Whole chain, or none.** One crowded PAIR staggers the WHOLE chain. Staggering only the
 * offending pairs would leave an irregular two-row pattern that reads worse than either
 * row alone, and can re-collide downstream (pushing `i` down leaves `i+1` up against
 * `i+2`). Alternating from one end is the drafting convention and is what makes the
 * same-side neighbours two bays apart instead of one.
 *
 * **Determinism.** Which numbers move is settled by INDEX PARITY, not by geometry: span 0
 * keeps the outward side, span 1 flips, span 2 keeps, and so on from the chain's `from`
 * end. No float comparison chooses a winner; the only float comparison is the crowding
 * predicate itself, which is strict (`>`) so an exact fit is NOT crowded and a chain that
 * already fits emits byte-identical geometry.
 *
 * A one-span chain (the `overall` chain, always) has no adjacent pair and can never crowd.
 */
function staggerChain(ticks: readonly number[], dimFont: number): boolean {
  if (ticks.length < 3) return false;
  const gap = DIM_TEXT_GAP * dimFont;
  // Width of the value each span will be labelled with, in tick order. `dims auto` never
  // writes a `text` override, so the label is the measured length through the same `fmtMm`
  // the render context hands `dim.render` as its `fmt`.
  const w = ticks.slice(1).map((t, i) => Math.abs(t - ticks[i]!));
  const width = w.map((len) => textWidth(fmtMm(len), dimFont));
  for (let i = 0; i + 1 < w.length; i++) {
    if (width[i]! + width[i + 1]! + 2 * gap > w[i]! + w[i + 1]!) return true;
  }
  return false;
}

/** Emit one chain: a dim per span between consecutive ticks, all at one offset. */
function emitChain(side: SideGeom, ticks: readonly number[], offset: number, dimFont: number, dims: RDim[]): void {
  if (ticks.length < 2) return;
  // Only a crowded chain staggers, so a plan whose numbers already fit carries no `stagger`
  // flag at all and renders byte-for-byte as it always did.
  const stagger = staggerChain(ticks, dimFont);
  for (let i = 0; i + 1 < ticks.length; i++) {
    const a = ticks[i]!;
    const b = ticks[i + 1]!;
    const [from, to] = side.sign > 0 ? [a, b] : [b, a];
    dims.push({
      ...mkDim(sidePt(side, from), sidePt(side, to), offset),
      // The measured endpoints stay on the chain baseline (so the dimension line, its
      // ticks and its text are untouched); only the witness lines reach back to the
      // wall, which on a stepped or angled facade is not under the baseline at all.
      witness: { from: witnessPt(side, from), to: witnessPt(side, to) },
      // Alternate spans put their number on the inner side of the line. Parity runs from
      // the chain's tick order, which `cleanTicks` has already sorted ascending — so the
      // pattern does not depend on which facade this is or which way `side.sign` points.
      ...(stagger && i % 2 === 1 ? { stagger: true } : {}),
    });
  }
}

/**
 * `dims auto` — GB/T 50104 exterior dimensioning: up to three parallel chains per
 * facade, ALL outside the building and all measured from the outer wall faces,
 * stepping outward from the wall.
 *
 * 1. **openings** (innermost) — a tick at every opening edge on that facade, so the
 *    chain reads corner · pier · opening · pier · corner. Skipped on a facade with
 *    no openings.
 * 2. **centerline / axis** — when the plan declares **positioning axes** on this
 *    facade's direction (`axes { x at … }` for bottom/top, `y at …` for left/right),
 *    the ticks are those axis positions: the GB/T *axis* chain proper (轴线间距), the
 *    number a structural engineer reads. Without declared axes on that direction it
 *    falls back to the sorted unique room-boundary coordinates projected on that axis
 *    — the partition axes, the classic "4000 · 3000" room chain. This is what
 *    `dims auto rooms` emits on its own, and it replaced the old per-room dims,
 *    which measured room rectangles (short by half a wall thickness at each end) and
 *    fell back to drawing INSIDE any room that touched no perimeter. Either way the
 *    chain stays OUTSIDE the building at the same slot offset: declaring axes changes
 *    only WHERE THE TICKS FALL, never the chain's position or reference faces.
 * 3. **overall** (outermost) — one span, outer face to outer face.
 *
 * Bottom + left always carry chains (the reading convention); top and right only when
 * an openings chain is actually being drawn there (`dims auto all` AND that facade has
 * openings of its own) — so `dims auto rooms`/`overall` stay two-sided, and a fully
 * dimensioned plan reads all four facades. Presentation only: never
 * touches the IR, describe() or lint(), and the page margins grow from the emitted
 * geometry via `dimReach`, so nothing clips.
 */
function synthGbChains(ir: ResolvedPlan, sizes: RenderSizes, dims: RDim[]): void {
  const ext = measureExtent(ir);
  if (!ext) return;
  const mode = ir.autoDims;
  const wantOpenings = mode === "all";
  const wantAxis = mode === "rooms" || mode === "all";
  const wantOverall = mode === "overall" || mode === "all";

  const geoms = sideGeoms(ir, ext);
  const onSide = openingsBySide(facadeOpenings(ir), geoms);
  const rooms = ir.elements.filter((el): el is RRoom => el.kind === "room");
  // Ground is not measured — `measureExtent` above is deliberately building-only, because
  // it decides what the overall chain SAYS and a lawn is not part of the building's width.
  // It is read here, and only here, to decide where the chain SITS. The two notions of
  // "the drawing" stay distinct on purpose: one is a measurement, the other a placement.
  const outdoors = ir.elements.filter((el): el is ROutdoor => el.kind === "outdoor");

  for (const side of SIDES) {
    const g = geoms[side];
    // Opening edges on this facade: its probed wall line, or any leg of its outline.
    const mine = onSide[side];
    // Top/right are only dimensioned when an openings chain will be drawn there.
    if ((side === "top" || side === "right") && !(wantOpenings && mine.length > 0)) continue;

    // One standoff for the whole facade, added to every slot, so the chains translate
    // outward as a set and keep their `CHAIN_STEP` spacing. 0 on a facade with no ground
    // beyond it, which is every facade of every plan that declares no `outdoor`.
    const stand = groundStandoff(outdoors, g);
    const slotAt = (slot: number): number => chainOffset(sizes, slot) + stand;

    if (wantOpenings && mine.length > 0) {
      const edges = mine.flatMap((op) => [op.along - op.width / 2, op.along + op.width / 2]);
      emitChain(g, cleanTicks([g.lo, ...edges, g.hi], g.lo, g.hi), slotAt(0), sizes.dimFont, dims);
    }
    if (wantAxis) {
      // Declared axes on this direction win: the middle chain becomes the true GB/T
      // axis chain. The fallback is per-DIRECTION, so a plan that declares only `x`
      // axes still gets the room-boundary chain on its vertical facades.
      const declared = (ir.axes ?? []).filter((a) => a.axis === (g.axis === "h" ? "x" : "y")).map((a) => a.pos);
      const ticks =
        declared.length > 0
          ? declared
          : rooms.flatMap((r) =>
              // A polygon room contributes every vertex coordinate on this axis — the
              // room boundaries it actually has. `cleanTicks` dedupes and clips, so the
              // interior ones simply fall out; only those on the facade survive.
              r.poly
                ? r.poly.map((p) => (g.axis === "h" ? p.x : p.y))
                : g.axis === "h"
                  ? [r.at.x, r.at.x + r.size.w]
                  : [r.at.y, r.at.y + r.size.h],
            );
      emitChain(g, cleanTicks(ticks, g.lo, g.hi), slotAt(1), sizes.dimFont, dims);
    }
    if (wantOverall) emitChain(g, [g.lo, g.hi], slotAt(2), sizes.dimFont, dims);
  }
}

/**
 * Which side of a wall segment a thickness call-out's NUMBER should be written on: the
 * side that has floor under it.
 *
 * The number cannot fit between the two faces of a 100 mm partition, so `dim.render`
 * writes it past the far station instead — which makes the endpoint ORDER decide which
 * side of the wall it lands on. On an exterior wall one of those sides is the annotation
 * band where the `dims auto` chains live, and dropping a call-out into it would overprint
 * a chain's numbers; the other is the room the wall encloses, which is clear paper.
 *
 * So the side is derived from the SHAPE, not from a bounding box or a winding order (a
 * plan is free to wind its shell either way, and a partition's `n` is whatever its two
 * written points imply). Probe one wall thickness clear of each face at three fixed
 * stations along the segment and count the rooms found: more floor wins, a tie keeps the
 * historical order. Closed form — three samples, no search — and it reads the room's own
 * ring through {@link pointInRoomBox}, never the wall boolean union.
 *
 * Returns `true` when `+n` is the floor side — the side the number belongs on.
 */
function thicknessSideFlipped(a: Point, b: Point, n: Vec, t: number, rooms: readonly RoomBox[]): boolean {
  if (rooms.length === 0) return false;
  const reach = mul(n, t * 1.5); // half the wall, then one whole thickness clear of the face
  let plus = 0;
  let minus = 0;
  for (const f of [0.25, 0.5, 0.75]) {
    const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    if (rooms.some((r) => pointInRoomBox(add(p, reach), r))) plus++;
    if (rooms.some((r) => pointInRoomBox(sub(p, reach), r))) minus++;
  }
  return plus > minus;
}

/** An axis-aligned wall segment reduced to its drawn BAND: the rectangle the poché fills. */
function segmentBand(s: WallSegment): Bounds {
  const h = s.thickness / 2;
  const horiz = s.a.y === s.b.y;
  return {
    minX: Math.min(s.a.x, s.b.x) - (horiz ? 0 : h),
    maxX: Math.max(s.a.x, s.b.x) + (horiz ? 0 : h),
    minY: Math.min(s.a.y, s.b.y) - (horiz ? h : 0),
    maxY: Math.max(s.a.y, s.b.y) + (horiz ? h : 0),
  };
}

/**
 * WHERE along its wall a thickness call-out is taken: a station clear of every other wall
 * and, where the wall allows it, of the openings on it and the furniture beside it.
 *
 * The segment midpoint is the obvious station and the wrong one — on a shell it is very
 * often exactly where a partition tees in, which is the common case. The
 * number is written past the wall face, so a wall crossing there puts the digits straight
 * back into poché, this time somebody else's.
 *
 * Every wall band that comes within the number's reach of this segment's centreline blocks
 * the run it covers, widened by a cap height at each end so the digits clear it rather than
 * touch it. Two more things block a run the same way, each read from its own shape:
 *
 *  - every OPENING on this wall line (`openings`) — its extent along the wall is its centre
 *    ± half its width, from the opening model. The dimension's ticks would cross the jambs
 *    and its number would sit in the doorway or across the door's swing (which spans the
 *    same run);
 *  - every piece of FURNITURE, and every stair, lift or escalator, whose footprint reaches
 *    into the band the number occupies —
 *    from the wall face out to `reach`, on the side the number is written (`side`, the unit
 *    normal {@link thicknessSideFlipped} chose). The footprint is the polygon the element's
 *    own `bounds()` reports; its vertices are projected onto the wall axis for the run it
 *    blocks and onto the normal for the reach test, so a piece on the far side of the wall
 *    cannot collide with the number and blocks nothing.
 *
 * Walls and the rest are NOT equals: a number in poché is unreadable, a number in a doorway
 * is only untidy. So the station is chosen in tiers, each the midpoint of a widest free run
 * (closed form — sort the intervals once, take the maximum):
 *
 *  1. the widest run clear of WALLS, when that station is also clear of every opening and
 *     piece of furniture — so a call-out that collides with nothing never moves;
 *  2. otherwise the widest run clear of walls, openings and furniture;
 *  3. otherwise (nothing is clear of all three) the widest run clear of walls alone, which
 *     keeps the number out of poché at the cost of a doorway or a fixture;
 *  4. otherwise (walls cross the segment end to end) the segment midpoint — a call-out has
 *     to go somewhere.
 */
function thicknessStation(
  rep: { a: Point; b: Point; t: number },
  ir: ResolvedPlan,
  reach: number,
  pad: number,
  side: Vec,
  openings: readonly FacadeOpening[],
  registry: Registry,
): Point {
  const { lo, hi, mid, blocked, extra, at } = stationRuns(rep, ir, reach, pad, side, openings, registry);
  // Tier 1: the wall-clear station, kept when nothing else stands on it.
  const wallClear = widestFreeRun(lo, hi, blocked);
  if (wallClear === null) return mid; // tier 4 — no run is clear of walls, so none is clear of all
  if (!extra.some((e) => e.lo < wallClear && wallClear < e.hi)) return at(wallClear);
  // Tier 2: clear of everything; tier 3: clear of walls alone.
  const allClear = widestFreeRun(lo, hi, [...blocked, ...extra]);
  return at(allClear ?? wallClear);
}

/**
 * {@link thicknessStation}'s tiers 1 and 2 with everything else already drawn beside the wall as
 * blockers too (card AL5): a station clear of every crossing wall, opening, piece of furniture and
 * stair, and of every box in `boxes` (the labels, tags, bubbles, swings, symbols and other figures
 * {@link restationThickness} collects) that reaches into the band the number is written in, or
 * `null` when there is none. A box blocks the run it spans along the wall, widened by `pad` at
 * each end, as a piece of furniture does. Tiers 3 and 4 are not taken: a figure moved off a label
 * is never moved into poché, a doorway or a symbol instead.
 */
function clearStation(
  run: { a: Point; b: Point; t: number },
  ir: ResolvedPlan,
  reach: number,
  pad: number,
  side: Vec,
  openings: readonly FacadeOpening[],
  registry: Registry,
  boxes: readonly Box[],
): Point | null {
  const { horiz, lo, hi, blocked, extra, bandLo, bandHi, at } = stationRuns(
    run,
    ir,
    reach,
    pad,
    side,
    openings,
    registry,
  );
  for (const b of boxes) {
    const xLo = horiz ? b.minY : b.minX;
    const xHi = horiz ? b.maxY : b.maxX;
    if (xHi <= bandLo || xLo >= bandHi) continue;
    const aLo = (horiz ? b.minX : b.minY) - pad;
    const aHi = (horiz ? b.maxX : b.maxY) + pad;
    if (aHi <= lo || aLo >= hi) continue;
    extra.push({ lo: Math.max(lo, aLo), hi: Math.min(hi, aHi) });
  }
  const wallClear = widestFreeRun(lo, hi, blocked);
  if (wallClear === null) return null;
  if (!extra.some((e) => e.lo < wallClear && wallClear < e.hi)) return at(wallClear);
  const allClear = widestFreeRun(lo, hi, [...blocked, ...extra]);
  return allClear === null ? null : at(allClear);
}

/**
 * What a station along `rep` is chosen from ({@link thicknessStation}): the run `[lo, hi]` along
 * the wall, the parts of it crossing walls take (`blocked`) and the parts openings, furniture and
 * stairs take (`extra`), the band across the wall the number is written in, and the point at a
 * distance along the wall.
 */
function stationRuns(
  rep: { a: Point; b: Point; t: number },
  ir: ResolvedPlan,
  reach: number,
  pad: number,
  side: Vec,
  openings: readonly FacadeOpening[],
  registry: Registry,
): {
  horiz: boolean;
  lo: number;
  hi: number;
  mid: Point;
  blocked: { lo: number; hi: number }[];
  extra: { lo: number; hi: number }[];
  bandLo: number;
  bandHi: number;
  at: (v: number) => Point;
} {
  const horiz = rep.a.y === rep.b.y;
  const lo = horiz ? Math.min(rep.a.x, rep.b.x) : Math.min(rep.a.y, rep.b.y);
  const hi = horiz ? Math.max(rep.a.x, rep.b.x) : Math.max(rep.a.y, rep.b.y);
  const c = horiz ? rep.a.y : rep.a.x;
  const mid = { x: (rep.a.x + rep.b.x) / 2, y: (rep.a.y + rep.b.y) / 2 };

  const blocked: { lo: number; hi: number }[] = [];
  for (const w of ir.walls) {
    for (const s of segmentsOfWall(w)) {
      if (s.arc) continue;
      // Only a PERPENDICULAR wall can be escaped by moving along this one. A parallel
      // band (this segment's own, or a wall running beside it) covers the same run
      // wherever the station goes, so blocking on it would say nothing and could veto
      // every station on the wall.
      const sHoriz = s.a.y === s.b.y && s.a.x !== s.b.x;
      const sVert = s.a.x === s.b.x && s.a.y !== s.b.y;
      if (!(horiz ? sVert : sHoriz)) continue;
      const band = segmentBand(s);
      const crossLo = horiz ? band.minY : band.minX;
      const crossHi = horiz ? band.maxY : band.maxX;
      // Only a band the number could actually reach into counts.
      if (crossHi < c - reach || crossLo > c + reach) continue;
      const aLo = (horiz ? band.minX : band.minY) - pad;
      const aHi = (horiz ? band.maxX : band.maxY) + pad;
      if (aHi <= lo || aLo >= hi) continue;
      blocked.push({ lo: Math.max(lo, aLo), hi: Math.min(hi, aHi) });
    }
  }
  // Openings and furniture: the runs a doorway or a fixture takes.
  const extra: { lo: number; hi: number }[] = [];
  const block = (aLo: number, aHi: number): void => {
    if (aHi <= lo || aLo >= hi) return;
    extra.push({ lo: Math.max(lo, aLo), hi: Math.min(hi, aHi) });
  };
  const axis = horiz ? "h" : "v";
  for (const op of openings) {
    if (op.axis !== axis || op.line !== c) continue;
    block(op.along - op.width / 2 - pad, op.along + op.width / 2 + pad);
  }
  // The band across the wall the number is written in: from the face to its far end.
  const out = horiz ? side.y : side.x;
  const face = c + out * (rep.t / 2);
  const tip = c + out * reach;
  const bandLo = Math.min(face, tip);
  const bandHi = Math.max(face, tip);
  // The footprint is whatever this compile's registry says the element covers, so a plugin that
  // replaces the kind is honoured; a footprint with a non-finite vertex (a plugin piece
  // resolved without a position or size) is not a footprint and blocks nothing. A STAIR, lift
  // or escalator blocks the same way a piece of furniture does: its treads are drawn symbol
  // ink a number cannot be read over (plan-soundness PS2.12, `W_ANNOTATION_OVERLAP`; the
  // "300" printed over the townhouse stair on every storey was the case).
  for (const el of ir.elements) {
    if (el.kind !== "furniture" && !isVertical(el)) continue;
    const def = registry.byKind.get(el.kind);
    if (!def) continue;
    let aLo = Number.POSITIVE_INFINITY;
    let aHi = Number.NEGATIVE_INFINITY;
    let xLo = Number.POSITIVE_INFINITY;
    let xHi = Number.NEGATIVE_INFINITY;
    for (const p of def.bounds(el)) {
      const along = horiz ? p.x : p.y;
      const across = horiz ? p.y : p.x;
      aLo = Math.min(aLo, along);
      aHi = Math.max(aHi, along);
      xLo = Math.min(xLo, across);
      xHi = Math.max(xHi, across);
    }
    if (![aLo, aHi, xLo, xHi].every(Number.isFinite)) continue;
    if (xHi <= bandLo || xLo >= bandHi) continue;
    block(aLo - pad, aHi + pad);
  }

  const at = (v: number): Point => (horiz ? { x: v, y: c } : { x: c, y: v });
  return { horiz, lo, hi, mid, blocked, extra, bandLo, bandHi, at };
}

/**
 * The midpoint of the widest run of `[lo, hi]` left free by `blocked` (each interval already
 * clipped to the segment), or `null` when the intervals cover it end to end. Sorts a copy, so
 * the caller's list keeps its order; on equal widths the first run wins.
 */
function widestFreeRun(lo: number, hi: number, blocked: readonly { lo: number; hi: number }[]): number | null {
  const sorted = [...blocked].sort((p, q) => p.lo - q.lo || p.hi - q.hi);
  let bestLen = 0;
  let bestAt = 0;
  let cursor = lo;
  const consider = (from: number, to: number): void => {
    if (to - from > bestLen) {
      bestLen = to - from;
      bestAt = (from + to) / 2;
    }
  };
  for (const b of sorted) {
    consider(cursor, b.lo);
    cursor = Math.max(cursor, b.hi);
  }
  consider(cursor, hi);
  return bestLen > 0 ? bestAt : null;
}

/** One thickness call-out per distinct wall thickness (deduped so eight identical
 *  partitions show "100" once, not eight times). For each thickness, the longest
 *  axis-aligned segment carrying it is the representative — most room for a clean
 *  annotation, chosen deterministically (max length, then source order). The dim
 *  runs face-to-face across the wall with the measured thickness as its text; its zero
 *  offset keeps it on the wall, and because the number is far wider than the wall the
 *  dim element writes it past the far station (`outsideStations` in `elements/dim.ts`).
 *  That makes two derived positions, and both come from the shape rather than a box:
 *  {@link thicknessStation} picks WHERE along the wall (a run no other wall crosses and,
 *  where one exists, no opening or furniture footprint either) and
 *  {@link thicknessSideFlipped} picks WHICH SIDE (the one with floor under it, not the
 *  annotation band outside the building). Presentation only — never expands bounds
 *  meaningfully (faces sit ½-thickness off a centerline already inside the plan).
 *
 *  How each figure was placed is recorded in `thickness`, for card AL5's re-station
 *  ({@link restationThickness}), which runs once the room labels stand where they will. */
function synthWallDims(
  ir: ResolvedPlan,
  sizes: RenderSizes,
  dims: RDim[],
  registry: Registry,
  thickness: ThicknessFigure[],
): void {
  const repByThickness = new Map<number, ThicknessRun>();
  for (const w of ir.walls) {
    for (const s of segmentsOfWall(w)) {
      if (s.arc) continue; // a curve's thickness call-out would sit on its chord, not on it
      const d = sub(s.b, s.a);
      if (d.x !== 0 && d.y !== 0) continue; // orthogonal segments only
      const len = Math.hypot(d.x, d.y);
      if (len <= 0) continue;
      const prev = repByThickness.get(s.thickness);
      if (prev && prev.len >= len) continue;
      const dir = unit(d);
      repByThickness.set(s.thickness, {
        a: s.a,
        b: s.b,
        n: normal(dir),
        t: s.thickness,
        len,
        seg: s,
      });
    }
  }
  const rooms = ir.elements.filter((el): el is RRoom => el.kind === "room").map(roomBox);
  const openings = repByThickness.size > 0 ? facadeOpenings(ir) : [];
  const { mm } = sheetText(ir.sheetText?.entries);
  for (const t of [...repByThickness.keys()].sort((a, c) => a - c)) {
    const rep = repByThickness.get(t)!;
    // How far off the centreline the number reaches, and how tall it is — the same two
    // numbers `outsideStations` places it with, so the clear run asked for is the clear
    // run actually used.
    const text = mm(rep.t);
    const reach = rep.t / 2 + DIM_TEXT_GAP * sizes.dimFont + textWidth(text, sizes.dimFont);
    // The endpoints keep their historical order (which is what fixes the number's reading
    // direction); the SIDE the number is written on is `calloutFrom`, so a flip moves the
    // text and nothing else. It is decided first because the station avoids what stands on
    // that side.
    const onPlusSide = thicknessSideFlipped(rep.a, rep.b, rep.n, rep.t, rooms);
    const at = thicknessStation(rep, ir, reach, sizes.dimFont, onPlusSide ? rep.n : mul(rep.n, -1), openings, registry);
    const half = mul(rep.n, rep.t / 2);
    dims.push({
      ...mkDim(add(at, half), add(at, mul(half, -1)), 0, text),
      ...(onPlusSide ? { calloutFrom: true } : {}),
    });
    thickness.push({ rep, plus: onPlusSide, reach, text });
  }
}

/** One thickness figure as drawn before card AL5's re-station: how it was placed, its dimension, its node range. */
interface DrawnFigure {
  fig: ThicknessFigure;
  dm: RDim;
  from: number;
  to: number;
}

/** Something drawn that a re-stationed thickness figure must stand clear of: its extent, and the closed ring whose area counts. */
interface Ink {
  box: Box;
  ring: readonly Point[];
}

/**
 * Card AL5: move every wall-thickness figure printed over a room's name or area figure to a place
 * clear of everything already drawn there, or leave it out.
 *
 * Runs after the label passes, on the storey as drawn so far. A figure is moved only when it meets a
 * room's label by `W_ANNOTATION_OVERLAP`'s own test (the label's turned box covers more than
 * {@link COLLIDE_MIN} of the figure's); every other figure keeps its station and its bytes. A moved
 * figure's candidates, in order:
 *
 *  1. the same wall and side, the station tiers re-run with everything below as blockers
 *     ({@link clearStation});
 *  2. the next-longest straight run of that thickness ({@link nextLongestRun}), on its floor side;
 *  3. the other side of each, only where floor stands under the station (probed as
 *     {@link thicknessSideFlipped} probes), so never the band outside an exterior wall.
 *
 * A candidate is taken only when the figure there is clear of everything already drawn, by ONE
 * test: no text's turned box (a room's name or area figure, an opening tag, an axis bubble's
 * letter, a furniture label, another dimension's number) and no closed shape (a symbol, a tag's or
 * a bubble's ring, a window, a stair), no door leaf's swept sector and no wall band covers more
 * than {@link COLLIDE_MIN} of the figure's box; nor does any other thickness figure where it now
 * stands. Not counted, as the label passes do not count them: the floors, the poché (its bands are
 * counted), the roof outline, the ground, the lot line, a rug, and a line or an arc stroke, which
 * enclose no area. When no candidate is clear the figure is not drawn, and is returned in
 * `unplaced` for `W_DIM_THICKNESS_UNPLACED`.
 *
 * Bounded by a count, never time: the work left of the storey's label-fit count ({@link fitWork}
 * less what `fitLabels` spent), one unit per node, label or drawn thing read and per ring vertex
 * clipped, and per wall segment, opening and element a station search reads. It is charged before
 * the work it counts. Past it the pass stops where it stands: the figure in hand and every one after
 * it keep the stations they were drawn at, so a figure over a label is still drawn there (never
 * left out). `W_ANNOTATION_OVERLAP` reports such a figure only while its own count
 * (`MAX_ANNOTATION_WORK`) lasts; on a storey past that count too, as before this pass existed, it
 * is not reported (the rule files an `annotation-budget` skip instead).
 */
function restationThickness(
  ir: ResolvedPlan,
  sizes: RenderSizes,
  registry: Registry,
  nodes: readonly SceneNode[],
  drawn: readonly ElementNodes[],
  figures: readonly DrawnFigure[],
  budget: number,
): { dims: (RDim | null)[]; changed: boolean; unplaced: UnplacedThickness[] } {
  const out: (RDim | null)[] = figures.map((f) => f.dm);
  const unplaced: UnplacedThickness[] = [];
  let changed = false;
  let work = 0;
  /** Charge `n` units before the work they count; false once the count is spent. */
  const spend = (n: number): boolean => {
    work += n;
    return work <= budget;
  };
  const result = () => ({ dims: out, changed, unplaced });
  const { mm } = sheetText(ir.sheetText?.entries);
  const boxOfFigure = (dm: RDim): TextBox => textBox(dimTextPrim(dm, sizes, mm));

  // The room labels where the label passes left them: `W_ANNOTATION_OVERLAP`'s subjects.
  if (!spend(nodes.length + figures.length)) return result();
  const labels: { room: string; box: TextBox }[] = [];
  for (const { el, from, to } of drawn) {
    if (el.kind !== "room") continue;
    for (let i = from; i < to; i++) {
      const prim = nodes[i]!.prim;
      if (prim.t === "text") labels.push({ room: el.id, box: textBox(prim) });
    }
  }
  if (labels.length === 0) return result();
  const labelGrid = new GridIndex<number>(meanExtent(labels.map((l) => bboxOf(l.box.box))));
  for (let i = 0; i < labels.length; i++) labelGrid.insert(labels[i]!.box.box, i);
  const figBoxes: (TextBox | null)[] = figures.map((f) => boxOfFigure(f.dm));
  const over = (c: TextBox, ring: readonly Point[], box: Box): boolean =>
    boxesMeet(c.box, box) && clippedArea(ring, c.rect) > COLLIDE_MIN * c.area;

  let inks: GridIndex<Ink> | undefined;
  let rooms: RoomBox[] = [];
  let openings: readonly FacadeOpening[] = [];
  let stationCost = 0;
  for (let k = 0; k < figures.length; k++) {
    const f = figures[k]!;
    const at = figBoxes[k]!;
    // Which rooms' labels the figure is printed over, in drawing order.
    const near = labelGrid.queryBox(at.box);
    if (!spend(near.length * 5)) break;
    const met: string[] = [];
    for (const i of near.sort((p, q) => p - q)) {
      const l = labels[i]!;
      if (over(at, l.box.rect, l.box.box) && !met.includes(l.room)) met.push(l.room);
    }
    if (met.length === 0) continue;

    // Everything drawn so far that a figure must stay off, read once.
    if (!inks) {
      const own = new Uint8Array(nodes.length);
      for (const g of figures) own.fill(1, g.from, g.to);
      // A rug is floor finish, as the rule and the label passes read it.
      for (const { el, from, to } of drawn) if (el.kind === "furniture" && !isSymbolElement(el)) own.fill(1, from, to);
      const all: Ink[] = [];
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]!;
        if (own[i] || underLabels(n) || n.layerName === PROPERTY_LAYER) continue;
        if (n.prim.t === "text") {
          const tb = textBox(n.prim);
          all.push({ box: tb.box, ring: tb.rect });
        } else for (const ring of shapesOf(n.prim)) all.push({ box: extentOfRing(ring), ring });
      }
      for (const el of ir.elements) {
        if (el.kind !== "door") continue;
        for (const leaf of doorLeaves(el as RDoor)) {
          const ring = sectorOf(leaf);
          all.push({ box: extentOfRing(ring), ring });
        }
      }
      for (const b of wallBands(ir, 0)) {
        const ring = rectRing(b);
        all.push({ box: extentOfRing(ring), ring });
      }
      let vertices = 0;
      for (const ink of all) vertices += ink.ring.length;
      if (!spend(all.length + vertices)) break;
      inks = new GridIndex<Ink>(meanExtent(all.map((ink) => bboxOf(ink.box))));
      for (const ink of all) inks.insert(ink.box, ink);
      rooms = ir.elements.filter((el): el is RRoom => el.kind === "room").map(roomBox);
      openings = facadeOpenings(ir);
      let segments = 0;
      for (const w of ir.walls) segments += Math.max(0, w.points.length - 1) + (w.closed ? 1 : 0);
      stationCost = segments + openings.length + ir.elements.length;
    }
    const grid = inks;

    /** Is the figure at `c` clear of everything drawn and of every other figure? `null` once the count is spent. */
    const clearAt = (c: TextBox): boolean | null => {
      const under = grid.queryBox(c.box);
      if (!spend(under.length)) return null;
      for (const ink of under) {
        if (!boxesMeet(c.box, ink.box)) continue;
        if (!spend(ink.ring.length)) return null;
        if (over(c, ink.ring, ink.box)) return false;
      }
      for (let j = 0; j < figBoxes.length; j++) {
        const o = figBoxes[j];
        if (j === k || !o) continue;
        if (!spend(1)) return null;
        if (over(c, o.rect, o.box)) return false;
      }
      return true;
    };

    const rep = f.fig.rep;
    if (!spend(stationCost)) break;
    const second = nextLongestRun(ir, rep.seg);
    const runs = second ? [rep, second] : [rep];
    const sides = runs.map((r) => thicknessSideFlipped(r.a, r.b, r.n, r.t, rooms));
    const tries = [
      ...runs.map((r, i) => ({ r, plus: sides[i]!, floorSide: true })),
      ...runs.map((r, i) => ({ r, plus: !sides[i]!, floorSide: false })),
    ];
    let moved: RDim | undefined;
    let stopped = false;
    for (const { r, plus, floorSide } of tries) {
      const side = plus ? r.n : mul(r.n, -1);
      // What stands beside the run, within the number's reach either side of it.
      const region: Box = {
        minX: Math.min(r.a.x, r.b.x) - f.fig.reach,
        maxX: Math.max(r.a.x, r.b.x) + f.fig.reach,
        minY: Math.min(r.a.y, r.b.y) - f.fig.reach,
        maxY: Math.max(r.a.y, r.b.y) + f.fig.reach,
      };
      const beside = grid.queryBox(region);
      if (!spend(stationCost + beside.length + figBoxes.length + rooms.length)) {
        stopped = true;
        break;
      }
      const boxes: Box[] = beside.map((ink) => ink.box);
      for (let j = 0; j < figBoxes.length; j++) if (j !== k && figBoxes[j]) boxes.push(figBoxes[j]!.box);
      const station = clearStation(r, ir, f.fig.reach, sizes.dimFont, side, openings, registry, boxes);
      if (station === null) continue;
      // The other side only where it has floor, probed as `thicknessSideFlipped` probes it.
      if (!floorSide && !rooms.some((room) => pointInRoomBox(add(station, mul(side, r.t * 1.5)), room))) continue;
      const h = mul(r.n, r.t / 2);
      const cand: RDim = {
        ...mkDim(add(station, h), add(station, mul(h, -1)), 0, f.fig.text),
        ...(plus ? { calloutFrom: true } : {}),
      };
      const clear = clearAt(boxOfFigure(cand));
      if (clear === null) {
        stopped = true;
        break;
      }
      if (!clear) continue;
      moved = cand;
      break;
    }
    // Past the count: this figure and every one after it keep the stations they were drawn at.
    if (stopped) break;
    changed = true;
    if (moved) {
      out[k] = moved;
      figBoxes[k] = boxOfFigure(moved);
    } else {
      out[k] = null;
      figBoxes[k] = null;
      unplaced.push({ thickness: rep.t, run: rep.seg, second: second !== undefined, labelRooms: met });
    }
  }
  return result();
}

/** A box as the label passes' `BBox` (corner and size), for their grid sizing. */
const bboxOf = (b: Box): BBox => ({ x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY });

/** The extent of a ring. */
function extentOfRing(ring: readonly Point[]): Box {
  const b: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of ring) {
    b.minX = Math.min(b.minX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxX = Math.max(b.maxX, p.x);
    b.maxY = Math.max(b.maxY, p.y);
  }
  return b;
}

/**
 * The next-longest straight, axis-aligned run of `rep`'s thickness after `rep` itself (card AL5),
 * on the same terms {@link synthWallDims} picks `rep` by: max length, then source order. `undefined`
 * when the thickness has no other such run.
 */
function nextLongestRun(ir: ResolvedPlan, rep: WallSegment): ThicknessRun | undefined {
  let best: ThicknessRun | undefined;
  for (const w of ir.walls) {
    for (const s of segmentsOfWall(w)) {
      if (s.arc || s.thickness !== rep.thickness) continue;
      if (s.wallId === rep.wallId && s.index === rep.index) continue;
      const d = sub(s.b, s.a);
      if (d.x !== 0 && d.y !== 0) continue;
      const len = Math.hypot(d.x, d.y);
      if (len <= 0 || (best && best.len >= len)) continue;
      best = { a: s.a, b: s.b, n: normal(unit(d)), t: s.thickness, len, seg: s };
    }
  }
  return best;
}

/** Shared empty map for the non-annotate path — no allocation on the default compile. */
const EMPTY_LABELS: ReadonlyMap<string, string> = new Map();

/** Room id → its authored label, for the rooms that have one. Annotate mode only. */
function roomLabelIndex(ir: ResolvedPlan): ReadonlyMap<string, string> {
  const m = new Map<string, string>();
  for (const el of ir.elements) {
    if (el.kind !== "room") continue;
    const label = (el as RRoom).label;
    if (label !== undefined && label !== "") m.set(el.id, label);
  }
  return m;
}

/**
 * The element's human NAME for {@link SceneNode.elementLabel} — what a consumer should
 * call this thing when it cannot show the drawing.
 *
 * The authored `label` always wins, because it is the exact string the drawing itself
 * prints. Furniture and ground surfaces fall back to their `category` / `surface`: an
 * uncatalogued `furniture hammock …` draws no text at all (iron law — a catalogued
 * fixture symbol ignores its `label`), so the catalogue word is the only name the
 * compiler knows, and it is a truer answer than none. `data-arch-label` carries it
 * **verbatim**, the snake_case of the catalogue included, because that attribute answers
 * "what does the plan call this" and the catalogue spelling IS the answer.
 *
 * `derived` records which of the two it was, and exists for exactly one reader: the
 * composed `aria-label`, which is a SENTENCE read aloud and so capitalises a catalogue
 * word ("Furniture Bed") while leaving an authored one exactly as the author cased it. A
 * consumer that wants the raw word still has `data-arch-label`.
 *
 * A door, window or cased opening is named NOTHING. The language gives them no label,
 * so this returns `undefined` and the attribute is simply absent rather than invented.
 */
function elementLabelOf(el: ResolvedPlan["elements"][number]): { label: string; derived: boolean } | undefined {
  const authored = (el as { label?: unknown }).label;
  if (typeof authored === "string" && authored !== "") return { label: authored, derived: false };
  // Which field names an unlabelled element is a per-kind row of `KIND_FACETS.label`.
  const field = facetsOf(el.kind)?.label;
  switch (field) {
    case "category":
      return { label: (el as RFurniture).category, derived: true };
    case "surface":
      return { label: (el as ROutdoor).surface, derived: true };
    case null:
    case undefined:
      return undefined;
    default: {
      const unhandled: never = field;
      return unhandled;
    }
  }
}

/**
 * The plan's theme cascade below per-element `style` (`preStyle`) and the page theme with
 * `CompileOptions.theme` on top (`theme`, sanitized once). One function, so the drawing and
 * the pipeline's check of a `lineWeight` passed through the API read the same pen.
 */
export function planTheme(ir: ResolvedPlan, opts: CompileOptions, runtime: Runtime): { preStyle: Theme; theme: Theme } {
  const base = themeBaseLookup(ir.themeBase, runtime);
  const themeFromLayer = ir.themeFrom ? derivePoche(ir.themeFrom) : undefined;
  const preStyle = mergeTheme(DEFAULT_THEME, base, themeFromLayer, ir.theme);
  const theme = sanitizeTheme(mergeTheme(preStyle, opts.theme));
  return { preStyle, theme };
}

/**
 * Build the {@link Scene} for a resolved plan. The theme is merged + sanitized
 * once here and baked into node paint; it is also carried on the Scene for the
 * page chrome (north/scale/title). `opts.width` does not affect the Scene (it is
 * an SVG-only attribute) — only `opts.theme` participates.
 *
 * **`compile()` is the guarded entry point.** It refuses, before calling this, a plan whose
 * drawing is estimated past the drawing budget (`E_DRAWING_LIMIT`, `MAX_DRAW_UNITS`,
 * `src/draw-budget.ts`) and a `lineWeight` from the options whose pen leaves the modelling
 * range. This function applies neither: a caller who draws a resolved IR directly
 * (`toScene(resolve(ast).ir)`) takes that budget on, and 500 escalators at the tread cap
 * drawn this way make 1.1 million nodes and about 240 MB. Use `compile().scene`.
 *
 * One storey of a building, drawn alone, cannot know which stairs or lifts arrive on it, so its
 * `--overlay circulation` is walked as a storey no shaft reaches; `compile().pages` passes each
 * page the building's arriving runs (M.4), and is the page `describe()` measures.
 */
export function toScene(plan: ResolvedPlan, opts: CompileOptions = {}, runtime: Runtime = BUILTIN_RUNTIME): Scene {
  return drawScene(plan, opts, runtime, undefined);
}

/**
 * {@link toScene}, counting the drawing's geometric work into `work` when given (the joinery's
 * split candidates and the label places scored, `src/compile-work.ts`). An out-parameter only:
 * the Scene is the same with or without it. Read by `compileWork()` (`src/pipeline.ts`).
 *
 * @internal Not part of the package surface (`src/index.ts` does not export it).
 */
export function drawScene(
  plan: ResolvedPlan,
  opts: CompileOptions,
  runtime: Runtime,
  work: CompileWork | undefined,
  /** The runs this storey is reached by, for the circulation overlay alone (`compile()` reads
   *  them off the whole building when that overlay is asked for; M.4). Nothing else reads them. */
  arrivals: readonly ArrivingRun[] = [],
  /** An accessible page's `<desc>` on a plan of two or more storeys, which reads the whole
   *  building (`levelCaptions`, RM9.2); absent, the storey's own caption. */
  caption?: string,
): Scene {
  // One net-area total per storey drawn (U.22, `src/analyze/net-area-memo.ts`), fresh whoever
  // draws it: a Scene is a function of its storey alone, so the Scene memo `lint()` reads can
  // never hold a schedule other than the one a fresh drawing would.
  return withNetAreaBudget(() => drawStorey(plan, opts, runtime, work, arrivals, caption));
}

/** {@link drawScene} under its net-area total. */
function drawStorey(
  plan: ResolvedPlan,
  opts: CompileOptions,
  runtime: Runtime,
  work: CompileWork | undefined,
  arrivals: readonly ArrivingRun[],
  caption: string | undefined,
): Scene {
  // The storey as drawn (B3a): every wall, a `status demolish` one included, which is lowered in
  // a call of its own and drawn dashed (B3b). What the sheet MEASURES (the room schedule's net
  // area, the circulation overlay) reads `plan`, the plan after the demolition, as describe() does.
  const ir = drawnView(plan);
  const registry = runtime.registry;

  // Theme cascade (later wins): default → named base → plan `theme{}` overrides →
  // opt-in `theme from` poché → [per-element `style`] → CompileOptions.theme. The
  // `theme from` layer only exists when written, so existing plans are unaffected.
  // `preStyle` holds everything below `style`/`opts.theme`; sanitize is applied
  // exactly once per produced theme (no double-escaping), and `opts.theme` is the
  // last layer in BOTH paths so it always wins — even over a per-element style.
  const { preStyle, theme } = planTheme(ir, opts, runtime);
  const wording = sheetText(ir.sheetText?.entries);

  // Per-element styled themes (`style <kind> { … }`), each sanitized once. Absent
  // styles → every element reuses `theme` (identity) → byte-identical output.
  const styledByKind = new Map<string, Theme>();
  if (ir.styles) {
    for (const kind of Object.keys(ir.styles)) {
      styledByKind.set(kind, sanitizeTheme(mergeTheme(preStyle, ir.styles[kind], opts.theme)));
    }
  }

  const lw = theme.lineWeight;

  const b = planBounds(ir, registry);
  const drawW = b.maxX - b.minX;
  const drawH = b.maxY - b.minY;

  // Two RenderSizes constructors, one struct (so nothing below branches):
  //
  //  • No `paper` — the historical path. Every size is a fraction of the drawing's own
  //    reference dimension. Self-similar, and BYTE-IDENTICAL to every release before
  //    the sheet layer: this arithmetic must never change.
  //  • With `paper` — `sizesFromPaper` (src/sheet.ts): every size a fixed number of
  //    millimetres ON THE SHEET × the scale denominator, so a 100 m building gets the
  //    same 3.5 mm room label a 7 m one does. `refDim` becomes 100 mm of sheet × the
  //    denominator, which makes the `refDim * <fraction>` chrome/tick formulas
  //    downstream read as plain drafting millimetres with no second code path.
  //    (Both constructors are `renderSizes` in src/sheet.ts, which the resolver also reads to
  //    hold the drawn hatch tile and pen to the modelling range.)
  const sizes: RenderSizes = renderSizes(ir.sheet, drawW, drawH, lw);
  const refDim = sizes.refDim;

  // Collect non-wall elements (source order, underlays first among the furniture — see
  // `renderOrder`), then lower walls — the canonical op
  // order, so layer-bucketing in a backend reproduces the canonical draw order.
  // Each kind gets its styled theme when `style <kind>` applies, else the base ctx.
  // Will the wall lowering below actually void the wall solid at every opening? ALWAYS:
  // `lowerWallSet` cuts every opening on every host — straight, angled and curved alike —
  // so the floor runs continuously through each passage and only the capped jambs are
  // drawn. `RenderCtx.openingsVoided` stays, and stays true, because the interface is
  // append-only and a hand-built `RenderCtx` must keep its safe opaque default.
  // `floorAt` reads each room's own ring (`pointInRoomBox`), as `thicknessSideFlipped` does.
  // A `void` (a stair well, a double-height space) counts too: it has no floor on THIS
  // storey, but it is inside the building, so a window onto one does not look outside.
  const floorBoxes = ir.elements
    .filter((el): el is RRoom | RVoid => el.kind === "room" || el.kind === "void")
    .map(roomBox);
  const floorAt = (p: Point): boolean => floorBoxes.some((r) => pointInRoomBox(p, r));
  // The schedule measures the plan after the demolition (`plan`, B3b), so its NET AREA and
  // TOTAL are `describe().schedule`'s; with no demolished wall `plan` is `ir`'s very arrays.
  // Derived before the elements are drawn because `schedule rooms net` stamps its figure.
  const scheduleData =
    ir.schedule === "rooms"
      ? roomSchedule(
          plan.elements.filter((e): e is RRoom => e.kind === "room"),
          ir.zones,
          plan.walls,
        )
      : null;
  // A room whose net figure equals its centreline figure had nothing deducted (no wall on or in
  // it): ` net` would claim a deduction that did not happen, so it keeps the bare stamp.
  const netById =
    ir.scheduleNet && scheduleData
      ? new Map(scheduleData.rows.map((r) => [r.id, r.net_area_m2 === r.area_m2 ? undefined : r.net_area_m2]))
      : null;
  const baseCtx: RenderCtx = {
    theme,
    sizes,
    bounds: b,
    fmt: wording.mm,
    openingsVoided: true,
    floorAt,
    ...(netById ? { netAreaOf: (id: string) => netById.get(id) } : {}),
    ...(wording !== PLAIN_SHEET_TEXT ? { text: wording } : {}),
  };
  const ctxFor = (kind: string): RenderCtx => {
    const st = styledByKind.get(kind);
    return st ? { ...baseCtx, theme: st } : baseCtx;
  };
  const nodes: SceneNode[] = [];
  const outdoorEls = ir.elements.filter((e): e is ROutdoor => e.kind === "outdoor");
  // Which nodes each LABELLED AREA contributed, so the label post-pass at the end can
  // find its text without matching coordinates back to elements (two areas can share an
  // anchor). Rooms and `outdoor` surfaces: a terrace's name and area are
  // drawn exactly like a room's and want the same treatment, and the pass is written
  // against a ring + an anchor rather than against either element type.
  const labelGroups: LabelGroup[] = [];
  const drawnElements: ElementNodes[] = [];
  // The `dims auto` chains, kept apart: `drawnElements` is what the label fit reads, and a chain is
  // no element of the plan. Read only by `attachSceneParts`.
  const autoDims: ElementNodes[] = [];
  // Annotate-only lookups, built once. `roomLabels` answers "which room is this piece of
  // furniture in, and what is that room called" without a second scan per element;
  // `primaried` enforces the ONE-primary-per-id law across the whole scene rather than
  // per render group, so two groups that somehow share an id still yield one primary.
  const roomLabels = opts.annotate ? roomLabelIndex(ir) : EMPTY_LABELS;
  const primaried = new Set<string>();
  /** How many unnamed rooms have been seen, so the next one can be told from them. */
  let unnamedRooms = 0;
  for (const el of renderOrder(ir.elements)) {
    if (el.kind === "wall") continue;
    const def = registry.byKind.get(el.kind);
    if (!def) continue;
    const groupStart = nodes.length;
    // Only when `annotate` is requested (ADR 0007): carry the element's source
    // span onto every primitive it renders, so the SVG pass can map a drawn
    // element back to its source. Off by default → the Scene IR is byte-identical
    // to before. Purely metadata — never read by geometry/describe/lint. Walls are
    // unioned across statements, so their per-node span is ambiguous → left unset.
    const rendered = def.render(el, ctxFor(el.kind));
    if (opts.annotate) {
      const span = (el as { span?: SceneNode["span"] }).span;
      const named = elementLabelOf(el);
      const label = named?.label;
      // A room the plan never named gets a POSITION instead, so several of them are still
      // told apart by ear ("Room 1", "Room 2"). Dense and in element order, which is the
      // order the floor polygons reach the document. It is deliberately NOT written to
      // `data-arch-label`: that attribute is what the PLAN calls the element, and the plan
      // calls this one nothing — the ordinal is a naming device for the accessibility
      // tree, and `aria-label` is where naming devices belong.
      const ordinal = el.kind === "room" && label === undefined ? ++unnamedRooms : undefined;
      // The owning room's NAME, not its id — and only for furniture, which is the one
      // element a reader cannot place from its own name ("Bed" — which bed?).
      const roomLabel = el.kind === "furniture" ? roomLabels.get((el as RFurniture).room ?? "") : undefined;
      // The ONE interactive shape: the first primitive that is not TEXT. A room's floor
      // polygon comes first in its own render, a fixture's symbol outline likewise — and
      // a drawn name must never be the focusable node, because a label DESCRIBES a
      // control rather than being one.
      const primary = primaried.has(el.id) ? -1 : rendered.findIndex((n) => n.prim.t !== "text");
      if (primary >= 0) primaried.add(el.id);
      nodes.push(
        ...rendered.map((n, i) => ({
          ...n,
          elementId: el.id,
          elementKind: el.kind,
          span: n.span !== undefined ? n.span : span,
          ...(label !== undefined ? { elementLabel: label } : {}),
          ...(named?.derived ? { elementLabelDerived: true as const } : {}),
          ...(ordinal !== undefined ? { elementOrdinal: ordinal } : {}),
          ...(roomLabel !== undefined ? { elementRoomLabel: roomLabel } : {}),
          ...(i === primary ? { elementPrimary: true as const } : {}),
        })),
      );
    } else {
      for (const pushed of rendered) nodes.push(pushed);
    }
    drawnElements.push({ el, from: groupStart, to: nodes.length });
    // Pushed in ELEMENT order, so a plan with no ground produces exactly the group list
    // (and therefore the bytes) it would with no ground support at all.
    if (el.kind === "room") {
      const r = el as RRoom;
      labelGroups.push({
        ring: r.poly ?? rectRing({ x: r.at.x, y: r.at.y, w: r.size.w, h: r.size.h }),
        anchor: roomLabelAnchor(r),
        fixed: r.labelAt !== undefined,
        wrap: true,
        from: groupStart,
        to: nodes.length,
      });
    } else if (el.kind === "outdoor" && (el as ROutdoor).label !== undefined) {
      // Only a LABELLED surface: an unlabelled one draws no text, so it has nothing to
      // relocate and an empty group would only cost a scan. `outdoor` has no
      // `label … at (x,y)` clause, so it is never `fixed`.
      const o = el as ROutdoor;
      labelGroups.push({
        ring: outdoorRing(o),
        anchor: outdoorLabelAnchor(o),
        fixed: false,
        from: groupStart,
        to: nodes.length,
      });
    }
  }
  // TWO hatch lists, deliberately.
  //
  // `wallHatches` is what the wall lowering groups and orders its fills by, and it must
  // stay exactly `hatchesUsed(walls)` — feeding it ground materials no wall uses would
  // add empty groups to a pass whose node order is pinned by every visual golden.
  //
  // `hatches` is what the SCENE carries: the list the SVG backend emits one `<pattern>`
  // per, and the list the legend draws one row per. Ground materials must be in it, or
  // every ground fill is a DANGLING `url(#…)` — the reference present, the pattern never
  // emitted, the surface invisible in every viewer. That is the specific trap this
  // feature was warned about, and it is why the two lists are separate rather than one.
  //
  // A remodel (B3b) lowers its walls in TWO calls: the `status demolish` walls on their own,
  // with no hatches, as one dashed outline, then the standing walls exactly as the plan after the
  // demolition has them (`plan.walls`: their joints, faces and poché are the finished building's,
  // and a door the analysis re-hosted from a demolished wall onto a standing one is cut through
  // that one too). Both lists keep source order. Only the standing walls' materials enter either
  // hatch list: a demolished wall draws no poché. A plan with no demolished wall makes the one
  // call it always made.
  //
  // The dashed outline goes on the `wallFill` pass, ahead of the standing walls' poché: where a
  // demolished partition ran into a standing wall, its outline lies inside that wall's band, and
  // the poché painted over it is what stops the dashes at the standing wall's face. No pass is
  // added or reordered (D4); the node is simply drawn beneath the fabric that stays.
  const standing = ir.drawn ? plan.walls : ir.walls;
  const demolished = ir.drawn ? ir.walls.filter((w) => w.status === "demolish") : [];
  const wallHatches = hatchesUsed(standing);
  // `style wall { fill | hatch }` draws the walls' patterns in the walls' styled poché ink. A wall
  // pattern's id is never a ground's or a floor's (a floor of a wall material is `bare`, its own
  // id), so only the walls and their legend swatches move. A `style wall` that sets neither keeps
  // the drawing's poché ink, so no ink is attached and the scene and its bytes are unchanged.
  const wallTheme = styledByKind.get("wall");
  const wallInk =
    wallTheme && (wallTheme.pocheBase !== theme.pocheBase || wallTheme.pocheHatch !== theme.pocheHatch)
      ? { base: wallTheme.pocheBase, line: wallTheme.pocheHatch }
      : undefined;
  const hatches = hatchesUsed(
    standing,
    groundMaterialsUsed(outdoorEls),
    floorMaterialsUsed(ir.elements.filter((e): e is RRoom => e.kind === "room")),
    wallInk,
  );
  for (const pushed of lowerWallSet(demolished, [], ctxFor("wall"), "dashed", work)) {
    nodes.push({ ...pushed, layer: "wallFill" });
  }
  for (const pushed of lowerWallSet(standing, wallHatches, ctxFor("wall"), undefined, work)) nodes.push(pushed);

  // `dims auto …` — synthesize dimension strings (presentation only; never touches
  // the IR, bounds, describe() or lint()). Every chain sits OUTSIDE the building,
  // stepping outward from the wall faces; the page margins grow to contain them
  // through `dimReach` below.
  // How each wall-thickness figure was placed, for card AL5's re-station after the label passes.
  let thicknessLaid: ThicknessFigure[] = [];
  if (ir.autoDims) {
    const dimDef = registry.byKind.get("dim");
    if (dimDef) {
      const dimCtx = ctxFor("dim");
      const laid = synthDims(ir, sizes, runtime.registry);
      thicknessLaid = laid.thickness;
      for (const dm of laid.dims) {
        const from = nodes.length;
        for (const pushed of dimDef.render(dm, dimCtx)) nodes.push(pushed);
        autoDims.push({ el: dm, from, to: nodes.length });
      }
    }
  }

  // Positioning axes (定位轴线) — the author-declared datum grid. Emitted AFTER the dims
  // so the bubbles can be placed outside whatever dimension chains exist on each side
  // (measured on the `dims` pass alone — the axis nodes we are about to add must not
  // push themselves further out). `layoutChrome` below then sees both bands, so the page
  // grows to contain the bubbles. No `axes` block → nothing emitted, output unchanged.
  if (ir.axes && ir.axes.length > 0) {
    nodes.push(...axesNodes(ir.axes, b, sizes, theme, dimReach(b, nodes, ["dims"])));
  }

  // The lot line, after the axes so the two datum conventions read in a stable
  // order and before the label pass so a boundary can never move a room name (the pass
  // skips `C-PROP` outright — see `label-placement.ts`). Nothing is emitted for a plan
  // with no `boundary`, so every existing drawing is byte-identical.
  if (ir.siteBoundary) nodes.push(...siteBoundaryNodes(ir.siteBoundary, theme, sizes));

  // `schedule openings` — a tag beside every door and window (`opening-schedule.ts`), placed
  // from each opening's own wall. Before the label pass, so a room name moves off a tag
  // rather than sitting on it — except a name pinned with `label … at`, which never moves,
  // so the tags keep off it instead. Nothing is emitted without the opt-in.
  if (ir.openingSchedule)
    nodes.push(
      ...openingTagNodes(
        ir.elements,
        theme,
        sizes,
        nodes,
        (e) => runtime.registry.byKind.get(e.kind)?.yieldsWalls?.(e),
        pinnedLabelNodes(nodes, labelGroups),
      ),
    );

  // Obstacle-aware area labels (`src/label-placement.ts`). It has to run HERE — after the
  // walls are lowered and after `dims auto` has emitted its numbers — because a dimension
  // value is not an element and no element could ever see one. Purely a translation of
  // already-emitted `labels` text: it adds no node, removes none, and only moves a label
  // whose box is genuinely buried, so a plan whose labels are already clear keeps its
  // exact previous bytes. It runs before the sheet tables and the opt-in overlays, so
  // neither can influence where a label lands.
  //
  // First, a room name too wide for its room on one line is wrapped onto several, when a
  // wrapped form fits (`wrapLabels`) — so the relocation below moves, and steers every later
  // label around, the block as it is actually drawn. A name that fits is not touched.
  //
  // Then a room's label the two could not clear shrinks (`fitLabels`), which changes the
  // lettering of that label alone, so it is measured after every other label has landed. It
  // reads the storey after the demolition, as `W_ANNOTATION_OVERLAP` does.
  wrapLabels(nodes, labelGroups, ir, sizes);
  relocateLabels(nodes, labelGroups, ir, sizes, work);
  const fitSpent = fitLabels(nodes, labelGroups, drawnElements, plan, sizes);

  // A wall-thickness figure `dims auto` wrote over a room's name or area figure, as the labels
  // finally stand, moves to a place clear of everything drawn so far, or is not drawn (card AL5,
  // `restationThickness`), on what is left of the label passes' count. Only when one moved or was
  // left out are the thickness figures' nodes drawn again, so every other plan keeps its bytes.
  // They are the last dimensions drawn, so their nodes are one run at the end of `autoDims`, one
  // entry per thickness. What it decided is kept beside the Scene (`drawnAutoDims`) for the lint.
  let unplacedThickness: UnplacedThickness[] = [];
  const firstFigure = autoDims.length - thicknessLaid.length;
  const dimDef = registry.byKind.get("dim");
  if (thicknessLaid.length > 0 && firstFigure >= 0 && dimDef) {
    const figures = thicknessLaid.map((fig, i): DrawnFigure => {
      const e = autoDims[firstFigure + i]!;
      return { fig, dm: e.el as RDim, from: e.from, to: e.to };
    });
    const placed = restationThickness(
      ir,
      sizes,
      runtime.registry,
      nodes,
      drawnElements,
      figures,
      fitWork(plan) - fitSpent,
    );
    if (placed.changed) {
      const dimCtx = ctxFor("dim");
      const from = figures[0]!.from;
      const to = figures[figures.length - 1]!.to;
      const redrawn: SceneNode[] = [];
      const entries: ElementNodes[] = [];
      for (const dm of placed.dims) {
        if (!dm) continue;
        const at = from + redrawn.length;
        for (const pushed of dimDef.render(dm, dimCtx)) redrawn.push(pushed);
        entries.push({ el: dm, from: at, to: from + redrawn.length });
      }
      nodes.splice(from, to - from, ...redrawn);
      autoDims.splice(firstFigure, autoDims.length - firstFigure, ...entries);
      unplacedThickness = placed.unplaced;
    }
  }

  // Opt-in sheet tables (`schedule rooms` / `legend`) — derived closed-form from the plan
  // (see `sheet-tables.ts`). Computed before chrome layout because the table heights are
  // what grow the bottom margin; a plan that opts into neither passes null and every
  // margin below reduces to the previous arithmetic, so its bytes are unchanged.
  // (`scheduleData` itself is derived above, before the elements are drawn.)
  const legendData = ir.legend
    ? legendEntries(
        hatches,
        ir.elements.filter((e): e is RFurniture => e.kind === "furniture"),
        demolished.length > 0,
        ir.elements,
        wording,
      )
    : null;

  // Page chrome (scale bar + title block) sits below the dimension band; the page
  // margins grow per-side so neither the chrome nor any dimension clips (shared with
  // the SVG/PDF backends via the one layoutChrome source).
  let chrome = layoutChrome({
    bounds: b,
    refDim,
    baseMargin: sizes.margin,
    nodes,
    title: ir.title,
    scale: ir.scale,
    schedule: scheduleData,
    legend: legendData,
    ...(ir.openingSchedule ? { openings: openingRows(ir.elements, wording) } : {}),
    ...(ir.notes ? { notes: ir.notes } : {}),
    ...(wording !== PLAIN_SHEET_TEXT ? { text: wording } : {}),
    ...(ir.hide ? { hide: ir.hide } : {}),
    // Multi-storey: stamp the page with its storey, so a drawing SET is readable (a plan
    // with no `level` block passes nothing and its chrome is byte-identical).
    ...(ir.level !== undefined
      ? { level: { level: ir.level, ...(ir.levelName !== undefined ? { name: ir.levelName } : {}) } }
      : {}),
  });
  let m = chrome.margin;

  // The page. Without a sheet it is the content box (drawing + grown margins) — the
  // historical page, byte-for-byte. With a sheet it is the PAPER (paper mm × the scale
  // denominator) and the content box is centred on it; if the laid-out content is
  // bigger than the sheet (an authored scale we warned about with `W_SCALE_OVERFLOW`)
  // the page grows to contain it, so a drawing is never clipped to make a sheet fit.
  let content = { x: b.minX - m.left, y: b.minY - m.top, w: drawW + m.left + m.right, h: drawH + m.top + m.bottom };
  let sheet: SceneSheet | undefined;
  if (ir.sheet) {
    const pageW = Math.max(ir.sheet.widthMm * ir.sheet.denom, content.w);
    const pageH = Math.max(ir.sheet.heightMm * ir.sheet.denom, content.h);
    const page = {
      x: content.x + (content.w - pageW) / 2,
      y: content.y + (content.h - pageH) / 2,
      w: pageW,
      h: pageH,
    };
    const grown = pageW > ir.sheet.widthMm * ir.sheet.denom || pageH > ir.sheet.heightMm * ir.sheet.denom;
    sheet = { ...ir.sheet, page, grown };
    // On a sheet the bottom chrome belongs in the sheet's corners, not beside the plan —
    // but only when the corner band is provably clear of the drawing (see the helper).
    chrome = anchorChromeToSheet(chrome, page, sizes.margin, content.y + content.h, refDim);
  }

  // The sheet tables are ordinary `annotations`-pass primitives, so every backend that
  // walks RENDER_PASSES draws them from this one lowering (unlike the title block, whose
  // geometry each backend still redraws). Lowered AFTER any sheet re-anchoring above, so
  // they are drawn wherever the final chrome layout put them; like the overlays below,
  // they are outside the dimension reach and shift nothing.
  if (chrome.tables) {
    // A legend swatch's tint is read with the theme its element is drawn with (`SwatchThemes`).
    const swatchThemes = { room: ctxFor("room").theme, outdoor: ctxFor("outdoor").theme };
    for (const pushed of sheetTableNodes(chrome.tables, theme, sizes, wording, swatchThemes)) nodes.push(pushed);
  }

  // The north arrow (card AL1): its historical spot when that is clear of the dimension and
  // axis bands, else a clear spot beyond them (`northArrowBox`). Placed once the page is
  // known and everything but the opt-in overlays is drawn, so it keeps off all of it and an
  // overlay never moves it. Off a sheet, and only when no spot has room, the top and right
  // margins grow for it, so the content box is re-taken; a sheet's page never grows.
  if (!ir.hide?.north) {
    const placed = northArrowBox({
      bounds: b,
      refDim,
      baseMargin: sizes.margin,
      nodes,
      deg: northBearingDeg(ir.north),
      word: wording.has("north") ? wording.word("north") : "N",
      page: sheet ? sheet.page : content,
      margin: m,
      sheet: sheet !== undefined,
      chrome,
    });
    // Recorded only when the arrow stands somewhere else than it always stood: one left there
    // (its spot clear, or a sheet with no room elsewhere) keeps its Scene's bytes too, and the
    // backends draw an absent `north` at `historicalNorth`.
    const was = historicalNorth(b, sizes.margin, refDim);
    if (placed.north.cx !== was.cx || placed.north.cy !== was.cy)
      chrome = { ...chrome, margin: placed.margin, north: placed.north };
    if (placed.margin !== m) {
      m = placed.margin;
      content = { x: b.minX - m.left, y: b.minY - m.top, w: drawW + m.left + m.right, h: drawH + m.top + m.bottom };
    }
  }

  // Opt-in diagnostic overlays (ADR 0008): appended AFTER all nodes and after chrome
  // layout, so the default Scene (no overlays) is byte-identical and the overlay never
  // shifts the page or chrome. Off by default — never on the shipped-SVG path.
  if (opts.overlays?.includes("circulation")) {
    // The walks describe() measures: the plan after the demolition (B3b).
    for (const pushed of circulationOverlayNodes(plan, theme, sizes, arrivals)) nodes.push(pushed);
  }

  const scene: Scene = {
    width: sheet ? sheet.page.w : content.w,
    height: sheet ? sheet.page.h : content.h,
    bounds: b,
    nodes,
    theme,
    sizes,
    north: ir.north,
    ...(wording.has("north") ? { northLabel: wording.word("north") } : {}),
    ...(ir.hide?.north ? { northHidden: true as const } : {}),
    scale: ir.scale,
    title: ir.title,
    name: ir.name,
    hatches,
    chrome,
    ...(sheet ? { sheet } : {}),
    // Opt-in accessibility metadata (ADR 0007 pattern): carry the accessible
    // <title>/<desc> text onto the Scene only when asked, so the SVG backend can emit
    // them. An explicit `accTitle`/`accDescr` (plan-level keywords) overrides the
    // derived pair — the plan name for the title, the deterministic describe() caption
    // for the desc. Off by default → the Scene is byte-identical. Never read by geometry.
    ...(opts.accessible ? { name: ir.accTitle ?? ir.name, caption: ir.accDescr ?? caption ?? captionForPlan(ir) } : {}),
  };
  // Export metadata for the DXF wall-layer split (`Scene.walls`): the walls each lowering call
  // above was handed, in its order (the standing walls, then the demolished ones), projected
  // lazily. No backend draws it.
  attachSceneWalls(scene, demolished.length > 0 ? [...standing, ...demolished] : ir.walls);
  attachSceneParts(scene, drawnElements, autoDims, registry);
  DRAWN_AUTO_DIMS.set(scene, { dims: autoDims.map((e) => e.el as RDim), unplaced: unplacedThickness });
  return scene;
}

/**
 * {@link Scene.parts}, projected lazily from the node ranges the drawing already recorded, and
 * non-enumerable, so the Scene as data is the Scene it always was. No element's nodes are touched:
 * a part only says which of them belong together.
 */
function attachSceneParts(
  scene: Scene,
  drawn: readonly ElementNodes[],
  autoDims: readonly ElementNodes[],
  registry: Registry,
): void {
  let parts: ScenePart[] | undefined;
  Object.defineProperty(scene, "parts", {
    enumerable: false,
    configurable: true,
    get(): ScenePart[] {
      parts ??= [...drawn, ...autoDims].flatMap(({ el, from, to }) => {
        const part = to > from ? registry.byKind.get(el.kind)?.cadPart?.(el) : undefined;
        return part ? [{ ...part, from, to }] : [];
      });
      return parts;
    },
  });
}

/** The text nodes of every room label pinned with `label "…" at (x,y)` — the names the label pass never moves. */
function pinnedLabelNodes(nodes: readonly SceneNode[], groups: readonly LabelGroup[]): Set<SceneNode> {
  const out = new Set<SceneNode>();
  for (const g of groups) {
    if (!g.fixed) continue;
    for (let i = g.from; i < g.to; i++) if (nodes[i]!.layer === "labels") out.add(nodes[i]!);
  }
  return out;
}
