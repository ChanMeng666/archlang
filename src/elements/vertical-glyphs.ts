/**
 * Plan symbols for the vertical-circulation elements (`stair`, `elevator`,
 * `escalator`).
 *
 * The three element modules own their own grammar and resolve rules; the DRAWING lives
 * here once, the way `fixtures-glyphs.ts` holds the fixture symbols — so the tread
 * spacing, the break-line convention and the UP/DN arrow are defined in a single place
 * and every run reads the same on every storey.
 *
 * Everything is parameterised in the run's own frame: `a` measures ALONG the flight from
 * its entry edge (the arrow's tail) toward the far end, `c` measures ACROSS it from the
 * flight centreline. {@link runFrame} maps that frame onto plan millimetres for whichever
 * of the four orientations {@link import("../vertical.js").entryEdges} chose, so no symbol
 * repeats the orientation arithmetic. Pure, closed-form, no trigonometry — output stays
 * byte-stable.
 *
 * Tone follows the fixture symbols' rule (`elements/glyph-lib.ts`): the OUTLINE — the
 * footprint and the direction arrow — is drawn in the derived symbol ink
 * (`symbolInk(furnitureStroke, wallStroke)`), and the interior DETAIL — treads, the break
 * line, a lift car's cross, an escalator's chevrons — in `furnitureStroke`. Every width is
 * the thin pen, as before; only the colours follow the hierarchy, so a stair never reads
 * paler than the sofa beside it.
 */

import type { Point } from "../ast.js";
import type { Diagnostic, Span } from "../diagnostics.js";
import { fmt3 } from "../num-format.js";
import type { Paint, RenderSizes, SceneNode } from "../scene.js";
import type { Theme } from "../theme.js";
import type { RElevator, REscalator, RStair, RStairPiece } from "../ir.js";
import { rectCorners } from "../geometry.js";
import {
  dirLabel,
  flightsOf,
  isBlockStair,
  type RBlockStair,
  runAxis,
  type RVertical,
  tailEdge,
  travelVector,
} from "../vertical.js";
import { symbolInk } from "./glyph-lib.js";

/** The outline tone of a vertical-circulation symbol: the fixtures' derived symbol ink. */
const inkOf = (theme: Theme): string => symbolInk(theme.furnitureStroke, theme.wallStroke);

/** Nominal going (tread depth) in mm — the spacing tread lines are drawn at. */
export const TREAD_GOING_MM = 280;
/** Fewest tread divisions drawn on a flight, however short its footprint. */
const MIN_TREADS = 2;

/** CAD layer names. Stairs and escalators are the stair family; a lift car has its own. */
export const STAIR_LAYER = "A-FLOR-STRS";
export const ELEVATOR_LAYER = "A-FLOR-EVTR";

/**
 * The run's local frame: `at(a, c)` maps a distance `a` along the flight (0 at the entry
 * edge) and an offset `c` across it (0 on the centreline) to a plan point.
 */
export interface RunFrame {
  /** Length of the run along the flight axis (mm). */
  length: number;
  /** Full flight width across the run (mm). */
  width: number;
  at(a: number, c: number): Point;
}

/** Build the local frame for a run: which way it points, how long, how wide. */
export function runFrame(v: RVertical, flightWidth: number): RunFrame {
  const { x, y } = v.at;
  const { w, h } = v.size;
  const axis = runAxis(v);
  const edge = tailEdge(v);
  const length = axis === "y" ? h : w;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const at =
    axis === "y"
      ? edge === "bottom"
        ? (a: number, c: number): Point => ({ x: cx + c, y: y + h - a })
        : (a: number, c: number): Point => ({ x: cx - c, y: y + a })
      : edge === "right"
        ? (a: number, c: number): Point => ({ x: x + w - a, y: cy - c })
        : (a: number, c: number): Point => ({ x: x + a, y: cy + c });
  return { length, width: flightWidth, at };
}

/** How many tread divisions a run of `length` mm gets (≥ {@link MIN_TREADS}). */
export function treadCount(length: number): number {
  return Math.max(MIN_TREADS, Math.round(length / TREAD_GOING_MM));
}

