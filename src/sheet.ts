/**
 * **Paper size + operative drawing scale** — the sheet layer.
 *
 * Without a `paper` setting every drawn size is a fraction of the drawing's own
 * reference dimension (`refDim = max(drawW, drawH)`, see `scene-build.ts`). That is
 * self-similar and looks right at one building size, but it is not drafting: a 100 m
 * museum gets 3 m room labels, 280 mm wall strokes and 17 m page margins, because the
 * annotations grow with the building instead of staying fixed on the sheet.
 *
 * `paper A1 landscape` + `scale 1:200` flips that around, the way a drawing board
 * does: **every annotation size is a constant number of millimetres ON THE SHEET**,
 * multiplied by the scale denominator to land in plan millimetres. A 3.5 mm room label
 * is 3.5 mm of ink whether the building is 7 m or 100 m across; only how much building
 * fits on the sheet changes.
 *
 * This module owns that arithmetic, and nothing else:
 *
 * - {@link PAPER_SIZES} — the ISO 216 table (portrait mm), in ONE place.
 * - {@link SHEET_MM} — the paper-millimetre constant table (GB/T-style drafting
 *   practice): label heights, the heavy/thin pen pair, hatch pitch, page margin.
 * - {@link sizesFromPaper} — the second `RenderSizes` constructor. It produces the
 *   *same struct* the refDim path produces, so every downstream renderer is agnostic
 *   to which constructor ran.
 * - {@link fitsOnSheet} / {@link chooseScaleDenominator} — the closed-form fit test and
 *   the 4-candidate auto-fit, both pure functions of the building's outer-face extent.
 *
 * **The compatibility contract:** a plan with no `paper` never reaches this module.
 * The refDim formulas run unchanged and output is byte-identical (`scale` alone stays
 * annotation-only, exactly as before). `paper` is the opt-in that makes `scale`
 * operative.
 */

import { chromeBandDepth } from "./chrome-layout.js";
import type { RenderSizes } from "./scene.js";

/** The paper sizes ArchLang can draw on. */
export const PAPER_SIZES = ["A4", "A3", "A2", "A1", "A0"] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

/** Sheet orientation. Floor plans are wide, so `landscape` is the default. */
export const PAPER_ORIENTATIONS = ["landscape", "portrait"] as const;
export type PaperOrientation = (typeof PAPER_ORIENTATIONS)[number];

/** ISO 216 trimmed sizes in millimetres, PORTRAIT (short × long). One table, once. */
export const PAPER_MM: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  A2: { w: 420, h: 594 },
  A1: { w: 594, h: 841 },
  A0: { w: 841, h: 1189 },
};

