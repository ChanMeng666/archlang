/**
 * A room's label that does not fit shrinks: a **post-pass over the lowered Scene**, after
 * `wrapLabels` and `relocateLabels` (`src/label-placement.ts`) have done what they can at the
 * drawing's label size (#367).
 *
 * ### What "does not fit" means
 *
 * What `W_ANNOTATION_OVERLAP` reads: the name or the area figure stands more than
 * {@link COLLIDE_MIN} of its own box over a wall, over the area a door's leaf sweeps or off its
 * own floor, at the width it can draw ({@link inkExtent}); or over a furniture, fixture or stair
 * symbol's drawn shapes, at the rule's generous width ({@link textExtent}). A label that passes is
 * not touched, so a plan with nothing to report keeps its bytes; `test/label-fit.test.ts` holds
 * that over the corpus and the plans the soundness audits wrote. A rug is floor finish and a piece's own label is text, not ink, as they
 * are to the rule.
 *
 * Walls are read here as their bands, not the poché the rule clips: a band is a box, so it costs
 * no clip, and it differs from the poché only across an opening's gap and at a mitre's tip.
 *
 * ### The heights
 *
 * {@link labelHeights}: from the room-name size down to the furniture-label size in equal steps,
 * 3.5, 3, 2.5 and 2 mm on a sheet. The floor is `SHEET_MM.furnLabel`: the smallest lettering the
 * sheet already draws, so a shrunk name is never set smaller than the text on a piece beside it,
 * and it is the 2.0 mm the issue asked for. It is this drawing's own rule, no standard's minimum.
 *
 * A height on the sheet needs a sheet. With `paper` the denominator is always known, written or
 * chosen to fit, and `sizes` already holds `sheet mm × denominator`. Without `paper` there is no
 * millimetre of lettering to speak of: `sizes` are fractions of the drawing's reference dimension,
 * and the same two rungs of that table bound the steps, so the name stops where that drawing
 * letters its furniture.
 *
 * Fixed steps rather than the exact size that would just fit: a sheet carries a handful of text
 * heights, and a small edit to a room must not change its lettering unless it crosses a step.
 *
 * ### The search
 *
 * At each height, largest first, the name's wrapped forms and then its one line are tried at the
 * places `relocateLabels` tries, from the room's anchor out; the first form with a clear place
 * wins, at its best place. A form that also keeps `relocateLabels`' clearance from the walls at the
 * height tried beats one that does not, so a label that shrinks does not end up touching one. A
 * wrapped form comes first because a name that reached this pass did not
 * fit on one line. Breaking stays {@link balancedLines}'s: only at a space, by a count of
 * characters, so the same name breaks the same way on every run and no word is ever split or
 * hyphenated. The full size is tried for wrapped forms too: `wrapLabels` asks for clearance from
 * the walls at the generous width, and leaves `Abstell- raum` on one line for want of 1.25 mm.
 *
 * Which labels do not fit is read first, from the fabric alone. A label that does not fit then
 * claims no floor until its turn comes, so a neighbour never dodges a box that is about to shrink,
 * and the turns go by the room's anchor. So this pass is order-free GIVEN what `relocateLabels` left,
 * and that pass is not: it visits in element order, and the rooms of
 * `test/plans/plan-soundness/audits/first-contact-plans/6-clinic.arch`, written the other way
 * round, settle differently before this pass sees them. A place is ranked off the lattice, never by a
 * measured distance, so an edit too small to matter cannot flip a label across its room.
 *
 * When no height clears it, the form that leaves the least of the label buried is drawn, and an
 * exact tie keeps the larger height, so a label wholly on a symbol keeps its size. What is left is
 * `W_ANNOTATION_OVERLAP`'s to report: it reads this Scene. A label is never moved further off its
 * floor than it stands.
 *
 * Text is never mirrored, so a mirrored `place` can choose a different form or place from its twin:
 * the lattice and the words are not symmetric the way the rooms are.
 *
 * A pinned `label … at (x,y)` is the author's decision and an `outdoor` surface's label is not
 * reported by the rule, so neither shrinks, and neither does a room with no name.
 *
 * ### Bounds
 *
 * Outside the evaluator, so the step meter is not charged. The work is a count over the whole plan,
 * {@link MAX_FIT_WORK}, shared out by storey ({@link fitWork}): one unit per mark visited, one per
 * vertex clipped or read off a ring. Past it the pass stops where it stands and the labels after
 * it keep their size: a count, so that is the same on every machine. The rule reports those labels
 * unless its own count (`MAX_ANNOTATION_WORK`) stands down first, as it does on a pile of symbols,
 * and then it files `annotation-budget` instead of a report for each.
 * A label too big for its room's whole extent costs a handful of reads, not a search.
 */