/** The tread divisions {@link stairGlyph}/{@link escalatorGlyph} draw for `v`: the count
 *  of its run frame's length (the frame's width does not change it), for the drawing
 *  budget's estimate (`ElementDef.drawCost`). Held at {@link MAX_RUN_TREADS}: a longer run is
 *  already `E_RUN_TOO_LONG` and is never drawn, so it is not reported a second time. */
export function runTreads(v: RVertical): number {
  return Math.min(treadCount(runFrame(v, 0).length), MAX_RUN_TREADS);
}

/**
 * The most tread divisions one run is drawn with: 1,100 at the {@link TREAD_GOING_MM} going is
 * a run of about 308 m, past the longest built escalator (about 137 m) and the moving walkways
 * an `escalator` also models (150 to 300 m). It is a mechanism bound, not a modelling one: the
 * modelling range alone still let one footprint inside it (`at (-2^25,0) size 2^26x1200`) draw
 * about 240,000 tread lines, and four such escalators filled a 1 GB heap. Measured AT the cap
 * (a 308,139 mm run; Node 24, `compile()`, heap growth / SVG): one escalator 17 ms, 4 MB,
 * 0.21 MB; four 32 ms, 11 MB, 0.84 MB; eight 53 ms, 17 MB, 1.7 MB (a stair draws half the
 * lines). It bounds ONE run; 500 escalators at the cap took 1.6 s, 0.9 GB and 111 MB, so the
 * element cap times this one is still not a small drawing (backlog M.2's kind of bound).
 * A longer run is `E_RUN_TOO_LONG` ({@link runTooLong}), never a silently thinned drawing.
 */
export const MAX_RUN_TREADS = 1_100;

/**
 * `E_RUN_TOO_LONG` for a stair or escalator whose run (its footprint's long side) would be
 * drawn with more than {@link MAX_RUN_TREADS} divisions, else undefined. It holds at every
 * size, inside the modelling range or not; a run that is ALSO out of range is reported once,
 * by `E_OUT_OF_RANGE`, because the resolver drops every other diagnostic of an element it
 * drops (`checkNumberDomain`, `src/ir.ts`).
 */
export function runTooLong(
  what: string,
  size: { w: number; h: number },
  span: Span | undefined,
): Diagnostic | undefined {
  const run = Math.max(size.w, size.h);
  if (treadCount(run) <= MAX_RUN_TREADS) return undefined;
  return {
    severity: "error",
    message:
      `${what} runs ${fmt3(run)} mm: more than ${MAX_RUN_TREADS} treads at the ${TREAD_GOING_MM} mm going ` +
      `(about ${fmt3((MAX_RUN_TREADS * TREAD_GOING_MM) / 1000)} m), longer than any run the plan draws`,
    code: "E_RUN_TOO_LONG",
    span,
  };
}

/** A stroked line node on the run's layer. */
function line(a: Point, b: Point, layerName: string, paint: Paint): SceneNode {
  return { layer: "furniture", layerName, prim: { t: "line", a, b }, paint };
}

/**
 * The direction arrow: a shaft along the centreline from near the entry edge to near the
 * far end, with a two-stroke head, in the symbol ink. Plus the `UP`/`DN` word at the tail,
 * in the first tread cell — the conventional place to read a flight's direction from — in
 * the stair's label colour (`annotation`, which `style stair { label … }` sets).
 */
function arrow(f: RunFrame, label: string, layerName: string, theme: Theme, sizes: RenderSizes): SceneNode[] {
  const stroke: Paint = { stroke: inkOf(theme), width: sizes.thin, fill: "none" };
  const step = f.length / treadCount(f.length);
  const tail = Math.min(step * 1.2, f.length * 0.3);
  const head = f.length - Math.min(step * 0.4, f.length * 0.12);
  const barb = Math.min(f.width * 0.28, (head - tail) * 0.25);
  const out: SceneNode[] = [
    line(f.at(tail, 0), f.at(head, 0), layerName, stroke),
    line(f.at(head, 0), f.at(head - barb, barb * 0.6), layerName, stroke),
    line(f.at(head, 0), f.at(head - barb, -barb * 0.6), layerName, stroke),
  ];
  out.push(runWord(f, step, label, layerName, theme, sizes));
  return out;
}

