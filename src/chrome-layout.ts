/**
 * Shared page-chrome layout — the deterministic geometry of the **scale bar** and
 * **title block** in the bottom page margin, and how far the bottom margin must
 * grow to contain them. Both the SVG and PDF backends build their chrome from this
 * one source so the two never drift, and — crucially — so the title block is laid
 * out *below* the bottom dimension band rather than being crossed by it (the
 * "title block obscured by the 7000 dimension" bug).
 *
 * Pure and deterministic: closed-form arithmetic over the resolved scene, no I/O.
 * The north arrow sits in the top margin, never part of the bottom collision; where it
 * goes is {@link northArrowBox}, which `toScene` runs once the page is known.
 */

import type { ChromeHide, Point, TitleNode } from "./ast.js";
import type { Bounds } from "./geometry.js";
import type { BBox } from "./geometry/rect.js";
import { primBBox } from "./label-placement.js";
import type { SceneNode } from "./scene.js";
import type { LegendEntry, RoomSchedule, SheetTables } from "./sheet-tables.js";
import { layoutSheetTables, tableRowsHeight, translateSheetTables } from "./sheet-tables.js";
import type { OpeningRow } from "./opening-schedule.js";
import { PLAIN_SHEET_TEXT, type SheetText } from "./sheet-text.js";
import { inkWidth, textWidth } from "./text-metrics.js";

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

/**
 * The title block's size, row height, value font size and side padding for a drawing of
 * reference dimension `refDim` — the one formula {@link layoutChrome} lays the block out
 * with and every backend draws it from (each row: the caption left-aligned at `pad`, the
 * value right-aligned at `w - pad`, at `fs`; the caption at `0.8 * fs`). Exported so
 * `W_TITLE_OVERFLOW` (`src/lint/rules/annotations.ts`) measures a row against the geometry
 * that is drawn rather than a retyped copy of it.
 */
export function titleBlockMetrics(refDim: number): { w: number; rowH: number; fs: number; pad: number } {
  const w = refDim * TITLE_W_F;
  return { w, rowH: refDim * TITLE_ROW_F, fs: refDim * TITLE_FS_F, pad: w * 0.05 };
}

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
  /** The length's words with the plan's decimal mark. Absent with no `sheet text`, as it always was. */
  label?: string;
  /** `scale … hidden`: laid out for no one. Backends draw nothing and the band keeps no room for it. */
  hidden?: true;
}

/** The words at the end of the scale bar. */
export const scaleBarLabel = (s: ScaleBarBox): string => s.label ?? `${s.barLen / 1000} m`;

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
  /**
   * Where the north arrow is drawn, present exactly when {@link northArrowBox} put it somewhere
   * other than its historical spot (so its `spot` is `corner`, `right`, `top` or `grown`).
   * Absent when the arrow stands at the historical spot (that spot is clear, or a sheet has no
   * room elsewhere), with `north … hidden`, and on a hand-built Scene. The backends then draw it
   * at {@link historicalNorth}`(scene.bounds, scene.sizes.margin, scene.sizes.refDim)`, where it
   * always stood; an absent field keeps that drawing's Scene byte-identical to before.
   */
  north?: NorthArrowBox;
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
  /** DOOR & WINDOW SCHEDULE rows when the plan set `schedule openings`. */
  openings?: readonly OpeningRow[] | null;
  /** The plan's `notes`, when it wrote any. */
  notes?: readonly string[] | null;
  /** Which storey this page draws, for a multi-storey plan (see {@link titleRows}). */
  level?: LevelStamp;
  /** The plan's `sheet text`. Absent means the English, as for a plan that writes none. */
  text?: SheetText;
  /** The marks the plan hides. */
  hide?: ChromeHide;
}

/**
 * Which storey a page draws — the identity a multi-storey drawing SET must carry, so two
 * pages of the same building are not indistinguishable. Absent for a single-storey plan.
 */
export interface LevelStamp {
  level: number;
  name?: string;
}