import type { Point } from "./ast.js";
import { doorLeaves, type DoorSwing } from "./geometry.js";
import { GridIndex, type GridBox } from "./geometry/grid-index.js";
import { clippedArea, pointInPolygon, polygonBounds, rectAreaOutside, rectRing } from "./geometry/polygon.js";
import type { BBox } from "./geometry/rect.js";
import type { RDoor, ResolvedElement, ResolvedPlan, RFurniture } from "./ir.js";
import { isUnderlay } from "./fixtures-catalog.js";
import {
  CLEARANCE,
  COLLIDE_MIN,
  FRACTIONS,
  type LabelGroup,
  meanExtent,
  overlapArea,
  primBBox,
  underLabels,
  W_DISTANCE,
  WRAP_TRIES,
  wallBands,
} from "./label-placement.js";
import type { RenderSizes, SceneNode, ScenePrim } from "./scene.js";
import {
  balancedLines,
  inkExtent,
  LABEL_AREA_DROP,
  LABEL_LINE_PITCH,
  LABEL_NAME_RISE,
  textExtent,
} from "./text-layout.js";
import { isVertical } from "./vertical.js";

type TextPrim = Extract<ScenePrim, { t: "text" }>;

/** Chords per curved path edge or circle quarter: enough that a WC bowl's area is within a
 *  percent of the true curve, which is far inside the 2 % trigger. */
const ARC_STEPS = 8;

/** Steps from the room-name size down to the furniture-label size. */
const HEIGHT_STEPS = 3;

/**
 * The counted work of the pass over a whole plan: marks visited plus vertices clipped or read off
 * a ring, under a second at the worst measured (a pile of symbols, every label searched to the end).
 * A flat that has a dozen labels to search spends well under one per cent of it.
 */
export const MAX_FIT_WORK = 8_000_000;

/** A storey's share of {@link MAX_FIT_WORK}. Each storey is drawn on its own, so a count per
 *  storey would multiply with the `level` blocks a plan can write; a share cannot. */
export const fitWork = (plan: ResolvedPlan): number => MAX_FIT_WORK / (plan._storeyCount ?? 1);

/** Score weight per unit of a label buried, against the distance preference (`W_DISTANCE`). */
const W_BURIED = 250;

/** How finely a place's burial is told apart, in parts of its own area: far past what a reader sees. */
const BURIED_STEPS = 1_000_000;

/** Score between the tiers of a place: past any score a place of the tier before can reach. */
const W_TIER = 1_000_000;

/** Kinds whose drawn shapes are symbols a number or a name must not sit on. */
export const isSymbolElement = (el: ResolvedElement): boolean =>
  (el.kind === "furniture" && !isUnderlay((el as RFurniture).category)) || isVertical(el);

/**
 * The heights a label steps through, largest first: the drawing's own name and area sizes, then
 * the steps down to the furniture-label size. The area figure stays at its size until the name
 * reaches it, and no further: it never stands larger than the name.
 */