/** The sheet dimensions in millimetres with the orientation applied. */
export function paperMm(size: PaperSize, orientation: PaperOrientation): { w: number; h: number } {
  const p = PAPER_MM[size];
  return orientation === "landscape" ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

/**
 * Drafting constants in **millimetres on the sheet** (GB/T 50001 / ISO 128 practice).
 * Multiplied by the scale denominator to reach plan millimetres. Tuned so a small
 * dwelling on `paper A4` + `scale 1:50` reads close to the historical refDim look
 * (a 7 m studio's 3.5 mm label lands at 175 plan mm where refDim gave 210), while a
 * 100 m building on `paper A1` + `scale 1:200` gets the SAME 3.5 mm of ink instead of
 * a 3 m label.
 */
export const SHEET_MM = {
  /** Room name text height. */
  roomLabel: 3.5,
  /** Room area text height (the smaller second line). */
  areaText: 2.5,
  /** Dimension text height. */
  dimText: 2.5,
  /** Furniture / fixture label text height. */
  furnLabel: 2,
  /** The heavy pen: cut wall outlines (`lineWeight: "heavy"`). */
  heavy: 0.5,
  /** The thin pen: dimensions, witness lines, glazing, chrome rules. */
  thin: 0.18,
  /** Poché hatch pitch. */
  hatchGap: 1.2,
  /** Page margin on every side (before the annotation bands grow it). */
  margin: 15,
  /**
   * The annotation REFERENCE length: how much sheet the historical `refDim * <fraction>`
   * chrome formulas are read against in paper mode. `refDim = 100 mm × denominator`
   * turns every one of those tuned fractions into a plain drafting millimetre — the
   * scale bar's `refDim * 0.014` bar height becomes 1.4 mm, the north arrow's
   * `refDim * 0.045` radius 4.5 mm, the dimension tick's `refDim * 0.012` 1.2 mm — so
   * the chrome and the tick marks are paper-sized for free, with no second code path.
   */
  ref: 100,
} as const;

/**
 * Dimension-chain slot geometry, in multiples of the dimension font: the openings
 * chain sits at `CHAIN_BASE`, each further chain `CHAIN_STEP` beyond it. Fixed per
 * chain (not packed), so omitting a chain leaves its slot empty instead of reflowing
 * the others. Lives here rather than in `scene-build.ts` because the sheet fit test
 * must reserve exactly the band those chains occupy — one source, no retyping.
 */
export const CHAIN_BASE = 1.2;
export const CHAIN_STEP = 2.2;
/** Chains a `dims auto all` facade can carry (openings · axis · overall). */
export const CHAIN_SLOTS = 3;
/**
 * How far the outermost dimension chain reaches past a facade, in dimension-font
 * multiples: the last chain's offset, plus the text's own offset off that line
 * (`dimFont * 0.7`, see `elements/dim.ts`), plus the half-box `dimReach` inflates a
 * text anchor by (`dimFont * 1`).
 */
export const DIM_BAND_FONTS = CHAIN_BASE + (CHAIN_SLOTS - 1) * CHAIN_STEP + 0.7 + 1;

/** The dimension band reserved on each dimensioned side, in sheet mm. */
export const DIM_BAND_MM = DIM_BAND_FONTS * SHEET_MM.dimText;

/** The scale denominators auto-fit may choose from, finest first. */
export const AUTO_SCALE_DENOMINATORS = [50, 100, 200, 500] as const;

/** A `paper A1 [landscape|portrait]` declaration, as authored. */
export interface PaperSpec {
  size: PaperSize;
  orientation: PaperOrientation;
}

/**
 * The resolved sheet: the declared paper plus the **operative** scale denominator
 * (authored, or chosen by auto-fit) and whether the building actually fits at it.
 * Computed once in `resolve()` — see {@link resolveSheetSpec} — so `describe()`,
 * `toScene()` and the diagnostics all read one answer.
 */
export interface ResolvedSheet extends PaperSpec {
  /** Sheet width/height in mm, orientation applied. */
  widthMm: number;
  heightMm: number;
  /** The operative scale denominator (`1:<denom>`). */
  denom: number;
  /** True when the denominator came from auto-fit rather than a `scale` statement. */
  auto: boolean;
  /** Does the building's outer-face extent fit the sheet at this denominator? */
  fits: boolean;
}

/** What the fit test needs to know about a plan besides its size. */
export interface SheetFitInput {
  /** The building's extent on its OUTER wall faces, in plan mm. */
  extent: { w: number; h: number };
  /** Is `dims auto …` on? (Each dimensioned side then reserves a chain band.) */
  autoDims: boolean;
  /** How many rows the title block will carry (0 = none drawn). */
  titleRows: number;
}

/**
 * The drawable area of the sheet in **plan millimetres** at `denom`: the paper minus
 * the page margins, minus a dimension band on each side when `dims auto` is on, minus
 * the bottom chrome band (scale bar / title block).
 *
 * This is the ONE fit rule. It is a closed-form function of the IR (no rendered
 * geometry), so `resolve()` can decide the scale, raise `W_SCALE_OVERFLOW` and stamp
 * `describe().sheet.fits` without building a Scene — and `toScene()` never re-derives
 * a second, subtly different answer.
 */
export function usablePlanMm(
  widthMm: number,
  heightMm: number,
  denom: number,
  input: Pick<SheetFitInput, "autoDims" | "titleRows">,
): { w: number; h: number } {
  const band = input.autoDims ? DIM_BAND_MM : 0;
  const side = SHEET_MM.margin + band;
  const chrome = chromeBandDepth(SHEET_MM.ref, input.titleRows);
  return {
    w: Math.max(0, (widthMm - 2 * side) * denom),
    h: Math.max(0, (heightMm - 2 * side - chrome) * denom),
  };
}

/** Does the building fit the sheet at this denominator? (See {@link usablePlanMm}.) */
export function fitsOnSheet(widthMm: number, heightMm: number, denom: number, input: SheetFitInput): boolean {
  const u = usablePlanMm(widthMm, heightMm, denom, input);
  return input.extent.w <= u.w && input.extent.h <= u.h;
}

/**
 * Auto-fit: the **finest** scale that still fits, from the fixed candidate list
 * {@link AUTO_SCALE_DENOMINATORS} (a smaller denominator draws the building bigger).
 * Closed form — four fit tests, no search. When even the coarsest candidate overflows
 * it returns that coarsest one with `fits: false`, so the drawing is still produced
 * (and `W_SCALE_OVERFLOW` explains why it is tight).
 */
export function chooseScaleDenominator(
  widthMm: number,
  heightMm: number,
  input: SheetFitInput,
): { denom: number; fits: boolean } {
  for (const denom of AUTO_SCALE_DENOMINATORS) {
    if (fitsOnSheet(widthMm, heightMm, denom, input)) return { denom, fits: true };
  }
  return { denom: AUTO_SCALE_DENOMINATORS[AUTO_SCALE_DENOMINATORS.length - 1]!, fits: false };
}

/** Parse `"1:50"` → 50. Returns null for anything that is not `<n>:<n>` with n > 0. */
export function scaleDenominator(scale: string | undefined): number | null {
  if (scale === undefined) return null;
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(scale);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!(a > 0) || !(b > 0)) return null;
  return b / a;
}