/** The `UP`/`DN` word, in the first tread cell of the flight boarded. */
function runWord(
  f: RunFrame,
  step: number,
  label: string,
  layerName: string,
  theme: Theme,
  sizes: RenderSizes,
): SceneNode {
  return {
    layer: "furniture",
    layerName,
    prim: {
      t: "text",
      at: f.at(Math.min(step * 0.5, f.length * 0.14), 0),
      value: label,
      size: sizes.furnFont,
      anchor: "middle",
      baseline: "central",
    },
    paint: { fill: theme.annotation },
  };
}

/** The footprint rectangle every run draws under its symbol. */
function footprint(v: RStairPiece, layerName: string, theme: Theme, sizes: RenderSizes): SceneNode {
  return {
    layer: "furniture",
    layerName,
    prim: { t: "polygon", pts: rectCorners(v.at.x, v.at.y, v.size.w, v.size.h) },
    paint: { fill: theme.furnitureFill, stroke: inkOf(theme), width: sizes.thin },
  };
}

/**
 * The stair symbol: tread lines across the flight at the nominal going, a **break line**
 * (the paired-diagonal cut convention) at mid-flight with the treads it crosses omitted,
 * and the UP/DN direction arrow. When the authored `width` is narrower than the
 * footprint's cross extent the flight band is centred in the footprint and the remainder
 * is left as an un-drawn return/void. A block stair draws {@link blockStairGlyph}.
 */
export function stairGlyph(s: RStair, theme: Theme, sizes: RenderSizes): SceneNode[] {
  if (isBlockStair(s)) return blockStairGlyph(s, theme, sizes);
  const f = runFrame(s, s.width);
  const nodes = flightSymbol(s, f, "full", theme, sizes);
  nodes.push(...arrow(f, dirLabel(s.dir), STAIR_LAYER, theme, sizes));
  return nodes;
}

/**
 * How a flight's break line is drawn: not at all, `full` (a straight stair's, each diagonal rising
 * half the flight's width), or `shallow`, held to a quarter of the run, for a flight of a block:
 * those are short, and a full cut on a square flight omits every tread it has.
 */
type FlightCut = "none" | "full" | "shallow";

/** One flight's footprint, treads and band edges, and its break line. */
function flightSymbol(s: RStair, f: RunFrame, cut: FlightCut, theme: Theme, sizes: RenderSizes): SceneNode[] {
  const layer = STAIR_LAYER;
  const stroke: Paint = { stroke: theme.furnitureStroke, width: sizes.thin, fill: "none" };
  const nodes: SceneNode[] = [footprint(s, layer, theme, sizes)];

  const n = treadCount(f.length);
  const step = f.length / n;
  const half = f.width / 2;

  // Break line: two parallel diagonals crossing the flight at mid-run, each rising by
  // half the flight width over the crossing (a ~26° cut) and separated along the run by
  // one going. Treads inside the cut band are omitted, as a drawn break omits them.
  const mid = f.length / 2;
  // Along-run rise of one diagonal across the full width.
  const rise = cut === "shallow" ? Math.min(half, f.length / 4) : half;
  const gap = Math.min(step, f.length / 6);
  const over = f.width * 0.06; // the diagonals overshoot the flight edges slightly
  const band = gap / 2 + rise / 2;
  // The cut is the symbol's one HANDED part (everything else is symmetric across the
  // centreline), so a reflected stair (`_mirror`) negates its cross coordinate — exactly,
  // since `half + over` is the negation of `-half - over`.
  const lo = -half - over;
  const hi = half + over;
  const [c0, c1] = s._mirror ? [hi, lo] : [lo, hi];
  if (cut !== "none") {
    for (const off of [-gap / 2, gap / 2]) {
      nodes.push(line(f.at(mid + off - rise / 2, c0), f.at(mid + off + rise / 2, c1), layer, stroke));
    }
  }

  for (let i = 1; i < n; i++) {
    const a = i * step;
    if (cut !== "none" && Math.abs(a - mid) <= band) continue;
    nodes.push(line(f.at(a, -half), f.at(a, half), layer, stroke));
  }
  // The flight band's own long edges, drawn only when it is narrower than the footprint
  // (otherwise they would double the footprint rectangle's own edges).
  const cross = runAxis(s) === "y" ? s.size.w : s.size.h;
  if (f.width < cross) {
    nodes.push(line(f.at(0, -half), f.at(f.length, -half), layer, stroke));
    nodes.push(line(f.at(0, half), f.at(f.length, half), layer, stroke));
  }
  return nodes;
}

