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
 * symbol's drawn shapes, at the rule's generous width, or the ink where that is wider
 * ({@link symbolExtent}). A label that passes is
 * not touched, so a plan with nothing to report keeps its bytes; `test/label-fit.test.ts` holds
 * that over the corpus and the plans the soundness audits wrote. A rug is floor finish, as it is
 * to the rule. A piece's own label (card AL4) lies inside its piece, so a label over it is over the
 * piece and already searched for; the search never reads it, and decides every label exactly as it
 * would with no such label. Only once every label stands does a last step move a label this pass
 * redrew off a piece's label, to a place where the same form is no worse by every measure the
 * search reads; so it never shrinks, unwraps or newly buries a label (see the last step of
 * {@link fitLabels}).
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
 * wrapped form comes first, and the one-line name is not tried at the full size: `relocateLabels`
 * has already searched the lattice with the name as `wrapLabels` left it, at the full size and at
 * the width this pass reads it at against a symbol (card AL3w), and left it where its own reading
 * scored best. That reading is coarser than this pass's: it boxes what is drawn rather than
 * clipping its shapes, and reads another room's label where the relocation left it, at the full
 * size, even one off its own floor (card AL3e). So it is no proof that no
 * full-size one-line place stands clear by this pass's reading, only the reason this pass does not
 * search those places again. Breaking stays {@link balancedLines}'s: only at a space, by a count of
 * characters, so the same name breaks the same way on every run and no word is ever split or
 * hyphenated. The full size is tried for wrapped forms too: `wrapLabels` asks for clearance from
 * the walls at the generous width, and leaves `Abstell- raum` on one line for want of 1.25 mm.
 *
 * Which labels do not fit is read first, from the fabric alone. A label that does not fit then
 * claims no floor until its turn comes, so a neighbour never dodges a box that is about to shrink,
 * and the turns go by the room's anchor. `relocateLabels` takes its turns in the same order (card
 * AL3a), so the two passes together are order-free: the same rooms written in any order draw the
 * same. Not yet in a plan that draws `walls from rooms`: under `dims auto` its wall-thickness figures
 * are stationed before either pass, in an order of their own, and both passes read them as drawn
 * (card AL3f); and its derived walls reach the relocation in their own order, so a mirror tie can
 * fall the other way by a rounding step (card AL3g).
 * A place is ranked off the lattice, never by a
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
 * ### Leaders (card AL3b, ADR 0035)
 *
 * A label this pass has redrawn and that still stands, by the rule's own test at no clearance, over a
 * symbol, a wall, a door's swing or a piece's label, or off its floor, is placed once more, and may
 * leave its floor ({@link LEADER_REACH}). Its own marks are retired first (where the pass put it, and
 * where the step off a piece's label moved it), so its old place blocks neither its dot nor another
 * label. The places are a square lattice about the room's anchor, its pitch the drawing's room-name
 * size, every floor's places ranked together by a whole-number key and never by a measured distance:
 * `i² + j²`, then `max(|i|, |j|)`, then a host of `uses circulation` before any other (so it wins
 * only among places at the same two distances), then `j`, then `i`. A place stands on the floor of a
 * room of this storey, never outside the building, where a label would grow the page and so
 * `describe().sheet`; where two floors hold it, the smaller one (a room drawn inside another), then
 * the anchors' y and x, never the order of the source. A place on the room's own floor draws no
 * leader. The label must stand on that floor and clear of every symbol, wall, swing, label, tag,
 * figure and piece's label, read as the search above reads them, and each of its texts, at the width
 * it prints ({@link labelBox}), clear of every other text the drawing holds, boxed the same way, and
 * of every leader drawn before it. The heights are tried largest first, at each the one-line name and
 * then its wrapped forms, and at each form the places in their rank: the first place that keeps the
 * walls' clearance, with no leader or one that crosses no swing or symbol, stops the search;
 * failing one, the first place found at the best rank of clearance wins. So a smaller size is tried
 * only once no place at a larger one stops the search, and a place on the room's own floor wins only
 * by coming first in that order. A label led off its floor is joined to its room by one straight line
 * from the edge of its box, ending in a dot on the room's own floor: on the first place of the same
 * lattice, ranked by the same key, whose dot is clear of every symbol, label and wall, or the room's
 * anchor when none is. The line never crosses a third room's floor, a text, another leader or any
 * wall but one between the two floors, and off the two floors it runs only inside such a wall; one
 * that crosses a door's swing or a symbol ranks below one that crosses neither. Pinned labels,
 * labels that fit and labels with no such place keep the form and place given above, and the rule
 * reports what is left. What was led is kept beside the Scene (`drawnLeaders`, `src/scene-build.ts`)
 * for `W_ANNOTATION_OVERLAP`, which judges a led label on the floor it stands on.
 *
 * The step counts on a count of its own, {@link leaderWork}, shared out by storey as the fit's is, so
 * the fit's count and the thickness figures' share of it are as they were; and no label may spend more
 * than {@link LEADER_LABEL_WORK} of it. A label that reaches its own cap keeps its place; past the
 * step's count the step stops, and every label not yet placed keeps its place, and is reported as any
 * label the step could not place is. Both are counts, the same on every machine.
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
import {
  clippedArea,
  pointInPolygon,
  polygonArea,
  polygonBounds,
  rectAreaOutside,
  rectRing,
} from "./geometry/polygon.js";
import type { BBox } from "./geometry/rect.js";
import type { CompileWork } from "./compile-work.js";
import type { RDoor, ResolvedElement, ResolvedPlan, RFurniture, RRoom } from "./ir.js";
import { isUnderlay } from "./fixtures-catalog.js";
import {
  CLEARANCE,
  COLLIDE_MIN,
  FRACTIONS,
  labelBox,
  type LabelGroup,
  meanExtent,
  overlapArea,
  primBBox,
  underLabels,
  W_DISTANCE,
  WRAP_TRIES,
  wallBands,
  curvedOpeningInk,
} from "./label-placement.js";
import type { RenderSizes, SceneNode, ScenePrim } from "./scene.js";
import {
  balancedLines,
  inkExtent,
  LABEL_AREA_DROP,
  LABEL_LINE_PITCH,
  LABEL_NAME_RISE,
  symbolExtent,
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

/** The leader step's count over a whole plan (card AL3b), shared out by storey as {@link fitWork} is. */
export const MAX_LEADER_WORK = 1_000_000;

/** A storey's share of {@link MAX_LEADER_WORK}. */
export const leaderWork = (plan: ResolvedPlan): number => MAX_LEADER_WORK / (plan._storeyCount ?? 1);

/** The most of the leader step's count one label may spend; past it the label keeps its place. */
export const LEADER_LABEL_WORK = 400_000;

/** The lattice's reach in pitches past the room's larger extent, and its most in all. */
const LEADER_MARGIN = 2;
export const LEADER_REACH = 16;

/** The leader's dot: its radius as a fraction of the room-name size. */
const LEADER_DOT = 0.1;

/**
 * How much of a dot's box, as a share of it, may read as off its floor, over a wall's or a text's box,
 * or under a symbol's shape (its box only gates that clip) and the dot still stand clear: the rounding
 * of the reading, the same slack `relocateLabels` gives its off-floor reading
 * (`src/label-placement.ts`). Each is read in the dot's own frame, so that rounding is a few ulps of a
 * box a few millimetres across on the sheet, whatever the plan's coordinates; read at the plan's
 * absolute positions it grew with their magnitude, and a dot wholly on its floor stood a hair off it,
 * over a wall band's box or under a symbol at one place of the lattice and not at the next, so the
 * same plan placed 20 m away led its label from another dot, or did not lead it (backlog E.18).
 */
const DOT_SLACK = 1e-9;

/** What the leader step drew for one room's label (card AL3b): kept beside the Scene for the rule. */
export interface DrawnLeader {
  /** The id of the room whose label was led. */
  room: string;
  /** The id of the room whose floor the label now stands on. */
  host: string;
  /** The line: from the edge of the label's box (`a`) to the dot on the room's own floor (`b`). */
  a: Point;
  b: Point;
}

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
  /** The lattice place it stands at (the room's anchor or a lattice point). */
  p?: Point;
}

/** A text's box twice, as the rule reads it: {@link inkExtent} for the walls, swings and floor,
 *  and for a symbol or a piece's label the wider of the generous {@link textExtent} and the ink
 *  (card AL3w: "WC" draws 1.67 em of ink against an estimate of 1.24 em). */
interface TextBoxes {
  ink: BBox;
  /** The box a symbol or a piece's label is read against: {@link symbolExtent}, which is the
   *  estimate itself except where the ink is wider (the field keeps its name from before AL3w). */
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
  const ink = inkExtent(prim);
  return { ink: centred(ink, at), estimate: centred(symbolExtent(prim, ink.w), at) };
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
    // An opening on a curve: its lines are strokes (no box), its cover and sill boxed piece by piece.
    const curved = curvedOpeningInk(nodes[i]!);
    if (curved) {
      for (const b of curved.boxes) marks.push(mark("text", b));
      continue;
    }
    const b = primBBox(nodes[i]!.prim);
    if (b) marks.push(mark("text", b));
  }
  return marks;
}