export function labelHeights(sizes: RenderSizes): { name: number; area: number }[] {
  const { roomFont, furnFont, areaFont } = sizes;
  const out = [{ name: roomFont, area: areaFont }];
  for (let i = 1; i <= HEIGHT_STEPS; i++) {
    const name = i === HEIGHT_STEPS ? furnFont : roomFont - ((roomFont - furnFont) * i) / HEIGHT_STEPS;
    out.push({ name, area: Math.min(areaFont, name) });
  }
  return out;
}

/** The quarter-disc a door leaf sweeps, hinge first, its arc walked in {@link ARC_STEPS} chords. */
export function sectorOf(s: DoorSwing): Point[] {
  const a0 = Math.atan2(s.farJamb.y - s.hinge.y, s.farJamb.x - s.hinge.x);
  let d = Math.atan2(s.leafEnd.y - s.hinge.y, s.leafEnd.x - s.hinge.x) - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const ring: Point[] = [s.hinge];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const a = a0 + (d * i) / ARC_STEPS;
    ring.push({ x: s.hinge.x + s.radius * Math.cos(a), y: s.hinge.y + s.radius * Math.sin(a) });
  }
  return ring;
}

/** The closed shapes a drawn primitive covers; none for a stroke, a text or a hatch. */
export function shapesOf(prim: ScenePrim): Point[][] {
  switch (prim.t) {
    case "polygon":
      return prim.pts.length >= 3 ? [prim.pts] : [];
    case "region":
      return prim.loops.filter((l) => l.length >= 3);
    case "circle": {
      const n = 4 * ARC_STEPS;
      const ring: Point[] = [];
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        ring.push({ x: prim.center.x + prim.r * Math.cos(a), y: prim.center.y + prim.r * Math.sin(a) });
      }
      return [ring];
    }
    case "path":
      return prim.loops
        .map((lp) => {
          const ring: Point[] = [lp.start];
          let from = lp.start;
          for (const e of lp.edges) {
            if (e.t === "arc") {
              // A path arc is a MINOR arc by the primitive's contract: walk the short way round.
              const a0 = Math.atan2(from.y - e.center.y, from.x - e.center.x);
              let d = Math.atan2(e.to.y - e.center.y, e.to.x - e.center.x) - a0;
              while (d > Math.PI) d -= 2 * Math.PI;
              while (d < -Math.PI) d += 2 * Math.PI;
              for (let i = 1; i < ARC_STEPS; i++) {
                const a = a0 + (d * i) / ARC_STEPS;
                ring.push({ x: e.center.x + e.r * Math.cos(a), y: e.center.y + e.r * Math.sin(a) });
              }
            }
            ring.push(e.to);
            from = e.to;
          }
          return ring;
        })
        .filter((r) => r.length >= 3);
    default:
      return [];
  }
}

/** One thing on the sheet a label is measured against. */
interface Mark {
  /** A `swing` or `symbol` counts by the largest of its `shapes`, the others by their box. */
  kind: "wall" | "swing" | "symbol" | "text";
  box: BBox;
  shapes: Point[][];
  /** The group whose label this is, or -1. */
  owner: number;
  /** A label's box from before that label was shrunk. */
  stale: boolean;
  /** The last read that visited it (the grid returns an item once per cell). */
  seen: number;
}

/** What one text stands on, each as a fraction of its box. */
interface Reading {
  /** Off the room's own floor. */
  off: number;
  /** The largest of the wall, swing, symbol and floor shares: what the rule reports on. */
  fabric: number;
  /** {@link fabric} with the walls read at the clearance a place should keep. */
  roomy: number;
  /** Over other text: another label, a `dims auto` number, a tag. */
  text: number;
  /** All of it added up, for ranking, with the walls read at the clearance a place should keep. */
  total: number;
}

/** A way of drawing a label: its two texts, sized, broken and placed. */
interface Form {
  name: TextPrim;
  area: TextPrim;
}

/** A text's box twice, as the rule reads it: {@link inkExtent} for the walls, swings and floor,
 *  the generous {@link textExtent} for a symbol. */
interface TextBoxes {
  ink: BBox;
  estimate: BBox;
}