/** The walking line's way across a landing, from `p` (where the flight before it ends) to `q`
 *  (where the flight after it starts), turning at right angles: the points between them. */
function acrossLanding(p: Point, q: Point, before: RStair, after: RStair, landing: RStairPiece): Point[] {
  const d0 = travelVector(before);
  const d1 = travelVector(after);
  const parallel = d0.x * d1.x + d0.y * d1.y !== 0;
  if (!parallel) return d0.y !== 0 ? [{ x: p.x, y: q.y }] : [{ x: q.x, y: p.y }];
  // In line, or a half-turn or a jog: out to the landing's middle, across, and on.
  if (d0.y !== 0) {
    if (p.x === q.x && d0.y === d1.y) return [];
    const y = landing.at.y + landing.size.h / 2;
    return [
      { x: p.x, y },
      { x: q.x, y },
    ];
  }
  if (p.y === q.y && d0.x === d1.x) return [];
  const x = landing.at.x + landing.size.w / 2;
  return [
    { x, y: p.y },
    { x, y: q.y },
  ];
}

/** The walk's length on one landing between two flights in climbing order: {@link acrossLanding}'s. */
function landingWalk(before: RStair, after: RStair, landing: RStairPiece): number {
  const f0 = runFrame(before, 0);
  const f1 = runFrame(after, 0);
  const p = f0.at(f0.length, 0);
  const q = f1.at(0, 0);
  let at = p;
  let walked = 0;
  for (const next of [...acrossLanding(p, q, before, after, landing), q]) {
    walked += Math.abs(next.x - at.x) + Math.abs(next.y - at.y);
    at = next;
  }
  return walked;
}

/**
 * Which flight, in climbing order, carries a block stair's one break line: the flight holding the
 * walking line's midpoint, or the flight before it when the midpoint is on a landing. Fixed by
 * authored geometry alone, so no height draws, and in climbing order, so a block copied between
 * storeys keeps its cut when only `dir` changes.
 */
export function cutFlight(s: RBlockStair): number {
  const flights = flightsOf(s);
  const walks = s.landings.map((l, i) =>
    s.dir === "up" ? landingWalk(flights[i]!, flights[i + 1]!, l) : landingWalk(flights[i + 1]!, flights[i]!, l),
  );
  const runs = flights.map((f) => runFrame(f, 0).length);
  const half = (runs.reduce((a, b) => a + b, 0) + walks.reduce((a, b) => a + b, 0)) / 2;
  let walked = 0;
  for (let i = 0; i < runs.length; i++) {
    walked += runs[i]!;
    if (walked >= half) return i;
    walked += walks[i] ?? 0;
    if (walked >= half) return i;
  }
  return runs.length - 1;
}

/**
 * One stair of several pieces: each flight as a straight one draws, each landing its outline and
 * no treads, one break line ({@link cutFlight}), and one walking line through the middle of every
 * piece, boarded where {@link RStair.dir} says, to one arrowhead, with one UP/DN in the first tread
 * cell of the flight boarded. The treads stay at the nominal going whatever the storey height:
 * nothing here reads a height.
 *
 * The walking line is several `line` primitives, never one long path: a label is kept off each
 * primitive's box (`src/label-placement.ts`), and a turning line's box holds the floor it turns round.
 */
