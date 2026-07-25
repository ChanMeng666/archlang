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
import type { LegendEntry, RoomSchedule, SheetTables } from "./sheet-tables.js";
import { layoutSheetTables, translateSheetTables } from "./sheet-tables.js";

/**
 * Chrome geometry as fractions of the drawing's reference dimension. Named (rather
 * than inline) because the sheet layer must reserve exactly the band this chrome
 * occupies without retyping the numbers — see `chromeBandDepth` and `src/sheet.ts`.
 * In paper mode `refDim` is 100 mm of sheet × the scale denominator, so each fraction
 * reads directly as drafting millimetres (0.05 → a 5 mm gap, 0.046 → a 4.6 mm row).
 */
const GAP_F = 0.05;
const SCALEBAR_HGT_F = 0.014;
const SCALEBAR_FS_F = 0.02;
const SCALEBAR_LABEL_F = 1.6;
const SCALEBAR_TARGET_F = 0.3;
const TITLE_W_F = 0.34;
const TITLE_ROW_F = 0.046;
const TITLE_FS_F = 0.019;

/** Standard scale-bar lengths (mm); the bar shows the largest that fits the target. */
const NICE_LENGTHS = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
export function niceBarLength(target: number): number {
  let best = NICE_LENGTHS[0]!;
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
  /**
   * The opt-in sheet tables (`schedule rooms` / `legend`), laid out in a row **below**
   * the scale bar + title block band — or just **above** it once the band is re-anchored
   * to a paper sheet's corners (see {@link anchorChromeToSheet}). Absent entirely when
   * the plan opts into neither, so an existing drawing's chrome object — and therefore
   * its bytes — is unchanged. Named `tables` rather than `sheet` to keep it clear of the
   * paper layer's {@link import("./scene.js").SceneSheet}, a different thing entirely.
   * Lowered to Scene primitives by `sheetTableNodes`, not by the backends.
   */
  tables?: SheetTables;
}

export interface ChromeInput {
  bounds: Bounds;
  refDim: number;
  /** The symmetric page margin (`sizes.margin`); the bottom may grow beyond it. */
  baseMargin: number;
  nodes: readonly SceneNode[];
  title?: TitleNode;
  scale?: string;
  /** Room-schedule rows when the plan set `schedule rooms` (see `sheet-tables.ts`). */
  schedule?: RoomSchedule | null;
  /** Derived legend rows when the plan set `legend`. */
  legend?: readonly LegendEntry[] | null;
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
 * font size (a conservative box that covers any anchor/rotation), and a circle by
 * its centre ± radius.
 *
 * `layers` selects which passes count. The default covers **both** annotation bands
 * that live outside the building — dimensions and the positioning-axis lines/bubbles
 * — so an axis tag grows the page exactly like a dimension does. Pass a narrower set
 * to measure one band on its own (`toScene` measures just `dims` to decide where the
 * axis bubbles go, before those bubbles exist).
 */
const REACH_LAYERS: readonly SceneNode["layer"][] = ["dims", "axes"];

export function dimReach(
  bounds: Bounds,
  nodes: readonly SceneNode[],
  layers: readonly SceneNode["layer"][] = REACH_LAYERS,
): PageMargins {
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
    if (!layers.includes(n.layer)) continue;
    const p = n.prim;
    if (p.t === "line") {
      ext(p.a.x, p.a.y);
      ext(p.b.x, p.b.y);
    } else if (p.t === "text") {
      ext(p.at.x - p.size, p.at.y - p.size);
      ext(p.at.x + p.size, p.at.y + p.size);
    } else if (p.t === "circle") {
      ext(p.center.x - p.r, p.center.y - p.r);
      ext(p.center.x + p.r, p.center.y + p.r);
    }
  }
  return { top: Math.max(0, top), right: Math.max(0, right), bottom: Math.max(0, bottom), left: Math.max(0, left) };
}

/**
 * Lay out the bottom chrome. The scale bar (bottom-left) and title block
 * (bottom-right) share a band that starts just below the deepest bottom dimension,
 * the opt-in sheet tables sit in a second row below that band, and the returned
 * margins are grown so everything fits inside the page.
 */