const boxOf = (b: BBox): GridBox => ({ minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h });

const centred = ({ w, h }: { w: number; h: number }, at: Point): BBox => ({
  x: at.x - w / 2,
  y: at.y - h / 2,
  w,
  h,
});

/** Where a text's boxes stand with its anchor at `at` (a room's text is never turned). */
function boxesOf(prim: TextPrim, at: Point): TextBoxes {
  return { ink: centred(inkExtent(prim), at), estimate: centred(textExtent(prim), at) };
}

const shifted = (b: BBox, at: Point): BBox => ({ x: at.x + b.x, y: at.y + b.y, w: b.w, h: b.h });

const moved = (t: TextBoxes, at: Point): TextBoxes => ({ ink: shifted(t.ink, at), estimate: shifted(t.estimate, at) });

/** One element's nodes in the Scene's node list. `toScene` records them while it lowers the
 *  elements: a node names its element only under `annotate`, and the drawing must not depend on that. */
export interface ElementNodes {
  el: ResolvedElement;
  from: number;
  to: number;
}

/** Every drawn thing the labels are read against. */
function marksOf(
  nodes: readonly SceneNode[],
  groups: readonly LabelGroup[],
  drawn: readonly ElementNodes[],
  plan: ResolvedPlan,
): Mark[] {
  const mark = (kind: Mark["kind"], box: BBox, shapes: Point[][] = [], owner = -1): Mark => ({
    kind,
    box,
    shapes,
    owner,
    stale: false,
    seen: 0,
  });
  const marks = wallBands(plan, 0).map((b) => mark("wall", b));
  for (const el of plan.elements) {
    if (el.kind !== "door") continue;
    for (const leaf of doorLeaves(el as RDoor)) {
      const ring = sectorOf(leaf);
      marks.push(mark("swing", extentOf([ring]), [ring]));
    }
  }
  // Nodes measured some other way, or not at all, so not by their box below.
  const measured = new Uint8Array(nodes.length);
  for (let g = 0; g < groups.length; g++) {
    for (let i = groups[g]!.from; i < groups[g]!.to; i++) {
      measured[i] = 1;
      const n = nodes[i]!;
      const b = n.layer === "labels" && n.prim.t === "text" ? primBBox(n.prim) : null;
      if (b) marks.push(mark("text", b, [], g));
    }
  }
  for (const { el, from, to } of drawn) {
    if (el.kind === "door" || el.kind === "furniture") measured.fill(1, from, to);
    if (!isSymbolElement(el)) continue;
    measured.fill(1, from, to);
    const shapes: Point[][] = [];
    for (let i = from; i < to; i++) shapes.push(...shapesOf(nodes[i]!.prim));
    if (shapes.length > 0) marks.push(mark("symbol", extentOf(shapes), shapes));
  }
  for (let i = 0; i < nodes.length; i++) {
    if (measured[i] || underLabels(nodes[i]!)) continue;
    const b = primBBox(nodes[i]!.prim);
    if (b) marks.push(mark("text", b));
  }
  return marks;
}