/** The boxes of the pieces' own labels: the text an uncatalogued word draws inside its rectangle (card AL4). */
function pieceLabelBoxes(nodes: readonly SceneNode[], drawn: readonly ElementNodes[]): BBox[] {
  const out: BBox[] = [];
  for (const { el, from, to } of drawn) {
    if (el.kind !== "furniture" || !isSymbolElement(el)) continue;
    for (let i = from; i < to; i++) {
      const prim = nodes[i]!.prim;
      if (prim.t === "text") out.push(primBBox(prim)!);
    }
  }
  return out;
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
 * text nodes it changes, as `relocateLabels` does; a label that fits is left alone. Returns the
 * work it spent of the storey's {@link fitWork}, so the pass after it (the `dims auto` thickness
 * figures' re-station, `src/scene-build.ts`, card AL5) spends only what is left of the one count.
 */
export function fitLabels(
  nodes: SceneNode[],
  groups: readonly LabelGroup[],
  drawn: readonly ElementNodes[],
  plan: ResolvedPlan,
  sizes: RenderSizes,
  leaders?: DrawnLeader[],
  counts?: CompileWork,
): number {
  if (!groups.some((g) => g.wrap && !g.fixed)) return 0;
  const marks = marksOf(nodes, groups, drawn, plan);
  const grid = new GridIndex<Mark>(meanExtent(marks.map((m) => m.box)));
  for (const m of marks) grid.insert(boxOf(m.box), m);

  let budget = fitWork(plan);
  let work = 0;
  let stamp = 0;
  /** The share of a text off its floor; null once the count is spent. */
  const offFloor = (t: TextBoxes, ring: readonly Point[]): number | null => {
    work += ring.length;
    // Clamped: the clip's rounding can read a text wholly on its floor a hair below nothing.
    return work > budget ? null : Math.max(0, rectAreaOutside(t.ink, ring) / (t.ink.w * t.ink.h));
  };
  /** What a text stands on, for the label of group `owner`; null once the count is spent. `hits`,
   *  when given, collects each thing it stands on past {@link COLLIDE_MIN}: a mark, `"wall"`, `"off"`. */
  const read = (
    t: TextBoxes,
    off: number,
    owner: number,
    clearance: number,
    hits?: Set<Mark | "wall" | "off">,
  ): Reading | null => {
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
      } else if (m.kind === "text") {
        const share = overlapArea(t.ink, m.box) / inkArea;
        text += share;
        if (hits && share > COLLIDE_MIN) hits.add(m);
      } else {
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
        if (hits && share > COLLIDE_MIN) hits.add(m);
      }
    });
    if (work > budget) return null;
    if (hits && walls > COLLIDE_MIN) hits.add("wall");
    if (hits && off > COLLIDE_MIN) hits.add("off");
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

  /** Each label this pass redrew, its form and the marks it left: what the last step reads. */
  const landed: { misfit: Misfit; form: Required<Form>; own: Mark[] }[] = [];
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
        const form = {
          name: { ...namePrim, at: nameAt(best.p) },
          area: { ...areaPrim, at: areaAt(best.p) },
          p: best.p,
        };
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
    // Kept in `marks` too, so the leader step can retire it when it moves this label (card AL3b);
    // nothing here reads `marks` again, only the grid.
    const own: Mark[] = [];
    for (const prim of chosen ? [chosen.name, chosen.area] : [name, area]) {
      const box = primBBox(prim)!;
      const m: Mark = { kind: "text", box, shapes: [], owner: gi, stale: false, seen: 0 };
      marks.push(m);
      grid.insert(boxOf(box), m);
      own.push(m);
    }
    if (work > budget) return work;
    if (chosen?.p) landed.push({ misfit, form: chosen as Required<Form>, own });
  }

  // Off a piece's own label (card AL4), once every label stands where it will. The search above never
  // reads a piece's label, so it decides each label's height, lines and place exactly as it would with
  // no such label; this only moves a label it redrew that stands on one, and only to a place of the
  // lattice where the same form is no worse by any measure the search reads (no further off its
  // floor, over nothing new, in no worse tier, no more buried) and clear of every piece's label. A label
  // is never shrunk, unwrapped or put over anything for it. The rule reports what is left.
  const pieces = pieceLabelBoxes(nodes, drawn);
  if (pieces.length === 0) return leaderStep();
  const pieceGrid = new GridIndex<BBox>(meanExtent(pieces));
  for (const b of pieces) pieceGrid.insert(boxOf(b), b);
  /** The largest share of a text's box (as the rule boxes it, {@link symbolExtent}) any piece's label covers. */
  const onPieceLabel = (t: TextBoxes): number => {
    const area = t.estimate.w * t.estimate.h;
    let worst = 0;
    pieceGrid.forEach(boxOf(t.estimate), (b) => {
      work++;
      worst = Math.max(worst, overlapArea(t.estimate, b) / area);
    });
    return worst;
  };
  for (const { misfit, form, own } of landed) {
    const { gi } = misfit;
    const g = groups[gi]!;
    const size = form.name.size;
    const pitch = form.name.block?.pitch ?? 0;
    const mid = form.name.block ? (form.name.block.lines.length - 1) / 2 : 0;
    const nameAt = (p: Point): Point => ({ x: p.x, y: p.y - size * LABEL_NAME_RISE });
    const areaAt = (p: Point): Point => ({ x: p.x, y: p.y + size * LABEL_AREA_DROP + mid * pitch });
    const nameBoxes = boxesOf(form.name, { x: 0, y: 0 });
    const areaBoxes = boxesOf(form.area, { x: 0, y: 0 });
    const clearance = size * CLEARANCE;
    /** The form at `p`: its tier, total, hits and how far it stands on a piece's label; null past the count. */
    const at = (p: Point) => {
      const nameHere = moved(nameBoxes, nameAt(p));
      const areaHere = moved(areaBoxes, areaAt(p));
      const nameOff = offFloor(nameHere, g.ring);
      const areaOff = offFloor(areaHere, g.ring);
      if (nameOff === null || areaOff === null) return null;
      const hits = new Set<Mark | "wall" | "off">();
      const n = read(nameHere, nameOff, gi, clearance, hits);
      const a = read(areaHere, areaOff, gi, clearance, hits);
      if (!n || !a) return null;
      const tier =
        Math.max(n.roomy, n.text, a.roomy, a.text) <= COLLIDE_MIN
          ? 0
          : Math.max(n.fabric, n.text, a.fabric, a.text) <= COLLIDE_MIN
            ? 1
            : 2;
      const total = Math.round((n.total + a.total) * BURIED_STEPS);
      const piece = Math.max(onPieceLabel(nameHere), onPieceLabel(areaHere));
      if (work > budget) return null;
      return { nameOff, areaOff, hits, tier, total, piece };
    };
    const now = at(form.p);
    if (!now) return work;
    if (now.piece <= COLLIDE_MIN) continue;
    let to: Point | undefined;
    for (const { p } of placesFor(g)) {
      if (p.x === form.p.x && p.y === form.p.y) continue;
      const there = at(p);
      if (!there) return work;
      if (there.piece > COLLIDE_MIN || there.tier > now.tier || there.total > now.total) continue;
      if (there.nameOff > Math.max(COLLIDE_MIN, now.nameOff) + 1e-9) continue;
      if (there.areaOff > Math.max(COLLIDE_MIN, now.areaOff) + 1e-9) continue;
      if ([...there.hits].some((h) => !now.hits.has(h))) continue;
      to = p;
      break;
    }
    if (!to) continue;
    const name = { ...form.name, at: nameAt(to) };
    const area = { ...form.area, at: areaAt(to) };
    nodes[misfit.nameAt] = { ...nodes[misfit.nameAt]!, prim: name };
    nodes[misfit.areaAt] = { ...nodes[misfit.areaAt]!, prim: area };
    for (const m of own) m.stale = true;
    for (const prim of [name, area]) {
      const box = primBBox(prim)!;
      const m: Mark = { kind: "text", box, shapes: [], owner: gi, stale: false, seen: 0 };
      marks.push(m);
      grid.insert(boxOf(box), m);
    }
  }
  return leaderStep();

  /**
   * The leader step (card AL3b; see the header). It counts on {@link leaderWork}, swapped in for the
   * fit's count while it runs, so `read` and `offFloor` charge it; the fit's own spend is returned as
   * it stood.
   */
  function leaderStep(): number {
    const fitSpent = work;
    work = 0;
    budget = leaderWork(plan);
    lead();
    work = fitSpent;
    budget = fitWork(plan);
    return fitSpent;
  }

  function lead(): void {
    const pitch = sizes.roomFont;
    // The rooms, by their group: every floor a label may stand on, and the id and uses of each.
    const roomOf = new Map<number, RRoom>();
    for (const { el, from } of drawn) if (el.kind === "room") roomOf.set(from, el as RRoom);
    interface Host {
      gi: number;
      ring: readonly Point[];
      /** The ring's extent: a text that stands off it stands off the ring, without a clip. */
      box: BBox;
      /** The floor's area to a whole mm², for {@link hostOrder}. */
      area: number;
      circulation: boolean;
    }
    const hosts: Host[] = [];
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi]!;
      if (!g.wrap) continue;
      work += g.ring.length;
      hosts.push({
        gi,
        ring: g.ring,
        box: polygonBounds(g.ring),
        area: Math.round(polygonArea(g.ring)),
        circulation: roomOf.get(g.from)?.uses?.includes("circulation") === true,
      });
    }
    if (hosts.length === 0) return;
    const hostGrid = new GridIndex<Host>(meanExtent(hosts.map((h) => h.box)));
    for (const h of hosts) hostGrid.insert(boxOf(h.box), h);
    /** More of `t` than the trigger stands outside the host's extent, so off its floor. */
    const offExtent = (t: TextBoxes, host: Host): boolean =>
      t.ink.w * t.ink.h - overlapArea(t.ink, host.box) > COLLIDE_MIN * t.ink.w * t.ink.h;
    /** Two floors that both hold a point, ordered by the plan's geometry, never the source's: the
     *  smaller floor first (a room drawn inside another is the one the point stands in), then the
     *  label anchor's y and x, then the ring's vertices. Order-free up to rooms identical in all four. */
    const hostOrder = (u: Host, v: Host): number => {
      if (u.area !== v.area) return u.area - v.area;
      const a = groups[u.gi]!.anchor;
      const b = groups[v.gi]!.anchor;
      if (a.y !== b.y) return a.y - b.y;
      if (a.x !== b.x) return a.x - b.x;
      if (u.ring.length !== v.ring.length) return u.ring.length - v.ring.length;
      for (let k = 0; k < u.ring.length; k++) {
        const p = u.ring[k]!;
        const q = v.ring[k]!;
        if (p.y !== q.y) return p.y - q.y;
        if (p.x !== q.x) return p.x - q.x;
      }
      return 0;
    };
    /** The room whose floor holds `p` ({@link hostOrder} among several), or null; charged by the vertices read. */
    const hostAt = (p: Point): Host | null => {
      let found: Host | null = null;
      hostGrid.forEach({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }, (h) => {
        if (h === found) return;
        work += h.ring.length;
        if (pointInPolygon(p.x, p.y, h.ring) && (found === null || hostOrder(h, found) < 0)) found = h;
      });
      return found;
    };
    work += nodes.length;
    const pieceBoxes = pieceLabelBoxes(nodes, drawn);
    const pieceGrid = new GridIndex<BBox>(
      meanExtent(pieceBoxes.length > 0 ? pieceBoxes : [{ x: 0, y: 0, w: 1, h: 1 }]),
    );
    for (const b of pieceBoxes) pieceGrid.insert(boxOf(b), b);
    const onPiece = (t: TextBoxes): number => {
      const area = t.estimate.w * t.estimate.h;
      let worst = 0;
      pieceGrid.forEach(boxOf(t.estimate), (b) => {
        work++;
        worst = Math.max(worst, overlapArea(t.estimate, b) / area);
      });
      return worst;
    };

    // Every text the Scene draws, boxed at the width it prints ({@link labelBox}: the wider of the
    // estimate and the ink), as the labels now stand: a room's label is its group's, any other text
    // (an opening's tag, a figure, a piece's label) no room's. A place stands its label's texts clear
    // of all of them but its own, and of every leader drawn; read at the estimate alone, or at the
    // ink alone, a text can print over another the step never saw (the AL3b red team, plain-strip
    // seed 11 plan 68).
    /** The leaders drawn so far, each from the edge of its label's box to its dot. */
    const drawnLines: { a: Point; b: Point }[] = [];
    interface DrawnText {
      box: BBox;
      owner: number;
      stale: boolean;
    }
    const ownerOf = new Int32Array(nodes.length).fill(-1);
    for (let gi = 0; gi < groups.length; gi++) for (let i = groups[gi]!.from; i < groups[gi]!.to; i++) ownerOf[i] = gi;
    work += nodes.length;
    const drawnTexts: DrawnText[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      if (n.prim.t !== "text" || underLabels(n)) continue;
      const box = labelBox(n.prim);
      if (box) drawnTexts.push({ box, owner: ownerOf[i]!, stale: false });
    }
    const textGrid = new GridIndex<DrawnText>(
      meanExtent(drawnTexts.length > 0 ? drawnTexts.map((d) => d.box) : [{ x: 0, y: 0, w: 1, h: 1 }]),
    );
    for (const d of drawnTexts) textGrid.insert(boxOf(d.box), d);
    /** `b` overlaps a drawn text of any group but `own`'s, or a leader drawn so far. */
    const overDrawn = (b: BBox, own: number): boolean => {
      let hit = false;
      textGrid.forEach(boxOf(b), (d) => {
        work++;
        if (!hit && !d.stale && d.owner !== own && overlapArea(b, d.box) > 0) hit = true;
      });
      for (const l of drawnLines) {
        if (hit) break;
        work++;
        if (segmentMeetsRect(l.a, l.b, b)) hit = true;
      }
      return hit;
    };

    // Which labels are led is read first, as the fit left them: the rule's test at no clearance.
    const triggered: Misfit[] = [];
    for (const misfit of [...misfits].sort((a, b) => placeOrder(a, b, groups))) {
      const g = groups[misfit.gi]!;
      const name = nodes[misfit.nameAt]!.prim as TextPrim;
      const area = nodes[misfit.areaAt]!.prim as TextPrim;
      const nb = boxesOf(name, name.at);
      const ab = boxesOf(area, area.at);
      const no = offFloor(nb, g.ring);
      const ao = offFloor(ab, g.ring);
      if (no === null || ao === null) return;
      const n = read(nb, no, misfit.gi, 0);
      const a = read(ab, ao, misfit.gi, 0);
      if (!n || !a) return;
      if (Math.max(n.fabric, a.fabric) > COLLIDE_MIN || Math.max(onPiece(nb), onPiece(ab)) > COLLIDE_MIN) {
        triggered.push(misfit);
      }
    }

    /** The lattice about `A`, out to `reach` pitches, best key first; `circulation` breaks the
     *  ties of the two distances when the host of each place is known. */
    const lattice = (A: Point, reach: number): { p: Point; i: number; j: number }[] => {
      // Charged before it is built: one unit a place.
      work += (2 * reach + 1) ** 2;
      const out: { p: Point; i: number; j: number }[] = [];
      for (let j = -reach; j <= reach; j++)
        for (let i = -reach; i <= reach; i++) out.push({ p: { x: A.x + i * pitch, y: A.y + j * pitch }, i, j });
      return out;
    };
    const key = (i: number, j: number) => [i * i + j * j, Math.max(Math.abs(i), Math.abs(j))] as const;
    const ownMarks = (gi: number): Mark[] => marks.filter((m) => m.kind === "text" && m.owner === gi && !m.stale);

    for (const misfit of triggered) {
      const start = work;
      const capped = (): boolean => work - start > LEADER_LABEL_WORK || work > budget;
      const { gi } = misfit;
      const g = groups[gi]!;
      const room = roomOf.get(g.from);
      if (!room) continue;
      const nameNode = nodes[misfit.nameAt]!;
      const areaNode = nodes[misfit.areaAt]!;
      const nameNow = nameNode.prim as TextPrim;
      const areaNow = areaNode.prim as TextPrim;
      const bb = polygonBounds(g.ring);
      const reach = Math.min(LEADER_REACH, Math.ceil(Math.max(bb.w, bb.h) / pitch) + LEADER_MARGIN);
      const leaving = ownMarks(gi);
      for (const m of leaving) m.stale = true;
      const restore = (): void => {
        for (const m of leaving) m.stale = false;
      };

      // The places, each with its host, ranked: the two distances, a circulation host, then j, then i.
      const places: { p: Point; i: number; j: number; host: Host }[] = [];
      for (const c of lattice(g.anchor, reach)) {
        const host = hostAt(c.p);
        if (host) places.push({ ...c, host });
      }
      if (capped()) {
        restore();
        if (work > budget) return;
        continue;
      }
      places.sort((u, v) => {
        const [du, ru] = key(u.i, u.j);
        const [dv, rv] = key(v.i, v.j);
        return du - dv || ru - rv || Number(v.host.circulation) - Number(u.host.circulation) || u.j - v.j || u.i - v.i;
      });

      // Where the leader ends: the first place on the room's own floor, by the same key, whose dot is
      // clear of every symbol, label and wall; the room's anchor when none is.
      // Its floor, the boxes it meets and the symbols' shapes are read in the dot's own frame, against
      // {@link DOT_SLACK}.
      const r = pitch * LEADER_DOT;
      const discHere: BBox = { x: -r, y: -r, w: 2 * r, h: 2 * r };
      const discRing = rectRing(discHere);
      const slack = discHere.w * discHere.h * DOT_SLACK;
      let dot: Point = g.anchor;
      for (const { p, host } of places) {
        if (host.gi !== gi) continue;
        const disc: BBox = { x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r };
        const here = (ring: readonly Point[]): Point[] => ring.map((q) => ({ x: q.x - p.x, y: q.y - p.y }));
        const meets = (b: BBox): boolean => overlapArea(discHere, { ...b, x: b.x - p.x, y: b.y - p.y }) > slack;
        if (rectAreaOutside(discHere, here(g.ring)) > slack) continue;
        let clear = true;
        grid.forEach(boxOf(disc), (m) => {
          work++;
          if (!clear || m.stale || !meets(m.box)) return;
          if (m.kind === "symbol") {
            for (const sh of m.shapes) {
              work += sh.length;
              if (clippedArea(here(sh), discRing) > slack) clear = false;
            }
          } else if (m.kind === "text" || m.kind === "wall") clear = false;
        });
        // And every text as it prints, but the label's own (it is leaving).
        if (clear)
          textGrid.forEach(boxOf(disc), (d) => {
            work++;
            if (clear && !d.stale && d.owner !== gi && meets(d.box)) clear = false;
          });
        if (clear) {
          dot = p;
          break;
        }
      }

      const { block: _lines, ...oneLine } = nameNow;
      const wrapped: string[][] = [];
      for (let n = 2; n < 2 + WRAP_TRIES; n++) {
        const lines = balancedLines(nameNow.value, n);
        if (!lines) break;
        wrapped.push(lines);
      }
      type Choice = { name: TextPrim; area: TextPrim; host: Host; a: Point; tier: number };
      let best: Choice | undefined;
      search: for (const h of heights) {
        const linePitch = h.name * LABEL_LINE_PITCH;
        for (const lines of [null, ...wrapped]) {
          const mid = lines ? (lines.length - 1) / 2 : 0;
          const namePrim: TextPrim = {
            ...oneLine,
            size: h.name,
            ...(lines ? { block: { lines, pitch: linePitch } } : {}),
          };
          const areaPrim: TextPrim = { ...areaNow, size: h.area };
          const nameAt = (p: Point): Point => ({ x: p.x, y: p.y - h.name * LABEL_NAME_RISE });
          const areaAt = (p: Point): Point => ({ x: p.x, y: p.y + h.name * LABEL_AREA_DROP + mid * linePitch });
          const nameBoxes = boxesOf(namePrim, { x: 0, y: 0 });
          const areaBoxes = boxesOf(areaPrim, { x: 0, y: 0 });
          const clearance = h.name * CLEARANCE;
          for (const { p, host } of places) {
            if (capped()) break search;
            if (counts) counts.labelLeaders++;
            const nh = moved(nameBoxes, nameAt(p));
            const ah = moved(areaBoxes, areaAt(p));
            work++;
            if (offExtent(nh, host) || offExtent(ah, host)) continue;
            const nOff = offFloor(nh, host.ring);
            const aOff = offFloor(ah, host.ring);
            if (nOff === null || aOff === null) break search;
            if (nOff > COLLIDE_MIN || aOff > COLLIDE_MIN) continue;
            const n = read(nh, nOff, gi, clearance);
            const a = read(ah, aOff, gi, clearance);
            if (!n || !a) break search;
            if (Math.max(n.fabric, n.text, a.fabric, a.text) > COLLIDE_MIN) continue;
            if (Math.max(onPiece(nh), onPiece(ah)) > COLLIDE_MIN) continue;
            if (overDrawn(nh.estimate, gi) || overDrawn(ah.estimate, gi)) continue;
            let tier = Math.max(n.roomy, a.roomy) <= COLLIDE_MIN ? 0 : 1;
            let from = dot;
            if (host.gi !== gi) {
              const edge = exitPoint(grown(unionOf(nh.ink, ah.ink), h.name * 0.25), dot);
              if (!edge || !leaderClear(edge, dot, gi, host.gi)) continue;
              if (leaderOver(edge, dot)) tier += 2;
              from = edge;
            }
            if (!best || tier < best.tier) {
              best = {
                name: { ...namePrim, at: nameAt(p) },
                area: { ...areaPrim, at: areaAt(p) },
                host,
                a: from,
                tier,
              };
              if (tier === 0) break search;
            }
          }
        }
      }
      if (capped() || !best) {
        restore();
        if (work > budget) return;
        continue;
      }
      nodes[misfit.nameAt] = { ...nameNode, prim: best.name };
      nodes[misfit.areaAt] = { ...areaNode, prim: best.area };
      for (const prim of [best.name, best.area]) {
        const box = primBBox(prim)!;
        const m: Mark = { kind: "text", box, shapes: [], owner: gi, stale: false, seen: 0 };
        marks.push(m);
        grid.insert(boxOf(box), m);
      }
      // The drawn texts: the label's own as it now stands, at the width it prints.
      work += drawnTexts.length;
      for (const d of drawnTexts) if (d.owner === gi) d.stale = true;
      for (const prim of [best.name, best.area]) {
        const d: DrawnText = { box: labelBox(prim)!, owner: gi, stale: false };
        drawnTexts.push(d);
        textGrid.insert(boxOf(d.box), d);
      }
      if (best.host.gi === gi) continue;
      const hostRoom = roomOf.get(groups[best.host.gi]!.from);
      if (!hostRoom) continue;
      // The line and its dot, on the labels' pass in the name's ink, carrying the room's metadata.
      const { prim: _p, paint, layer: _l, lineWeight: _w, elementPrimary: _e, ...meta } = nameNode;
      const ink = paint.fill ?? "none";
      nodes.push({
        ...meta,
        layer: "labels",
        prim: { t: "line", a: best.a, b: dot },
        paint: { stroke: ink, width: sizes.thin },
        lineWeight: "thin",
      });
      nodes.push({ ...meta, layer: "labels", prim: { t: "circle", center: dot, r }, paint: { fill: ink } });
      drawnLines.push({ a: best.a, b: dot });
      leaders?.push({ room: room.id, host: hostRoom.id, a: best.a, b: dot });
    }

    /** The line from `a` to `b` crosses no text but the label's own, no piece's label, no floor but
     *  the label's own room's and its host's, no leader drawn before it and no wall but one between
     *  those two floors; off the two floors it runs only inside such a wall. */
    function leaderClear(a: Point, b: Point, own: number, host: number): boolean {
      const box = {
        minX: Math.min(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxX: Math.max(a.x, b.x),
        maxY: Math.max(a.y, b.y),
      };
      let ok = true;
      // What the fit reads as text: every text, and every other drawn thing no pass measures its own way.
      grid.forEach(box, (m) => {
        work++;
        if (!ok || m.stale || m.owner === own || m.kind !== "text") return;
        if (segmentMeetsRect(a, b, m.box)) ok = false;
      });
      // And every text as it prints ({@link labelBox}), the labels as they now stand.
      textGrid.forEach(box, (d) => {
        work++;
        if (!ok || d.stale || d.owner === own) return;
        if (segmentMeetsRect(a, b, d.box)) ok = false;
      });
      pieceGrid.forEach(box, (rect) => {
        work++;
        if (ok && segmentMeetsRect(a, b, rect)) ok = false;
      });
      hostGrid.forEach(box, (h) => {
        if (!ok || h.gi === own || h.gi === host) return;
        work += h.ring.length;
        if (segmentEntersRing(a, b, h.ring)) ok = false;
      });
      for (const l of drawnLines) if (ok && segmentsCross(a, b, l.a, l.b)) ok = false;
      if (!ok) return false;
      // The walls it crosses: only those between the two floors, and off the floors it runs only
      // inside one of those (ADR 0035 §2: never out of the building, never through a third wall). A
      // wall band is between them when each floor overlaps the band's box, grown by a millimetre (so
      // rooms drawn to a wall's faces count), by more than t², t the band's thickness: a wall that
      // meets one of them only at a corner overlaps it by about (t/2)², so it is that room's own,
      // and the ground beyond the corner is outside.
      const ownRing = groups[own]!.ring;
      const hostRing = groups[host]!.ring;
      const between: BBox[] = [];
      grid.forEach(box, (m) => {
        work++;
        if (!ok || m.kind !== "wall" || !segmentMeetsRect(a, b, m.box)) return;
        const band = rectRing(grown(m.box, 1));
        const t = Math.min(m.box.w, m.box.h);
        work += ownRing.length + hostRing.length;
        if (clippedArea(band, ownRing) > t * t && clippedArea(band, hostRing) > t * t) between.push(m.box);
        else ok = false;
      });
      if (!ok) return false;
      work += 2 * (ownRing.length + hostRing.length);
      // A piece off both floors lies wholly inside one such wall: both its ends in the same band (by a
      // millimetre), not only its middle, so it cannot run along the wall out past the floors' ends.
      const inside = (q: Point, w: BBox): boolean =>
        q.x >= w.x - 1 && q.x <= w.x + w.w + 1 && q.y >= w.y - 1 && q.y <= w.y + w.h + 1;
      for (const { from, to, mid } of segmentPieces(a, b, [ownRing, hostRing])) {
        work++;
        if (pointInPolygon(mid.x, mid.y, ownRing) || pointInPolygon(mid.x, mid.y, hostRing)) continue;
        if (!between.some((w) => inside(from, w) && inside(to, w) && inside(mid, w))) return false;
      }
      return true;
    }

    /** The line from `a` to `b` crosses a door's swing or a symbol. */
    function leaderOver(a: Point, b: Point): boolean {
      const box = {
        minX: Math.min(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxX: Math.max(a.x, b.x),
        maxY: Math.max(a.y, b.y),
      };
      let over = false;
      grid.forEach(box, (m) => {
        work++;
        if (over || (m.kind !== "swing" && m.kind !== "symbol")) return;
        for (const sh of m.shapes) {
          work += sh.length;
          if (segmentEntersRing(a, b, sh)) over = true;
        }
      });
      return over;
    }
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

/** Where the ray from the centre of `r` toward `t` leaves `r`; null when `t` is inside `r`. */
function exitPoint(r: BBox, t: Point): Point | null {
  if (t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h) return null;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = t.x - cx;
  const dy = t.y - cy;
  const kx = dx === 0 ? Infinity : r.w / 2 / Math.abs(dx);
  const ky = dy === 0 ? Infinity : r.h / 2 / Math.abs(dy);
  const k = Math.min(kx, ky);
  return { x: cx + dx * k, y: cy + dy * k };
}

/** The segment from `a` to `b` passes through the inside of `r` (Liang–Barsky). */
function segmentMeetsRect(a: Point, b: Point, r: BBox): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q > 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, a.x - r.x) && clip(dx, r.x + r.w - a.x) && clip(-dy, a.y - r.y) && clip(dy, r.y + r.h - a.y) && t1 > t0
  );
}