function blockStairGlyph(s: RBlockStair, theme: Theme, sizes: RenderSizes): SceneNode[] {
  const layer = STAIR_LAYER;
  const climb = flightsOf(s);
  const cut = cutFlight(s);
  const nodes: SceneNode[] = [];
  climb.forEach((f, i) => {
    nodes.push(...flightSymbol(f, runFrame(f, s.width), i === cut ? "shallow" : "none", theme, sizes));
    const landing = s.landings[i];
    if (landing) nodes.push(footprint(landing, layer, theme, sizes));
  });

  const up = s.dir === "up";
  const walk = up ? climb : [...climb].reverse();
  const frames = walk.map((f) => runFrame(f, s.width));
  const first = frames[0]!;
  const last = frames[frames.length - 1]!;
  const step = first.length / treadCount(first.length);
  const lastStep = last.length / treadCount(last.length);
  const head = last.length - Math.min(lastStep * 0.4, last.length * 0.12);
  const points: Point[] = [first.at(Math.min(step * 1.2, first.length * 0.3), 0)];
  frames.forEach((f, i) => {
    if (i > 0) {
      const before = frames[i - 1]!;
      const landing = s.landings[up ? i - 1 : s.landings.length - i]!;
      points.push(
        ...acrossLanding(before.at(before.length, 0), f.at(0, 0), walk[i - 1]!, walk[i]!, landing),
        f.at(0, 0),
      );
    }
    if (i < frames.length - 1) points.push(f.at(f.length, 0));
  });
  points.push(last.at(head, 0));

  const ink: Paint = { stroke: inkOf(theme), width: sizes.thin, fill: "none" };
  for (let i = 1; i < points.length; i++) nodes.push(line(points[i - 1]!, points[i]!, layer, ink));
  const barb = Math.min(last.width * 0.28, head * 0.25);
  nodes.push(line(last.at(head, 0), last.at(head - barb, barb * 0.6), layer, ink));
  nodes.push(line(last.at(head, 0), last.at(head - barb, -barb * 0.6), layer, ink));
  nodes.push(runWord(first, step, dirLabel(s.dir), layer, theme, sizes));
  return nodes;
}

/** The lift symbol: the car rectangle with the conventional crossed diagonals. */
export function elevatorGlyph(e: RElevator, theme: Theme, sizes: RenderSizes): SceneNode[] {
  const layer = ELEVATOR_LAYER;
  const stroke: Paint = { stroke: theme.furnitureStroke, width: sizes.thin, fill: "none" };
  const { x, y } = e.at;
  const { w, h } = e.size;
  return [
    footprint(e, layer, theme, sizes),
    line({ x, y }, { x: x + w, y: y + h }, layer, stroke),
    line({ x: x + w, y }, { x, y: y + h }, layer, stroke),
  ];
}

/** The escalator symbol: parallel chevrons pointing the way of travel, plus the arrow. */
export function escalatorGlyph(e: REscalator, theme: Theme, sizes: RenderSizes): SceneNode[] {
  const cross = runAxis(e) === "y" ? e.size.w : e.size.h;
  const f = runFrame(e, cross);
  const layer = STAIR_LAYER;
  const stroke: Paint = { stroke: theme.furnitureStroke, width: sizes.thin, fill: "none" };
  const nodes: SceneNode[] = [footprint(e, layer, theme, sizes)];

  const n = treadCount(f.length);
  const step = f.length / n;
  const half = f.width / 2;
  const apex = Math.min(half * 0.6, step * 0.8);
  for (let i = 1; i < n; i++) {
    const a = i * step;
    if (a + apex > f.length) break;
    nodes.push(line(f.at(a, -half), f.at(a + apex, 0), layer, stroke));
    nodes.push(line(f.at(a, half), f.at(a + apex, 0), layer, stroke));
  }

  nodes.push(...arrow(f, dirLabel(e.dir), layer, theme, sizes));
  return nodes;
}