/** The joint extent of some rings. */
function extentOf(shapes: readonly Point[][]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const sh of shapes) {
    for (const p of sh) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** A candidate and how far from the anchor it ranks. */
interface Place {
  p: Point;
  rank: number;
}

/** A lattice fraction's distance from the middle of the box, in hundredths of the box: 50 - 35 is 15. */
const offCentre = (f: number): number => Math.abs(Math.round(f * 100) - 50);

/** The rank of the lattice's far corner, {@link Place.rank}'s largest. */
const LAST_RANK = 2 * offCentre(FRACTIONS[FRACTIONS.length - 1]!) ** 2;

/**
 * The candidates a label tries, nearest its anchor first: the anchor, then the relocation's lattice,
 * which also holds wherever that pass put the label. The rank is a whole number read off the
 * lattice, never a coordinate: 0.2 and 0.8 of a box stand exactly as far from its middle, and a
 * measured distance can part them by an ulp, so a 1 mm edit to a room would flip a label across it.
 * Equal ranks keep the lattice's own order (the sort is stable).
 */
function placesFor(g: LabelGroup): Place[] {
  const bb = polygonBounds(g.ring);
  const out: Place[] = [{ p: g.anchor, rank: 0 }];
  for (const fy of FRACTIONS) {
    for (const fx of FRACTIONS) {
      const p = { x: bb.x + bb.w * fx, y: bb.y + bb.h * fy };
      if (pointInPolygon(p.x, p.y, g.ring)) out.push({ p, rank: offCentre(fx) ** 2 + offCentre(fy) ** 2 });
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

/**
 * Shrink, or wrap and shrink, each room's label that does not fit: see the header. Replaces the
 * text nodes it changes, as `relocateLabels` does; a label that fits is left alone.
 */
export function fitLabels(
  nodes: SceneNode[],
  groups: readonly LabelGroup[],
  drawn: readonly ElementNodes[],
  plan: ResolvedPlan,
  sizes: RenderSizes,
): void {
  if (!groups.some((g) => g.wrap && !g.fixed)) return;
  const marks = marksOf(nodes, groups, drawn, plan);
  const grid = new GridIndex<Mark>(meanExtent(marks.map((m) => m.box)));
  for (const m of marks) grid.insert(boxOf(m.box), m);

  const budget = fitWork(plan);
  let work = 0;
  let stamp = 0;
  /** The share of a text off its floor; null once the count is spent. */
  const offFloor = (t: TextBoxes, ring: readonly Point[]): number | null => {
    work += ring.length;
    // Clamped: the clip's rounding can read a text wholly on its floor a hair below nothing.
    return work > budget ? null : Math.max(0, rectAreaOutside(t.ink, ring) / (t.ink.w * t.ink.h));
  };
  /** What a text stands on, for the label of group `owner`; null once the count is spent. */
  const read = (t: TextBoxes, off: number, owner: number, clearance: number): Reading | null => {
    const inkArea = t.ink.w * t.ink.h;
    const estimateArea = t.estimate.w * t.estimate.h;
    const inkRing = rectRing(t.ink);
    const estimateRing = rectRing(t.estimate);
    const seen = ++stamp;
    const roomy = grown(t.ink, clearance);
    let walls = 0;
    let nearWalls = 0;
    let text = 0;
    let worst = off;
    let total = off;
    grid.forEach(boxOf(unionOf(roomy, t.estimate)), (m) => {
      if (m.seen === seen) return;
      m.seen = seen;
      work++;
      if (m.stale || m.owner === owner) return;
      if (m.kind === "wall") {
        walls += overlapArea(t.ink, m.box) / inkArea;
        nearWalls += overlapArea(roomy, m.box) / inkArea;
      } else if (m.kind === "text") text += overlapArea(t.ink, m.box) / inkArea;
      else {
        const symbol = m.kind === "symbol";
        if (!(overlapArea(symbol ? t.estimate : t.ink, m.box) > 0)) return;
        let best = 0;
        for (const sh of m.shapes) {
          work += sh.length;
          if (work > budget) return;
          best = Math.max(best, clippedArea(sh, symbol ? estimateRing : inkRing));
        }
        const share = best / (symbol ? estimateArea : inkArea);
        worst = Math.max(worst, share);
        total += share;
      }
    });
    if (work > budget) return null;
    return {
      off,
      fabric: Math.max(worst, walls),
      roomy: Math.max(worst, nearWalls),
      text,
      total: total + nearWalls + text,
    };
  };

  const heights = labelHeights(sizes);
  const clearanceNow = sizes.roomFont * CLEARANCE;

  // Which labels do not fit reads the fabric alone, never another label, so it is the same in any
  // order.
  const misfits: Misfit[] = [];
  for (let gi = 0; gi < groups.length && work <= budget; gi++) {
    const g = groups[gi]!;
    if (!g.wrap || g.fixed) continue;
    const texts: number[] = [];
    for (let i = g.from; i < g.to; i++) {
      const n = nodes[i]!;
      if (n.layer === "labels" && n.prim.t === "text") texts.push(i);
    }
    if (texts.length !== 2) continue;
    const name = nodes[texts[0]!]!.prim;
    const area = nodes[texts[1]!]!.prim;
    if (name.t !== "text" || area.t !== "text" || name.rotate !== undefined) continue;

    const nameBoxesNow = boxesOf(name, name.at);
    const areaBoxesNow = boxesOf(area, area.at);
    const nameOffNow = offFloor(nameBoxesNow, g.ring);
    const areaOffNow = offFloor(areaBoxesNow, g.ring);
    if (nameOffNow === null || areaOffNow === null) break;
    const nameNow = read(nameBoxesNow, nameOffNow, gi, clearanceNow);
    const areaNow = read(areaBoxesNow, areaOffNow, gi, clearanceNow);
    if (!nameNow || !areaNow) break;
    if (nameNow.fabric > COLLIDE_MIN || areaNow.fabric > COLLIDE_MIN) {
      misfits.push({ gi, nameAt: texts[0]!, areaAt: texts[1]!, name, area, buried: nameNow.total + areaNow.total });
    }
  }

  // A label that may yet shrink or move claims no floor: a neighbour must not dodge a box about to
  // go. Each takes its place in an order read off the plan, never the source's.
  const moving = new Set(misfits.map((f) => f.gi));
  for (const m of marks) if (m.kind === "text" && moving.has(m.owner)) m.stale = true;
  misfits.sort((a, b) => placeOrder(a, b, groups));

  for (const misfit of misfits) {
    const { gi, name, area } = misfit;
    const g = groups[gi]!;
    const nameNode = nodes[misfit.nameAt]!;
    const areaNode = nodes[misfit.areaAt]!;
    const bb = polygonBounds(g.ring);
    const here = { x: name.at.x, y: name.at.y + sizes.roomFont * LABEL_NAME_RISE };
    const places = placesFor(g);
    const { block: _drawnLines, ...oneLine } = name;
    const wrapped: string[][] = [];
    for (let n = 2; n < 2 + WRAP_TRIES; n++) {
      const lines = balancedLines(name.value, n);
      if (!lines) break;
      wrapped.push(lines);
    }

    // The first form that keeps its clearance from the walls wins outright. Failing that, the
    // first that is merely clear, then whichever leaves the least of the label buried.
    let roomy: Form | undefined;
    let clear: Form | undefined;
    let leastBuried: Form | undefined;
    let least = misfit.buried;
    search: for (let hi = 0; hi < heights.length; hi++) {
      const h = heights[hi]!;
      const pitch = h.name * LABEL_LINE_PITCH;
      for (const lines of hi > 0 ? [...wrapped, null] : wrapped) {
        work += name.value.length;
        const mid = lines ? (lines.length - 1) / 2 : 0;
        const namePrim: TextPrim = {
          ...oneLine,
          size: h.name,
          ...(lines ? { block: { lines, pitch } } : {}),
        };
        const areaPrim: TextPrim = { ...area, size: h.area };
        const nameAt = (p: Point): Point => ({ x: p.x, y: p.y - h.name * LABEL_NAME_RISE });
        const areaAt = (p: Point): Point => ({ x: p.x, y: p.y + h.name * LABEL_AREA_DROP + mid * pitch });
        const nameBoxes = boxesOf(namePrim, { x: 0, y: 0 });
        const areaBoxes = boxesOf(areaPrim, { x: 0, y: 0 });
        // Wider or taller than the room's whole extent: it can stand clear nowhere. Only the
        // smallest height is worth drawing then, and only where the label stands.
        const tooBig = [nameBoxes.ink, areaBoxes.ink].some((b) => b.w > bb.w || b.h > bb.h);
        if (tooBig && hi < heights.length - 1) continue;
        // Never further off the floor than the label stands now.
        const startName = offFloor(moved(nameBoxes, nameAt(here)), g.ring);
        const startArea = offFloor(moved(areaBoxes, areaAt(here)), g.ring);
        if (startName === null || startArea === null) break search;
        const capName = Math.max(COLLIDE_MIN, startName) + 1e-9;
        const capArea = Math.max(COLLIDE_MIN, startArea) + 1e-9;
        const clearance = h.name * CLEARANCE;
        let best: { p: Point; tier: number; total: number } | undefined;
        let bestScore = Infinity;
        for (const { p, rank } of tooBig ? [places[0]!, { p: here, rank: 0 }] : places) {
          // Places run outward: past the best score nothing further can win, and a tie stays with
          // the place tried first.
          const distance = (rank / LAST_RANK) * W_DISTANCE;
          if (distance >= bestScore) break;
          const nameHere = moved(nameBoxes, nameAt(p));
          const areaHere = moved(areaBoxes, areaAt(p));
          const nameOff = offFloor(nameHere, g.ring);
          const areaOff = offFloor(areaHere, g.ring);
          if (nameOff === null || areaOff === null) break search;
          if (nameOff > capName || areaOff > capArea) continue;
          const n = read(nameHere, nameOff, gi, clearance);
          const a = read(areaHere, areaOff, gi, clearance);
          if (!n || !a) break search;
          const total = n.total + a.total;
          const tier =
            Math.max(n.roomy, n.text, a.roomy, a.text) <= COLLIDE_MIN
              ? 0
              : Math.max(n.fabric, n.text, a.fabric, a.text) <= COLLIDE_MIN
                ? 1
                : 2;
          // Rounded, so two places a mirror apart tie exactly and the order settles them.
          const score = tier * W_TIER + (Math.round(total * BURIED_STEPS) / BURIED_STEPS) * W_BURIED + distance;
          if (score < bestScore) {
            bestScore = score;
            best = { p, tier, total };
          }
        }
        if (!best) continue;
        const form = { name: { ...namePrim, at: nameAt(best.p) }, area: { ...areaPrim, at: areaAt(best.p) } };
        if (best.tier === 0) {
          roomy = form;
          break search;
        }
        if (best.tier === 1) clear ??= form;
        else if (best.total < least) {
          least = best.total;
          leastBuried = form;
        }
      }
    }

    const chosen = roomy ?? clear ?? leastBuried;
    if (chosen) {
      nodes[misfit.nameAt] = { ...nameNode, prim: chosen.name };
      nodes[misfit.areaAt] = { ...areaNode, prim: chosen.area };
    }
    // Where it landed, even if that is where it stood, is now a place the next label must leave.
    for (const prim of chosen ? [chosen.name, chosen.area] : [name, area]) {
      const box = primBBox(prim)!;
      grid.insert(boxOf(box), { kind: "text", box, shapes: [], owner: gi, stale: false, seen: 0 });
    }
    if (work > budget) return;
  }
}

/** A label that does not fit, as the passes before this one left it. */
interface Misfit {
  /** Its group's index. */
  gi: number;
  /** Where its two texts stand in the node list. */
  nameAt: number;
  areaAt: number;
  name: TextPrim;
  area: TextPrim;
  /** How much of it is buried now: a form must leave less. */
  buried: number;
}

/** A place in the plan, then the words: the same two labels in the same order, whatever the source. */
function placeOrder(a: Misfit, b: Misfit, groups: readonly LabelGroup[]): number {
  const pa = groups[a.gi]!.anchor;
  const pb = groups[b.gi]!.anchor;
  return pa.y - pb.y || pa.x - pb.x || text(a.name.value, b.name.value) || text(a.area.value, b.area.value);
}

const text = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The rect grown by `d` on every side. */
function grown(b: BBox, d: number): BBox {
  return { x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d };
}

/** The smallest rect containing both. */
function unionOf(a: BBox, b: BBox): BBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