export function layoutChrome(input: ChromeInput): ChromeLayout {
  const { bounds: b, refDim, baseMargin, nodes } = input;
  const gap = refDim * GAP_F;
  const reach = dimReach(b, nodes);
  const bandTop = b.maxY + reach.bottom + gap;

  const sHgt = refDim * SCALEBAR_HGT_F;
  const sFs = refDim * SCALEBAR_FS_F;
  const scaleBar: ScaleBarBox = {
    x0: b.minX,
    y0: bandTop,
    barLen: niceBarLength(refDim * SCALEBAR_TARGET_F),
    hgt: sHgt,
    fs: sFs,
  };
  const scaleBottom = bandTop + sHgt + sFs * SCALEBAR_LABEL_F;

  const rows = titleRows(input.title, input.scale);
  let titleBlock: TitleBlockBox | null = null;
  let titleBottom = bandTop;
  if (rows.length > 0) {
    const w = refDim * TITLE_W_F;
    const rowH = refDim * TITLE_ROW_F;
    const h = rowH * rows.length;
    titleBlock = {
      x0: b.maxX - w,
      y0: bandTop,
      w,
      h,
      rowH,
      fs: refDim * TITLE_FS_F,
      pad: w * 0.05,
      rows,
    };
    titleBottom = bandTop + h;
  }

  // Sheet tables (`schedule rooms` / `legend`) — a second row under the band. They are
  // annotation-pass geometry, so they never feed `dimReach`; instead their extent grows
  // the bottom/right margins directly here. Null when the plan opted into neither, in
  // which case every expression below reduces to exactly the pre-v1.20 arithmetic.
  const bandBottom = Math.max(scaleBottom, titleBottom);
  const tables = layoutSheetTables({
    bounds: b,
    refDim,
    top: bandBottom + gap,
    schedule: input.schedule ?? null,
    legend: input.legend ?? null,
  });

  const margin: PageMargins = {
    top: Math.max(baseMargin, reach.top + gap),
    right: Math.max(baseMargin, Math.max(reach.right, tables ? tables.right - b.maxX : 0) + gap),
    bottom: Math.max(baseMargin, Math.max(bandBottom, tables ? tables.bottom : bandBottom) - b.maxY + gap),
    left: Math.max(baseMargin, reach.left + gap),
  };
  return { margin, scaleBar, titleBlock, ...(tables ? { tables } : {}) };
}

/**
 * How deep the bottom chrome band is, given a reference dimension and how many title
 * rows will be drawn: a gap above, the taller of the scale bar and the title block,
 * and a gap below. Derived from the same fractions {@link layoutChrome} lays the
 * chrome out with, so the sheet fit test (`src/sheet.ts`) reserves exactly the band
 * that gets drawn instead of guessing at it.
 */
export function chromeBandDepth(refDim: number, titleRowCount: number): number {
  const gap = refDim * GAP_F;
  const scaleBar = refDim * SCALEBAR_HGT_F + refDim * SCALEBAR_FS_F * SCALEBAR_LABEL_F;
  const titleBlock = refDim * TITLE_ROW_F * titleRowCount;
  return gap + Math.max(scaleBar, titleBlock) + gap;
}

/**
 * Move the bottom chrome from beside the drawing to the **sheet's** bottom corners:
 * scale bar bottom-left, title block bottom-right, both inset by `margin`. This is how
 * a real sheet reads, and it is only reachable in paper mode (`src/sheet.ts`), where a
 * fixed page exists to anchor to.
 *
 * The opt-in sheet tables move with the band, but to the row **above** it (nothing fits
 * below the sheet's bottom corners), left-aligned on the same margin — where a
 * draughtsman stacks a schedule. So the whole bottom assembly stays one block whichever
 * anchoring wins.
 *
 * Applied ONLY when that whole assembly — the corner band plus any table row above it —
 * is clear of `contentBottom` (the laid-out drawing plus its grown margins), so
 * re-anchoring can never drop the title block or a table on top of the plan; the caller
 * keeps the drawing-anchored layout otherwise. Pure: returns a new layout, margins
 * untouched (they already sized the content box).
 */
export function anchorChromeToSheet(
  chrome: ChromeLayout,
  page: { x: number; y: number; w: number; h: number },
  margin: number,
  contentBottom: number,
  refDim: number,
): ChromeLayout {
  const gap = refDim * GAP_F;
  const bandH = Math.max(chrome.scaleBar.hgt + chrome.scaleBar.fs * SCALEBAR_LABEL_F, chrome.titleBlock?.h ?? 0);
  const bandTop = page.y + page.h - margin - bandH;
  const t = chrome.tables;
  // The table row sits a gap above the band; its top is what must clear the drawing.
  const tablesTop = t ? bandTop - gap - (t.bottom - t.top) : bandTop;
  if (Math.min(bandTop, tablesTop) < contentBottom) return chrome;
  return {
    margin: chrome.margin,
    scaleBar: { ...chrome.scaleBar, x0: page.x + margin, y0: bandTop },
    titleBlock: chrome.titleBlock
      ? { ...chrome.titleBlock, x0: page.x + page.w - margin - chrome.titleBlock.w, y0: bandTop }
      : null,
    ...(t ? { tables: translateSheetTables(t, page.x + margin - t.left, tablesTop - t.top) } : {}),
  };
}

/** A point on the bottom band, kept here so backends share the witness geometry. */
export type { Point };
