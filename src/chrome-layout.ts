/**
 * Shared page-chrome layout — the deterministic geometry of the **scale bar** and
 * **title block** in the bottom page margin, and how far the bottom margin must
 * grow to contain them. Both the SVG and PDF backends build their chrome from this
 * one source so the two never drift, and — crucially — so the title block is laid
 * out *below* the bottom dimension band rather than being crossed by it (the
 * "title block obscured by the 7000 dimension" bug).
 *
 * Pure and deterministic: closed-form arithmetic over the resolved scene, no I/O.
 * The north arrow sits in the top margin (never part of the bottom collision) and
 * stays in each backend.
 */

import type { Point, TitleNode } from "./ast.js";
import type { Bounds } from "./geometry.js";
import type { SceneNode } from "./scene.js";

/** Standard scale-bar lengths (mm); the bar shows the largest that fits the target. */
const NICE_LENGTHS = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
export function niceBarLength(target: number): number {
  let best = NICE_LENGTHS[0];
  for (const v of NICE_LENGTHS) if (v <= target) best = v;
  return best;
}

export interface TitleRow {
  k: string;
  v: string;
}

export interface ScaleBarBox {
  x0: number;
  y0: number;
  barLen: number;
  hgt: number;
  fs: number;
}

export interface TitleBlockBox {
  x0: number;
  y0: number;
  w: number;
  h: number;
  rowH: number;
  fs: number;
  pad: number;
  rows: TitleRow[];
}

/** Per-side page margins (mm); each ≥ baseMargin, grown to contain annotations. */
export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChromeLayout {
  /** Per-side page margins, grown so dims and the bottom chrome never clip. */
  margin: PageMargins;
  scaleBar: ScaleBarBox;
  titleBlock: TitleBlockBox | null;
}

export interface ChromeInput {
  bounds: Bounds;
  refDim: number;
  /** The symmetric page margin (`sizes.margin`); the bottom may grow beyond it. */
  baseMargin: number;
  nodes: readonly SceneNode[];
  title?: TitleNode;
  scale?: string;
}

/** The title-block rows that exist (project/drawn-by/date, plus scale if present). */
export function titleRows(title: TitleNode | undefined, scale: string | undefined): TitleRow[] {
  const rows: TitleRow[] = [];
  if (title?.project) rows.push({ k: "PROJECT", v: title.project });
  if (title?.drawnBy) rows.push({ k: "DRAWN BY", v: title.drawnBy });
  if (title?.date) rows.push({ k: "DATE", v: title.date });
  if (scale) rows.push({ k: "SCALE", v: scale });
  return rows;
}

/**
 * How far the dimension annotations reach beyond the plan footprint on each side
 * (mm past the matching bound, never negative). Drives both the bottom chrome band
 * and the grown page margins, so neither a bottom dimension nor a side dimension
 * (e.g. a right-edge `offset` larger than the base margin) ever clips the page.
 * Line endpoints are exact; text is bounded by its anchor point inflated by its
 * font size (a conservative box that covers any anchor/rotation).
 */
export function dimReach(bounds: Bounds, nodes: readonly SceneNode[]): PageMargins {
  let top = 0;
  let right = 0;
  let bottom = 0;
  let left = 0;
  const ext = (x: number, y: number): void => {
    top = Math.max(top, bounds.minY - y);
    right = Math.max(right, x - bounds.maxX);
    bottom = Math.max(bottom, y - bounds.maxY);
    left = Math.max(left, bounds.minX - x);
  };
  for (const n of nodes) {
    if (n.layer !== "dims") continue;
    const p = n.prim;
    if (p.t === "line") {
      ext(p.a.x, p.a.y);
      ext(p.b.x, p.b.y);
    } else if (p.t === "text") {
      ext(p.at.x - p.size, p.at.y - p.size);
      ext(p.at.x + p.size, p.at.y + p.size);
    }
  }
  return { top: Math.max(0, top), right: Math.max(0, right), bottom: Math.max(0, bottom), left: Math.max(0, left) };
}

/**
 * Lay out the bottom chrome. The scale bar (bottom-left) and title block
 * (bottom-right) share a band that starts just below the deepest bottom dimension,
 * and the returned `bottomMargin` is grown so both fit inside the page.
 */
export function layoutChrome(input: ChromeInput): ChromeLayout {
  const { bounds: b, refDim, baseMargin, nodes } = input;
  const gap = refDim * 0.05;
  const reach = dimReach(b, nodes);
  const bandTop = b.maxY + reach.bottom + gap;

  const sHgt = refDim * 0.014;
  const sFs = refDim * 0.02;
  const scaleBar: ScaleBarBox = {
    x0: b.minX,
    y0: bandTop,
    barLen: niceBarLength(refDim * 0.3),
    hgt: sHgt,
    fs: sFs,
  };
  const scaleBottom = bandTop + sHgt + sFs * 1.6;

  const rows = titleRows(input.title, input.scale);
  let titleBlock: TitleBlockBox | null = null;
  let titleBottom = bandTop;
  if (rows.length > 0) {
    const w = refDim * 0.34;
    const rowH = refDim * 0.046;
    const h = rowH * rows.length;
    titleBlock = {
      x0: b.maxX - w,
      y0: bandTop,
      w,
      h,
      rowH,
      fs: refDim * 0.019,
      pad: w * 0.05,
      rows,
    };
    titleBottom = bandTop + h;
  }

  const margin: PageMargins = {
    top: Math.max(baseMargin, reach.top + gap),
    right: Math.max(baseMargin, reach.right + gap),
    bottom: Math.max(baseMargin, Math.max(scaleBottom, titleBottom) - b.maxY + gap),
    left: Math.max(baseMargin, reach.left + gap),
  };
  return { margin, scaleBar, titleBlock };
}

/** A point on the bottom band, kept here so backends share the witness geometry. */
export type { Point };