/**
 * Resolve a declared `paper` (+ optional `scale`) against a plan's extent: pick the
 * operative denominator and record whether it fits.
 *
 * An authored `scale` is **never overridden** — a drawing is issued at the scale the
 * author put in the title block. If it does not fit, the caller raises the advisory
 * `W_SCALE_OVERFLOW` and the page grows to contain the drawing.
 */
export function resolveSheetSpec(paper: PaperSpec, scale: string | undefined, input: SheetFitInput): ResolvedSheet {
  const { w: widthMm, h: heightMm } = paperMm(paper.size, paper.orientation);
  const declared = scaleDenominator(scale);
  const { denom, fits } =
    declared !== null
      ? { denom: declared, fits: fitsOnSheet(widthMm, heightMm, declared, input) }
      : chooseScaleDenominator(widthMm, heightMm, input);
  return { ...paper, widthMm, heightMm, denom, auto: declared === null, fits };
}

/**
 * The second {@link RenderSizes} constructor: every size a fixed number of sheet
 * millimetres × the scale denominator. Same struct as the refDim path, so nothing
 * downstream branches on which one ran.
 *
 * `lineWeight` is the theme's pen multiplier, applied to the strokes only (exactly as
 * the refDim path applies it), so `theme { lineWeight: … }` keeps working.
 */
export function sizesFromPaper(sheet: ResolvedSheet, lineWeight: number): RenderSizes {
  const d = sheet.denom;
  return {
    refDim: SHEET_MM.ref * d,
    wallStroke: SHEET_MM.heavy * d * lineWeight,
    thin: SHEET_MM.thin * d * lineWeight,
    roomFont: SHEET_MM.roomLabel * d,
    areaFont: SHEET_MM.areaText * d,
    dimFont: SHEET_MM.dimText * d,
    furnFont: SHEET_MM.furnLabel * d,
    margin: SHEET_MM.margin * d,
    hatchGap: SHEET_MM.hatchGap * d,
  };
}
