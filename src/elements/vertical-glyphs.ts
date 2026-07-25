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
 */

import type { Point } from "../ast.js";
import type { Paint, RenderSizes, SceneNode } from "../scene.js";
import type { Theme } from "../theme.js";
import type { RElevator, REscalator, RStair } from "../ir.js";
import { rectCorners } from "../geometry.js";
import { dirLabel, flightAxis, type RVertical, tailEdge } from "../vertical.js";

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
  const axis = flightAxis(v.size);
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

/** A stroked line node on the run's layer. */
function line(a: Point, b: Point, layerName: string, paint: Paint): SceneNode {
  return { layer: "furniture", layerName, prim: { t: "line", a, b }, paint };
}

/**
 * The direction arrow: a shaft along the centreline from near the entry edge to near the
 * far end, with a two-stroke head. Plus the `UP`/`DN` word at the tail, in the first
 * tread cell — the conventional place to read a flight's direction from.
 */
function arrow(f: RunFrame, label: string, layerName: string, theme: Theme, sizes: RenderSizes): SceneNode[] {
  const stroke: Paint = { stroke: theme.annotation, width: sizes.thin, fill: "none" };
  const step = f.length / treadCount(f.length);
  const tail = Math.min(step * 1.2, f.length * 0.3);
  const head = f.length - Math.min(step * 0.4, f.length * 0.12);
  const barb = Math.min(f.width * 0.28, (head - tail) * 0.25);
  const out: SceneNode[] = [
    line(f.at(tail, 0), f.at(head, 0), layerName, stroke),
    line(f.at(head, 0), f.at(head - barb, barb * 0.6), layerName, stroke),
    line(f.at(head, 0), f.at(head - barb, -barb * 0.6), layerName, stroke),
  ];
  out.push({
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
  });
  return out;
}

/** The footprint rectangle every run draws under its symbol. */
function footprint(v: RVertical, layerName: string, theme: Theme, sizes: RenderSizes): SceneNode {
  return {
    layer: "furniture",
    layerName,
    prim: { t: "polygon", pts: rectCorners(v.at.x, v.at.y, v.size.w, v.size.h) },
    paint: { fill: theme.furnitureFill, stroke: theme.furnitureStroke, width: sizes.thin },
  };
}

/**
 * The stair symbol: tread lines across the flight at the nominal going, a **break line**
 * (the paired-diagonal cut convention) at mid-flight with the treads it crosses omitted,
 * and the UP/DN direction arrow. When the authored `width` is narrower than the
 * footprint's cross extent the flight band is centred in the footprint and the remainder
 * is left as an un-drawn return/void (v1 draws a single straight flight).
 */
export function stairGlyph(s: RStair, theme: Theme, sizes: RenderSizes): SceneNode[] {
  const f = runFrame(s, s.width);
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
  const rise = half; // along-run rise of one diagonal across the full width
  const gap = Math.min(step, f.length / 6);
  const over = f.width * 0.06; // the diagonals overshoot the flight edges slightly
  const band = gap / 2 + rise / 2;
  for (const off of [-gap / 2, gap / 2]) {
    nodes.push(line(f.at(mid + off - rise / 2, -half - over), f.at(mid + off + rise / 2, half + over), layer, stroke));
  }

  for (let i = 1; i < n; i++) {
    const a = i * step;
    if (Math.abs(a - mid) <= band) continue;
    nodes.push(line(f.at(a, -half), f.at(a, half), layer, stroke));
  }
  // The flight band's own long edges, drawn only when it is narrower than the footprint
  // (otherwise they would double the footprint rectangle's own edges).
  const cross = flightAxis(s.size) === "y" ? s.size.w : s.size.h;
  if (f.width < cross) {
    nodes.push(line(f.at(0, -half), f.at(f.length, -half), layer, stroke));
    nodes.push(line(f.at(0, half), f.at(f.length, half), layer, stroke));
  }

  nodes.push(...arrow(f, dirLabel(s.dir), layer, theme, sizes));
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
  const cross = flightAxis(e.size) === "y" ? e.size.w : e.size.h;
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