const turn = (a: Point, b: Point, c: Point): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** The segments `a`–`b` and `c`–`d` cross at a point inside both. */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  return turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;
}

/**
 * The segment `a`–`b` cut where it meets an edge of any of `rings`: each piece's two ends and its
 * middle, in order from `a`. A piece is on one ring or off all of them, so a test of its middle says
 * where the whole piece runs.
 */
function segmentPieces(
  a: Point,
  b: Point,
  rings: readonly (readonly Point[])[],
): { from: Point; to: Point; mid: Point }[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ts = [0, 1];
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const c = ring[i]!;
      const d = ring[(i + 1) % ring.length]!;
      const ex = d.x - c.x;
      const ey = d.y - c.y;
      const den = dx * ey - dy * ex;
      if (den === 0) continue;
      const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / den;
      const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
  ts.sort((p, q) => p - q);
  const at = (t: number): Point => ({ x: a.x + dx * t, y: a.y + dy * t });
  const out: { from: Point; to: Point; mid: Point }[] = [];
  for (let k = 1; k < ts.length; k++) {
    if (!(ts[k]! > ts[k - 1]!)) continue;
    out.push({ from: at(ts[k - 1]!), to: at(ts[k]!), mid: at((ts[k - 1]! + ts[k]!) / 2) });
  }
  return out;
}

/** The segment from `a` to `b` crosses an edge of `ring`, or one of its quarter points is inside it. */
export function segmentEntersRing(a: Point, b: Point, ring: readonly Point[]): boolean {
  for (let i = 0; i < ring.length; i++) if (segmentsCross(a, b, ring[i]!, ring[(i + 1) % ring.length]!)) return true;
  for (const t of [0.25, 0.5, 0.75]) {
    if (pointInPolygon(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, ring)) return true;
  }
  return false;
}