/**
 * The title-block rows that exist (project/drawn-by/date, plus scale if present, plus the
 * storey for a multi-storey plan).
 *
 * The `LEVEL` row is what makes a drawing set readable: with `level` blocks every page is
 * stamped `LEVEL: 1 — Ground floor`, and a plan whose only title-block content is that
 * row still gets a title block. A single-storey plan passes no stamp, so its rows — and
 * therefore its bytes — are exactly as before.
 */
export function titleRows(
  title: TitleNode | undefined,
  scale: string | undefined,
  level?: LevelStamp,
  text: SheetText = PLAIN_SHEET_TEXT,
): TitleRow[] {
  const rows: TitleRow[] = [];
  if (title?.project) rows.push({ k: text.word("project"), v: title.project });
  if (title?.drawnBy) rows.push({ k: text.word("drawn_by"), v: title.drawnBy });
  if (title?.date) rows.push({ k: text.word("date"), v: title.date });
  // The drawing's identity on a set: its number and revision, each a row only when written.
  if (title?.number) rows.push({ k: text.word("number"), v: title.number });
  if (title?.revision) rows.push({ k: text.word("revision"), v: title.revision });
  if (scale) rows.push({ k: text.word("scale"), v: text.num(scale) });
  if (level) {
    const stamp = text.num(String(level.level));
    rows.push({ k: text.word("level"), v: level.name ? `${stamp} — ${level.name}` : stamp });
  }
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
  const text = input.text ?? PLAIN_SHEET_TEXT;
  if (text !== PLAIN_SHEET_TEXT) scaleBar.label = text.num(scaleBarLabel(scaleBar));
  if (input.hide?.scale) scaleBar.hidden = true;
  const scaleBottom = input.hide?.scale ? bandTop : bandTop + sHgt + sFs * SCALEBAR_LABEL_F;

  const rows = input.hide?.title ? [] : titleRows(input.title, input.scale, input.level, text);
  let titleBlock: TitleBlockBox | null = null;
  let titleBottom = bandTop;
  if (rows.length > 0) {
    const { w, rowH, fs, pad } = titleBlockMetrics(refDim);
    const h = rowH * rows.length;
    titleBlock = {
      x0: b.maxX - w,
      y0: bandTop,
      w,
      h,
      rowH,
      fs,
      pad,
      rows,
    };
    titleBottom = bandTop + h;
  }

  // Sheet tables (`schedule rooms` / `legend`) — a second row under the band. They are
  // annotation-pass geometry, so they never feed `dimReach`; instead their extent grows
  // the bottom/right margins directly here. Null when the plan opted into neither, in
  // which case every expression below reduces to the table-free arithmetic.
  const bandBottom = Math.max(scaleBottom, titleBottom);
  const tables = layoutSheetTables({
    bounds: b,
    refDim,
    top: bandBottom + gap,
    schedule: input.schedule ?? null,
    legend: input.legend ?? null,
    openings: input.openings ?? null,
    notes: input.notes ?? null,
    text,
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
 * that gets drawn instead of guessing at it. With nothing drawn in it there is no band.
 */
export function chromeBandDepth(refDim: number, titleRowCount: number, scaleBarHidden = false): number {
  if (scaleBarHidden && titleRowCount === 0) return 0;
  const gap = refDim * GAP_F;
  const scaleBar = scaleBarHidden ? 0 : refDim * SCALEBAR_HGT_F + refDim * SCALEBAR_FS_F * SCALEBAR_LABEL_F;
  const titleBlock = refDim * TITLE_ROW_F * titleRowCount;
  return gap + Math.max(scaleBar, titleBlock) + gap;
}

/**
 * How deep the MARGIN-TABLE row is — the second band, below the scale bar / title block:
 * a gap, then the taller of the schedule and the legend.
 *
 * The counterpart of {@link chromeBandDepth}, and it exists for the same reason: the sheet
 * fit rule must reserve exactly what {@link layoutChrome} lays out. It did not, and the
 * consequence was a page issued 25 mm taller than the A3 it declared while
 * `describe().sheet.fits` said `true` and no `W_SCALE_OVERFLOW` fired — the drawing fitted,
 * and the drawing was never what overflowed. Row heights come from `sheet-tables.ts`
 * (`tableRowsHeight`), never retyped here.
 *
 * `0` for a plan that opted into neither table, which is what keeps its arithmetic — and
 * its bytes — exactly as before.
 */
export function tableBandDepth(refDim: number, tableRowCount: number): number {
  if (tableRowCount <= 0) return 0;
  return refDim * GAP_F + tableRowsHeight(refDim, tableRowCount);
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
  const barH = chrome.scaleBar.hidden ? 0 : chrome.scaleBar.hgt + chrome.scaleBar.fs * SCALEBAR_LABEL_F;
  const bandH = Math.max(barH, chrome.titleBlock?.h ?? 0);
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

// ---------------------------------------------------------------------------
// The north arrow
// ---------------------------------------------------------------------------

/** The arrow's radius and its label's font size, as fractions of `refDim` (4.5 mm and 2.6 mm on paper). */
const NORTH_R_F = 0.045;
const NORTH_FS_F = 0.026;
/** How far above the drawing the arrow has always been centred, as a fraction of the base margin. */
const NORTH_DROP_F = 0.55;

/**
 * Which rule of {@link northArrowBox} placed the arrow: its historical spot (`historical`),
 * the page's top-right corner square beyond both dimension bands (`corner`), the top of the
 * strip right of the right-hand band (`right`), the right end of the strip above the top band
 * (`top`), a corner square the page grew to make (`grown`, never on a sheet), or, on a sheet
 * where nothing fits, the historical spot although it is not clear (`blocked`). `toScene`
 * records the placement on `ChromeLayout.north` only for the four that move the arrow, so a
 * Scene never carries `historical` or `blocked`.
 */
export type NorthSpot = "historical" | "corner" | "right" | "top" | "grown" | "blocked";

/** Where the north arrow is drawn, and the ink it puts on the page. */
export interface NorthArrowBox {
  /** The triangle's centre, which it turns about. */
  cx: number;
  cy: number;
  /** The triangle's radius: its tip is `r` from the centre. */
  r: number;
  /** The label's font size; the label is centred `r + 0.8 * fs` from the centre, toward north. */
  fs: number;
  /** The drawn ink's axis-aligned extent: the turned triangle and the upright label. */
  box: BBox;
  spot: NorthSpot;
}

/** The arrow's radius and label size for a drawing of reference dimension `refDim`. */
export function northArrowMetrics(refDim: number): { r: number; fs: number } {
  return { r: refDim * NORTH_R_F, fs: refDim * NORTH_FS_F };
}

/**
 * The arrow's historical spot: its right edge on the drawing's right bound, its centre a little
 * over half the base margin above the drawing. Where every arrow stood before AL1, and where it
 * still stands when that spot is clear of the dimension bands. The same arithmetic, in the same
 * order, as the backends always ran, so a plan whose arrow stays keeps its bytes. Public: a
 * consumer reading a Scene with no `chrome.north` finds the arrow here, from `scene.bounds`,
 * `scene.sizes.margin` and `scene.sizes.refDim`.
 */
export function historicalNorth(
  bounds: Bounds,
  baseMargin: number,
  refDim: number,
): { cx: number; cy: number; r: number; fs: number } {
  const { r, fs } = northArrowMetrics(refDim);
  return { cx: bounds.maxX - r, cy: bounds.minY - baseMargin * NORTH_DROP_F, r, fs };
}

/**
 * The axis-aligned extent of the arrow drawn at (`cx`, `cy`) turned `deg` clockwise: the four
 * triangle points the backends draw, turned about the centre, and the label's box, centred at the
 * pointing end, as wide as the wider of the two width estimates and one font size tall.
 */
export function northArrowInk(cx: number, cy: number, r: number, fs: number, deg: number, word: string): BBox {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const tri: ReadonlyArray<readonly [number, number]> = [
    [0, -r],
    [-r * 0.5, r * 0.6],
    [0, r * 0.25],
    [r * 0.5, r * 0.6],
  ];
  const lx = cx + s * (r + fs * 0.8);
  const ly = cy - c * (r + fs * 0.8);
  const hw = Math.max(textWidth(word, fs), inkWidth(word, fs)) / 2;
  let x0 = lx - hw;
  let x1 = lx + hw;
  let y0 = ly - fs / 2;
  let y1 = ly + fs / 2;
  for (const [px, py] of tri) {
    const x = cx + px * c - py * s;
    const y = cy + px * s + py * c;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Do two rectangles share an interior point? (Touching edges do not.) */
const rectsOverlap = (a: BBox, b: BBox): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Does a drawn primitive put ink inside the OPEN rectangle `box`? A line is tested as the segment
 * it is (clipped to the closed rectangle, it is inside when the clipped piece's midpoint is
 * strictly inside, so a line that only runs along or touches the edge is not); anything else by
 * its box ({@link primBBox}), which is how the label passes measure it.
 */
export function primInkInside(prim: SceneNode["prim"], box: BBox): boolean {
  if (prim.t === "line") {
    const dx = prim.b.x - prim.a.x;
    const dy = prim.b.y - prim.a.y;
    const p = [-dx, dx, -dy, dy];
    const q = [prim.a.x - box.x, box.x + box.w - prim.a.x, prim.a.y - box.y, box.y + box.h - prim.a.y];
    let t0 = 0;
    let t1 = 1;
    for (let i = 0; i < 4; i++) {
      const pi = p[i]!;
      const qi = q[i]!;
      if (pi === 0) {
        if (qi < 0) return false;
      } else {
        const t = qi / pi;
        if (pi < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
        if (t0 > t1) return false;
      }
    }
    const mx = prim.a.x + dx * ((t0 + t1) / 2);
    const my = prim.a.y + dy * ((t0 + t1) / 2);
    return mx > box.x && mx < box.x + box.w && my > box.y && my < box.y + box.h;
  }
  const bb = primBBox(prim);
  return bb !== null && rectsOverlap(bb, box);
}

/** What {@link northArrowBox} reads. */
export interface NorthPlacementInput {
  bounds: Bounds;
  refDim: number;
  /** The symmetric page margin (`sizes.margin`), which the historical spot is measured from. */
  baseMargin: number;
  /** Everything drawn so far: the dimension and axis bands, and every other node the arrow must keep off. */
  nodes: readonly SceneNode[];
  /** The page bearing the arrow points along, in degrees clockwise from the page top. */
  deg: number;
  /** The label at its pointing end. */
  word: string;
  /** The page rectangle, in plan mm, as laid out so far. */
  page: { x: number; y: number; w: number; h: number };
  /** The page margins laid out so far. */
  margin: PageMargins;
  /** On a sheet: the page is the paper, so no margin may grow (`describe().sheet` reserves the paper, not this). */
  sheet: boolean;
  /** The bottom chrome, already placed, which the arrow must also keep off. */
  chrome: Pick<ChromeLayout, "scaleBar" | "titleBlock">;
}

/**
 * Where the north arrow goes (card AL1). It used to stand at {@link historicalNorth} whatever was
 * there, and on a plan dimensioned on its top facade that is over the top chains' figures.
 *
 * The rules, in order; the first that gives a clear spot wins:
 *
 * 1. the historical spot, when its ink is clear of every `dims` and `axes` node, so a plan whose
 *    arrow was never in the way keeps its bytes;
 * 2. the page's top-right corner square, right of the right-hand band and above the top band
 *    ({@link dimReach}). Chains end at the building's corners, so nothing of them is there;
 * 3. the top of the strip right of the right-hand band (a page whose top margin is too shallow
 *    for the arrow but whose right margin is wide enough);
 * 4. the right end of the strip above the top band (the converse);
 * 5. only if none of those has room: off a sheet, the top and right margins grow just enough for
 *    the corner square to hold it; on a sheet, whose page is the paper and must not grow, the
 *    historical spot.
 *
 * Spots 2 to 4 must also be clear of every other node already drawn and of the scale bar and
 * title block, and lie inside the page. The arrow keeps `gap` ({@link GAP_F}, the gap the bottom
 * chrome keeps from the bottom band) from the band it sits beside and from the page edge, or half
 * the room there is when that is less.
 */
export function northArrowBox(input: NorthPlacementInput): { north: NorthArrowBox; margin: PageMargins } {
  const { bounds: b, refDim, nodes, deg, word, page, margin } = input;
  const h = historicalNorth(b, input.baseMargin, refDim);
  const { r, fs } = h;
  const at = (cx: number, cy: number, spot: NorthSpot): NorthArrowBox => ({
    cx,
    cy,
    r,
    fs,
    box: northArrowInk(cx, cy, r, fs, deg, word),
    spot,
  });
  const historical = at(h.cx, h.cy, "historical");
  const clearOf = (box: BBox, layers: readonly SceneNode["layer"][] | null): boolean => {
    for (const n of nodes) {
      if (layers && !layers.includes(n.layer)) continue;
      if (primInkInside(n.prim, box)) return false;
    }
    return true;
  };
  if (clearOf(historical.box, REACH_LAYERS)) return { north: historical, margin };

  // The ink's offset from the centre, so a box can be placed and its centre read back.
  const rel = northArrowInk(0, 0, r, fs, deg, word);
  const reach = dimReach(b, nodes);
  const gap = refDim * GAP_F;
  const left = b.maxX + reach.right;
  const above = b.minY - reach.top;
  const pageR = page.x + page.w;
  const pageB = page.y + page.h;
  const sx = pageR - left - rel.w;
  const sy = above - page.y - rel.h;
  const chromeBoxes: BBox[] = [];
  const s = input.chrome.scaleBar;
  if (!s.hidden) {
    const labelW = textWidth(scaleBarLabel(s), s.fs);
    chromeBoxes.push({ x: s.x0 - s.fs, y: s.y0, w: s.barLen + labelW + 2 * s.fs, h: s.hgt + s.fs * SCALEBAR_LABEL_F });
  }
  const t = input.chrome.titleBlock;
  if (t) chromeBoxes.push({ x: t.x0, y: t.y0, w: t.w, h: t.h });
  const tryBox = (x: number, y: number, spot: NorthSpot): NorthArrowBox | null => {
    if (x < page.x || y < page.y || x + rel.w > pageR || y + rel.h > pageB) return null;
    const placed = at(x - rel.x, y - rel.y, spot);
    if (!clearOf(placed.box, null)) return null;
    for (const c of chromeBoxes) if (rectsOverlap(c, placed.box)) return null;
    return placed;
  };
  const candidates: Array<() => NorthArrowBox | null> = [
    () =>
      sx >= 0 && sy >= 0 ? tryBox(left + Math.min(gap, sx / 2), above - Math.min(gap, sy / 2) - rel.h, "corner") : null,
    () => (sx >= 0 ? tryBox(left + Math.min(gap, sx / 2), page.y + Math.min(gap, sx / 2), "right") : null),
    () =>
      sy >= 0 ? tryBox(pageR - Math.min(gap, sy / 2) - rel.w, above - Math.min(gap, sy / 2) - rel.h, "top") : null,
  ];
  for (const candidate of candidates) {
    const placed = candidate();
    if (placed) return { north: placed, margin };
  }

  if (input.sheet) return { north: { ...historical, spot: "blocked" }, margin };
  const grown: PageMargins = {
    ...margin,
    top: Math.max(margin.top, reach.top + rel.h),
    right: Math.max(margin.right, reach.right + rel.w),
  };
  return { north: at(left - rel.x, above - rel.h - rel.y, "grown"), margin: grown };
}

/** A point on the bottom band, kept here so backends share the witness geometry. */
export type { Point };
